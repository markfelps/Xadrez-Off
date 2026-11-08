import { newPlayer } from './logic.js';

const KEY = 'xadrez-offline-v2';
const OLD = 'xadrez-offline-v1';
const CLOCK_DEFAULT = { preset: 'none', min: 10, inc: 0, engMin: 10 };
const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

export const S = (() => {
  const v2 = read(KEY);
  if (v2) {
    return { player: { ...newPlayer(), ...v2.player }, elo: v2.elo || 1500, games: v2.games || [], puzzles: v2.puzzles || [], hintMode: v2.hintMode || 'off', clock: { ...CLOCK_DEFAULT, ...(v2.clock || {}) } };
  }
  const v1 = read(OLD) || {};
  return { player: { ...newPlayer(), ...(v1.player || {}) }, elo: v1.elo || 1500, games: [], puzzles: [], hintMode: 'off', clock: { ...CLOCK_DEFAULT } };
})();

export function save() {
  try {
    S.games = S.games.slice(-40);
    localStorage.setItem(KEY, JSON.stringify(S));
  } catch {}
}
