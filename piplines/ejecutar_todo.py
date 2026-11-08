from __future__ import annotations
from runtime_config import finalizar_proceso

"""Orquestador completo: input RMS -> Capa 1 -> Capa 2 -> modelo TMDL."""

import argparse
import hashlib
import duckdb
import importlib.util
import json
import os
import platform
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from calendar import monthrange
from datetime import date, datetime
from time import perf_counter

from maestros import ANIO_FIN_MODELO, ANIO_INICIO_MODELO
from nombres_modelo import (
    ARCHIVOS_CAPA2,
    limpiar_capa2_generada,
    limpiar_modelo_powerbi,
    validar_contenido_capa2,
)
from project_paths import (
    CAPA1_DIR,
    CAPA2_DIR,
    INPUT_DIR,
    PROJECT_ROOT,
    SCRIPT_DIR,
    WORK_BACKUP_DIR,
    WORK_DIR,
    limpiar_temporales,
    preparar_directorios,
)
from reglas_corte import fecha_corte_automatica, validar_fecha_corte

CODIGO_STACK_OVERFLOW_WINDOWS = 0xC00000FD
CODIGO_SIN_NOVEDADES = 3

ARCHIVOS_OPERATIVOS_DIARIOS = {
    "ventas_pipeline.py": "VENTAS.xlsx",
    "ingreso_pipeline.py": "INGRESO.xlsx",
    "transferencia_pipeline.py": "TRANSFERENCIAS.xlsx",
    "stock_pipeline.py": "STOCK.xlsx",
}


def validar_entorno_previo(
    fecha_corte: date | None,
    solo_capa2: bool,
    solo_operacion_comercial: bool = False,
    entrada_incremental: bool = False,
) -> None:
    """Falla temprano ante problemas de entorno, rutas o espacio en disco."""

    print("\n" + "=" * 80)
    print("VALIDACIÓN PREVIA DEL ENTORNO")
    print("=" * 80)
    print(f"Python       : {platform.python_version()}")
    print(f"Ejecutable   : {sys.executable}")
    print(f"Proyecto     : {PROJECT_ROOT}")
    print(
        "Fecha corte  : "
        + (fecha_corte.isoformat() if fecha_corte else "AUTOMÁTICA · ÚLTIMO LUNES")
    )

    faltan_modulos = [
        nombre for nombre in ("duckdb", "thrift")
        if importlib.util.find_spec(nombre) is None
    ]
    if faltan_modulos:
        raise RuntimeError(
            "Faltan dependencias: " + ", ".join(faltan_modulos)
            + r". Ejecuta: .\.venv\Scripts\python.exe -m pip install "
              r"-r .\piplines\requirements.txt"
        )

    if fecha_corte is not None:
        for advertencia in validar_fecha_corte(fecha_corte):
            print(f"ADVERTENCIA: {advertencia}", flush=True)

    if solo_capa2 or entrada_incremental:
        parquet_requeridos = (
            "Fact_Ventas.parquet",
            "Fact_Ingresos.parquet",
            "Fact_Transferencias.parquet",
            "Fact_Stock.parquet",
        )
        faltan = [n for n in parquet_requeridos if not (CAPA1_DIR / n).exists()]
        if faltan:
            raise FileNotFoundError(
                "--solo-capa2 requiere estos Parquet en capa1: " + ", ".join(faltan)
            )
    else:
        patrones = ("VENTAS*.xlsx", "INGRESO*.xlsx", "TRANF*.xlsx", "STOCK*.xlsx")
        sin_fuente = [patron for patron in patrones if not list(INPUT_DIR.glob(patron))]
        if sin_fuente:
            raise FileNotFoundError(
                "Faltan fuentes RMS en input para: " + ", ".join(sin_fuente)
            )

    if entrada_incremental:
        faltantes_diarios = [
            nombre for script, nombre in ARCHIVOS_OPERATIVOS_DIARIOS.items()
            if script != "stock_pipeline.py" and not (INPUT_DIR / nombre).is_file()
        ]
        if faltantes_diarios:
            raise FileNotFoundError(
                "Faltan archivos diarios en input: " + ", ".join(faltantes_diarios)
            )
        stock = INPUT_DIR / ARCHIVOS_OPERATIVOS_DIARIOS["stock_pipeline.py"]
        if stock.is_file():
            if fecha_corte is None:
                raise ValueError("Con STOCK.xlsx indica obligatoriamente la fecha de cierre mensual.")
            ultimo_dia = monthrange(fecha_corte.year, fecha_corte.month)[1]
            if fecha_corte.day != ultimo_dia:
                raise ValueError(
                    "STOCK.xlsx solo se procesa en el último día del mes "
                    f"({fecha_corte.year}-{fecha_corte.month:02d}-{ultimo_dia:02d})."
                )
        print(
            "Entrada operativa: input\\ (VENTAS.xlsx, INGRESO.xlsx, "
            "TRANSFERENCIAS.xlsx" + (", STOCK.xlsx)" if stock.is_file() else ")"),
            flush=True,
        )

    uso = shutil.disk_usage(PROJECT_ROOT)
    libres_gb = uso.free / (1024 ** 3)
    print(f"Disco libre  : {libres_gb:.2f} GB")
    if libres_gb < 3:
        raise RuntimeError(
            "Se requieren al menos 3 GB libres para temporales y publicación atómica."
        )

    if os.name == "nt" and sys.version_info >= (3, 14):
        print(
            "Modo seguro  : activado para Windows + Python 3.14 "
            "(cierre nativo aislado por subproceso)."
        )
    print("Entorno      : OK")


