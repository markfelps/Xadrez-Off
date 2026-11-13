// Lógica pura (sem DOM) — testável em Node.

export const ELO_MIN = 400;
export const ELO_MAX = 3650; // força estimada do Stockfish completo
export const SF_MIN_ELO = 1320; // limite inferior do UCI_Elo do Stockfish
export const SF_MAX_ELO = 3190; // limite superior do UCI_Elo do Stockfish

export function expectedScore(me, opp) {
  return 1 / (1 + Math.pow(10, (opp - me) / 400));
}

export function kFactor(games, rating) {
  if (games < 30) return 40;
  if (rating >= 2400) return 10;
  return 20;
}

// score: 1 vitória, 0.5 empate, 0 derrota
export function updateRating(state, oppElo, score) {
  const k = kFactor(state.games, state.rating);
  const delta = Math.round(k * (score - expectedScore(state.rating, oppElo)));
  const rating = Math.max(100, state.rating + delta);
  return {
    ...state,
    rating,
    games: state.games + 1,
    peak: Math.max(state.peak, rating),
    wins: state.wins + (score === 1 ? 1 : 0),
    draws: state.draws + (score === 0.5 ? 1 : 0),
    losses: state.losses + (score === 0 ? 1 : 0),
    delta,
  };
}

export const newPlayer = () => ({ rating: 1200, games: 0, peak: 1200, wins: 0, draws: 0, losses: 0, delta: 0 });

// Como transformar um "Elo" do adversário em configuração do motor.
//  <1320      : Stockfish a 1320 + chance de lance aleatório
//  1320–3190  : UCI_LimitStrength calibrado do Stockfish
//  3191–3499  : força total do motor lite, tempo de pensamento crescente
//  >=3500     : motor completo (rede neural grande), pensando cada vez mais
// Acima de 3190 os números são nominais (não existe calibração humana).
export function enginePlan(elo) {
  elo = Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round(elo)));
  if (elo < SF_MIN_ELO) {
    return {
      engine: 'lite', limit: true, uciElo: SF_MIN_ELO, movetime: 400,
      randomP: Math.min(0.9, ((SF_MIN_ELO - elo) / 900) * 0.9),
    };
  }
  if (elo <= SF_MAX_ELO) {
    return { engine: 'lite', limit: true, uciElo: elo, movetime: 800, randomP: 0 };
  }
  if (elo < 3500) {
    return { engine: 'lite', limit: false, uciElo: null, movetime: 600 + (elo - SF_MAX_ELO) * 8, randomP: 0 };
  }
  return { engine: 'full', limit: false, uciElo: null, movetime: 1500 + (elo - 3500) * 25, randomP: 0 };
}

export function levelName(elo) {
  if (elo < 1000) return 'Iniciante';
  if (elo < 1400) return 'Casual';
  if (elo < 1800) return 'Clube';
  if (elo < 2200) return 'Forte de clube';
  if (elo < 2500) return 'Mestre';
  if (elo < 2800) return 'Grande Mestre';
  if (elo <= SF_MAX_ELO) return 'Elite mundial';
  if (elo < 3500) return 'Sobre-humano';
  return 'Impossível';
}

// Modo escada: adversário um pouco acima do jogador.
export function ladderOpponent(playerRating, step = 100) {
  return Math.max(ELO_MIN, Math.min(ELO_MAX, Math.round((playerRating + step) / 50) * 50));
}

// ---------- avaliação / revisão ----------
export const HINT_COST = [5, 5]; // etapa 1 (peça), etapa 2 (casa de destino)

// win% (fórmula do Lichess) a partir de centipeões do ponto de vista de quem avalia
export function winPct(cp) { return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1); }
export function moveAccuracy(loss) { return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669)); }
export function classifyLoss(loss) { return loss >= 20 ? 'blunder' : loss >= 10 ? 'mistake' : loss >= 5 ? 'inaccuracy' : 'ok'; }
export const CLS_LABEL = { blunder: 'Erro grave', mistake: 'Erro', inaccuracy: 'Imprecisão', ok: 'Bom lance' };

// score UCI -> centipeões (mate vira ±(10000 - 10*lances))
export function scoreToCp(type, val) {
  if (type === 'cp') return val;
  return val > 0 ? 10000 - val * 10 : -(10000 + val * 10);
}

