# Xadrez Offline

Xadrez contra Stockfish 19 com rating Elo. Funciona 100% offline.

- Web: `npm start` → http://localhost:8080
- Testes: `npm test`

## Recursos de IA (OpenRouter) — opcional, precisa de internet

O app tem recursos extras que usam um modelo de linguagem via [OpenRouter](https://openrouter.ai):

- **Trash talk**: o adversário provoca durante a partida (com vários tons).
- **Comentário de lances**: a IA comenta automaticamente os seus lances.
- **Coach IA**: um chat para tirar dúvidas sobre a posição atual.
- **Análise pós-partida**: um resumo em texto dentro da tela de revisão.
- **Explicar abertura**: a IA descreve a ideia da abertura jogada.

A chave do OpenRouter **nunca** vai para o navegador: as chamadas passam por uma função
serverless (`api/chat.js`) que guarda a chave numa variável de ambiente. Por isso esses
recursos precisam de um servidor (não funcionam no GitHub Pages, que é só estático).

### Publicar na Vercel (recomendado para a IA)

1. Crie uma conta em [vercel.com](https://vercel.com) e importe este repositório.
2. A Vercel detecta sozinha: serve a pasta `public/` como site e `api/chat.js` como função.
   Os cabeçalhos COOP/COEP (necessários para o Stockfish) já estão em `vercel.json`.
3. Em **Settings → Environment Variables**, adicione:
   - `OPENROUTER_API_KEY` = sua chave do OpenRouter (começa com `sk-or-...`).
4. Faça o deploy. Pronto: abra a URL da Vercel no celular ou no PC.

No deploy da Vercel o motor completo de 95 MB é omitido automaticamente (só o motor leve vai);
o app esconde essa opção sozinho. O APK e o `npm start` local continuam com o motor completo.

Sem a variável no servidor, cada pessoa ainda pode colar a própria chave do OpenRouter nas
configurações do app (fica guardada só no aparelho dela). Se os recursos de IA ficarem
desligados, o app funciona 100% offline como antes.

## APK (Android)

**Na nuvem (sem instalar nada):** suba a pasta para um repositório no GitHub (branch `main`).
O workflow *Build APK* roda sozinho; baixe `app-debug.apk` em Actions → run → Artifacts.

**Local:** com Android Studio (ou JDK 21 + Android SDK) instalado:
```
npm install
npm run apk:debug
# APK em android/app/build/outputs/apk/debug/app-debug.apk
```
Para instalar: copie o APK ao celular e permita "instalar apps desconhecidos".
O APK não inclui o motor completo de 95 MB (os níveis 3500+ usam o motor leve pensando mais).

## Usar pelo celular (web)

1. Suba o projeto para um repositório no GitHub (branch `main`).
2. Em *Settings → Pages*, escolha **Source: GitHub Actions**. O workflow *Publicar site* roda sozinho.
3. Abra `https://SEU-USUARIO.github.io/NOME-DO-REPO/` no celular.
4. Chrome: menu ⋮ → *Adicionar à tela inicial*. Safari: Compartilhar → *Adicionar à Tela de Início*.
Depois da primeira visita (com internet) funciona offline. Sem o motor de 95 MB; os níveis 3500+ usam o motor leve pensando mais.
