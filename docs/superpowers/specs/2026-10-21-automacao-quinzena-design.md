# Automação da planilha de quinzena (Alimentadoras / Interbairros / Intermunicipal)

Data: 2026-10-21 · Status: **aguardando aprovação**

Legenda: **[Decisão]** = dita pelo usuário · **[Palpite]** = suposição minha, a confirmar · **[Minha escolha]** = decisão de implementação.

## 1. Intenção
Hoje, a cada quinzena, uma pessoa copia o extrato do sistema da empresa (DDATA SOL) para a aba `IMPORTAÇÃO` de uma planilha Excel, separa à mão os totais importantes, e as fórmulas do `Resumo` indexam esses totais nos centros de custo/grupos de lançamento. A aba `lancamentos` sai daí.
O objetivo é **automatizar essa tarefa; se não der, facilitá-la**. O programa deve reconhecer padrões das transações, indexá-las ao centro de custo certo e deixar **manual só o que não reconhecer**. **[Decisão]**

## 2. Entendimento da planilha atual (arquivos de exemplo em `quinz*.xlsx`)
- **`IMPORTAÇÃO` parte de cima (bruto):** uma linha por prefixo (ônibus); colunas = `"<id> - <TÍTULO>"` da transação (ex.: `28811 - DEBITO REF. A BATERIA`), mais `COMPRA DIRETA`, `NOTA DE SERVICO`, `TOTAL DIESEL`; linha `Total` ao fim. O número é o **id da transação** no sistema e o texto é o **título**. **[Decisão]**
- **`IMPORTAÇÃO` parte de baixo (importantes):** lista `F`=`id - título`, `G`=total, ordenada por valor (a partir da linha ~70). **[Decisão]**
- **`Resumo`:** coluna D lê `IMPORTAÇÃO!G<n>` por posição; coluna K soma linhas de D por grupo (ex.: `K12 = D10+D14+D15+...`, grupo 85 "Débitos de Acordo"); colunas P/Q/R/S geram DÉBITO/CRÉDITO/SALDO/COD. Há valores digitados à mão (ex.: `K8 = -8536.32`, `D5 = ...+8536.32`) e `#REF!` herdados.
- **`lancamentos`:** monta o arquivo de carga (título, descrição, tipo, centro de custo, conta, item, fonte, data, valor) lendo `Resumo!J/K`.
- **Problema central:** o `Resumo` depende da **posição** da linha, que muda quando a ordenação muda → fórmulas frágeis e retrabalho manual.

## 3. Extrato do DDATA SOL (entrada)
Arquivo exemplo: `EXTRATO_DO_SOL_abril2.xlsx` (1.629 linhas). Colunas: Data, Banco, Origem, Tipo (Débito/Crédito), Título, Descrição, Centro de Custo, Item de Despesa, Fonte de Recurso, Valor, Saldo, Obs. O usuário cola **todas** as linhas na `IMPORTAÇÃO`. **[Decisão]**
- Débitos vêm quase todos classificados (ex.: 520 fornecedor DDA ≈1.026; 584 estoque; 048 tarifas; 527 plano de saúde; 580 empréstimo; 522 repasse).
- Créditos (~100) vêm com item "—": entradas de COOPERNORTE (TED entre bancos), consórcio, terceiros, acordos, depósitos de permissionários, taxa cooperativa (ADM10).
- Transferências entre contas têm Origem="Transferência", sem título.

## 4. Objetivos
1. Ler o extrato do Sol e **sugerir** Centro de Custo, Item de Despesa, Fonte de Recurso e **grupo do Resumo** para cada linha/transação.
2. Marcar claramente o que **não** foi reconhecido ("MANUAL") para o usuário decidir, e **lembrar** a decisão (vira regra nova).
3. Gerar totais por `id - título` independentes de posição, e preencher `Resumo` e `lancamentos` com os mesmos números que a planilha manual daria.
4. Reproduzir o resultado das planilhas de exemplo (teste de regressão) com diferença zero, exceto linhas explicitamente marcadas manuais.

## 5. Não-objetivos
- Não substituir o DDATA SOL nem lançar nele (o script Tampermonkey existente já cuida do preenchimento lá).
- Não corrigir a contabilidade em si; só reproduzir/automatizar o processo atual.
- Primeira versão **sem** aprendizado de máquina; só regras explícitas + estatística dos dados históricos. **[Minha escolha]**

