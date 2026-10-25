from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path


PIPELINES = Path(__file__).resolve().parents[1] / "piplines"
sys.path.insert(0, str(PIPELINES))

from publicar_supabase import STATIC_CORE_FILES, YEARLY_DATASETS, discover_dashboard_files  # noqa: E402
from compactar_dashboard import (  # noqa: E402
    compactar_diario, compactar_predictivo, compactar_registros,
    candidatos_traslado, compactar_stock, descompactar_diario, descompactar_predictivo, descompactar_registros,
    descompactar_stock, resumir_stock_jerarquia,
)
from particionar_dashboard import scope_payload  # noqa: E402
from generar_datos_web import (  # noqa: E402
    particionar_registros_anuales, particionar_registros_compactos_anuales,
    particionar_registros_mensuales, resumir_marcas,
    resumir_marcas_por_rubro,
    resumir_rangos_precio, resumir_rangos_precio_por_rubro, resumir_vendedores, resumir_vendedores_por_rubro,
)


class DashboardPartitionDiscoveryTests(unittest.TestCase):
    def test_predictive_compaction_keeps_sku_windows_and_store_scope(self) -> None:
        rows = [
            {"storeId": "T001", "productId": "P1", "units60": 0.0, "units90": 0.0, "merma30": 0.0, "merma60": 0.0, "merma90": 0.0},
            {"storeId": "T002", "productId": "P2", "units60": 3.0, "units90": 5.0, "merma30": 0.0, "merma60": 1.0, "merma90": 1.0},
        ]
        payload = compactar_predictivo(rows, "Nota")
        self.assertEqual(descompactar_predictivo(payload), {"note": "Nota", "rows": rows})
        scoped = scope_payload({"predictiveCompact": payload}, {"T001"})["predictiveCompact"]
        self.assertEqual(descompactar_predictivo(scoped)["rows"], rows[:1])
        self.assertNotIn("P2", scoped["dictionary"]["productId"])

    def test_publishes_predictive_compact_instead_of_raw_file(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-predictive-compact.json", "dashboard-daily-2026-01.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2026.json")
            files, missing = discover_dashboard_files(root)
            self.assertEqual(missing, [])
            self.assertIn("dashboard-predictive-compact.json", files)
            self.assertNotIn("dashboard-predictive.json", files)

    def test_daily_compaction_preserves_every_metric_and_hour(self) -> None:
        base = {"date": "2025-12-24", "periodId": 202512, "year": 2025, "month": 12, "storeId": "T001",
                "category": "TEXTIL", "line": "A", "subline": "BVD", "brand": "Z", "bandOrder": 1,
                "gross": 12.0, "positiveReal": 10.0, "notes": 0.0, "discount": 2.0, "net": 10.0,
                "transactions": 1, "units": 2.0, "target": 0.0, "traffic": 0.0, "personnel": 0.0, "received": 0.0}
        daily = [base, {**base, "storeId": "T002", "net": 9.0, "target": 5.0, "received": 2.0}]
        hourly = [{"date": "2025-12-24", "periodId": 202512, "storeId": "T001", "hour": 9, "transactions": 1, "net": 10.0}]
        payload = compactar_diario(daily, hourly)
        self.assertEqual(payload["encoding"], "daily-v1")
        self.assertEqual(descompactar_diario(payload), {"dailyStore": daily, "hourlySales": hourly})

    def test_daily_scope_rebuilds_dictionaries_after_filtering(self) -> None:
        base = {"date": "2025-12-24", "periodId": 202512, "year": 2025, "month": 12, "storeId": "T001",
                "category": "TEXTIL", "line": "A", "subline": "BVD", "brand": "VISIBLE", "bandOrder": 1,
                "gross": 10.0, "positiveReal": 10.0, "notes": 0.0, "discount": 0.0, "net": 10.0,
                "transactions": 1, "units": 1.0, "target": 0.0, "traffic": 0.0, "personnel": 0.0, "received": 0.0}
        rows = [base, {**base, "storeId": "T002", "brand": "SECRETA"}]
        scoped = scope_payload({"dailyCompact": compactar_diario(rows, [])}, {"T001"})["dailyCompact"]
        self.assertEqual(descompactar_diario(scoped)["dailyStore"], rows[:1])
        self.assertNotIn("SECRETA", scoped["dictionary"]["brand"])

    def test_compact_rows_round_trip_without_losing_dimensions_or_metrics(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "BVD", "brand": "Z", "net": 12.5, "units": 2},
            {"periodId": 202601, "storeId": "T002", "category": "TEXTIL", "line": "A", "subline": "BVD", "brand": "Z", "net": 7, "units": 1},
        ]
        payload = compactar_registros(rows, "monthlyBrand")
        self.assertEqual(payload["encoding"], "dictionary-v1")
        self.assertEqual(descompactar_registros(payload), rows)
        files = particionar_registros_compactos_anuales(rows, "dashboard-brand", "monthlyBrand")
        self.assertEqual(set(files), {"dashboard-brand-compact-2026.json"})
        self.assertEqual(descompactar_registros(files["dashboard-brand-compact-2026.json"]["monthlyBrand"]), rows)

    def test_compact_rows_reject_unknown_columns_instead_of_dropping_data(self) -> None:
        row = {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "BVD", "brand": "Z", "net": 12.5, "units": 2, "extra": 1}
        with self.assertRaisesRegex(ValueError, "columnas"):
            compactar_registros([row], "monthlyBrand")

    def test_seller_grouped_rows_restore_equal_and_distinct_transaction_counts(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "BVD", "seller": "ANA", "net": 12.5, "units": 2.0, "transactions": 2.0},
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "BVD", "seller": "LUZ", "net": 7.0, "units": 3.0, "transactions": 2.0},
        ]
        payload = compactar_registros(rows, "sellerPerformance")
        self.assertEqual(payload["encoding"], "seller-grouped-v1")
        self.assertEqual(len(payload["rows"][0]), 4)
        self.assertEqual(len(payload["rows"][1]), 5)
        self.assertEqual(descompactar_registros(payload), rows)

    def test_compact_scope_removes_other_stores_from_rows_and_dictionary(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "BVD", "brand": "A", "net": 10, "units": 2},
            {"periodId": 202601, "storeId": "T002", "category": "CALZADO", "line": "B", "subline": "ZAPATOS", "brand": "SECRETA", "net": 20, "units": 3},
        ]
        scoped = scope_payload({"monthlyBrand": compactar_registros(rows, "monthlyBrand")}, {"T001"})
        self.assertEqual(descompactar_registros(scoped["monthlyBrand"]), rows[:1])
        self.assertNotIn("SECRETA", scoped["monthlyBrand"]["dictionary"]["brand"])
        self.assertNotIn("T002", scoped["monthlyBrand"]["dictionary"]["storeId"])

    def test_grouped_sellers_are_scoped_before_publication(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": store, "category": "CALZADO", "line": "ZAPATOS",
             "subline": "HOMBRE", "seller": "VENDEDOR", "net": 100.0, "units": 2.0,
             "transactions": 2.0}
            for store in ("T001", "T002")
        ]
        scoped = scope_payload({"sellerPerformance": compactar_registros(rows, "sellerPerformance")}, {"T001"})
        self.assertEqual(descompactar_registros(scoped["sellerPerformance"]), rows[:1])
        self.assertEqual(scoped["sellerPerformance"]["dictionary"]["storeId"], ["T001"])

    def test_stock_codec_preserves_sku_and_store_metrics(self) -> None:
        metadata = {"productId": "P1", "productCode": "00000000001007", "product": "ZAPATO 7",
                    "category": "CALZADO", "line": "DAMAS", "subline": "ZAPATOS", "brand": "MARCA"}
        rows = [
            {"storeId": "T001", **metadata, "stockUnits": 4.0, "stockValue": 100.0,
             "goodUnits": 4.0, "mermaStockUnits": 0.0, "desmedroStockUnits": 0.0,
             "units30": 1.0, "sales30": 25.0, "units12": 10.0, "sales12": 250.0},
            {"storeId": "T002", **metadata, "stockUnits": 2.0, "stockValue": 50.0,
             "goodUnits": 1.0, "mermaStockUnits": 0.0, "desmedroStockUnits": 1.0,
             "units30": 0.0, "sales30": 0.0, "units12": 0.0, "sales12": 0.0},
        ]
        compact = compactar_stock(rows)
        self.assertEqual(len(compact["products"]), 1)
        self.assertEqual(descompactar_stock(compact), rows)
        scoped = scope_payload({"stockCompact": compact}, {"T002"})
        self.assertEqual(descompactar_stock(scoped["stockCompact"]), rows[1:])
        self.assertEqual(scoped["stockCompact"]["stores"], ["T002"])

    def test_stock_hierarchy_aggregates_and_respects_store_scope(self) -> None:
        metadata = {"productCode": "00000000001007", "product": "ZAPATO", "category": "CALZADO",
                    "line": "DAMAS", "subline": "ZAPATOS", "brand": "MARCA"}
        rows = [
            {"storeId": store, "productId": product, **metadata, "stockUnits": units,
             "stockValue": units * 25, "goodUnits": units, "mermaStockUnits": 0.0,
             "desmedroStockUnits": 0.0, "units30": units / 2, "sales30": units * 5,
             "units12": units * 3, "sales12": units * 75}
            for store, product, units in (("T001", "P1", 2.0), ("T001", "P2", 3.0), ("T002", "P1", 4.0))
        ]
        compact = compactar_registros(resumir_stock_jerarquia(rows), "stockHierarchy")
        scoped = scope_payload({"stockHierarchy": compact}, {"T001"})["stockHierarchy"]
        self.assertEqual(descompactar_registros(scoped)[0]["stockUnits"], 5.0)
        self.assertEqual(scoped["dictionary"]["storeId"], ["T001"])

    def test_transfer_candidates_keep_all_stores_of_qualifying_sku(self) -> None:
        def row(product: str, store: str, stock: float, sales: float) -> dict:
            return {"productId": product, "storeId": store, "goodUnits": stock,
                    "stockUnits": stock, "units30": sales}
        rows = [row("P1", "T001", 100, 0), row("P1", "T002", 1, 20),
                row("P1", "T003", 3, 0), row("P2", "T001", 1, 0)]
        self.assertEqual(candidatos_traslado(rows), rows[:3])

    def test_seller_category_summary_preserves_dimensions_and_totals(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "X", "seller": "ANA", "net": 10, "units": 2, "transactions": 1},
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "B", "subline": "Y", "seller": "ANA", "net": 7, "units": 1, "transactions": 2},
            {"periodId": 202601, "storeId": "T001", "category": "CALZADO", "line": "C", "subline": "Z", "seller": "ANA", "net": 4, "units": 1, "transactions": 1},
        ]
        summary = resumir_vendedores_por_rubro(rows)
        self.assertEqual(len(summary), 2)
        self.assertEqual((summary[0]["category"], summary[0]["net"], summary[0]["units"], summary[0]["transactions"]), ("TEXTIL", 17, 3, 3))
        self.assertEqual((summary[0]["line"], summary[0]["subline"]), ("", ""))
        self.assertEqual(summary[1]["category"], "CALZADO")

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

    def test_price_category_summary_preserves_band_totals_per_rubro(self) -> None:
        rows = [
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "A", "subline": "X", "bandOrder": 1, "priceBand": "S/ 0–30", "net": 10, "units": 2},
            {"periodId": 202601, "storeId": "T001", "category": "TEXTIL", "line": "B", "subline": "Y", "bandOrder": 1, "priceBand": "S/ 0–30", "net": 7, "units": 1},
            {"periodId": 202601, "storeId": "T001", "category": "CALZADO", "line": "C", "subline": "Z", "bandOrder": 1, "priceBand": "S/ 0–30", "net": 4, "units": 1},
        ]
        summary = resumir_rangos_precio_por_rubro(rows)
        self.assertEqual(len(summary), 2)
        self.assertEqual((summary[0]["category"], summary[0]["net"], summary[0]["units"]), ("TEXTIL", 17, 3))
        self.assertEqual((summary[0]["line"], summary[0]["subline"]), ("", ""))

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

    def test_publishes_compact_years_instead_of_large_raw_details(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-01.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2025.json", f"{dataset}-2026.json")
                self.touch(root, f"{dataset}-compact-2025.json", f"{dataset}-compact-2026.json")
            files, missing = discover_dashboard_files(root)
            self.assertEqual(missing, [])
            for dataset in YEARLY_DATASETS:
                self.assertIn(f"{dataset}-compact-2026.json", files)
                self.assertNotIn(f"{dataset}-2026.json", files)

    def test_rejects_incomplete_compact_years(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-01.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2025.json", f"{dataset}-2026.json")
            self.touch(root, "dashboard-subline-compact-2025.json")
            _, missing = discover_dashboard_files(root)
            self.assertIn("dashboard-subline-compact-2026.json", missing)

    def test_publishes_complete_compact_daily_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES)
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2026.json")
            self.touch(root, "dashboard-daily-2026-01.json", "dashboard-daily-2026-02.json",
                       "dashboard-daily-compact-2026-01.json")
            files, missing = discover_dashboard_files(root)
            self.assertIn("dashboard-daily-compact-2026-02.json", missing)
            self.assertNotIn("dashboard-daily-2026-01.json", files)
            self.touch(root, "dashboard-daily-compact-2026-02.json")
            files, missing = discover_dashboard_files(root)
            self.assertEqual(missing, [])
            self.assertIn("dashboard-daily-compact-2026-02.json", files)

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

    def test_requires_seller_category_summary_for_each_existing_year(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-01.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2025.json", f"{dataset}-2026.json")
            self.touch(root, "dashboard-sellers-category-2025.json")
            files, missing = discover_dashboard_files(root)
            self.assertIn("dashboard-sellers-category-2025.json", files)
            self.assertIn("dashboard-sellers-category-2026.json", missing)

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

    def test_requires_price_category_summary_for_each_existing_year(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            self.touch(root, *STATIC_CORE_FILES, "dashboard-daily-2026-01.json")
            for dataset in YEARLY_DATASETS:
                self.touch(root, f"{dataset}-2025.json", f"{dataset}-2026.json")
            self.touch(root, "dashboard-price-range-category-2025.json")
            files, missing = discover_dashboard_files(root)
            self.assertIn("dashboard-price-range-category-2025.json", files)
            self.assertIn("dashboard-price-range-category-2026.json", missing)

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
