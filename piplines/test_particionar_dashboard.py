import unittest

from piplines.particionar_dashboard import scope_catalog, scope_payload


class ScopePayloadTests(unittest.TestCase):
    def test_store_rows_and_sensitive_metadata_are_filtered(self):
        payload = {
            "metadata": {"years": [2026], "sourceCoverage": [{"rowsOriginal": 999}], "dataWarnings": ["global"]},
            "stores": [{"storeId": "T001"}, {"storeId": "T002"}],
            "monthlyStore": [{"storeId": "T001", "net": 10}, {"storeId": "T002", "net": 20}],
            "hierarchyCatalog": [{"category": "TEXTIL"}],
        }
        result = scope_payload(payload, {"T001"})
        self.assertEqual(result["stores"], [{"storeId": "T001"}])
        self.assertEqual(result["monthlyStore"], [{"storeId": "T001", "net": 10}])
        self.assertEqual(result["metadata"], {"years": [2026]})

    def test_unknown_unscoped_array_fails_closed(self):
        with self.assertRaisesRegex(ValueError, "storeId"):
            scope_payload({"secretRows": [{"value": 42}]}, {"T001"})

    def test_cluster_catalog_excludes_non_store_channels(self):
        scopes = scope_catalog([
            {"storeId": "T001", "cluster": "A", "isStore": True},
            {"storeId": "T002", "cluster": "A", "isStore": True},
            {"storeId": "T019", "cluster": "CD", "isStore": False},
        ])
        self.assertEqual(scopes[("cluster", "A")], {"T001", "T002"})
        self.assertNotIn(("store", "T019"), scopes)


if __name__ == "__main__":
    unittest.main()
