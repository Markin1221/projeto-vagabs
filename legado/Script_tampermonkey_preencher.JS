// ==UserScript==
// @name         OFX Assistente (Coopernorte)
// @namespace    coopernorte.ofx
// @version      2.4
// @description  Percorre itens PENDENTES do Importar OFX, preenche por regras (inclui Titulo com {NOME}) e pergunta antes de liquidar
// @match        https://coopernorte.con-nectar.com/financeiro/admin/importar_arquivo_ofx*
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @run-at       document-idle
// ==/UserScript==

(function () {
  "use strict";

  /* ---------- utilidades ---------- */
  const norm = (s) =>
    (s || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function waitFor(fn, timeout = 8000, step = 150) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try {
        const v = fn();
        if (v) return v;
      } catch (e) {}
      await sleep(step);
    }
    return null;
  }
  const load = (k, d) => {
    try {
      const v = GM_getValue(k);
      return v === undefined ? d : JSON.parse(v);
    } catch (e) {
      return d;
    }
  };
  const save = (k, v) => GM_setValue(k, JSON.stringify(v));
  const getState = () =>
    load("state", {
      active: false,
      auto: false,
      onlyRules: false,
      onlyEx: false,
      onlyConcilia: false,
      skipped: [],
      done: [],
      current: null,
      awaiting: null,
      entry: null,
    });
  const setState = (patch) => {
    const s = Object.assign(getState(), patch);
    save("state", s);
    return s;
  };
  const getRules = () => load("rules", []);
  const getExRules = () => load("exrules", []); // regras de EXCLUSAO (clica no botao vermelho)
  const LIST_URL = location.origin + "/financeiro/admin/importar_arquivo_ofx";

  // Volta no historico (como a seta do navegador) ate a lista, mantendo filtros/pagina.
  // Se nao der, abre a lista pela URL.
  function goBack() {
    const s = getState();
    // Conciliação: o histórico fica bagunçado após conciliar, então vai direto pra lista
    if (s.onlyConcilia) {
      location.href = LIST_URL;
      return;
    }
    const e = s.entry;
    if (e && e.len && history.length < 50 && history.length >= e.len) {
      history.go(-(history.length - e.len + 1));
      setTimeout(() => {
        location.href = LIST_URL;
      }, 3000); // so dispara se a volta falhar
    } else {
      location.href = LIST_URL;
    }
  }
  const markDone = (id) => {
    const s = getState();
    if (id && !(s.done || []).includes(id))
      setState({ done: (s.done || []).concat(id) });
  };

  function normNat(n) {
    const t = norm(n);
    return t.includes("CREDIT")
      ? "CREDITO"
      : t.includes("DEBIT")
        ? "DEBITO"
        : "";
  }
  // text = descricao/memo; nat = natureza do item (DEBITO/CREDITO). Regra sem "nat" vale para ambos.
  function matchIn(list, text, nat) {
    const t = norm(text),
      n = normNat(nat);
    let best = null,
      bestLen = 0,
      bestSpec = false;
    for (const r of list) {
      const rn = normNat(r.nat);
      if (rn && rn !== n) continue; // regra de um tipo so; natureza diferente ou desconhecida -> ignora
      for (const kw of String(r.kw).split("|").map(norm).filter(Boolean)) {
        if (!t.includes(kw)) continue;
        if (kw.length > bestLen || (kw.length === bestLen && rn && !bestSpec)) {
          best = r;
          bestLen = kw.length;
          bestSpec = !!rn;
        }
      }
    }
    return best ? { rule: best, len: bestLen } : null;
  }
  // Acha a regra (normal ou de exclusao). Palavra-chave mais longa ganha; empate -> regra normal.
  function matchAny(text, nat) {
    const a = matchIn(getRules(), text, nat),
      b = matchIn(getExRules(), text, nat);
    if (a && b)
      return b.len > a.len
        ? { ex: true, rule: b.rule }
        : { ex: false, rule: a.rule };
    if (b) return { ex: true, rule: b.rule };
    if (a) return { ex: false, rule: a.rule };
    return null;
  }

  // Nome do favorecido: texto depois do ultimo " - " da descricao
  function extractNome(descr) {
    return (descr || "")
      .split(" - ")
      .pop()
      .replace(/\s+/g, " ")
      .trim()
      .toUpperCase();
  }
  // Monta o titulo a partir do modelo da regra. {NOME} = nome tirado da descricao
  function buildTitulo(tpl, descr) {
    if (!tpl) return "";
    return tpl.replace(/\{NOME\}/gi, extractNome(descr)).trim();
  }

  /* ---------- painel ---------- */
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    Object.assign(el, props || {});
    if (props && props.style && typeof props.style === "object") {
      el.removeAttribute("style");
      Object.assign(el.style, props.style);
    }
    kids
      .flat()
      .forEach((k) =>
        el.append(k && k.nodeType ? k : document.createTextNode(k ?? "")),
      );
    return el;
  }
  let panelEl;
  function panel(title, body, buttons) {
    if (panelEl) panelEl.remove();
    panelEl = h("div", { id: "ofx-assist" });
    Object.assign(panelEl.style, {
      position: "fixed",
      right: "16px",
      bottom: "16px",
      zIndex: 2147483647,
      width: "380px",
      background: "#fff",
      border: "2px solid #00595c",
      borderRadius: "10px",
      padding: "14px",
      boxShadow: "0 8px 30px rgba(0,0,0,.35)",
      font: "14px/1.4 Poppins, Arial, sans-serif",
      color: "#222",
    });
    panelEl.append(
      h(
        "div",
        { style: { fontWeight: "700", color: "#00595c", marginBottom: "6px" } },
        title,
      ),
    );
    const b = h("div", {
      style: { marginBottom: "10px", wordBreak: "break-word" },
    });
    []
      .concat(body)
      .forEach((x) =>
        b.append(x && x.nodeType ? x : document.createTextNode(x ?? "")),
      );
    panelEl.append(b);
    const row = h("div", {
      style: { display: "flex", gap: "6px", flexWrap: "wrap" },
    });
    buttons.forEach(([label, fn, color]) => {
      const btn = h("button", { type: "button", textContent: label });
      Object.assign(btn.style, {
        background: color || "#00595c",
        color: "#fff",
        border: 0,
        borderRadius: "6px",
        padding: "7px 11px",
        cursor: "pointer",
        font: "inherit",
      });
      btn.onclick = fn;
      row.append(btn);
    });
    panelEl.append(row);
    document.body.append(panelEl);
    return panelEl;
  }
  const GREEN = "#0bb783",
    RED = "#c9184a",
    GRAY = "#6c757d";
  const line = (k, v) => h("div", {}, h("b", {}, k + ": "), v);
  function textInput(value) {
    const i = h("input", { type: "text", value: value || "" });
    Object.assign(i.style, {
      width: "100%",
      border: "1px solid #aaa",
      borderRadius: "4px",
      padding: "4px",
      marginBottom: "6px",
    });
    return i;
  }

  /* ---------- editor de regras ---------- */
  function openEditor(key, title, hint) {
    const ta = h("textarea", { value: JSON.stringify(load(key, []), null, 2) });
    Object.assign(ta.style, {
      width: "100%",
      height: "220px",
      font: "12px monospace",
    });
    panel(
      title,
      [hint, ta],
      [
        [
          "Salvar",
          () => {
            try {
              const v = JSON.parse(ta.value);
              if (!Array.isArray(v)) throw 0;
              save(key, v);
              init();
            } catch (e) {
              alert("JSON invalido");
            }
          },
          GREEN,
        ],
        ["Fechar", () => init(), GRAY],
      ],
    );
  }
  const openRules = () =>
    openEditor(
      "rules",
      "Regras (JSON)",
      'Formato: {"kw":"REDIESEL|CPX","campos":{"CENTRO DE CUSTO":"...","FONTE DE RECURSO":"..."},"nat":"DEBITO","titulo":"PGTO. AO FORNECEDOR DO PERMISSIONARIO - {NOME}"}. Use | para varias palavras-chave. "nat" (DEBITO ou CREDITO) e opcional: sem ele a regra vale para os dois. {NOME} = nome tirado da descricao. "titulo" e opcional.',
    );
  const openEx = () =>
    openEditor(
      "exrules",
      "Exclusões (JSON)",
      'Itens que batem aqui sao EXCLUIDOS (botao vermelho). Formato: {"kw":"PALAVRA1|PALAVRA2","nat":"DEBITO"}. "nat" e opcional.',
    );

  /* ---------- FILTROS DA LISTA ---------- */
  // Ao iniciar a fila, guarda os filtros preenchidos na tela. Sempre que a lista for
  // reaberta (ela volta com tudo zerado), os filtros sao colocados de novo.
  let filtersApplied = false;
  const getFilters = () => load("filters", []);

  function isFilterCtl(el) {
    if (
      el.disabled ||
      el.closest(
        "#ofx-assist, table, .dataTables_filter, .dataTables_length, .select2-container, .daterangepicker, .modal, .swal2-container",
      )
    )
      return false;
    return ![
      "hidden",
      "button",
      "submit",
      "reset",
      "file",
      "password",
      "image",
    ].includes((el.type || "").toLowerCase());
  }
  function filterLabel(el) {
    const l =
      (el.id &&
        document.querySelector('label[for="' + CSS.escape(el.id) + '"]')) ||
      (el.closest("div") && el.closest("div").querySelector("label"));
    return ((l && l.textContent) || el.placeholder || el.name || el.id || "?")
      .replace(/\s+/g, " ")
      .replace(/\*/g, "")
      .trim();
  }
  // Le os filtros que estao preenchidos agora (sem salvar)
  function readFilters() {
    const out = [];
    document.querySelectorAll("input, select, textarea").forEach((el) => {
      if (!isFilterCtl(el) || (!el.id && !el.name)) return;
      const t = (el.type || "").toLowerCase();
      let v, text, active, kind;
      if (t === "checkbox" || t === "radio") {
        kind = t;
        v = el.checked;
        active = v;
        text = "marcado";
      } else if (el.multiple) {
        kind = "multiple";
        v = [...el.selectedOptions].map((o) => o.value).filter(Boolean);
        active = v.length > 0;
        text = [...el.selectedOptions].map(optText).join(", ");
      } else {
        kind = "value";
        v = el.value;
        active = String(v).trim() !== "";
        text = el.tagName === "SELECT" ? curText(el) : String(v).trim();
      }
      if (active)
        out.push({
          id: el.id || "",
          name: el.name || "",
          type: kind,
          value: el.value,
          v,
          label: filterLabel(el),
          text,
        });
    });
    return out;
  }
  function captureFilters() {
    const f = readFilters();
    save("filters", f);
    return f;
  }

  function findCtl(x) {
    if (x.id) return document.getElementById(x.id);
    if (!x.name) return null;
    const val =
      x.type === "radio" || x.type === "checkbox"
        ? '[value="' + CSS.escape(x.value) + '"]'
        : "";
    return (
      [
        ...document.querySelectorAll(
          '[name="' + CSS.escape(x.name) + '"]' + val,
        ),
      ].find(isFilterCtl) || null
    );
  }
  function findFilterBtn(ctl) {
    const re = /^(FILTRAR|BUSCAR|PESQUISAR|APLICAR|CONSULTAR|PROCURAR)/;
    const q = "button, input[type=submit], input[type=button], a.btn";
    const ok = (b) =>
      b.getClientRects().length &&
      !b.closest("#ofx-assist, .dataTables_paginate, .modal");
    const txt = (b) => norm(b.textContent || b.value || b.title);
    const scope = (ctl && ctl.closest("form")) || document;
    return (
      [...scope.querySelectorAll(q)].filter(ok).find((b) => re.test(txt(b))) ||
      [...document.querySelectorAll(q)]
        .filter(ok)
        .find((b) => re.test(txt(b))) ||
      (ctl && ctl.form && ctl.form.querySelector("[type=submit]"))
    );
  }
  // Poe os filtros salvos de volta na tela e clica no botao de filtrar
  async function restoreFilters() {
    const f = getFilters();
    if (!f.length) return;
    // trava anti-loop: so reaplica uma vez por "progresso" (se a pagina recarregar sem manter os filtros)
    const s = getState(),
      key = (s.done || []).length + "/" + (s.skipped || []).length;
    if (load("filtKey", "") === key) return;
    let changed = false,
      ctl = null;
    for (const x of f) {
      const el = findCtl(x);
      if (!el) continue;
      ctl = ctl || el;
      if (x.type === "checkbox" || x.type === "radio") {
        if (!el.checked) {
          el.checked = true;
          fire(el);
          changed = true;
        }
      } else if (x.type === "multiple") {
        const cur = [...el.selectedOptions]
          .map((o) => o.value)
          .filter(Boolean)
          .join("|");
        if (cur !== x.v.join("|")) {
          await waitFor(
            () => x.v.every((v) => [...el.options].some((o) => o.value === v)),
            5000,
          );
          [...el.options].forEach((o) => {
            o.selected = x.v.includes(o.value);
          });
          fire(el);
          changed = true;
        }
      } else if (el.value !== x.value) {
        if (el.tagName === "SELECT")
          await waitFor(
            () => [...el.options].some((o) => o.value === x.value),
            5000,
          );
        el.value = x.value;
        if (el.value === x.value) {
          fire(el);
          changed = true;
        }
      }
    }
    if (!changed) return;
    save("filtKey", key);
    const btn = findFilterBtn(ctl);
    if (btn) {
      const sig = () =>
        readRows()
          .map((r) => r.id)
          .join(",");
      const before = sig();
      btn.click();
      await waitFor(() => sig() !== before, 5000);
    }
    await sleep(800);
  }
  // Inicia a fila: guarda os filtros atuais e comeca
  function startQueue(patch) {
    // guarda a tela de onde veio (home) para voltar no fim da conciliacao
    const ref = document.referrer;
    save(
      "home",
      ref &&
        ref.startsWith(location.origin) &&
        !/importar_arquivo_ofx/.test(ref)
        ? ref
        : "",
    );
    captureFilters();
    filtersApplied = true; // ja estao na tela, nao precisa reaplicar agora
    save("filtKey", "");
    setState(
      Object.assign(
        {
          active: true,
          auto: false,
          onlyRules: false,
          onlyEx: false,
          onlyConcilia: false,
          skipped: [],
          done: [],
        },
        patch,
      ),
    );
    listPage();
  }

  /* ---------- LISTA ---------- */
  function readRows() {
    return [...document.querySelectorAll("#tabela-ImportarArquivoOfx tbody tr")]
      .map((tr) => {
        const td = tr.querySelectorAll("td");
        if (td.length < 11) return null;
        return {
          id: td[0].textContent.trim(),
          data: td[2].textContent.trim(),
          nat: td[3].textContent.trim(),
          valor: td[4].textContent.trim(),
          memo: td[5].textContent
            .replace(/\s+/g, " ")
            .replace(/^-\s*/, "")
            .trim(),
          status: td[7].textContent.trim(),
          btn: td[10].querySelector("button, a"),
        };
      })
      .filter(Boolean);
  }

  async function findNext() {
    const st = getState();
    for (let page = 0; page < 200; page++) {
      await waitFor(() => readRows().length, 8000);
      const row = readRows().find(
        (r) =>
          /PENDENTE/i.test(r.status) &&
          !st.skipped.includes(r.id) &&
          !(st.done || []).includes(r.id) &&
          (!st.onlyRules ||
            (() => {
              const m = matchAny(r.memo, r.nat);
              return m && (!st.onlyEx || m.ex);
            })()),
      );
      if (row) return row;
      const next = document.querySelector("#tabela-ImportarArquivoOfx_next");
      if (!next || next.classList.contains("disabled")) return null;
      const firstId = (readRows()[0] || {}).id;
      next.querySelector("a, button").click();
      await waitFor(() => (readRows()[0] || {}).id !== firstId, 5000);
    }
    return null;
  }

  async function listPage() {
    const s0 = getState();
    if (s0.awaiting) markDone(s0.awaiting); // acabou de criar e caiu na lista
    setState({ awaiting: null });
    const st = getState();
    if (!st.active) {
      const fl = readFilters();
      panel(
        "OFX Assistente",
        [
          "Pronto. Inicia a fila de itens PENDENTES.",
          h(
            "div",
            { style: { marginTop: "6px", fontSize: "12px", color: "#555" } },
            fl.length
              ? "Filtros detectados (serão reaplicados sempre que voltar à lista): " +
                  fl.map((x) => x.label + " = " + x.text).join("; ")
              : "Nenhum filtro detectado agora.",
          ),
        ],
        [
          ["▶ Iniciar fila", () => startQueue({}), GREEN],
          ["⚡ Fila automática", () => startQueue({ auto: true }), "#f59f00"],
          [
            "🎯 Só com regra",
            () => startQueue({ auto: true, onlyRules: true }),
            "#1e88e5",
          ],
          [
            "🔗 Só conciliar",
            () => startQueue({ auto: true, onlyConcilia: true }),
            "#7e57c2",
          ],
          [
            "🗑 Só exclusões",
            () => startQueue({ auto: true, onlyRules: true, onlyEx: true }),
            RED,
          ],
          ["🔄 Ler filtros", () => init(), GRAY],
          ["Regras (" + getRules().length + ")", openRules, GRAY],
          ["Exclusões (" + getExRules().length + ")", openEx, GRAY],
        ],
      );
      return;
    }
    if (!filtersApplied) {
      filtersApplied = true; // uma vez por carregamento da pagina
      if (getFilters().length) {
        panel("OFX Assistente", "Reaplicando os filtros...", [
          ["■ Parar", stop, RED],
        ]);
        await restoreFilters();
        if (!getState().active) return;
      }
    }
    panel("OFX Assistente", "Procurando proximo pendente...", [
      ["■ Parar", stop, RED],
    ]);
    const row = await findNext();
    if (!row) {
      setState({ active: false });
      const n = (st.skipped || []).length;
      if (st.onlyConcilia) {
        // fim da conciliacao: fecha o modal e volta para a tela anterior (home)
        panel(
          "OFX Assistente",
          "Fila de conciliação acabou (" +
            n +
            " pulado(s)). Fechando e voltando...",
          [],
        );
        await waitFor(closeModals, 4000, 200);
        await sleep(800);
        const home = load("home", "");
        if (home) location.href = home;
        else history.back();
        return;
      }
      panel(
        "OFX Assistente",
        st.onlyEx
          ? "Fila acabou: todas as exclusões foram feitas. Ficaram " +
              n +
              " pulado(s) (com problema)."
          : st.onlyRules
            ? "Fila acabou: todos os itens com regra foram feitos. Ficaram " +
              n +
              " pulado(s) (sem regra ou com problema)."
            : "Fila acabou: nenhum pendente (fora os pulados).",
        [["Ok", () => init(), GRAY]],
      );
      return;
    }
    if (st.onlyConcilia) {
      panel(
        "🔗 Conciliação — item #" + row.id,
        [
          line("Valor", row.valor),
          line("Data", row.data),
          line("Memo", row.memo),
        ],
        [["■ Parar", stop, RED]],
      );
      await sleep(900);
      if (!getState().active) return;
      setState({ current: row.id, curNat: row.nat });
      row.btn.click();
      return;
    }
    const m = matchAny(row.memo, row.nat);
    const rule = m && m.rule;
    const rdesc = m
      ? m.ex
        ? "🗑 EXCLUIR (" + rule.kw + ")"
        : rule.kw + " → " + ruleSummary(rule)
      : null;
    if (st.auto && m) {
      // automatico: tem regra -> vai direto, sem perguntar
      panel(
        "⚡ Automático — item #" + row.id,
        [
          line("Valor", row.valor),
          line("Memo", row.memo),
          line("Regra", rdesc),
        ],
        [["■ Parar", stop, RED]],
      );
      await sleep(1200);
      if (!getState().active) return;
      setState({ current: row.id, curNat: row.nat });
      row.btn.click();
      return;
    }
    panel(
      "Proximo item #" + row.id,
      [
        line("Valor", row.valor),
        line("Natureza", row.nat),
        line("Data", row.data),
        line("Memo", row.memo),
        line("Regra", rdesc || "nenhuma (vou perguntar)"),
      ],
      [
        [
          "✅ Fazer este",
          () => {
            setState({ current: row.id, curNat: row.nat });
            row.btn.click();
          },
          GREEN,
        ],
        [
          "⏭ Pular",
          () => {
            const s = getState();
            s.skipped.push(row.id);
            save("state", s);
            listPage();
          },
          GRAY,
        ],
        ["■ Parar", stop, RED],
      ],
    );
  }
  function stop() {
    setState({
      active: false,
      auto: false,
      onlyRules: false,
      onlyEx: false,
      onlyConcilia: false,
      awaiting: null,
    });
    init();
  }

  /* ---------- DETALHES ---------- */
  function findCreateBtn() {
    const all = [
      ...document.querySelectorAll("button, input[type=submit], a.btn"),
    ];
    const t = (b) => norm(b.textContent || b.value);
    return (
      all.find((b) => t(b).includes("CRIAR LANCAMENTO E LIQUIDAR")) ||
      all.find((b) => /CRIAR LANCAMENTO E /.test(t(b)))
    );
  }
  function findContainer(btn) {
    let c = btn.parentElement;
    while (c && c.querySelectorAll("select").length < 3) c = c.parentElement;
    return c;
  }
  function fieldSelect(c, label) {
    for (const l of c.querySelectorAll("label")) {
      if (norm(l.textContent).startsWith(norm(label))) {
        const s =
          (l.htmlFor && c.querySelector("#" + CSS.escape(l.htmlFor))) ||
          l.parentElement.querySelector("select");
        if (s && s.tagName === "SELECT") return s;
      }
    }
    return null;
  }
  // Campo generico (input, textarea ou select) pelo rotulo
  function fieldAny(c, label) {
    for (const l of c.querySelectorAll("label")) {
      if (norm(l.textContent).startsWith(norm(label))) {
        const f =
          (l.htmlFor && c.querySelector("#" + CSS.escape(l.htmlFor))) ||
          l.parentElement.querySelector("input, textarea, select");
        if (f) return f;
      }
    }
    return null;
  }
  const optText = (o) => o.textContent.replace(/\s+/g, " ").trim();
  function findOpt(sel, text) {
    const t = norm(text);
    const opts = [...sel.options].filter((o) => o.value !== "");
    return (
      opts.find((o) => norm(optText(o)) === t) ||
      opts.find((o) => norm(optText(o)).includes(t))
    );
  }
  function fire(el) {
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const $ = unsafeWindow.jQuery;
    if ($) $(el).trigger("change");
  }
  async function setSelect(sel, text) {
    if (!sel) return false;
    const opt = await waitFor(() => findOpt(sel, text), 7000);
    if (!opt) return false;
    sel.value = opt.value;
    fire(sel);
    return true;
  }
  async function setField(el, text) {
    if (!el) return false;
    if (el.tagName === "SELECT") return setSelect(el, text);
    el.value = text;
    fire(el);
    return true;
  }
  const curText = (sel) =>
    sel && sel.selectedIndex > 0 && sel.value !== ""
      ? optText(sel.options[sel.selectedIndex])
      : "";
  /* ---- campos de selecao do formulario (qualquer rotulo), em ordem de tela ---- */
  const cleanLabel = (t) => norm(t).replace(/\*/g, "").trim();
  function getSelects(c) {
    const heading = [
      ...document.querySelectorAll("h1,h2,h3,h4,h5,h6,legend,div,span,p"),
    ].find(
      (e) =>
        e.children.length === 0 &&
        norm(e.textContent).startsWith("CRIAR NOVO LANCAMENTO"),
    );
    const out = [],
      seen = new Set();
    for (const l of c.querySelectorAll("label")) {
      const s =
        (l.htmlFor && c.querySelector("#" + CSS.escape(l.htmlFor))) ||
        l.parentElement.querySelector("select");
      if (!s || s.tagName !== "SELECT" || seen.has(s)) continue;
      // so os campos do formulario "Criar novo lancamento" (ignora filtros acima)
      if (
        heading &&
        !(heading.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING)
      )
        continue;
      seen.add(s);
      out.push({ key: cleanLabel(l.textContent), sel: s });
    }
    return out;
  }
  const findSelByKey = (list, key) =>
    list.find((x) => x.key === key) || list.find((x) => x.key.startsWith(key));
  function readCampos(list) {
    const o = {};
    for (const x of list) {
      const v = curText(x.sel);
      if (v) o[x.key] = v;
    }
    return o;
  }
  // regras antigas (centro/item/forma) viram "campos"
  function ruleCampos(r) {
    if (r.campos) return r.campos;
    const o = {};
    if (r.centro) o["CENTRO DE CUSTO"] = r.centro;
    if (r.item) o["ITEM DE DESPESA"] = r.item;
    if (r.forma) o["FORMA DE PAGAMENTO"] = r.forma;
    return o;
  }
  const ruleSummary = (r) => Object.values(ruleCampos(r)).join(" / ");
  const campoLines = (c) => Object.entries(c || {}).map(([k, v]) => line(k, v));

  const curTitulo = (el) =>
    !el ? "" : el.tagName === "SELECT" ? curText(el) : (el.value || "").trim();

  // Acha o botao "Fechar" do modal "Novo lancamento criado e liquidado com sucesso!"
  function findFecharBtn() {
    const btns = [
      ...document.querySelectorAll("button, a.btn, input[type=button]"),
    ].filter(
      (b) =>
        b.getClientRects().length &&
        /^(FECHAR|OK)$/.test(norm(b.textContent || b.value)),
    );
    for (const b of btns) {
      let p = b.parentElement;
      for (let i = 0; i < 8 && p; i++, p = p.parentElement) {
        if (norm(p.textContent).includes("COM SUCESSO")) return b;
      }
    }
    return null;
  }

  // Depois de clicar em Criar e liquidar: espera o modal de sucesso, clica em Fechar e volta pra lista
  async function afterCreate(id) {
    panel("Item #" + id, "Criando... aguardando a confirmação do sistema.", [
      ["■ Parar", stop, RED],
    ]);
    const fechar = await waitFor(findFecharBtn, 20000, 200);
    if (!getState().active) return;
    if (!fechar) {
      panel(
        "Item #" + id,
        "Não vi a mensagem de sucesso. Pode ter dado erro — confira a página.",
        [
          ["↩ Voltar / proximo", goBack, GREEN],
          ["■ Parar", stop, RED],
        ],
      );
      return;
    }
    await sleep(500);
    fechar.click();
    markDone(id);
    setState({ awaiting: null });
    await sleep(800);
    if (!getState().active) return;
    goBack();
  }

  /* ---------- CONCILIACAO (marca a parcela e clica em "Conciliar e liquidar") ---------- */
  // Regra de datas: a parcela tem a data em que foi gerada/vence (em cima) e o extrato tem a data do pagamento (embaixo).
  // Se a parcela cai em sabado/domingo/feriado, o pagamento vale no 1o dia util seguinte. O pagamento nunca vem antes.
  // Depois do dia util esperado, aceita ate MAX_DIAS_APOS_UTIL dias de folga. Alem disso: pula.
  const MAX_DIAS_APOS_UTIL = 3;
  const FERIADOS = [
    "01-01",
    "04-21",
    "05-01",
    "09-07",
    "10-12",
    "11-02",
    "11-15",
    "11-20",
    "12-25",
  ]; // nacionais fixos
  const DAY = 86400000;
  const parseBR = (t) => {
    const m = (t || "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
    return m ? Date.UTC(+m[3], +m[2] - 1, +m[1]) : null;
  };
  const fmtBR = (ms) => {
    if (ms == null) return "?";
    const d = new Date(ms);
    return (
      String(d.getUTCDate()).padStart(2, "0") +
      "/" +
      String(d.getUTCMonth() + 1).padStart(2, "0") +
      "/" +
      d.getUTCFullYear()
    );
  };
  function isUtil(ms) {
    const d = new Date(ms),
      wd = d.getUTCDay();
    if (wd === 0 || wd === 6) return false;
    return !FERIADOS.includes(
      String(d.getUTCMonth() + 1).padStart(2, "0") +
        "-" +
        String(d.getUTCDate()).padStart(2, "0"),
    );
  }
  function proxUtil(ms) {
    while (!isUtil(ms)) ms += DAY;
    return ms;
  }
  const dataCompativel = (gerado, pago) =>
    pago >= gerado && pago <= proxUtil(gerado) + MAX_DIAS_APOS_UTIL * DAY;
  // campos de resumo do topo da tela (Data, Natureza, Valor, Status)
  function miniField(label) {
    const e = [...document.querySelectorAll(".ofx-mini-label")].find(
      (x) => norm(x.textContent) === norm(label),
    );
    return e && e.nextElementSibling
      ? e.nextElementSibling.textContent.trim()
      : "";
  }
  // modal de resposta do sistema (sucesso ou erro)
  function readMsgModal() {
    const m = document.querySelector(".modal-MsgResponse");
    if (
      !m ||
      !m.getClientRects().length ||
      getComputedStyle(m).display === "none"
    )
      return null;
    const okEl = m.querySelector("#msg-sucesso"),
      erEl = m.querySelector("#msg-erro");
    const ok = !!okEl && !okEl.classList.contains("d-none"),
      er = !!erEl && !erEl.classList.contains("d-none");
    if (!ok && !er) return null;
    const txt = ((ok ? okEl : erEl).textContent || "")
      .replace(/\s+/g, " ")
      .trim();
    return { ok, text: txt, fechar: m.querySelector(".fecharbtn") };
  }
  // Fecha qualquer modal aberto (sucesso/erro do sistema, bootstrap, swal)
  function closeModals() {
    const r = readMsgModal();
    if (r && r.fechar) {
      r.fechar.click();
      return true;
    }
    const f = findFecharBtn();
    if (f) {
      f.click();
      return true;
    }
    const b = [
      ...document.querySelectorAll(
        ".modal.show .fecharbtn, .modal.show [data-dismiss=modal], .modal.show [data-bs-dismiss=modal], .modal.show .close, .swal2-confirm",
      ),
    ].find((x) => x.getClientRects().length);
    if (b) {
      b.click();
      return true;
    }
    return false;
  }
  function pularItem(id) {
    const s = getState();
    s.skipped.push(id);
    save("state", s);
    setState({ awaiting: null });
    goBack();
  }

  async function afterConcilia(id) {
    panel("Item #" + id, "Conciliando... aguardando o sistema.", [
      ["■ Parar", stop, RED],
    ]);
    const t0 = Date.now();
    while (Date.now() - t0 < 25000) {
      if (!getState().active) return;
      // mesmo jeito da fila automatica: botao Fechar dentro do modal "com sucesso"
      const fOk = findFecharBtn();
      if (fOk) {
        await sleep(500);
        fOk.click();
        markDone(id);
        setState({ awaiting: null });
        await sleep(800);
        if (!getState().active) return;
        return goBack();
      }
      const r = readMsgModal();
      if (r && r.fechar) {
        if (r.ok) {
          await sleep(500);
          r.fechar.click();
          markDone(id);
          setState({ awaiting: null });
          await sleep(800);
          if (!getState().active) return;
          return goBack();
        }
        panel(
          "Item #" + id,
          "O sistema recusou: " + r.text + ". Pulando este item.",
          [["■ Parar", stop, RED]],
        );
        await sleep(1800);
        r.fechar.click();
        if (!getState().active) return;
        return pularItem(id);
      }
      await sleep(250);
    }
    // Não apareceu modal: segue em frente em vez de travar a fila
    panel(
      "Item #" + id,
      "Não vi a resposta do sistema. Voltando para a lista...",
      [["■ Parar", stop, RED]],
    );
    await sleep(1500);
    if (!getState().active) return;
    markDone(id); // se realmente conciliou, não volta a aparecer; se não, o status na lista ainda mostra
    return goBack();
  }

  async function conciliaStep(id) {
    const skipIt = async (why) => {
      panel("Item #" + id + " — pulando", why, [["■ Parar", stop, RED]]);
      await sleep(1500);
      if (!getState().active) return;
      pularItem(id);
    };
    const pago = parseBR(miniField("Data"));
    const rows = [...document.querySelectorAll("[data-lancamento-row]")];
    if (!pago) return skipIt("Não consegui ler a data do extrato.");
    if (!rows.length)
      return skipIt("Não há parcela candidata na tela (" + fmtBR(pago) + ").");
    const cands = rows.map((row) => {
      const tds = [...row.children];
      const dTd = tds.find((td) =>
        /^\d{2}\/\d{2}\/\d{4}$/.test(td.textContent.trim()),
      );
      return {
        row,
        gerado: parseBR(dTd && dTd.textContent),
        titulo: ((tds[2] || {}).textContent || "").replace(/\s+/g, " ").trim(),
      };
    });
    const ok = cands.filter(
      (x) => x.gerado != null && dataCompativel(x.gerado, pago),
    );
    if (!ok.length)
      return skipIt(
        "Datas não batem. Parcela(s): " +
          cands.map((x) => fmtBR(x.gerado)).join(", ") +
          " | extrato: " +
          fmtBR(pago) +
          ".",
      );
    if (ok.length > 1)
      return skipIt(
        "Mais de uma parcela com data compatível (" +
          ok.map((x) => fmtBR(x.gerado)).join(", ") +
          "). Ambíguo.",
      );
    const pick = ok[0];
    pick.row.scrollIntoView({ block: "center" });
    panel(
      "⚡ Conciliando #" + id,
      [
        line("Parcela", pick.titulo.slice(0, 80)),
        line("Gerada em", fmtBR(pick.gerado)),
        line("Paga em (extrato)", fmtBR(pago)),
      ],
      [["■ Parar", stop, RED]],
    );
    await sleep(1200);
    if (!getState().active) return;
    const chk = pick.row.querySelector(".ofx-chk-lanc");
    chk.checked = true;
    chk.dispatchEvent(new Event("change", { bubbles: true }));
    await sleep(400);
    const btn = document.querySelector('#form-conciliar button[type="submit"]');
    if (!btn || btn.disabled)
      return skipIt(
        "Botão Conciliar bloqueado: a soma não fecha com o extrato.",
      );
    if (!/CONCILIAR E LIQUIDAR/.test(norm(btn.textContent)))
      return skipIt("Seria pagamento parcial. Não faço isso no automático.");
    setState({ awaiting: id });
    btn.click();
    afterConcilia(id);
  }

  /* ---------- EXCLUSAO (botao vermelho) ---------- */
  function findDeleteBtn(c) {
    const q =
      "button, a.btn, a[class*=btn], input[type=submit], input[type=button]";
    const t = (b) => norm(b.textContent || b.value || b.title);
    for (const root of [c, document]) {
      const all = [...root.querySelectorAll(q)].filter(
        (b) => b.getClientRects().length > 0,
      );
      const b =
        all.find((x) =>
          /^(EXCLUIR|DESCARTAR|IGNORAR|REMOVER|DELETAR|APAGAR|EXCLUSAO)/.test(
            t(x),
          ),
        ) ||
        all.find((x) => /EXCLUIR|DESCARTAR|IGNORAR|APAGAR/.test(t(x))) ||
        all.find(
          (x) =>
            /btn-(outline-)?danger/.test(x.className) &&
            !/FECHAR|CANCELAR|NAO/.test(t(x)),
        );
      if (b) return b;
    }
    return null;
  }
  // botao dentro de um dialog/modal (confirmacao ou sucesso)
  function findDlgBtn(textRe, btnRe) {
    return [
      ...document.querySelectorAll("button, a.btn, input[type=button]"),
    ].find((b) => {
      if (
        !b.getClientRects().length ||
        !btnRe.test(norm(b.textContent || b.value))
      )
        return false;
      const d = b.closest(
        ".swal2-popup, .swal2-container, .modal, [role=dialog]",
      );
      return d && textRe.test(norm(d.textContent));
    });
  }
  function doExclude(id, del) {
    setState({ awaiting: id });
    del.click();
    afterExclude(id);
  }

  // depois de clicar no botao vermelho: confirma o popup (se houver), fecha o aviso de sucesso e volta
  async function afterExclude(id) {
    panel("Item #" + id, "Excluindo... aguardando o sistema.", [
      ["■ Parar", stop, RED],
    ]);
    const t0 = Date.now();
    let confirmed = 0;
    while (Date.now() - t0 < 20000) {
      if (!getState().active) return;
      const ok = findDlgBtn(
        /SUCESSO|EXCLUID|REMOVID|DESCARTAD|IGNORAD|APAGAD/,
        /^(FECHAR|OK)$/,
      );
      if (ok) {
        await sleep(500);
        ok.click();
        markDone(id);
        setState({ awaiting: null });
        await sleep(800);
        if (!getState().active) return;
        return goBack();
      }
      const conf =
        confirmed < 2 &&
        findDlgBtn(
          /CERTEZA|CONFIRM|DESEJA|EXCLUIR|REMOVER|DESCARTAR|IGNORAR|APAGAR/,
          /^(SIM|CONFIRM|EXCLUIR|REMOVER|DESCARTAR|IGNORAR|APAGAR|OK|CONTINUAR)/,
        );
      if (conf) {
        confirmed++;
        await sleep(400);
        conf.click();
        await sleep(800);
        continue;
      }
      await sleep(250);
    }
    panel(
      "Item #" + id,
      "Não vi a confirmação da exclusão. Confira a página.",
      [
        ["↩ Voltar / proximo", goBack, GREEN],
        ["■ Parar", stop, RED],
      ],
    );
  }

  async function exclusionStep(id, descr, rule, c, ctrl, st0, forceConfirm) {
    const del = findDeleteBtn(c);
    if (!del) {
      if (st0.onlyRules && !forceConfirm) {
        panel(
          "Item #" + id,
          "Não achei o botão vermelho de exclusão. Pulando este item.",
          [["■ Parar", stop, RED]],
        );
        await sleep(2000);
        if (!getState().active) return;
        return ctrl.skip();
      }
      panel(
        "Item #" + id + " — exclusão",
        [
          line("Descricao", descr),
          "A regra de exclusão bateu, mas não achei o botão vermelho de exclusão na tela. Exclua você mesmo ou pule.",
        ],
        [
          ["✋ Manual", ctrl.manual, GRAY],
          ["⏭ Pular", ctrl.skip, GRAY],
          ["■ Parar", stop, RED],
        ],
      );
      return;
    }
    del.scrollIntoView({ block: "center" });
    if (st0.auto && !forceConfirm) {
      panel(
        "⚡ Automático — EXCLUINDO #" + id,
        [line("Descricao", descr), line("Regra", rule.kw)],
        [["■ Parar", stop, RED]],
      );
      await sleep(1200);
      if (!getState().active) return;
      return doExclude(id, del);
    }
    panel(
      "Item #" + id + " — Excluir?",
      [line("Descricao", descr), line("Regra de exclusão", rule.kw)],
      [
        ["🗑 Excluir", () => doExclude(id, del), RED],
        ["✋ Manual", ctrl.manual, GRAY],
        ["⏭ Pular", ctrl.skip, GRAY],
      ],
    );
  }

  async function detailsPage(forceConfirm) {
    const st0 = getState();
    const id = (location.pathname.match(/detalhes\/(\d+)/) || [])[1];
    if (!st0.active) {
      panel("OFX Assistente", "Fila parada (modo manual).", [
        [
          "▶ Voltar a fila",
          () => {
            setState({ active: true });
            location.href = LIST_URL;
          },
          GREEN,
        ],
      ]);
      return;
    }
    if (!st0.entry || st0.entry.id !== id)
      setState({ entry: { id, len: history.length } });
    const btn = await waitFor(findCreateBtn, 10000);
    const retry = st0.awaiting === id;
    setState({ current: id, awaiting: null });
    if (!btn) {
      // sem formulario: ja foi lancado -> volta (seta do navegador) para o proximo
      markDone(id);
      goBack();
      return;
    }
    if (st0.onlyConcilia) {
      const f = findFecharBtn();
      if (f) {
        f.click();
        await sleep(600);
      }
    }
    if (retry && st0.onlyConcilia) {
      // recarregou depois de conciliar: se não está mais pendente, deu certo
      if (!/PENDENTE/i.test(miniField("Status"))) {
        markDone(id);
        return goBack();
      }
      const s = getState();
      s.skipped.push(id);
      save("state", s); // continua pendente: pula pra não repetir
      return goBack();
    }
    if (retry) {
      panel(
        "Item #" + id,
        "Voltou para esta mesma tela depois de criar. Pode ter dado erro — confira a pagina.",
        [
          ["↩ Voltar / proximo", goBack, GREEN],
          [
            "🔁 Tentar de novo",
            () => {
              setState({ awaiting: null });
              detailsPage(true);
            },
            GRAY,
          ],
          ["■ Parar", stop, RED],
        ],
      );
      return;
    }
    if (st0.onlyConcilia) return conciliaStep(id);
    const c = findContainer(btn);
    const fldT = fieldAny(c, "Titulo");
    const descr = (fieldAny(c, "Descricao") || {}).value || "";
    // natureza: vem da lista (quando abriu pelo assistente); senao tenta ler da tela
    const natFld = fieldAny(document.body, "Natureza");
    const nat =
      st0.current === id && st0.curNat
        ? normNat(st0.curNat)
        : normNat(
            natFld ? natFld.value || curText(natFld) : miniField("Natureza"),
          );
    c.scrollIntoView({ block: "center" });

    const ctrl = {
      skip() {
        const s = getState();
        s.skipped.push(id);
        save("state", s);
        goBack();
      },
      manual() {
        panel(
          "Item #" + id + " — manual",
          "Preencha e salve do seu jeito. Quando terminar, volte pra fila.",
          [
            ["↩ Voltar a fila", goBack, GREEN],
            ["■ Parar", stop, RED],
          ],
        );
      },
      current() {
        return { campos: readCampos(getSelects(c)), titulo: curTitulo(fldT) };
      },
      required() {
        return getSelects(c)
          .filter((x) => x.sel.required && !curText(x.sel))
          .map((x) => x.key);
      },
      hasTitulo: !!fldT,
      setTitulo(v) {
        return setField(fldT, v);
      },
    };

    const m = matchAny(descr, nat);
    if (!m) {
      if (st0.onlyRules) return ctrl.skip();
      return askRule(id, descr, ctrl, nat);
    }
    if (st0.onlyEx && !m.ex) return ctrl.skip();
    if (m.ex)
      return exclusionStep(id, descr, m.rule, c, ctrl, st0, forceConfirm);
    const rule = m.rule;

    const miss = [];
    for (const [key, val] of Object.entries(ruleCampos(rule))) {
      const e = findSelByKey(getSelects(c), key);
      if (!e) miss.push('campo "' + key + '" nao encontrado na tela');
      else if (!(await setSelect(e.sel, val)))
        miss.push(key + ' "' + val + '"');
    }
    if (rule.titulo) {
      if (!fldT) miss.push("campo Titulo nao encontrado na tela");
      else if (!(await ctrl.setTitulo(buildTitulo(rule.titulo, descr))))
        miss.push("Titulo");
    }
    if (st0.onlyRules && !forceConfirm && miss.length) {
      // so com regra: nao conseguiu preencher -> pula sem perguntar
      panel(
        "Item #" + id,
        "Não consegui preencher: " + miss.join("; ") + ". Pulando este item.",
        [["■ Parar", stop, RED]],
      );
      await sleep(2000);
      if (!getState().active) return;
      return ctrl.skip();
    }
    if (st0.auto && !forceConfirm && !miss.length) {
      // automatico: preenchido sem faltas -> cria e liquida direto
      const cur = ctrl.current();
      panel(
        "⚡ Automático — item #" + id,
        [
          line("Descricao", descr),
          ...campoLines(cur.campos),
          line("Titulo", cur.titulo || "—"),
        ],
        [["■ Parar", stop, RED]],
      );
      await sleep(1200);
      if (!getState().active) return;
      setState({ awaiting: id });
      btn.click();
      afterCreate(id);
      return;
    }
    confirmStep(id, descr, rule, miss, btn, ctrl);
  }

  function confirmStep(id, descr, rule, miss, btn, ctrl) {
    const cur = ctrl.current();
    const body = [
      line("Regra", rule.kw + (rule.nat ? " (" + rule.nat + ")" : "")),
      line("Descricao", descr),
      ...campoLines(cur.campos),
    ];
    let tituloInput = null;
    if (rule.titulo) {
      body.push(h("div", {}, h("b", {}, "Titulo (pode corrigir): ")));
      tituloInput = textInput(cur.titulo || buildTitulo(rule.titulo, descr));
      body.push(tituloInput);
    }
    if (miss.length)
      body.push(
        h(
          "div",
          { style: { color: RED, marginTop: "6px" } },
          "Nao achei: " + miss.join("; ") + ". Ajuste manualmente.",
        ),
      );
    panel("Item #" + id + " — Tá bom?", body, [
      [
        "✅ Criar e liquidar",
        async () => {
          if (tituloInput) await ctrl.setTitulo(tituloInput.value.trim());
          setState({ awaiting: id });
          btn.click();
          afterCreate(id);
        },
        GREEN,
      ],
      [
        "💾 Atualizar regra",
        () => {
          const v = ctrl.current();
          if (!Object.keys(v.campos).length)
            return alert("Selecione os campos na tela primeiro.");
          const rules = getRules();
          const r = rules.find((x) => x.kw === rule.kw);
          r.campos = v.campos;
          delete r.centro;
          delete r.item;
          delete r.forma; // titulo (modelo) fica como esta
          save("rules", rules);
          confirmStep(id, descr, r, [], btn, ctrl);
        },
        "#7e57c2",
      ],
      ["✋ Manual", ctrl.manual, GRAY],
      ["⏭ Pular", ctrl.skip, GRAY],
    ]);
  }

  function askRule(id, descr, ctrl, nat) {
    // sugestao de palavra-chave: nome do favorecido, 2 primeiras palavras
    const sugg = norm(extractNome(descr)).split(" ").slice(0, 2).join(" ");
    const kw = textInput(sugg);
    const tit = textInput("");
    const natSel = h("select", {});
    [
      ["", "Débito e crédito (ambos)"],
      ["DEBITO", "Só DÉBITO"],
      ["CREDITO", "Só CRÉDITO"],
    ].forEach(([v, t]) => natSel.append(h("option", { value: v }, t)));
    natSel.value = nat || "";
    Object.assign(natSel.style, {
      width: "100%",
      border: "1px solid #aaa",
      borderRadius: "4px",
      padding: "4px",
      marginBottom: "6px",
    });
    panel(
      "Item #" + id + " — sem regra",
      [
        line("Descricao", descr),
        "Preencha todos os campos de seleção na tela (Centro de custo, Fonte de recurso, Item, Forma...), menos o Título. Palavra-chave (use | para varias; nada de datas/numeros):",
        kw,
        "Titulo (deixe vazio se nao quiser padrao). Use {NOME} para o nome tirado da descricao (ex.: PGTO. AO FORNECEDOR DO PERMISSIONARIO - {NOME}):",
        tit,
        "Esta regra vale para (este item é " +
          (nat || "natureza não detectada") +
          "):",
        natSel,
        "Nome detectado nesta descricao: " + extractNome(descr),
      ],
      [
        [
          "💾 Salvar regra",
          () => {
            const v = ctrl.current();
            if (!kw.value.trim() || !Object.keys(v.campos).length)
              return alert("Preencha os campos na tela e a palavra-chave.");
            const faltam = ctrl.required();
            if (faltam.length)
              return alert("Faltou preencher: " + faltam.join(", "));
            const rule = { kw: kw.value.trim(), campos: v.campos };
            // titulo: modelo digitado; se vazio, usa o que ja esta na tela (texto fixo)
            const t = tit.value.trim() || v.titulo;
            if (t) rule.titulo = t;
            if (natSel.value) rule.nat = natSel.value;
            const rules = getRules();
            rules.push(rule);
            save("rules", rules);
            detailsPage(true); // regra nova: confirma uma vez antes de liquidar
          },
          GREEN,
        ],
        [
          "🗑 Salvar como EXCLUSÃO",
          () => {
            if (!kw.value.trim()) return alert("Preencha a palavra-chave.");
            const r = { kw: kw.value.trim() };
            if (natSel.value) r.nat = natSel.value;
            const ex = getExRules();
            ex.push(r);
            save("exrules", ex);
            detailsPage(true); // regra nova: confirma uma vez antes de excluir
          },
          RED,
        ],
        ["✋ Deixar manual", ctrl.manual, GRAY],
        ["⏭ Pular", ctrl.skip, GRAY],
      ],
    );
  }

  /* ---------- init ---------- */
  window.addEventListener("pageshow", (e) => {
    if (e.persisted) location.reload();
  }); // volta do cache: recarrega a lista
  function init() {
    if (/importar_arquivo_ofx_detalhes/.test(location.pathname)) detailsPage();
    else listPage();
  }
  init();
})();
