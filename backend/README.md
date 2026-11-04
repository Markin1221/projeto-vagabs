# Backend (FastAPI + PostgreSQL)

## Rodar

    docker compose up -d                     # Postgres local (porta 5433)
    python -m venv .venv && .venv\Scripts\activate
    pip install -r requirements.txt
    copy .env.example .env
    python -m app.seed.carregar              # cria tabelas + insere/atualiza o que faltar (idempotente)
    python -m app.seed.carregar --reset      # APAGA tudo e recarrega do seed
    uvicorn app.main:app --reload            # docs em http://localhost:8000/docs
    pytest                                   # usa SQLite em memória

Ao subir, a API também cria sozinha as tabelas que faltarem. No Docker/Render, o `CMD` roda o seed antes do uvicorn.

**Rotas `def` (síncronas):** leitura de PDF/Excel é pesada. Declarar a rota com `def`, e não com `async def`, faz o
FastAPI rodar o trabalho numa thread à parte. Assim o `/saude` continua respondendo e o Render não reinicia o
servidor no meio do processamento. Leia o upload com `arquivo.file.read()`.

## Organização

| Arquivo | O que faz |
|---|---|
| `app/main.py` | monta a API, CORS, middleware de senha e `/saude` |
| `app/acesso.py` | `POST /login` troca `SENHA_ACESSO` por um token; as demais rotas exigem `Authorization: Bearer <token>` |
| `app/config.py` | lê o `.env` (variáveis de ambiente reais têm prioridade) |
| `app/models.py` | tabelas (SQLAlchemy 2) |
| `app/leitor_pdf.py` | lê o "Resumo Geral": tabelas de adicionais/descontos (inclusive as duas do PDF dos Sócios), quadros GPS/FGTS/DARF PIS, cabeçalho; `recorte_png` desenha o trecho do PDF |
| `app/folha.py` | regras do lançamento da folha, conferências e exportação CSV/Excel |
| `app/guias.py` | lê guias (FGTS Digital, DARF INSS) e compara com a soma das folhas |
| `app/quinzena.py` | quinzena dos permissionários |
| `app/comparador.py` | extrato do banco × planilha do DDATA |
| `app/caixinha.py` | caixinha → CSV |
| `app/raiox.py`, `raiox_excel.py`, `resumos.py` | área restrita (ver abaixo) |
| `app/classificador.py` | classificador antigo do extrato do Sol (rotas ainda ativas, fora do menu) |
| `app/seed/` | `carregar.py` + JSONs iniciais em `dados/` |
| `scripts/gerar_seed_da_planilha.py` | gerou uma vez o `eventos.json` a partir da planilha Contabil |

## Seed

`app/seed/dados/*.json` é a fonte dos dados iniciais. O que cada execução do seed faz:

- **Insere** o que falta: centros, itens, eventos, regras da quinzena e regras do classificador.
- **Atualiza** nome e tipo dos centros de custo, que são cadastro de referência e seguem o JSON.
- **Remove** linhas listadas em `LINHAS_REMOVIDAS`, por exemplo o antigo estorno da quinzena.
- **Não sobrescreve** eventos e regras que você editou pela tela.

Um evento do seed que você **excluiu** volta na próxima execução. Para tirá-lo de vez, desative o evento (`ativo=false`).

## Folha (PDF → lançamentos)

### Evento
- **`grupo`:** `folha` (departamentos) ou `conselho` (PDF dos Sócios/Conselho). O PDF é tratado como Conselho quando:
  - só tem colunas Sócios/Autônomos; ou
  - o departamento é "DEPARTAMENTO UNICO"; ou
  - o nome do arquivo fala em sócios, conselho ou diretoria.
- **`centro_custo_fixo`:** nulo = usa o centro do arquivo; senão (ex.: CTPAS) é fixo.
- **`gera_lancamento=false`:** evento conhecido que nunca vira linha (não dispara alerta de "evento novo").
- **`calculo`:** expressão para eventos derivados. `{Nome}` = coluna Total do PDF, `{Nome|Ativos}` = outra coluna (+ − * /).
- **Apelidos:** outros nomes que o PDF usa para o mesmo evento (`POST /eventos/{id}/apelidos`).

### Centro do arquivo
A ordem de prioridade é:
1. o escolhido na tela;
2. o padrão dos Sócios (ADM01);
3. o nome do arquivo;
4. o departamento no cabeçalho do PDF.

Qualquer centro pode ser escolhido, inclusive CTPAS e REC01.

### Rotas
- `POST /folha/lote/processar`: pré-checagem de vários PDFs (`arquivos`, `centros` repetido). Para cada arquivo
  devolve linhas, conferências (com a composição de cada total), `problemas` e avisos. PDFs de guia vêm com
  `tipo: "guia"`, e a conferência delas fica em `guias`.
- `POST /folha/lote/csv`: .zip com um arquivo por PDF (`formato=xlsx|csv`; as guias são ignoradas).
- `POST /folha/processar` e `POST /folha/csv`: o mesmo, para um PDF só.
- `POST /folha/trecho`: PNG do pedaço do PDF onde está um valor (`nome`, `origem` = resumo|gps|fgts|darf, `valor`).
- `GET/POST/PUT/DELETE /eventos`, `GET /centros-custo`, `GET /itens-despesa`.