def _directorio_tiene_contenido(ruta: Path) -> bool:
    return ruta.exists() and any(ruta.iterdir())


def _parquet_publicados() -> list[str]:
    return sorted(
        p.name for p in CAPA2_DIR.glob("*.parquet")
        if p.is_file() and p.stat().st_size > 0
    )


def _escribir_estado_ejecucion(estado: str, error: str | None = None) -> None:
    publicados = _parquet_publicados()
    esperados = set(ARCHIVOS_CAPA2.values())
    payload = {
        "estado": estado,
        "fecha_hora": datetime.now().isoformat(timespec="seconds"),
        "publicados": publicados,
        "faltantes": sorted(esperados - set(publicados)),
        "error": error,
        "backup_anterior": str(WORK_BACKUP_DIR),
    }
    ruta = WORK_DIR / "estado_ultima_ejecucion.json"
    ruta.parent.mkdir(parents=True, exist_ok=True)
    ruta.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def recuperar_backup_interrumpido() -> None:
    """Conserva resultados parciales y solo restaura si no se publicó nada.

    Una ejecución interrumpida puede dejar Parquet correctos ya publicados. No
    se eliminan. El backup anterior queda disponible en ``.etl_work``. Si la
    carpeta Capa 2 está completamente vacía, sí se restaura el backup para no
    dejar al usuario sin ningún modelo utilizable.
    """

    backup_capa2 = WORK_BACKUP_DIR / "capa2"
    if not backup_capa2.exists():
        return

    if _directorio_tiene_contenido(CAPA2_DIR):
        print(
            "[RECUPERACIÓN] Se conservarán los Parquet parciales de la "
            "ejecución anterior. El backup previo sigue en .etl_work.",
            flush=True,
        )
        return

    if backup_capa2.exists():
        shutil.rmtree(CAPA2_DIR, ignore_errors=True)
        shutil.copytree(backup_capa2, CAPA2_DIR)
    else:
        CAPA2_DIR.mkdir(parents=True, exist_ok=True)
    print(
        "[RECUPERACIÓN] Capa 2 estaba vacía; se restauró una copia del backup.",
        flush=True,
    )


def crear_backup_salida() -> None:
    """Guarda la salida vigente y prepara una Capa 2 limpia para la ejecución.

    El backup se conserva si la ejecución falla. Los nuevos Parquet se escriben
    directamente en Capa 2 y permanecen allí aunque falle una etapa posterior.
    """

    shutil.rmtree(WORK_BACKUP_DIR, ignore_errors=True)
    WORK_BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    if _directorio_tiene_contenido(CAPA2_DIR):
        shutil.copytree(CAPA2_DIR, WORK_BACKUP_DIR / "capa2")
    CAPA2_DIR.mkdir(parents=True, exist_ok=True)
    _escribir_estado_ejecucion("EN_PROCESO")


