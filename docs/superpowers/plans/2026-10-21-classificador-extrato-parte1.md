# Classificador do extrato (Parte 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ler o extrato do DDATA SOL, sugerir Centro de Custo / Item de Despesa / Fonte de Recurso para cada linha, marcar o que não reconhece como MANUAL e gravar as decisões manuais como regras novas.

**Architecture:** Pacote `quinzena/` com módulos pequenos (leitura, regras, classificação, revisão em xlsx, GUI PyQt6). Classificação em cascata: regras explícitas → classificação já presente no Sol → heurísticas do usuário → padrões aprendidos do histórico → MANUAL. Reaproveita `regras.json` da raiz.

**Tech Stack:** Python 3.8+, pandas, openpyxl, PyQt6, pytest.

**Spec:** `docs/superpowers/specs/2026-10-21-automacao-quinzena-design.md`

## Global Constraints

- Reaproveitar o formato de `regras.json`: lista de objetos `{"kw","centro","item","forma","titulo"}` (a `kw` é comparada em MAIÚSCULAS, contida no texto).
- Na dúvida, MANUAL; nunca classificar em silêncio com baixa confiança.
- Valores no formato do extrato: coluna `Valor` numérica, débito negativo; `"—"` significa vazio.
- Não commitar planilhas reais (adicionar `*.xlsx` de exemplo ao `.gitignore`); testes usam DataFrames pequenos sintéticos.
- O favorecido (nome e CNPJ/CPF) vem na **Descrição**, nunca no Título (ex.: `TED TRANSF.ELETR.DISPONIV - 403 0001 053259114000117 CLETO CORREIA`). Nome truncado em ~15 caracteres. O mesmo favorecido pode ir para 580 (valor baixo) ou 522 (valor alto).
- Limiar de "valor alto" configurável, padrão 5000 (**palpite**, usado só para favorecido desconhecido).
- Novo módulo entra como botão em `appPrincipal.py`; não alterar os módulos existentes além disso.

## Review Focus

- Arquivo de extrato com linhas em branco/rodapé (`EXTRATOBANCO--->>>`): devem ser ignoradas, não geram erro.
- `regras.json` vazio (0 bytes) ou com `kw` duplicada: o carregamento não quebra; duplicada vence a primeira.
- Descrição `TRANSF.ELETR`/`TRANSFERÊNCIA ENVIADA` contém "TRANS": a palavra de transporte só vale sobre o **nome extraído**, nunca sobre o texto todo.
- Favorecido sem CNPJ/CPF na descrição (`PIX - ENVIADO - 20/04 13:57 CEF MATRIZ`): extrai só o nome, sem quebrar.
- Crédito grande de COOPERNORTE ("TED ENTRE BANCOS") não pode virar repasse a permissionário.
- Valor 0, `NaN` ou texto no campo `Valor`: a linha vai para MANUAL, não derruba o processo.
- Título com números diferentes mas mesmo padrão (`NFe - 123 Parcela 1/4` vs `NFe - 9 Parcela 2/2`) deve cair no mesmo padrão aprendido.

---

### Task 1: Leitura e normalização do extrato

**Files:**
- Create: `quinzena/__init__.py`, `quinzena/extrato.py`
- Test: `tests/quinzena/test_extrato.py`

**Interfaces:**
- Produces: `carregar_extrato(caminho: str) -> pd.DataFrame` com colunas `data, origem, tipo, titulo, descricao, centro, item, fonte, valor, obs`; `"—"`/vazio vira `None`; `valor` é `float` (inválido → `NaN`); linhas sem `tipo` e sem `titulo` (rodapé/branco) são removidas; índice original preservado em coluna `linha_origem`.

- [ ] **Step 1: Write failing tests** `test_ignora_rodape_e_linhas_vazias`, `test_traco_vira_none` (item "—" → `None`), `test_valor_invalido_vira_nan`. Cria xlsx temporário com `openpyxl` replicando o layout: título na linha 1, cabeçalho na linha 2 (colunas B:M), rodapé com `EXTRATOBANCO--->>>` na coluna `Valor`.
- [ ] **Step 2: Run** `pytest tests/quinzena/test_extrato.py -v` → FAIL (módulo inexistente).
- [ ] **Step 3: Implement** `carregar_extrato` com `pd.read_excel(header=1, usecols="B:M")`, renomeando colunas para snake_case sem acento.
- [ ] **Step 4: Run** os testes → PASS.
- [ ] **Step 5: Commit** `feat: leitura do extrato do Sol`.

