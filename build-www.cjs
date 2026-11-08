// Copia public/ para www/ (usado pelo Capacitor), sem o motor completo de 95 MB
// para manter o APK pequeno. O app esconde a opção "motor completo" sozinho.
const fs = require('fs'), path = require('path');
const SRC = path.join(__dirname, 'public'), DST = path.join(__dirname, 'www');
fs.rmSync(DST, { recursive: true, force: true });
fs.cpSync(SRC, DST, { recursive: true, filter: (s) => !/stockfish-19-single\./.test(s) });
console.log('www/ pronto');