def confirmar_salida() -> None:
    _escribir_estado_ejecucion("COMPLETA")
    shutil.rmtree(WORK_BACKUP_DIR, ignore_errors=True)
    WORK_BACKUP_DIR.mkdir(parents=True, exist_ok=True)


def conservar_salida_parcial(error: BaseException) -> None:
    """Mantiene los artefactos que ya fueron publicados de forma atómica."""

    publicados = _parquet_publicados()
    _escribir_estado_ejecucion("INCOMPLETA", str(error))
    print("\n" + "=" * 80, flush=True)
    print("EJECUCIÓN INCOMPLETA: SE CONSERVA CAPA 2 PARCIAL", flush=True)
    print(f"Parquet publicados correctamente: {len(publicados)}", flush=True)
    for nombre in publicados:
        print(f"  - {nombre}", flush=True)
    faltantes = sorted(set(ARCHIVOS_CAPA2.values()) - set(publicados))
    if faltantes:
        print("Pendientes o no validados:", flush=True)
        for nombre in faltantes:
            print(f"  - {nombre}", flush=True)
    print(
        "La salida anterior, si existía, permanece en "
        f"{WORK_BACKUP_DIR}. No se ejecutó rollback destructivo.",
        flush=True,
    )
    print("=" * 80, flush=True)

# Fuentes independientes de Capa 1. Si una salida es más reciente que sus
# Excel y que el código que la genera, se reutiliza automáticamente.
CAPA1_INCREMENTAL = {
    "ventas_pipeline.py": {
        "patrones": ("VENTAS.xlsx",),
        "salida": "Fact_Ventas.parquet",
        "dependencias": ("ventas_pipeline.py", "_base_ventas.py", "xlsx_fast.py", "capa1_cache.py"),
    },
    "ingreso_pipeline.py": {
        "patrones": ("INGRESO.xlsx",),
        "salida": "Fact_Ingresos.parquet",
        "dependencias": ("ingreso_pipeline.py", "_base_ingresos.py", "xlsx_fast.py", "capa1_cache.py"),
    },
    "transferencia_pipeline.py": {
        "patrones": ("TRANSFERENCIAS.xlsx",),
        "salida": "Fact_Transferencias.parquet",
        "dependencias": ("transferencia_pipeline.py", "_base_transferencias.py", "xlsx_fast.py", "capa1_cache.py"),
    },
    "stock_pipeline.py": {
        "patrones": ("STOCK.xlsx",),
        "salida": "Fact_Stock.parquet",
        "dependencias": ("stock_pipeline.py", "_base_stock.py"),
    },
}

ESTADO_ENTRADA_OPERATIVA = WORK_DIR / "estado_entrada_operativa.json"


def _huella_archivo(archivo: Path) -> str:
    resumen = hashlib.sha256()
    with archivo.open("rb") as origen:
        for bloque in iter(lambda: origen.read(1024 * 1024), b""):
            resumen.update(bloque)
    return resumen.hexdigest()


def _leer_estado_entrada_operativa() -> dict[str, object]:
    try:
        contenido = json.loads(ESTADO_ENTRADA_OPERATIVA.read_text(encoding="utf-8"))
        return contenido if isinstance(contenido, dict) else {}
    except (OSError, ValueError, json.JSONDecodeError):
        return {}