### Task 2: Motor de regras explícitas

**Files:**
- Create: `quinzena/regras.py`
- Test: `tests/quinzena/test_regras.py`

**Interfaces:**
- Produces: `@dataclass Regra(kw, centro, item, forma, titulo)`; `carregar_regras(caminho: str) -> list[Regra]` (arquivo vazio/ausente → `[]`; `kw` duplicada mantém a primeira); `casar_regra(regras: list[Regra], texto: str) -> Regra | None` (kw contida em `texto.upper()`, primeira vence); `salvar_regra(caminho: str, regra: Regra) -> None` (acrescenta sem reordenar nem duplicar kw).

- [ ] **Step 1: Write failing tests** `test_arquivo_vazio_retorna_lista_vazia`, `test_kw_duplicada_mantem_primeira`, `test_casar_ignora_caixa`, `test_salvar_regra_nao_duplica`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** os quatro itens acima; `salvar_regra` grava JSON com `ensure_ascii=False, indent=2`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: motor de regras explícitas`.

### Task 3: Padrões e favorecidos aprendidos do histórico

**Files:**
- Create: `quinzena/padroes.py`
- Test: `tests/quinzena/test_padroes.py`

**Interfaces:**
- Consumes: DataFrame de `carregar_extrato`.
- Produces: `normalizar_titulo(titulo: str) -> str` (dígitos → `#`, espaços colapsados, MAIÚSCULAS); `aprender_padroes(df: pd.DataFrame, consistencia: float = 0.95) -> dict[str, tuple[str, str, str | None]]` mapeando padrão → `(centro, item, fonte)` só quando ≥ `consistencia` das linhas classificadas daquele padrão concordam e há ≥ 3 amostras. Linhas com `item` vazio não entram no aprendizado.

- Também produz: `extrair_favorecido(descricao: str) -> tuple[str | None, str | None]` devolvendo `(documento, nome)`: documento = primeira sequência de 11 ou 14 dígitos, nome = texto após ela (ou após data/hora `dd/mm hh:mm`, ou após o prefixo `TRANSFERÊNCIA ENVIADA -`/`PIX - ENVIADO -`), em MAIÚSCULAS, sem agência/banco; `aprender_favorecidos(df) -> dict[str, list[tuple[float, str]]]` mapeando documento (ou nome, se não houver documento) → lista de `(abs(valor), item)` só de débitos com item classificado.

