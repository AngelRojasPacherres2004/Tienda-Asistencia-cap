"""Servidor local silencioso para la versión compilada del dashboard."""

from __future__ import annotations

import argparse
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

from runtime_config import finalizar_proceso


class DashboardHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4200)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    carpeta = args.directory.resolve()
    if not (carpeta / "index.html").exists():
        raise FileNotFoundError(f"No existe el dashboard compilado en {carpeta}")
    manejador = partial(DashboardHandler, directory=str(carpeta))
    servidor = ThreadingHTTPServer(("127.0.0.1", args.port), manejador)
    servidor.serve_forever()
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
