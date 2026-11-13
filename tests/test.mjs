import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Chess } from '../public/vendor/chess.js';
import { parseMoveInput } from '../public/notation.js';
import { expectedScore, updateRating, newPlayer, enginePlan, ladderOpponent, ELO_MAX, winPct, summarizeGame, pickPuzzles, scoreToCp, PRESET_POSITIONS, classifyLoss, clockConfig, formatClock, engineMovetime, UNDO_COST } from '../public/logic.js';

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

// --- relógio ---
assert.equal(clockConfig('none'), null);
assert.deepEqual(clockConfig('3+2'), { minMs: 180000, incMs: 2000, engMs: 180000 });
assert.deepEqual(clockConfig('custom', { min: 5, inc: 3, engMin: 1 }), { minMs: 300000, incMs: 3000, engMs: 60000 });
assert.equal(clockConfig('custom', { min: 5, inc: 0, engMin: '' }).engMs, 300000); // vazio = igual ao seu
assert.equal(clockConfig('custom', { min: 0, inc: -4 }).incMs, 0); // incremento negativo vira 0
assert.equal(formatClock(61000), '1:01'); assert.equal(formatClock(3599000), '59:59'); assert.equal(formatClock(9400), '0:09.4'); assert.equal(formatClock(-5), '0:00.0');
assert.equal(engineMovetime(8000, null), 8000);
assert.equal(engineMovetime(8000, 60000, 0), 3000);       // 1 min restante: no máx 3 s
assert.equal(engineMovetime(500, 600000, 0), 500);         // nunca passa do plano
assert.equal(engineMovetime(8000, 100, 0), 50);            // mínimo de 50 ms
assert.equal(UNDO_COST, 5);

// --- digitação de lances ---
{
  const c = new Chess();
  const san = (txt, pt) => { const m = parseMoveInput(c, txt, pt); return m && m.san; };
  assert.equal(san('e4'), 'e4'); assert.equal(san('e2e4'), 'e4'); assert.equal(san('e2-e4'), 'e4');
  assert.equal(san('Nf3'), 'Nf3'); assert.equal(san('nf3'), 'Nf3'); assert.equal(san('g1f3'), 'Nf3');
  assert.equal(san('Cf3', true), 'Nf3');      // português: C = cavalo
  assert.equal(san('Cf3', false), null);      // sem o modo PT, "Cf3" não vale
  assert.equal(san('e5'), null);              // ilegal na posição inicial
  assert.equal(san('Nf3+'), 'Nf3');           // sinais de xeque são ignorados
  assert.equal(parseMoveInput(c, '', false), null);
  for (const m of ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']) c.move(m);
  assert.equal(san('O-O'), 'O-O'); assert.equal(san('0-0'), 'O-O'); assert.equal(san('e1g1'), 'O-O');
  assert.equal(san('bc4'), null);             // não existe peão em b -> c4 (e o bispo já está lá)
  const p = new Chess('8/4P3/8/8/8/k7/8/K7 w - - 0 1');
  assert.equal(parseMoveInput(p, 'e8=Q').promotion, 'q');
  assert.equal(parseMoveInput(p, 'e7e8q').promotion, 'q'); assert.equal(parseMoveInput(p, 'e7e8').promotion, 'q'); // sem letra = dama
  assert.equal(parseMoveInput(p, 'e7e8n').promotion, 'n'); assert.equal(parseMoveInput(p, 'e8D', true).promotion, 'q'); assert.equal(parseMoveInput(p, 'e8=T', true).promotion, 'r');
  assert.equal(parseMoveInput(p, 'e8Q').promotion, 'q');
}

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

// ---- livro de aberturas
{
  const { bookMove, BOOK_LINES } = await import('../public/book.js');
  const first = bookMove([]);
  if (!first || !/^[a-h][1-8][a-h][1-8]/.test(first.uci)) throw new Error('livro: primeiro lance inválido');
  if (bookMove(['a2a3'])) throw new Error('livro: não deveria ter lance após a2a3');
  // todo lance escolhido a partir de qualquer prefixo de linha é legal
  const { Chess: C } = await import('../public/vendor/chess.js');
  for (let i = 0; i < 300; i++) {
    const g = new C(); const mv = [];
    for (let p = 0; p < 30; p++) {
      const b = bookMove(mv);
      if (!b) break;
      g.move({ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), promotion: b.uci[4] });
      mv.push(b.uci);
    }
  }
  console.log(`livro ok — ${BOOK_LINES.length} linhas, 300 partidas de teoria sem lance ilegal`);
}