- [ ] **Step 1: Write failing tests** `test_extrair_favorecido_ted_com_cnpj` (`"TED TRANSF.ELETR.DISPONIV - 403 0001 053259114000117 CLETO CORREIA"` → `("053259114000117","CLETO CORREIA")`), `test_extrair_favorecido_sem_documento` (`"TRANSFERÊNCIA ENVIADA - 15/04 15:01 GIUSEPPE BRUNO NETO"` → `(None,"GIUSEPPE BRUNO NETO")`), `test_aprender_favorecidos_guarda_valor_e_item`, `test_normaliza_digitos` (`"NFe - 123 Parcela 1/4"` e `"NFe - 9 Parcela 2/2"` → mesmo padrão), `test_padrao_consistente_aprendido`, `test_padrao_ambiguo_nao_aprendido`, `test_poucas_amostras_nao_aprendido`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** com `groupby` sobre `normalizar_titulo` e `value_counts`.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: padrões aprendidos do histórico`.

### Task 4: Classificador em cascata

**Files:**
- Create: `quinzena/classificador.py`, `quinzena/config_classificador.json` (`{"limiar_valor_alto": 5000, "palavras_transporte": ["\\bTRANS(P|PORTES?)?\\b","VIACAO|VIAÇÃO"]}`; **palpite**, editável)
- Test: `tests/quinzena/test_classificador.py`

**Interfaces:**
- Consumes: `Regra`, `casar_regra`, `aprender_padroes`, `normalizar_titulo`.
- Produces: `@dataclass Sugestao(centro, item, fonte, origem_regra: str, manual: bool)` onde `origem_regra ∈ {"regra","sol","heuristica","historico","manual"}`; `classificar_linha(linha: pd.Series, regras, padroes, config: dict) -> Sugestao`; `classificar(df, regras, padroes, config) -> pd.DataFrame` (colunas novas `sug_centro, sug_item, sug_fonte, origem_regra, manual`).
- Ordem: (1) regra explícita sobre `titulo + " " + descricao`; (2) `item` já presente no Sol; (3) **favorecido conhecido** (só débito): usa as observações `(valor, item)` do favorecido; se todas têm o mesmo item, usa esse; se há itens diferentes (ex.: 580 baixo e 522 alto), pega o item da observação de valor mais próximo, e se o valor cai entre o maior valor do item baixo e o menor do item alto → MANUAL; (4) heurísticas (só débito, favorecido desconhecido): nome extraído casa `\bTRANS(P|PORTES?)?\b` (ou `VIACAO|VIAÇÃO`) e `abs(valor) ≥ limiar` → `522 - REPASSE AO PERMISSIONÁRIO`; texto com `BOLETO` → `520 - FORNECEDORES A PAGAR DDA`; demais TED/PIX para pessoa → MANUAL; (5) padrão aprendido do título; (6) MANUAL. Crédito sem regra nem padrão → MANUAL (nunca heurística). `Origem == "Transferência"` → MANUAL com `521 - TRANSFERÊNCIAS ENTRE BANCOS` apenas como sugestão e `manual=True`. `valor` NaN ou 0 → MANUAL. `origem_regra` ganha o valor `"favorecido"`.
- `classificar_linha(linha, regras, padroes, favorecidos, config)` e `classificar(df, regras, padroes, favorecidos, config)` (favorecidos = saída de `aprender_favorecidos`); `config_classificador.json` usa `palavras_transporte` só como lista de regex sobre o nome.

- [ ] **Step 1: Write failing tests** `test_regra_explicita_vence`, `test_item_do_sol_e_respeitado`, `test_favorecido_conhecido_valor_baixo_580_alto_522`, `test_favorecido_valor_na_faixa_ambigua_vai_para_manual`, `test_hamilton_jose_trans_alto_vira_522`, `test_transferencia_na_descricao_nao_conta_como_transporte`, `test_credito_coopernorte_nao_vira_repasse`, `test_valor_nan_vai_para_manual`, `test_padrao_historico_aplicado`, `test_desconhecido_vai_para_manual`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `classificar_linha` aplicando a ordem acima, retornando no primeiro passo que casar; `classificar` aplica por linha.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat: classificador em cascata`.

### Task 5: Revisão em xlsx, aprendizado das decisões e GUI

**Files:**
- Create: `quinzena/revisao.py`, `quinzena/app_classificador.py`
- Modify: `appPrincipal.py` (novo botão que abre `AppClassificador`)
- Test: `tests/quinzena/test_revisao.py`

**Interfaces:**
- Consumes: saída de `classificar`.
- Produces: `exportar_revisao(df: pd.DataFrame, caminho: str) -> None` (aba "Revisão" com linhas MANUAL no topo, destacadas em amarelo, colunas editáveis `decisao_centro, decisao_item, decisao_fonte`; aba "Resumo" com contagem por `origem_regra` e soma do `valor` por item sugerido, mais conferência soma total = soma do extrato); `importar_decisoes(caminho: str, regras_path: str) -> int` (lê as decisões preenchidas, grava cada uma via `salvar_regra` com `kw` = padrão normalizado do título e devolve quantas regras novas); `class AppClassificador(QWidget)` com botões "Selecionar extrato", "Classificar e gerar revisão", "Importar decisões", seguindo o estilo de `AppDiferençaExtratos.py`.

- [ ] **Step 1: Write failing tests** `test_manual_aparece_primeiro`, `test_soma_resumo_igual_soma_extrato`, `test_importar_decisoes_cria_regra_e_retorna_contagem`, `test_importar_sem_decisoes_retorna_zero`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** `exportar_revisao` e `importar_decisoes` com openpyxl; GUI chama os módulos anteriores com `regras.json` da raiz e `config_classificador.json`.
- [ ] **Step 4: Run** `pytest tests/quinzena -v` → todos PASS; abrir o app e processar `EXTRATO_DO_SOL_abril2.xlsx` (teste manual): débitos já classificados concordam com o Sol; créditos com "—" aparecem como sugestão ou MANUAL.
- [ ] **Step 5: Commit** `feat: revisão em xlsx, aprendizado e GUI do classificador`.
