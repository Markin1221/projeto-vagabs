from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class CentroCusto(Base):
    """Centro de custo: departamentos (ADM01...), contas de passagem (CTPAS) e receitas (REC01)."""
    __tablename__ = "centros_custo"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(20), unique=True)
    nome: Mapped[str] = mapped_column(String(120))
    tipo: Mapped[str] = mapped_column(String(20))  # departamento | passagem | receita


class ItemDespesa(Base):
    """Item de despesa (70 Salários, 71 FGTS...; 500-506 = contas de passagem)."""
    __tablename__ = "itens_despesa"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[int] = mapped_column(Integer, unique=True)
    nome: Mapped[str] = mapped_column(String(200))
    grupo: Mapped[str] = mapped_column(String(20))  # despesa | passagem


class Evento(Base):
    """Uma linha que aparece no resumo da folha (ou calculada a partir dela) e, se `gera_lancamento`,
    vira uma linha do CSV de lançamentos. Cada evento sabe seu tipo (débito/crédito), seu item de despesa
    e seu centro de custo: fixo (ex.: INSS -> CTPAS) ou, se `centro_custo_fixo` é nulo, o do departamento
    escolhido ao enviar o PDF (ex.: Salário Base -> ADM01 na Administração, outro na Oficina)."""
    __tablename__ = "eventos"

    id: Mapped[int] = mapped_column(primary_key=True)
    ordem: Mapped[int] = mapped_column(Integer, index=True)  # posição da linha no CSV de lançamentos
    codigo_pdf: Mapped[str | None] = mapped_column(String(10))  # código no PDF (ex.: "001")
    nome_pdf: Mapped[str | None] = mapped_column(String(200), unique=True)  # nome exato no PDF; nulo se calculado
    descricao: Mapped[str] = mapped_column(String(200))  # texto da coluna "descricao" do CSV
    secao: Mapped[str] = mapped_column(String(20))  # adicional|desconto|total|gps|pis|fgts|calculado
    tipo_lancamento: Mapped[str | None] = mapped_column(String(10))  # DEBITO | CREDITO
    centro_custo_fixo_id: Mapped[int | None] = mapped_column(ForeignKey("centros_custo.id"))
    item_despesa_id: Mapped[int | None] = mapped_column(ForeignKey("itens_despesa.id"))
    gera_lancamento: Mapped[bool] = mapped_column(Boolean, default=True)
    calculo: Mapped[str | None] = mapped_column(Text)  # ex.: "{PIS Folha}" ou "{A} - {B|Ativos}"
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    grupo: Mapped[str] = mapped_column(String(20), default="folha")  # folha (departamentos) | conselho (sócios/autônomos)
    observacao: Mapped[str | None] = mapped_column(Text)  # nota livre (ex.: "item a confirmar")

    apelidos: Mapped[list["EventoApelido"]] = relationship(lazy="selectin", cascade="all, delete-orphan")
    centro_custo_fixo: Mapped[CentroCusto | None] = relationship(lazy="joined")
    item_despesa: Mapped[ItemDespesa | None] = relationship(lazy="joined")


class EventoApelido(Base):
    """Outro nome com que o mesmo evento aparece em PDFs diferentes (ex.: 'Periculosidade' = 'Periculosidade 30%').
    O valor do evento soma o nome principal e os apelidos."""
    __tablename__ = "eventos_apelidos"

    id: Mapped[int] = mapped_column(primary_key=True)
    evento_id: Mapped[int] = mapped_column(ForeignKey("eventos.id"))
    nome: Mapped[str] = mapped_column(String(200), unique=True)


