from __future__ import annotations

"""Panel gráfico mínimo para operar los BAT sin usar la consola manualmente."""

import subprocess
import tkinter as tk
from datetime import date
from pathlib import Path
from tkinter import messagebox, ttk

from project_paths import PROJECT_ROOT
from runtime_config import finalizar_proceso


NUEVA_CONSOLA = getattr(subprocess, "CREATE_NEW_CONSOLE", 0)


class PanelDashboard(tk.Tk):
    def __init__(self) -> None:
        super().__init__()
        self.title("Dashboard General · Panel de control")
        self.geometry("650x520")
        self.minsize(620, 500)
        self.configure(background="#f3f6fb")
        self.fecha = tk.StringVar(value="")
        self.estado = tk.StringVar(value="Listo para ejecutar una tarea.")
        self._crear_interfaz()

    def _crear_interfaz(self) -> None:
        estilo = ttk.Style(self)
        estilo.configure("Title.TLabel", font=("Segoe UI", 18, "bold"), foreground="#18213a")
        estilo.configure("Hint.TLabel", font=("Segoe UI", 9), foreground="#5f6b7a")
        estilo.configure("Action.TButton", font=("Segoe UI", 10, "bold"), padding=10)

        marco = ttk.Frame(self, padding=24)
        marco.pack(fill="both", expand=True)
        ttk.Label(marco, text="Panel del Dashboard Comercial", style="Title.TLabel").pack(anchor="w")
        ttk.Label(
            marco,
            text=(
                "Sin fecha, se usa el último día con tráfico suficiente y ventas disponibles. "
                "Puedes indicar un corte manual si ya completaste los archivos."
            ),
            style="Hint.TLabel",
            wraplength=570,
        ).pack(anchor="w", pady=(5, 18))

        fecha_marco = ttk.LabelFrame(marco, text="Fecha de corte", padding=12)
        fecha_marco.pack(fill="x")
        ttk.Entry(fecha_marco, textvariable=self.fecha, width=18, font=("Segoe UI", 12)).pack(side="left")
        ttk.Label(fecha_marco, text="  Formato: AAAA-MM-DD", style="Hint.TLabel").pack(side="left")
        ttk.Button(fecha_marco, text="Corte automático", command=self._restablecer_automatico).pack(side="right")

        botones = ttk.Frame(marco)
        botones.pack(fill="x", pady=18)
        acciones = (
            ("Actualizar datos locales", self._actualizar),
            ("Actualizar y publicar en la web", self._actualizar_y_publicar),
            ("Publicar datos ya procesados", lambda: self._ejecutar_bat("6_ACTUALIZAR_DASHBOARD_WEB.bat")),
            ("Abrir dashboard local", lambda: self._ejecutar_bat("4_EJECUTAR_DASHBOARD_WEB.bat")),
            ("Crear paquete portable", lambda: self._ejecutar_bat("3_CREAR_PAQUETE_PORTABLE.bat")),
            ("Instalar requisitos", lambda: self._ejecutar_bat("1_INSTALAR_REQUISITOS.bat")),
        )
        for fila, (texto, accion) in enumerate(acciones):
            ttk.Button(botones, text=texto, command=accion, style="Action.TButton").grid(
                row=fila // 2, column=fila % 2, padx=5, pady=5, sticky="ew"
            )
        botones.columnconfigure(0, weight=1)
        botones.columnconfigure(1, weight=1)

        reglas = ttk.LabelFrame(marco, text="Reglas de actualización", padding=12)
        reglas.pack(fill="x")
        ttk.Label(
            reglas,
            text=(
                "• El corte exige ventas y tráfico del día seleccionado.\n"
                "• Stock conserva su fecha de fotografía; no se inventa un corte nuevo.\n"
                "• La publicación incluye dashboard y reportes anuales privados."
            ),
            style="Hint.TLabel",
            justify="left",
        ).pack(anchor="w")
        ttk.Label(marco, textvariable=self.estado, style="Hint.TLabel", wraplength=570).pack(
            anchor="w", pady=(16, 0)
        )

    def _restablecer_automatico(self) -> None:
        self.fecha.set("")

    def _fecha_valida(self) -> str | None:
        texto = self.fecha.get().strip()
        if not texto:
            return ""
        try:
            elegida = date.fromisoformat(texto)
        except ValueError:
            messagebox.showerror("Fecha inválida", "Escribe la fecha como AAAA-MM-DD.")
            return None
        if elegida < date(2023, 1, 1):
            messagebox.showerror("Fecha fuera del modelo", "El modelo comercial comienza el 2023-01-01.")
            return None
        avisos: list[str] = []
        if elegida > date.today():
            avisos.append("La fecha está en el futuro.")
        if avisos and not messagebox.askyesno(
            "Confirmar fecha manual",
            "\n".join(avisos) + "\n\n¿Deseas usarla de todas formas?",
        ):
            return None
        return texto

    def _lanzar(self, comando: str, descripcion: str) -> None:
        subprocess.Popen(
            ["cmd.exe", "/d", "/c", comando],
            cwd=PROJECT_ROOT,
            creationflags=NUEVA_CONSOLA,
        )
        self.estado.set(f"En ejecución: {descripcion}. Revisa la ventana que acaba de abrirse.")

    def _ejecutar_bat(self, nombre: str, *argumentos: str) -> None:
        ruta = PROJECT_ROOT / nombre
        if not ruta.exists():
            messagebox.showerror("Archivo no encontrado", f"No se encontró {nombre}.")
            return
        argumentos_cmd = " ".join(f'"{a}"' if " " in a else a for a in argumentos)
        self._lanzar(f'call "{ruta}" {argumentos_cmd}'.strip(), nombre)

    def _actualizar(self) -> None:
        corte = self._fecha_valida()
        if corte is not None:
            argumentos = ("--fecha-corte", corte) if corte else ()
            self._ejecutar_bat("2_ACTUALIZAR_DATOS.bat", *argumentos)

    def _actualizar_y_publicar(self) -> None:
        corte = self._fecha_valida()
        if corte is None:
            return
        argumentos = ("--fecha-corte", corte) if corte else ()
        self._ejecutar_bat("7_ACTUALIZAR_TODO.bat", *argumentos)



def main() -> None:
    PanelDashboard().mainloop()


if __name__ == "__main__":
    finalizar_proceso(main())
