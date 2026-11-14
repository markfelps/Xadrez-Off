import { newPlayer } from './logic.js';

const KEY = 'xadrez-offline-v2';
const OLD = 'xadrez-offline-v1';
const CLOCK_DEFAULT = { preset: 'none', min: 10, inc: 0, engMin: 10 };
const DEFAULTS = {
  elo: 1500, games: [], puzzles: [], hintMode: 'off',
  orient: 'auto',            // auto = minha cor embaixo | w | b
  sqNames: false,            // nome da casa dentro de cada casa
  playColor: 'w',            // cor do usuário na próxima partida: w | b | r
  opening: null,             // abertura do computador: null | 'random' | { eco, name }
  openInside: false,         // já começar dentro da abertura
  human: false,              // modo humano: o computador joga como uma pessoa (abaixo de 2850)
  pcBoost: null,             // null = automático (ligado em PC, desligado em celular)
  confirmMove: false,
  hcSide: 'pc', hcPiece: 'none', // handicap: quem fica sem a peça / qual peça        // pedir confirmação antes de jogar o lance
  consultSide: 'w', csTime: 1500, csPt: false, csBest: true,
  // IA (OpenRouter, via proxy /api/chat). Tudo desligado por padrão.
  ai: {
    on: false,            // liga/desliga todos os recursos de IA
    key: '',              // chave própria do OpenRouter (opcional; se vazio usa a do servidor)
    model: 'openai/gpt-4o-mini',
    trash: false,         // modo trash talk: o adversário provoca
    comment: false,       // comentar seus lances automaticamente
    persona: 'provocador', // tom do adversário no trash talk
  },
};
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

function build(base) {
  return {
    ...DEFAULTS, ...base,
    elo: base.elo || 1500,
    player: { ...newPlayer(), ...(base.player || {}) },
    clock: { ...CLOCK_DEFAULT, ...(base.clock || {}) },
    ai: { ...DEFAULTS.ai, ...(base.ai || {}) },
    games: base.games || [], puzzles: base.puzzles || [],
  };
}

export const S = build(read(KEY) || (() => { const v1 = read(OLD) || {}; return { player: v1.player, elo: v1.elo }; })());

export function save() {
  try {
    S.games = S.games.slice(-40);
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {}
}

// orientação: tabuleiro virado (pretas embaixo)? color = cor de quem está jogando
export const orientFlipped = (color) => (S.orient === 'auto' ? color === 'b' : S.orient === 'b');

export function exportBackup() {
  return JSON.stringify({ app: 'xadrez-offline', version: 2, exportedAt: new Date().toISOString(), data: S }, null, 1);
}
export function importBackup(text) {
  const j = JSON.parse(text);
  const d = j && (j.data || j);
  if (!d || !d.player || typeof d.player.rating !== 'number') throw new Error('arquivo de backup inválido');
  Object.assign(S, build(d));
  save();
}
