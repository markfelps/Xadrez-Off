export const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';

// grid[r][f] = {type,color} | null  (r=0 é a 8ª fileira)
// o: { flipped, last:[from,to], sel, legal:[move], check:'e1', marks:{sq:classe}, onClick(sq) }
export function drawBoard(el, grid, o = {}) {
  el.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      const r = o.flipped ? 7 - i : i;
      const f = o.flipped ? 7 - j : j;
      const name = FILES[f] + (8 - r);
      const d = document.createElement('div');
      d.className = 'sq ' + ((r + f) % 2 === 0 ? 'l' : 'd');
      d.dataset.sq = name;
      if (o.last && (o.last[0] === name || o.last[1] === name)) d.classList.add('last');
      if (o.sel === name) d.classList.add('sel');
      if (o.check === name) d.classList.add('check');
      if (o.marks && o.marks[name]) d.classList.add(o.marks[name]);
      const lm = o.legal && o.legal.find((m) => m.to === name);
      if (lm) { d.classList.add('hint'); if (lm.captured || (lm.flags && lm.flags.includes('e'))) d.classList.add('cap'); }
      const p = grid[r][f];
      if (p) {
        const s = document.createElement('span');
        s.className = 'pc ' + p.color;
        s.textContent = GLYPH[p.type];
        d.appendChild(s);
      }
      if (j === 0) { const c = document.createElement('i'); c.className = 'coord r'; c.textContent = 8 - r; d.appendChild(c); }
      if (i === 7) { const c = document.createElement('i'); c.className = 'coord f'; c.textContent = FILES[f]; d.appendChild(c); }
      if (o.onClick) d.onclick = () => o.onClick(name);
      el.appendChild(d);
    }
  }
}

export function kingSquare(chess, color) {
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
}
