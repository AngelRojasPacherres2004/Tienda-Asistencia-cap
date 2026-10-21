"""Servidor local del dashboard y proxy privado para las funciones de IA."""

from __future__ import annotations

import argparse
import base64
import gzip
import json
import os
import urllib.error
import urllib.request
import uuid
from datetime import date
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import duckdb

from runtime_config import finalizar_proceso


ROOT = Path(__file__).resolve().parents[1]
MAX_REQUEST_BYTES = 22 * 1024 * 1024
SYSTEM_PROMPT = (
    "Eres el asistente ejecutivo del Dashboard Comercial de Almacén de Remates. "
    "Nunca hagas preguntas, nunca solicites datos adicionales y nunca digas que falta información: "
    "usa solamente los valores presentes y omite silenciosamente cualquier campo ausente. "
    "Si la consulta comienza con ‘MODO CONSEJO POR BLOQUE’, responde con exactamente tres líneas: "
    "HALLAZGO, RECOMENDACIÓN y PRÓXIMO PASO, todas breves y referidas al bloque solicitado. "
    "No incluyas un apartado LECTURA en los consejos por bloque. "
    "En cualquier otro caso respeta la estructura pedida por el usuario; si no especifica una, usa "
    "RESUMEN EJECUTIVO, HALLAZGOS CLAVE y PLAN DE ACCIÓN. Cuando se pidan fórmulas, explica el nombre "
    "del KPI, la fórmula y sus variables. No inventes datos ni expongas información fuera del contexto recibido."
)


def load_local_env() -> None:
    """Carga solo variables faltantes desde el archivo local ignorado por Git."""
    env_file = ROOT / ".env.supabase.local"
    if not env_file.is_file():
        return
    for raw_line in env_file.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        if key:
            os.environ.setdefault(key, value.strip().strip('"'))


def groq_error(status: int) -> str:
    if status in {401, 403}:
        return "La clave local de IA no es válida. Actualízala en .env.supabase.local."
    if status == 429:
        return "La IA alcanzó temporalmente su límite. Inténtalo nuevamente más tarde."
    return "La IA no está disponible en este momento."


