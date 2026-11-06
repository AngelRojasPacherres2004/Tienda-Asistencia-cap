from __future__ import annotations

"""Panel gráfico simplificado para operar los BAT sin usar la consola manualmente.

Solo actualiza: ventas, transferencias, ingresos y stock (stock: 1 vez al mes).
"""

import subprocess
import tkinter as tk
from datetime import date
from pathlib import Path
from tkinter import messagebox, ttk

from project_paths import PROJECT_ROOT
from runtime_config import finalizar_proceso

NUEVA_CONSOLA = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
ANIO_ACTUAL = date.today().year
ANIOS_DISPONIBLES = list(range(2024, ANIO_ACTUAL + 1))


class PanelDashboard(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Dashboard General · Panel de control")
        self.geometry("680x560")
        self.minsize(640, 520)
        self.configure(background="#f3f6fb")
        self.anio = tk.StringVar(value=str(ANIO_ACTUAL))
        self.fecha_inicio = tk.StringVar(value="")
        self.fecha_fin = tk.StringVar(value="")
        self.estado = tk.StringVar(value="Listo para ejecutar una tarea.")
        self._crear_interfaz()

    # ------------------------------------------------------------------ #
    #  Interfaz                                                            #
    # ------------------------------------------------------------------ #

    def _crear_interfaz(self) -> None:
        estilo = ttk.Style(self)
        estilo.configure("Title.TLabel",   font=("Segoe UI", 18, "bold"), foreground="#18213a")
        estilo.configure("Section.TLabel", font=("Segoe UI", 10, "bold"), foreground="#18213a")
        estilo.configure("Hint.TLabel",    font=("Segoe UI", 9),          foreground="#5f6b7a")
        estilo.configure("Action.TButton", font=("Segoe UI", 10, "bold"),  padding=10)
        estilo.configure("Danger.TButton", font=("Segoe UI", 10, "bold"),  padding=10)

        marco = ttk.Frame(self, padding=24)
        marco.pack(fill="both", expand=True)

        # Título
        ttk.Label(marco, text="Panel del Dashboard Comercial", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            marco,
            text=(
                "Actualiza ventas, transferencias, ingresos y stock (solo 1 vez al mes).\n"
                "Selecciona el año de los datos y, opcionalmente, un rango de fechas dentro del año."
            ),
            style="Hint.TLabel",
            wraplength=590,
        ).pack(anchor="w", pady=(4, 16))

        # Sección: Año y fechas
        filtro_marco = ttk.LabelFrame(marco, text="Año y rango de corte", padding=12)
        filtro_marco.pack(fill="x")

        fila1 = ttk.Frame(filtro_marco)
        fila1.pack(fill="x", pady=(0, 6))
        ttk.Label(fila1, text="Año:", style="Section.TLabel").pack(side="left")
        cb_anio = ttk.Combobox(
            fila1,
            textvariable=self.anio,
            values=[str(a) for a in ANIOS_DISPONIBLES],
            state="readonly",
            width=8,
            font=("Segoe UI", 11),
        )
        cb_anio.pack(side="left", padx=(6, 20))

        ttk.Label(fila1, text="Fecha inicio (opcional):", style="Hint.TLabel").pack(side="left")
        ttk.Entry(fila1, textvariable=self.fecha_inicio, width=13, font=("Segoe UI", 10)).pack(side="left", padx=(4, 12))
        ttk.Label(fila1, text="Fecha fin (opcional):", style="Hint.TLabel").pack(side="left")
        ttk.Entry(fila1, textvariable=self.fecha_fin, width=13, font=("Segoe UI", 10)).pack(side="left", padx=4)

        ttk.Label(
            filtro_marco,
            text="Formato de fechas: AAAA-MM-DD. Si no se indica rango, se usa todo el año seleccionado.",
            style="Hint.TLabel",
        ).pack(anchor="w")
        ttk.Button(filtro_marco, text="Limpiar fechas", command=self._limpiar_fechas).pack(anchor="e", pady=(4, 0))

        # Sección: Botones principales
        botones_marco = ttk.LabelFrame(marco, text="Acciones", padding=12)
        botones_marco.pack(fill="x", pady=(12, 0))

        acciones = (
            ("⟳  Actualizar datos locales",        self._actualizar,       0, 0),
            ("▶  Abrir dashboard local",            lambda: self._bat("4_EJECUTAR_DASHBOARD_WEB.bat"), 0, 1),
            ("📦  Crear paquete portable",           lambda: self._bat("3_CREAR_PAQUETE_PORTABLE.bat"), 1, 0),
            ("🔧  Instalar / reparar requisitos",   lambda: self._bat("1_INSTALAR_REQUISITOS.bat"),    1, 1),
        )
        for texto, accion, fila, col in acciones:
            ttk.Button(botones_marco, text=texto, command=accion, style="Action.TButton").grid(
                row=fila, column=col, padx=5, pady=5, sticky="ew"
            )
        botones_marco.columnconfigure(0, weight=1)
        botones_marco.columnconfigure(1, weight=1)

        # Reglas
        reglas = ttk.LabelFrame(marco, text="Qué se actualiza", padding=10)
        reglas.pack(fill="x", pady=(10, 0))
        ttk.Label(
            reglas,
            text=(
                "• Ventas        → se actualiza cada vez que hay datos nuevos del RMS.\n"
                "• Transferencias → igual que ventas.\n"
                "• Ingresos      → igual que ventas.\n"
                "• Stock         → solo 1 vez al mes (fotografía mensual).\n"
                "• El resto de dimensiones ya están fijas y no se reconstruyen."
            ),
            style="Hint.TLabel",
            justify="left",
        ).pack(anchor="w")

        ttk.Label(marco, textvariable=self.estado, style="Hint.TLabel", wraplength=590).pack(
            anchor="w", pady=(12, 0)
        )

    # ------------------------------------------------------------------ #
    #  Helpers                                                             #
    # ------------------------------------------------------------------ #

    def _limpiar_fechas(self) -> None:
        self.fecha_inicio.set("")
        self.fecha_fin.set("")

    def _validar_fecha(self, valor: str, nombre: str) -> str | None:
        texto = valor.strip()
        if not texto:
            return ""
        try:
            date.fromisoformat(texto)
        except ValueError:
            messagebox.showerror("Fecha inválida", f"{nombre}: usa el formato AAAA-MM-DD.")
            return None
        return texto

    def _lanzar(self, comando: str, descripcion: str) -> None:
        subprocess.Popen(
            ["cmd.exe", "/d", "/c", comando],
            cwd=PROJECT_ROOT,
            creationflags=NUEVA_CONSOLA,
        )
        self.estado.set(f"En ejecución: {descripcion}. Revisa la ventana que se abrió.")

    def _bat(self, nombre: str, *args: str) -> None:
        ruta = PROJECT_ROOT / nombre
        if not ruta.exists():
            messagebox.showerror("Archivo no encontrado", f"No se encontró {nombre}.")
            return
        args_str = " ".join(f'"{a}"' if " " in a else a for a in args)
        self._lanzar(f'call "{ruta}" {args_str}'.strip(), nombre)

    # ------------------------------------------------------------------ #
    #  Acciones de botones                                                 #
    # ------------------------------------------------------------------ #

    def _actualizar(self) -> None:
        anio = self.anio.get().strip()
        inicio = self._validar_fecha(self.fecha_inicio.get(), "Fecha inicio")
        fin    = self._validar_fecha(self.fecha_fin.get(),    "Fecha fin")
        if inicio is None or fin is None:
            return

        args: list[str] = []

        # Pasar fecha de corte si se indica fecha fin, si no usar la del año
        if fin:
            args += ["--fecha-corte", fin]
        elif inicio:
            # Sin fin pero con inicio: usar inicio como corte inicial del rango
            args += ["--fecha-corte", inicio]

        # Pasar el año seleccionado al script
        # El BAT acepta --anio-fin; usaremos esa variable de entorno alternativa
        # mediante el parámetro de paso directo al ejecutor
        if anio:
            args += ["--anio-fin", anio]

        self._bat("2_ACTUALIZAR_DATOS.bat", *args)


def main() -> None:
    PanelDashboard().mainloop()


if __name__ == "__main__":
    finalizar_proceso(main())
