// Copia os motores do pacote npm "stockfish" para public/engine (roda no npm install).
// No deploy web da Vercel (process.env.VERCEL) copiamos só o motor leve: o completo tem
// ~95 MB e não cabe bem num deploy estático. O app esconde a opção "motor completo" sozinho
// quando o arquivo não existe (ver o HEAD em public/app.js).
const fs = require('fs'), path = require('path');
const src = path.join(__dirname, 'node_modules', 'stockfish', 'bin');
const dst = path.join(__dirname, 'public', 'engine');
const skipFull = !!process.env.VERCEL;
const files = ['stockfish-19-lite-single.js', 'stockfish-19-lite-single.wasm'];
if (!skipFull) files.push('stockfish-19-single.js', 'stockfish-19-single.wasm');
fs.mkdirSync(dst, { recursive: true });
for (const f of files)
  if (fs.existsSync(path.join(src, f))) fs.copyFileSync(path.join(src, f), path.join(dst, f));
