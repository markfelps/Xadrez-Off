import { Chess } from './vendor/chess.js';
import { getEngine, stopAll } from './engine.js';
import {
  ELO_MIN, ELO_MAX, SF_MAX_ELO, enginePlan, levelName, updateRating, ladderOpponent, HINT_COST,
} from './logic.js';
import { drawBoard, kingSquare } from './board.js';
import { S, save } from './store.js';
import { openReview } from './review.js';
import { openPuzzles, puzzleCount } from './puzzles.js';
import { openEditor } from './editor.js';

const $ = (id) => document.getElementById(id);
const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

let player = S.player;
let elo = Math.max(ELO_MIN, Math.min(ELO_MAX, S.elo));

// ---------- estado do jogo ----------
let chess = new Chess();
let myColor = 'w', flipped = false, selected = null, legal = [];
let thinking = false, active = false, gameId = 0, gameElo = elo;
let startFen = null;          // null = posição inicial padrão
let hintCost = 0, hintMv = null, hintMarks = {};
let lastGame = null;

const isRated = () => !startFen && S.hintMode !== 'free';

// ---------- nível ----------
const PRESETS = [
  ['Iniciante', 800], ['1200', 1200], ['1600', 1600], ['2000', 2000], ['2400', 2400],
  ['Magnus ~2850', 2850], ['SF limitado 3190', 3190], ['3400', 3400], ['3650 máx', 3650],
];
function buildPresets() {
  $('presets').innerHTML = '';
  for (const [label, v] of PRESETS) {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => { $('ladder').checked = false; setElo(v); };
    $('presets').appendChild(b);
  }
}
function setElo(v) {
  elo = Math.max(ELO_MIN, Math.min(ELO_MAX, v));
  $('eloSlider').value = elo;
  S.elo = elo; save();
  renderLevel();
}
function renderLevel() {
  $('eloLabel').textContent = elo;
  $('eloName').textContent = '— ' + levelName(elo);
  $('oppRating').textContent = active ? gameElo : elo;
  $('myRating').textContent = player.rating;
  const p = enginePlan(elo);
  $('eloNote').textContent =
    elo > SF_MAX_ELO
      ? `Acima de ${SF_MAX_ELO} o motor joga sem limite de força, pensando ${(p.movetime / 1000).toFixed(1)}s por lance${p.engine === 'full' ? ' (rede neural completa)' : ''}. 3650 é a força estimada do Stockfish completo; esses números são nominais.`
      : elo < 1320
        ? `Stockfish a 1320 com ~${Math.round(p.randomP * 100)}% de lances aleatórios.`
        : `Stockfish com força limitada a ${elo} (UCI_Elo).`;
  $('stats').textContent = `${player.games} partidas · ${player.wins}V ${player.draws}E ${player.losses}D · pico ${player.peak}`;
  $('puzBtn').textContent = `Puzzles (${puzzleCount()})`;
  renderHistory();
}
$('eloSlider').oninput = (e) => { $('ladder').checked = false; setElo(+e.target.value); };
$('ladder').onchange = () => { if ($('ladder').checked) setElo(ladderOpponent(player.rating)); };

// ---------- tabuleiro ----------
function render() {
  const last = chess.history({ verbose: true }).slice(-1)[0];
  drawBoard($('board'), chess.board(), {
    flipped, sel: selected, legal, marks: hintMarks,
    last: last && [last.from, last.to],
    check: chess.inCheck() ? kingSquare(chess, chess.turn()) : null,
    onClick: onSquare,
  });
  const hist = chess.history();
  let n = startFen ? +startFen.split(' ')[5] || 1 : 1;
  let white = startFen ? startFen.split(' ')[1] === 'w' : true;
  let txt = '';
  hist.forEach((san, i) => {
    if (white) txt += `${n}. ${san} `;
    else { txt += (i === 0 ? `${n}... ` : '') + san + '  '; n++; }
    white = !white;
  });
  $('moves').textContent = txt;
  $('moves').scrollTop = 1e6;
  updateHintUi();
}

function onSquare(name) {
  if (!active || thinking || chess.turn() !== myColor) return;
  const mv = legal.filter((m) => m.to === name);
  if (selected && mv.length) {
    if (mv.some((m) => m.promotion)) return askPromotion(mv[0].from, name);
    return playMove({ from: mv[0].from, to: name });
  }
  const p = chess.get(name);
  if (p && p.color === myColor) { selected = name; legal = chess.moves({ square: name, verbose: true }); } else { selected = null; legal = []; }
  render();
}

