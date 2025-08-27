import pandas as pd


# Caminho do Excel
arquivo_teste = r'C:\Users\COOPERNORTE\Desktop\FACILITADORES\facilita2.0\experimental.xlsx'

# Leitura do arquivo Excel
df = pd.read_excel(arquivo_teste)

# Exibir o DataFrame
print(df)

# Nomes das colunas
dados = []
i = 0
indice = 'indice'
doc = 'doc'
valor_extrato = 'valor_extrato'
descricao = 'descricao'
valor_sys = 'valor_sys'

# Conversão das colunas em arrays, removendo espaços
indice_array = df[indice].astype(str).str.strip().values
doc_array = df[doc].astype(str).str.strip().values
valor_extrato_array = df[valor_extrato].astype(str).str.strip().values
descricao_array = df[descricao].astype(str).str.strip().values
valor_sys_array = df[valor_sys].astype(str).str.strip().values

colunas_necessarias = [indice, doc, valor_extrato, descricao, valor_sys]

for col in colunas_necessarias:
    if col not in df.columns:
        raise ValueError(f"Coluna '{col}' não encontrada no arquivo Excel.")

indices_usados = set()

while i < len(valor_extrato_array):
    valor = valor_extrato_array[i]
    encontrou = False

    for j in range(len(valor_sys_array)):
        if j in indices_usados:
            continue

        if valor == valor_sys_array[j]:
            dados.append({
                'valor_extrato': valor,
                'doc': doc_array[j],
                'descricao': descricao_array[j],
                'valor_sys': valor_sys_array[j],
            })
            indices_usados.add(j)
            encontrou = True
            break

    if not encontrou:
        dados.append({
            'valor_extrato': valor,
            'doc': '---',
            'descricao': '---',
            'valor_sys': '---',

        })
    i += 1

df2 = pd.DataFrame(dados)

df2.to_excel('arquivo_feito2.xlsx', index=False)