import { GLYPH } from './board.js';

// Arrasto de peças (mouse e toque) compartilhado pelo tabuleiro da partida e pelo editor.
// piece: {color,type}. boardEl: tabuleiro (para achar a casa sob o dedo). srcSq: casa de origem (fica "apagada" durante o arrasto).
// onDrop(casa|null): soltou (null = fora do tabuleiro). onTap(): foi só um toque, sem arrastar. onCancel(): arrasto cancelado.
export function startDrag(e, piece, { boardEl, onDrop, onTap, onCancel, srcSq }) {
  e.preventDefault();
  const sx = e.clientX, sy = e.clientY;
  let g = null, moved = false;
  const size = Math.round(boardEl.clientWidth / 8 * 1.25);
  const sqAt = (x, y) => {
    const el = document.elementFromPoint(x, y);
    const q = el && el.closest && el.closest('.sq');
    return q && boardEl.contains(q) ? q.dataset.sq : null;
  };
  const hot = (sq) => {
    boardEl.querySelectorAll('.sq.over').forEach((n) => n.classList.remove('over'));
    if (sq) { const n = boardEl.querySelector(`[data-sq=${sq}]`); if (n) n.classList.add('over'); }
  };
  const mv = (ev) => {
    if (!moved) {
      if (Math.hypot(ev.clientX - sx, ev.clientY - sy) < 8) return;
      moved = true;
      g = document.createElement('div');
      g.className = 'dragghost pc ' + piece.color;
      g.style.fontSize = size + 'px';
      g.textContent = GLYPH[piece.type];
      document.body.appendChild(g);
      if (srcSq) { const n = boardEl.querySelector(`[data-sq=${srcSq}] .pc`); if (n) n.style.opacity = '.25'; }
    }
    g.style.left = ev.clientX + 'px'; g.style.top = ev.clientY + 'px';
    hot(sqAt(ev.clientX, ev.clientY));
  };
  const end = (ev, ok) => {
    window.removeEventListener('pointermove', mv);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    if (g) g.remove();
    hot(null);
    if (!ok) return onCancel && onCancel();
    if (moved) onDrop(sqAt(ev.clientX, ev.clientY)); else onTap && onTap();
  };
  const up = (ev) => end(ev, true);
  const cancel = (ev) => end(ev, false);
  window.addEventListener('pointermove', mv);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
}
