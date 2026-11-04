import sys
import unittest
from datetime import datetime
from pathlib import Path


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "piplines"
sys.path.insert(0, str(PIPELINES_DIR))

import _base_ventas as ventas
import kpis_modelo as kpis


class SalesRmsRulesTests(unittest.TestCase):
    def test_clean_sales_exclude_canceled_and_preserve_same_source_lines(self):
        sql = ventas.construir_sql_capa2(datetime(2026, 11, 3))

        self.assertIn("AND estado <> 'ANULADO'", sql)
        self.assertNotIn("duplicados_exactos_ordenados AS", sql)
        self.assertIn("SELECT *\n        FROM control", sql)
        self.assertIn("AS linea_origen_id", sql)
        self.assertIn("AS tienda_rms", sql)

    def test_commercial_measures_follow_rms_reconciliation(self):
        measures = {measure.nombre: measure for measure in kpis.MEDIDAS}

        gross = measures["VENTA BRUTA"].expresion
        real_without_cn = measures["VENTA REAL SIN NC"].expresion
        discounts = measures["DESCUENTO TOTAL S/"].expresion
        credit_notes = measures["NOTAS DE CRÉDITO S/"].expresion
        net = measures["VENTA NETA"].expresion

        self.assertIn("FactVentas[cantidad] * FactVentas[precio_sugerido]", gross)
        self.assertIn('FactVentas[estado] <> "ANULADO"', gross)
        self.assertIn("FactVentas[total_venta]", real_without_cn)
        self.assertEqual(discounts, "[Venta Bruta] - [Venta Real Sin NC]")
        self.assertIn("MOVIMIENTO NEGATIVO", credit_notes)
        self.assertEqual(
            net,
            "[Venta Bruta] - [Descuento Total S/] - [Notas de Crédito S/]",
        )


if __name__ == "__main__":
    unittest.main()
