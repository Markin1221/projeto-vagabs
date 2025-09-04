from tkinter import Tk, filedialog, Label, Button
import pandas as pd

def processar_arquivo():
    arquivo = filedialog.askopenfilename(
        title="Selecione o arquivo Excel",
        filetypes=[("Arquivos Excel", "*.xlsx")]
    )
    return arquivo

def processar_dados(arquivo):
    if not arquivo:
        print("Nenhum arquivo selecionado.")
        return

    df = pd.read_excel(arquivo)

    print(df)

    # Nomes das colunas
    dados = []
    i = 0
    indice = 'indice'
    doc = 'doc'
    valor_extrato = 'valor_extrato'
    descricao = 'descricao'
    valor_sys = 'valor_sys'

    # Verifica se as colunas existem
    colunas_necessarias = [indice, doc, valor_extrato, descricao, valor_sys]
    for col in colunas_necessarias:
        if col not in df.columns:
            raise ValueError(f"Coluna '{col}' não encontrada no arquivo Excel.")

    # Conversão das colunas em arrays, removendo espaços
    indice_array = df[indice].astype(str).str.strip().values
    doc_array = df[doc].astype(str).str.strip().values
    valor_extrato_array = df[valor_extrato].astype(str).str.strip().values
    descricao_array = df[descricao].astype(str).str.strip().values
    valor_sys_array = df[valor_sys].astype(str).str.strip().values

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
    print("Processamento concluído. Arquivo salvo como 'arquivo_feito2.xlsx'.")

def selecionar_e_processar():
    arquivo = processar_arquivo()
    processar_dados(arquivo)
    label_status.config(text="Processamento concluído!")

# Interface gráfica
janela = Tk()
janela.title("Facilitador de Processamento de Extratos")
janela.geometry("250x100")

Label(janela, text="Selecione o arquivo do sistema para processar").pack(pady=10)
Button(janela, text="Selecionar e Processar", command=selecionar_e_processar).pack(pady=5)
label_status = Label(janela, text="")
label_status.pack(pady=10)

janela.mainloop()
