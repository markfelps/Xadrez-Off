import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Chess } from '../public/vendor/chess.js';
import { expectedScore, updateRating, newPlayer, enginePlan, ladderOpponent, ELO_MAX, winPct, summarizeGame, pickPuzzles, scoreToCp, PRESET_POSITIONS, classifyLoss } from '../public/logic.js';

// --- Elo ---
assert.equal(expectedScore(1500, 1500), 0.5);
let p = newPlayer();
p = updateRating(p, 1200, 1); // empate de rating, K=40 -> +20
assert.equal(p.rating, 1220);
p = updateRating(p, 3650, 0); // perder para 4000 quase não custa nada
assert.ok(p.rating >= 1215 && p.rating <= 1220, 'perda contra 4000: ' + p.rating);
p = updateRating(p, 3650, 1); // vencer um 4000 renderia ~+40
assert.ok(p.rating - 1218 >= 38, 'vitória contra 4000');
assert.deepEqual([p.wins, p.losses, p.games], [2, 1, 3]);

// --- plano do motor ---
assert.equal(enginePlan(1500).uciElo, 1500);
assert.equal(enginePlan(500).uciElo, 1320);
assert.ok(enginePlan(500).randomP > 0.3);
assert.equal(enginePlan(3190).limit, true);
assert.equal(enginePlan(3300).limit, false);
assert.equal(enginePlan(3650).engine, 'full');
assert.equal(ELO_MAX, 3650);
assert.equal(enginePlan(9999).movetime, enginePlan(3650).movetime);
assert.equal(ladderOpponent(1537), 1650);

// --- revisão ---
assert.ok(Math.abs(winPct(0) - 50) < 1e-9 && winPct(500) > 80 && winPct(-500) < 20);
assert.equal(scoreToCp('mate', 3), 9970); assert.equal(scoreToCp('mate', -2), -9980);
// brancas jogam 3 lances: bom, grave erro, mate das pretas. Evals (brancas): 20, 30, -900, -10000
const sm = summarizeGame([20, 30, -900, -10000], 'w', 'w');
assert.equal(sm.moves.length, 3);
assert.equal(sm.moves[0].cls, 'ok');          // brancas: 20 -> 30
assert.equal(sm.moves[1].mover, 'b');
assert.equal(sm.moves[2].mover, 'w');
assert.equal(sm.counts.blunder + sm.counts.mistake + sm.counts.inaccuracy, 0 + (sm.moves[2].cls !== 'ok' ? 1 : 0));
const sm2 = summarizeGame([0, 0, 600, -9000], 'w', 'w'); // brancas: lance 3 (k=2) cai de ~vantagem para mate
assert.equal(sm2.moves[2].cls, 'blunder');
assert.ok(sm2.accUser < sm2.accOpp + 100);
const pz = pickPuzzles(sm2, 'w');
assert.equal(pz.length, 1); assert.equal(pz[0].k, 2);
assert.equal(pickPuzzles(summarizeGame([-900, -900, -9000], 'w', 'w'), 'w').length, 0); // posição já perdida: sem puzzle
assert.equal(classifyLoss(12), 'mistake');
// --- posições prontas são jogáveis ---
for (const p of PRESET_POSITIONS) { const c = new Chess(p.fen); assert.ok(!c.isGameOver(), p.name); assert.ok(c.moves().length > 0, p.name); }

// --- motor real via Node: partida curta lite vs lite (limitado 1500 x ilimitado) ---
import { spawn } from 'node:child_process';
const require = createRequire(import.meta.url);
const enginePath = require('stockfish').findEngine('lite-single');
function run() {
  const lines = []; const waiters = [];
  const child = spawn(process.execPath, [enginePath], { stdio: 'pipe' });
  let buf = '';
  child.stdout.on('data', (d) => {
    buf += d; const parts = buf.split('\n'); buf = parts.pop();
    for (const l of parts) { lines.push(l); [...waiters].forEach((w) => w(l)); }
  });
  const wait = (re) => new Promise((res) => {
    const hit = lines.find((l) => re.test(l)); if (hit) return res(hit.match(re));
    const w = (l) => { const m = l.match(re); if (m) { waiters.splice(waiters.indexOf(w), 1); res(m); } };
    waiters.push(w);
  });
  const eng = { processCommand: (c) => child.stdin.write(c + '\n'), terminate: () => child.kill() };
  return { eng, wait, lines };
}
const w = run(), b = run();
for (const x of [w, b]) { x.eng.processCommand('uci'); await x.wait(/uciok/); }
w.eng.processCommand('setoption name UCI_LimitStrength value true');
w.eng.processCommand('setoption name UCI_Elo value 1320');
const g = new Chess(); const moves = [];
while (!g.isGameOver() && moves.length < 40) {
  const x = g.turn() === 'w' ? w : b;
  x.lines.length = 0;
  x.eng.processCommand('position startpos' + (moves.length ? ' moves ' + moves.join(' ') : ''));
  x.eng.processCommand('go movetime 60');
  const m = (await x.wait(/bestmove (\S+)/))[1];
  const mv = g.move({ from: m.slice(0, 2), to: m.slice(2, 4), promotion: m[4] });
  assert.ok(mv, 'lance ilegal do motor: ' + m);
  moves.push(m);
}
console.log('motor ok —', moves.length, 'lances legais jogados:', moves.slice(0, 8).join(' '), '…');
w.eng.terminate(); b.eng.terminate();
console.log('todos os testes passaram');
