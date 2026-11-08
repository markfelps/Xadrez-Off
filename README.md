# Xadrez Offline

Xadrez contra Stockfish 19 com rating Elo. Funciona 100% offline.

- Web: `npm start` → http://localhost:8080
- Testes: `npm test`

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
