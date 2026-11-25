"use client";
// Cofrinho: o bichinho do VAGABS (Three.js). Mora no canto livre da lateral, passeia por perto e dá para
// pegar, arrastar e deixar em outro canto. Tem fome e humor: moeda alimenta, carinho e brincadeira animam,
// ficar parado muito tempo deixa triste e dormindo, fome demais dá raiva. Quando o sistema termina uma conta
// (o mesmo sinal "vagabs-trabalho" do Busão), ele come sozinho e fica feliz. Estado salvo no navegador.
// Decorativo para leitores de tela, parado com prefers-reduced-motion e some se não houver WebGL.
import { useEffect, useRef, useState } from "react";

const CHAVE = "vagabs-pet";
const L = 140, A = 140, PE = 8; // tamanho do quadro 3D e distância do pé até a base
const FALAS = {
  faminto: ["Tô com fome… uma moedinha?", "Minha barriguinha tá roncando", "Cadê meu lanche?"],
  triste: ["Tô sozinho aqui…", "Alguém aí?", "Faz um carinho?"],
  bravo: ["Fome demais! Grrr", "Quero moeda AGORA", "Hmpf!"],
  feliz: ["Gostei!", "Tudo em dia por aqui", "Que dia bom!"],
  neutro: ["Tô de olho em você", "Pode trabalhar, eu vigio"],
};
const sortear = (v) => v[Math.floor(Math.random() * v.length)];
const limitar = (v, a, b) => Math.max(a, Math.min(b, v));
const NOME = { dormindo: "Dormindo", enjoado: "Enjoado", bravo: "Bravo", faminto: "Com fome", triste: "Triste", feliz: "Feliz", neutro: "Tranquilo" };

function lerSalvo() {
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || "null");
    if (s && typeof s.fome === "number") {
      const horas = limitar((Date.now() - (s.t || Date.now())) / 36e5, 0, 6);
      return { fome: limitar(s.fome - horas * 22, 8, 130), humor: limitar(s.humor - horas * 12, 10, 100), pos: s.pos || null };
    }
  } catch {}
  return { fome: 70, humor: 65, pos: null };
}

