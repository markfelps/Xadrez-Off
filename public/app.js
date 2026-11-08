import { Chess } from './vendor/chess.js';
import { getEngine, stopAll, engineLoaded, loadProgress } from './engine.js';
import {
  ELO_MIN, ELO_MAX, SF_MAX_ELO, enginePlan, levelName, updateRating, ladderOpponent,
  HINT_COST, UNDO_COST, CLOCK_PRESETS, clockConfig, formatClock, engineMovetime,
} from './logic.js';
import { drawBoard, kingSquare, boardPrefs } from './board.js';
import { S, save, orientFlipped, exportBackup, importBackup } from './store.js';
import { openReview } from './review.js';
import { openConsult } from './consult.js';
import { downloadText } from './util.js';
import { openPuzzles, puzzleCount } from './puzzles.js';
import { openEditor } from './editor.js';

const $ = (id) => document.getElementById(id);
const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
const opp = (c) => (c === 'w' ? 'b' : 'w');

let player = S.player;
let elo = Math.max(ELO_MIN, Math.min(ELO_MAX, S.elo));

// ---------- estado do jogo ----------
let chess = new Chess();
let myColor = 'w', flipped = false, selected = null, legal = [];
let thinking = false, active = false, gameId = 0, gameElo = elo;
let startFen = null;            // null = posição inicial padrão
let hintCost = 0, undoCost = 0, hintMv = null, hintMarks = {};
let lastGame = null;

// ---------- relógio ----------
const clock = { on: false, w: 0, b: 0, incMs: 0, minMs: 0, engMs: 0, running: null, last: 0 };

function clockStart(color) {
  if (!clock.on || !active) return;
  clockStop();
  clock.running = color; clock.last = performance.now();
}
function clockTick() {
  if (!clock.running) return;
  const now = performance.now();
  clock[clock.running] -= now - clock.last;
  clock.last = now;
  if (clock[clock.running] <= 0) { const c = clock.running; clock[c] = 0; clock.running = null; onFlag(c); }
}
function clockStop() { clockTick(); clock.running = null; }
function drawClock() {
  const me = $('clockMe'), op = $('clockOpp');
  if (!clock.on) { me.textContent = ''; op.textContent = ''; return; }
  me.textContent = formatClock(clock[myColor]);
  op.textContent = formatClock(clock[opp(myColor)]);
  me.classList.toggle('run', clock.running === myColor);
  op.classList.toggle('run', clock.running === opp(myColor));
  me.classList.toggle('low', clock[myColor] < 10000);
  op.classList.toggle('low', clock[opp(myColor)] < 10000);
}
setInterval(() => { clockTick(); drawClock(); }, 100);

function onFlag(color) {
  if (!active) return;
  const mine = color === myColor;
  gameId++; thinking = false; stopAll();
  finish(mine ? 0 : 1, mine ? 'Tempo esgotado — você perdeu.' : 'O tempo do computador acabou — você venceu!');
}

// configuração do relógio (persistida)
function buildClockUi() {
  for (const [id, label] of CLOCK_PRESETS) {
    const o = document.createElement('option'); o.value = id; o.textContent = label; $('clockPreset').appendChild(o);
  }
  $('clockPreset').value = S.clock.preset;
  $('cMin').value = S.clock.min; $('cInc').value = S.clock.inc; $('cEng').value = S.clock.engMin;
  const upd = () => {
    S.clock = { preset: $('clockPreset').value, min: +$('cMin').value, inc: +$('cInc').value, engMin: +$('cEng').value };
    save();
    $('clockCustom').hidden = S.clock.preset !== 'custom';
    const cfg = clockConfig(S.clock.preset, S.clock);
    $('clockNote').textContent = !cfg ? '' : cfg.minMs !== cfg.engMs
      ? 'Tempo diferente para o computador: a partida não vale rating.' : 'Perder no tempo conta como derrota. Vale a partir da próxima partida.';
  };
  $('clockPreset').onchange = upd;
  for (const id of ['cMin', 'cInc', 'cEng']) $(id).onchange = upd;
  upd();
}

