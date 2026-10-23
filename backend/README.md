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