def _guardar_estado_entrada_operativa(estado: dict[str, object]) -> None:
    ESTADO_ENTRADA_OPERATIVA.parent.mkdir(parents=True, exist_ok=True)
    temporal = ESTADO_ENTRADA_OPERATIVA.with_suffix(".tmp")
    temporal.write_text(
        json.dumps(estado, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8",
    )
    temporal.replace(ESTADO_ENTRADA_OPERATIVA)


def _registrar_entregas_operativas(ejecutados: list[str], input_dir: Path) -> None:
    """Marca las entregas incorporadas para que nunca se sumen dos veces."""
    estado = _leer_estado_entrada_operativa()
    fuentes = estado.setdefault("fuentes", {})
    if not isinstance(fuentes, dict):
        fuentes = {}
        estado["fuentes"] = fuentes
    for script in ejecutados:
        archivos = _archivos_fuente(CAPA1_INCREMENTAL[script]["patrones"], input_dir)
        if archivos:
            fuentes[script] = _huella_archivo(archivos[0])
    estado["modelo_pendiente"] = True
    _guardar_estado_entrada_operativa(estado)


def _modelo_operativo_pendiente() -> bool:
    return bool(_leer_estado_entrada_operativa().get("modelo_pendiente"))


def _confirmar_modelo_operativo() -> None:
    estado = _leer_estado_entrada_operativa()
    if estado:
        estado["modelo_pendiente"] = False
        _guardar_estado_entrada_operativa(estado)


def parsear_fecha(valor: str) -> date:
    try:
        return date.fromisoformat(valor)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Usa YYYY-MM-DD") from exc


def codigo_windows_sin_signo(codigo: int) -> int:
    return codigo & 0xFFFFFFFF


def es_stack_overflow_windows(codigo: int) -> bool:
    return codigo_windows_sin_signo(codigo) == CODIGO_STACK_OVERFLOW_WINDOWS


def ejecutar_comando(
    script: str,
    argumentos: list[str] | None = None,
    entorno: dict[str, str] | None = None,
) -> subprocess.CompletedProcess[bytes]:
    comando = [sys.executable, str(SCRIPT_DIR / script), *(argumentos or [])]
    print("\n" + "=" * 80, flush=True)
    print("EJECUTANDO:", " ".join(comando), flush=True)
    print("=" * 80, flush=True)
    inicio = perf_counter()
    resultado = subprocess.run(
        comando, cwd=PROJECT_ROOT, check=False, env=entorno
    )
    print(f"DURACIÓN {script}: {perf_counter() - inicio:,.2f} segundos", flush=True)
    return resultado


def ejecutar(
    script: str,
    argumentos: list[str] | None = None,
    argumentos_validacion: list[str] | None = None,
    entorno: dict[str, str] | None = None,
) -> None:
    resultado = ejecutar_comando(script, argumentos, entorno)
    if resultado.returncode == 0:
        return

    if es_stack_overflow_windows(resultado.returncode) and argumentos_validacion:
        print(
            "\nWindows devolvió STATUS_STACK_OVERFLOW al cerrar DuckDB. "
            "Se validará el archivo publicado antes de continuar.",
            flush=True,
        )
        validacion = ejecutar_comando(script, argumentos_validacion, entorno)
        if validacion.returncode == 0:
            return

    raise RuntimeError(f"{script} terminó con código {resultado.returncode}")


def ejecutar_opcional(
    script: str,
    argumentos: list[str],
    validacion: list[str] | None,
    omitir_faltantes: bool,
    entorno: dict[str, str] | None = None,
) -> None:
    try:
        ejecutar(script, argumentos, validacion, entorno)
    except Exception as exc:
        if not omitir_faltantes:
            raise
        print(f"\nADVERTENCIA: se omitió {script}: {exc}", flush=True)


def _entorno_paralelo(
    paralelismo: int, extra: dict[str, str] | None = None
) -> dict[str, str]:
    entorno = os.environ.copy()
    disponibles = os.cpu_count() or 4
    hilos = max(1, min(6, max(1, disponibles - 1) // max(1, paralelismo)))
    entorno["ETL_DUCKDB_THREADS"] = str(hilos)
    entorno["ETL_PROGRESS"] = "0" if paralelismo > 1 else entorno.get("ETL_PROGRESS", "1")
    entorno["PYTHONUNBUFFERED"] = "1"
    if extra:
        entorno.update(extra)
    return entorno


def ejecutar_grupo_paralelo(
    pasos: list[tuple[str, list[str], list[str] | None, bool]],
    paralelismo: int,
    extra_env: dict[str, str] | None = None,
) -> None:
    if not pasos:
        return
    trabajadores = max(1, min(paralelismo, len(pasos)))
    entorno = _entorno_paralelo(trabajadores, extra_env)
    if trabajadores == 1:
        for script, argumentos, validacion, omitir in pasos:
            ejecutar_opcional(script, argumentos, validacion, omitir, entorno)
        return

    print(
        f"\nEjecución paralela: {trabajadores} procesos; "
        f"{entorno['ETL_DUCKDB_THREADS']} hilos DuckDB por proceso.",
        flush=True,
    )
    errores: list[BaseException] = []
    with ThreadPoolExecutor(max_workers=trabajadores) as executor:
        futuros = {
            executor.submit(
                ejecutar_opcional, script, argumentos, validacion, omitir, entorno
            ): script
            for script, argumentos, validacion, omitir in pasos
        }
        for futuro in as_completed(futuros):
            script = futuros[futuro]
            try:
                futuro.result()
            except BaseException as exc:
                errores.append(RuntimeError(f"{script}: {exc}"))
    if errores:
        raise errores[0]


def _archivos_fuente(patrones: tuple[str, ...], input_dir: Path = INPUT_DIR) -> list[Path]:
    encontrados: dict[str, Path] = {}
    for patron in patrones:
        for archivo in input_dir.glob(patron):
            if archivo.is_file() and not archivo.name.startswith("~$"):
                encontrados[str(archivo.resolve()).lower()] = archivo
    return sorted(encontrados.values(), key=lambda x: x.name.lower())


def capa1_puede_reutilizarse(
    script: str,
    input_dir: Path = INPUT_DIR,
    entrada_operativa: bool = False,
) -> tuple[bool, str]:
    config = CAPA1_INCREMENTAL.get(script)
    if not config:
        return False, "sin configuración incremental"
    salida = CAPA1_DIR / str(config["salida"])
    if not salida.exists() or salida.stat().st_size == 0:
        return False, "salida inexistente"
    fuentes = _archivos_fuente(config["patrones"], input_dir)
    if not fuentes:
        return False, "sin archivos de entrada"
    if entrada_operativa:
        fuentes_procesadas = _leer_estado_entrada_operativa().get("fuentes", {})
        huella_anterior = (
            fuentes_procesadas.get(script)
            if isinstance(fuentes_procesadas, dict)
            else None
        )
        if huella_anterior != _huella_archivo(fuentes[0]):
            return False, "llegó una entrega nueva"
    dependencias = [SCRIPT_DIR / nombre for nombre in config["dependencias"]]
    dependencias.extend(
        [SCRIPT_DIR / "runtime_config.py", SCRIPT_DIR / "project_paths.py"]
    )
    candidatos = [*fuentes, *(d for d in dependencias if d.exists())]
    mas_nuevo = max(a.stat().st_mtime_ns for a in candidatos)
    if salida.stat().st_mtime_ns >= mas_nuevo:
        return True, f"{salida.name} está actualizado"
    return False, "cambió una fuente o el código"


def fase_capa1(
    omitir_faltantes: bool,
    forzar: bool = False,
    paralelismo: int = 2,
    input_dir: Path = INPUT_DIR,
    incremental: bool = False,
) -> list[str]:
    print("\n" + "#" * 80)
    print("FASE 1 - INPUT RMS -> CAPA 1")
    print("#" * 80)
    pasos_base = [
        ("ventas_pipeline.py", ["--solo-capa1"], ["--verificar-capa1"], False),
        ("ingreso_pipeline.py", ["--solo-capa1"], ["--verificar-capa1"], False),
        (
            "transferencia_pipeline.py",
            ["--solo-capa1"],
            ["--verificar-capa1"],
            False,
        ),
        ("stock_pipeline.py", ["--solo-capa1"], ["--verificar-capa1"], False),
    ]
    pendientes: list[tuple[str, list[str], list[str] | None, bool]] = []
    ejecutados: list[str] = []
    for script, argumentos, validacion, opcional in pasos_base:
        fuentes = _archivos_fuente(CAPA1_INCREMENTAL[script]["patrones"], input_dir)
        if incremental and not fuentes:
            print(f"[SIN NOVEDAD] {script}: no hay archivo nuevo para esta fuente.", flush=True)
            continue
        reutilizar, motivo = capa1_puede_reutilizarse(script, input_dir, incremental)
        if reutilizar and not forzar:
            print(f"[REUTILIZADA] {script}: {motivo}", flush=True)
            continue
        print(
            f"[RECONSTRUIR] {script}: "
            + ("forzado por el usuario" if forzar else motivo),
            flush=True,
        )
        pendientes.append(
            (script, argumentos, validacion, omitir_faltantes and opcional)
        )
        ejecutados.append(script)
    ejecutar_grupo_paralelo(
        pendientes,
        paralelismo,
        {
            "ETL_FORCE_C1_CACHE": "1" if forzar else "0",
            "DASHBOARD_INPUT_DIR": str(input_dir),
            "DASHBOARD_FIXED_INPUT": "1" if incremental else "0",
        },
    )
    return ejecutados


def respaldar_capa1_incremental() -> dict[str, Path]:
    """Respalda los cuatro hechos antes de incorporar una entrega delta."""
    destino = WORK_BACKUP_DIR / "capa1"
    shutil.rmtree(destino, ignore_errors=True)
    destino.mkdir(parents=True, exist_ok=True)
    respaldos: dict[str, Path] = {}
    for config in CAPA1_INCREMENTAL.values():
        nombre = str(config["salida"])
        origen = CAPA1_DIR / nombre
        if origen.exists() and origen.stat().st_size:
            copia = destino / nombre
            shutil.copy2(origen, copia)
            respaldos[nombre] = copia
    return respaldos


def mezclar_capa1_incremental(ejecutados: list[str], respaldos: dict[str, Path]) -> None:
    """Une la entrega nueva con el histórico sin releer los Excel anteriores."""
    for script in ejecutados:
        nombre = str(CAPA1_INCREMENTAL[script]["salida"])
        anterior = respaldos.get(nombre)
        actual = CAPA1_DIR / nombre
        if anterior is None or not actual.exists():
            continue
        temporal = WORK_DIR / "temporales" / f"{actual.stem}_incremental.parquet"
        temporal.unlink(missing_ok=True)
        con = duckdb.connect(database=":memory:")
        try:
            ruta_anterior = str(anterior).replace("\\", "/").replace("'", "''")
            ruta_actual = str(actual).replace("\\", "/").replace("'", "''")
            ruta_temporal = str(temporal).replace("\\", "/").replace("'", "''")
            con.execute(
                "COPY (SELECT * FROM read_parquet('" + ruta_anterior
                + "') UNION ALL BY NAME SELECT * FROM read_parquet('" + ruta_actual
                + "')) TO '" + ruta_temporal + "' (FORMAT PARQUET, COMPRESSION SNAPPY)"
            )
        finally:
            con.close()
        if not temporal.exists() or not temporal.stat().st_size:
            raise RuntimeError(f"No se pudo integrar el histórico de {nombre}.")
        shutil.move(str(temporal), str(actual))
        print(f"[INCREMENTAL] Histórico + novedades integrados: {nombre}", flush=True)


def fase_capa2(
    fecha: str | None,
    omitir_faltantes: bool,
    paralelismo: int = 2,
    anio_inicio: int = ANIO_INICIO_MODELO,
    solo_operacion_comercial: bool = False,
) -> str:
    print("\n" + "#" * 80)
    print("FASE 2 - CAPA 1 -> CAPA 2 MODELO")
    print("#" * 80)

    if solo_operacion_comercial:
        # Dimensiones y hechos se reconstruyen desde los cuatro RMS. Los
        # atributos administrativos del dashboard se consultan en Supabase.
        for nombre in ("DimTiendas.parquet", "DimClasificacionProducto.parquet", "DimProducto.parquet"):
            (CAPA2_DIR / nombre).unlink(missing_ok=True)
    else:
        limpiar_capa2_generada()
        limpiar_modelo_powerbi()
    limpiar_temporales()

    # Ventas domina CPU, disco y memoria. Ejecutarla sola permite que DuckDB use
    # todos los hilos disponibles y evita la degradación observada al competir
    # con otras facts sobre los mismos Parquet y el mismo disco.
    ejecutar("ventas_pipeline.py", ["--solo-capa2"], ["--verificar-capa2"])

    fecha_efectiva = fecha or fecha_corte_automatica().isoformat()
    print(
        "Fecha de corte general del modelo: "
        f"{fecha_efectiva}"
        + (" (indicada)" if fecha else " (último lunes automático)"),
        flush=True,
    )

    # Ingresos y transferencias son independientes y de tamaño intermedio.
    ejecutar_grupo_paralelo(
        [
            ("ingreso_pipeline.py", ["--solo-capa2"], ["--verificar-capa2"], False),
            ("transferencia_pipeline.py", ["--solo-capa2"], ["--verificar-capa2"], False),
        ],
        min(paralelismo, 2),
    )

    # Stock se ejecuta solo. Su fotografía contiene muchas columnas de texto y
    # homologaciones; aislarla evita competir por memoria/disco y facilita una
    # publicación atómica en Windows.
    ejecutar_opcional(
        "stock_pipeline.py",
        ["--solo-capa2", "--fecha-corte", fecha_efectiva],
        ["--verificar-capa2"],
        omitir_faltantes,
        _entorno_paralelo(1),
    )

    return fecha_efectiva


def main() -> int:
    inicio_total = perf_counter()
    parser = argparse.ArgumentParser(
        description=(
            "Ejecución completa y portable: input RMS -> capa1 -> capa2 -> TMDL. "
            "Reutiliza Capa 1 sin cambios y reconstruye automáticamente las fuentes modificadas."
        )
    )
    parser.add_argument(
        "--fecha-corte",
        type=parsear_fecha,
        default=None,
        help=(
            "Fecha de corte general, formato YYYY-MM-DD. Excluye movimientos posteriores, "
            "usa el último stock disponible y genera alertas de cobertura. "
            "Si se omite, usa automáticamente el último lunes."
        ),
    )
    parser.add_argument("--anio-inicio", type=int, default=ANIO_INICIO_MODELO)
    parser.add_argument("--anio-fin", type=int, default=ANIO_FIN_MODELO)
    modo = parser.add_mutually_exclusive_group()
    modo.add_argument(
        "--solo-capa1",
        action="store_true",
        help="Genera únicamente los Parquet RMS consolidados de Capa 1.",
    )
    modo.add_argument(
        "--solo-capa2",
        action="store_true",
        help="Reutiliza Capa 1 y genera Capa 2, validaciones y TMDL.",
    )
    modo.add_argument(
        "--reutilizar-capa1",
        action="store_true",
        help="Alias de --solo-capa2 para compatibilidad.",
    )
    parser.add_argument(
        "--reconstruir-capa1",
        action="store_true",
        help="Fuerza la reconstrucción de Capa 1 aunque las salidas estén actualizadas.",
    )
    parser.add_argument(
        "--incremental",
        action="store_true",
        help=(
            "Incorpora los archivos operativos fijos de input\\ sobre los "
            "Parquet históricos de Capa 1."
        ),
    )
    parser.add_argument(
        "--solo-operacion-comercial",
        action="store_true",
        help="Compatibilidad: la actualización siempre procesa solo las cuatro fuentes RMS.",
    )
    parser.add_argument(
        "--omitir-faltantes",
        action="store_true",
        help="Permite continuar sin fuentes opcionales, actualmente Stock.",
    )
    parser.add_argument(
        "--paralelismo",
        type=int,
        default=2,
        choices=range(1, 5),
        metavar="1-4",
        help=(
            "Cantidad de pipelines independientes simultáneas. "
            "Usa 2 por defecto; usa 1 si el equipo tiene poca memoria."
        ),
    )
    args = parser.parse_args()

    preparar_directorios()
    recuperar_backup_interrumpido()
    fecha = args.fecha_corte.isoformat() if args.fecha_corte else None

    try:
        solo_capa2 = args.solo_capa2 or args.reutilizar_capa1
        # Las fuentes administrativas viven en Supabase. Esta ruta nunca lee
        # Excel de tráfico, personal, metas, merma, guías, catálogo o tiendas.
        solo_operacion_comercial = True
        validar_entorno_previo(
            args.fecha_corte,
            solo_capa2,
            solo_operacion_comercial,
            args.incremental,
        )

        ejecutados_incrementales: list[str] = []
        if not solo_capa2:
            if args.incremental:
                respaldos_capa1 = respaldar_capa1_incremental()
                ejecutados_incrementales = fase_capa1(
                    args.omitir_faltantes,
                    args.reconstruir_capa1,
                    args.paralelismo,
                    INPUT_DIR,
                    True,
                )
                if not ejecutados_incrementales:
                    if not _modelo_operativo_pendiente():
                        print(
                            "\nSIN NOVEDADES: los archivos operativos no cambiaron desde "
                            "la última ejecución. No se reconstruirá el modelo.",
                            flush=True,
                        )
                        return CODIGO_SIN_NOVEDADES
                    print(
                        "\n[RECUPERACIÓN] La entrega ya está en Capa 1; se completará "
                        "la actualización pendiente del modelo.",
                        flush=True,
                    )
                else:
                    mezclar_capa1_incremental(ejecutados_incrementales, respaldos_capa1)
                    _registrar_entregas_operativas(ejecutados_incrementales, INPUT_DIR)
            else:
                fase_capa1(args.omitir_faltantes, args.reconstruir_capa1, args.paralelismo)

        if args.solo_capa1:
            limpiar_temporales()
            print("\n" + "=" * 80)
            print("CAPA 1 GENERADA Y AUDITADA")
            print(f"Salida: {CAPA1_DIR}")
            print(f"Duración total: {(perf_counter() - inicio_total) / 60:.2f} minutos")
            print("=" * 80)
            return 0

        crear_backup_salida()
        try:
            fecha_efectiva = fase_capa2(
                fecha,
                args.omitir_faltantes,
                args.paralelismo,
                args.anio_inicio,
                solo_operacion_comercial,
            )

            ejecutar(
                "aplicar_corte_modelo.py",
                ["--fecha-corte", fecha_efectiva],
            )

            ejecutar(
                "generar_dimensiones_modelo.py",
                [
                    "--anio-inicio",
                    str(args.anio_inicio),
                    "--anio-fin",
                    str(args.anio_fin),
                ],
            )

            opcional = ["--omitir-faltantes"] if args.omitir_faltantes else []
            ejecutar("validar_modelo.py", opcional)
            # Metas, personal, tráfico, merma y guías ya no son tablas del
            # modelo local; las medidas históricas que dependían de ellas se
            # sustituyen por los endpoints de Supabase del dashboard web.
            ejecutar("generar_modelo_powerbi.py", [*opcional, "--sin-kpis"])

            limpiar_temporales()
            encontrados, extras = validar_contenido_capa2()
            if extras:
                raise RuntimeError(
                    "Capa 2 contiene archivos Parquet no reconocidos: "
                    + ", ".join(extras)
                )
            confirmar_salida()
            if args.incremental:
                _confirmar_modelo_operativo()
        except BaseException as exc:
            conservar_salida_parcial(exc)
            raise

        print("\n" + "=" * 80)
        print("PROCESO COMPLETO")
        print(f"Capa 1             : {CAPA1_DIR}")
        print(f"Capa 2 final       : {CAPA2_DIR}")
        for nombre in encontrados:
            print(f"  - {nombre}")
        print(f"Modelo Power BI    : {CAPA2_DIR / 'Modelo_Dashboard.tmdl'}")
        print(f"Duración total      : {(perf_counter() - inicio_total) / 60:.2f} minutos")
        print("=" * 80)
        return 0

    except Exception as exc:
        print("\nERROR EN LA EJECUCIÓN GENERAL", file=sys.stderr)
        print(str(exc), file=sys.stderr)
        return 1


if __name__ == "__main__":
    finalizar_proceso(main())
