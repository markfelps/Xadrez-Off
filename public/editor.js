import { Chess } from './vendor/chess.js';
import { startDrag as drag } from './drag.js';
import { drawBoard, GLYPH } from './board.js';
import { PRESET_POSITIONS, STANDARD_FEN } from './logic.js';
import { orientFlipped } from './store.js';

const $ = (id) => document.getElementById(id);
const emptyGrid = () => Array.from({ length: 8 }, () => Array(8).fill(null));
let grid = emptyGrid(), tool = 'mv', turn = 'w', castl = 'KQkq', fullmove = 1, sel = null, flipped = false, live = false, liveUsed = false;

function fromFen(fen) {
  const c = new Chess(fen);
  grid = c.board().map((row) => row.map((p) => (p ? { type: p.type, color: p.color } : null)));
  const p = fen.split(' ');
  turn = p[1] || 'w'; castl = p[2] && p[2] !== '-' ? p[2] : (p[2] === '-' ? '' : 'KQkq'); fullmove = +p[5] || 1; sel = null;
}

function toFen() {
  const rows = grid.map((row) => {
    let s = '', e = 0;
    for (const p of row) {
      if (!p) { e++; continue; }
      if (e) { s += e; e = 0; }
      s += p.color === 'w' ? p.type.toUpperCase() : p.type;
    }
    return s + (e || '');
  }).join('/');
  const at = (r, f, t, c) => grid[r][f] && grid[r][f].type === t && grid[r][f].color === c;
  // só mantém o roque se rei e torre ainda estão nas casas de origem
  let cast = '';
  if (castl.includes('K') && at(7, 4, 'k', 'w') && at(7, 7, 'r', 'w')) cast += 'K';
  if (castl.includes('Q') && at(7, 4, 'k', 'w') && at(7, 0, 'r', 'w')) cast += 'Q';
  if (castl.includes('k') && at(0, 4, 'k', 'b') && at(0, 7, 'r', 'b')) cast += 'k';
  if (castl.includes('q') && at(0, 4, 'k', 'b') && at(0, 0, 'r', 'b')) cast += 'q';
  return `${rows} ${turn} ${cast || '-'} - 0 ${fullmove}`;
}

// devolve mensagem de erro ou null se a posição é jogável
export function validate(fen) {
  let c;
  try { c = new Chess(fen); } catch { return 'Posição inválida (precisa de um rei de cada cor, sem peões na 1ª/8ª fileira).'; }
  const parts = fen.split(' ');
  parts[1] = parts[1] === 'w' ? 'b' : 'w'; parts[3] = '-';
  try { if (new Chess(parts.join(' ')).inCheck()) return 'Posição ilegal: o rei de quem não joga está em xeque.'; } catch {}
  if (c.isGameOver()) return 'Essa posição já terminou (mate ou empate).';
  return null;
}

const idx = (sq) => [8 - +sq[1], 'abcdefgh'.indexOf(sq[0])];
const sqAt = (x, y) => {
  const el = document.elementFromPoint(x, y);
  const q = el && el.closest && el.closest('#edBoard .sq');
  return q ? q.dataset.sq : null;
};

function render() {
  drawBoard($('edBoard'), grid, { flipped, sel });
  $('edFen').value = toFen();
  $('edMsg').textContent = '';
}

const setSq = (sq, p) => { const [r, f] = idx(sq); grid[r][f] = p; };
const getSq = (sq) => { const [r, f] = idx(sq); return grid[r][f]; };

function tap(sq) {
  const p = getSq(sq);
  if (tool === 'x') { setSq(sq, null); sel = null; }
  else if (tool === 'mv') {
    if (sel && sel !== sq) { setSq(sq, getSq(sel)); setSq(sel, null); sel = null; }
    else sel = p && sel !== sq ? sq : null;
  } else { setSq(sq, { color: tool[0], type: tool[1] }); }
  render();
}

