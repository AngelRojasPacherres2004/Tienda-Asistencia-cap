from __future__ import annotations
from runtime_config import finalizar_proceso

"""Orquestador completo: input RMS -> Capa 1 -> Capa 2 -> modelo TMDL."""

import argparse
import importlib.util
import json
import os
import platform
import shutil
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
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

CODIGO_STACK_OVERFLOW_WINDOWS = 0xC00000FD


ARCHIVOS_MANUALES_REQUERIDOS = (
    "TIENDAS.xlsx",
    "CATALOGO_TIENDAS.xlsx",
    "GUIAS_EN_TRANSITO.xlsx",
    "MERMA.xlsx",
    "METAS_TIENDAS.xlsx",
    "PERSONAL_TIENDAS.xlsx",
    "TRAFICO_CLIENTES.xlsx",
)


def validar_entorno_previo(fecha_corte: date | None, solo_capa2: bool) -> None:
    """Falla temprano ante problemas de entorno, rutas o espacio en disco."""

    print("\n" + "=" * 80)
    print("VALIDACIÓN PREVIA DEL ENTORNO")
    print("=" * 80)
    print(f"Python       : {platform.python_version()}")
    print(f"Ejecutable   : {sys.executable}")
    print(f"Proyecto     : {PROJECT_ROOT}")
    print(
        "Fecha corte  : "
        + (fecha_corte.isoformat() if fecha_corte else "AUTOMÁTICA · ÚLTIMA VENTA")
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

    if fecha_corte is not None and fecha_corte > date.today():
        print(
            "ADVERTENCIA: la fecha de corte está en el futuro respecto al equipo.",
            flush=True,
        )

    manuales_faltantes = [
        nombre for nombre in ARCHIVOS_MANUALES_REQUERIDOS
        if not (CAPA1_DIR / nombre).exists()
    ]
    if manuales_faltantes:
        raise FileNotFoundError(
            "Faltan Excel estructurados en capa1: " + ", ".join(manuales_faltantes)
        )

    if solo_capa2:
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
        "patrones": ("VENTAS*.xlsx",),
        "salida": "Fact_Ventas.parquet",
        "dependencias": ("ventas_pipeline.py", "_base_ventas.py", "xlsx_fast.py", "capa1_cache.py"),
    },
    "ingreso_pipeline.py": {
        "patrones": ("INGRESO*.xlsx",),
        "salida": "Fact_Ingresos.parquet",
        "dependencias": ("ingreso_pipeline.py", "_base_ingresos.py", "xlsx_fast.py", "capa1_cache.py"),
    },
    "transferencia_pipeline.py": {
        "patrones": ("TRANF*.xlsx", "TRANSFER*.xlsx"),
        "salida": "Fact_Transferencias.parquet",
        "dependencias": ("transferencia_pipeline.py", "_base_transferencias.py", "xlsx_fast.py", "capa1_cache.py"),
    },
    "stock_pipeline.py": {
        "patrones": ("STOCK*.xlsx",),
        "salida": "Fact_Stock.parquet",
        "dependencias": ("stock_pipeline.py", "_base_stock.py"),
    },
}


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


def _archivos_fuente(patrones: tuple[str, ...]) -> list[Path]:
    input_dir = PROJECT_ROOT / "input"
    encontrados: dict[str, Path] = {}
    for patron in patrones:
        for archivo in input_dir.glob(patron):
            if archivo.is_file() and not archivo.name.startswith("~$"):
                encontrados[str(archivo.resolve()).lower()] = archivo
    return sorted(encontrados.values(), key=lambda x: x.name.lower())


def capa1_puede_reutilizarse(script: str) -> tuple[bool, str]:
    config = CAPA1_INCREMENTAL.get(script)
    if not config:
        return False, "sin configuración incremental"
    salida = CAPA1_DIR / str(config["salida"])
    if not salida.exists() or salida.stat().st_size == 0:
        return False, "salida inexistente"
    fuentes = _archivos_fuente(config["patrones"])
    if not fuentes:
        return False, "sin archivos de entrada"
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
) -> None:
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
        ("stock_pipeline.py", ["--solo-capa1"], ["--verificar-capa1"], True),
    ]
    pendientes: list[tuple[str, list[str], list[str] | None, bool]] = []
    for script, argumentos, validacion, opcional in pasos_base:
        reutilizar, motivo = capa1_puede_reutilizarse(script)
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
    ejecutar_grupo_paralelo(
        pendientes,
        paralelismo,
        {"ETL_FORCE_C1_CACHE": "1"} if forzar else {"ETL_FORCE_C1_CACHE": "0"},
    )


