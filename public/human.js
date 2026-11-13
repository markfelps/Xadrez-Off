// Modo humano: em vez de jogar o melhor lance, o computador escolhe entre os melhores candidatos
// como uma pessoa faria — busca rasa (horizonte curto), preferência por capturas/xeques/recapturas,
// descuidos ocasionais, tempo de reflexão variável e desistência quando a posição é perdida.
import { Chess } from './vendor/chess.js';

export const HUMAN_MAX = 2850; // acima disso o motor completo joga normalmente
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export function humanParams(elo) {
  const e = clamp(elo, 400, HUMAN_MAX);
  return {
    elo: e,
    depth: clamp(Math.round(1 + (e - 500) / 200), 1, 14), // profundidade da busca: quanto mais fraco, mais míope
    multipv: 6,
    temp: clamp(30 + (2400 - e) * 0.10 + Math.max(0, 1800 - e) * 0.12, 12, 400), // "ruído" em centipeões entre lances parecidos
    oversight: clamp(((2300 - e) / 2300) * 0.16 + (Math.max(0, 1400 - e) / 1400) * 0.12, 0, 0.26), // chance de um descuido (lance razoável, mas não o melhor)
    oversightLoss: e < 1200 ? 400 : 260,                    // tamanho máximo do descuido (centipeões)
    bias: clamp((2400 - e) / 1600, 0.3, 1),                // força da preferência por lances "naturais"
  };
}

// candidatos: [{ uci, cp }] ordenados do melhor para o pior (cp do ponto de vista de quem joga)
export function chooseHuman(cands, chess, prm, rnd = Math.random) {
  const list = [];
  const seen = new Set();
  for (const c of cands) if (!seen.has(c.uci)) { seen.add(c.uci); list.push(c); }
  if (list.length <= 1) return { uci: list[0].uci, loss: 0, oversight: false };
  const best = list[0].cp;
  const hist = chess.history({ verbose: true });
  const last = hist[hist.length - 1];
  const ply = hist.length;
  const info = list.map((c) => {
    const m = chess.moves({ verbose: true }).find((x) => x.from + x.to + (x.promotion || '') === c.uci);
    return { ...c, loss: Math.max(0, best - c.cp), m };
  });

  // descuido: ignora a ordem do motor e joga um lance que "parece razoável"
  if (rnd() < prm.oversight) {
    const ok = info.filter((c) => c.loss > 0 && c.loss <= prm.oversightLoss && c.cp > -9000);
    if (ok.length) { const c = ok[Math.floor(rnd() * ok.length)]; return { uci: c.uci, loss: c.loss, oversight: true }; }
  }

  const w = info.map((c) => {
    let b = 1;
    const m = c.m;
    if (m) {
      if (m.captured) b *= 1.35;
      if (/[+#]$/.test(m.san)) b *= 1.25;
      if (m.captured && last && m.to === last.to) b *= 1.6;                 // recaptura
      if (m.san.startsWith('O-O') && ply < 30) b *= 1.4;                     // roque
      if (m.promotion) b *= 2;
      if (m.piece === 'q' && !m.captured && ply < 12) b *= 0.5;              // dama cedo demais
      const dir = m.color === 'w' ? 1 : -1;
      if (!m.captured && m.piece !== 'p' && (+m.to[1] - +m.from[1]) * dir < 0) b *= 0.75; // recuo
    }
    return Math.exp(-c.loss / prm.temp) * Math.pow(b, prm.bias);
  });
  const tot = w.reduce((s, x) => s + x, 0);
  let r = rnd() * tot;
  for (let i = 0; i < info.length; i++) { r -= w[i]; if (r <= 0) return { uci: info[i].uci, loss: info[i].loss, oversight: false }; }
  return { uci: info[0].uci, loss: 0, oversight: false };
}

// tempo de reflexão: rápido em lances óbvios (recaptura, só um lance bom), mais longo em posições complicadas
export function humanDelay(cands, chess, prm, clockMs = null, rnd = Math.random) {
  const hist = chess.history({ verbose: true });
  const last = hist[hist.length - 1];
  const best = cands[0].cp;
  const near = cands.filter((c) => best - c.cp <= 40).length;
  const only = cands.filter((c) => best - c.cp <= 120).length <= 1;
  const recap = last && last.captured && cands[0].uci.slice(2, 4) === last.to;
  let ms;
  if (only || recap || hist.length < 8) ms = 450 + rnd() * 700;
  else ms = 700 + near * 330 + rnd() * 1400;
  if (prm.elo > 2200) ms *= 0.8;
  if (clockMs != null && clockMs < 20000) ms *= 0.35;
  return Math.round(Math.min(ms, 4500));
}

// desiste quando está claramente perdido por vários lances seguidos (como gente), só abaixo do nível mestre
export function shouldResign(evals, prm) {
  if (prm.elo >= 2600 || evals.length < 3) return false;
  const last3 = evals.slice(-3);
  const threshold = prm.elo < 1400 ? -1100 : -900;
  return last3.every((cp) => cp <= threshold);
}
