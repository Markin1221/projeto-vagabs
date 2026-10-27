"""Carrega os dados base (centros de custo, itens de despesa e eventos) no banco.

    python -m app.seed.carregar            # cria as tabelas e insere o que faltar (não mexe no que já existe)
    python -m app.seed.carregar --reset    # APAGA todas as tabelas e recria tudo do zero a partir do seed

Os JSONs em app/seed/dados/ vêm da planilha base (scripts/gerar_seed_da_planilha.py)."""
import argparse
import json
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import Base, engine
from ..models import CentroCusto, Evento, EventoApelido, ItemDespesa, RegraClassificacao, LinhaQuinzena, RegraQuinzena, Configuracao

DADOS = Path(__file__).parent / "dados"
CONFIG_PADRAO = {"taxa_cooperativa": "998.73", "taxa_sindicato": "133.38", "conta_quinzena": "46604-2",
                 # débito/crédito das intermunicipais: carro 04xx é do Terminal Tiuma, 11xx do Terminal Ponte
                 "terminais": '{"terminal_tiuma": ["04"], "terminal_ponte": ["11"]}'}


def _ler(nome):
    return json.loads((DADOS / f"{nome}.json").read_text(encoding="utf-8"))


def carregar(db: Session) -> dict:
    """Insere o que ainda não existe. Devolve quantos registros novos entraram em cada tabela."""
    novos = {"centros_custo": 0, "itens_despesa": 0, "eventos": 0}
    centros = {c.codigo: c for c in db.scalars(select(CentroCusto))}
    for d in _ler("centros_custo"):
        if d["codigo"] in centros:  # cadastro de referência: nome e tipo acompanham o seed
            centros[d["codigo"]].nome, centros[d["codigo"]].tipo = d["nome"], d["tipo"]
        else:
            centros[d["codigo"]] = CentroCusto(**d)
            db.add(centros[d["codigo"]])
            novos["centros_custo"] += 1
    itens = {i.codigo: i for i in db.scalars(select(ItemDespesa))}
    for d in _ler("itens_despesa"):
        if d["codigo"] not in itens:
            itens[d["codigo"]] = ItemDespesa(**d)
            db.add(itens[d["codigo"]])
            novos["itens_despesa"] += 1
    db.flush()
    def chave(grupo, nome, desc, tipo):
        # nome do PDF identifica o evento; calculados usam descrição + tipo (débito/crédito têm a mesma descrição)
        return (grupo, nome) if nome else (grupo, desc, tipo)

    existentes = {chave(e.grupo, e.nome_pdf, e.descricao, e.tipo_lancamento): e for e in db.scalars(select(Evento))}
    nomes_apelidos = {a.nome.lower() for a in db.scalars(select(EventoApelido))}
    for d in _ler("eventos") + _ler("eventos_conselho"):
        apelidos = d.pop("apelidos", [])
        ev = existentes.get(chave(d.get("grupo", "folha"), d["nome_pdf"], d["descricao"], d["tipo_lancamento"]))
        if ev is None:
            centro, item = d.pop("centro_custo_fixo"), d.pop("item_despesa")
            ev = Evento(**d, centro_custo_fixo=centros[centro] if centro else None,
                        item_despesa=itens[item] if item else None)
            db.add(ev)
            novos["eventos"] += 1
        for nome in apelidos:  # apelidos que faltam entram mesmo em evento já existente
            if nome.lower() not in nomes_apelidos:
                ev.apelidos.append(EventoApelido(nome=nome))
                nomes_apelidos.add(nome.lower())
    existentes_r = {(r.kw.upper(), r.nat) for r in db.scalars(select(RegraClassificacao))}
    novos["regras"] = 0
    for d in _ler("regras_classificacao"):
        if (d["kw"].upper(), d["nat"]) not in existentes_r:
            db.add(RegraClassificacao(**d))
            existentes_r.add((d["kw"].upper(), d["nat"]))
            novos["regras"] += 1
    # quinzena dos permissionários: linhas do lançamento, regras dos eventos e valores da taxa
    linhas_q = {l.codigo for l in db.scalars(select(LinhaQuinzena))}
    novos["quinzena_linhas"] = 0
    for d in _ler("quinzena_linhas"):
        if d["codigo"] not in linhas_q:
            db.add(LinhaQuinzena(**d)); novos["quinzena_linhas"] += 1
    regras_q = {r.padrao.upper() for r in db.scalars(select(RegraQuinzena))}
    novos["quinzena_regras"] = 0
    for d in _ler("quinzena_regras"):
        if d["padrao"].upper() not in regras_q:
            db.add(RegraQuinzena(**d)); novos["quinzena_regras"] += 1
    for chave, valor in CONFIG_PADRAO.items():
        if db.get(Configuracao, chave) is None:
            db.add(Configuracao(chave=chave, valor=valor))
    db.commit()
    return novos


def resetar(db_engine=engine) -> None:
    Base.metadata.drop_all(db_engine)
    Base.metadata.create_all(db_engine)


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--reset", action="store_true", help="apaga todas as tabelas antes de carregar")
    args = ap.parse_args()
    if args.reset:
        resetar()
    else:
        Base.metadata.create_all(engine)
    with Session(engine) as sessao:
        print("Inseridos:", carregar(sessao))
