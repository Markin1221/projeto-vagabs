# Frontend (Next.js)

Next.js 14 (app router) com React 18, sem biblioteca de UI: CSS próprio em `app/globals.css`, e `app/mobile.css`
para celular. O tema claro/escuro usa tokens em `:root` / `[data-theme="dark"]`.

## Rodar

    npm install
    echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local
    npm run dev        # http://localhost:3000 (a API precisa estar no ar)

`NEXT_PUBLIC_API_URL` é gravada no build. No Vercel, mudar essa variável exige um novo deploy.

## Estrutura

| Caminho | O que é |
|---|---|
| `app/layout.jsx` | HTML base, fonte IBM Plex Sans e tema aplicado antes de pintar |
| `app/(sistema)/layout.jsx` | casca do sistema: menu lateral com as ferramentas, logo por tema, login e botão de tema |
| `app/(sistema)/folha`, `quinzena`, `extrato`, `caixinha`, `config` | uma rota por ferramenta; cada uma usa os componentes da pasta de mesmo nome (`app/folha/`, `app/quinzena/`…) |
| `app/pagina-secreta/` | área restrita, com casca, senha e visual próprios. Operações em `operacoes.js` |
| `app/ui/` | componentes comuns: `Modal`, `Soltar` (envio de arquivo), `Dica` (passo a passo), `Fonte` (recorte do PDF), ícones |
| `app/lib.js` | `API`, `api()`, `autFetch()`, `fmt()`, `emMemoria()`, `mensagemDeErro()` |
| `app/config.js` | preferências da pessoa (dicas ligadas/desligadas), salvas no `localStorage` |
| `app/Login.jsx` | tela da senha de acesso |
| `public/logo-claro.png`, `logo-escuro.png` | logos de cada tema |

## Convenções

- **Chamadas à API:** sempre por `api()` (JSON) ou `autFetch()` (upload/download). Elas mandam o token da senha e,
  se a API responder 401, voltam para a tela de login.
- **Arquivos escolhidos:** passam por `emMemoria()` antes de ir para o estado. Isso evita "Failed to fetch" quando o
  arquivo é salvo de novo no disco depois de escolhido. Reenviar um arquivo com o mesmo nome substitui o anterior.
- **Erros:** mostre `mensagemDeErro(x)`, que troca "Failed to fetch" por uma mensagem que a pessoa entende.
- **Bloquear a geração:** enquanto houver `problemas` na pré-checagem, o botão de gerar fica desabilitado e diz quantos faltam.
- **Nova ferramenta no menu:** crie `app/(sistema)/<rota>/page.jsx` e acrescente um item na lista do
  `app/(sistema)/layout.jsx`. Coloque um `<Dica passos={[…]} />` no topo da tela.
- **Nova operação na área restrita:** crie `app/pagina-secreta/<nome>/page.jsx` e registre em `operacoes.js`.
