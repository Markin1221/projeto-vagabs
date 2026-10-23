from typing import Literal

from pydantic import BaseModel, ConfigDict

Secao = Literal["adicional", "desconto", "total", "gps", "pis", "fgts", "calculado"]
Tipo = Literal["DEBITO", "CREDITO"]


class CentroCustoOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: str
    nome: str
    tipo: str


class ItemDespesaOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    codigo: int
    nome: str
    grupo: str


class EventoIn(BaseModel):
    """Cadastro de evento (ex.: evento novo que apareceu no PDF). Centro e item vão pelo CÓDIGO."""
    codigo_pdf: str | None = None
    nome_pdf: str | None = None
    descricao: str
    secao: Secao
    tipo_lancamento: Tipo | None = None
    centro_custo_fixo: str | None = None  # código (ex.: "CTPAS"); vazio = centro do departamento
    item_despesa: int | None = None       # código do item (ex.: 70)
    gera_lancamento: bool = True
    calculo: str | None = None
    ordem: int | None = None  # vazio = vai para o fim da lista
    grupo: Literal["folha", "conselho"] = "folha"
    observacao: str | None = None
    ativo: bool = True


class EventoOut(BaseModel):
    id: int
    ordem: int
    codigo_pdf: str | None
    nome_pdf: str | None
    descricao: str
    secao: str
    tipo_lancamento: str | None
    centro_custo_fixo: str | None
    item_despesa: int | None
    gera_lancamento: bool
    calculo: str | None
    ativo: bool
    apelidos: list[str] = []
    apelidos_ids: list[int] = []
    grupo: str = "folha"
    observacao: str | None = None


class ApelidoIn(BaseModel):
    nome: str
