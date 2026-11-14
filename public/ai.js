// ai.js — cliente da IA (OpenRouter via proxy /api/chat).
// A chave do OpenRouter fica no servidor; o navegador só fala com /api/chat.
// Recursos: trash talk do adversário, comentário de lances, coach por chat,
// análise pós-partida e explicação de aberturas.
import { S } from './store.js';

const ENDPOINT = '/api/chat';
export const MODELS = [
  ['openai/gpt-4o-mini', 'GPT-4o mini (rápido e barato)'],
  ['anthropic/claude-3.5-haiku', 'Claude 3.5 Haiku'],
  ['google/gemini-2.0-flash-001', 'Gemini 2.0 Flash'],
  ['deepseek/deepseek-chat', 'DeepSeek Chat'],
  ['meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B'],
  ['openai/gpt-4o', 'GPT-4o (melhor, mais caro)'],
  ['anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet (melhor, mais caro)'],
];

export const aiOn = () => !!(S.ai && S.ai.on);

export const PERSONAS = {
  provocador: 'um enxadrista brincalhão e provocador, que solta tiradas espertas mas de bom humor (nunca ofensivo, sem palavrões, sem nada pesado)',
  gentil: 'um treinador simpático e encorajador, que provoca de leve mas sempre com carinho',
  grandmestre: 'um grande mestre arrogante e teatral, cheio de pose, que acha graça dos seus lances',
  robo: 'um robô frio e sarcástico que fala de forma curta e mecânica, zoando com lógica implacável',
};

// chamada base ao proxy
export async function chat(messages, { temperature = 0.8, max_tokens = 400, signal } = {}) {
  const body = { messages, model: (S.ai && S.ai.model) || 'openai/gpt-4o-mini', temperature, max_tokens };
  if (S.ai && S.ai.key) body.userKey = S.ai.key;
  const r = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  let data = {};
  try { data = await r.json(); } catch {}
  if (!r.ok) throw new Error(data.error || `Erro ${r.status}`);
  return (data.text || '').trim();
}

// descreve a vantagem a partir do cp (do ponto de vista de quem está sendo descrito)
function edgeText(cpForSide) {
  if (cpForSide == null) return 'posição incerta';
  const a = Math.abs(cpForSide);
  const side = cpForSide > 0 ? 'a seu favor' : 'contra você';
  if (a < 30) return 'posição equilibrada';
  if (a < 90) return `leve vantagem ${side}`;
  if (a < 250) return `vantagem clara ${side}`;
  if (a < 600) return `grande vantagem ${side}`;
  return cpForSide > 0 ? 'posição ganha para você' : 'posição perdida para você';
}

// ---------- trash talk ----------
// ctx: { level, lastSan, playerColor, cpForEngine (cp do ponto de vista do computador), movesSan }
export async function trashTalk(ctx, opts = {}) {
  const persona = PERSONAS[(S.ai && S.ai.persona)] || PERSONAS.provocador;
  const sys = `Você é o adversário de xadrez de um app, jogando contra o usuário. Personagem: ${persona}. `
    + `Responda em português do Brasil, com UMA frase curta (no máximo ~15 palavras), em primeira pessoa, como se fosse você jogando contra a pessoa. `
    + `É só diversão: provoque sobre a partida, nunca seja realmente ofensivo nem use xingamentos.`;
  const edge = edgeText(ctx.cpForEngine);
  const user = `Nível do computador: ${ctx.level}. Situação atual (sua, o computador): ${edge}. `
    + (ctx.lastSan ? `Último lance jogado no tabuleiro: ${ctx.lastSan}. ` : '')
    + `Solte uma provocação curta.`;
  return chat([{ role: 'system', content: sys }, { role: 'user', content: user }],
    { temperature: 1.0, max_tokens: 60, ...opts });
}

