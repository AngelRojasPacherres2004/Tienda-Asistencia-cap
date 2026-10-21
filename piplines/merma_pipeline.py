from __future__ import annotations
from runtime_config import finalizar_proceso
import argparse, sys
from modelo_relacional import transformar_merma, validar_claves
from wrapper_utils import ejecutar_base
from pathlib import Path
from project_paths import PROJECT_ROOT
BASE = PROJECT_ROOT

def main()->int:
 p=argparse.ArgumentParser(description="Merma manual -> FactMerma relacional")
 g=p.add_mutually_exclusive_group(); g.add_argument("--solo-capa2",action="store_true"); g.add_argument("--verificar-capa1",action="store_true"); g.add_argument("--verificar-capa2",action="store_true")
 a=p.parse_args()
 try:
  if a.verificar_capa2:
   print(validar_claves(BASE/"capa2"/"FactMerma.parquet",["merma_id","fecha_id","tienda_id"])); return 0
  args=["--verificar-capa1"] if a.verificar_capa1 else ([] if not a.solo_capa2 else ["--solo-capa2"])
  ejecutar_base("_base_merma.py",args)
  if not a.verificar_capa1: print(f"Resultado modelo: {transformar_merma()}")
  return 0
 except Exception as e: print(f"\nERROR EN MERMA: {e}",file=sys.stderr); return 1
if __name__ == "__main__":
    finalizar_proceso(main())
