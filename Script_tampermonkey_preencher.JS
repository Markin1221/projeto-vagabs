// ==UserScript==
// @name         OFX Assistente (Coopernorte)
// @namespace    coopernorte.ofx
// @version      1.2
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
  const LIST_URL = location.origin + "/financeiro/admin/importar_arquivo_ofx";

  // Volta no historico (como a seta do navegador) ate a lista, mantendo filtros/pagina.
  // Se nao der, abre a lista pela URL.
  function goBack() {
    const e = getState().entry;
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

  function matchRule(text) {
    const t = norm(text);
    let best = null,
      bestLen = 0;
    for (const r of getRules()) {
      for (const kw of String(r.kw).split("|").map(norm).filter(Boolean)) {
        if (t.includes(kw) && kw.length > bestLen) {
          best = r;
          bestLen = kw.length;
        }
      }
    }
    return best;
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
  function openRules() {
    const ta = h("textarea", { value: JSON.stringify(getRules(), null, 2) });
    Object.assign(ta.style, {
      width: "100%",
      height: "220px",
      font: "12px monospace",
    });
    panel(
      "Regras (JSON)",
      [
        'Formato: {"kw":"REDIESEL|CPX","centro":"...","item":"...","forma":"...","titulo":"PGTO. AO FORNECEDOR DO PERMISSIONARIO - {NOME}"}. Use | para varias palavras-chave. {NOME} = nome tirado da descricao. "titulo" e opcional.',
        ta,
      ],
      [
        [
          "Salvar",
          () => {
            try {
              const v = JSON.parse(ta.value);
              if (!Array.isArray(v)) throw 0;
              save("rules", v);
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
          !(st.done || []).includes(r.id),
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
      panel("OFX Assistente", "Pronto. Inicia a fila de itens PENDENTES.", [
        [
          "▶ Iniciar fila",
          () => {
            setState({ active: true, skipped: [], done: [] });
            listPage();
          },
          GREEN,
        ],
        ["Regras (" + getRules().length + ")", openRules, GRAY],
      ]);
      return;
    }
    panel("OFX Assistente", "Procurando proximo pendente...", [
      ["■ Parar", stop, RED],
    ]);
    const row = await findNext();
    if (!row) {
      setState({ active: false });
      panel(
        "OFX Assistente",
        "Fila acabou: nenhum pendente (fora os pulados).",
        [["Ok", () => init(), GRAY]],
      );
      return;
    }
    const rule = matchRule(row.memo);
    panel(
      "Proximo item #" + row.id,
      [
        line("Valor", row.valor),
        line("Data", row.data),
        line("Memo", row.memo),
        line(
          "Regra",
          rule
            ? rule.kw + " → " + rule.centro + " / " + rule.item
            : "nenhuma (vou perguntar)",
        ),
      ],
      [
        [
          "✅ Fazer este",
          () => {
            setState({ current: row.id });
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
    setState({ active: false, awaiting: null });
    init();
  }

  /* ---------- DETALHES ---------- */
  function findCreateBtn() {
    return [
      ...document.querySelectorAll("button, input[type=submit], a.btn"),
    ].find((b) =>
      norm(b.textContent || b.value).includes("CRIAR LANCAMENTO E LIQUIDAR"),
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
  const curTitulo = (el) =>
    !el ? "" : el.tagName === "SELECT" ? curText(el) : (el.value || "").trim();

  async function detailsPage() {
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
              detailsPage();
            },
            GRAY,
          ],
          ["■ Parar", stop, RED],
        ],
      );
      return;
    }
    const c = findContainer(btn);
    const selC = fieldSelect(c, "Centro de custo"),
      selI = fieldSelect(c, "Item de despesa"),
      selF = fieldSelect(c, "Forma de pagamento");
    const fldT = fieldAny(c, "Titulo");
    const descr = (fieldAny(c, "Descricao") || {}).value || "";
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
        return {
          centro: curText(selC),
          item: curText(selI),
          forma: curText(selF),
          titulo: curTitulo(fldT),
        };
      },
      hasTitulo: !!fldT,
      setTitulo(v) {
        return setField(fldT, v);
      },
    };

    const rule = matchRule(descr);
    if (!rule) return askRule(id, descr, ctrl);

    const miss = [];
    if (!(await setSelect(selC, rule.centro)))
      miss.push('Centro de custo "' + rule.centro + '"');
    if (!(await setSelect(selI, rule.item)))
      miss.push('Item de despesa "' + rule.item + '"');
    if (rule.forma && !(await setSelect(selF, rule.forma)))
      miss.push('Forma de pagamento "' + rule.forma + '"');
    if (rule.titulo) {
      if (!fldT) miss.push("campo Titulo nao encontrado na tela");
      else if (!(await ctrl.setTitulo(buildTitulo(rule.titulo, descr))))
        miss.push("Titulo");
    }
    confirmStep(id, descr, rule, miss, btn, ctrl);
  }

  function confirmStep(id, descr, rule, miss, btn, ctrl) {
    const cur = ctrl.current();
    const body = [
      line("Regra", rule.kw),
      line("Descricao", descr),
      line("Centro", cur.centro || "—"),
      line("Item", cur.item || "—"),
      line("Forma", cur.forma || "—"),
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
        },
        GREEN,
      ],
      [
        "💾 Atualizar regra",
        () => {
          const v = ctrl.current();
          if (!v.centro || !v.item)
            return alert("Selecione Centro e Item primeiro.");
          const rules = getRules();
          const r = rules.find((x) => x.kw === rule.kw);
          Object.assign(r, { centro: v.centro, item: v.item, forma: v.forma }); // titulo (modelo) fica como esta
          save("rules", rules);
          confirmStep(id, descr, r, [], btn, ctrl);
        },
        "#7e57c2",
      ],
      ["✋ Manual", ctrl.manual, GRAY],
      ["⏭ Pular", ctrl.skip, GRAY],
    ]);
  }

  function askRule(id, descr, ctrl) {
    // sugestao de palavra-chave: nome do favorecido, 2 primeiras palavras
    const sugg = norm(extractNome(descr)).split(" ").slice(0, 2).join(" ");
    const kw = textInput(sugg);
    const tit = textInput("");
    panel(
      "Item #" + id + " — sem regra",
      [
        line("Descricao", descr),
        "Preencha Centro de custo, Item de despesa e Forma na tela. Palavra-chave (use | para varias; nada de datas/numeros):",
        kw,
        "Titulo (deixe vazio se nao quiser padrao). Use {NOME} para o nome tirado da descricao (ex.: PGTO. AO FORNECEDOR DO PERMISSIONARIO - {NOME}):",
        tit,
        "Nome detectado nesta descricao: " + extractNome(descr),
      ],
      [
        [
          "💾 Salvar regra",
          () => {
            const v = ctrl.current();
            if (!kw.value.trim() || !v.centro || !v.item)
              return alert("Preencha Centro e Item na tela e a palavra-chave.");
            const rule = {
              kw: kw.value.trim(),
              centro: v.centro,
              item: v.item,
              forma: v.forma,
            };
            // titulo: modelo digitado; se vazio, usa o que ja esta na tela (texto fixo)
            const t = tit.value.trim() || v.titulo;
            if (t) rule.titulo = t;
            const rules = getRules();
            rules.push(rule);
            save("rules", rules);
            detailsPage();
          },
          GREEN,
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