## 6. Anti-objetivos (falha mesmo se "funcionar")
- Classificar errado em silêncio. Na dúvida, MANUAL.
- Soma não bater com o total do extrato (todo processamento termina com checagem: soma por grupo = soma do extrato).
- Quebrar as fórmulas existentes da planilha do usuário.

## 7. Regras de classificação (ordem de prioridade) **[Decisão + Palpite]**
1. **Regras explícitas** em `regras.json` já existente no repo (`kw` → `centro`, `item`, `forma`, `titulo`). Reaproveitar o arquivo e o formato. **[Minha escolha]**
2. **Classificação já presente no extrato** (Item de Despesa ≠ "—") é respeitada.
3. **Favorecido conhecido:** o favorecido (nome + CNPJ/CPF) está na **Descrição** do extrato, truncado (ex.: `TED … 053259114000117 CLETO CORREIA`). O mesmo favorecido vai para 580 (valor baixo, acordo) ou 522 (valor alto, repasse); decide-se pelo valor mais próximo no histórico e, se cair numa faixa ambígua, MANUAL. **[Decisão do usuário: o nome da empresa de transporte aparece como "hamilton jose trans", "transporte" etc., não no Título.]**
3b. **Heurísticas do usuário (favorecido desconhecido):** valor alto para nome com "trans/transporte" na Descrição ⇒ repasse ao permissionário (item 522, grupo 74); boleto ⇒ normalmente fornecedor (520); TED/transferência ⇒ pessoa, repasse ou acordo (580). Limiar de "valor alto" **[Palpite]**: configurável, a definir com dados.
4. **Padrões do histórico** (títulos como `NFe - # Parcela #/#`, `PGTO. DO HAPVIDA…`, `TARIFA BANCARIA`, `Deposito Permissionários …`) aprendidos das ~1.500 linhas classificadas de abril.
5. Nada casou ⇒ **MANUAL**; a escolha do usuário é gravada em `regras.json` para a próxima vez.

## 8. Fluxo e saídas
Entrada: extrato Sol (xlsx) + planilha-modelo da quinzena (xlsx).
1. Classifica linhas → aba/arquivo de **revisão** (linha, sugestão, motivo da regra, MANUAL em destaque).
2. Usuário resolve os MANUAL.
3. Gera `IMPORTAÇÃO` (bruto + importantes por `id - título`), `Resumo` (soma por grupo via **busca por id/título, não por posição**) e `lancamentos`.
4. Relatório de conferência (totais por grupo, diferença com o extrato, itens manuais).
Formato de saída: xlsx no layout atual, para o usuário abrir e revisar. **[Palpite]**

## 9. Restrições e stack
- Repo existente `projeto-vagabs`: Python + PyQt6 + pandas + openpyxl; já tem `regras.json`, módulos separados e `appPrincipal.py`. Novo módulo entra como mais um botão no app principal. **[Minha escolha]**
- Windows, planilhas no OneDrive; sem dependências pesadas.
- Os xlsx de exemplo são dados reais da empresa: **não** commitar no git (usar `.gitignore`/pasta local de testes). **[Minha escolha]**

## 10. Pontos em aberto para o construtor/usuário
- Mapa **grupo do Resumo → quais `id - título`** (hoje embutido nas fórmulas de `Resumo!K`). Deve ser extraído das planilhas de exemplo para um arquivo de configuração (JSON/YAML), por tipo de linha (Alimentadoras, Interbairros, Intermunicipal têm layouts levemente diferentes).
- Abas `Valor Liquido`, `Tiuma e Ponte` e `Itens Despesas Resumido`: função e origem dos dados ainda não analisadas.
- Valores digitados à mão no `Resumo` (taxas cooperativa/sindicato, ajustes): ficam como entradas manuais explícitas do programa.
- Como o "bruto por prefixo" na parte de cima da `IMPORTAÇÃO` é produzido a partir do extrato (qual campo identifica o prefixo?).
- Limiar de "valor alto" e lista de empresas de transporte/permissionários (pode ser derivada dos títulos históricos).

## 11. Entrega em duas partes
- **Parte 1:** classificador do extrato + revisão de MANUAL + aprendizado de regras.
- **Parte 2:** geração de `IMPORTAÇÃO`/`Resumo`/`lancamentos` com conferência.
Critério de pronto da Parte 1: sobre o extrato de abril, a classificação concorda com a do Sol nas linhas já classificadas e lista os "—" como sugestão ou MANUAL.
