// Wrapper UCI para o Stockfish.js rodando em Web Worker.

import { scoreToCp } from './logic.js';

class UciEngine {
  constructor(file) {
    this.chain = Promise.resolve();
    this.worker = new Worker(file);
    this.listeners = new Set();
    this.worker.onmessage = (e) => {
      const line = typeof e.data === 'string' ? e.data : String(e.data);
      for (const l of [...this.listeners]) l(line);
    };
    this.ready = this._init();
  }

  _waitFor(re, timeout = 60000) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => { this.listeners.delete(fn); reject(new Error('timeout ' + re)); }, timeout);
      const fn = (line) => {
        const m = line.match(re);
        if (m) { clearTimeout(t); this.listeners.delete(fn); resolve(m); }
      };
      this.listeners.add(fn);
    });
  }

  send(cmd) { this.worker.postMessage(cmd); }

  async _init() {
    const ok = this._waitFor(/^uciok/);
    this.send('uci');
    await ok;
    this.send('setoption name Hash value 64');
    await this.isReady();
  }

  async isReady() {
    const ok = this._waitFor(/^readyok/);
    this.send('isready');
    await ok;
  }

  // fila: um comando de busca por vez
  run(fn) { const p = this.chain.then(fn); this.chain = p.catch(() => {}); return p; }

  // plan vem de enginePlan(); moves = lances UCI desde startFen (ou posição inicial)
  bestMove(plan, moves, startFen = null) {
    return this.run(async () => {
      await this.ready;
      this.send('ucinewgame');
      this.send(`setoption name UCI_LimitStrength value ${plan.limit ? 'true' : 'false'}`);
      if (plan.limit) this.send(`setoption name UCI_Elo value ${plan.uciElo}`);
      await this.isReady();
      const base = startFen ? `position fen ${startFen}` : 'position startpos';
      this.send(base + (moves.length ? ' moves ' + moves.join(' ') : ''));
      const done = this._waitFor(/^bestmove (\S+)/, plan.movetime + 30000);
      this.send(`go movetime ${plan.movetime}`);
      return (await done)[1];
    });
  }

  // análise em força total: { cp (de quem joga), best }
  analyze(fen, movetime = 300) {
    return this.run(async () => {
      await this.ready;
      this.send('setoption name UCI_LimitStrength value false');
      await this.isReady();
      this.send('position fen ' + fen);
      let cp = 0;
      const fn = (line) => {
        if (!line.startsWith('info') || /bound/.test(line)) return;
        const m = line.match(/score (cp|mate) (-?\d+)/);
        if (m) cp = scoreToCp(m[1], +m[2]);
      };
      this.listeners.add(fn);
      const done = this._waitFor(/^bestmove (\S+)/, movetime + 30000);
      this.send(`go movetime ${movetime}`);
      let m;
      try { m = await done; } finally { this.listeners.delete(fn); }
      return { cp, best: m[1] === '(none)' ? null : m[1] };
    });
  }

  stop() { this.send('stop'); }
  terminate() { this.worker.terminate(); }
}

const FILES = {
  lite: 'engine/stockfish-19-lite-single.js',
  full: 'engine/stockfish-19-single.js',
};
const cache = {};

export function getEngine(kind) {
  if (!cache[kind]) cache[kind] = new UciEngine(FILES[kind]);
  return cache[kind];
}

export function stopAll() { for (const k in cache) cache[k].stop(); }
