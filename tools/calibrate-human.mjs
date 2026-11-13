import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const P = new URL('../', import.meta.url).pathname; // uso: node tools/calibrate-human.mjs <elo> <partidas> [prof. referência]
const require = createRequire(P + 'package.json');
const { Chess } = await import(P + 'public/vendor/chess.js');
const { humanParams, chooseHuman } = await import(P + 'public/human.js');
const { bookMove } = await import(P + 'public/book.js');
const { scoreToCp } = await import(P + 'public/logic.js');
const elo = +process.argv[2], games = +process.argv[3] || 4, refDepth = +process.argv[4] || 10;
const path = require('stockfish').findEngine('lite-single');
const child = spawn(process.execPath, [path], { stdio: 'pipe' });
let buf = '', ws = [];
child.stdout.on('data', (d) => { buf += d; const p = buf.split('\n'); buf = p.pop(); for (const l of p) [...ws].forEach((w) => w(l)); });
const send = (c) => child.stdin.write(c + '\n');
const until = (re, collect) => new Promise((res) => { const w = (l) => { collect && collect(l); const m = l.match(re); if (m) { ws.splice(ws.indexOf(w), 1); res(m); } }; ws.push(w); });
send('uci'); await until(/uciok/); send('setoption name Hash value 64'); send('isready'); await until(/readyok/);
async function search(moves, depth, mpv) {
  send(`setoption name MultiPV value ${mpv}`); send('isready'); await until(/readyok/);
  send('position startpos' + (moves.length ? ' moves ' + moves.join(' ') : ''));
  const by = new Map();
  const p = until(/^bestmove/, (l) => {
    if (!l.startsWith('info') || /bound/.test(l)) return;
    const sc = l.match(/score (cp|mate) (-?\d+)/), pv = l.match(/ pv (\S+)/), mp = l.match(/multipv (\d+)/);
    if (sc && pv) by.set(mp ? +mp[1] : 1, { uci: pv[1], cp: scoreToCp(sc[1], +sc[2]) });
  });
  send(`go depth ${depth}`); await p;
  return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
}
const prm = humanParams(elo);
let all = [], calm = [], n = 0, over = 0, evals = 0;
for (let g = 0; g < games; g++) {
  const chess = new Chess(), moves = [];
  // abertura variada pelo livro (até ~8 lances)
  for (let i = 0; i < 8; i++) { const b = bookMove(moves); if (!b) break; chess.move({ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), promotion: b.uci[4] }); moves.push(b.uci); }
  let prevEval = null; // avaliação (de quem joga) da posição antes do último lance
  while (!chess.isGameOver() && moves.length < 110) {
    const ref = (await search(moves, refDepth, 1))[0].cp;   // referência (lado a jogar)
    if (prevEval !== null) {
      const loss = Math.min(1000, Math.max(0, prevEval - -ref));
      all.push(loss); if (Math.abs(prevEval) <= 300) calm.push(loss);
    }
    const cands = await search(moves, prm.depth, prm.multipv);
    const pick = chooseHuman(cands, chess, prm);
    if (pick.oversight) over++;
    chess.move({ from: pick.uci.slice(0, 2), to: pick.uci.slice(2, 4), promotion: pick.uci[4] });
    moves.push(pick.uci); prevEval = ref;
    if (Math.abs(ref) > 1200) break;
  }
}
const avg = (a) => a.length ? Math.round(a.reduce((s, v) => s + v, 0) / a.length) : null;
console.log(JSON.stringify({ elo, depth: prm.depth, moves: all.length, acpl: avg(all), acplCalm: avg(calm), blunders100: Math.round(100 * all.filter((l) => l >= 200).length / all.length), over }));
child.kill();
