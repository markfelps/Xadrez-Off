import { Chess } from './vendor/chess.js';
import { drawBoard, GLYPH } from './board.js';
import { PRESET_POSITIONS, STANDARD_FEN } from './logic.js';

const $ = (id) => document.getElementById(id);
const emptyGrid = () => Array.from({ length: 8 }, () => Array(8).fill(null));
let grid = emptyGrid(), tool = 'wp', turn = 'w';

function fromFen(fen) {
  const c = new Chess(fen);
  grid = c.board().map((row) => row.map((p) => (p ? { type: p.type, color: p.color } : null)));
  turn = fen.split(' ')[1] || 'w';
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
  let cast = '';
  if (at(7, 4, 'k', 'w')) { if (at(7, 7, 'r', 'w')) cast += 'K'; if (at(7, 0, 'r', 'w')) cast += 'Q'; }
  if (at(0, 4, 'k', 'b')) { if (at(0, 7, 'r', 'b')) cast += 'k'; if (at(0, 0, 'r', 'b')) cast += 'q'; }
  return `${rows} ${turn} ${cast || '-'} - 0 1`;
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

function render() {
  drawBoard($('edBoard'), grid, {
    onClick: (sq) => {
      const f = 'abcdefgh'.indexOf(sq[0]), r = 8 - +sq[1];
      grid[r][f] = tool === 'x' ? null : { color: tool[0], type: tool[1] };
      render();
    },
  });
  $('edFen').value = toFen();
  $('edMsg').textContent = '';
}

export function openEditor({ onPlay }) {
  const ed = $('editor');
  ed.hidden = false;
  $('edClose').onclick = () => { ed.hidden = true; };
  if (!$('edPalette').children.length) {
    for (const col of ['w', 'b']) for (const t of ['k', 'q', 'r', 'b', 'n', 'p']) {
      const b = document.createElement('button');
      b.className = 'pal ' + col; b.dataset.t = col + t; b.textContent = GLYPH[t];
      b.onclick = () => { tool = col + t; mark(); };
      $('edPalette').appendChild(b);
    }
    const x = document.createElement('button'); x.className = 'pal'; x.dataset.t = 'x'; x.textContent = '⌫'; x.onclick = () => { tool = 'x'; mark(); };
    $('edPalette').appendChild(x);
    for (const p of PRESET_POSITIONS) { const o = document.createElement('option'); o.value = p.fen; o.textContent = p.name; $('edPreset').appendChild(o); }
  }
  const mark = () => [...$('edPalette').children].forEach((b) => b.classList.toggle('on', b.dataset.t === tool));
  mark();
  $('edPreset').onchange = () => { if ($('edPreset').value) { fromFen($('edPreset').value); $('edTurn').value = turn; render(); } };
  $('edTurn').onchange = () => { turn = $('edTurn').value; $('edFen').value = toFen(); };
  $('edStd').onclick = () => { fromFen(STANDARD_FEN); $('edTurn').value = 'w'; render(); };
  $('edClear').onclick = () => { grid = emptyGrid(); render(); };
  $('edLoad').onclick = () => {
    try { fromFen($('edFen').value.trim()); $('edTurn').value = turn; render(); } catch { $('edMsg').textContent = 'FEN inválido.'; }
  };
  const play = (color) => {
    const fen = toFen(), err = validate(fen);
    if (err) { $('edMsg').textContent = err; return; }
    ed.hidden = true;
    onPlay(fen, color);
  };
  $('edPlayW').onclick = () => play('w');
  $('edPlayB').onclick = () => play('b');
  if (!grid.some((r) => r.some(Boolean))) fromFen(STANDARD_FEN);
  $('edTurn').value = turn;
  render();
}
