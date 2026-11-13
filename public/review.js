import { Chess } from './vendor/chess.js';
import { getEngine } from './engine.js';
import { summarizeGame, pickPuzzles, winPct, classifyMove, materialBalance, phaseOf, MOVE_CLASSES, MOVE_LABEL, MOVE_SYMBOL, BAD_CLASSES, PHASE_LABEL } from './logic.js';
import { inCatalog } from './openings.js';
import { drawBoard, drawArrow } from './board.js';
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
  const evals = [], best = [], second = [];
  for (let i = 0; i < fens.length; i++) {
    const c = new Chess(fens[i]);
    const sgn = c.turn() === 'w' ? 1 : -1;
    let cpW = 0, b = null, s2 = null;
    if (c.isCheckmate()) cpW = c.turn() === 'w' ? -10000 : 10000;
    else if (c.isDraw()) cpW = 0;
    else {
      const r = await eng.analyzeMulti(fens[i], 150, 2); // melhor e segundo melhor lance
      if (r.length) { cpW = sgn * r[0].cp; b = r[0].pv[0]; if (r[1]) s2 = sgn * r[1].cp; }
    }
    evals.push(cpW); best.push(b); second.push(s2);
    onProgress(i + 1, fens.length);
  }
  game.review = { evals, best, second, v: 2 };
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