// ---------- comentário de um lance ----------
// ctx: { san, byUser, cpBeforeForUser, cpAfterForUser, classLabel }
export async function commentMove(ctx, opts = {}) {
  const sys = 'Você é um treinador de xadrez simpático. Responda em português do Brasil, '
    + '1 a 2 frases curtas, direto ao ponto, explicando a ideia do lance para um jogador amador.';
  const who = ctx.byUser ? 'o jogador (usuário)' : 'o computador';
  const delta = (ctx.cpBeforeForUser != null && ctx.cpAfterForUser != null)
    ? `Saldo de material para o usuário antes: ${(ctx.cpBeforeForUser / 100).toFixed(1)}, depois: ${(ctx.cpAfterForUser / 100).toFixed(1)} (em peões; positivo = material a mais).` : '';
  const user = `Lance de ${who}: ${ctx.san}. ${ctx.classLabel ? `Classificação do motor: ${ctx.classLabel}. ` : ''}${delta} `
    + 'Comente o que esse lance fez (bom ou ruim) e, se foi ruim, a ideia melhor — sem notação longa.';
  return chat([{ role: 'system', content: sys }, { role: 'user', content: user }],
    { temperature: 0.6, max_tokens: 160, ...opts });
}

// ---------- coach: pergunta livre sobre a posição ----------
// ctx: { fen, movesSan, turn, cpForUser, level }, history: [{role,content}...]
export async function coach(question, ctx, history = [], opts = {}) {
  const sys = 'Você é um treinador de xadrez paciente e didático, falando português do Brasil. '
    + 'Dê conselhos práticos para um amador, com no máximo 4 frases. Pode citar lances em notação curta (ex.: Cf3, e4), '
    + 'mas não invente lances ilegais. Se não tiver certeza, seja honesto.';
  const pos = `Posição atual (FEN): ${ctx.fen}. Lances até agora: ${ctx.movesSan || '(início)'}. `
    + `Vez de: ${ctx.turn === 'w' ? 'brancas' : 'pretas'}. `
    + (ctx.cpForUser != null ? `Saldo de material para o usuário: ${edgeText(ctx.cpForUser)}. ` : '')
    + (ctx.level ? `Nível do adversário: ${ctx.level}.` : '');
  const messages = [
    { role: 'system', content: sys + '\n\n' + pos },
    ...history.slice(-8),
    { role: 'user', content: question },
  ];
  return chat(messages, { temperature: 0.5, max_tokens: 350, ...opts });
}

// ---------- análise pós-partida ----------
// sum: resumo já calculado pelo review; ctx: { color, result, oppElo, openingName }
export async function gameSummary(sum, ctx, opts = {}) {
  const sys = 'Você é um treinador de xadrez. Escreva um resumo da partida em português do Brasil, '
    + 'em 3 a 5 frases, tom encorajador e concreto: o que foi bem, os principais erros e 1 ou 2 conselhos '
    + 'para a pessoa melhorar. Não use notação longa nem invente dados.';
  const t = sum.table[ctx.color] || {};
  const stats = `Resultado: ${ctx.result}. Você jogou de ${ctx.color === 'w' ? 'brancas' : 'pretas'} contra nível ${ctx.oppElo}. `
    + `Abertura: ${ctx.openingName || 'desconhecida'}. `
    + `Sua precisão: ${sum.accUser != null ? sum.accUser.toFixed(0) + '%' : '–'}. `
    + `Contagem dos seus lances — brilhantes: ${t.brilliant || 0}, ótimos: ${t.great || 0}, imprecisões: ${t.inaccuracy || 0}, erros: ${t.mistake || 0}, erros graves: ${t.blunder || 0}, oportunidades perdidas: ${t.miss || 0}. `
    + `Precisão por fase — abertura: ${fmt(sum.phases.opening)}, meio-jogo: ${fmt(sum.phases.middlegame)}, final: ${fmt(sum.phases.endgame)}.`;
  return chat([{ role: 'system', content: sys }, { role: 'user', content: stats }],
    { temperature: 0.6, max_tokens: 320, ...opts });
}
const fmt = (v) => (v == null ? '–' : v.toFixed(0) + '%');

// ---------- explicar a abertura ----------
export async function explainOpening(name, eco, movesSan, opts = {}) {
  const sys = 'Você é um treinador de xadrez. Explique a abertura em português do Brasil, em 3 a 4 frases: '
    + 'a ideia principal, os planos típicos de cada lado e um erro comum a evitar. Para um amador.';
  const user = `Abertura: ${name}${eco ? ` (ECO ${eco})` : ''}. Lances jogados: ${movesSan || '(poucos lances)'}.`;
  return chat([{ role: 'system', content: sys }, { role: 'user', content: user }],
    { temperature: 0.5, max_tokens: 260, ...opts });
}
