"use client";
// Busão: o mascote do VAGABS (Three.js). Anda numa estrada fixa no pé da tela, olha para onde o mouse está,
// vai até onde você clica, muda de acessório em cada aba e, quando alguma conta está sendo feita no servidor,
// acelera soltando fumaça. Termina com um "Pronto!" (ou um "Eita" se deu erro).
// Decorativo: aria-hidden, parado com prefers-reduced-motion e some sozinho se não houver WebGL.
import { useEffect, useRef } from "react";

const NOMES = { folha: "Folha de pagamento", quinzena: "Quinzena", extrato: "Extrato × DDATA", caixinha: "Caixinha", config: "Configurações" };

export default function Mascote({ linha }) {
  const raiz = useRef(null), cena = useRef(null), balao = useRef(null), ctrl = useRef(null), linhaAtual = useRef(linha);

  useEffect(() => { linhaAtual.current = linha; ctrl.current?.trocar(linha); }, [linha]);

  useEffect(() => {
    let morto = false, limpar = () => {};
    (async () => {
      const THREE = await import("three");
      const { RoundedBoxGeometry } = await import("three/examples/jsm/geometries/RoundedBoxGeometry.js");
      if (morto || !cena.current) return;
      const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); } catch { return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const el = cena.current; el.appendChild(renderer.domElement);

      const cenaTHREE = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1000, 1000);
      cenaTHREE.add(new THREE.HemisphereLight(0xffffff, 0x8a98a8, 1.25));
      const sol = new THREE.DirectionalLight(0xffffff, 2.1); sol.position.set(-120, 220, 260); cenaTHREE.add(sol);

      const mundo = new THREE.Group(); mundo.rotation.x = 0.36; cenaTHREE.add(mundo);
      const std = (c, r = 0.55, m = 0.04) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
      const corpoM = std(0x0b6b4f), branco = std(0xf4f6f8, 0.6, 0), vidro = std(0x101a24, 0.25, 0.3), preto = std(0x1b232c, 0.7, 0), amarelo = new THREE.MeshStandardMaterial({ color: 0xffd34d, emissive: 0xffb300, emissiveIntensity: 0.6 });

      // ---------- o ônibus ----------
      const onibus = new THREE.Group(); mundo.add(onibus);
      const inc = new THREE.Group(); onibus.add(inc);
      const add = (geo, mat, x, y, z, pai = inc) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); pai.add(m); return m; };
      add(new RoundedBoxGeometry(92, 40, 46, 4, 7), corpoM, 0, 30, 0);
      add(new RoundedBoxGeometry(86, 3.5, 42, 2, 1.5), branco, -1, 50.5, 0);
      for (const s of [-1, 1]) {
        add(new THREE.PlaneGeometry(84, 5), branco, 0, 21, s * 23.15).rotation.y = s > 0 ? 0 : Math.PI;
        for (const x of [-30, -10, 10, 30]) add(new THREE.PlaneGeometry(15, 13), vidro, x, 38, s * 23.15).rotation.y = s > 0 ? 0 : Math.PI;
        add(new THREE.SphereGeometry(3.4, 14, 10), amarelo, 45.2, 15, s * 16);
      }
      add(new THREE.BoxGeometry(1.2, 25, 40), vidro, 46.1, 38, 0);
      add(new THREE.BoxGeometry(4, 5, 46.4), preto, 45.6, 9.5, 0);
      add(new THREE.BoxGeometry(4, 5, 46.4), preto, -45.6, 9.5, 0);
      add(new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(46.7, 24.5, -8), new THREE.Vector3(46.7, 17, 0), new THREE.Vector3(46.7, 24.5, 8)), 12, 1.2, 6), preto, 0, 0, 0);
      // olhos
      const olhos = [];
      for (const s of [-1, 1]) {
        const pivo = new THREE.Group(); pivo.position.set(46.8, 40, s * 10); inc.add(pivo);
        const globo = new THREE.Mesh(new THREE.SphereGeometry(8.6, 20, 14), std(0xffffff, 0.35, 0)); pivo.add(globo);
        const pupilaPivo = new THREE.Group(); pivo.add(pupilaPivo);
        const pupila = new THREE.Mesh(new THREE.SphereGeometry(4.3, 14, 10), std(0x0a0f14, 0.3, 0)); pupila.position.set(6.6, 0, 0); pupilaPivo.add(pupila);
        olhos.push({ globo, pupilaPivo });
      }
      // rodas
      const rodas = [];
      for (const x of [-29, 29]) for (const z of [-23, 23]) {
        const g = new THREE.Group(); g.position.set(x, 9, z); inc.add(g);
        const pneu = new THREE.Mesh(new THREE.CylinderGeometry(9, 9, 7, 18), preto); pneu.rotation.x = Math.PI / 2; g.add(pneu);
        const miolo = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 7.6, 10), std(0xcfd6dd, 0.4, 0.4)); miolo.rotation.x = Math.PI / 2; g.add(miolo);
        const pino = new THREE.Mesh(new THREE.BoxGeometry(2, 7.6, 7.6), std(0x6b7886)); pino.rotation.x = Math.PI / 2; g.add(pino);
        rodas.push(g);
      }
      const sombra = new THREE.Mesh(new THREE.CircleGeometry(1, 28), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false }));
      sombra.rotation.x = -Math.PI / 2; sombra.scale.set(56, 30, 1); sombra.position.y = 0.4; onibus.add(sombra);

      // ---------- acessórios por aba ----------
      let prop = null, propUpd = () => {}, propPop = 0;
      function montarProp(tipo) {
        if (prop) { inc.remove(prop); }
        const p = new THREE.Group(); p.position.y = 52; inc.add(p);
        let upd = () => {};
        if (tipo === "folha") {
          for (let i = 0; i < 4; i++) { const f = add(new THREE.BoxGeometry(30, 2.4, 22), branco, -8 + (i % 2) * 2, 1.4 + i * 2.7, (i - 1.5) * 1.2, p); f.rotation.y = (i - 1.5) * 0.12; }
          add(new THREE.BoxGeometry(31, 1.2, 4), std(0xd9453b), -8, 6.4, 0, p);
          const voa = add(new THREE.PlaneGeometry(13, 17), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 14, 16, 0, p);
          upd = (t, b) => { const w = t * (b ? 6 : 1.8); voa.position.set(14 + Math.sin(w) * 7, 15 + Math.abs(Math.sin(w * 0.9)) * 6, 0); voa.rotation.set(Math.sin(w) * 0.6, w, 0.3); };
        } else if (tipo === "quinzena") {
          const ouro = std(0xf2b01e, 0.3, 0.7);
          for (let i = 0; i < 5; i++) add(new THREE.CylinderGeometry(7, 7, 2.6, 18), ouro, -10, 1.4 + i * 2.8, 0, p);
          const moeda = add(new THREE.CylinderGeometry(8, 8, 2.4, 18), ouro, 12, 14, 0, p); moeda.rotation.z = Math.PI / 2;
          upd = (t, b) => { moeda.rotation.y = t * (b ? 14 : 4); moeda.position.y = 14 + Math.sin(t * (b ? 10 : 3)) * (b ? 5 : 2.5); };
        } else if (tipo === "extrato") {
          const lupa = new THREE.Group(); lupa.position.set(0, 14, 0); p.add(lupa);
          add(new THREE.TorusGeometry(10, 1.9, 8, 28), std(0x2c3a48, 0.4, 0.4), 0, 0, 0, lupa);
          add(new THREE.CircleGeometry(9.2, 24), new THREE.MeshStandardMaterial({ color: 0xbfe6ff, transparent: true, opacity: 0.45, side: THREE.DoubleSide }), 0, 0, 0, lupa);
          const cabo = add(new THREE.CylinderGeometry(1.8, 1.8, 13, 8), std(0x2c3a48), 8.8, -8.8, 0, lupa); cabo.rotation.z = Math.PI / 4;
          add(new THREE.BoxGeometry(34, 1.4, 22), branco, 0, 0.7, 0, p);
          upd = (t, b) => { lupa.position.x = Math.sin(t * (b ? 4.5 : 1.3)) * 11; lupa.position.y = 14 + Math.cos(t * (b ? 5 : 1.1)) * 2; lupa.rotation.z = Math.sin(t * 2) * 0.12; };
        } else if (tipo === "caixinha") {
          add(new RoundedBoxGeometry(32, 14, 22, 2, 2), std(0x7a4a22, 0.7, 0), 0, 7, 0, p);
          const tampa = new THREE.Group(); tampa.position.set(-16, 14, 0); p.add(tampa);
          add(new RoundedBoxGeometry(32, 4, 22, 2, 1.5), std(0x9a6330, 0.7, 0), 16, 2, 0, tampa);
          add(new THREE.BoxGeometry(4, 15, 22.6), std(0xf2b01e, 0.3, 0.7), 0, 7, 0, p);
          const moeda = add(new THREE.CylinderGeometry(5, 5, 1.6, 16), std(0xf2b01e, 0.3, 0.7), 0, 24, 0, p); moeda.rotation.z = Math.PI / 2;
          upd = (t, b) => { tampa.rotation.z = Math.max(0, Math.sin(t * (b ? 6 : 1.7))) * 0.9; moeda.rotation.y = t * 5; moeda.position.y = 20 + Math.abs(Math.sin(t * (b ? 6 : 1.7))) * 7; };
        } else {
          const engr = new THREE.Group(); engr.position.y = 11; p.add(engr);
          const m = std(0x8695a5, 0.35, 0.6);
          const miolo = add(new THREE.CylinderGeometry(8, 8, 5, 20), m, 0, 0, 0, engr); miolo.rotation.x = Math.PI / 2;
          for (let i = 0; i < 8; i++) { const d = add(new THREE.BoxGeometry(5, 5, 5), m, 0, 0, 0, engr); const a = (i / 8) * Math.PI * 2; d.position.set(Math.cos(a) * 10, Math.sin(a) * 10, 0); d.rotation.z = a; }
          upd = (t, b) => { engr.rotation.z = t * (b ? 4 : 0.9); };
        }
        prop = p; propUpd = upd; propPop = 0; p.scale.setScalar(0.001);
      }

      // ---------- confete e fumaça ----------
      const fumaca = [], confete = [];
      for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(4, 8, 6), new THREE.MeshBasicMaterial({ color: 0xb9c3cd, transparent: true, opacity: 0 })); m.visible = false; mundo.add(m); fumaca.push({ m, vida: 0 }); }
      const CORES = [0xffd34d, 0xff6b5e, 0x4cc3ff, 0x7ee08a, 0xffffff, 0xc58bff];
      for (let i = 0; i < 18; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), new THREE.MeshBasicMaterial({ color: CORES[i % 6], side: THREE.DoubleSide })); m.visible = false; mundo.add(m); confete.push({ m, vida: 0, vx: 0, vy: 0, vr: 0 }); }

      // ---------- tamanho e cor ----------
      let W = innerWidth, H = 150, esc = 1;
      function medir() {
        W = innerWidth; esc = W <= 720 ? 0.9 : 1.45; H = W <= 720 ? 150 : 196;
        renderer.setSize(W, H, false); renderer.domElement.style.width = W + "px"; renderer.domElement.style.height = H + "px";
        camera.left = 0; camera.right = W; camera.top = H; camera.bottom = 0; camera.updateProjectionMatrix();
        onibus.scale.setScalar(esc); mundo.position.y = 14;
      }
      medir();
      function recolorir() {
        const app = document.querySelector(".app"); if (!app) return;
        const c = getComputedStyle(app).getPropertyValue("--onibus").trim() || getComputedStyle(app).getPropertyValue("--marca").trim();
        try { corpoM.color.set(c || "#0b6b4f"); } catch {}
      }

      // ---------- fala ----------
      let falaTimer = 0;
      function falar(txt, ms = 2200) {
        const b = balao.current; if (!b) return;
        b.firstChild.textContent = txt; b.classList.add("on"); clearTimeout(falaTimer);
        if (ms) falaTimer = setTimeout(() => { if (estado !== "ocupado") b.classList.remove("on"); }, ms);
      }

      // ---------- comportamento ----------
      let estado = "ocioso", bx = W * 0.62, tx = bx, yaw = -Math.PI / 2, vel = 0, espera = 1.5, t = 0, tEstado = 0, pisca = 3, ponto = 0;
      let px = W / 2, py = 0, excita = 0, ocupadoDesde = 0, ocupadoTimer = 0, mostrouOcupado = false;
      const angulo = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };
      const ir = (x) => { tx = Math.max(70, Math.min(W - 70, x)); estado = estado === "ocupado" ? estado : "andando"; };
      const aoPonteiro = (e) => { px = e.clientX; py = e.clientY; };
      const aoClicar = (e) => { aoPonteiro(e); if (estado === "ocioso" || estado === "andando" || estado === "olhando") { ir(e.clientX); espera = 2.8; } };
      const aoTeclar = () => { excita = 1; };
      addEventListener("pointermove", aoPonteiro, { passive: true }); addEventListener("pointerdown", aoClicar, { passive: true }); addEventListener("keydown", aoTeclar, { passive: true });
      const aoResize = () => { medir(); bx = Math.min(bx, W - 70); tx = Math.min(tx, W - 70); };
      addEventListener("resize", aoResize);
      const mo = new MutationObserver(recolorir); mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      const aoTrabalho = (ev) => {
        const { n, erro } = ev.detail;
        raiz.current?.classList.toggle("ocupado", n > 0 && mostrouOcupado);
        if (n > 0) {
          if (!ocupadoTimer && !mostrouOcupado) ocupadoTimer = setTimeout(() => { ocupadoTimer = 0; mostrouOcupado = true; raiz.current?.classList.add("ocupado"); estado = "ocupado"; tEstado = 0; tx = W * 0.2; falar("Calculando…", 0); }, 260);
        } else {
          clearTimeout(ocupadoTimer); ocupadoTimer = 0;
          if (mostrouOcupado || erro) { mostrouOcupado = false; raiz.current?.classList.remove("ocupado"); estado = erro ? "oops" : "festa"; tEstado = 0; balao.current?.classList.remove("on"); falar(erro ? "Eita, deu erro" : "Pronto!", 2400);
            if (!erro) for (const c of confete) { c.vida = 1.4; c.m.visible = true; c.m.position.set(bx, 70 * esc, 0); c.vx = (Math.random() - 0.5) * 240; c.vy = 160 + Math.random() * 160; c.vr = (Math.random() - 0.5) * 18; } }
        }
      };
      addEventListener("vagabs-trabalho", aoTrabalho);

      ctrl.current = { trocar(l) { montarProp(l); recolorir(); const fala = NOMES[l]; if (fala) falar(fala, 2000); } };
      montarProp(linhaAtual.current); recolorir();
      setTimeout(() => falar(NOMES[linhaAtual.current] || "Olá!", 2200), 700);

      let ant = performance.now(), raf = 0;
      function quadro(agora) {
        const dt = Math.min(0.05, (agora - ant) / 1000); ant = agora; t += dt; tEstado += dt;
        // escolhe o que fazer
        if (estado === "ocupado") { if (Math.abs(tx - bx) < 8) tx = tx < W * 0.5 ? W * 0.8 : W * 0.2; }
        else if (estado === "festa") { if (tEstado > 1.6) estado = "ocioso"; }
        else if (estado === "oops") { if (tEstado > 1.0) estado = "ocioso"; }
        else if (estado === "andando") { if (Math.abs(tx - bx) < 4) { estado = "olhando"; tEstado = 0; } }
        else if (estado === "olhando") { if (tEstado > espera) { estado = "ocioso"; tEstado = 0; } }
        else if (estado === "ocioso") {
          espera -= dt;
          if (espera <= 0) { espera = 3 + Math.random() * 4; if (Math.random() < 0.7) ir(80 + Math.random() * (W - 160)); }
        }
        // movimento
        const alvoV = (estado === "ocupado" ? 250 : estado === "andando" ? 90 : 0) * Math.sign(tx - bx) * (Math.abs(tx - bx) > 4 || estado === "ocupado" ? 1 : 0);
        vel += (alvoV - vel) * Math.min(1, dt * 5); bx += vel * dt;
        const anda = Math.abs(vel) > 6;
        // direção do corpo
        const yawAlvo = estado === "festa" ? -Math.PI / 2 + Math.sin(tEstado * 14) * 0.5 : anda ? (vel > 0 ? -0.5 : Math.PI + 0.5) : -Math.PI / 2;
        yaw = angulo(yaw, yawAlvo, Math.min(1, dt * 7)); onibus.rotation.y = yaw;
        // quique, rodas, inclinação
        const b = estado === "ocupado";
        excita = Math.max(0, excita - dt * 3);
        let quique = (anda ? Math.abs(Math.sin(t * (b ? 26 : 13))) * (b ? 2 : 1.1) : 0) + excita * Math.abs(Math.sin(t * 22)) * 2;
        let salto = estado === "festa" ? Math.abs(Math.sin(tEstado * 8)) * 22 : 0;
        let tremer = estado === "oops" ? Math.sin(tEstado * 50) * 3 * (1 - tEstado) : 0;
        inc.position.set(tremer, quique + salto, 0); inc.rotation.z = -vel * 0.0006 + (b ? Math.sin(t * 30) * 0.012 : 0);
        for (const r of rodas) r.rotation.z -= (Math.abs(vel) / 9) * dt;
        sombra.scale.x = 56 - salto * 0.6; sombra.material.opacity = 0.22 - salto * 0.004;
        onibus.position.x = bx;
        // olhos: seguem o mouse, apertam quando ocupado, arregalam no erro
        const olhoY = (cena.current?.getBoundingClientRect().bottom || innerHeight) - (14 + 42 * esc);
        const dx = px - bx, dy = olhoY - py, d = Math.max(140, Math.hypot(dx, dy));
        const gx = dx / d, gy = dy / d, s = Math.sin(yaw);
        pisca -= dt; if (pisca < -0.13) pisca = 2.5 + Math.random() * 3;
        const abre = estado === "oops" ? 1.25 : b ? 0.55 : pisca < 0 ? 0.08 : 1;
        for (const o of olhos) { o.pupilaPivo.rotation.y = -gx * s * 0.62 + (anda ? (vel > 0 ? 0.0 : 0) : 0); o.pupilaPivo.rotation.z = gy * 0.5; o.globo.scale.y += (abre - o.globo.scale.y) * Math.min(1, dt * 18); }
        // acessório
        if (prop) { propPop = Math.min(1, propPop + dt * 3.2); const e = 1 - Math.pow(1 - propPop, 3); prop.scale.setScalar(Math.max(0.001, e * (1 + Math.sin(propPop * Math.PI) * 0.25))); propUpd(t, b); }
        // fumaça
        if (b && Math.floor(t * 12) !== Math.floor((t - dt) * 12)) { const f = fumaca.find((q) => q.vida <= 0); if (f) { f.vida = 0.7; f.m.visible = true; f.m.position.set(bx - Math.sign(vel || 1) * 52 * esc, 18 * esc, -4); f.m.scale.setScalar(0.6); } }
        for (const f of fumaca) if (f.vida > 0) { f.vida -= dt; f.m.position.y += 40 * dt; f.m.scale.addScalar(dt * 4); f.m.material.opacity = Math.max(0, f.vida) * 0.7; if (f.vida <= 0) f.m.visible = false; }
        for (const c of confete) if (c.vida > 0) { c.vida -= dt; c.vy -= 420 * dt; c.m.position.x += c.vx * dt; c.m.position.y += c.vy * dt; c.m.rotation.x += c.vr * dt; c.m.rotation.z += c.vr * dt; if (c.vida <= 0 || c.m.position.y < 0) { c.vida = 0; c.m.visible = false; } }
        if (balao.current) balao.current.style.transform = `translate3d(${bx}px, 0, 0)`;
        renderer.render(cenaTHREE, camera);
        if (!reduz && !document.hidden) raf = requestAnimationFrame(quadro); else if (!reduz) raf = setTimeout(() => { ant = performance.now(); raf = requestAnimationFrame(quadro); }, 500);
      }
      if (reduz) { quadro(performance.now()); } else raf = requestAnimationFrame(quadro);

      limpar = () => {
        cancelAnimationFrame(raf); clearTimeout(raf); clearTimeout(falaTimer); clearTimeout(ocupadoTimer);
        removeEventListener("pointermove", aoPonteiro); removeEventListener("pointerdown", aoClicar); removeEventListener("keydown", aoTeclar);
        removeEventListener("resize", aoResize); removeEventListener("vagabs-trabalho", aoTrabalho); mo.disconnect();
        renderer.dispose(); renderer.domElement.remove(); ctrl.current = null;
      };
    })();
    return () => { morto = true; limpar(); };
  }, []);

  return (
    <div className="estrada" aria-hidden="true" ref={raiz}>
      <div className="estrada-faixa" />
      <div className="mascote-cena" ref={cena} />
      <div className="mascote-balao" ref={balao}><span /></div>
    </div>
  );
}
