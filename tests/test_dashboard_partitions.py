from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


PIPELINES = Path(__file__).resolve().parents[1] / "piplines"
sys.path.insert(0, str(PIPELINES))

from publicar_supabase import STATIC_CORE_FILES, YEARLY_DATASETS, discover_dashboard_files  # noqa: E402
from generar_datos_web import (  # noqa: E402
    particionar_registros_anuales, particionar_registros_mensuales, resumir_marcas,
    resumir_marcas_por_rubro,
    resumir_rangos_precio, resumir_vendedores,
)


class DashboardPartitionDiscoveryTests(unittest.TestCase):
    def test_brand_category_summary_keeps_category_and_totals(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "X", "brand": "Z", "net": 10, "units": 2},
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "B", "subline": "Y", "brand": "Z", "net": 7, "units": 1},
            {"periodId": 202601, "storeId": "T001", "category": "CALZADO", "line": "C", "subline": "X", "brand": "Z", "net": 4, "units": 1},
        ]
        summary = resumir_marcas_por_rubro(rows)
        self.assertEqual(len(summary), 2)
        self.assertEqual((summary[0]["category"], summary[0]["net"], summary[0]["units"]), ("TEXTIL", 17, 3))
        self.assertEqual(summary[1]["category"], "CALZADO")
        self.assertNotIn("line", summary[0])

    def test_price_summary_preserves_band_totals_for_each_store_and_month(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "X",
             "bandOrder": 1, "priceBand": "S/ 0–30", "net": 10, "units": 2},
            {"periodId": 202601, "storeId": "T001", "category": "CALZADO", "line": "B", "subline": "Y",
             "bandOrder": 1, "priceBand": "S/ 0–30", "net": 7, "units": 1},
            {"periodId": 202602, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "X",
             "bandOrder": 2, "priceBand": "S/ 31–60", "net": 5, "units": 1},
        ]
        summary = resumir_rangos_precio(rows)
        self.assertEqual(len(summary), 2)
        self.assertEqual((summary[0]["bandOrder"], summary[0]["net"], summary[0]["units"]), (1, 17, 3))
        self.assertEqual((summary[1]["periodId"], summary[1]["net"]), (202602, 5))

    def test_seller_summary_preserves_ranking_metrics_per_period_and_store(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "X",
             "seller": "ANA", "net": 10, "units": 2, "transactions": 1},
            {"periodId": 202601, "storeId": "T001", "category": "CALZADO", "line": "B", "subline": "Y",
             "seller": "ANA", "net": 7, "units": 1, "transactions": 2},
            {"periodId": 202602, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "X",
             "seller": "ANA", "net": 5, "units": 1, "transactions": 1},
            {"periodId": 202601, "storeId": "T002", "category": "TEXTIL", "line": "A", "subline": "X",
             "seller": "ANA", "net": 3, "units": 1, "transactions": 1},
        ]
        summary = resumir_vendedores(rows)
        self.assertEqual(len(summary), 3)
        self.assertEqual((summary[0]["net"], summary[0]["units"], summary[0]["transactions"]), (17, 3, 3))
        self.assertEqual((summary[1]["periodId"], summary[2]["storeId"]), (202602, "T002"))

    def test_brand_summary_preserves_totals_without_empty_dimensions(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "brand": "A", "category": "TEXTIL", "net": 10, "units": 2},
            {"periodId": 202601, "storeId": "T001", "brand": "A", "category": "CALZADO", "net": 7, "units": 1},
        ]
        self.assertEqual(resumir_marcas(rows), [{
            "periodId": 202601, "storeId": "T001", "brand": "A", "net": 17.0, "units": 3.0,
        }])

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

    def test_includes_complete_seller_summaries_and_rejects_missing_years(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-10.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2025.json", f"{dataset}-2026.json")
            self.touch(root, "dashboard-sellers-summary-2025.json")
            files, missing = discover_dashboard_files(root)
            self.assertIn("dashboard-sellers-summary-2025.json", files)
            self.assertIn("dashboard-sellers-summary-2026.json", missing)
            self.touch(root, "dashboard-sellers-summary-2026.json")
            files, missing = discover_dashboard_files(root)
            self.assertEqual(missing, [])
            self.assertIn("dashboard-sellers-summary-2026.json", files)

    def test_discovers_monthly_seller_detail_without_replacing_annual_fallback(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-01.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2026.json")
            self.touch(root, "dashboard-sellers-2026-01.json")
            files, missing = discover_dashboard_files(root)
            self.assertEqual(missing, [])
            self.assertIn("dashboard-sellers-2026.json", files)
            self.assertIn("dashboard-sellers-2026-01.json", files)

    def test_requires_price_summaries_for_each_existing_price_year(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-01.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2025.json", f"{dataset}-2026.json")
            self.touch(root, "dashboard-price-range-summary-2025.json")
            files, missing = discover_dashboard_files(root)
            self.assertIn("dashboard-price-range-summary-2025.json", files)
            self.assertIn("dashboard-price-range-summary-2026.json", missing)
            self.touch(root, "dashboard-price-range-2026-01.json")
            files, _ = discover_dashboard_files(root)
            self.assertIn("dashboard-price-range-2026-01.json", files)

    def test_requires_brand_category_summary_for_each_existing_year(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-01.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2025.json", f"{dataset}-2026.json")
            self.touch(root, "dashboard-brand-category-2025.json")
            files, missing = discover_dashboard_files(root)
            self.assertIn("dashboard-brand-category-2025.json", files)
            self.assertIn("dashboard-brand-category-2026.json", missing)

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

    def test_month_partition_preserves_rows_and_rejects_invalid_month(self) -> None:
        rows = [
            {"periodId": 202602, "storeId": "T001", "net": 2},
            {"periodId": 202601, "storeId": "T002", "net": 3},
            {"periodId": 202602, "storeId": "T003", "net": 4},
        ]
        files = particionar_registros_mensuales(rows, "dashboard-sellers", "sellerPerformance")
        self.assertEqual(set(files), {"dashboard-sellers-2026-01.json", "dashboard-sellers-2026-02.json"})
        self.assertCountEqual(
            [row for payload in files.values() for row in payload["sellerPerformance"]], rows,
        )
        with self.assertRaisesRegex(ValueError, "periodId"):
            particionar_registros_mensuales([{"periodId": 202613}], "dashboard-sellers", "sellerPerformance")


if __name__ == "__main__":
    unittest.main()
