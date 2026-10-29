"use client";
// Abertura da área secreta, em três atos:
// 1) carregamento estilo sistema de governo de filme (brasão, barra em blocos, mensagens de verificação)
// 2) chuva de caracteres verdes que vai tomando a tela inteira
// 3) "ACESSO CONCEDIDO" com glitch e a área aparece por trás
// Clique, Enter ou Esc pulam. Com "reduzir movimento" no sistema operacional, não roda.
import { useEffect, useRef, useState } from "react";
import "./cinematico.css";

const MENSAGENS = [
  [0, "Estabelecendo conexão segura com o servidor central"],
  [14, "Verificando credencial do agente"],
  [31, "Autenticando assinatura biométrica"],
  [47, "Consultando base de dados classificada"],
  [63, "Descriptografando arquivos · AES-256"],
  [80, "Validando nível de autorização 3"],
  [94, "Liberando acesso ao terminal 07"],
];
const BLOCOS = 32;
const T_GOV = 3600, T_CHUVA = 2600, T_CONCEDIDO = 1700, T_SAIDA = 450;
const CARACTERES = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン0123456789ABCDEFZ$#%&*+<>=";

// progresso "de filme": avança em arrancos e trava em alguns pontos (tempo em ms -> %)
const PONTOS = [[0, 0], [450, 8], [800, 17], [1450, 19], [1750, 33], [2150, 46], [2750, 48], [2950, 69], [3250, 80], [3420, 93], [3600, 100]];
function progressoEm(t) {
  for (let i = 1; i < PONTOS.length; i++) {
    const [t0, p0] = PONTOS[i - 1], [t1, p1] = PONTOS[i];
    if (t <= t1) return p0 + ((t - t0) / (t1 - t0)) * (p1 - p0);
  }
  return 100;
}

function Chuva({ ativa }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = window.innerWidth, H = window.innerHeight;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px"; ctx.scale(dpr, dpr);
    const tam = W < 600 ? 14 : 18, cols = Math.ceil(W / tam);
    const y = Array.from({ length: cols }, () => -Math.random() * H / tam * 1.5);
    const vel = Array.from({ length: cols }, () => 0.35 + Math.random() * 0.75);
    const ligada = Array.from({ length: cols }, () => Math.random() < 0.15);
    const inicio = performance.now();
    ctx.fillStyle = "#020402"; ctx.fillRect(0, 0, W, H);
    let id;
    const quadro = (agora) => {
      const t = Math.min(1, (agora - inicio) / T_CHUVA);
      // no começo deixa rastro curto; com o tempo quase não apaga, e os caracteres "consomem" a tela
      ctx.fillStyle = `rgba(2, 4, 2, ${0.11 * (1 - t) + 0.012})`;
      ctx.fillRect(0, 0, W, H);
      ctx.font = `${tam}px "JetBrains Mono", ui-monospace, monospace`;
      for (let i = 0; i < cols; i++) {
        if (!ligada[i]) { if (Math.random() < 0.02 + t * 0.25) ligada[i] = true; else continue; }
        const passos = 1 + Math.floor(t * 3); // mais caracteres por quadro conforme avança
        for (let k = 0; k < passos; k++) {
          const ch = CARACTERES[(Math.random() * CARACTERES.length) | 0];
          const py = y[i] * tam;
          ctx.fillStyle = Math.random() < 0.06 ? "#eafff1" : `rgba(61, 220, 140, ${0.55 + Math.random() * 0.45})`;
          ctx.fillText(ch, i * tam, py);
          y[i] += vel[i] * (1 + t * 2.2);
          if (py > H && Math.random() > 0.9 - t * 0.5) y[i] = -Math.random() * 8;
        }
      }
      id = requestAnimationFrame(quadro);
    };
    id = requestAnimationFrame(quadro);
    return () => cancelAnimationFrame(id);
  }, []);
  return <canvas ref={ref} className={"sec-cine-chuva" + (ativa ? "" : " fundo")} aria-hidden="true" />;
}

export default function AcessoCinematico({ aoTerminar }) {
  const [ato, setAto] = useState("gov"); // gov | chuva | concedido | saindo
  const [prog, setProg] = useState(0);
  const terminou = useRef(false);
  const fim = () => { if (!terminou.current) { terminou.current = true; aoTerminar(); } };

  useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { fim(); return; }
    const inicio = performance.now();
    let id;
    const passo = (agora) => { const p = progressoEm(agora - inicio); setProg(p); if (p < 100) id = requestAnimationFrame(passo); };
    id = requestAnimationFrame(passo);
    const ts = [
      setTimeout(() => setAto("chuva"), T_GOV + 350),
      setTimeout(() => setAto("concedido"), T_GOV + 350 + T_CHUVA),
      setTimeout(() => setAto("saindo"), T_GOV + 350 + T_CHUVA + T_CONCEDIDO),
      setTimeout(fim, T_GOV + 350 + T_CHUVA + T_CONCEDIDO + T_SAIDA),
    ];
    const tecla = (e) => (e.key === "Escape" || e.key === "Enter") && fim();
    window.addEventListener("keydown", tecla);
    return () => { cancelAnimationFrame(id); ts.forEach(clearTimeout); window.removeEventListener("keydown", tecla); };
  }, []);

  const msg = [...MENSAGENS].reverse().find(([p]) => prog >= p)?.[1] || MENSAGENS[0][1];
  const cheios = Math.round((prog / 100) * BLOCOS);
  const protocolo = useRef("BR-" + Math.random().toString(16).slice(2, 8).toUpperCase() + "-07").current;

  return (
    <div className={"sec-cine " + ato} onClick={fim} role="presentation" aria-hidden="true">
      {ato === "gov" && (
        <div className="sec-gov">
          <div className="sec-gov-topo"><span>Bureau Secreto · VAGABS</span><span>Divisão de Inteligência Financeira</span></div>
          <div className="sec-gov-centro">
            <div className="sec-gov-brasao"><img src="/logo-secreto.png" alt="" /></div>
            <h1>Sistema Integrado de Inteligência</h1>
            <p className="sec-gov-sub">Acesso restrito · Classificação: ultrassecreto</p>
            <div className="sec-gov-barra">{Array.from({ length: BLOCOS }, (_, i) => <i key={i} className={i < cheios ? "on" : ""} />)}</div>
            <div className="sec-gov-status"><span>{msg}<b className="sec-cursor" /></span><span>{Math.floor(prog)}%</span></div>
            <ul className="sec-gov-log">
              {MENSAGENS.filter(([p]) => prog >= p + 12).slice(-4).map(([, m]) => <li key={m}><span>[ OK ]</span> {m}</li>)}
            </ul>
          </div>
          <div className="sec-gov-rodape"><span>Protocolo {protocolo}</span><span>Toda tentativa de acesso é registrada</span></div>
        </div>)}
      {ato !== "gov" && <Chuva ativa={ato === "chuva"} />}
      {(ato === "concedido" || ato === "saindo") && (
        <div className="sec-cine-concedido">
          <p className="sec-cine-mini">&gt; credencial nível 3 confirmada</p>
          <b data-texto="ACESSO CONCEDIDO">ACESSO CONCEDIDO</b>
          <p className="sec-cine-mini">Bem-vindo, agente.</p>
        </div>)}
      <span className="sec-cine-pular">clique ou Esc para pular</span>
    </div>
  );
}
