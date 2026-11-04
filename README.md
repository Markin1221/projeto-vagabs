# VAGABS

**Versátil Assistente de Gestão Administrativa, Business e Serviços** — as ferramentas de automação contábil da
Coopernorte num site só. Você envia os relatórios do mês e recebe os lançamentos prontos para importar no sistema
contábil, já com centro de custo, item de despesa e conferências.

🔗 **Acesse:** <https://projeto-vagabs.vercel.app> (pede a senha de acesso do sistema)

---

## O que o sistema faz

| Ferramenta | Você envia | Você recebe |
|---|---|---|
| **Folha de pagamento** (`/folha`) | PDFs "Resumo Geral" da folha (um ou vários departamentos e o dos Sócios/Conselho) e, junto, as guias do **FGTS Digital** e o **DARF do INSS** | Lançamentos por departamento (Excel ou CSV; vários PDFs saem num .zip), conferência dos totais de cada PDF, soma das folhas × valor de cada guia e alerta de evento novo |
| **Quinzena dos permissionários** (`/quinzena`) | Relatórios de remuneração da quinzena (.xlsx), um por grupo (Interbairros, Alimentadora, Intermunicipal) | Lançamentos por linha (crédito, óleo diesel, peças, bandeira, terminais, taxas…), com a composição de cada linha e conferência com o depósito |
| **Extrato × DDATA** (`/extrato`) | Extrato do banco e planilha do DDATA Sol | O que está no banco e falta no DDATA, valores em outra data e o que só existe no DDATA |
| **Caixinha** (`/caixinha`) | Planilha da caixinha (.xlsx) com um ou vários meses lado a lado | Um CSV por mês (vários meses saem num .zip), com títulos repetidos numerados (`01`, `02`…) |
| **Configurações** (`/config`) | — | Dicas passo a passo de cada tela (liga/desliga, salvo no navegador) e tema claro/escuro |

Em todas elas o sistema **não chuta**: o que não reconhece aparece como problema na tela e **bloqueia a geração** até
ser resolvido. Você classifica uma vez e a regra fica salva para os próximos meses.

Na Folha, qualquer total pode ser aberto para ver a soma que o forma, e qualquer valor mostra o pedaço do PDF de
onde ele saiu, com a linha destacada.

Há também uma **área restrita**, com senha própria, para a auditoria do caixa (Raio-X / Tapa Buraco) e os resumos
financeiros. Detalhes em [`backend/README.md`](backend/README.md).

### Formato dos arquivos de importação

**Folha e Caixinha:** 17 colunas.

```
titulo;descricao;tipo_lancamento;codigo_centro_de_custo;numero_conta;codigo_item_despesa;codigo_fonte_recurso;
id_forma_pagamento;num_parcelas;data_inicial;dias_intervalo;valor;observacoes;id_lancamento_grupo;
status_pagamento;data_liquidacao;banco_liquidacao
```

**Quinzena:** as 13 primeiras colunas (até `observacoes`).

Regras que valem para todos:

- **CSV:** separado por `;`, com vírgula decimal, datas `dd/mm/aaaa` e UTF-8 com BOM.
- **Excel (.xlsx):** as colunas de código ficam como **texto**, para o Excel não transformar `1-1` em data nem cortar o
  `*070`. Datas saem como data e valores como número.
- **Item de despesa:** abaixo de 100 vai com `*` e 3 dígitos (`28` → `*028`); de 100 para cima, como está (`500`).
- **Na Folha, `numero_conta` e `banco_liquidacao`** saem como `" 1-1"`, com um espaço antes, para continuar `1-1` mesmo
  ao abrir o CSV no Excel.

---

## Arquitetura

```
 Navegador ──► Frontend (Next.js, Vercel) ──► API (FastAPI, Render) ──► PostgreSQL (Neon)
```

