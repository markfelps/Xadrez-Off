export const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
const FILES = 'abcdefgh';
export const boardPrefs = { sqNames: false }; // nome da casa dentro de cada casa

// envolve o tabuleiro numa moldura com as letras (a–h) embaixo e os números (1–8) ao lado
function ensureWrap(el) {
  if (el._wrap) return el._wrap;
  const wrap = document.createElement('div');
  wrap.className = 'bwrap';
  const ranks = document.createElement('div'); ranks.className = 'ranks';
  const files = document.createElement('div'); files.className = 'files';
  el.parentNode.insertBefore(wrap, el);
  wrap.append(ranks, el, document.createElement('span'), files);
  el._wrap = { wrap, ranks, files };
  return el._wrap;
}

// grid[r][f] = {type,color} | null  (r=0 é a 8ª fileira)
// o: { flipped, last:[from,to], sel, legal:[move], check:'e1', marks:{sq:classe}, onClick(sq) }
export function drawBoard(el, grid, o = {}) {
  const w = ensureWrap(el);
  w.wrap.classList.toggle('names', boardPrefs.sqNames);
  w.ranks.innerHTML = ''; w.files.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const r = document.createElement('span'); r.textContent = o.flipped ? i + 1 : 8 - i; w.ranks.appendChild(r);
    const f = document.createElement('span'); f.textContent = FILES[o.flipped ? 7 - i : i]; w.files.appendChild(f);
  }
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
      const nm = document.createElement('i'); nm.className = 'nm'; nm.textContent = name; d.appendChild(nm);
      if (o.onClick) d.onclick = () => o.onClick(name);
      el.appendChild(d);
    }
  }
}

export function kingSquare(chess, color) {
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
}
