# -*- mode: python ; coding: utf-8 -*-
from PyInstaller.utils.hooks import collect_all

datas = [('regras.json', '.'), ('quinzena/config_classificador.json', 'quinzena')]
binaries = []
hiddenimports = ['PyQt6', 'PyQt6.QtWidgets', 'pandas', 'numpy', 're', 'watchdog.observers', 'watchdog.events',
                 'openpyxl', 'pdfplumber']
for pacote in ('pdfplumber', 'pdfminer', 'pypdfium2'):  # leitura de PDF: leva dados/binários junto
    try:
        d, b, h = collect_all(pacote)
        datas += d; binaries += b; hiddenimports += h
    except Exception:
        pass

a = Analysis(
    ['appPrincipal.py'],
    pathex=[],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='appPrincipal',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