// ---------- rating ----------
const timeOdds = () => clock.on && clock.minMs !== clock.engMs;
const isRated = () => !startFen && S.hintMode !== 'free' && !timeOdds();
const penalty = () => hintCost + undoCost;

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
  warm();
}
function renderLevel() {
  $('eloLabel').textContent = elo;
  $('eloName').textContent = '— ' + levelName(elo);
  $('oppRating').textContent = active ? gameElo : elo;
  $('myRating').textContent = player.rating;
  const p = enginePlan(elo);
  $('eloNote').textContent =
    elo > SF_MAX_ELO
      ? `Acima de ${SF_MAX_ELO} o motor joga sem limite de força, pensando até ${(p.movetime / 1000).toFixed(1)}s por lance${p.engine === 'full' ? ' (rede neural completa)' : ''}. 3650 é a força estimada do Stockfish completo; esses números são nominais.`
      : elo < 1320
        ? `Stockfish a 1320 com ~${Math.round(p.randomP * 100)}% de lances aleatórios.`
        : `Stockfish com força limitada a ${elo} (UCI_Elo).`;
  $('stats').textContent = `${player.games} partidas · ${player.wins}V ${player.draws}E ${player.losses}D · pico ${player.peak}`;
  $('puzBtn').textContent = `Puzzles (${puzzleCount()})`;
  renderHistory();
}
$('eloSlider').oninput = (e) => { $('ladder').checked = false; setElo(+e.target.value); };
$('ladder').onchange = () => { if ($('ladder').checked) setElo(ladderOpponent(player.rating)); };

// ---------- motor: pré-carga, progresso e fallback ----------
function loadMsg() {
  const d = loadProgress('full');
  if (!d) return 'Carregando o motor completo…';
  return d.done ? 'Preparando o motor completo (compilando, pode levar um pouco)…'
    : `Baixando o motor completo… ${Math.round(d.percent * 100)}%${d.text ? ' (' + d.text + ')' : ''}`;
}
const engStatus = (t) => { $('engStatus').textContent = t; };
const saveFull = () => { try { localStorage.setItem('xo-full', $('fullEngine').checked ? '1' : '0'); } catch {} };

async function ensureEngine(kind) {
  const e = getEngine(kind);
  if (kind === 'lite') { await e.ready; return e; }
  const iv = setInterval(() => { const msg = loadMsg(); setStatus(msg); engStatus(msg); }, 400);
  try { await e.ready; } finally { clearInterval(iv); }
  return e;
}

let warming = false;
// carrega o motor completo em segundo plano assim que o nível exige, para a 1ª jogada não esperar
async function warm() {
  const p = enginePlan(elo);
  if (p.engine !== 'full' || !$('fullEngine').checked || warming || engineLoaded('full')) return;
  warming = true;
  const e = getEngine('full');
  const iv = setInterval(() => engStatus(loadMsg()), 400);
  try { await e.ready; engStatus('Motor completo pronto ✓'); } catch (err) {
    $('fullEngine').checked = false; saveFull();
    engStatus(`O motor completo não carregou (${err.message}) — usando o motor leve, que pensa por mais tempo.`);
  } finally { clearInterval(iv); }
  warming = false;
}

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
  updateControls();
  drawClock();
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
  clockStop();
  if (clock.on) clock[myColor] += clock.incMs;
  render();
  if (!checkEnd()) engineTurn();
}

const uciHistory = () => chess.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));

