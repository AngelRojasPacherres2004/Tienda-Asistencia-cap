"""The stock import retains every physical code behind a shared shoe series."""

import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import duckdb


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "import-dashboard-stock.py"
SPEC = importlib.util.spec_from_file_location("stock_import", SCRIPT)
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class StockSkuCatalogTest(unittest.TestCase):
    def test_two_codes_for_one_series_remain_separate_skus(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "capa2").mkdir()
            path = root / "capa2" / "FactStock.parquet"
            con = duckdb.connect()
            try:
                con.execute(
                    "COPY (SELECT * FROM (VALUES "
                    "('2026-11-30'::DATE, 'S_shoe', 'P_001', '10001', 'URBAN 25'), "
                    "('2026-11-30'::DATE, 'S_shoe', 'P_002', '20008', 'URBAN 25'), "
                    "('2026-10-31'::DATE, 'S_shoe', 'P_old', '99999', 'URBAN 25')"
                    ") AS t(fecha_corte,producto_id,sku_id,codigo_nissei,serie)) "
                    "TO ? (FORMAT PARQUET)", [str(path)],
                )
            finally:
                con.close()
            with patch.object(MODULE, "ROOT", root):
                rows = MODULE.stock_skus("2026-11-30", {"S_shoe"})
            self.assertEqual({row[2:4] for row in rows}, {("P_001", "10001"), ("P_002", "20008")})
            self.assertEqual({row[4] for row in rows}, {"URBAN 25"})


if __name__ == "__main__":
    unittest.main()
