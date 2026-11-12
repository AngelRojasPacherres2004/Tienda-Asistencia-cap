import json
import sys
import tempfile
import unittest
from io import StringIO
from pathlib import Path
from unittest.mock import MagicMock, patch


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

    def test_daily_batch_integrates_three_sources_without_stock(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            output = root / "Salida" / "202611"
            c1 = root / "capa1"
            output.mkdir(parents=True)
            c1.mkdir()
            for source, (output_name, fact_name) in publisher.SOURCE_FILES.items():
                if source == "stock":
                    continue
                (output / output_name).write_bytes(b"incoming")
                (c1 / fact_name).write_bytes(b"previous")

            def fake_merge(_target, _incoming, _source, _cutoff, stage):
                stage.write_bytes(b"merged")

            manifest = {"archivos": {"ventas": {}, "ingresos": {}, "transferencias": {}}, "stockIncluido": False}
            completed = MagicMock(returncode=0)
            with patch.object(publisher, "SALIDA", output.parent), \
                 patch.object(publisher, "CAPA1_DIR", c1), \
                 patch.object(publisher, "WORK_DIR", root / "work"), \
                 patch.object(publisher, "valid_parquet"), \
                 patch.object(publisher, "stage_merge", side_effect=fake_merge) as merge, \
                 patch.object(publisher.subprocess, "run", return_value=completed):
                publisher.integrate("202611", "2026-11-09", manifest)
            self.assertEqual(merge.call_count, 3)
            self.assertNotIn("stock", [call.args[2] for call in merge.call_args_list])

    def test_backup_reports_part_progress_without_waiting_for_keyboard(self):
        with tempfile.TemporaryDirectory() as directory:
            source = Path(directory) / "Fact_Ventas.parquet"
            source.write_bytes(b"x" * (publisher.CHUNK_BYTES + 1))
            output = StringIO()
            with patch.object(publisher, "put_object"), patch("sys.stdout", output):
                metadata = publisher.upload_c1_file("https://example.supabase.co", "secret", "base", "ventas", source)
            self.assertEqual(len(metadata["parts"]), 2)
            self.assertIn("No presiones Enter", output.getvalue())
            self.assertIn("2/2", output.getvalue())


if __name__ == "__main__":
    unittest.main()
