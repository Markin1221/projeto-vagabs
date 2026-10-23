# Projeto VAGABS

## Descrição

Este projeto é um conjunto de ferramentas desenvolvidas em Python para facilitar a gestão de custos e processamento de dados em uma empresa. Originalmente criado para automatizar tarefas repetitivas de processamento de extratos e planilhas, o sistema permite refinar dados brutos e exportá-los para uso em planilhas predefinidas.

O projeto inclui uma interface gráfica principal que dá acesso a diferentes módulos:
- Processamento de Excel (Parte 1 e Parte 2)
- Monitoramento de pastas
- Renomeador de arquivos

## Funcionalidades

### App Principal
- Interface gráfica com botões para acessar cada módulo
- Gerenciamento de janelas independentes

### Processamento de Excel - Parte 1 (vagabsCopy.py)
- Seleção de arquivo Excel
- Extração de títulos, preços, CAP e fornecedores
- Geração de novo arquivo Excel refinado com colunas: documento, descrição, valor_monetário

### Processamento de Excel - Parte 2 (appContinued.py)
- Comparação de valores entre extratos e sistema
- Matching de valores para combinar dados
- Exportação de resultados para Excel

### Monitoramento de Pasta (avisos.py)
- Monitora mudanças em tempo real em uma pasta selecionada
- Detecta criação, modificação, exclusão e movimentação de arquivos
- Interface com log em tempo real

### Renomeador de Arquivos (hapvida.py)
- Renomeia arquivos em lote baseado em um dicionário de nomes
- Adiciona prefixo "CAP" com identificador
- Processa arquivos que não correspondem ao dicionário

## Instalação

### Pré-requisitos
- Python 3.8 ou superior
- Pip para gerenciamento de pacotes

### Passos
1. Clone o repositório:
   ```bash
   git clone https://github.com/Markin1221/projeto-vagabs.git
   cd projeto-vagabs
   ```

2. Crie um ambiente virtual (opcional, mas recomendado):
   ```bash
   python -m venv .venv
   # No Windows:
   .venv\Scripts\activate
   # No Linux/Mac:
   source .venv/bin/activate
   ```

3. Instale as dependências:
   ```bash
   pip install PyQt6 pandas numpy openpyxl watchdog
   ```

## Uso

### Executando a Aplicação
Execute o arquivo principal:
```bash
python appPrincipal.py
```

Isso abrirá a interface principal com botões para cada módulo.

### Criando Executável
O projeto inclui um arquivo `.spec` para PyInstaller. Para criar um executável:
```bash
pip install pyinstaller
pyinstaller appPrincipal.spec
```
O executável será gerado na pasta `dist/`.

## Estrutura do Projeto

```
projeto-vagabs/
├── appPrincipal.py          # Interface principal
├── vagabsCopy.py            # Processamento Excel Parte 1
├── appContinued.py          # Processamento Excel Parte 2
├── avisos.py                # Monitoramento de pasta
├── hapvida.py               # Renomeador de arquivos
├── appPrincipal.spec        # Configuração PyInstaller
├── build/                   # Arquivos de build
├── dist/                    # Executáveis gerados
├── __pycache__/             # Cache Python
├── vagabs antigo/           # Versão antiga do projeto
│   ├── README.md
│   ├── vagabs.py
│   └── ...
└── .venv/                   # Ambiente virtual
```

## Dependências

- **PyQt6**: Interface gráfica
- **pandas**: Manipulação de dados
- **numpy**: Computação numérica
- **openpyxl**: Leitura/escrita de Excel
- **watchdog**: Monitoramento de sistema de arquivos

## Desenvolvimento

### Ambiente de Desenvolvimento
O projeto usa um ambiente virtual localizado em `.venv/`. Ative-o antes de trabalhar:
```bash
.venv\Scripts\activate  # Windows
```

### Estrutura de Código
- Cada módulo é uma classe QWidget independente
- Comunicação entre threads usando queue para o monitoramento
- Processamento de dados usando pandas e numpy

## Contribuição

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/nova-feature`)
3. Commit suas mudanças (`git commit -am 'Adiciona nova feature'`)
4. Push para a branch (`git push origin feature/nova-feature`)
5. Abra um Pull Request

## Licença

Este projeto é de uso pessoal e não possui licença específica. Use por sua conta e risco.

## Autor

Markin1221

## Histórico

Este projeto foi desenvolvido para automatizar tarefas de gestão de custos em uma empresa anterior, reduzindo trabalho manual repetitivo.</content>
<parameter name="filePath">c:\Users\marki\OneDrive\Documentos\GitHub\projeto-vagabs\README.md