// evals: cp do ponto de vista das brancas, uma por posição (n lances => n+1 valores)
export function summarizeGame(evals, firstMover, userColor) {
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const moves = [];
  let mover = firstMover;
  for (let k = 0; k < evals.length - 1; k++) {
    const wb = winPct(evals[k]), wa = winPct(evals[k + 1]);
    const before = mover === 'w' ? wb : 100 - wb;
    const after = mover === 'w' ? wa : 100 - wa;
    const loss = Math.max(0, before - after);
    moves.push({ k, mover, wpBefore: before, wpAfter: after, loss, cls: classifyLoss(loss), acc: moveAccuracy(loss) });
    mover = other(mover);
  }
  const avg = (c) => { const a = moves.filter((m) => m.mover === c); return a.length ? a.reduce((s, m) => s + m.acc, 0) / a.length : null; };
  const counts = { blunder: 0, mistake: 0, inaccuracy: 0 };
  for (const m of moves) if (m.mover === userColor && counts[m.cls] !== undefined) counts[m.cls]++;
  return { moves, accUser: avg(userColor), accOpp: avg(other(userColor)), counts };
}

// lances do usuário que valem puzzle: erro de ≥15% de win% numa posição que ainda não estava perdida
export function pickPuzzles(summary, userColor, max = 5) {
  return summary.moves
    .filter((m) => m.mover === userColor && m.loss >= 15 && m.wpBefore >= 30)
    .sort((a, b) => b.loss - a.loss)
    .slice(0, max);
}

