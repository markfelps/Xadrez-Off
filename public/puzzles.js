import { Chess } from './vendor/chess.js';
import { getEngine } from './engine.js';
import { winPct } from './logic.js';
import { drawBoard, kingSquare } from './board.js';
import { S, save, orientFlipped } from './store.js';

const $ = (id) => document.getElementById(id);
let cur = null, chess = null, flipped = false, selected = null, legal = [], busy = false, solved = false, marks = {};

export function puzzleCount() { return S.puzzles.filter((p) => p.solved < 2).length; }

function pick() {
  const pool = [...S.puzzles].sort((a, b) => a.solved - b.solved || Math.random() - 0.5);
  return pool[0] || null;
}

function render() {
  drawBoard($('pzBoard'), chess.board(), {
    flipped, sel: selected, legal, marks,
    check: chess.inCheck() ? kingSquare(chess, chess.turn()) : null,
    onClick,
  });
}

function setMsg(t, cls = '') { $('pzInfo').innerHTML = t; $('pzInfo').className = 'status ' + cls; }

function load(p) {
  cur = p; solved = false; marks = {}; selected = null; legal = [];
  if (!p) {
    $('pzCount').textContent = '';
    drawBoard($('pzBoard'), new Chess().board(), {});
    setMsg('Nenhum puzzle ainda. Perca uma partida e use "Revisar partida" — os seus erros viram puzzles.');
    return;
  }
  chess = new Chess(p.fen);
  flipped = orientFlipped(p.color);
  $('pzCount').textContent = `${S.puzzles.filter((x) => x.solved > 0).length}/${S.puzzles.length} resolvidos`;
  setMsg(`Você perdeu pontos aqui (−${p.loss}%). Encontre o melhor lance para ${chess.turn() === 'w' ? 'as brancas' : 'as pretas'}.`);
  render();
}

function onClick(name) {
  if (!cur || busy || solved) return;
  const mv = legal.filter((m) => m.to === name);
  if (selected && mv.length) return attempt(mv[0].from + name + (mv.some((m) => m.promotion) ? 'q' : ''));
  const p = chess.get(name);
  if (p && p.color === chess.turn()) { selected = name; legal = chess.moves({ square: name, verbose: true }); } else { selected = null; legal = []; }
  render();
}

async function attempt(uci) {
  busy = true; selected = null; legal = [];
  const c2 = new Chess(cur.fen);
  c2.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
  chess = c2; render();
  setMsg('Verificando…');
  let ok = uci === cur.best || c2.isCheckmate();
  if (!ok) {
    let userWp = 50;
    if (!c2.isDraw()) userWp = 100 - winPct((await getEngine('lite').analyze(c2.fen(), 250)).cp);
    ok = cur.bestWp - userWp <= 6;
  }
  busy = false;
  if (ok) {
    solved = true; cur.solved++; save();
    setMsg('✔ Correto!' + (uci === cur.best ? '' : ' (lance equivalente ao do motor)'), 'good');
  } else {
    cur.fails++; save();
    setMsg('✘ Não foi esse. Tente de novo.', 'badtxt');
    setTimeout(() => { if (!solved) { chess = new Chess(cur.fen); render(); } }, 900);
  }
}

export function openPuzzles() {
  $('puzzle').hidden = false;
  $('pzClose').onclick = () => { $('puzzle').hidden = true; };
  $('pzNext').onclick = () => load(pick());
  $('pzHint').onclick = () => {
    if (!cur || solved) return;
    marks = { [cur.best.slice(0, 2)]: 'hintFrom' };
    chess = new Chess(cur.fen); render();
  };
  $('pzSol').onclick = () => {
    if (!cur) return;
    const t = new Chess(cur.fen);
    const san = t.move({ from: cur.best.slice(0, 2), to: cur.best.slice(2, 4), promotion: cur.best[4] }).san;
    marks = { [cur.best.slice(0, 2)]: 'hintFrom', [cur.best.slice(2, 4)]: 'hintTo' };
    chess = new Chess(cur.fen); solved = true; render();
    setMsg(`Solução: <b>${san}</b> (você jogou ${cur.played ? new Chess(cur.fen).move({ from: cur.played.slice(0, 2), to: cur.played.slice(2, 4), promotion: cur.played[4] }).san : '?'} na partida)`);
  };
  load(pick());
}