// ---- catálogo de aberturas
{
  const O = await import('../public/openings.js');
  const { Chess: C } = await import('../public/vendor/chess.js');
  const { posKey } = await import('../public/posid.js');
  if (O.openings().length < 3000) throw new Error('catálogo incompleto');
  const t1 = O.search('gambito da dama recusado')[0];
  if (!/^Queen's Gambit Declined/.test(t1.name)) throw new Error('busca PT: ' + t1.name);
  if (!/^Sicilian Defense: Najdorf/.test(O.search('siciliana najdorf')[0].name)) throw new Error('busca siciliana');
  if (O.search('B90')[0].eco !== 'B90') throw new Error('busca por ECO');
  // repertório: o computador de pretas na Najdorf responde c5 d6 cxd4 Nf6 a6 nas posições da linha
  const najd = O.search('sicilian najdorf')[0];
  const rep = O.repertoire(najd, 'b');
  const g = new C(); let hits = 0;
  for (const san of najd.san) {
    const u = rep.get(posKey(g.fen()));
    const m = g.move(san);
    if (g.turn() === 'w') { if (u !== m.from + m.to + (m.promotion || '')) throw new Error('repertório diverge em ' + san); hits++; }
  }
  if (hits !== 5) throw new Error('repertório: esperava 5 lances, deu ' + hits);
  // transposição: a mesma posição por outra ordem de lances ainda é reconhecida
  const tr = new C(); for (const s of 'd4 Nf6 c4 e6 Nc3 d5'.split(' ')) tr.move(s);
  if (!O.identify(tr)) throw new Error('identify falhou');
  for (let i = 0; i < 200; i++) { const o = O.randomOpening(); O.uciLine(o); }
  console.log(`aberturas ok — ${O.openings().length} linhas, busca em português, repertório e identificação`);
}

// ---- nível médio quando o nível muda durante a partida
{
  const { meanLevel } = await import('../public/logic.js');
  if (meanLevel([1500, 1500, 1750, 1750], 0) !== 1625) throw new Error('meanLevel');
  if (meanLevel([], 1800) !== 1800) throw new Error('meanLevel vazio');
  console.log('nível médio ok');
}

// ---- modo humano
{
  const H = await import('../public/human.js');
  const { Chess: C } = await import('../public/vendor/chess.js');
  let prev = 1e9;
  for (const e of [600, 1000, 1400, 1800, 2200, 2600]) {
    const p = H.humanParams(e);
    if (p.temp > prev) throw new Error('temperatura deveria cair com o nível');
    prev = p.temp;
  }
  if (H.humanParams(600).depth >= H.humanParams(2400).depth) throw new Error('profundidade deveria crescer');
  const g = new C();
  const legal = g.moves({ verbose: true }).map((m) => m.from + m.to);
  const cands = [{ uci: 'e2e4', cp: 30 }, { uci: 'd2d4', cp: 25 }, { uci: 'g1f3', cp: 20 }, { uci: 'a2a3', cp: -40 }];
  const counts = {};
  for (let i = 0; i < 600; i++) { const r = H.chooseHuman(cands, g, H.humanParams(1000)); if (!legal.includes(r.uci)) throw new Error('lance ilegal'); counts[r.uci] = (counts[r.uci] || 0) + 1; }
  if (Object.keys(counts).length < 3) throw new Error('modo humano deveria variar os lances');
  // um nível alto quase sempre joga o melhor
  let top = 0; for (let i = 0; i < 400; i++) if (H.chooseHuman(cands, g, H.humanParams(2600)).uci === 'e2e4') top++;
  if (top < 140) throw new Error('nível alto deveria preferir o melhor lance');
  if (H.shouldResign([-950, -1000, -990], H.humanParams(1600)) !== true) throw new Error('deveria desistir');
  if (H.shouldResign([-950, -200, -990], H.humanParams(1600))) throw new Error('não deveria desistir');
  if (H.shouldResign([-2000, -2000, -2000], H.humanParams(2800))) throw new Error('mestre não desiste');
  const d = H.humanDelay(cands, g, H.humanParams(1200), null, () => 0.5);
  if (!(d > 300 && d <= 4500)) throw new Error('atraso fora do esperado');
  console.log('modo humano ok');
}

// ---- handicap
{
  const { handicapFen, HANDICAPS } = await import('../public/logic.js');
  const { Chess } = await import('../public/vendor/chess.js');
  const cnt = (fen, ch) => [...fen.split(' ')[0]].filter((x) => x === ch).length;
  for (const side of ['w', 'b']) for (const h of HANDICAPS.filter((x) => x.id !== 'none')) {
    const fen = handicapFen(side, h.id);
    const c = new Chess(fen); // precisa ser válida
    const ch = side === 'w' ? h.id.toUpperCase() : h.id;
    const full = { p: 8, n: 2, b: 2, r: 2, q: 1 }[h.id];
    assert(cnt(fen, ch) === full - 1, `handicap ${side}${h.id}`);
    assert(c.moves().length > 0);
  }
  assert(!handicapFen('w', 'r').split(' ')[2].includes('Q') && handicapFen('b', 'r').split(' ')[2] === 'KQk');
  console.log('handicaps ok');
}