def detectar_fecha_corte_ventas() -> str:
    """Devuelve la última fecha comercial publicada en FactVentas."""

    import duckdb

    fact_ventas = CAPA2_DIR / "FactVentas.parquet"
    if not fact_ventas.exists():
        raise FileNotFoundError(
            "No se puede inferir la fecha de stock porque falta FactVentas.parquet."
        )
    conexion = duckdb.connect()
    valor = conexion.execute(
        "SELECT MAX(fecha_venta) FROM read_parquet(?)",
        [str(fact_ventas)],
    ).fetchone()[0]
    if valor is None:
        raise RuntimeError(
            "FactVentas.parquet no contiene una fecha de venta utilizable."
        )
    fecha = valor.date() if isinstance(valor, datetime) else valor
    if not isinstance(fecha, date):
        fecha = date.fromisoformat(str(fecha)[:10])
    return fecha.isoformat()


def fase_capa2(
    fecha: str | None,
    omitir_faltantes: bool,
    paralelismo: int = 2,
    anio_inicio: int = ANIO_INICIO_MODELO,
) -> str:
    print("\n" + "#" * 80)
    print("FASE 2 - CAPA 1 -> CAPA 2 MODELO")
    print("#" * 80)

    limpiar_capa2_generada()
    limpiar_modelo_powerbi()
    limpiar_temporales()

    # Las dimensiones maestras deben existir antes de validar hechos manuales.
    ejecutar("tiendas_pipeline.py", [], ["--verificar-capa2"])
    ejecutar(
        "clasificacion_producto_pipeline.py",
        ["--solo-capa2"],
        ["--verificar-capa2"],
    )

    # Ventas domina CPU, disco y memoria. Ejecutarla sola permite que DuckDB use
    # todos los hilos disponibles y evita la degradación observada al competir
    # con otras facts sobre los mismos Parquet y el mismo disco.
    ejecutar("ventas_pipeline.py", ["--solo-capa2"], ["--verificar-capa2"])

    fecha_efectiva = fecha or detectar_fecha_corte_ventas()
    print(
        "Fecha comercial de Stock y Guías: "
        f"{fecha_efectiva}"
        + (" (indicada)" if fecha else " (última venta publicada)"),
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

    # Metas se ejecuta de forma aislada. Aunque contiene pocas filas, es una
    # tabla crítica para KPIs y debe fallar temprano antes de procesar Guías.
    # La transformación usa Python para la homologación y una consulta DuckDB
    # plana únicamente para escribir el Parquet, evitando árboles SQL profundos.
    ejecutar(
        "metas_tiendas_pipeline.py",
        ["--solo-capa2", "--anio-inicio", str(anio_inicio)],
        ["--verificar-capa2"],
    )

    # Guías y las demás fuentes manuales son independientes. Se procesan con
    # concurrencia controlada después de validar Metas.
    ejecutar_grupo_paralelo(
        [
            (
                "guias_transito_pipeline.py",
                ["--solo-capa2", "--fecha-corte", fecha_efectiva],
                ["--verificar-capa2"],
                False,
            ),
            ("merma_pipeline.py", ["--solo-capa2"], ["--verificar-capa2"], False),
            ("personal_tiendas_pipeline.py", ["--solo-capa2"], ["--verificar-capa2"], False),
            ("trafico_clientes_pipeline.py", ["--solo-capa2"], ["--verificar-capa2"], False),
        ],
        min(paralelismo, 2),
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
            "Fecha comercial de corte para Stock y Guías, formato YYYY-MM-DD. "
            "Si se omite, usa automáticamente la última fecha de FactVentas."
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
        validar_entorno_previo(args.fecha_corte, solo_capa2)

        if not solo_capa2:
            fase_capa1(args.omitir_faltantes, args.reconstruir_capa1, args.paralelismo)

        # Los Excel comerciales estructurados permanecen en Capa 1 y se auditan
        # junto con los Parquet RMS antes de modelar.
        ejecutar("auditar_entradas.py")
        ejecutar("auditar_excel_comerciales.py")

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
            fase_capa2(
                fecha, args.omitir_faltantes, args.paralelismo, args.anio_inicio
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
            ejecutar("generar_modelo_powerbi.py", opcional)

            limpiar_temporales()
            encontrados, extras = validar_contenido_capa2()
            if extras:
                raise RuntimeError(
                    "Capa 2 contiene archivos Parquet no reconocidos: "
                    + ", ".join(extras)
                )
            confirmar_salida()
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
