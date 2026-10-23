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
