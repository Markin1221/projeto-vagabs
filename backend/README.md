# Backend (FastAPI + PostgreSQL)

## Rodar
    docker compose up -d                     # Postgres
    python -m venv .venv && .venv\Scripts\activate
    pip install -r requirements.txt
    copy .env.example .env
    python -m app.seed.carregar              # cria tabelas + insere o que faltar (idempotente)
    python -m app.seed.carregar --reset      # APAGA tudo e recarrega do seed
    uvicorn app.main:app --reload            # docs em http://localhost:8000/docs
    pytest                                   # usa SQLite em memória

## Seed (sem depender da planilha)
`app/seed/dados/*.json` (centros_custo, itens_despesa, eventos) são gerados UMA vez da planilha base:

    python scripts/gerar_seed_da_planilha.py [caminho.xlsx]

Depois disso a planilha não é mais usada em runtime; edite os JSONs ou use a API.

## Evento
- `centro_custo_fixo` nulo = usa o centro do departamento escolhido no upload; senão (ex.: CTPAS) é fixo.
- `gera_lancamento=false`: evento conhecido que nunca vira linha do CSV (não dispara alerta de "evento novo").
- `calculo`: expressão para eventos derivados. `{Nome}` = coluna Total do PDF, `{Nome|Ativos}` = outra coluna.

## Folha (PDF -> CSV de lançamentos)
- `POST /folha/processar` (multipart: `arquivo`=PDF, `centro_custo`=ex. ADM03, opcional: sem ele detecta pelo departamento do PDF) devolve as linhas, avisos e `eventos_novos`.
- `POST /folha/csv` (mesmos campos + `separador`=`;` e `decimal`=`,`) baixa o CSV com as 17 colunas do "lancamentos CSV".
- Evento com valor 0 ou ausente no PDF não vai para o CSV. Evento do PDF que não existe no banco gera alerta e fica fora do CSV até ser cadastrado (`POST /eventos`).
- Centro: evento com `centro_custo_fixo` usa ele (item de despesa sem prefixo, ex. 501); os demais usam o centro escolhido (item `*0`+código, ex. `*070`).
- Leitor do PDF: `app/leitor_pdf.py`; regras do CSV: `app/folha.py`. Fixture de teste: `tests/fixtures/folha_oficina.pdf`.

## Raio-X do caixa (aba protegida)

Auditoria mensal do extrato do DDATA Sol (formato novo: Data, Título, Centro de Custo, Item de Despesa, Valor, Saldo).
A aba tem senha própria (`RAIOX_SENHA`, padrão `secreta123`), pedida além da senha geral do sistema.

- `app/raiox.py`: regras (quinzena de taxa faltando, contas de passagem negativas, conta garantida, vai-e-vem com o Posto,
  duplicados, saídas sem item ou com descrição sensível, saldo que não fecha) e o modelo de picos: compara cada categoria,
  a receita e cada pagamento (z-score do log do valor por item) com todos os meses salvos.
- Tabela `raiox_meses`: um registro por mês (JSON completo). Os meses nov/25 a fev/26 entram pelo seed como base da época boa.
- Parecer com IA: `POST /raiox/meses/{id}/parecer` usa a API da Anthropic. Defina `ANTHROPIC_API_KEY`
  (e, se quiser, `RAIOX_MODELO`, padrão `claude-sonnet-5-5`). Sem a chave, o resto da aba funciona normalmente.