### Guias de recolhimento
Cada tipo de guia é um item de `TIPOS` em `app/guias.py`, com quatro partes:
- o texto que identifica a guia;
- os campos a ler: regex do valor, ou, no DARF, a lista de códigos de receita;
- as comparações: campo da guia × soma de valores das folhas, com nome e quadro (`gps`, `fgts`, `darf`, `resumo`),
  e `"-"` para subtrair;
- a regex da competência.

Para suportar uma guia nova, acrescente um item e um PDF de exemplo em `tests/fixtures/`.

## Quinzena dos permissionários

- **Linhas** (`quinzena_linhas`): descrição, tipo, centro, item e fonte de cada linha do lançamento. A descrição sai
  como `"<linha> - <grupo>"`.
- **Regras** (`quinzena_regras`): "se o nome do evento contém X, vai para a linha Y". Vale a primeira na ordem.
  Linhas especiais:
  - `_saldo`: saldo negativo da quinzena anterior, que entra no crédito;
  - `_taxa`: taxa administrativa;
  - `_ignorar`: remuneração e pagantes;
  - `_terminais`: débito/crédito das intermunicipais, separado por prefixo do carro.
- **Crédito aos permissionários** = saldo negativo (342) − soma dos líquidos + adiantamentos. Pode ser informado à mão.
- **Taxa:** carros que pagaram × taxa da Cooperativa; o resto vai para o Sindicato. Os valores ficam em `configuracoes`.
- **Rotas:**
  - `POST /quinzena/processar` e `POST /quinzena/gerar`, com `arquivos`, `grupos`, `creditos`, `data`, `observacao`,
    `conta` e `formato`;
  - `GET/PUT /quinzena/config`;
  - `GET /quinzena/linhas`;
  - CRUD `/quinzena/regras`.

## Caixinha

A regra fixa fica em `REGRAS` (`app/caixinha.py`), e as criadas pela tela ficam na tabela `regras_caixinha`.

Rotas:
- `POST /caixinha/processar` e `POST /caixinha/csv`: um CSV por mês; vários meses saem num .zip;
- CRUD `/caixinha/regras`;
- `GET /caixinha/regras-fixas`.

## Extrato × DDATA

`POST /comparador/comparar` e `POST /comparador/xlsx`, com `extrato`, `ddata` e as opções `ignorar_rende`,
`ignorar_creditos` e `ignorar_datas`. Mande as opções **sempre explícitas**: bool ausente em multipart chega como `false`.

## Área restrita (Raio-X do caixa e Resumos financeiros)

Ela pede uma senha própria (`RAIOX_SENHA`), além da senha geral. O token vai no cabeçalho `X-Raiox-Token`.
**Defina `RAIOX_SENHA` no Render**, porque o padrão está no código.

### Raio-X / Tapa Buraco
É a auditoria mensal do extrato do DDATA Sol, no formato novo: Data, Título, Centro de Custo, Item de Despesa, Valor e Saldo.

- **`app/raiox.py`:** dois conjuntos de verificações.
  - Regras:
    - quinzena de taxa faltando;
    - contas de passagem negativas;
    - conta garantida;
    - vai-e-vem com o Posto;
    - duplicados;
    - saídas sem item ou com descrição sensível;
    - saldo que não fecha.
  - Modelo de picos: compara cada categoria, a receita e cada pagamento (z-score do log do valor por item) com os meses salvos.
- **Tabela `raiox_meses`:** um registro por mês, com o JSON completo. Os meses de nov/25 a fev/26 entram pelo seed como
  base da época boa.
- **`app/raiox_excel.py`:** relatório em Excel, com resumo do período, uma aba por mês e a época boa.
- **Parecer com IA:** `POST /raiox/meses/{id}/parecer` usa a API da Anthropic. Defina `ANTHROPIC_API_KEY` e, se quiser,
  `RAIOX_MODELO` (padrão `claude-sonnet-5-5`). Sem a chave, o resto funciona.

### Resumos financeiros
Transforma o "Relatório geral" bruto, um .xlsx por mês, em uma planilha ou PDF tratado de cada mês e um resumo de todos.

As contas são:

    Sub saldo = créditos − débitos
    Saldo     = sub saldo − motorista 1 − motorista 2 − permissionário

Os custos fixos ficam em faixas de meses na tabela `resumo_custos`. Eles podem ser digitados, colados como texto ou
lidos de planilha.

Rotas: `/resumos/custos` (`GET`/`PUT`, mais `/texto` e `/planilha`), `POST /resumos/previa` e `POST /resumos/gerar`.

## Testes

`pytest` sobe a API com SQLite em memória e o seed carregado. Os PDFs e planilhas de exemplo ficam em
`tests/fixtures/`: folhas de agosto, os Sócios de julho, guias de julho e relatórios da quinzena. Ao mexer numa
regra, rode os testes: eles comparam valores com as planilhas conferidas à mão.
