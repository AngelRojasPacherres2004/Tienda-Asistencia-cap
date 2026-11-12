import importlib.util
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "generate-annual-reports.py"
SPEC = importlib.util.spec_from_file_location("annual_reports", SCRIPT)
annual_reports = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(annual_reports)


class AnnualReportSourceTests(unittest.TestCase):
    def _root_with_core(self, directory: str) -> Path:
        root = Path(directory)
        capa2 = root / "capa2"
        capa2.mkdir()
        for kind in annual_reports.CORE_KINDS:
            (capa2 / ("Fact" + kind.capitalize() + ".parquet")).touch()
        return root

    def test_traffic_is_optional_when_only_rms_facts_exist(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self._root_with_core(directory)
            self.assertEqual(annual_reports.available_kinds(root), annual_reports.CORE_KINDS)

    def test_traffic_is_used_only_when_legacy_parquet_exists(self):
        with tempfile.TemporaryDirectory() as directory:
            root = self._root_with_core(directory)
            (root / "capa2" / "FactTraficoClientes.parquet").touch()
            self.assertEqual(
                annual_reports.available_kinds(root),
                annual_reports.CORE_KINDS + ("trafico",),
            )


if __name__ == "__main__":
    unittest.main()