async function engineTurn() {
  if (!active || chess.turn() === myColor) return;
  const id = gameId;
  const engColor = opp(myColor);
  thinking = true;
  clockStop();
  setStatus('Computador pensando…');
  updateControls();
  const plan = enginePlan(gameElo);
  if (plan.engine === 'full' && !$('fullEngine').checked) { plan.engine = 'lite'; plan.movetime = Math.round(plan.movetime * 1.5); }
  let uci;
  try {
    if (plan.randomP && Math.random() < plan.randomP) {
      const all = chess.moves({ verbose: true });
      const m = all[Math.floor(Math.random() * all.length)];
      clockStart(engColor);
      await new Promise((r) => setTimeout(r, 300));
      uci = m.from + m.to + (m.promotion || '');
    } else {
      let eng;
      try { eng = await ensureEngine(plan.engine); } catch (err) {
        if (plan.engine !== 'full') throw err;
        // motor completo falhou: cai para o leve em vez de travar a partida
        $('fullEngine').checked = false; saveFull();
        engStatus(`O motor completo não carregou (${err.message}) — usando o motor leve.`);
        plan.engine = 'lite'; plan.movetime = Math.round(plan.movetime * 1.5);
        eng = await ensureEngine('lite');
      }
      if (id !== gameId) return;
      setStatus('Computador pensando…');
      // o relógio do computador só corre a partir daqui (carregar o motor não custa tempo)
      clockStart(engColor);
      plan.movetime = engineMovetime(plan.movetime, clock.on ? clock[engColor] : null, clock.on ? clock.incMs : 0);
      uci = await eng.bestMove(plan, uciHistory(), startFen);
    }
  } catch (e) { thinking = false; clockStop(); setStatus('Erro no motor: ' + e.message); return; }
  if (id !== gameId) return;
  thinking = false;
  clockStop();
  if (clock.on) clock[engColor] += clock.incMs;
  chess.move(parse(uci));
  render();
  if (!checkEnd()) { clockStart(myColor); setStatus(chess.inCheck() ? 'Xeque! Sua vez.' : 'Sua vez.'); }
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
  clockStop();
  active = false;
  $('resign').disabled = true;
  const rated = isRated();
  let d = 0;
  if (rated) {
    const before = player.rating;
    const oldPeak = player.peak;
    player = updateRating(player, gameElo, score);
    player.rating = Math.max(100, player.rating - penalty());
    player.peak = Math.max(oldPeak, player.rating);
    d = player.rating - before;
    S.player = player;
  }
  lastGame = { id: Date.now(), date: new Date().toISOString(), startFen, moves: uciHistory(), color: myColor, oppElo: gameElo, score, rated, hintCost, undoCost };
  S.games.push(lastGame);
  save();
  const why = startFen ? 'posição personalizada' : timeOdds() ? 'tempo diferente' : 'dicas ilimitadas';
  setStatus(msg + (rated ? '' : ` (sem rating: ${why})`));
  const el = $('lastDelta');
  el.textContent = rated ? (d >= 0 ? '+' : '') + d + (penalty() ? ` (extras −${penalty()})` : '') : 'treino';
  el.className = 'delta ' + (d >= 0 ? 'up' : 'down');
  $('reviewBtn').hidden = false;
  renderLevel();
  updateControls();
  if (rated && $('ladder').checked) setElo(ladderOpponent(player.rating));
}

const setStatus = (t) => { $('status').textContent = t; };

function newGame(color, fen = null, oppElo = null) {
  stopAll();
  gameId++;
  clockStop();
  const c = fen ? new Chess(fen) : new Chess();
  if (c.isGameOver()) { setStatus('Essa posição já terminou.'); return; }
  if (oppElo) setElo(oppElo);
  chess = c; startFen = fen;
  myColor = color === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : color;
  flipped = orientFlipped(myColor);
  gameElo = elo;
  active = true; thinking = false; selected = null; legal = [];
  hintCost = 0; undoCost = 0; hintMarks = {}; hintMv = null;
  const cfg = clockConfig(S.clock.preset, S.clock);
  clock.on = !!cfg;
  if (cfg) { clock.minMs = cfg.minMs; clock.engMs = cfg.engMs; clock.incMs = cfg.incMs; clock[myColor] = cfg.minMs; clock[opp(myColor)] = cfg.engMs; }
  $('resign').disabled = false;
  $('reviewBtn').hidden = true;
  $('lastDelta').textContent = '';
  $('oppName').textContent = `Computador · ${levelName(gameElo)}`;
  renderLevel();
  render();
  setStatus((fen ? 'Posição personalizada (sem rating). ' : '') + (c.turn() === myColor ? 'Sua vez.' : 'Computador começa.'));
  if (c.turn() === myColor) clockStart(myColor);
  engineTurn();
}