def groq_request(path: str, body: bytes, content_type: str) -> tuple[int, dict]:
    api_key = os.environ.get("GROQ_API_KEY", "").strip()
    if not api_key:
        return 503, {"error": "Falta GROQ_API_KEY en .env.supabase.local."}
    request = urllib.request.Request(
        f"https://api.groq.com/openai/v1/{path}", data=body,
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": content_type}, method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return response.status, json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        return error.code, {"error": groq_error(error.code)}
    except (urllib.error.URLError, TimeoutError):
        return 503, {"error": "No se pudo conectar con la IA."}


def chat(payload: dict) -> tuple[int, dict]:
    messages = [
        item for item in payload.get("messages", [])[-12:]
        if isinstance(item, dict) and item.get("role") in {"user", "assistant"}
        and isinstance(item.get("content"), str) and 0 < len(item["content"].strip()) <= 4_000
    ]
    if not messages:
        return 400, {"error": "Escribe una consulta para el asistente."}
    context = str(payload.get("context", ""))[:16_000]
    prompt = [{"role": "system", "content": SYSTEM_PROMPT}]
    if context:
        prompt.append({"role": "system", "content": f"Contexto visible del dashboard:\n{context}"})
    prompt.extend(messages)
    models = [
        os.environ.get("GROQ_CHAT_MODEL", "").strip() or "openai/gpt-oss-120b",
        *[value.strip() for value in os.environ.get("GROQ_FALLBACK_MODELS", "openai/gpt-oss-20b,llama-3.1-8b-instant").split(",") if value.strip()],
    ]
    last_status, last_payload = 503, {"error": "La IA no está disponible en este momento."}
    for model in dict.fromkeys(models):
        body = json.dumps({"model": model, "temperature": 0.15, "max_tokens": 900, "messages": prompt}).encode("utf-8")
        status, response = groq_request("chat/completions", body, "application/json")
        answer = ((response.get("choices") or [{}])[0].get("message") or {}).get("content", "").strip()
        if status < 300 and answer:
            return 200, {"answer": answer, "model": model}
        last_status, last_payload = status, response
        if status in {400, 401, 403}:
            break
    return last_status, last_payload


def transcribe(payload: dict) -> tuple[int, dict]:
    encoded = payload.get("audioBase64")
    if not isinstance(encoded, str) or not encoded:
        return 400, {"error": "No se recibió el audio."}
    try:
        audio = base64.b64decode(encoded, validate=True)
    except ValueError:
        return 400, {"error": "El audio no tiene un formato válido."}
    if not audio or len(audio) > 16 * 1024 * 1024:
        return 413, {"error": "El audio debe pesar como máximo 16 MB."}
    file_name = Path(str(payload.get("fileName") or "consulta.webm")).name.replace('"', "")
    mime_type = str(payload.get("mimeType") or "audio/webm").replace("\r", "").replace("\n", "")
    boundary = f"----dashboard-{uuid.uuid4().hex}"
    parts = [
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"model\"\r\n\r\nwhisper-large-v3-turbo\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"language\"\r\n\r\nes\r\n".encode(),
        f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{file_name}\"\r\nContent-Type: {mime_type}\r\n\r\n".encode(),
        audio, f"\r\n--{boundary}--\r\n".encode(),
    ]
    status, response = groq_request("audio/transcriptions", b"".join(parts), f"multipart/form-data; boundary={boundary}")
    return (200, {"text": str(response.get("text") or "")}) if status < 300 else (status, response)


def daily_dashboard_rows(from_date: str, to_date: str) -> tuple[int, dict]:
    """Entrega solo el rango diario pedido, en lugar de descargar 500+ MB."""
    try:
        start = date.fromisoformat(from_date)
        end = date.fromisoformat(to_date)
    except ValueError:
        return 400, {"error": "El rango diario no es válido."}
    if start > end or (end - start).days > 31:
        return 400, {"error": "El rango diario debe estar dentro de un mes."}
    ventas = ROOT / "capa2" / "FactVentas.parquet"
    if not ventas.is_file():
        return 404, {"error": "No se encontró FactVentas para el detalle diario."}

    rubro = """
        CASE
            WHEN rubro IS NULL OR TRIM(CAST(rubro AS VARCHAR)) = '' THEN 'PRODUCTOS VARIOS / N/A'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('COMPUTO', 'CÓMPUTO') THEN 'CÓMPUTO'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('FERRETERIA', 'FERRETERÍA') THEN 'FERRETERÍA'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('TECNOLOGIA', 'TECNOLOGÍA') THEN 'TECNOLOGÍA'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('LINEA BLANCA', 'LÍNEA BLANCA') THEN 'LÍNEA BLANCA'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('BANO Y LAVANDERIA', 'BAÑO Y LAVANDERÍA') THEN 'BAÑO Y LAVANDERÍA'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('RECREACION', 'RECREACIÓN') THEN 'RECREACIÓN'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('JOYERIA', 'JOYERÍA') THEN 'JOYERÍA'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('MUEBLE', 'MUEBLES') THEN 'MUEBLE'
            WHEN UPPER(TRIM(CAST(rubro AS VARCHAR))) IN ('VARIOS', 'N/A', 'SIN CLASIFICACIÓN', 'SIN CLASIFICACION') THEN 'PRODUCTOS VARIOS / N/A'
            ELSE TRIM(CAST(rubro AS VARCHAR))
        END
    """
    try:
        connection = duckdb.connect()
        cursor = connection.execute(
            f"""
            SELECT
                CAST(fecha_venta AS VARCHAR) AS "date",
                CAST(strftime(fecha_venta, '%Y%m') AS INTEGER) AS "periodId",
                CAST(EXTRACT(YEAR FROM fecha_venta) AS INTEGER) AS year,
                CAST(EXTRACT(MONTH FROM fecha_venta) AS INTEGER) AS month,
                tienda_id AS "storeId",
                {rubro} AS category,
                COALESCE(NULLIF(TRIM(linea), ''), 'SIN LINEA') AS line,
                COALESCE(NULLIF(TRIM(sub_linea), ''), 'SIN SUBLINEA') AS subline,
                COALESCE(NULLIF(TRIM(marca), ''), 'SIN MARCA') AS brand,
                CASE
                    WHEN cantidad <= 0 OR total_venta <= 0 THEN NULL
                    WHEN total_venta / cantidad <= 30 THEN 1 WHEN total_venta / cantidad <= 60 THEN 2
                    WHEN total_venta / cantidad <= 90 THEN 3 WHEN total_venta / cantidad <= 120 THEN 4
                    WHEN total_venta / cantidad <= 150 THEN 5 WHEN total_venta / cantidad <= 180 THEN 6
                    WHEN total_venta / cantidad <= 210 THEN 7 WHEN total_venta / cantidad <= 240 THEN 8
                    WHEN total_venta / cantidad <= 270 THEN 9 WHEN total_venta / cantidad <= 300 THEN 10 ELSE 11
                END AS "bandOrder",
                CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad * precio_sugerido ELSE 0 END) AS DOUBLE) AS gross,
                CAST(SUM(CASE WHEN total_venta > 0 THEN total_venta ELSE 0 END) AS DOUBLE) AS "positiveReal",
                CAST(ABS(SUM(CASE WHEN total_venta < 0 THEN total_venta ELSE 0 END)) AS DOUBLE) AS notes,
                CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad * precio_sugerido ELSE 0 END) - SUM(CASE WHEN total_venta > 0 THEN total_venta ELSE 0 END) AS DOUBLE) AS discount,
                CAST(SUM(total_venta) AS DOUBLE) AS net,
                COUNT(DISTINCT CAST(fecha_venta AS VARCHAR) || '|' || tienda_id || '|' || nro_venta) AS transactions,
                CAST(SUM(CASE WHEN cantidad > 0 AND total_venta >= 0 THEN cantidad ELSE 0 END) AS DOUBLE) AS units,
                CAST(0 AS DOUBLE) AS target, CAST(0 AS DOUBLE) AS traffic, CAST(0 AS DOUBLE) AS personnel, CAST(0 AS DOUBLE) AS received
            FROM read_parquet('{ventas.resolve().as_posix()}')
            WHERE fecha_venta BETWEEN DATE '{start.isoformat()}' AND DATE '{end.isoformat()}'
            GROUP BY 1,2,3,4,5,6,7,8,9,10
            """
        )
        columns = [item[0] for item in cursor.description]
        rows = [dict(zip(columns, values)) for values in cursor.fetchall()]
        hourly_cursor = connection.execute(
            f"""
            WITH tickets AS (
                SELECT
                    fecha_venta, tienda_id, nro_venta,
                    CAST(EXTRACT(HOUR FROM MIN(hora_venta)) AS INTEGER) AS hour,
                    SUM(total_venta) AS net
                FROM read_parquet('{ventas.resolve().as_posix()}')
                WHERE fecha_venta BETWEEN DATE '{start.isoformat()}' AND DATE '{end.isoformat()}'
                  AND hora_venta IS NOT NULL
                GROUP BY 1,2,3
            )
            SELECT
                CAST(fecha_venta AS VARCHAR) AS "date",
                CAST(strftime(fecha_venta, '%Y%m') AS INTEGER) AS "periodId",
                tienda_id AS "storeId",
                hour,
                CAST(COUNT(*) AS BIGINT) AS transactions,
                CAST(SUM(net) AS DOUBLE) AS net
            FROM tickets
            GROUP BY 1,2,3,4
            ORDER BY 1,3,4
            """
        )
        hourly_columns = [item[0] for item in hourly_cursor.description]
        hourly_rows = [dict(zip(hourly_columns, values)) for values in hourly_cursor.fetchall()]
        connection.close()
        return 200, {"dailyStore": rows, "hourlySales": hourly_rows}
    except Exception:
        return 500, {"error": "No se pudo generar el detalle diario."}


class DashboardHandler(SimpleHTTPRequestHandler):
    def log_message(self, _format: str, *_args) -> None:
        return

    def end_headers(self) -> None:
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        super().end_headers()

    def send_json(self, status: int, payload: dict) -> None:
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        compressed = "gzip" in self.headers.get("Accept-Encoding", "").lower() and len(data) > 32 * 1024
        if compressed:
            data = gzip.compress(data, compresslevel=6)
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        if compressed:
            self.send_header("Content-Encoding", "gzip")
            self.send_header("Vary", "Accept-Encoding")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self) -> None:
        handler = {"/api/assistant/chat": chat, "/api/assistant/transcribe": transcribe}.get(self.path.split("?", 1)[0])
        if handler is None:
            self.send_json(404, {"error": "Ruta no encontrada."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                self.send_json(413, {"error": "La solicitud es demasiado grande."})
                return
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError):
            self.send_json(400, {"error": "Solicitud inválida."})
            return
        status, response = handler(payload)
        self.send_json(status, response)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/dashboard/daily":
            query = parse_qs(parsed.query)
            status, response = daily_dashboard_rows((query.get("from") or [""])[0], (query.get("to") or [""])[0])
            self.send_json(status, response)
            return
        super().do_GET()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4200)
    parser.add_argument("--directory", type=Path, required=True)
    args = parser.parse_args()
    carpeta = args.directory.resolve()
    if not (carpeta / "index.html").exists():
        raise FileNotFoundError(f"No existe el dashboard compilado en {carpeta}")
    load_local_env()
    manejador = partial(DashboardHandler, directory=str(carpeta))
    ThreadingHTTPServer(("127.0.0.1", args.port), manejador).serve_forever()
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
