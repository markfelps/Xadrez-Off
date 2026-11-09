// Catálogo de aberturas (ECO, ~3.900 linhas) para escolher a abertura do computador e identificar a atual.
import DATA from './openings-data.js';
import { Chess } from './vendor/chess.js';
import { posKey, posId } from './posid.js';

let all = null;
export function openings() {
  if (!all) {
    all = DATA.split('\n').map((l, i) => {
      const [eco, name, san, id] = l.split('|');
      return { n: i, eco, name, san: san.split(' '), id, hay: norm(eco + ' ' + name) };
    });
  }
  return all;
}

function norm(s) { return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }

// palavras em português → inglês (os nomes seguem o padrão do Chess.com/Lichess, em inglês)
const PT = {
  siciliana: 'sicilian', francesa: 'french', italiana: 'italian', escocesa: 'scotch', inglesa: 'english', holandesa: 'dutch',
  eslava: 'slav', escandinava: 'scandinavian', catala: 'catalan', londres: 'london', indiana: 'indian', indio: 'indian', india: 'indian',
  russa: 'russian', defesa: 'defense', abertura: 'opening', gambito: 'gambit', ataque: 'attack', variante: 'variation',
  aceito: 'accepted', recusado: 'declined', troca: 'exchange', avanco: 'advance', dama: 'queen', rei: 'king', bispo: 'bishop',
  cavalo: 'knight', cavalos: 'knights', vienense: 'vienna', alema: 'german', espanhola: 'spanish', partida: 'game', sistema: 'system',
  fechada: 'closed', aberta: 'open', classica: 'classical', moderna: 'modern', centro: 'center', peao: 'pawn', torre: 'rook',
  defence: 'defense', pirc: 'pirc', 'ruy': 'ruy', lopez: 'lopez',
};
const STOP = new Set(['da', 'de', 'do', 'das', 'dos', 'a', 'o', 'e', 'com', 'em']);
const PHRASES = [
  ['gambito da dama', "queen's gambit"], ['gambito do rei', "king's gambit"], ['india do rei', "king's indian"], ['indio do rei', "king's indian"],
  ['india da dama', "queen's indian"], ['defesa russa', 'russian game'], ['abertura inglesa', 'english opening'], ['partida italiana', 'italian game'],
  ['partida escocesa', 'scotch game'], ['abertura do bispo', "bishop's opening"], ['abertura catala', 'catalan opening'],
];
const tokens = (q) => norm(PHRASES.reduce((t, [pt, en]) => t.replace(pt, en), norm(q))).replace(/[^a-z0-9'\- ]+/g, ' ').split(/\s+/).filter((t) => t && !STOP.has(t)).map((t) => PT[t] || t);

export const POPULAR = [
  'Sicilian Defense', 'French Defense', 'Caro-Kann Defense', 'Ruy Lopez', 'Italian Game', 'Scotch Game', 'Petrov\'s Defense',
  'Queen\'s Gambit Declined', 'Queen\'s Gambit Accepted', 'Slav Defense', 'Nimzo-Indian Defense', 'Queen\'s Indian Defense',
  'King\'s Indian Defense', 'Grünfeld Defense', 'Dutch Defense', 'English Opening', 'London System', 'Catalan Opening',
  'Réti Opening', 'Scandinavian Defense', 'Pirc Defense', 'Alekhine Defense', 'Vienna Game', 'King\'s Gambit', 'Benoni Defense',
];

export function popular() {
  const byName = new Map(openings().map((o) => [o.name, o]));
  return POPULAR.map((n) => byName.get(n)).filter(Boolean);
}

// busca por nome, código ECO ou palavras em português; todas as palavras precisam aparecer
export function search(q, limit = 60) {
  const t = tokens(q);
  if (!t.length) return popular();
  const hits = openings().filter((o) => t.every((w) => o.hay.includes(w)));
  const nq = t.join(' ');
  hits.sort((a, b) => {
    const rank = (o) => (norm(o.name).startsWith(nq) || o.eco.toLowerCase() === nq ? 0 : o.hay.includes(nq) ? 1 : 2);
    const sa = rank(a), sb = rank(b);
    return sa - sb || a.san.length - b.san.length || a.n - b.n;
  });
  return hits.slice(0, limit);
}

export function randomOpening(rnd = Math.random) {
  const fam = new Set(POPULAR);
  let pool = openings().filter((o) => o.san.length >= 4 && o.san.length <= 14 && fam.has(o.name.split(':')[0]));
  if (!pool.length) pool = openings().filter((o) => o.san.length >= 4 && o.san.length <= 14);
  return pool[Math.floor(rnd() * pool.length)];
}

// "1.e4 c5 2.Nf3 d6" (até maxPlies lances)
export function lineText(o, maxPlies = 14) {
  const out = [];
  o.san.slice(0, maxPlies).forEach((m, i) => out.push((i % 2 === 0 ? `${i / 2 + 1}.` : '') + m));
  return out.join(' ') + (o.san.length > maxPlies ? ' …' : '');
}

// lances UCI da linha
export function uciLine(o) {
  const g = new Chess(), out = [];
  for (const s of o.san) { const m = g.move(s); out.push(m.from + m.to + (m.promotion || '')); }
  return out;
}

// repertório do computador: posição (antes do lance) → lance UCI, só para os lances da cor do computador.
// Assim ele segue a abertura mesmo se a partida chegar nela por transposição.
export function repertoire(o, compColor) {
  const g = new Chess(), map = new Map();
  for (const s of o.san) {
    const key = posKey(g.fen());
    const turn = g.turn();
    const m = g.move(s);
    if (turn === compColor) map.set(key, m.from + m.to + (m.promotion || ''));
  }
  return map;
}

// identifica a abertura da partida: volta os lances até achar uma posição com nome
let index = null;
export function identify(chess) {
  if (!index) {
    index = new Map();
    for (const o of openings()) { const cur = index.get(o.id); if (!cur || o.san.length > cur.san.length) index.set(o.id, o); }
  }
  const h = chess.history({ verbose: true });
  if (!h.length || h.length > 40) return null;
  const g = new Chess();
  const ids = [''];
  for (const m of h) { g.move(m.san); ids.push(posId(g.fen())); }
  for (let i = ids.length - 1; i >= 1; i--) { const o = index.get(ids[i]); if (o) return o; }
  return null;
}
