// Modo Consultor: replique no nosso tabuleiro uma partida jogada em outro lugar (ex.: Chess.com)
// e veja a melhor jogada, a avaliação e as 3 melhores linhas.
import { Chess } from './vendor/chess.js';
import { getEngine, stopAnalysis } from './engine.js';
import { drawBoard, kingSquare } from './board.js';
import { winPct } from './logic.js';
import { parseMoveInput } from './notation.js';
import { copyText } from './util.js';
import { S, save } from './store.js';

const $ = (id) => document.getElementById(id);
const parse = (u) => ({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });

let startFen = null, moves = [], ptr = 0;
let selected = null, legal = [], token = 0, bestMarks = {}, wired = false;

const fresh = () => (startFen ? new Chess(startFen) : new Chess());
function position() {
  const c = fresh();
  for (let i = 0; i < ptr; i++) c.move(parse(moves[i]));
  return c;
}

function fmtEval(w) {
  if (Math.abs(w) >= 9000) return (w > 0 ? '+' : '−') + 'M' + Math.ceil((10000 - Math.abs(w)) / 10);
  return (w > 0 ? '+' : w < 0 ? '−' : '') + Math.abs(w / 100).toFixed(2);
}

// "1. e4 e5 2. Nf3" a partir de uma posição e uma linha de lances UCI
function sanLine(fen, pv, plies) {
  const c = new Chess(fen);
  let num = +fen.split(' ')[5] || 1, white = c.turn() === 'w';
  const out = [];
  for (let i = 0; i < Math.min(plies, pv.length); i++) {
    let m;
    try { m = c.move(parse(pv[i])); } catch { break; }
    if (white) out.push(num + '.'); else if (i === 0) out.push(num + '...');
    out.push(m.san);
    if (!white) num++;
    white = !white;
  }
  return out.join(' ');
}

function movesHtml() {
  const c = fresh();
  let n = startFen ? +startFen.split(' ')[5] || 1 : 1;
  let white = startFen ? startFen.split(' ')[1] === 'w' : true;
  let html = '';
  moves.forEach((u, i) => {
    const san = c.move(parse(u)).san;
    const cur = i === ptr - 1;
    const tok = cur ? `<b class="cur">${san}</b>` : san;
    if (white) html += `${n}. ${tok} `;
    else { html += (i === 0 ? `${n}... ` : '') + tok + '  '; n++; }
    white = !white;
  });
  return html || 'Nenhum lance ainda.';
}

function render() {
  const c = position();
  const flipped = S.consultSide === 'b';
  const last = ptr > 0 ? moves[ptr - 1] : null;
  drawBoard($('csBoard'), c.board(), {
    flipped, last: last && [last.slice(0, 2), last.slice(2, 4)], sel: selected, legal, marks: bestMarks,
    check: c.inCheck() ? kingSquare(c, c.turn()) : null, onClick,
  });
  $('csBar').classList.toggle('flip', flipped);
  $('csMoves').innerHTML = movesHtml();
  $('csUndo').disabled = ptr === 0;
  $('csFirst').disabled = $('csPrev').disabled = ptr === 0;
  $('csNext').disabled = $('csLast').disabled = ptr >= moves.length;
  $('csTurn').textContent = c.isCheckmate() ? `Xeque-mate — vencem as ${c.turn() === 'w' ? 'pretas' : 'brancas'}`
    : c.isDraw() ? 'Empate' : `Vez das ${c.turn() === 'w' ? 'brancas' : 'pretas'}${c.inCheck() ? ' (xeque)' : ''}`;
}

function showLines(lines, c, partial) {
  if (!lines.length) {
    $('csBarW').style.height = c.isCheckmate() ? (c.turn() === 'w' ? '0%' : '100%') : '50%';
    $('csEval').textContent = c.isGameOver() ? '' : '…';
    $('csLines').innerHTML = '';
    return;
  }
  const L = lines.map((l) => ({ ...l, w: c.turn() === 'w' ? l.cp : -l.cp }));
  $('csBarW').style.height = winPct(L[0].w).toFixed(1) + '%';
  $('csEval').textContent = `${fmtEval(L[0].w)} · profundidade ${L[0].depth}${partial ? ' …' : ''}`;
  $('csLines').innerHTML = L.map((l) => `<div class="ln"><b>${fmtEval(l.w)}</b> ${sanLine(c.fen(), l.pv, 7)}</div>`).join('');
}

async function runAnalysis() {
  const my = ++token;
  stopAnalysis();
  const c = position();
  if (c.isGameOver()) { showLines([], c); return; }
  $('csEval').textContent = 'Analisando…';
  try {
    const eng = getEngine('lite');
    await eng.ready;
    const lines = await eng.analyzeMulti(c.fen(), S.csTime, 3, (ls) => { if (token === my) showLines(ls, c, true); }, { cancelled: () => token !== my });
    if (token !== my) return;
    showLines(lines, c, false);
    if (S.csBest && lines[0]) {
      const b = lines[0].pv[0];
      bestMarks = { [b.slice(0, 2)]: 'hintFrom', [b.slice(2, 4)]: 'hintTo' };
      render();
    }
  } catch (e) { if (token === my) $('csEval').textContent = 'Erro no motor: ' + e.message; }
}

