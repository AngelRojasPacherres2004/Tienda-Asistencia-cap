from __future__ import annotations

"""Panel gráfico simplificado para operar los BAT sin usar la consola manualmente.

Solo actualiza: ventas, transferencias, ingresos y stock (stock: 1 vez al mes).
"""

import subprocess
import tkinter as tk
import json
from calendar import monthrange
from datetime import date
from pathlib import Path
from tkinter import messagebox, ttk

from project_paths import PROJECT_ROOT
from runtime_config import finalizar_proceso

try:
    from tkcalendar import DateEntry
except ImportError:
    DateEntry = None

NUEVA_CONSOLA = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)
class PanelDashboard(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Dashboard General · Panel de control")
        self.geometry("720x610")
        self.minsize(680, 570)
        self.configure(background="#f3f6fb")
        self.fecha_inicio = tk.StringVar(value="")
        self.fecha_fin = tk.StringVar(value="")
        self.estado = tk.StringVar(value=self._estado_ultima_actualizacion())
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
                "Actualización diaria: sobrescribe los Excel nuevos en input\\ y procesa solo la entrega nueva.\n"
                "El histórico ya vive en Parquet; no copies Excel de 2024–2026 nuevamente."
            ),
            style="Hint.TLabel",
            wraplength=590,
        ).pack(anchor="w", pady=(4, 16))

        # Sección: corte
        filtro_marco = ttk.LabelFrame(marco, text="Fecha de procesamiento", padding=12)
        filtro_marco.pack(fill="x")

        fila1 = ttk.Frame(filtro_marco)
        fila1.pack(fill="x", pady=(0, 6))
        ttk.Label(fila1, text="Fecha de corte:", style="Section.TLabel").pack(side="left")
        self._crear_selector_fecha(fila1, self.fecha_fin).pack(side="left", padx=4)

        ttk.Label(
            filtro_marco,
            text=("La fecha es obligatoria. STOCK.xlsx solo se admite el último día del mes; "
                  "ventas, ingresos y transferencias se ejecutan cada día."),
            style="Hint.TLabel",
        ).pack(anchor="w")
        acciones_fecha = ttk.Frame(filtro_marco)
        acciones_fecha.pack(anchor="e", pady=(4, 0))
        ttk.Button(
            acciones_fecha,
            text="Usar cierre de mes",
            command=self._usar_cierre_de_mes,
        ).pack(side="left", padx=(0, 6))
        ttk.Button(acciones_fecha, text="Limpiar fecha", command=self._limpiar_fechas).pack(side="left")

        # Sección: Botones principales
        botones_marco = ttk.LabelFrame(marco, text="Acciones", padding=12)
        botones_marco.pack(fill="x", pady=(12, 0))

        acciones = (
            ("⟳  Actualizar datos locales",        self._actualizar,       0, 0),
            ("▶  Abrir dashboard local",            lambda: self._bat("4_EJECUTAR_DASHBOARD_WEB.bat"), 0, 1),
            ("📁  Abrir carpeta input",              self._abrir_carpeta_input, 1, 0),
            ("📦  Crear paquete portable",           lambda: self._bat("3_CREAR_PAQUETE_PORTABLE.bat"), 1, 1),
            ("🔧  Instalar / reparar requisitos",   lambda: self._bat("1_INSTALAR_REQUISITOS.bat"),    2, 0),
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
                "• input\\VENTAS.xlsx, input\\INGRESO.xlsx e input\\TRANSFERENCIAS.xlsx: obligatorios cada día.\n"
                "• Sobrescribe esos tres archivos con la entrega del día nuevo y pulsa Actualizar.\n"
                "• input\\STOCK.xlsx: opcional y solo el último día de cada mes (30/31, o 28/29).\n"
                "• Personal, tráfico, catálogo, tiendas, metas y merma se consultan desde Supabase.\n"
                "• El mismo botón genera los cuatro Parquet para el Asistente Comercial."
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
        self.fecha_fin.set("")

    def _usar_cierre_de_mes(self) -> None:
        """Selecciona el último día del mes visible en el corte actual."""
        try:
            referencia = date.fromisoformat(self.fecha_fin.get().strip())
        except ValueError:
            referencia = date.today()
        cierre = date(
            referencia.year,
            referencia.month,
            monthrange(referencia.year, referencia.month)[1],
        )
        self.fecha_fin.set(cierre.isoformat())
        self.estado.set(
            f"Cierre mensual seleccionado: {cierre.isoformat()}. "
            "Coloca también STOCK.xlsx antes de actualizar."
        )

    def _abrir_carpeta_input(self) -> None:
        carpeta = PROJECT_ROOT / "input"
        carpeta.mkdir(parents=True, exist_ok=True)
        try:
            subprocess.Popen(["explorer.exe", str(carpeta)])
        except OSError as exc:
            messagebox.showerror("No se pudo abrir la carpeta", str(exc))
            return
        self.estado.set(
            "Carpeta input abierta. Copia o sobrescribe los archivos RMS con los nombres exactos."
        )

    def _crear_selector_fecha(self, padre: ttk.Frame, variable: tk.StringVar) -> tk.Widget:
        if DateEntry is not None:
            selector = DateEntry(
                padre, textvariable=variable, date_pattern="yyyy-mm-dd",
                width=11, font=("Segoe UI", 10),
            )
            selector.delete(0, "end")
            return selector
        return ttk.Entry(padre, textvariable=variable, width=13, font=("Segoe UI", 10))

    def _estado_ultima_actualizacion(self) -> str:
        ruta = PROJECT_ROOT / "dashboard-data" / "dashboard.json"
        try:
            metadata = json.loads(ruta.read_text(encoding="utf-8")).get("metadata", {})
            corte = metadata.get("selectedCutoff") or metadata.get("salesCutoff")
            fecha = date.fromtimestamp(ruta.stat().st_mtime).isoformat()
            return f"Última actualización local: {fecha}. Corte publicado: {corte or 'sin dato'}."
        except (OSError, ValueError, json.JSONDecodeError):
            return "Aún no hay una actualización local publicada."

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
            ["cmd.exe", "/d", "/k", comando],
            cwd=PROJECT_ROOT,
            creationflags=NUEVA_CONSOLA,
        )
        self.estado.set(f"En ejecución: {descripcion}. La consola queda abierta para mostrar el resultado o el error.")

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
        fin = self._validar_fecha(self.fecha_fin.get(), "Fecha de corte")
        if fin is None:
            return
        if not fin:
            messagebox.showerror("Falta la fecha", "Selecciona la fecha de corte de la entrega.")
            return
        nombres_diarios = ("VENTAS.xlsx", "INGRESO.xlsx", "TRANSFERENCIAS.xlsx")
        faltantes = [nombre for nombre in nombres_diarios if not (PROJECT_ROOT / "input" / nombre).is_file()]
        if faltantes:
            messagebox.showinfo(
                "Falta la entrega RMS",
                "Faltan en input\\: " + ", ".join(faltantes) + ".\n\n"
                "Usa los nombres exactos y sobrescríbelos cada día con la data nueva.",
            )
            return
        stock = PROJECT_ROOT / "input" / "STOCK.xlsx"
        fecha_corte = date.fromisoformat(fin)
        if stock.is_file() and fecha_corte.day != monthrange(fecha_corte.year, fecha_corte.month)[1]:
            messagebox.showerror(
                "Stock fuera de cierre",
                "STOCK.xlsx solo se procesa el último día del mes. Retíralo de input\\ para una actualización diaria.",
            )
            return

        args = ["--fecha-corte", fin, "--anio-fin", str(fecha_corte.year)]

        self._bat("2_ACTUALIZAR_DATOS.bat", "--incremental", *args)


def main() -> None:
    PanelDashboard().mainloop()


if __name__ == "__main__":
    finalizar_proceso(main())
