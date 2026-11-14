// Servidor único (sem dependências): serve public/ e expõe POST /api/chat,
// um proxy para o OpenRouter usado pelos recursos de IA.
//
// Local:  node server.cjs [porta]  → http://localhost:8080
// Vercel: usado como entrypoint; escuta em process.env.PORT. A chave da IA fica
//         na variável de ambiente OPENROUTER_API_KEY (nunca vai ao navegador).
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'public');
const PORT = process.env.PORT || +process.argv[2] || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css',
  '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

// ---------- proxy do OpenRouter ----------
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';
const ALLOWED_MODELS = [
  'openai/gpt-4o-mini', 'openai/gpt-4o', 'anthropic/claude-3.5-haiku', 'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash-001', 'meta-llama/llama-3.3-70b-instruct', 'deepseek/deepseek-chat',
];

function sendJson(res, code, obj) {
  const b = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}

function handleChat(req, res) {
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  if (req.method !== 'POST') { sendJson(res, 405, { error: 'Método não permitido.' }); return; }
  let raw = '', tooBig = false;
  req.on('data', (c) => { raw += c; if (raw.length > 30000) { tooBig = true; req.destroy(); } });
  req.on('end', async () => {
    if (tooBig) { sendJson(res, 413, { error: 'Pedido grande demais.' }); return; }
    let body = {};
    try { body = JSON.parse(raw); } catch {}
    const key = (typeof body.userKey === 'string' && body.userKey.trim()) || process.env.OPENROUTER_API_KEY;
    if (!key) { sendJson(res, 500, { error: 'A IA não está configurada. Defina OPENROUTER_API_KEY no servidor (Vercel) ou cole sua própria chave do OpenRouter nas configurações.' }); return; }
    const { messages, model, temperature, max_tokens } = body;
    if (!Array.isArray(messages) || !messages.length) { sendJson(res, 400, { error: 'Faltou "messages".' }); return; }
    const chosen = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;
    try {
      if (typeof fetch !== 'function') throw new Error('Node sem fetch global (use Node 18+).');
      const r = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Xadrez Offline' },
        body: JSON.stringify({
          model: chosen,
          messages,
          temperature: typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.8,
          max_tokens: Math.min(Math.max(32, max_tokens || 400), 900),
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { sendJson(res, r.status, { error: String((data && data.error && (data.error.message || data.error)) || `Erro ${r.status} no OpenRouter.`) }); return; }
      sendJson(res, 200, { text: (data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '', model: chosen });
    } catch (e) { sendJson(res, 502, { error: 'Falha ao contatar o OpenRouter: ' + e.message }); }
  });
}

// ---------- servidor ----------
http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0];
  if (urlPath === '/api/chat') return handleChat(req, res);

  let p = decodeURIComponent(urlPath);
  if (p.endsWith('/')) p += 'index.html';
  const file = path.normalize(path.join(ROOT, p));
  if (!file.startsWith(ROOT)) { res.writeHead(403).end(); return; }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream',
      'Content-Length': st.size,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    });
    fs.createReadStream(file).pipe(res);
  });
}).listen(PORT, process.env.PORT ? undefined : '127.0.0.1', () => console.log(`Xadrez em http://localhost:${PORT}`));
