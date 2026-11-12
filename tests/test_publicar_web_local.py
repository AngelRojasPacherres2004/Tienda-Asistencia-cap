import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "piplines"))
import publicar_web_local as publisher  # noqa: E402


class LocalWebPublicationTest(unittest.TestCase):
    def test_manifest_must_match_selected_period_and_cutoff(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "Salida" / "202611"
            output.mkdir(parents=True)
            (output / "manifiesto.json").write_text(json.dumps({
                "periodo": "202611", "fechaCorte": "2026-11-09", "archivos": {},
            }), encoding="utf-8")
            with patch.object(publisher, "SALIDA", output.parent):
                self.assertEqual(publisher.output_manifest("202611", "2026-11-09")["periodo"], "202611")
                with self.assertRaises(publisher.PublishLocalError):
                    publisher.output_manifest("202611", "2026-11-08")

    def test_second_publisher_is_rejected_without_replacing_lock(self):
        active = {"computer": "PC-VENTAS", "startedAt": "2026-11-12T10:00:00Z"}
        with patch.object(publisher, "put_object", side_effect=publisher.StorageError(409, "exists")), \
             patch.object(publisher, "load_json_object", return_value=active):
            with self.assertRaisesRegex(publisher.PublishLocalError, "PC-VENTAS"):
                publisher.acquire_lock("https://example.supabase.co", "secret", "2026-11-09")

    def test_first_publication_accepts_storage_nosuchkey_wrapped_as_400(self):
        missing = publisher.StorageError(400, 'GET current: {"code":"NoSuchKey","statusCode":"404"}')
        with patch.object(publisher, "fetch_object", side_effect=missing):
            self.assertIsNone(publisher.load_json_object("https://example.supabase.co", "secret", "current"))

    def test_remote_pointer_is_activated_only_after_successful_publication(self):
        payload = {"id": "base-a", "cutoff": "2026-11-09", "files": {}}
        with patch.object(publisher, "put_object") as put:
            publisher.activate_baseline("https://example.supabase.co", "secret", payload)
        self.assertTrue(put.called)
        self.assertEqual(put.call_args.args[2], "local-processing-base/current.json")
        self.assertTrue(put.call_args.kwargs["upsert"])


if __name__ == "__main__":
    unittest.main()
