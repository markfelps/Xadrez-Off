import { Chess } from './vendor/chess.js';
import { getEngine } from './engine.js';
import { summarizeGame, pickPuzzles, winPct, CLS_LABEL } from './logic.js';
import { drawBoard } from './board.js';
import { S, save, orientFlipped } from './store.js';
import { copyText } from './util.js';

const $ = (id) => document.getElementById(id);
const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

export function replay(game) {
  const c = game.startFen ? new Chess(game.startFen) : new Chess();
  const fens = [c.fen()], sans = [];
  for (const u of game.moves) { sans.push(c.move(parse(u)).san); fens.push(c.fen()); }
  return { fens, sans, firstMover: fens[0].split(' ')[1] };
}

// analisa todas as posições da partida (motor leve, força total) e guarda no registro
export async function analyzeGame(game, onProgress = () => {}) {
  if (game.review) return game.review;
  const { fens } = replay(game);
  const eng = getEngine('lite');
  const evals = [], best = [];
  for (let i = 0; i < fens.length; i++) {
    const c = new Chess(fens[i]);
    let cpW = 0, b = null;
    if (c.isCheckmate()) cpW = c.turn() === 'w' ? -10000 : 10000;
    else if (c.isDraw()) cpW = 0;
    else {
      const r = await eng.analyze(fens[i], 150);
      cpW = c.turn() === 'w' ? r.cp : -r.cp;
      b = r.best;
    }
    evals.push(cpW); best.push(b);
    onProgress(i + 1, fens.length);
  }
  game.review = { evals, best };
  save();
  return game.review;
}

// puzzles só das partidas perdidas
function savePuzzles(game, fens, summary) {
  if (game.score !== 0 || game.puzzled) return 0;
  game.puzzled = true;
  let n = 0;
  for (const m of pickPuzzles(summary, game.color)) {
    const best = game.review.best[m.k];
    if (!best) continue;
    S.puzzles.push({ id: `${game.id}-${m.k}`, fen: fens[m.k], best, bestWp: m.wpBefore, color: game.color, played: game.moves[m.k], loss: Math.round(m.loss), solved: 0, fails: 0 });
    n++;
  }
  save();
  return n;
}

export function pgnOf(game) {
  const c = game.startFen ? new Chess(game.startFen) : new Chess();
  for (const u of game.moves) c.move(parse(u));
  return c.pgn();
}

export async function openReview(game, { onPlay, onPuzzles, onConsult }) {
  const rv = $('review');
  rv.hidden = false;
  $('rvSummary').textContent = '';
  $('rvInfo').textContent = '';
  $('rvProg').textContent = 'Analisando partida…';
  $('rvClose').onclick = () => { rv.hidden = true; };
  const { fens, sans, firstMover } = replay(game);
  let a;
  try {
    a = await analyzeGame(game, (i, n) => { $('rvProg').textContent = `Analisando partida… ${i}/${n}`; });
  } catch (e) { $('rvProg').textContent = 'Erro na análise: ' + e.message; return; }
  const sum = summarizeGame(a.evals, firstMover, game.color);
  const added = savePuzzles(game, fens, sum);
  onPuzzles && onPuzzles();
  $('rvProg').textContent = '';
  const f = (v) => (v == null ? '–' : v.toFixed(0) + '%');
  $('rvSummary').innerHTML =
    `<div>Precisão <b>você ${f(sum.accUser)}</b> · computador ${f(sum.accOpp)}</div>` +
    `<div>${sum.counts.blunder} erros graves · ${sum.counts.mistake} erros · ${sum.counts.inaccuracy} imprecisões</div>` +
    (added ? `<div class="good">+${added} puzzle(s) criado(s) a partir desta derrota</div>` : '');

  const n = game.moves.length;
  const flipped = orientFlipped(game.color);
  let ri = Math.max(0, sum.moves.findIndex((m) => m.mover === game.color && (m.cls === 'blunder' || m.cls === 'mistake')));
  if (ri < 0) ri = 0;

  function chart() {
    const W = 300, H = 80;
    const pts = a.evals.map((e, i) => `${(i / Math.max(1, n)) * W},${H - (winPct(e) / 100) * H}`);
    const x = (ri / Math.max(1, n)) * W;
    $('rvChart').innerHTML =
      `<rect width="${W}" height="${H}" fill="#2a2e39"/>` +
      `<polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="#e8e9ee" opacity=".85"/>` +
      `<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#888" stroke-dasharray="3"/>` +
      sum.moves.filter((m) => m.mover === game.color && (m.cls === 'blunder' || m.cls === 'mistake'))
        .map((m) => `<circle cx="${(m.k / Math.max(1, n)) * W}" cy="${H - (winPct(a.evals[m.k]) / 100) * H}" r="3" fill="${m.cls === 'blunder' ? '#ff5252' : '#ffb74d'}"/>`).join('') +
      `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#4f8cff" stroke-width="2"/>`;
  }

  function show() {
    const c = new Chess(fens[ri]);
    const mv = ri < n ? sum.moves[ri] : null;
    const marks = {};
    let info = ri === n ? 'Fim da partida.' : '';
    if (mv) {
      const who = mv.mover === game.color ? 'Você jogou' : 'Computador jogou';
      const num = Math.floor((ri + (firstMover === 'b' ? 1 : 0)) / 2) + 1;
      info = `${num}${mv.mover === 'w' ? '.' : '...'} ${sans[ri]} — ${who}: <b class="c-${mv.cls}">${CLS_LABEL[mv.cls]}</b>` + (mv.loss >= 5 ? ` (−${mv.loss.toFixed(0)}%)` : '');
      const b = a.best[ri];
      if (b && mv.cls !== 'ok' && b !== game.moves[ri]) {
        const t = new Chess(fens[ri]);
        try { info += `<br>Melhor era <b>${t.move(parse(b)).san}</b>`; } catch {}
        marks[b.slice(0, 2)] = 'hintFrom'; marks[b.slice(2, 4)] = 'hintTo';
      }
      const p = game.moves[ri];
      marks[p.slice(0, 2)] = marks[p.slice(0, 2)] || 'bad';
      marks[p.slice(2, 4)] = marks[p.slice(2, 4)] || 'bad';
    }
    const lastU = ri > 0 ? game.moves[ri - 1] : null;
    drawBoard($('rvBoard'), c.board(), { flipped, last: lastU && [lastU.slice(0, 2), lastU.slice(2, 4)], marks });
    $('rvInfo').innerHTML = info;
    chart();
  }

  const go = (v) => { ri = Math.max(0, Math.min(n, v)); show(); };
  $('rvFirst').onclick = () => go(0);
  $('rvPrev').onclick = () => go(ri - 1);
  $('rvNext').onclick = () => go(ri + 1);
  $('rvLast').onclick = () => go(n);
  $('rvNextErr').onclick = () => {
    const errs = sum.moves.filter((m) => m.mover === game.color && (m.cls === 'blunder' || m.cls === 'mistake')).map((m) => m.k);
    if (errs.length) go(errs.find((k) => k > ri) ?? errs[0]);
  };
  $('rvPgn').onclick = async () => { $('rvInfo').textContent = (await copyText(pgnOf(game))) ? 'PGN copiado ✓ (cole no Chess.com ou em qualquer analisador)' : 'Não consegui copiar.'; };
  $('rvConsult').onclick = () => { rv.hidden = true; onConsult && onConsult(game); };
  $('rvPlay').onclick = () => { rv.hidden = true; onPlay(fens[ri], game.color, game.oppElo); };
  $('rvChart').onclick = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    go(Math.round(((e.clientX - r.left) / r.width) * n));
  };
  show();
}
