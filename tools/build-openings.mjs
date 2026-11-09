// Gera public/openings-data.js a partir do conjunto lichess-org/chess-openings (CC0).
// uso: node tools/build-openings.mjs <pasta-com-a.tsv-b.tsv-c.tsv-d.tsv-e.tsv>
import fs from 'node:fs';
import path from 'node:path';
import { Chess } from '../public/vendor/chess.js';
import { posId } from '../public/posid.js';

const dir = process.argv[2];
if (!dir) { console.error('uso: node tools/build-openings.mjs <pasta>'); process.exit(1); }
const out = [];
for (const f of ['a', 'b', 'c', 'd', 'e']) {
  const rows = fs.readFileSync(path.join(dir, f + '.tsv'), 'utf8').trim().split('\n').slice(1);
  for (const row of rows) {
    const [eco, name, pgn] = row.split('\t');
    const san = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
    const g = new Chess();
    for (const m of san) g.move(m); // lança se algum lance for ilegal
    out.push(`${eco}|${name}|${san.join(' ')}|${posId(g.fen())}`);
  }
}
fs.writeFileSync(path.join(import.meta.dirname, '../public/openings-data.js'),
  '// Gerado por tools/build-openings.mjs — fonte: lichess-org/chess-openings (CC0)\n' +
  'export default `' + out.join('\n').replace(/[`\\$]/g, '') + '`;\n');
console.log(out.length, 'aberturas');
