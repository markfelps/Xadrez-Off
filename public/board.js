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
      if (o.marks && o.marks[name]) d.classList.add(...o.marks[name].split(' '));
      if (o.badges && o.badges[name]) { d.classList.add('mk-' + o.badges[name].cls); d.dataset.mk = o.badges[name].sym; }
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

// seta de uma casa a outra sobre o tabuleiro (SVG em escala 8x8)
export function drawArrow(el, from, to, { flipped = false, color = '#4caf50', opacity = 0.85 } = {}) {
  el.querySelectorAll('svg.arrows').forEach((n) => n.remove());
  if (!from || !to) return;
  const pos = (sq) => {
    const f = FILES.indexOf(sq[0]), r = 8 - +sq[1];
    return [(flipped ? 7 - f : f) + 0.5, (flipped ? 7 - r : r) + 0.5];
  };
  const [x1, y1] = pos(from), [x2, y2] = pos(to);
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
  const ux = dx / len, uy = dy / len, head = 0.42, w = 0.16;
  const ex = x2 - ux * head, ey = y2 - uy * head;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 8 8'); svg.setAttribute('class', 'arrows');
  svg.innerHTML = `<g opacity="${opacity}" fill="${color}" stroke="${color}">` +
    `<line x1="${x1}" y1="${y1}" x2="${ex}" y2="${ey}" stroke-width="${w * 2}" stroke-linecap="round"/>` +
    `<polygon points="${x2},${y2} ${ex - uy * 0.3},${ey + ux * 0.3} ${ex + uy * 0.3},${ey - ux * 0.3}" stroke="none"/></g>`;
  el.appendChild(svg);
}