function changed() {
  selected = null; legal = []; bestMarks = {};
  $('csMsg').textContent = '';
  render();
  runAnalysis();
}

function makeMove(from, to, promo) {
  moves = moves.slice(0, ptr);
  moves.push(from + to + (promo || ''));
  ptr++;
  changed();
}

function onClick(name) {
  const c = position();
  if (c.isGameOver()) return;
  const mv = legal.filter((m) => m.to === name);
  if (selected && mv.length) {
    if (mv.some((m) => m.promotion)) {
      const box = $('promo');
      box.innerHTML = '';
      for (const t of ['q', 'r', 'b', 'n']) {
        const b = document.createElement('button');
        b.textContent = { q: '♛', r: '♜', b: '♝', n: '♞' }[t];
        b.onclick = () => { box.hidden = true; makeMove(mv[0].from, name, t); };
        box.appendChild(b);
      }
      box.hidden = false;
      return;
    }
    return makeMove(mv[0].from, name);
  }
  const p = c.get(name);
  if (p && p.color === c.turn()) { selected = name; legal = c.moves({ square: name, verbose: true }); } else { selected = null; legal = []; }
  render();
}

function playTyped() {
  const raw = $('csInput').value;
  if (!raw.trim()) return;
  const m = parseMoveInput(position(), raw, S.csPt);
  if (!m) { $('csMsg').textContent = `"${raw.trim()}" não é um lance legal nesta posição.`; return; }
  $('csInput').value = '';
  makeMove(m.from, m.to, m.promotion);
}

const looksLikeFen = (t) => t.includes('/') && t.split(/\s+/).length >= 4 && !/\d\./.test(t);

function loadText() {
  const raw = $('csText').value.trim();
  if (!raw) return;
  try {
    if (looksLikeFen(raw)) {
      new Chess(raw); // valida
      startFen = raw; moves = []; ptr = 0;
    } else {
      const attempts = [raw, raw.replace(/\{[^}]*\}/g, '').replace(/\([^)]*\)/g, '').replace(/\$\d+/g, '')];
      let c = null;
      for (const t of attempts) { try { const x = new Chess(); x.loadPgn(t); c = x; break; } catch {} }
      if (!c) throw new Error('PGN não reconhecido');
      const h = c.getHeaders();
      startFen = h.FEN || null;
      moves = c.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
      ptr = moves.length;
    }
    $('csText').value = '';
    $('csMsg').textContent = `Carregado: ${moves.length} lance(s).`;
    selected = null; legal = []; bestMarks = {};
    render(); runAnalysis();
  } catch (e) {
    $('csMsg').textContent = 'Não consegui ler isso como PGN ou FEN. ' + (e.message || '');
  }
}

export function pgnFrom(start, mv) {
  const c = start ? new Chess(start) : new Chess();
  for (const u of mv) c.move(parse(u));
  return c.pgn();
}

function wire() {
  if (wired) return;
  wired = true;
  $('csClose').onclick = () => { $('consult').hidden = true; token++; stopAnalysis(); };
  $('csPlay').onclick = playTyped;
  $('csInput').onkeydown = (e) => { if (e.key === 'Enter') playTyped(); };
  const go = (p) => { ptr = Math.max(0, Math.min(moves.length, p)); changed(); };
  $('csFirst').onclick = () => go(0);
  $('csPrev').onclick = () => go(ptr - 1);
  $('csNext').onclick = () => go(ptr + 1);
  $('csLast').onclick = () => go(moves.length);
  $('csUndo').onclick = () => { if (ptr > 0) { moves = moves.slice(0, ptr - 1); ptr--; changed(); } };
  $('csReset').onclick = () => { startFen = null; moves = []; ptr = 0; changed(); };
  $('csLoad').onclick = loadText;
  $('csCopyPgn').onclick = async () => { $('csMsg').textContent = (await copyText(pgnFrom(startFen, moves))) ? 'PGN copiado ✓' : 'Não consegui copiar.'; };
  $('csCopyFen').onclick = async () => { $('csMsg').textContent = (await copyText(position().fen())) ? 'FEN copiado ✓' : 'Não consegui copiar.'; };
  $('csSide').onchange = () => { S.consultSide = $('csSide').value; save(); render(); };
  $('csTime').onchange = () => { S.csTime = +$('csTime').value; save(); runAnalysis(); };
  $('csPt').onchange = () => { S.csPt = $('csPt').checked; save(); };
  $('csBest').onchange = () => { S.csBest = $('csBest').checked; save(); bestMarks = {}; render(); runAnalysis(); };
}

// opts opcional: { startFen, moves } para abrir já com uma partida (ex.: vinda da revisão)
export function openConsult(opts) {
  wire();
  if (opts) { startFen = opts.startFen || null; moves = [...opts.moves]; ptr = moves.length; }
  $('csSide').value = S.consultSide; $('csTime').value = String(S.csTime);
  $('csPt').checked = S.csPt; $('csBest').checked = S.csBest;
  $('consult').hidden = false;
  selected = null; legal = []; bestMarks = {};
  $('csMsg').textContent = '';
  render();
  runAnalysis();
}