export default function Cofrinho() {
  const raiz = useRef(null), cena = useRef(null), balao = useRef(null), ctrl = useRef(null);
  const [aberto, setAberto] = useState(false);
  const [info, setInfo] = useState({ fome: 70, humor: 65, mood: "neutro", x: 100 });

  useEffect(() => {
    let morto = false, limpar = () => {};
    (async () => {
      const THREE = await import("three");
      if (morto || !cena.current) return;
      const reduz = matchMedia("(prefers-reduced-motion: reduce)").matches;
      let renderer;
      try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" }); } catch { return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2)); renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.setSize(L, A, false); renderer.domElement.style.width = L + "px"; renderer.domElement.style.height = A + "px";
      cena.current.appendChild(renderer.domElement);
      const cn = new THREE.Scene();
      const cam = new THREE.OrthographicCamera(-L / 2, L / 2, A, 0, -500, 500);
      cn.add(new THREE.HemisphereLight(0xffffff, 0x9aa6b6, 1.3));
      const luz = new THREE.DirectionalLight(0xffffff, 2); luz.position.set(-90, 160, 220); cn.add(luz);
      const mundo = new THREE.Group(); mundo.rotation.x = 0.16; cn.add(mundo);
      const std = (c, r = 0.55, m = 0.02) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
      const corM = std(0xff9fbd, 0.45), focM = std(0xffc2d6, 0.5), escuro = std(0x2a1a22, 0.5), branco = std(0xffffff, 0.35, 0);
      const add = (g, m, x, y, z, pai = mundo) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); pai.add(o); return o; };

      // ---- corpo ----
      const pet = new THREE.Group(); mundo.add(pet);              // gira para o lado em que anda
      const corpo = new THREE.Group(); corpo.position.y = 51; pet.add(corpo);  // quique, respiração, esmagar
      const bola = add(new THREE.SphereGeometry(1, 30, 22), corM, 0, 0, 0, corpo); bola.scale.set(36, 31, 34);
      const focinho = add(new THREE.CylinderGeometry(11, 11.5, 9, 22), focM, 0, -5, 33, corpo); focinho.rotation.x = Math.PI / 2;
      add(new THREE.SphereGeometry(1.9, 8, 6), escuro, -4.6, -5, 38, corpo); add(new THREE.SphereGeometry(1.9, 8, 6), escuro, 4.6, -5, 38, corpo);
      const orelhas = [];
      for (const s of [-1, 1]) { const g = new THREE.Group(); g.position.set(s * 20, 24, 6); corpo.add(g); const o = add(new THREE.ConeGeometry(8, 15, 12), corM, 0, 6, 0, g); orelhas.push({ g, s }); o.rotation.z = -s * 0.25; }
      const fenda = add(new THREE.BoxGeometry(22, 3, 6), escuro, 0, 30.2, 0, corpo);
      const rabo = new THREE.Group(); rabo.position.set(0, -1, -33); corpo.add(rabo); const argola = add(new THREE.TorusGeometry(4.5, 1.4, 8, 18), corM, 0, 0, 0, rabo);
      const pernas = [];
      for (const [x, z] of [[-16, 14], [16, 14], [-16, -14], [16, -14]]) { const g = new THREE.Group(); g.position.set(x, 22, z); pet.add(g); add(new THREE.CylinderGeometry(6, 5.5, 16, 14), corM, 0, -8, 0, g); pernas.push(g); }
      // ---- rosto ----
      const olhos = [], sobr = [];
      for (const s of [-1, 1]) {
        const g = new THREE.Group(); g.position.set(s * 13, 9, 29.5); corpo.add(g);
        const globo = add(new THREE.SphereGeometry(6.6, 18, 14), branco, 0, 0, 0, g);
        const pup = add(new THREE.SphereGeometry(3.4, 12, 10), escuro, 0, 0, 4.7, g);
        olhos.push({ g, globo, pup });
        const b = add(new THREE.BoxGeometry(11, 2.4, 2), escuro, s * 13, 19, 30.5, corpo); sobr.push({ b, s });
        const bochecha = add(new THREE.SphereGeometry(4.6, 12, 8), std(0xff6f91, 0.7, 0), s * 24, -3, 22, corpo); bochecha.scale.z = 0.3; bochecha.visible = false; olhos[olhos.length - 1].bochecha = bochecha;
      }
      const curva = (cy, ey) => new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(new THREE.Vector3(-7, ey, 0), new THREE.Vector3(0, cy, 0), new THREE.Vector3(7, ey, 0)), 10, 1.15, 6);
      const bocas = {
        sorriso: add(curva(-17, -9), escuro, 0, -11, 33.2, corpo), reta: add(curva(-13, -13), escuro, 0, -11, 33.2, corpo), triste: add(curva(-6, -14), escuro, 0, -11, 33.2, corpo),
        aberta: add(new THREE.SphereGeometry(1, 14, 10), std(0x5a1424, 0.6, 0), 0, -12, 33.4, corpo),
      };
      bocas.aberta.scale.set(5.5, 4.2, 1.5);
      const lagrima = add(new THREE.SphereGeometry(2.3, 10, 8), std(0x6fb8ff, 0.2, 0), 16, 4, 33, corpo); lagrima.scale.y = 1.5; lagrima.visible = false;
      const baba = add(new THREE.SphereGeometry(2, 8, 6), std(0x9ed4ff, 0.2, 0), 5, -15, 34, corpo); baba.scale.y = 1.6; baba.visible = false;
      const moeda = add(new THREE.CylinderGeometry(6, 6, 1.8, 20), std(0xf2b01e, 0.3, 0.7), 0, 140, 0, pet); moeda.rotation.z = Math.PI / 2; moeda.visible = false;
      // ---- partículas: corações e vapor ----
      const hs = new THREE.Shape(); hs.moveTo(0, -3); hs.bezierCurveTo(-5, 1, -3.5, 5, 0, 2.6); hs.bezierCurveTo(3.5, 5, 5, 1, 0, -3);
      const hGeo = new THREE.ExtrudeGeometry(hs, { depth: 1.2, bevelEnabled: false });
      const coracoes = [], vapor = [];
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(hGeo, std(0xff4f7d, 0.4, 0)); m.visible = false; mundo.add(m); coracoes.push({ m, v: 0, vx: 0 }); }
      for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.SphereGeometry(3, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0 })); m.visible = false; mundo.add(m); vapor.push({ m, v: 0 }); }

      // ---- estado do bichinho ----
      const salvo = lerSalvo();
      const s = { fome: salvo.fome, humor: salvo.humor, ativo: performance.now(), pokes: [], bravoAte: 0, sonoForcado: false, jejum: 0 };
      let W = innerWidth, H = innerHeight, x = 120, y = 400, hx = 120, xmin = 40, xmax = 220, casaFixa = !!salvo.pos;
      let alvo = x, vel = 0, espera = 2, yaw = 0, t = 0, segurando = false, comendo = null, fila = 0, brinc = null, pouso = 0, trab = false, mostrou = false, trabTimer = 0, sacode = 0;
      let px = W / 2, py = H / 2, falaTimer = 0, conversa = 20, pisca = 3, ultimoMood = "neutro";
      const vivo = () => !document.hidden;

      // "chão" do bichinho: em cima da estrada do Busão; sem ela, no pé da tela (acima da barra de abas no celular)
      function chaoY() {
        const road = document.querySelector(".estrada-faixa")?.getBoundingClientRect();
        if (road) return road.top + 4;
        const barra = innerWidth <= 720 ? document.querySelector(".lateral")?.getBoundingClientRect() : null;
        return barra ? barra.top - 2 : innerHeight - 6;
      }
      function medirCasa() {
        W = innerWidth; H = innerHeight;
        const chao = chaoY();
        if (salvo.pos && casaFixa) { hx = limitar(salvo.pos.x, 40, W - 40); y = limitar(salvo.pos.y, A, chao); xmin = Math.max(40, hx - 90); xmax = Math.min(W - 40, hx + 90); }
        else {
          const nav = document.querySelector(".lateral ul"), fim = document.querySelector(".lateral-fim");
          const livre = W > 960 && nav && fim && fim.getBoundingClientRect().top - nav.getBoundingClientRect().bottom > 130;
          if (livre) { hx = 136; y = fim.getBoundingClientRect().top - 14; xmin = 44; xmax = 228; }
          else { hx = 56; y = chao; xmin = 40; xmax = 150; }
        }
        if (!segurando) { x = limitar(x || hx, xmin, xmax); if (!casaFixa) alvo = limitar(alvo, xmin, xmax); }
      }
      medirCasa(); x = hx; alvo = hx;

      function mood() {
        const agora = performance.now(), ocioso = (agora - s.ativo) / 1000;
        if (s.sonoForcado || ocioso > 240) return "dormindo";
        if (s.fome > 112) return "enjoado";
        if (s.fome < 12 || agora < s.bravoAte) return "bravo";
        if (s.fome < 35) return "faminto";
        if (ocioso > 60 || s.humor < 25) return "triste";
        if (s.humor > 65) return "feliz";
        return "neutro";
      }
      function falar(txt, ms = 2600) {
        const b = balao.current; if (!b) return; b.firstChild.textContent = txt; b.classList.add("on");
        clearTimeout(falaTimer); falaTimer = setTimeout(() => b.classList.remove("on"), ms);
      }
      const acordar = () => { s.ativo = performance.now(); if (s.sonoForcado) { s.sonoForcado = false; falar("Bom dia!"); } };
      function salvar() { try { localStorage.setItem(CHAVE, JSON.stringify({ fome: s.fome, humor: s.humor, t: Date.now(), pos: casaFixa ? { x: hx, y } : null })); } catch {} }
      function chover(n) { let k = 0; for (const c of coracoes) if (c.v <= 0 && k < n) { k++; c.v = 1.3; c.m.visible = true; c.m.position.set((Math.random() - 0.5) * 50, 90, 28); c.vx = (Math.random() - 0.5) * 20; } }

      // ---- ações (usadas pelo painel e pelo processamento) ----
      function darMoeda(auto) {
        acordar();
        if (s.fome > 105 && !auto) { sacode = 1; s.humor = Math.max(0, s.humor - 4); falar("Não aguento mais…"); return false; }
        if (comendo) { fila = Math.min(3, fila + 1); return true; }
        comendo = { t: 0, comeu: false, auto }; moeda.visible = true; return true;
      }
      function carinho() { acordar(); s.humor = Math.min(100, s.humor + 7); pouso = 0.6; chover(3); falar(sortear(["Hihi!", "Mais, mais!", "Que gostoso!"])); }
      function brincar() { acordar(); if (s.fome < 15) { falar("Sem comida eu não brinco!"); return; } brinc = { t: 0 }; s.humor = Math.min(100, s.humor + 14); s.fome = Math.max(0, s.fome - 5); chover(2); falar("Uhuuu!"); }
      function dormir() { s.sonoForcado = !s.sonoForcado; if (!s.sonoForcado) s.ativo = performance.now(); falar(s.sonoForcado ? "Zzz…" : "Acordei!"); }
      function voltar() { casaFixa = false; salvo.pos = null; medirCasa(); alvo = hx; try { localStorage.removeItem(CHAVE); } catch {} salvar(); falar("Voltei pro meu cantinho"); }
      ctrl.current = { darMoeda, carinho, brincar, dormir, voltar, acordar };

      // ---- arrastar ----
      const toque = raiz.current.querySelector(".bicho-toque");
      let arr = null;
      const aoDescer = (e) => { acordar(); arr = { x: e.clientX, y: e.clientY, mov: false, id: e.pointerId }; toque.setPointerCapture?.(e.pointerId); e.preventDefault(); };
      const aoMover = (e) => {
        px = e.clientX; py = e.clientY;
        if (!arr || e.pointerId !== arr.id) return;
        if (!arr.mov && Math.hypot(e.clientX - arr.x, e.clientY - arr.y) > 6) { arr.mov = true; segurando = true; setAberto(false); falar(sortear(["Ahh! Me põe no chão!", "Uau, que altura!"]), 1800); }
        if (segurando) { x = limitar(e.clientX, 40, W - 40); y = limitar(e.clientY + 74, A, H - 4); }
      };
      const aoSubir = (e) => {
        if (!arr || e.pointerId !== arr.id) return;
        const foi = arr.mov; arr = null; toque.releasePointerCapture?.(e.pointerId);
        if (foi) {
          segurando = false; pouso = 0.8;
          const chao = chaoY();
          // perto de um canto: encaixa nele
          const perto = (v, m) => v < 110 ? 40 : v > m - 110 ? m - 40 : null;
          const cx = perto(x, W); if (cx !== null && y > chao - 110) { x = cx; y = chao; } else if (cx !== null && y < 150) { y = A; }
          y = Math.min(y, chao); casaFixa = true; salvo.pos = { x, y }; hx = x; xmin = Math.max(40, hx - 90); xmax = Math.min(W - 40, hx + 90); alvo = x; espera = 4; salvar();
          falar("Ufa. Aqui tá bom!", 2000);
        } else {
          const agora = performance.now(); s.pokes = s.pokes.filter((q) => agora - q < 6000); s.pokes.push(agora);
          if (s.pokes.length >= 6) { s.bravoAte = agora + 9000; s.humor = Math.max(0, s.humor - 12); s.pokes = []; sacode = 1; falar("Para de me cutucar!"); }
          else { pouso = 0.4; setAberto((a) => !a); }
        }
      };
      const aoTecla = (e) => { if (e.key === "Escape") setAberto(false); };
      const aoAtividade = (e) => { if (e.type !== "pointermove" || Math.abs(e.movementX || 1) > 0) { if (s.sonoForcado === false) s.ativo = performance.now(); } };
      toque.addEventListener("pointerdown", aoDescer); addEventListener("pointermove", aoMover, { passive: true }); addEventListener("pointerup", aoSubir); addEventListener("pointercancel", aoSubir);
      addEventListener("keydown", aoTecla); addEventListener("pointermove", aoAtividade, { passive: true }); addEventListener("keydown", aoAtividade, { passive: true }); addEventListener("pointerdown", aoAtividade, { passive: true });
      const aoResize = () => medirCasa(); addEventListener("resize", aoResize);

      // ---- processamento do sistema ----
      const aoTrabalho = (ev) => {
        const { n, erro } = ev.detail;
        if (n > 0) { if (!trabTimer && !mostrou) trabTimer = setTimeout(() => { trabTimer = 0; mostrou = true; trab = true; if (!s.sonoForcado) falar(sortear(["Calculando… força!", "Eu vigio daqui!"]), 3000); }, 260); }
        else {
          clearTimeout(trabTimer); trabTimer = 0; trab = false;
          if (erro) { mostrou = false; s.humor = Math.max(0, s.humor - 8); sacode = 1; s.pokes.push(performance.now()); falar("Eita… vamos de novo?"); }
          else if (mostrou) { mostrou = false; s.sonoForcado = false; s.ativo = performance.now(); s.humor = Math.min(100, s.humor + 20); darMoeda(true); falar("Conta feita! Moeda pra mim!", 2800); chover(4); }
        }
      };
      addEventListener("vagabs-trabalho", aoTrabalho);

      // ---- cores por humor ----
      const COR = { neutro: 0xff9fbd, feliz: 0xff9fbd, faminto: 0xf4a79c, triste: 0x9fb6ee, bravo: 0xff5a52, enjoado: 0xa3d68f, dormindo: 0xd9a9c9 };
      const alvoCor = new THREE.Color(), tmp = new THREE.Color(), branca = new THREE.Color(1, 1, 1);
      const angulo = (a, b, k) => { let d = ((b - a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; return a + d * k; };

      let ant = performance.now(), raf = 0, acc = 0, tick = 0;
      function quadro(agora) {
        const dt = Math.min(0.05, (agora - ant) / 1000); ant = agora; t += dt; acc += dt;
        const m = mood();
        // necessidades
        if (vivo()) {
          const ocioso = (agora - s.ativo) / 1000;
          s.fome = Math.max(0, s.fome - dt * 0.06);
          if (ocioso > 60) s.humor = Math.max(10, s.humor - dt * 0.15);
          else if (s.fome < 35) s.humor = Math.max(5, s.humor - dt * 0.06);
          else s.humor = Math.min(100, s.humor + (s.humor < 70 ? dt * 0.05 : 0));
          if (s.fome > 100) s.fome -= dt * 0.25;
        }
        if (m !== ultimoMood) {
          if (m === "faminto") falar(sortear(FALAS.faminto)); else if (m === "bravo") falar(sortear(FALAS.bravo)); else if (m === "triste") falar(sortear(FALAS.triste)); else if (m === "dormindo") falar("Zzz…", 2200);
          ultimoMood = m;
        }
        conversa -= dt; if (conversa <= 0) { conversa = 25 + Math.random() * 25; if (m !== "dormindo" && !trab && !comendo) falar(sortear(FALAS[m] || FALAS.neutro)); }
        // passeio
        if (!segurando) {
          espera -= dt;
          if (espera <= 0 && !comendo && !brinc && m !== "dormindo") { espera = (m === "triste" ? 7 : 3) + Math.random() * 5; alvo = xmin + Math.random() * (xmax - xmin); }
          const quer = m === "dormindo" || comendo || brinc ? 0 : (m === "bravo" ? 70 : m === "triste" || m === "enjoado" ? 20 : 38) * Math.sign(alvo - x) * (Math.abs(alvo - x) > 3 ? 1 : 0);
          vel += (quer - vel) * Math.min(1, dt * 4); x = limitar(x + vel * dt, xmin, xmax);
        } else vel = 0;
        const anda = Math.abs(vel) > 4;
        // tronco
        const yawAlvo = segurando ? Math.sin(t * 3) * 0.3 : anda ? Math.sign(vel) * 0.75 : limitar((px - x) / 900, -0.35, 0.35);
        yaw = angulo(yaw, yawAlvo, Math.min(1, dt * 6)); pet.rotation.y = yaw;
        let sy = 1 + Math.sin(t * (m === "dormindo" ? 1.2 : 2.4)) * 0.018, sx = 1, qy = 0, rotz = 0;
        if (m === "triste") { sy *= 0.93; qy = -2; } if (m === "faminto") { sy *= 0.95; qy = -1.5; sx = 1 + Math.sin(t * 22) * 0.012; }
        if (m === "bravo") { rotz = Math.sin(t * 38) * 0.03; } if (m === "enjoado") { rotz = Math.sin(t * 5) * 0.07; }
        if (anda) qy += Math.abs(Math.sin(t * 9)) * 3;
        if (m === "feliz" && !anda && !comendo) qy += Math.max(0, Math.sin(t * 3)) * 5;
        if (pouso > 0) { pouso -= dt; const k = Math.sin(Math.max(0, pouso) * 9) * Math.min(1, pouso * 3); sy *= 1 - k * 0.15; sx *= 1 + k * 0.1; qy += Math.max(0, k) * 6; }
        if (sacode > 0) { sacode -= dt * 1.6; rotz += Math.sin(t * 50) * 0.1 * sacode; }
        if (brinc) { brinc.t += dt; const u = brinc.t / 1.0; qy += Math.sin(Math.min(1, u) * Math.PI) * 38; corpo.rotation.x = Math.min(1, u) * Math.PI * 2; if (u >= 1) { brinc = null; corpo.rotation.x = 0; } }
        // comer: moeda cai na fenda, depois mastiga
        let mastiga = 0;
        if (comendo) {
          comendo.t += dt;
          if (comendo.t < 0.6) { moeda.position.y = 136 - (136 - 84) * (comendo.t / 0.6) ** 2; moeda.position.x = 0; moeda.rotation.y = t * 12; }
          else {
            if (!comendo.comeu) { comendo.comeu = true; moeda.visible = false; s.fome = Math.min(130, s.fome + (comendo.auto ? 38 : 26)); s.humor = Math.min(100, s.humor + 8); if (!comendo.auto) falar(sortear(["Nham!", "Moeda boa!", "Delícia!"])); chover(2); }
            mastiga = Math.sin((comendo.t - 0.6) * 18);
          }
          if (comendo.t > 1.7) { comendo = null; if (fila > 0) { fila--; comendo = { t: 0, comeu: false, auto: false }; moeda.visible = true; } }
        }
        if (mastiga) { sy *= 1 - Math.abs(mastiga) * 0.05; sx *= 1 + Math.abs(mastiga) * 0.05; }
        corpo.position.y = 51 + qy; corpo.scale.set(sx * (1 + (limitar(s.fome, 0, 110) - 60) / 700), sy, sx); corpo.rotation.z = rotz;
        pernas.forEach((g, i) => { g.rotation.x = segurando ? Math.sin(t * 7 + i) * 0.5 : anda ? Math.sin(t * 9 + (i % 2) * Math.PI) * 0.7 : 0; g.position.y = segurando ? 18 : 22; });
        rabo.rotation.z = Math.sin(t * (m === "feliz" ? 14 : 3)) * (m === "triste" || m === "dormindo" ? 0.1 : 0.7);
        orelhas.forEach(({ g, s: lado }) => { g.rotation.z = lado * (m === "triste" || m === "faminto" ? 0.55 : m === "bravo" ? -0.2 : 0.12 + Math.sin(t * 2 + lado) * 0.05); });
        // rosto
        const gx = limitar((px - x) / 220, -1, 1), gy = limitar(((y - 50) - py) / 220, -1, 1);
        pisca -= dt; if (pisca < -0.12) pisca = 2.5 + Math.random() * 3.5;
        const fechado = m === "dormindo" ? 0.08 : m === "feliz" || (comendo && comendo.comeu) ? 0.3 : pisca < 0 ? 0.08 : segurando ? 1.3 : m === "bravo" ? 0.7 : m === "triste" ? 0.75 : 1;
        for (const o of olhos) { o.globo.scale.y += (fechado - o.globo.scale.y) * Math.min(1, dt * 16); o.pup.position.set(gx * 2.6, gy * 2.4, 4.7); o.bochecha.visible = m === "feliz" || (comendo && comendo.comeu); }
        for (const { b, s: lado } of sobr) {
          const ang = m === "bravo" ? -lado * 0.5 : m === "triste" ? lado * 0.4 : m === "faminto" ? lado * 0.25 : m === "enjoado" ? lado * 0.3 : 0;
          b.rotation.z = ang; b.position.y = 19 + (m === "feliz" ? 2 : 0); b.visible = m !== "dormindo";
        }
        const boca = segurando || mastiga || (m === "faminto" && Math.sin(t * 2.5) > 0.2) ? "aberta" : m === "feliz" || (comendo && comendo.comeu) ? "sorriso" : m === "triste" || m === "bravo" ? "triste" : "reta";
        for (const k in bocas) bocas[k].visible = k === boca;
        if (boca === "aberta") bocas.aberta.scale.y = 3 + (mastiga ? Math.abs(mastiga) * 3 : 1.2 + Math.sin(t * 5) * 0.4);
        lagrima.visible = m === "triste"; if (m === "triste") { const u = (t * 0.7) % 1; lagrima.position.set(16, 4 - u * 22, 33); lagrima.material.opacity = 1; }
        baba.visible = m === "faminto"; if (m === "faminto") baba.position.y = -15 - ((t * 0.6) % 1) * 7;
        // cor do corpo
        alvoCor.set(COR[m] ?? COR.neutro); corM.color.lerp(alvoCor, Math.min(1, dt * 4)); tmp.copy(corM.color).lerp(branca, 0.28); focM.color.copy(tmp);
        // partículas
        for (const c of coracoes) if (c.v > 0) { c.v -= dt; c.m.position.y += 34 * dt; c.m.position.x += c.vx * dt; c.m.rotation.y += dt * 4; c.m.scale.setScalar(Math.min(1, c.v * 2) * 1.2); if (c.v <= 0) c.m.visible = false; }
        if (m === "bravo" && Math.floor(t * 6) !== Math.floor((t - dt) * 6)) { const v = vapor.find((q) => q.v <= 0); if (v) { v.v = 0.8; v.m.visible = true; v.m.position.set((Math.random() < 0.5 ? -1 : 1) * 24, 84, 0); v.m.scale.setScalar(0.5); } }
        for (const v of vapor) if (v.v > 0) { v.v -= dt; v.m.position.y += 36 * dt; v.m.scale.addScalar(dt * 3); v.m.material.opacity = Math.max(0, v.v) * 0.8; if (v.v <= 0) v.m.visible = false; }
        // posição na tela e balão
        raiz.current.style.transform = `translate3d(${Math.round(x - L / 2)}px, ${Math.round(y - (A - PE))}px, 0)`;
        raiz.current.dataset.humor = m;
        renderer.render(cn, cam);
        if (acc > 0.5) { acc = 0; tick++; setInfo((a) => (Math.abs(a.fome - s.fome) > 0.4 || a.mood !== m || Math.abs(a.humor - s.humor) > 0.4 || Math.abs(a.x - x) > 4 ? { fome: s.fome, humor: s.humor, mood: m, x } : a)); if (tick % 20 === 0) salvar(); }
        if (!reduz && vivo()) raf = requestAnimationFrame(quadro); else if (!reduz) raf = setTimeout(() => { ant = performance.now(); raf = requestAnimationFrame(quadro); }, 600);
      }
      if (reduz) quadro(performance.now()); else raf = requestAnimationFrame(quadro);
      setTimeout(() => { if (!morto) falar(s.fome < 35 ? "Voltei… e tô com fome!" : "Oi! Cheguei.", 2600); }, 900);
      const aoSair = () => salvar(); addEventListener("beforeunload", aoSair);

      limpar = () => {
        salvar(); cancelAnimationFrame(raf); clearTimeout(raf); clearTimeout(falaTimer); clearTimeout(trabTimer);
        toque.removeEventListener("pointerdown", aoDescer); removeEventListener("pointermove", aoMover); removeEventListener("pointerup", aoSubir); removeEventListener("pointercancel", aoSubir);
        removeEventListener("keydown", aoTecla); removeEventListener("pointermove", aoAtividade); removeEventListener("keydown", aoAtividade); removeEventListener("pointerdown", aoAtividade);
        removeEventListener("resize", aoResize); removeEventListener("vagabs-trabalho", aoTrabalho); removeEventListener("beforeunload", aoSair);
        renderer.dispose(); renderer.domElement.remove(); ctrl.current = null;
      };
    })();
    return () => { morto = true; limpar(); };
  }, []);

  // fecha o painel ao clicar fora
  useEffect(() => {
    if (!aberto) return;
    const fora = (e) => { if (!raiz.current?.contains(e.target)) setAberto(false); };
    addEventListener("pointerdown", fora); return () => removeEventListener("pointerdown", fora);
  }, [aberto]);

  const c = ctrl.current || {};
  const esq = info.x < 150;
  return (
    <div className="bicho" ref={raiz} data-humor={info.mood}>
      <div className="bicho-cena" ref={cena} aria-hidden="true" />
      <div className="bicho-balao" ref={balao} aria-hidden="true"><span /></div>
      <div className="bicho-toque" role="button" tabIndex={0} aria-label="Cofrinho, o bichinho do sistema. Abrir o painel" aria-expanded={aberto}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberto((a) => !a); } }} />
      {aberto && (
        <div className={"bicho-painel" + (esq ? " esq" : "")} role="dialog" aria-label="Cofrinho">
          <header><b>Cofrinho</b><span className={"humor " + info.mood}>{NOME[info.mood]}</span></header>
          <label className="medidor">Barriguinha<i><u style={{ width: Math.min(100, info.fome) + "%" }} /></i></label>
          <label className="medidor">Humor<i><u className="h" style={{ width: info.humor + "%" }} /></i></label>
          <div className="bicho-acoes">
            <button type="button" className="btn primario" onClick={() => c.darMoeda?.(false)}>Dar moeda</button>
            <button type="button" className="btn" onClick={() => c.carinho?.()}>Carinho</button>
            <button type="button" className="btn" onClick={() => c.brincar?.()}>Brincar</button>
            <button type="button" className="btn" onClick={() => c.dormir?.()}>{info.mood === "dormindo" ? "Acordar" : "Dormir"}</button>
          </div>
          <p>Arraste o Cofrinho para outro canto. Quando uma conta termina, ele ganha moeda sozinho.</p>
          <button type="button" className="btn leve" onClick={() => { c.voltar?.(); setAberto(false); }}>Voltar pro cantinho</button>
        </div>)}
    </div>
  );
}