function askPromotion(from, to) {
  const box = $('promo');
  box.innerHTML = '';
  for (const t of ['q', 'r', 'b', 'n']) {
    const b = document.createElement('button');
    b.textContent = { q: '♛', r: '♜', b: '♝', n: '♞' }[t];
    b.onclick = () => { box.hidden = true; playMove({ from, to, promotion: t }); };
    box.appendChild(b);
  }
  box.hidden = false;
}

// ---------- fluxo ----------
function playMove(m) {
  selected = null; legal = []; hintMarks = {}; hintMv = null;
  try { chess.move(m); } catch { return render(); }
  render();
  if (!checkEnd()) engineTurn();
}

const uciHistory = () => chess.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));

async function engineTurn() {
  if (!active || chess.turn() === myColor) return;
  const id = gameId;
  thinking = true;
  setStatus('Computador pensando…');
  const plan = enginePlan(gameElo);
  if (plan.engine === 'full' && !$('fullEngine').checked) { plan.engine = 'lite'; plan.movetime = Math.round(plan.movetime * 1.5); }
  let uci;
  try {
    if (plan.randomP && Math.random() < plan.randomP) {
      const all = chess.moves({ verbose: true });
      const m = all[Math.floor(Math.random() * all.length)];
      await new Promise((r) => setTimeout(r, 300));
      uci = m.from + m.to + (m.promotion || '');
    } else {
      uci = await getEngine(plan.engine).bestMove(plan, uciHistory(), startFen);
    }
  } catch (e) { thinking = false; setStatus('Erro no motor: ' + e.message); return; }
  if (id !== gameId) return;
  thinking = false;
  chess.move(parse(uci));
  render();
  if (!checkEnd()) setStatus(chess.inCheck() ? 'Xeque! Sua vez.' : 'Sua vez.');
}

function checkEnd() {
  if (!chess.isGameOver()) { setStatus(chess.inCheck() ? 'Xeque!' : (chess.turn() === myColor ? 'Sua vez.' : '')); return false; }
  if (chess.isCheckmate()) {
    const iWon = chess.turn() !== myColor;
    finish(iWon ? 1 : 0, iWon ? 'Xeque-mate — você venceu!' : 'Xeque-mate — o computador venceu.');
  } else {
    const why = chess.isStalemate() ? 'afogamento' : chess.isThreefoldRepetition() ? 'repetição' : chess.isInsufficientMaterial() ? 'material insuficiente' : 'regra dos 50 lances';
    finish(0.5, 'Empate por ' + why + '.');
  }
  return true;
}

function finish(score, msg) {
  active = false;
  $('resign').disabled = true;
  const rated = isRated();
  let d = 0;
  if (rated) {
    const before = player.rating;
    const oldPeak = player.peak;
    player = updateRating(player, gameElo, score);
    player.rating = Math.max(100, player.rating - hintCost);
    player.peak = Math.max(oldPeak, player.rating);
    d = player.rating - before;
    S.player = player;
  }
  lastGame = { id: Date.now(), date: new Date().toISOString(), startFen, moves: uciHistory(), color: myColor, oppElo: gameElo, score, rated, hintCost };
  S.games.push(lastGame);
  save();
  setStatus(msg + (rated ? '' : ' (sem rating: ' + (startFen ? 'posição personalizada' : 'dicas ilimitadas') + ')'));
  const el = $('lastDelta');
  el.textContent = rated ? (d >= 0 ? '+' : '') + d + (hintCost ? ` (dicas −${hintCost})` : '') : 'treino';
  el.className = 'delta ' + (d >= 0 ? 'up' : 'down');
  $('reviewBtn').hidden = false;
  $('hint').disabled = true;
  if (rated && $('ladder').checked) setElo(ladderOpponent(player.rating));
  renderLevel();
}

const setStatus = (t) => { $('status').textContent = t; };

function newGame(color, fen = null, oppElo = null) {
  stopAll();
  gameId++;
  const c = fen ? new Chess(fen) : new Chess();
  if (c.isGameOver()) { setStatus('Essa posição já terminou.'); return; }
  if (oppElo) setElo(oppElo);
  chess = c; startFen = fen;
  myColor = color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
  flipped = myColor === 'b';
  gameElo = elo;
  active = true; thinking = false; selected = null; legal = [];
  hintCost = 0; hintMarks = {}; hintMv = null;
  $('resign').disabled = false;
  $('reviewBtn').hidden = true;
  $('lastDelta').textContent = '';
  $('oppName').textContent = `Computador · ${levelName(gameElo)}`;
  renderLevel();
  render();
  setStatus((fen ? 'Posição personalizada (sem rating). ' : '') + (c.turn() === myColor ? 'Sua vez.' : 'Computador começa.'));
  engineTurn();
}