function onBoardDown(e) {
  const s = e.target.closest('.sq');
  if (!s) return;
  const sq = s.dataset.sq, p = getSq(sq);
  if (!p) return tap(sq);
  drag(e, p, {
    boardEl: $('edBoard'), onCancel: render,
    srcSq: sq,
    onTap: () => tap(sq),
    onDrop: (to) => {
      sel = null;
      if (to !== sq) { setSq(sq, null); if (to) setSq(to, p); }
      render();
    },
  });
}

export function openEditor({ onPlay, fen = null, flipped: fl = null, live: isLive = false, onApply, onCancel } = {}) {
  const ed = $('editor');
  ed.hidden = false;
  live = isLive;
  flipped = fl == null ? orientFlipped('w') : fl;
  $('edTitle').textContent = live ? 'Editar posição da partida' : 'Posição específica';
  $('edPlayRow').hidden = live;
  $('edLiveRow').hidden = !live;
  $('edClose').onclick = () => { ed.hidden = true; if (live && onCancel) onCancel(); };
  if (!$('edPalette').children.length) {
    const mvB = document.createElement('button');
    mvB.className = 'pal'; mvB.dataset.t = 'mv'; mvB.textContent = '✋'; mvB.title = 'Mover peças';
    mvB.onclick = () => { tool = 'mv'; mark(); };
    $('edPalette').appendChild(mvB);
    for (const col of ['w', 'b']) for (const t of ['k', 'q', 'r', 'b', 'n', 'p']) {
      const b = document.createElement('button');
      b.className = 'pal ' + col; b.dataset.t = col + t; b.textContent = GLYPH[t];
      b.onpointerdown = (e) => drag(e, { color: col, type: t }, {
        boardEl: $('edBoard'), onCancel: render,
        onTap: () => { tool = col + t; sel = null; mark(); render(); },
        onDrop: (to) => { if (to) setSq(to, { color: col, type: t }); sel = null; render(); },
      });
      $('edPalette').appendChild(b);
    }
    const x = document.createElement('button'); x.className = 'pal'; x.dataset.t = 'x'; x.textContent = '⌫'; x.title = 'Apagar'; x.onclick = () => { tool = 'x'; sel = null; mark(); render(); };
    $('edPalette').appendChild(x);
    for (const p of PRESET_POSITIONS) { const o = document.createElement('option'); o.value = p.fen; o.textContent = p.name; $('edPreset').appendChild(o); }
  }
  const mark = () => [...$('edPalette').children].forEach((b) => b.classList.toggle('on', b.dataset.t === tool));
  tool = 'mv'; mark();
  $('edBoard').onpointerdown = onBoardDown;
  $('edPreset').onchange = () => { if ($('edPreset').value) { fromFen($('edPreset').value); $('edTurn').value = turn; render(); } };
  $('edTurn').onchange = () => { turn = $('edTurn').value; $('edFen').value = toFen(); };
  $('edStd').onclick = () => { fromFen(STANDARD_FEN); $('edTurn').value = 'w'; render(); };
  $('edClear').onclick = () => { grid = emptyGrid(); castl = 'KQkq'; fullmove = 1; sel = null; render(); };
  $('edFlip').onclick = () => { flipped = !flipped; render(); };
  $('edLoad').onclick = () => {
    try { fromFen($('edFen').value.trim()); $('edTurn').value = turn; render(); } catch { $('edMsg').textContent = 'FEN inválido.'; }
  };
  const play = (color) => {
    const f = toFen(), err = validate(f);
    if (err) { $('edMsg').textContent = err; return; }
    ed.hidden = true;
    onPlay(f, color);
  };
  $('edPlayW').onclick = () => play('w');
  $('edPlayB').onclick = () => play('b');
  $('edApply').onclick = () => {
    const f = toFen(), err = validate(f);
    if (err) { $('edMsg').textContent = err; return; }
    ed.hidden = true;
    onApply(f);
  };
  if (live) { fromFen(fen); liveUsed = true; }
  else if (liveUsed) { fromFen(STANDARD_FEN); liveUsed = false; }
  else if (!grid.some((r) => r.some(Boolean))) fromFen(STANDARD_FEN);
  $('edTurn').value = turn;
  render();
}
