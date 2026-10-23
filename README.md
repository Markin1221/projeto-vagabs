# Projeto VAGABS

Ferramentas de automação contábil da Coopernorte. O projeto está sendo reestruturado: as ferramentas
de desktop (PyQt6) viram um **site** com backend, banco de dados e frontend.

## Estrutura

```
projeto-vagabs/
├── backend/    API, regras de negócio, leitura dos PDFs e banco de dados   (novo)
├── frontend/   interface do site                                           (novo)
├── legado/     tudo que existia antes: apps PyQt6, testes, .exe, scripts
├── docs/       specs, planos e material de referência (docs/referencia/)
└── venv/       ambiente virtual local (não versionado)
```

- **`legado/`** continua funcionando sozinho: entre na pasta e rode `python appPrincipal.py`.
  Serve de referência da lógica já validada (leitura do PDF da folha, avaliação das fórmulas da
  planilha, classificador do extrato). O README antigo está em `legado/README.md`.
- **`backend/`** e **`frontend/`**: cada um tem um README com os requisitos já definidos.

## Objetivo do novo sistema

Enviar o PDF "Resumo Geral" da folha e receber o **CSV de lançamentos** (mesmo layout da aba
`lancamentos CSV` da planilha base), pronto para importar no outro sistema. Detalhes em
`backend/README.md`.
