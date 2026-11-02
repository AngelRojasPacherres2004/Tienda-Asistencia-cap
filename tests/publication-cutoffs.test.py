import contextlib
import io
import os
import sys
import tempfile
import unittest
from datetime import date
from pathlib import Path
from unittest.mock import patch

import duckdb

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'piplines'))
import aplicar_corte_modelo as model
import _base_stock as stock
from publication_cutoffs import configured_cutoff


class PublicationCutoffsTest(unittest.TestCase):
    def test_source_dates_do_not_invent_traffic_or_remove_confirmed_stock(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            con = duckdb.connect()
            for name, day in [('ventas', '2026-10-31'), ('trafico', '2026-10-25'), ('stock', '2026-11-01')]:
                con.execute(f"COPY (SELECT DATE '{day}' AS fecha) TO '{(root / (name + '.parquet')).as_posix()}' (FORMAT PARQUET)")
            con.close()
            sources = tuple(model.Fuente(name + '.parquet', label, 'fecha', 'diaria', 0) for name, label in [('ventas', 'Ventas'), ('trafico', 'Tráfico'), ('stock', 'Stock')])
            with patch.dict(os.environ, {'DASHBOARD_STOCK_CUTOFF': '2026-11-01', 'DASHBOARD_TRAFFIC_CUTOFF': '2026-10-25'}), patch.multiple(model, CAPA2_DIR=root, WORK_TEMP_DIR=root, REPORTE_COBERTURA=root / 'coverage.json', FUENTES=sources, preparar_directorios=lambda: None):
                result = model.aplicar(date(2026, 10, 31))
            self.assertEqual(result['selectedCutoff'], '2026-10-31')
            self.assertEqual(result['trafficCutoff'], '2026-10-25')
            self.assertEqual([s['dataThrough'] for s in result['sources']], ['2026-10-31', '2026-10-25', '2026-11-01'])
            self.assertTrue(all(s['rowsIncluded'] == 1 for s in result['sources']))

    def test_traffic_cannot_be_later_than_sales(self):
        with patch.dict(os.environ, {'DASHBOARD_TRAFFIC_CUTOFF': '2026-10-31'}):
            with self.assertRaises(ValueError):
                configured_cutoff('TRAFFIC', date(2026, 10, 25))

    def test_stock_discrepancy_requires_explicit_valuation_policy_and_keeps_source_total(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'stock.parquet'
            con = duckdb.connect()
            expressions = []
            for column in stock.COLUMNAS_CAPA1:
                value = {'cantidad': '1::BIGINT', 'precio_sugerido': '2400::DOUBLE', 'total_fuente': '22939.50::DOUBLE'}.get(column, "'dato'::VARCHAR")
                expressions.append(f'{value} AS "{column}"')
            con.execute(f"COPY (SELECT {','.join(expressions)}) TO '{path.as_posix()}' (FORMAT PARQUET)")
            with patch.dict(os.environ, {'DASHBOARD_STOCK_VALUE_POLICY': ''}):
                with self.assertRaises(RuntimeError):
                    stock.verificar_capa1(path, mostrar_detalle=False)
            with patch.dict(os.environ, {'DASHBOARD_STOCK_VALUE_POLICY': 'quantity-price'}), contextlib.redirect_stdout(io.StringIO()):
                result = stock.verificar_capa1(path, mostrar_detalle=False)
            self.assertEqual(result['totales_inconsistentes'], 1)
            self.assertEqual(con.execute('SELECT total_fuente FROM read_parquet(?)', [str(path)]).fetchone()[0], 22939.50)
            con.close()


if __name__ == '__main__':
    unittest.main()