// ---------- posições prontas ----------
export const STANDARD_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
export const PRESET_POSITIONS = [
  { name: 'Rei e dama contra rei (mate)', fen: '8/8/8/4k3/8/8/3K4/6Q1 w - - 0 1' },
  { name: 'Rei e torre contra rei (mate)', fen: '8/8/8/4k3/8/8/3K4/7R w - - 0 1' },
  { name: 'Rei e peão contra rei (oposição)', fen: '8/8/8/4k3/8/4K3/4P3/8 w - - 0 1' },
  { name: 'Final de torres: Lucena', fen: '1K1k4/1P6/8/8/8/8/r7/2R5 w - - 0 1' },
  { name: 'Dois bispos contra rei', fen: '8/8/8/4k3/8/8/3K4/4BB2 w - - 0 1' },
  { name: 'Vantagem: pretas sem dama', fen: 'rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1' },
  { name: 'Vantagem: pretas sem torre da dama', fen: '1nbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQk - 0 1' },
  { name: 'Desvantagem: brancas sem dama', fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNB1KBNR w KQkq - 0 1' },
  { name: 'Siciliana (1.e4 c5)', fen: 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2' },
  { name: 'Gambito da Dama (1.d4 d5 2.c4)', fen: 'rnbqkbnr/ppp1pppp/8/3p4/2PP4/8/PP2PPPP/RNBQKBNR b KQkq - 0 2' },
];

// ---------- relógio ----------
export const UNDO_COST = 5;
// [id, rótulo, minutos, incremento em s]
export const CLOCK_PRESETS = [
  ['none', 'Sem relógio', 0, 0], ['1+0', '1 min', 1, 0], ['3+2', '3 min + 2s', 3, 2], ['5+0', '5 min', 5, 0],
  ['10+0', '10 min', 10, 0], ['15+10', '15 min + 10s', 15, 10], ['30+0', '30 min', 30, 0], ['custom', 'Personalizado…', 0, 0],
];

// retorna null (sem relógio) ou { minMs, incMs, engMs }
export function clockConfig(preset, c = {}) {
  if (preset === 'none') return null;
  if (preset === 'custom') {
    const min = Math.max(0.1, +c.min || 10);
    const inc = Math.max(0, +c.inc || 0);
    const eng = Math.max(0.1, +c.engMin || min);
    return { minMs: Math.round(min * 60000), incMs: Math.round(inc * 1000), engMs: Math.round(eng * 60000) };
  }
  const p = CLOCK_PRESETS.find((x) => x[0] === preset);
  if (!p) return null;
  return { minMs: p[2] * 60000, incMs: p[3] * 1000, engMs: p[2] * 60000 };
}

export function formatClock(ms) {
  ms = Math.max(0, ms);
  if (ms < 10000) return '0:' + (ms / 1000).toFixed(1).padStart(4, '0');
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// tempo de pensamento do computador, limitado pelo que resta no relógio dele
export function engineMovetime(planMs, remainingMs, incMs = 0) {
  if (remainingMs == null) return planMs;
  return Math.max(50, Math.min(planMs, Math.round(remainingMs * 0.05 + incMs * 0.7)));
}

// nível médio do computador numa partida em que o nível mudou (média dos níveis usados em cada lance dele)
export function meanLevel(levels, fallback) {
  return levels.length ? Math.round(levels.reduce((s, v) => s + v, 0) / levels.length) : fallback;
}

// ---------- classificação de lances estilo Chess.com ----------
export const MOVE_CLASSES = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
export const MOVE_LABEL = {
  brilliant: 'Brilhante', great: 'Ótimo', best: 'Melhor', excellent: 'Excelente', good: 'Bom', book: 'Teoria',
  inaccuracy: 'Imprecisão', mistake: 'Erro', miss: 'Chance perdida', blunder: 'Erro grave',
};
export const MOVE_SYMBOL = { brilliant: '!!', great: '!', best: '★', excellent: '✓', good: '✓', book: '📖', inaccuracy: '?!', mistake: '?', miss: '✕', blunder: '??' };
export const BAD_CLASSES = ['inaccuracy', 'mistake', 'miss', 'blunder'];

// m: { loss, wpBefore, wpAfter }; ctx: { isBest, isBook, sacrifice, gap (win% entre o 1º e o 2º melhor), prevOppLoss }
export function classifyMove(m, ctx = {}) {
  const { loss, wpBefore, wpAfter } = m;
  if (ctx.sacrifice && (ctx.isBest || loss <= 1) && loss <= 2 && wpBefore <= 80 && wpAfter >= 40) return 'brilliant';
  if (ctx.isBook && loss < 10) return 'book';
  if (ctx.isBest && ctx.gap != null && ctx.gap >= 15 && wpBefore >= 20 && wpBefore <= 85) return 'great';
  if (ctx.isBest || loss < 0.8) return 'best';
  if (loss < 2.5) return 'excellent';
  if (loss < 5) return 'good';
  if ((ctx.prevOppLoss || 0) >= 12 && loss >= 8 && wpBefore >= 60) return 'miss';
  if (loss < 10) return 'inaccuracy';
  if (loss < 20) return 'mistake';
  return 'blunder';
}

// fase da partida: abertura (primeiros 10 lances de cada lado), final (pouco material pesado) ou meio-jogo
const PIECE_VAL = { q: 9, r: 5, b: 3, n: 3 };
export function heavyMaterial(fen) {
  let t = 0;
  for (const ch of fen.split(' ')[0]) { const v = PIECE_VAL[ch.toLowerCase()]; if (v) t += v; }
  return t;
}
export function phaseOf(ply, fen) {
  if (ply < 20) return 'opening';
  return heavyMaterial(fen) <= 26 ? 'endgame' : 'middlegame';
}
export const PHASE_LABEL = { opening: 'Abertura', middlegame: 'Meio-jogo', endgame: 'Final' };

// saldo de material (peões inclusos) do ponto de vista de `color`
const MAT = { p: 1, n: 3, b: 3, r: 5, q: 9 };
export function materialBalance(fen, color) {
  let s = 0;
  for (const ch of fen.split(' ')[0]) {
    const v = MAT[ch.toLowerCase()];
    if (!v) continue;
    const white = ch === ch.toUpperCase();
    s += (white === (color === 'w') ? 1 : -1) * v;
  }
  return s;
}

// ---------- handicap de material ----------
export const HANDICAPS = [
  { id: 'none', label: 'Sem handicap' },
  { id: 'p', label: 'sem um peão (f)', pts: 1 },
  { id: 'n', label: 'sem um cavalo', pts: 3 },
  { id: 'b', label: 'sem um bispo', pts: 3 },
  { id: 'r', label: 'sem uma torre', pts: 5 },
  { id: 'q', label: 'sem a dama', pts: 9 },
];
// posição inicial sem uma peça de `side` ('w'|'b'); tira também o direito de roque se a torre sumir
export function handicapFen(side, piece) {
  const rows = ['rnbqkbnr', 'pppppppp', '8', '8', '8', '8', 'PPPPPPPP', 'RNBQKBNR'];
  const idx = side === 'w' ? 7 : 0, pr = side === 'w' ? 6 : 1;
  const set = (i, f, ch) => { const a = []; for (const c of rows[i].replace(/\d/g, (d) => '1'.repeat(+d))) a.push(c); a[f] = ch; rows[i] = a.join('').replace(/1+/g, (m) => m.length); };
  let castle = 'KQkq';
  if (piece === 'q') set(idx, 3, '1');
  else if (piece === 'r') { set(idx, 0, '1'); castle = castle.replace(side === 'w' ? 'Q' : 'q', ''); }
  else if (piece === 'b') set(idx, 5, '1');
  else if (piece === 'n') set(idx, 1, '1');
  else if (piece === 'p') set(pr, 5, '1');
  return `${rows.join('/')} w ${castle || '-'} - 0 1`;
}
