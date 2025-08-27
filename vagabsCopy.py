import pandas as pd
import numpy as np
import re
from tkinter import Tk, filedialog, Label, Button, Entry

#entrada = '354 5684 512 012 13 872 95'
def processar_arquivo():
  global arquivo_excel
  arquivo_excel = filedialog.askopenfilename(title="Selecione o arquivo Excel 2", filetypes=[("Arquivos Excel", "*.xlsx")])

#nome das colunas
#convertendo para arrays e removendo espaços extras

#doc_em_array = df[coluna_doc1].astype(str).str.strip().values exemplo de outro codigo
# numeros_precos = entrada.split(' ')
# precos_busca = [f"{float(valor):.2f}" for valor in numeros_precos]

def extracao_titulo(titulo):
    
    numero = re.search(r'\b\d+\b', titulo)
    numero = numero.group() if numero else 'Não encontrado'
    
    parcela = re.search(r'\b\d+/\d+\b', titulo)
    parcela = parcela.group() if parcela else 'Não encontrada'
    
    return numero, parcela

#exemplo de outro codigo
# def extrair_numero_e_parcela(titulo):
#     # Capturar o primeiro número (isolado) do título
#     numero = re.search(r"\b\d+\b", titulo)
#     numero = numero.group() if numero else "Não encontrado"
    
#     # Capturar o formato de parcela (ex: 3/3, 2/5)
#     parcela = re.search(r"\b\d+/\d+\b", titulo)
#     parcela = parcela.group() if parcela else "Não encontrada"
    
#     return numero, parcela
def resto():
 df = pd.read_excel(arquivo_excel)
 
 titulo = 'Titulo'
 preco = 'Valor'
 cap = 'Cap'
 empresa = 'Fornecedor'
 
 titulo_array = df[titulo].astype(str).str.strip().values
 preco_array = df[preco].astype(str).str.strip().values
 cap_array = df[cap].astype(str).str.strip().values
 empresa_array = df[empresa].astype(str).str.strip().values
 
 dados = []

 for titulo in titulo_array:
    numero, parcela = extracao_titulo(titulo)
    
    # Encontrar o índice do título no array utilizando np.where
    indice = np.where(titulo_array == titulo)[0][0]
    
    # Certificar que cap_valor seja tratado como string
    cap_valor = cap_array[indice]
    if pd.isna(cap_valor):
        cap_valor = 'N/A'  # Substituir valores NaN por 'N/A'
    else:
        cap_valor = str(int(float(cap_valor))) if cap_valor.replace('.', '', 1).isdigit() else str(cap_valor)
        
        preco_valor = preco_array[indice]
    # Criar a lista de descrição e converter todos os valores para string
    descricao = ['CAP',cap_valor,'/', empresa_array[indice],'-', parcela]
    descricao = [str(item) for item in descricao]  # Garante que todos os itens sejam strings
    
    # Adicionar os dados no acumulador
    dados.append({'documento': numero, 'descricao': ' '.join(descricao), 'valor_monetario': preco_valor})

 # Criar DataFrame com os dados acumulados
 df2 = pd.DataFrame(dados)

 # Salvar o DataFrame como arquivo Excel
 df2.to_excel('arquivo_feito.xlsx', index=False)
 
janela = Tk()
janela.title("facilitador do processamento dos extratos")

Label(janela, text="Selecione aqui o arquivo do sistema").pack()
Button(janela, text="Selecione a planilha", command=processar_arquivo).pack()

Button(janela, text="processar", command=resto).pack()
label_status = Label(janela, text="")
label_status.pack()

janela.mainloop()
