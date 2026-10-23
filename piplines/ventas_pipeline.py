from __future__ import annotations
from runtime_config import finalizar_proceso
import argparse, sys
from modelo_relacional import transformar_ventas, validar_claves
from wrapper_utils import ejecutar_base
from pathlib import Path
from project_paths import PROJECT_ROOT
BASE = PROJECT_ROOT

def main()->int:
 p=argparse.ArgumentParser(description="Ventas RMS -> Capa 1 + FactVentas lista para Power BI")
 g=p.add_mutually_exclusive_group(); g.add_argument("--solo-capa1",action="store_true"); g.add_argument("--solo-capa2",action="store_true"); g.add_argument("--verificar-capa1",action="store_true"); g.add_argument("--verificar-capa2",action="store_true")
 a=p.parse_args()
 try:
  if a.verificar_capa2:
   r=validar_claves(BASE/"capa2"/"FactVentas.parquet",["venta_linea_id","fecha_id","tienda_id","producto_id"]); print(r); return 0
  args=[]
  if a.solo_capa1: args=["--solo-capa1"]
  elif a.solo_capa2: args=["--solo-capa2"]
  elif a.verificar_capa1: args=["--verificar-capa1"]
  ejecutar_base("_base_ventas.py",args)
  if not (a.solo_capa1 or a.verificar_capa1):
   print(f"Resultado modelo: {transformar_ventas()}")
  return 0
 except Exception as e: print(f"\nERROR EN VENTAS: {e}",file=sys.stderr); return 1
if __name__ == "__main__":
    finalizar_proceso(main())