// ---------- voltar jogada ----------
const userMoves = () => chess.history({ verbose: true }).filter((m) => m.color === myColor).length;

function undoMove() {
  if (!active || userMoves() < 1) return;
  if (thinking) {
    // desfaz o seu último lance e cancela a resposta do computador
    gameId++; thinking = false; stopAll();
    chess.undo();
  } else if (chess.turn() === myColor) {
    chess.undo(); chess.undo();
  } else return;
  if (isRated()) undoCost += UNDO_COST;
  selected = null; legal = []; hintMarks = {}; hintMv = null;
  clockStop(); clockStart(myColor);
  render();
  setStatus('Lance desfeito. Sua vez.');
}

// ---------- dicas / controles ----------
function updateControls() {
  const myTurn = active && !thinking && chess.turn() === myColor;
  const on = S.hintMode !== 'off';
  $('hint').hidden = !on;
  $('hint').disabled = !myTurn;
  const stage = hintMv && hintMv.fen === chess.fen() ? hintMv.stage : 0;
  const next = stage >= 2 ? null : HINT_COST[stage];
  $('hint').textContent = S.hintMode === 'cost'
    ? (next == null ? 'Dica (completa)' : `Dica (−${next})`) + (hintCost ? ` · gastou ${hintCost}` : '')
    : 'Dica';
  $('hintNote').textContent = S.hintMode === 'free' ? 'Dicas ilimitadas: a partida não vale rating.'
    : S.hintMode === 'cost' ? 'Dica 1 mostra a peça (−5), a 2ª mostra o destino (−5). O custo sai do seu rating no fim da partida.' : '';
  $('undo').disabled = !(active && userMoves() >= 1 && (thinking || chess.turn() === myColor));
  $('undo').textContent = isRated() ? `Voltar jogada (−${UNDO_COST})` : 'Voltar jogada';
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
  if (hintMv.stage >= 2) return updateControls();
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
    onConsult: (game) => openConsult({ startFen: game.startFen, moves: game.moves }),
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
$('undo').onclick = undoMove;
$('hintMode').value = S.hintMode;
$('hintMode').onchange = () => { S.hintMode = $('hintMode').value; save(); render(); };
$('reviewBtn').onclick = () => lastGame && review(lastGame);
$('puzBtn').onclick = () => openPuzzles();
$('consBtn').onclick = () => openConsult();
$('orient').value = S.orient;
$('orient').onchange = () => { S.orient = $('orient').value; save(); flipped = orientFlipped(myColor); render(); };
boardPrefs.sqNames = S.sqNames;
$('sqNames').checked = S.sqNames;
$('sqNames').onchange = () => { S.sqNames = $('sqNames').checked; boardPrefs.sqNames = S.sqNames; save(); render(); };
$('bkExport').onclick = () => downloadText(`xadrez-backup-${new Date().toISOString().slice(0, 10)}.json`, exportBackup());
$('bkImport').onclick = () => $('bkFile').click();
$('bkFile').onchange = async () => {
  const f = $('bkFile').files[0];
  if (!f) return;
  try {
    if (!confirm('Importar o backup vai substituir o rating, as partidas e os puzzles deste aparelho. Continuar?')) return;
    importBackup(await f.text());
    location.reload();
  } catch (e) { alert('Não foi possível importar: ' + e.message); }
  $('bkFile').value = '';
};
$('posBtn').onclick = () => openEditor({ onPlay: (fen, color) => newGame(color, fen) });

// ---------- init ----------
$('fullEngine').checked = (() => { try { return localStorage.getItem('xo-full') === '1'; } catch { return false; } })() || !matchMedia('(pointer: coarse)').matches;
fetch('engine/stockfish-19-single.wasm', { method: 'HEAD' }).then((r) => { if (!r.ok) throw 0; }).catch(() => { $('fullEngine').checked = false; $('fullEngine').closest('label').hidden = true; });
$('fullEngine').onchange = () => { saveFull(); warm(); };
flipped = orientFlipped('w');
buildClockUi();
buildPresets();
setElo(elo);
render();
getEngine('lite').ready.catch(() => {}); // aquece o motor leve já na abertura

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
