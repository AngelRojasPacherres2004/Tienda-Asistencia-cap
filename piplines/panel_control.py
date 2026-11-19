from __future__ import annotations

"""Panel local para preparar lotes mensuales RMS."""

import json
import subprocess
import tkinter as tk
from calendar import monthrange
from datetime import date
from tkinter import messagebox, ttk
from tkcalendar import DateEntry

from project_paths import PROJECT_ROOT
from runtime_config import finalizar_proceso
from operacion_mensual import descubrir_archivos, parse_periodo

NAVY, BLUE, PALE, CARD = "#0f377e", "#1b4fa3", "#eef3fa", "#ffffff"
TEXT, MUTED, BORDER = "#13233f", "#64748b", "#cbd8ee"
NUEVA_CONSOLA = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)


class PanelDashboard(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Dashboard General · Operación local")
        self.geometry("760x410")
        self.minsize(680, 380)
        self.configure(background=PALE)
        self.entrada, self.salida = PROJECT_ROOT / "Entrada", PROJECT_ROOT / "Salida"
        self.periodo, self.fecha_corte = tk.StringVar(), tk.StringVar()
        self._min_corte: date | None = None
        self._max_corte: date | None = None
        self.estado = tk.StringVar(value="Selecciona un período para comenzar.")
        self.entrada.mkdir(parents=True, exist_ok=True)
        self.salida.mkdir(parents=True, exist_ok=True)
        self._crear_interfaz()
        self._refrescar_periodos()

    def _crear_interfaz(self) -> None:
        style = ttk.Style(self)
        style.theme_use("clam")
        style.configure("Panel.TCombobox", padding=7, font=("Segoe UI", 10))
        style.configure("Primary.TButton", font=("Segoe UI", 10, "bold"), padding=(14, 10), foreground="white", background=NAVY)
        style.map("Primary.TButton", background=[("active", BLUE)])
        style.configure("Secondary.TButton", font=("Segoe UI", 10, "bold"), padding=(14, 10), foreground=NAVY, background=CARD)
        style.map("Secondary.TButton", background=[("active", "#e5edf9")])

        header = tk.Frame(self, bg=NAVY, height=86)
        header.pack(fill="x")
        header.pack_propagate(False)
        tk.Label(header, text="DASHBOARD GENERAL", bg=NAVY, fg="white", font=("Segoe UI", 10, "bold")).pack(anchor="w", padx=28, pady=(17, 0))
        tk.Label(header, text="Operación de datos", bg=NAVY, fg="white", font=("Segoe UI", 22, "bold")).pack(anchor="w", padx=28, pady=(0, 12))

        content = tk.Frame(self, bg=PALE, padx=28, pady=20)
        content.pack(fill="both", expand=True)
        period_card = tk.Frame(content, bg=CARD, highlightbackground=BORDER, highlightthickness=1, padx=18, pady=15)
        period_card.pack(fill="x")
        tk.Label(period_card, text="PERÍODO DE TRABAJO", bg=CARD, fg=TEXT, font=("Segoe UI", 9, "bold")).grid(row=0, column=0, columnspan=4, sticky="w")
        tk.Label(period_card, text="Período", bg=CARD, fg=MUTED, font=("Segoe UI", 9, "bold")).grid(row=1, column=0, sticky="w", pady=(10, 3))
        self.periodo_selector = ttk.Combobox(period_card, textvariable=self.periodo, state="readonly", style="Panel.TCombobox", width=13, postcommand=self._refrescar_periodos)
        self.periodo_selector.grid(row=2, column=0, sticky="ew", padx=(0, 12))
        self.periodo_selector.bind("<<ComboboxSelected>>", self._cambio_periodo)
        tk.Label(period_card, text="Fecha de corte", bg=CARD, fg=MUTED, font=("Segoe UI", 9, "bold")).grid(row=1, column=1, sticky="w", pady=(10, 3))
        self.fecha_selector = DateEntry(
            period_card, textvariable=self.fecha_corte, date_pattern="yyyy-mm-dd",
            state="readonly", width=16, font=("Segoe UI", 10),
            background=NAVY, foreground="white", bordercolor=BORDER,
        )
        self.fecha_selector.grid(row=2, column=1, sticky="ew", padx=(0, 12))
        ttk.Button(period_card, text="Cierre de mes", command=self._usar_cierre, style="Secondary.TButton").grid(row=2, column=2, sticky="ew")
        period_card.columnconfigure(0, weight=2)
        period_card.columnconfigure(1, weight=2)

        actions = tk.Frame(content, bg=PALE, pady=16)
        actions.pack(fill="x")
        for col in range(2):
            actions.columnconfigure(col, weight=1)
        buttons = (
            ("Procesar", self._procesar, "Primary.TButton", 0, 0),
            ("Publicar web", self._publicar, "Secondary.TButton", 0, 1),
        )
        for label, command, button_style, row, column in buttons:
            padx = (0, 8) if column == 0 else (8, 0)
            ttk.Button(actions, text=label, command=command, style=button_style).grid(row=row, column=column, sticky="ew", padx=padx, pady=5)

        footer = tk.Frame(content, bg=CARD, highlightbackground=BORDER, highlightthickness=1, padx=15, pady=12)
        footer.pack(fill="x")
        tk.Label(footer, textvariable=self.estado, bg=CARD, fg=MUTED, font=("Segoe UI", 9), anchor="w", justify="left", wraplength=650).pack(fill="x")

    def _periodos(self) -> list[str]:
        result: list[str] = []
        for folder in self.entrada.iterdir():
            if folder.is_dir() and len(folder.name) == 6 and folder.name.isdigit():
                year, month = int(folder.name[:4]), int(folder.name[4:])
                if 2000 <= year <= 2100 and 1 <= month <= 12:
                    result.append(folder.name)
        return sorted(result)

    def _refrescar_periodos(self) -> None:
        values = self._periodos()
        self.periodo_selector["values"] = values
        if values and self.periodo.get() not in values:
            self.periodo.set(values[0])
            self._cambio_periodo()
        elif not values:
            self.periodo.set("")
            self.fecha_corte.set("")
            self.estado.set("Ejecuta Instalar / reparar para crear los períodos de Entrada.")
        else:
            self._actualizar_estado()

    def _cambio_periodo(self, _event: object | None = None) -> None:
        period = self.periodo.get()
        if not period:
            return
        year, month = parse_periodo(period)
        first, limit = self._rango_fechas_del_periodo(year, month)
        self._min_corte, self._max_corte = first, limit
        if first is None or limit is None:
            self.fecha_corte.set("")
            self.fecha_selector.configure(state="disabled")
            self.estado.set("Ese período todavía no tiene fechas disponibles.")
            return
        self.fecha_selector.configure(mindate=first, maxdate=limit, state="readonly")
        self.fecha_selector.set_date(limit)
        self._actualizar_estado()

    def _rango_fechas_del_periodo(self, year: int, month: int) -> tuple[date | None, date | None]:
        first = date(year, month, 1)
        last = date(year, month, monthrange(year, month)[1])
        limit = min(last, date.today())
        if first > limit:
            return None, None
        return first, limit

    def _usar_cierre(self) -> None:
        period = self.periodo.get()
        if not period:
            messagebox.showerror("Selecciona un período", "Primero selecciona la carpeta mensual.")
            return
        year, month = parse_periodo(period)
        closing = date(year, month, monthrange(year, month)[1]).isoformat()
        if self._max_corte is None or date.fromisoformat(closing) > self._max_corte:
            messagebox.showerror("Cierre no disponible", "El cierre de este período todavía está en el futuro.")
            return
        self.fecha_selector.set_date(date.fromisoformat(closing))
        self.estado.set("Cierre seleccionado. Incluye STOCK.xlsx antes de procesar.")

    def _manifest(self) -> dict[str, object] | None:
        if not self.periodo.get():
            return None
        try:
            return json.loads((self.salida / self.periodo.get() / "manifiesto.json").read_text(encoding="utf-8"))
        except (OSError, ValueError, json.JSONDecodeError):
            return None

    def _actualizar_estado(self) -> None:
        manifest = self._manifest()
        if manifest:
            self.estado.set(f"Último lote · {manifest.get('periodo')} · corte {manifest.get('fechaCorte')} · {str(manifest.get('estado', '')).title()}")
        elif self.periodo.get():
            self.estado.set(f"Entrada {self.periodo.get()} lista para recibir la entrega RMS.")

    def _validar(self) -> tuple[str, str] | None:
        period, cutoff_text = self.periodo.get().strip(), self.fecha_corte.get().strip()
        if not period:
            messagebox.showerror("Falta el período", "Selecciona una carpeta mensual de Entrada.")
            return None
        try:
            cutoff = date.fromisoformat(cutoff_text)
        except ValueError:
            messagebox.showerror("Fecha inválida", "Usa una fecha válida en formato AAAA-MM-DD.")
            return None
        if cutoff.strftime("%Y%m") != period:
            messagebox.showerror("Fecha fuera del período", "La fecha de corte debe pertenecer al período seleccionado.")
            return None
        if self._min_corte is None or self._max_corte is None or not self._min_corte <= cutoff <= self._max_corte:
            messagebox.showerror("Fecha no disponible", "Selecciona una fecha válida desde el calendario del período.")
            return None
        folder = self.entrada / period
        try:
            sources = descubrir_archivos(folder)
        except (FileNotFoundError, ValueError) as exc:
            messagebox.showerror("Entrega RMS", str(exc))
            return None
        stock = sources.get("stock")
        last_day = monthrange(cutoff.year, cutoff.month)[1]
        if stock is not None and cutoff.day != last_day:
            messagebox.showerror("Stock fuera de cierre", "STOCK.xlsx solo se procesa el último día del mes.")
            return None
        if cutoff.day == last_day and stock is None:
            messagebox.showerror("Falta STOCK.xlsx", "Para cerrar el mes agrega STOCK.xlsx en esta carpeta.")
            return None
        return period, cutoff.isoformat()

    def _procesar(self) -> None:
        data = self._validar()
        if data:
            self._bat("2_ACTUALIZAR_DATOS.bat", "--periodo", data[0], "--fecha-corte", data[1])

    def _publicar(self) -> None:
        data = self._validar()
        if data is None:
            return
        manifest = self._manifest()
        if not manifest or manifest.get("fechaCorte") != data[1]:
            messagebox.showerror("Procesamiento requerido", "Procesa este corte antes de publicarlo en la web.")
            return
        self._bat("5_PUBLICAR_WEB.bat", "--periodo", data[0], "--fecha-corte", data[1])

    def _lanzar(self, command: list[str], description: str) -> None:
        subprocess.Popen(command, cwd=PROJECT_ROOT, creationflags=NUEVA_CONSOLA)
        self.estado.set(f"En ejecución · {description}")

    def _bat(self, name: str, *args: str) -> None:
        path = PROJECT_ROOT / name
        if not path.is_file():
            messagebox.showerror("Archivo no encontrado", f"No se encontró {name}.")
            return
        # El panel siempre ejecuta de forma desatendida: las pipelines no
        # solicitan datos y los .bat omiten su pausa final. Se conserva la
        # ventana para que el operador pueda ver progreso o un error y
        # cerrarla cuando quiera, sin tener que presionar Enter.
        self._lanzar([
            "cmd.exe", "/d", "/k", "call", str(path), *args, "--sin-pausa",
        ], name)


def main() -> None:
    PanelDashboard().mainloop()


if __name__ == "__main__":
    finalizar_proceso(main())
