from __future__ import annotations

import contextlib
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "check-dashboard-payload-budget.py"
SPEC = importlib.util.spec_from_file_location("dashboard_payload_budget", SCRIPT)
assert SPEC and SPEC.loader
budget = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(budget)


class DashboardPayloadBudgetTests(unittest.TestCase):
    def test_largest_selects_the_worst_matching_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "dashboard-price-range-summary-2024.json").write_bytes(b"123")
            (root / "dashboard-price-range-summary-2025.json").write_bytes(b"12345")
            (root / "dashboard-price-range-summary-2026.json").write_bytes(b"1234567")
            size, sources = budget.largest(root, "dashboard-price-range-summary-????.json", 2)
            self.assertEqual(size, 12)
            self.assertIn("2026", sources)
            self.assertIn("2025", sources)
            self.assertNotIn("2024", sources)

    def test_missing_panel_fails_the_publication_gate(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertFalse(budget.report(Path(temporary)))


if __name__ == "__main__":
    unittest.main()
