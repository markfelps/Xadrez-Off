// Copia os motores do pacote npm "stockfish" para public/engine (roda no npm install).
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'node_modules', 'stockfish', 'bin');
const dst = path.join(__dirname, 'public', 'engine');
fs.mkdirSync(dst, { recursive: true });
for (const f of ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm', 'stockfish-19-single.js', 'stockfish-19-single.wasm'])
  if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
