// Wrapper UCI para o Stockfish.js rodando em Web Worker.

import { scoreToCp } from './logic.js';

class UciEngine {
  constructor(file, opts = {}) {
    this.chain = Promise.resolve();
    this.hash = opts.hash || 64;
    this.initTimeout = opts.initTimeout || 60000;
    this.worker = new Worker(file);
    this.listeners = new Set();
    this.failed = null;
    // progresso do download do .wasm (o stockfish.js informa por um MessageChannel); serve de vigia contra travamentos
    this.stallMs = opts.stallMs || 20000;
    this.dl = { t: Date.now(), done: false, percent: 0, text: '' };
    const ch = new MessageChannel();
    ch.port1.onmessage = (ev) => {
      const d = ev.data || {};
      this.dl.t = Date.now(); this.dl.started = true; this.dl.percent = d.percent || 0; this.dl.text = d.speedText || '';
      if (d.percent >= 1) this.dl.done = true;
    };
    this.worker.postMessage({ progressPort: ch.port2 }, [ch.port2]);
    // falha de carregamento do worker (arquivo ausente, wasm inválido): rejeita na hora, sem esperar timeout
    this.worker.onerror = (ev) => { this.failed = new Error('falha ao carregar o motor' + (ev && ev.message ? ': ' + ev.message : '')); for (const l of [...this.listeners]) l(null); };
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
        if (line === null) { clearTimeout(t); this.listeners.delete(fn); return reject(this.failed); }
        const m = line.match(re);
        if (m) { clearTimeout(t); this.listeners.delete(fn); resolve(m); }
      };
      this.listeners.add(fn);
    });
  }

  send(cmd) { this.worker.postMessage(cmd); }

  async _init() {
    // vigia: sem nenhum dado novo do download por stallMs => falha imediatamente (em vez de esperar o timeout longo)
    const wd = setInterval(() => {
      // nenhum byte recebido ainda (404/bloqueio) cai em 12s; download iniciado e parado cai em stallMs
      const limit = this.dl.started ? this.stallMs : Math.min(this.stallMs, 12000);
      if (!this.dl.done && Date.now() - this.dl.t > limit) {
        this.failed = new Error(`o download do motor não avançou (${Math.round(limit / 1000)}s sem dados)`);
        for (const l of [...this.listeners]) l(null);
      }
    }, 1000);
    try {
      const ok = this._waitFor(/^uciok/, this.initTimeout);
      this.send('uci');
      await ok;
      this.send(`setoption name Hash value ${this.hash}`);
      this.send('setoption name Ponder value true');
      this.curHash = this.hash;
      await this.isReady(this.initTimeout);
    } finally { clearInterval(wd); }
  }

  async isReady(timeout = 60000) {
    const ok = this._waitFor(/^readyok/, timeout);
    this.send('isready');
    await ok;
  }

  // fila: um comando de busca por vez
  run(fn) { const p = this.chain.then(fn); this.chain = p.catch(() => {}); return p; }

  // muda o tamanho da tabela hash (MB) — vale a partir da próxima busca
  setHash(mb) {
    this._cancelPonder();
    this.hash = mb;
    return this.run(async () => {
      await this.ready;
      if (this.curHash === mb) return;
      this.send(`setoption name Hash value ${mb}`);
      this.curHash = mb;
      await this.isReady();
    }).catch(() => {});
  }

  // ---- ponder: pensa na posição prevista enquanto o usuário pensa; se ele jogar o lance previsto, a resposta já sai pronta
  _cancelPonder() {
    const st = this.pstate;
    this.pstate = null;
    if (!st) return;
    st.cancelled = true;
    if (st.started && !st.finished) this.send('stop');
  }

  startPonder(plan, moves, startFen, ponderMove) {
    this._cancelPonder();
    if (!ponderMove || plan.limit) return;
    const st = { moves: [...moves, ponderMove], started: false, finished: false, cancelled: false };
    this.pstate = st;
    st.done = this.run(async () => {
      await this.ready;
      if (st.cancelled) return null;
      const base = startFen ? `position fen ${startFen}` : 'position startpos';
      this.send(base + ' moves ' + st.moves.join(' '));
      const done = this._waitFor(/^bestmove (\S+)(?: ponder (\S+))?/, 6 * 3600 * 1000);
      this.searching = 'ponder';
      st.started = true;
      this.send(`go ponder movetime ${plan.movetime}`);
      try { return await done; } finally { st.finished = true; this.searching = null; }
    }).catch(() => null);
  }

  // plan vem de enginePlan(); moves = lances UCI desde startFen (ou posição inicial)
  // devolve o lance (UCI); this.lastPonder guarda o lance previsto do usuário (ou null)
  bestMove(plan, moves, startFen = null) {
    const st = this.pstate;
    if (st && st.started && !st.finished && !plan.limit && st.moves.length === moves.length && st.moves.every((m, i) => m === moves[i])) {
      // acertou a previsão: continua a busca já em andamento (ela tem o tempo todo em que o usuário pensou)
      this.pstate = null;
      this.searching = 'game';
      this.send('ponderhit');
      return st.done.then((r) => {
        if (!r) throw new Error('busca de ponder interrompida');
        this.lastPonder = r[2] || null;
        return r[1];
      });
    }
    this._cancelPonder();
    return this.run(async () => {
      await this.ready;
      if (moves.length <= 1) this.send('ucinewgame'); // só no começo da partida (evita reinicializar a cada lance)
      this.send(`setoption name UCI_LimitStrength value ${plan.limit ? 'true' : 'false'}`);
      if (plan.limit) this.send(`setoption name UCI_Elo value ${plan.uciElo}`);
      await this.isReady();
      const base = startFen ? `position fen ${startFen}` : 'position startpos';
      this.send(base + (moves.length ? ' moves ' + moves.join(' ') : ''));
      const done = this._waitFor(/^bestmove (\S+)(?: ponder (\S+))?/, plan.movetime + 30000);
      this.searching = 'game';
      this.send(`go movetime ${plan.movetime}`);
      try { const m = await done; this.lastPonder = m[2] || null; return m[1]; } finally { this.searching = null; }
    });
  }

  // análise com várias linhas (MultiPV). onInfo recebe as linhas parciais; opts.cancelled() evita rodar se já ficou obsoleta
  analyzeMulti(fen, movetime = 1500, multipv = 3, onInfo = null, opts = {}) {
    this._cancelPonder();
    return this.run(async () => {
      if (opts.cancelled && opts.cancelled()) return [];
      await this.ready;
      this.send('setoption name UCI_LimitStrength value false');
      this.send(`setoption name MultiPV value ${multipv}`);
      await this.isReady();
      if (opts.cancelled && opts.cancelled()) { this.send('setoption name MultiPV value 1'); return []; }
      this.send('position fen ' + fen);
      const best = new Map();
      const sorted = () => [...best.values()].sort((a, b) => a.k - b.k);
      const fn = (line) => {
        if (line === null || !line.startsWith('info') || /bound/.test(line)) return;
        const sc = line.match(/score (cp|mate) (-?\d+)/), pv = line.match(/ pv (.+)$/);
        if (!sc || !pv) return;
        const mp = line.match(/multipv (\d+)/), dp = line.match(/ depth (\d+)/);
        const k = mp ? +mp[1] : 1;
        best.set(k, { k, cp: scoreToCp(sc[1], +sc[2]), pv: pv[1].trim().split(' '), depth: dp ? +dp[1] : 0 });
        if (onInfo) onInfo(sorted());
      };
      this.listeners.add(fn);
      this.searching = 'analysis';
      const done = this._waitFor(/^bestmove (\S+)/, movetime + 30000);
      this.send(`go movetime ${movetime}`);
      try { await done; } finally { this.listeners.delete(fn); this.searching = null; this.send('setoption name MultiPV value 1'); }
      return sorted();
    });
  }

  // candidatos para o modo humano: busca com profundidade limitada e várias linhas (MultiPV)
  // devolve [{ uci, cp }] ordenado; cp é do ponto de vista de quem joga
  candidates(moves, startFen, { depth, multipv = 6, movetime = 2500 }) {
    this._cancelPonder();
    return this.run(async () => {
      await this.ready;
      this.send('setoption name UCI_LimitStrength value false');
      this.send(`setoption name MultiPV value ${multipv}`);
      await this.isReady();
      this.send((startFen ? `position fen ${startFen}` : 'position startpos') + (moves.length ? ' moves ' + moves.join(' ') : ''));
      const byK = new Map();
      const fn = (line) => {
        if (line === null || !line.startsWith('info') || /bound/.test(line)) return;
        const sc = line.match(/score (cp|mate) (-?\d+)/), pv = line.match(/ pv (\S+)/), mp = line.match(/multipv (\d+)/), dp = line.match(/ depth (\d+)/);
        if (!sc || !pv) return;
        byK.set(mp ? +mp[1] : 1, { uci: pv[1], cp: scoreToCp(sc[1], +sc[2]), depth: dp ? +dp[1] : 0 });
      };
      this.listeners.add(fn);
      this.searching = 'game';
      const done = this._waitFor(/^bestmove (\S+)/, movetime + 30000);
      this.send(`go depth ${depth} movetime ${movetime}`);
      try { await done; } finally { this.listeners.delete(fn); this.searching = null; this.send('setoption name MultiPV value 1'); }
      return [...byK.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
    });
  }

  // interrompe só buscas de análise (nunca a jogada do computador numa partida)
  stopAnalysis() { if (this.searching === 'analysis') this.send('stop'); }

  // análise em força total: { cp (de quem joga), best }
  analyze(fen, movetime = 300) {
    this._cancelPonder();
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

  stop() { this._cancelPonder(); this.send('stop'); }
  terminate() { this.worker.terminate(); }
}

const FILES = {
  lite: 'engine/stockfish-19-lite-single.js',
  full: 'engine/stockfish-19-single.js',
};
const cache = {};
const OPTS = {
  lite: { hash: 64, initTimeout: 60000 },
  full: { hash: 128, initTimeout: 300000, stallMs: 25000 }, // 95 MB: compilar pode levar minutos em máquina lenta; só o download parado derruba
};
// modo PC: tabela hash grande (mais profundidade em lances longos)
const HASH_PC = { lite: 256, full: 512 };
const HASH_BASE = { lite: OPTS.lite.hash, full: OPTS.full.hash };
export function setBoost(on) {
  for (const k of Object.keys(OPTS)) {
    OPTS[k].hash = on ? HASH_PC[k] : HASH_BASE[k];
    if (cache[k]) cache[k].setHash(OPTS[k].hash);
  }
}

export function getEngine(kind) {
  if (!cache[kind]) {
    const e = new UciEngine(FILES[kind], OPTS[kind]);
    cache[kind] = e;
    // se falhar ao iniciar, descarta para permitir nova tentativa (e fallback)
    e.ready.catch(() => { if (cache[kind] === e) { try { e.terminate(); } catch {} delete cache[kind]; } });
  }
  return cache[kind];
}

export function loadProgress(kind) { const e = cache[kind]; return e ? e.dl : null; }
export const engineLoaded = (kind) => !!cache[kind];

export function stopAnalysis() { for (const k in cache) cache[k].stopAnalysis(); }
export function stopAll() { for (const k in cache) cache[k].stop(); }
