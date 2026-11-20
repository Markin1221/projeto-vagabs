"use client";
// Fita de calculadora em 3D (Three.js) para a tela de entrada.
// A fita "sai" da máquina e cai enrolando; os números impressos correm devagar, como na somadora.
// Decorativa: aria-hidden, respeita prefers-reduced-motion (fica parada) e some se não houver WebGL.
import { useEffect, useRef, useState } from "react";

const LINHA = 64; // altura de cada linha impressa no canvas (px)

function valor() {
  const n = Math.random() < 0.15 ? Math.random() * 40000 : Math.random() * 4000;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Imprime a fita num canvas: valores com o sinal à direita, subtotais e totais em vermelho, como a somadora.
function imprimir(tinta, vermelho, papel) {
  const c = document.createElement("canvas");
  c.width = 512; c.height = LINHA * 72;
  const g = c.getContext("2d");
  g.fillStyle = papel; g.fillRect(0, 0, c.width, c.height);
  g.font = '500 30px "JetBrains Mono", ui-monospace, monospace';
  g.textBaseline = "middle";
  let soma = 0;
  for (let i = 0; i < 72; i++) {
    const y = i * LINHA + LINHA / 2;
    const fim = i % 9 === 8;
    if (fim) {
      g.fillStyle = vermelho;
      g.fillText("*", 404, y);
      g.textAlign = "right";
      g.fillText(soma.toLocaleString("pt-BR", { minimumFractionDigits: 2 }), 392, y);
      g.textAlign = "left";
      g.fillRect(150, y - LINHA / 2 + 6, 250, 2);
      soma = 0;
    } else if (i % 9 === 0) {
      g.fillStyle = tinta; g.globalAlpha = 0.45;
      g.fillText("0,00  C", 280, y); g.globalAlpha = 1;
    } else {
      const v = valor(); soma += Number(v.replace(/\./g, "").replace(",", "."));
      const menos = Math.random() < 0.18;
      g.fillStyle = menos ? vermelho : tinta;
      g.textAlign = "right"; g.fillText(v, 392, y); g.textAlign = "left";
      g.fillText(menos ? "−" : "+", 404, y);
    }
  }
  // fibras leves do papel
  g.globalAlpha = 0.05; g.fillStyle = tinta;
  for (let k = 0; k < 900; k++) g.fillRect(Math.random() * 512, Math.random() * c.height, 1 + Math.random() * 3, 1);
  g.globalAlpha = 1;
  return c;
}

// Fita como uma faixa que segue uma curva: desce da máquina e enrola no "chão".
function faixa(THREE, curva, largura, passos) {
  const pos = [], uv = [], idx = [];
  const lado = new THREE.Vector3();
  const acima = new THREE.Vector3(1, 0, 0);
  for (let i = 0; i <= passos; i++) {
    const s = i / passos;
    const p = curva.getPointAt(s), t = curva.getTangentAt(s);
    // leve torção ao longo da fita para não parecer uma régua
    const giro = Math.sin(s * Math.PI * 2.2) * 0.35;
    lado.copy(acima).applyAxisAngle(t, giro).normalize().multiplyScalar(largura / 2);
    pos.push(p.x - lado.x, p.y - lado.y, p.z - lado.z, p.x + lado.x, p.y + lado.y, p.z + lado.z);
    uv.push(0, -s, 1, -s); // v negativo: o texto fica de pé e legível para a câmera
    if (i < passos) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx); geo.computeVertexNormals();
  return geo;
}

export default function FitaSoma3D() {
  const caixa = useRef(null);
  const [falhou, setFalhou] = useState(false);

  useEffect(() => {
    let parar = () => {};
    let vivo = true;
    (async () => {
      const THREE = await import("three");
      try { await document.fonts?.load('500 30px "JetBrains Mono"'); } catch {}
      if (!vivo || !caixa.current) return;
      const el = caixa.current;
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
      } catch { setFalhou(true); return; }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      el.appendChild(renderer.domElement);

      const cena = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);
      camera.position.set(3.6, 0.4, 8.2); camera.lookAt(0.2, -0.6, 0);

      const curva = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.2, 4.6, -1.8),
        new THREE.Vector3(0.0, 3.0, -0.6),
        new THREE.Vector3(0.15, 1.4, 0.2),
        new THREE.Vector3(0.1, 0.0, 0.5),
        new THREE.Vector3(-0.1, -1.3, 0.35),
        new THREE.Vector3(0.0, -2.2, -0.3),
        new THREE.Vector3(0.25, -2.35, -1.15),
        new THREE.Vector3(0.4, -1.75, -1.45),
        new THREE.Vector3(0.45, -1.25, -0.95),
        new THREE.Vector3(0.5, -1.55, -0.45),
        new THREE.Vector3(0.7, -2.3, -0.2),
        new THREE.Vector3(1.1, -2.6, 0.6),
        new THREE.Vector3(1.6, -2.62, 1.6),
      ], false, "catmullrom", 0.5);
      const comprimento = curva.getLength();
      const largura = 1.15;
      const geo = faixa(THREE, curva, largura, 520);

      const tema = () => document.documentElement.dataset.theme === "dark";
      let textura;
      const material = new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0, side: THREE.DoubleSide });
      const pintar = () => {
        const escuro = tema();
        textura?.dispose();
        textura = new THREE.CanvasTexture(imprimir(escuro ? "#1d2833" : "#22303c", "#b3261e", escuro ? "#d9d6c9" : "#fbfaf4"));
        textura.colorSpace = THREE.SRGBColorSpace;
        textura.wrapT = THREE.RepeatWrapping;
        textura.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        // mantém as linhas na proporção certa: comprimento da fita / largura, em "alturas de canvas"
        textura.repeat.set(1, (comprimento / largura) / (textura.image.height / textura.image.width));
        material.map = textura; material.needsUpdate = true;
      };
      pintar();
      const fita = new THREE.Mesh(geo, material);
      const grupo = new THREE.Group(); grupo.add(fita); grupo.position.y = 0.35; cena.add(grupo);

      // sombra suave no chão (um disco com gradiente) — barato, sem shadow map
      const sc = document.createElement("canvas"); sc.width = sc.height = 128;
      const sg = sc.getContext("2d"); const gr = sg.createRadialGradient(64, 64, 4, 64, 64, 64);
      gr.addColorStop(0, "rgba(4,33,27,.38)"); gr.addColorStop(1, "rgba(4,33,27,0)");
      sg.fillStyle = gr; sg.fillRect(0, 0, 128, 128);
      const sombraTex = new THREE.CanvasTexture(sc);
      const sombraMat = new THREE.MeshBasicMaterial({ map: sombraTex, transparent: true, depthWrite: false });
      const sombra = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 3.2), sombraMat);
      sombra.rotation.x = -Math.PI / 2; sombra.position.set(0.7, -2.38, 0.3); cena.add(sombra);

      const ambiente = new THREE.HemisphereLight(0xffffff, 0x0d5c4f, 1.1);
      const sol = new THREE.DirectionalLight(0xffffff, 2.2); sol.position.set(4, 6, 5);
      const contra = new THREE.DirectionalLight(0x5ccab0, 0.8); contra.position.set(-5, 1, -3);
      cena.add(ambiente, sol, contra);
      const luzes = () => { const e = tema(); ambiente.intensity = e ? 0.55 : 1.1; sol.intensity = e ? 1.3 : 2.2; contra.intensity = e ? 1.4 : 0.8; };
      luzes();

      const ajustar = () => {
        const w = el.clientWidth, h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // em telas estreitas afasta a câmera para a fita caber inteira
        camera.position.z = w / h < 0.8 ? 10.5 : w / h > 1.6 ? 7.6 : 8.2;
        camera.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(() => { ajustar(); if (quieto) desenhar(); }); ro.observe(el); ajustar();

      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      let quieto = mq.matches;
      const aoMudarMovimento = (e) => { quieto = e.matches; if (!quieto) laco(); else desenhar(); };
      mq.addEventListener("change", aoMudarMovimento);

      // segue o ponteiro de leve (paralaxe), sem exagero
      let alvoX = 0, alvoY = 0;
      const aoMover = (e) => { alvoX = (e.clientX / window.innerWidth - 0.5); alvoY = (e.clientY / window.innerHeight - 0.5); };
      window.addEventListener("pointermove", aoMover, { passive: true });

      const obs = new MutationObserver(() => { pintar(); luzes(); if (quieto) desenhar(); });
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

      const relogio = new THREE.Clock();
      let quadro = 0;
      const desenhar = () => renderer.render(cena, camera);
      const laco = () => {
        cancelAnimationFrame(quadro);
        if (quieto) { desenhar(); return; }
        const dt = Math.min(relogio.getDelta(), 0.05), t = relogio.elapsedTime;
        textura.offset.y -= dt * 0.018; // papel saindo da máquina
        grupo.rotation.y += ((alvoX * 0.35 + Math.sin(t * 0.25) * 0.12) - grupo.rotation.y) * 0.04;
        grupo.rotation.x += ((alvoY * 0.12) - grupo.rotation.x) * 0.04;
        grupo.position.y = 0.35 + Math.sin(t * 0.6) * 0.04;
        desenhar();
        quadro = requestAnimationFrame(laco);
      };
      relogio.start(); laco();

      parar = () => {
        cancelAnimationFrame(quadro);
        ro.disconnect(); obs.disconnect();
        mq.removeEventListener("change", aoMudarMovimento);
        window.removeEventListener("pointermove", aoMover);
        geo.dispose(); material.dispose(); textura?.dispose();
        sombra.geometry.dispose(); sombraMat.dispose(); sombraTex.dispose();
        renderer.dispose(); renderer.domElement.remove();
      };
    })().catch(() => setFalhou(true));
    return () => { vivo = false; parar(); };
  }, []);

  return <div ref={caixa} className={"fita3d" + (falhou ? " sem-webgl" : "")} aria-hidden="true" />;
}