// ---------- dicas ----------
function updateHintUi() {
  const on = S.hintMode !== 'off';
  $('hint').hidden = !on;
  $('hint').disabled = !(active && !thinking && chess.turn() === myColor);
  const stage = hintMv && hintMv.fen === chess.fen() ? hintMv.stage : 0;
  const next = stage >= 2 ? null : HINT_COST[stage];
  $('hint').textContent = S.hintMode === 'cost'
    ? (next == null ? 'Dica (completa)' : `Dica (−${next})`) + (hintCost ? ` · gastou ${hintCost}` : '')
    : 'Dica';
  $('hintNote').textContent = S.hintMode === 'free' ? 'Dicas ilimitadas: a partida não vale rating.'
    : S.hintMode === 'cost' ? 'Dica 1 mostra a peça (−5), a 2ª mostra o destino (−5). O custo sai do seu rating no fim da partida.' : '';
}

async function hint() {
  if (!active || thinking || chess.turn() !== myColor || S.hintMode === 'off') return;
  const fen = chess.fen();
  if (!hintMv || hintMv.fen !== fen) {
    $('hint').disabled = true;
    setStatus('Calculando dica…');
    const r = await getEngine('lite').analyze(fen, 700);
    if (chess.fen() !== fen || !active) return;
    hintMv = { fen, uci: r.best, stage: 0 };
    setStatus('Sua vez.');
  }
  if (hintMv.stage >= 2) return updateHintUi();
  if (S.hintMode === 'cost') hintCost += HINT_COST[hintMv.stage];
  hintMv.stage++;
  hintMarks = { [hintMv.uci.slice(0, 2)]: 'hintFrom' };
  if (hintMv.stage === 2) hintMarks[hintMv.uci.slice(2, 4)] = 'hintTo';
  render();
}

// ---------- histórico ----------
function renderHistory() {
  const box = $('history');
  box.innerHTML = '';
  [...S.games].reverse().slice(0, 15).forEach((g) => {
    const row = document.createElement('div');
    row.className = 'hrow';
    const res = g.score === 1 ? 'Vitória' : g.score === 0 ? 'Derrota' : 'Empate';
    row.innerHTML = `<span class="r${g.score === 1 ? 'w' : g.score === 0 ? 'l' : 'd'}">${res}</span> <span>${g.color === 'w' ? 'brancas' : 'pretas'} vs ${g.oppElo} · ${Math.ceil(g.moves.length / 2)} lances${g.rated ? '' : ' · treino'}</span>`;
    const b = document.createElement('button');
    b.textContent = 'Revisar';
    b.onclick = () => review(g);
    row.appendChild(b);
    box.appendChild(row);
  });
  if (!S.games.length) box.textContent = 'Nenhuma partida ainda.';
}

function review(g) {
  openReview(g, {
    onPlay: (fen, color, oppElo) => newGame(color, fen, oppElo),
    onPuzzles: renderLevel,
  });
}

// ---------- botões ----------
$('newW').onclick = () => newGame('w');
$('newB').onclick = () => newGame('b');
$('newR').onclick = () => newGame('r');
$('flip').onclick = () => { flipped = !flipped; render(); };
$('resign').onclick = () => { if (active && confirm('Desistir da partida?')) { gameId++; thinking = false; stopAll(); finish(0, 'Você desistiu.'); } };
$('resetRating').onclick = () => { if (confirm('Zerar rating?')) { player = Object.assign(player, { rating: 1200, games: 0, peak: 1200, wins: 0, draws: 0, losses: 0 }); S.player = player; save(); renderLevel(); } };
$('hint').onclick = hint;
$('hintMode').value = S.hintMode;
$('hintMode').onchange = () => { S.hintMode = $('hintMode').value; save(); render(); };
$('reviewBtn').onclick = () => lastGame && review(lastGame);
$('puzBtn').onclick = () => openPuzzles();
$('posBtn').onclick = () => openEditor({ onPlay: (fen, color) => newGame(color, fen) });

// ---------- init ----------
$('fullEngine').checked = (() => { try { return localStorage.getItem('xo-full') === '1'; } catch { return false; } })() || !matchMedia('(pointer: coarse)').matches;
fetch('engine/stockfish-19-single.wasm', { method: 'HEAD' }).then((r) => { if (!r.ok) throw 0; }).catch(() => { $('fullEngine').checked = false; $('fullEngine').closest('label').hidden = true; });
$('fullEngine').onchange = () => { try { localStorage.setItem('xo-full', $('fullEngine').checked ? '1' : '0'); } catch {} };
buildPresets();
setElo(elo);
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
