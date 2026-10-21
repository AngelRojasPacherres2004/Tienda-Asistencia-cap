from __future__ import annotations

import platform
import struct
import sys

from runtime_config import (
    cerrar_duckdb_seguro,
    configurar_duckdb,
    finalizar_proceso,
)


def main() -> int:
    print("Python:", sys.version.replace("\n", " "))
    print("Ejecutable:", sys.executable)
    print("Arquitectura:", struct.calcsize("P") * 8, "bits")
    print("Sistema:", platform.platform())

    try:
        import duckdb
    except Exception as exc:
        print("ERROR importando DuckDB:", repr(exc))
        return 1

    print("DuckDB:", duckdb.__version__)
    con = None
    try:
        con = duckdb.connect(database=":memory:")
        configurar_duckdb(con)
        resultado = con.execute("SELECT 1 AS prueba").fetchone()
        print("Prueba SQL:", resultado)
        cerrar_duckdb_seguro(con)
        con = None
        print("Liberación segura de conexión: OK")
    except Exception as exc:
        print("ERROR durante la prueba de DuckDB:", repr(exc))
        if con is not None:
            cerrar_duckdb_seguro(con)
        return 1

    print("ENTORNO DUCKDB CORRECTO")
    return 0


if __name__ == "__main__":
    finalizar_proceso(main())