// classifica cada lance (brilhante, ótimo, melhor… erro grave) e calcula precisão por fase
export function classifyGame(game, a, fens, sum) {
  const n = game.moves.length;
  const first = fens[0].split(' ')[1];
  const phaseAcc = { w: {}, b: {} };
  sum.moves.forEach((m, k) => {
    const played = game.moves[k];
    const gap = a.second && a.second[k] != null ? Math.abs(winPct(a.evals[k]) - winPct(a.second[k])) : null;
    const isBook = !game.startFen && k < 24 && inCatalog(fens[k + 1]);
    const sacrifice = k + 2 <= n && materialBalance(fens[k + 2], m.mover) - materialBalance(fens[k], m.mover) <= -3;
    m.cls = classifyMove(m, { isBest: played === a.best[k], isBook, sacrifice, gap, prevOppLoss: k > 0 ? sum.moves[k - 1].loss : 0 });
    m.phase = phaseOf(k, fens[k]);
    const pa = (phaseAcc[m.mover][m.phase] = phaseAcc[m.mover][m.phase] || []);
    pa.push(m.acc);
  });
  const table = { w: {}, b: {} };
  for (const c of MOVE_CLASSES) { table.w[c] = 0; table.b[c] = 0; }
  for (const m of sum.moves) table[m.mover][m.cls]++;
  const phases = {};
  for (const ph of ['opening', 'middlegame', 'endgame']) {
    const arr = phaseAcc[game.color][ph];
    phases[ph] = arr && arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : null;
  }
  sum.table = table; sum.phases = phases; sum.first = first;
  return sum;
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
  const sum = classifyGame(game, a, fens, summarizeGame(a.evals, firstMover, game.color));
  const added = savePuzzles(game, fens, sum);
  onPuzzles && onPuzzles();
  $('rvProg').textContent = '';
  const f = (v) => (v == null ? '–' : v.toFixed(0) + '%');
  const opp = game.color === 'w' ? 'b' : 'w';
  const rows = MOVE_CLASSES.filter((c) => sum.table[game.color][c] || sum.table[opp][c])
    .map((c) => `<span class="c-${c}">${MOVE_SYMBOL[c]} ${MOVE_LABEL[c]}</span><span class="n">${sum.table[game.color][c]}</span><span class="n">${sum.table[opp][c]}</span>`).join('');
  $('rvSummary').innerHTML =
    `<div>Precisão <b>você ${f(sum.accUser)}</b> · computador ${f(sum.accOpp)}</div>` +
    `<div class="phases">${['opening', 'middlegame', 'endgame'].map((p) => `${PHASE_LABEL[p]} <b>${f(sum.phases[p])}</b>`).join(' · ')}</div>` +
    `<div class="cls-table"><span class="h"></span><span class="h n">Você</span><span class="h n">Comp.</span>${rows}</div>` +
    (added ? `<div class="good">+${added} puzzle(s) criado(s) a partir desta derrota</div>` : '');

  const n = game.moves.length;
  const flipped = orientFlipped(game.color);
  const isErr = (m) => m.mover === game.color && ['mistake', 'blunder', 'miss'].includes(m.cls);
  let ri = Math.max(0, sum.moves.findIndex(isErr));
  let retry = null;

  function chart() {
    const W = 300, H = 80;
    const pts = a.evals.map((e, i) => `${(i / Math.max(1, n)) * W},${H - (winPct(e) / 100) * H}`);
    const x = (ri / Math.max(1, n)) * W;
    $('rvChart').innerHTML =
      `<rect width="${W}" height="${H}" fill="#2a2e39"/>` +
      `<polygon points="0,${H} ${pts.join(' ')} ${W},${H}" fill="#e8e9ee" opacity=".85"/>` +
      `<line x1="0" y1="${H / 2}" x2="${W}" y2="${H / 2}" stroke="#888" stroke-dasharray="3"/>` +
      sum.moves.filter(isErr)
        .map((m) => `<circle cx="${(m.k / Math.max(1, n)) * W}" cy="${H - (winPct(a.evals[m.k]) / 100) * H}" r="3" fill="${m.cls === 'blunder' ? '#ff5252' : '#ffb74d'}"/>`).join('') +
      `<line x1="${x}" y1="0" x2="${x}" y2="${H}" stroke="#4f8cff" stroke-width="2"/>`;
  }

  const bar = (cp) => { $('rvBar').classList.toggle('flip', flipped); $('rvBarW').style.height = winPct(cp).toFixed(1) + '%'; };
  const canRetry = () => ri < n && isErr(sum.moves[ri]) || ri < n && sum.moves[ri].mover === game.color && BAD_CLASSES.includes(sum.moves[ri].cls);

  function show() {
    retry = null;
    $('rvRetry').textContent = '🔁 Tentar de novo';
    const c = new Chess(fens[ri]);
    const mv = ri < n ? sum.moves[ri] : null;
    const marks = {}, badges = {};
    let info = ri === n ? 'Fim da partida.' : '';
    let arrow = null;
    if (mv) {
      const who = mv.mover === game.color ? 'Você jogou' : 'Computador jogou';
      const num = Math.floor((ri + (firstMover === 'b' ? 1 : 0)) / 2) + 1;
      info = `${num}${mv.mover === 'w' ? '.' : '...'} ${sans[ri]} — ${who}: <b class="c-${mv.cls}">${MOVE_SYMBOL[mv.cls]} ${MOVE_LABEL[mv.cls]}</b>` + (mv.loss >= 5 ? ` (−${mv.loss.toFixed(0)}%)` : '');
      const b = a.best[ri];
      if (b && BAD_CLASSES.includes(mv.cls) && b !== game.moves[ri]) {
        try { info += `<br>Melhor era <b>${new Chess(fens[ri]).move(parse(b)).san}</b>`; } catch {}
        arrow = [b.slice(0, 2), b.slice(2, 4)];
      }
      const p = game.moves[ri];
      badges[p.slice(2, 4)] = { cls: mv.cls, sym: MOVE_SYMBOL[mv.cls] };
    }
    const lastU = ri > 0 ? game.moves[ri - 1] : null;
    drawBoard($('rvBoard'), c.board(), { flipped, last: lastU && [lastU.slice(0, 2), lastU.slice(2, 4)], marks, badges });
    if (arrow) drawArrow($('rvBoard'), arrow[0], arrow[1], { flipped });
    $('rvInfo').innerHTML = info;
    $('rvRetry').disabled = !canRetry();
    bar(a.evals[ri]);
    chart();
  }

  // ---- tentar de novo: o app confere seu lance com o motor
  function showRetry() {
    const k = retry.k;
    drawBoard($('rvBoard'), retry.rc.board(), { flipped, sel: retry.sel, legal: retry.legal, onClick: retryClick });
    $('rvInfo').innerHTML = retry.msg || `🔁 Encontre um lance melhor do que <b>${sans[k]}</b>.`;
    if (retry.showBest && a.best[k]) drawArrow($('rvBoard'), a.best[k].slice(0, 2), a.best[k].slice(2, 4), { flipped });
  }
  function startRetry() {
    const k = ri;
    retry = { k, rc: new Chess(fens[k]), sel: null, legal: [], msg: '', busy: false, done: false, showBest: false, tries: 0 };
    $('rvRetry').textContent = '↩ Sair do treino';
    showRetry();
  }
  function retryClick(sq) {
    if (!retry || retry.busy || retry.done) return;
    const rc = retry.rc;
    const mv = retry.legal.filter((m) => m.to === sq);
    if (retry.sel && mv.length) return judge(mv.find((m) => m.promotion === 'q') || mv[0]);
    const p = rc.get(sq);
    if (p && p.color === game.color) { retry.sel = sq; retry.legal = rc.moves({ square: sq, verbose: true }); } else { retry.sel = null; retry.legal = []; }
    showRetry();
  }
  async function judge(m) {
    const k = retry.k;
    retry.busy = true;
    const uci = m.from + m.to + (m.promotion || '');
    const t = new Chess(fens[k]); const san = t.move(m).san;
    let ok = uci === a.best[k], loss = 0;
    if (!ok) {
      $('rvInfo').textContent = 'Conferindo seu lance…';
      const r = await getEngine('lite').analyze(t.fen(), 250); // r.cp é de quem joga agora (o adversário)
      loss = Math.max(0, sum.moves[k].wpBefore - (100 - winPct(r.cp)));
      ok = loss <= 6;
    }
    retry.busy = false;
    if (ok) {
      retry.done = true; retry.rc = t; retry.sel = null; retry.legal = [];
      retry.msg = `✔ <b>${san}</b> ${uci === a.best[k] ? 'é o melhor lance!' : 'é uma boa alternativa.'}`;
    } else {
      retry.tries++;
      retry.rc = new Chess(fens[k]); retry.sel = null; retry.legal = [];
      retry.msg = `✖ <b>${san}</b> perde ${loss.toFixed(0)}% de chance. Tente outro lance${retry.tries >= 2 ? ' (ou toque em "Ver melhor lance")' : ''}.`;
    }
    showRetry();
  }

  const go = (v) => { ri = Math.max(0, Math.min(n, v)); show(); };
  $('rvFirst').onclick = () => go(0);
  $('rvPrev').onclick = () => go(ri - 1);
  $('rvNext').onclick = () => go(ri + 1);
  $('rvLast').onclick = () => go(n);
  $('rvNextErr').onclick = () => {
    const errs = sum.moves.filter(isErr).map((m) => m.k);
    if (errs.length) go(errs.find((k) => k > ri) ?? errs[0]);
  };
  $('rvRetry').onclick = () => { if (retry) show(); else if (canRetry()) startRetry(); };
  $('rvShowBest').onclick = () => {
    if (retry) { retry.showBest = true; retry.msg = `Melhor lance: <b>${new Chess(fens[retry.k]).move(parse(a.best[retry.k])).san}</b>`; showRetry(); return; }
    const b = a.best[ri];
    if (!b) return;
    drawArrow($('rvBoard'), b.slice(0, 2), b.slice(2, 4), { flipped });
    $('rvInfo').innerHTML += `<br>Melhor lance: <b>${new Chess(fens[ri]).move(parse(b)).san}</b>`;
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
