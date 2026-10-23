from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


PIPELINES = Path(__file__).resolve().parents[1] / "piplines"
sys.path.insert(0, str(PIPELINES))

from publicar_supabase import STATIC_CORE_FILES, YEARLY_DATASETS, discover_dashboard_files  # noqa: E402
from generar_datos_web import particionar_registros_anuales  # noqa: E402


class DashboardPartitionDiscoveryTests(unittest.TestCase):
    def touch(self, root: Path, *names: str) -> None:
        for name in names:
            (root / name).write_text("{}", encoding="utf-8")

    def test_prefers_year_partitions_over_legacy_monoliths(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-10.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}.json", f"{dataset}-2025.json", f"{dataset}-2026.json")

            files, missing = discover_dashboard_files(root)

            self.assertEqual(missing, [])
            for dataset in YEARLY_DATASETS:
                self.assertNotIn(f"{dataset}.json", files)
                self.assertIn(f"{dataset}-2025.json", files)
                self.assertIn(f"{dataset}-2026.json", files)

    def test_accepts_legacy_files_until_data_is_regenerated(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily.json")
            self.touch(root, *(f"{dataset}.json" for dataset in YEARLY_DATASETS))

            files, missing = discover_dashboard_files(root)

            self.assertEqual(missing, [])
            self.assertIn("dashboard-daily.json", files)
            for dataset in YEARLY_DATASETS:
                self.assertIn(f"{dataset}.json", files)

    def test_reports_each_missing_dataset(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            files, missing = discover_dashboard_files(root)

            self.assertEqual(files, STATIC_CORE_FILES)
            self.assertIn("dashboard.json", missing)
            self.assertIn("dashboard-sellers-AAAA.json", missing)
            self.assertIn("dashboard-daily-AAAA-MM.json", missing)

    def test_year_partition_preserves_every_original_row(self) -> None:
        source = [
            {"periodId": 202601, "storeId": "T001", "net": 10},
            {"periodId": 202512, "storeId": "T002", "net": 20},
            {"periodId": 202602, "storeId": "T003", "net": 30},
        ]

        files = particionar_registros_anuales(source, "dashboard-sellers", "sellerPerformance")
        restored = [
            row
            for name in sorted(files)
            for row in files[name]["sellerPerformance"]
        ]

        self.assertEqual(set(files), {"dashboard-sellers-2025.json", "dashboard-sellers-2026.json"})
        self.assertCountEqual(restored, source)

    def test_year_partition_rejects_rows_without_period(self) -> None:
        with self.assertRaisesRegex(ValueError, "periodId"):
            particionar_registros_anuales([{"storeId": "T001"}], "dashboard-sellers", "sellerPerformance")


if __name__ == "__main__":
    unittest.main()