```
projeto-vagabs/
├── backend/     API FastAPI: leitura de PDF/Excel, regras de negócio, banco, testes
│   ├── app/
│   │   ├── routers/        rotas por ferramenta (folha, quinzena, comparador, caixinha, raiox, resumos…)
│   │   ├── seed/dados/     centros de custo, itens, eventos, linhas e regras iniciais (JSON)
│   │   ├── leitor_pdf.py   leitura do PDF "Resumo Geral" (tabelas, quadros GPS/FGTS/DARF, recorte da linha)
│   │   ├── folha.py        PDF da folha → lançamentos e conferências
│   │   ├── guias.py        guias FGTS Digital / DARF INSS × soma das folhas
│   │   ├── quinzena.py     relatório da quinzena → lançamentos
│   │   ├── comparador.py   extrato × DDATA
│   │   ├── caixinha.py     planilha da caixinha → CSV
│   │   ├── raiox.py …      auditoria do caixa (área restrita)
│   │   └── acesso.py       senha de acesso do sistema
│   └── tests/              pytest (SQLite em memória) + arquivos de exemplo em fixtures/
├── frontend/    Next.js (app router)
│   ├── app/(sistema)/      telas do menu: folha, quinzena, extrato, caixinha, config
│   ├── app/pagina-secreta/ área restrita (casca e senha próprias)
│   └── public/             logos (claro/escuro)
├── legado/      apps antigos em PyQt6 (referência da lógica já validada)
├── docs/        specs, planos e planilhas de referência
└── render.yaml  blueprint do deploy da API no Render
```

---

## Rodando na sua máquina

**Requisitos:** Python 3.10+ (a produção usa 3.12), Node 18+ e Docker (para o Postgres local).

### Backend

```bash
cd backend
docker compose up -d                       # Postgres na porta 5433
python -m venv .venv
.venv\Scripts\activate                     # Linux/Mac: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                     # Linux/Mac: cp
python -m app.seed.carregar                # cria tabelas e insere/atualiza o que faltar (pode rodar sempre)
uvicorn app.main:app --reload              # http://localhost:8000/docs
```

Para outras pessoas no mesmo Wi-Fi acessarem, use `--host 0.0.0.0`, coloque `http://SEU-IP:3000` em `CORS_ORIGENS`
e libere as portas 3000 e 8000 no firewall.

### Frontend

```bash
cd frontend
npm install
echo NEXT_PUBLIC_API_URL=http://localhost:8000 > .env.local
npm run dev                                # http://localhost:3000
```

`npm run dev` mostra as mudanças na hora. Com `npm run build` + `npx next start`, é preciso **rodar o build de novo**
a cada mudança no front.

### Testes

```bash
cd backend
pytest
```

---

## Variáveis de ambiente (backend)

| Variável | Para quê |
|---|---|
| `DATABASE_URL` | Conexão com o Postgres (local ou Neon). A string `postgresql://…` do Neon pode ser colada como vem |
| `CORS_ORIGENS` | Endereços do frontend que podem chamar a API, separados por vírgula, sem `/` no final |
| `SENHA_ACESSO` | Senha única do sistema. Vazia = sem senha (só para uso local) |
| `RAIOX_SENHA` | Senha da área restrita. **Defina em produção** (o valor padrão está no código) |
| `ANTHROPIC_API_KEY` | Opcional: parecer com IA no Raio-X. Sem ela, o resto funciona |
| `RAIOX_MODELO` | Opcional: modelo usado no parecer (padrão `claude-sonnet-5-5`) |

No frontend, só `NEXT_PUBLIC_API_URL`: o endereço da API. Ele é gravado no build, então mudar exige novo deploy.

---

## Deploy

- **Frontend:** Vercel, com *Root Directory* `frontend` e `NEXT_PUBLIC_API_URL` apontando para a API.
  Cada `git push` na `main` publica de novo.
- **API:** Render, pelo blueprint `render.yaml` (Docker, plano grátis, health check em `/saude`). Ao subir, ela roda o
  seed: cria as tabelas novas, insere regras novas e corrige nomes de centros, sem apagar o que você cadastrou.
  Se o Render não atualizar sozinho: *Manual Deploy → Deploy latest commit*.
- **Banco:** Neon (Postgres 16).

### Quando algo dá errado

| Sintoma | O que fazer |
|---|---|
| "Não consegui falar com o servidor" / tela "Conectando…" | No plano grátis, a API dorme quando fica parada. A primeira chamada do dia leva cerca de 1 minuto |
| "Senha incorreta" com a senha certa | Confira `SENHA_ACESSO` no Render (sem aspas nem espaços) e espere o reinício |
| Erro de CORS no navegador | `CORS_ORIGENS` precisa ser exatamente a URL do Vercel |
| `relation "..." does not exist` (local) | Rode `python -m app.seed.carregar` |
| Mudou o front e o site continua igual | Confira se o arquivo entrou no commit (`git status`) e se o deploy no Vercel terminou |

---

Mais detalhes em [`backend/README.md`](backend/README.md) e [`frontend/README.md`](frontend/README.md).