class RegraClassificacao(Base):
    """Regra do classificador de extrato: se a palavra-chave aparece no título/descrição da linha (e, se
    `nat` estiver preenchido, o tipo bate), a linha recebe centro, item, fonte, forma e título abaixo.
    Textos no formato do DDATA Sol ("CTPAS - CONTAS DE PASSAGENS", "520 - FORNECEDORES A PAGAR DDA")."""
    __tablename__ = "regras_classificacao"

    id: Mapped[int] = mapped_column(primary_key=True)
    kw: Mapped[str] = mapped_column(String(200), index=True)
    nat: Mapped[str | None] = mapped_column(String(10))  # DEBITO | CREDITO | nulo = qualquer
    centro: Mapped[str] = mapped_column(String(120), default="")
    item: Mapped[str] = mapped_column(String(200), default="")
    fonte: Mapped[str] = mapped_column(String(120), default="")
    forma: Mapped[str] = mapped_column(String(80), default="")
    titulo: Mapped[str] = mapped_column(String(200), default="")


class LinhaQuinzena(Base):
    """Uma linha do lançamento da quinzena dos permissionários (ex.: 'Crédito/Pagto Óleo Diesel'). No arquivo sai
    como '<descricao> - <grupo>' (Interbairros, Alimentadora, Intermunicipal)."""
    __tablename__ = "quinzena_linhas"

    id: Mapped[int] = mapped_column(primary_key=True)
    codigo: Mapped[str] = mapped_column(String(40), unique=True)
    ordem: Mapped[int] = mapped_column(Integer)
    descricao: Mapped[str] = mapped_column(String(200))
    tipo_lancamento: Mapped[str] = mapped_column(String(10))  # CREDITO | DEBITO
    centro: Mapped[str] = mapped_column(String(20))
    item: Mapped[int | None] = mapped_column(Integer)
    fonte: Mapped[str | None] = mapped_column(String(10))


class RegraQuinzena(Base):
    """Se o nome do evento do relatório (sem o código) contém `padrao`, o valor vai para a linha `linha`.
    Linhas especiais: _saldo (saldo negativo da quinzena anterior), _taxa (taxa administrativa, dividida entre
    Cooperativa e Sindicato) e _ignorar (remuneração e pagantes: compõem o líquido, não viram lançamento)."""
    __tablename__ = "quinzena_regras"

    id: Mapped[int] = mapped_column(primary_key=True)
    ordem: Mapped[int] = mapped_column(Integer, default=1000)
    padrao: Mapped[str] = mapped_column(String(120))
    linha: Mapped[str] = mapped_column(String(40))


class Configuracao(Base):
    """Valores ajustáveis pelo usuário (ex.: taxa da cooperativa por carro)."""
    __tablename__ = "configuracoes"

    chave: Mapped[str] = mapped_column(String(60), primary_key=True)
    valor: Mapped[str] = mapped_column(String(200))


class RaioxMes(Base):
    """Um mês analisado pelo Raio-X do caixa. `dados` guarda o resultado inteiro (JSON): receita, despesas,
    contas de passagem, alertas, picos e estatísticas por item usadas pelo modelo. Meses `antigo` são a base
    da época boa (nov/25 a fev/26), carregados do seed."""
    __tablename__ = "raiox_meses"

    id: Mapped[str] = mapped_column(String(7), primary_key=True)  # AAAA-MM
    rotulo: Mapped[str] = mapped_column(String(10))  # jun/26
    formato: Mapped[str] = mapped_column(String(10))  # novo | antigo
    arquivo: Mapped[str] = mapped_column(String(200), default="")
    enviado_em: Mapped[str] = mapped_column(String(30), default="")
    dados: Mapped[str] = mapped_column(Text)
    parecer: Mapped[str | None] = mapped_column(Text)
    parecer_em: Mapped[str | None] = mapped_column(String(30))


class RaioxParecer(Base):
    """Parecer da IA que não pertence a um mês só (ex.: id 'completa' = análise do período inteiro)."""
    __tablename__ = "raiox_pareceres"

    id: Mapped[str] = mapped_column(String(20), primary_key=True)
    texto: Mapped[str] = mapped_column(Text)
    em: Mapped[str] = mapped_column(String(30))
    meses: Mapped[str] = mapped_column(String(60))  # período coberto quando foi gerado (ex.: "mai/26 a jun/26")
