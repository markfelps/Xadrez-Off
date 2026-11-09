import { search, lineText, openings } from './openings.js';

const $ = (id) => document.getElementById(id);

// Seletor de abertura. onPick recebe: null (livre), 'random' ou o objeto da abertura.
export function openPicker({ onPick }) {
  const ov = $('openPicker');
  ov.hidden = false;
  const q = $('opQ'), list = $('opList');
  const close = () => { ov.hidden = true; };
  $('opClose').onclick = close;
  const pick = (v) => { close(); onPick(v); };
  $('opFree').onclick = () => pick(null);
  $('opRandom').onclick = () => pick('random');
  $('opCount').textContent = `${openings().length.toLocaleString('pt-BR')} aberturas`;

  const draw = () => {
    const text = q.value.trim();
    const res = search(text, 60);
    list.innerHTML = '';
    if (!text) {
      const h = document.createElement('div'); h.className = 'note'; h.textContent = 'Populares — ou digite para buscar (ex.: siciliana, najdorf, B90, gambito da dama, londres)';
      list.appendChild(h);
    } else if (!res.length) {
      list.textContent = 'Nenhuma abertura encontrada.'; return;
    }
    for (const o of res) {
      const b = document.createElement('button');
      b.className = 'op';
      const t = document.createElement('div'); t.innerHTML = '<b></b> <span></span>';
      t.firstChild.textContent = o.eco; t.lastChild.textContent = o.name;
      const s = document.createElement('small'); s.textContent = lineText(o, 12);
      b.append(t, s);
      b.onclick = () => pick(o);
      list.appendChild(b);
    }
    if (text && res.length === 60) { const h = document.createElement('div'); h.className = 'note'; h.textContent = 'Mostrando as 60 primeiras — refine a busca.'; list.appendChild(h); }
  };
  let t = null;
  q.oninput = () => { clearTimeout(t); t = setTimeout(draw, 120); };
  q.value = '';
  draw();
  setTimeout(() => q.focus(), 50);
}
