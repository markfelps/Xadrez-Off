// Proxy serverless (Vercel) para o OpenRouter.
// A chave fica no servidor (variável de ambiente OPENROUTER_API_KEY) e NUNCA vai ao navegador.
// O navegador chama POST /api/chat; aqui repassamos ao OpenRouter e devolvemos só o texto.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini'; // barato, rápido e bom em português
const ALLOWED_MODELS = [
  // lista branca: evita que alguém use o proxy para chamar modelos caros à vontade
  'openai/gpt-4o-mini',
  'openai/gpt-4o',
  'anthropic/claude-3.5-haiku',
  'anthropic/claude-3.5-sonnet',
  'google/gemini-2.0-flash-001',
  'meta-llama/llama-3.3-70b-instruct',
  'deepseek/deepseek-chat',
];

export default async function handler(req, res) {
  // CORS básico (mesma origem já funciona; isto ajuda se o site e a API ficarem em domínios diferentes)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Método não permitido.' }); return; }

  const body = typeof req.body === 'string' ? safeParse(req.body) : (req.body || {});
  const { messages, model, temperature, max_tokens, userKey } = body;

  // chave: a própria do visitante (se ele colou uma nas configurações) ou a do servidor
  const key = (typeof userKey === 'string' && userKey.trim()) || process.env.OPENROUTER_API_KEY;
  if (!key) {
    res.status(500).json({ error: 'A IA não está configurada. Defina OPENROUTER_API_KEY no servidor (Vercel) ou cole sua própria chave do OpenRouter nas configurações.' });
    return;
  }

  if (!Array.isArray(messages) || !messages.length) { res.status(400).json({ error: 'Faltou "messages".' }); return; }
  if (JSON.stringify(messages).length > 24000) { res.status(413).json({ error: 'Pedido grande demais.' }); return; }

  const chosen = ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;

  try {
    const r = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'X-Title': 'Xadrez Offline',
      },
      body: JSON.stringify({
        model: chosen,
        messages,
        temperature: typeof temperature === 'number' ? Math.max(0, Math.min(2, temperature)) : 0.8,
        max_tokens: Math.min(Math.max(32, max_tokens || 400), 900),
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const msg = (data && data.error && (data.error.message || data.error)) || `Erro ${r.status} no OpenRouter.`;
      res.status(r.status).json({ error: String(msg) });
      return;
    }
    const text = data?.choices?.[0]?.message?.content || '';
    res.status(200).json({ text, model: chosen });
  } catch (e) {
    res.status(502).json({ error: 'Falha ao contatar o OpenRouter: ' + e.message });
  }
}

function safeParse(s) { try { return JSON.parse(s); } catch { return {}; } }
