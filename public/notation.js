// Interpreta um lance digitado (SAN em inglês ou português, ou coordenadas tipo e2e4).
const PT = { C: 'N', T: 'R', D: 'Q', R: 'K', B: 'B' };
const strip = (s) => s.replace(/[+#!?]/g, '');

// retorna o lance (objeto verbose do chess.js) ou null
export function parseMoveInput(chess, raw, pt = false) {
  let t = String(raw || '').trim().replace(/\s+/g, '');
  if (!t) return null;
  t = t.replace(/0-0-0/gi, 'O-O-O').replace(/0-0/gi, 'O-O').replace(/o-o-o/gi, 'O-O-O').replace(/o-o/gi, 'O-O');
  const legal = chess.moves({ verbose: true });

  // coordenadas: e2e4, e2-e4, e7e8q
  const u = t.toLowerCase().match(/^([a-h][1-8])-?([a-h][1-8])([qrbn])?$/);
  if (u) {
    const exact = legal.find((m) => m.from === u[1] && m.to === u[2] && (m.promotion || '') === (u[3] || ''));
    return exact || (!u[3] ? legal.find((m) => m.from === u[1] && m.to === u[2] && m.promotion === 'q') || null : null);
  }

  t = strip(t);
  if (pt) {
    if (PT[t[0]]) t = PT[t[0]] + t.slice(1);
    t = t.replace(/=?([CTDR])$/, (_, p) => '=' + PT[p]);
  }
  t = t.replace(/^([a-h]x?[a-h]?[18])([qrbn])$/i, (_, a, p) => `${a}=${p.toUpperCase()}`); // e8Q -> e8=Q
  t = t.replace(/=([qrbn])$/, (_, p) => '=' + p.toUpperCase());
  const cands = [t, t[0].toUpperCase() + t.slice(1)]; // nf3 -> Nf3, bc4 -> Bc4
  for (const c of cands) {
    const m = legal.find((x) => strip(x.san) === c);
    if (m) return m;
  }
  return null;
}
