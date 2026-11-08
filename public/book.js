// Livro de aberturas embutido (offline): linhas principais da teoria, ~10-12 lances cada.
// O computador segue o livro enquanto a partida estiver dentro dele (só em posição inicial padrão).
import { Chess } from './vendor/chess.js';

export const BOOK_LINES = [
  // ---- 1.e4 e5
  ['Ruy Lopez (Fechada)', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O h3 Nb8 d4 Nbd7'],
  ['Ruy Lopez (Marshall)', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5 exd5 Nxd5 Nxe5 Nxe5 Rxe5 c6 d4 Bd6'],
  ['Ruy Lopez (Berlim)', 'e4 e5 Nf3 Nc6 Bb5 Nf6 O-O Nxe4 d4 Nd6 Bxc6 dxc6 dxe5 Nf5 Qxd8+ Kxd8 Nc3 Ke8 h3 h5'],
  ['Ruy Lopez (Aberta)', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Nxe4 d4 b5 Bb3 d5 dxe5 Be6 c3 Be7'],
  ['Italiana (Giuoco Piano)', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d3 d6 O-O O-O Re1 a6 Bb3 Ba7 h3 h6'],
  ['Italiana (Giuoco Pianissimo)', 'e4 e5 Nf3 Nc6 Bc4 Bc5 d3 Nf6 c3 d6 O-O O-O Re1 a6 Bb3 Ba7 Nbd2 Re8'],
  ['Escocesa', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4 Nf6 Nxc6 bxc6 e5 Qe7 Qe2 Nd5 c4 Ba6'],
  ['Defesa Petrov', 'e4 e5 Nf3 Nf6 Nxe5 d6 Nf3 Nxe4 d4 d5 Bd3 Nc6 O-O Be7 c4 Nb4 Be2 O-O Nc3 Bf5'],
  ['Defesa Philidor', 'e4 e5 Nf3 d6 d4 Nf6 Nc3 Nbd7 Bc4 Be7 O-O O-O Re1 c6 a4 a5'],
  // ---- 1.e4 c5
  ['Siciliana Najdorf', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be3 e5 Nb3 Be6 f3 Be7 Qd2 O-O O-O-O Nbd7'],
  ['Siciliana Najdorf (6.Bg5)', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Bg5 e6 f4 Be7 Qf3 Qc7 O-O-O Nbd7 g4 b5'],
  ['Siciliana Dragão', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6 Be3 Bg7 f3 O-O Qd2 Nc6 Bc4 Bd7 O-O-O Rc8'],
  ['Siciliana Sveshnikov', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5 Ndb5 d6 Bg5 a6 Na3 b5 Nd5 Be7 Bxf6 Bxf6 c3 O-O'],
  ['Siciliana Taimanov', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6 Nc3 Qc7 Be3 a6 Qd2 Nf6 O-O-O Be7 f3 b5'],
  ['Siciliana Scheveningen', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6 Be2 Be7 O-O O-O f4 Nc6 Be3 Bd7 Kh1 a6'],
  ['Siciliana Alapin', 'e4 c5 c3 Nf6 e5 Nd5 d4 cxd4 Nf3 Nc6 cxd4 d6 Bc4 Nb6 Bb3 dxe5 Nxe5 Nxe5 dxe5 Qxd1+ Kxd1'],
  // ---- outras defesas ao 1.e4
  ['Francesa (Winawer)', 'e4 e6 d4 d5 Nc3 Bb4 e5 c5 a3 Bxc3+ bxc3 Ne7 Qg4 Qc7 Qxg7 Rg8 Qxh7 cxd4 Ne2 Nbc6 f4 Bd7'],
  ['Francesa (Tarrasch)', 'e4 e6 d4 d5 Nd2 Nf6 e5 Nfd7 Bd3 c5 c3 Nc6 Ne2 cxd4 cxd4 f6 exf6 Nxf6 O-O Bd6'],
  ['Francesa (Clássica)', 'e4 e6 d4 d5 Nc3 Nf6 Bg5 Be7 e5 Nfd7 Bxe7 Qxe7 f4 O-O Nf3 c5 Qd2 Nc6 O-O-O a6'],
  ['Caro-Kann (Clássica)', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5 Ng3 Bg6 h4 h6 Nf3 Nd7 h5 Bh7 Bd3 Bxd3 Qxd3 e6 Bf4 Ngf6 O-O-O Be7'],
  ['Caro-Kann (Avanço)', 'e4 c6 d4 d5 e5 Bf5 Nf3 e6 Be2 c5 Be3 cxd4 Nxd4 Ne7 O-O Nbc6'],
  ['Caro-Kann (Panov)', 'e4 c6 d4 d5 exd5 cxd5 c4 Nf6 Nc3 e6 Nf3 Be7 cxd5 Nxd5 Bd3 Nc6 O-O O-O Re1 b6'],
  ['Escandinava', 'e4 d5 exd5 Qxd5 Nc3 Qa5 d4 Nf6 Nf3 c6 Bc4 Bf5 Bd2 e6'],
  ['Defesa Pirc', 'e4 d6 d4 Nf6 Nc3 g6 Nf3 Bg7 Be2 O-O O-O c6 a4 Nbd7'],
  ['Defesa Alekhine', 'e4 Nf6 e5 Nd5 d4 d6 Nf3 Bg4 Be2 e6 O-O Be7 c4 Nb6 Nc3 O-O'],
  // ---- 1.d4
  ['Gambito da Dama Recusado', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 Bxf6 Bxf6 cxd5 exd5 Qb3 c5'],
  ['GDR (Troca)', 'd4 d5 c4 e6 Nc3 Nf6 cxd5 exd5 Bg5 Be7 e3 c6 Bd3 Nbd7 Qc2 O-O Nge2 Re8 O-O Nf8'],
  ['GDR (Tartakower)', 'd4 d5 c4 e6 Nc3 Nf6 Bg5 Be7 e3 O-O Nf3 h6 Bh4 b6 cxd5 Nxd5 Bxe7 Qxe7 Nxd5 exd5 Rc1 Be6 Qa4 c5 Qa3 Rc8 Bb5 a6'],
  ['Defesa Eslava', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 dxc4 a4 Bf5 e3 e6 Bxc4 Bb4 O-O O-O Qe2 Nbd7'],
  ['Semi-Eslava (Meran)', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6 e3 Nbd7 Bd3 dxc4 Bxc4 b5 Bd3 a6 e4 c5 e5 cxd4 Nxb5 axb5 exf6 gxf6 O-O Bb7'],
  ['Gambito da Dama Aceito', 'd4 d5 c4 dxc4 Nf3 Nf6 e3 e6 Bxc4 c5 O-O a6 Qe2 b5 Bb3 Nc6 Rd1 Qc7 Nc3 Bb7'],
  ['Nimzo-Indiana (Rubinstein)', 'd4 Nf6 c4 e6 Nc3 Bb4 e3 O-O Bd3 d5 Nf3 c5 O-O Nc6 a3 Bxc3 bxc3 dxc4 Bxc4 Qc7'],
  ['Nimzo-Indiana (Clássica)', 'd4 Nf6 c4 e6 Nc3 Bb4 Qc2 O-O a3 Bxc3+ Qxc3 b6 Bg5 Bb7 e3 d6 f3 Nbd7 Ne2 c5'],
  ['Indiana da Dama', 'd4 Nf6 c4 e6 Nf3 b6 g3 Bb7 Bg2 Be7 O-O O-O Nc3 Ne4 Qc2 Nxc3 Qxc3 c5'],
  ['Catalã', 'd4 Nf6 c4 e6 g3 d5 Bg2 Be7 Nf3 O-O O-O dxc4 Qc2 a6 Qxc4 b5 Qc2 Bb7 Bd2 Be4 Qc1'],
  ['Índia do Rei (Clássica)', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3 O-O Be2 e5 O-O Nc6 d5 Ne7 Ne1 Nd7 Be3 f5'],
  ['Índia do Rei (Sämisch)', 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 f3 O-O Be3 e5 d5 Nh5 Qd2 f5 O-O-O Na6'],
  ['Defesa Grünfeld', 'd4 Nf6 c4 g6 Nc3 d5 cxd5 Nxd5 e4 Nxc3 bxc3 Bg7 Nf3 c5 Rb1 O-O Be2 cxd4 cxd4 Qa5+ Bd2 Qxa2'],
  ['Benoni Moderna', 'd4 Nf6 c4 c5 d5 e6 Nc3 exd5 cxd5 d6 e4 g6 Nf3 Bg7 Be2 O-O O-O Re8'],
  ['Sistema Londres', 'd4 d5 Nf3 Nf6 Bf4 e6 e3 c5 c3 Nc6 Nbd2 Bd6 Bg3 O-O Bd3 Qe7'],
  // ---- 1.c4 / 1.Nf3
  ['Inglesa (Quatro Cavalos)', 'c4 e5 Nc3 Nf6 Nf3 Nc6 g3 d5 cxd5 Nxd5 Bg2 Nb6 O-O Be7 a3 O-O b4 f6'],
  ['Inglesa Simétrica', 'c4 c5 Nf3 Nf6 Nc3 e6 g3 b6 Bg2 Bb7 O-O Be7 d4 cxd4 Qxd4 d6'],
  ['Abertura Réti', 'Nf3 d5 g3 Nf6 Bg2 e6 O-O Be7 d3 O-O Nbd2 c5 e4 Nc6 Re1 b5'],
];

// ---- árvore de lances (UCI) construída uma vez, a partir das linhas em SAN
let trie = null;
function build() {
  const root = { kids: new Map(), names: new Set() };
  for (const [name, line] of BOOK_LINES) {
    const g = new Chess();
    let node = root;
    for (const san of line.split(' ')) {
      const m = g.move(san);
      const uci = m.from + m.to + (m.promotion || '');
      if (!node.kids.has(uci)) node.kids.set(uci, { kids: new Map(), names: new Set(), n: 0 });
      node = node.kids.get(uci);
      node.n++; node.names.add(name);
    }
  }
  return root;
}

// moves = lances UCI desde a posição inicial padrão. Devolve { uci, name } ou null se saiu do livro.
export function bookMove(moves, rnd = Math.random) {
  trie = trie || build();
  let node = trie;
  for (const m of moves) { node = node.kids.get(m); if (!node) return null; }
  if (!node.kids.size) return null;
  const opts = [...node.kids.entries()];
  const total = opts.reduce((s, [, k]) => s + k.n, 0);
  let r = rnd() * total;
  for (const [uci, k] of opts) {
    r -= k.n;
    if (r <= 0) return { uci, name: k.names.size <= 3 ? [...k.names][Math.floor(rnd() * k.names.size)] : null };
  }
  const [uci, k] = opts[0];
  return { uci, name: null };
}

export const bookSize = () => BOOK_LINES.length;
