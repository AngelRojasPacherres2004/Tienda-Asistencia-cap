import sys
import json
import tempfile
import unittest
from datetime import datetime
from pathlib import Path


PIPELINES_DIR = Path(__file__).resolve().parents[1] / "piplines"
sys.path.insert(0, str(PIPELINES_DIR))

import _base_ventas as ventas
import kpis_modelo as kpis
import homologaciones_usuario as homologaciones


class SalesRmsRulesTests(unittest.TestCase):
    def test_user_homologations_override_base_rules_without_editing_pipeline(self):
        previous = homologaciones.ARCHIVO_REGLAS
        try:
            with tempfile.TemporaryDirectory() as temporary:
                archivo = Path(temporary) / "homologaciones_usuario.json"
                archivo.write_text(
                    json.dumps({"marcas": {"NUEVA MARCA RMS": "MARCA OFICIAL"}}),
                    encoding="utf-8",
                )
                homologaciones.ARCHIVO_REGLAS = archivo
                marcas = {"OTRA": "OTRA"}
                homologaciones.aplicar_homologaciones_usuario(
                    {"marcas": marcas}, "prueba"
                )
                self.assertEqual(marcas["NUEVA MARCA RMS"], "MARCA OFICIAL")
        finally:
            homologaciones.ARCHIVO_REGLAS = previous

    def test_sales_headers_are_mapped_by_name_when_rms_reorders_and_extends_report(self):
        headers = (
            "FECHA Y HORA VENTA", "TIENDA", "CODIGO NISSEI", "PROVEEDOR", "LOTE",
            "RUBRO", "LINEA", "SUB LINEA", "MARCA", "MODELO", "DESCRIPCION",
            "DESC3", "CANT", "PRECIO SUGERIDO", "PRECIO REAL", "TOTAL VENTA",
            "ESTADO", "MES", "AÑO", "TIPO  DOCUM", "NRO.DOC", "SIZE", "COLOR",
            "EST TRABAJO", "VENDEDOR", "MONEDA", "NRO VTA", "NOMBRE VENDEDOR",
            "TEMPORADA", "CLIENTE", "CAMPAÑA",
        )

        self.assertTrue(ventas.es_encabezado_detalle_ventas(headers))
        mapped = ventas._mapear_columnas_por_nombre(headers, ventas.COLUMNAS_VENTAS)
        self.assertEqual(mapped["NRO VTA"], 26)
        self.assertEqual(mapped["TEMPORADA"], 28)
        self.assertEqual(mapped["CLIENTE"], 29)
        self.assertEqual(mapped["TTTT"], 27)

    def test_calzado_serie_is_published_from_desc3_or_renamed_rms_header(self):
        headers = (
            "FECHA Y HORA VENTA", "TIENDA", "CODIGO NISSEI", "CANT",
            "TOTAL VENTA", "SERIE",
        )
        mapped = ventas._mapear_columnas_por_nombre(headers, ventas.COLUMNAS_VENTAS)

        self.assertEqual(mapped["DESC3"], 5)
        self.assertEqual(
            ventas.COLUMNAS_CAPA2[ventas.COLUMNAS_CAPA2.index("descripcion") + 1],
            "serie",
        )
        self.assertIn("AS serie_origen", ventas.construir_sql_capa2(datetime(2026, 11, 3)))
        self.assertIn("END AS serie", ventas.construir_sql_capa2(datetime(2026, 11, 3)))

    def test_pivot_sheet_is_not_treated_as_sales_detail(self):
        self.assertFalse(
            ventas.es_encabezado_detalle_ventas(("MARCA", "H&M", "", ""))
        )

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
