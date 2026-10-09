import {
  AlertTriangle, BarChart3, Building2, CalendarCheck2, ClipboardCheck, GraduationCap,
  FileSpreadsheet, History, LogOut, Menu, Moon, PanelLeftClose, Settings, ShieldCheck, Sun, UserCircle2, Users, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import "../marketing-light.css";

const navByRole = {
  gerencia_general: [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "usuarios", label: "Usuarios", icon: Users },
    { id: "clusters", label: "Clústeres", icon: Building2 },
    { id: "tiendas", label: "Tiendas", icon: Building2 },
    { id: "zonal-supervisiones", label: "Auditorías", icon: ClipboardCheck },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "mis-capacitaciones", label: "Mis capacitaciones", icon: GraduationCap },
    { id: "gestion", label: "Gestión operativa", icon: AlertTriangle },
    { id: "reportes", label: "Reportes", icon: FileSpreadsheet },
    { id: "historial", label: "Historial", icon: History },
  ],
  gerente_comercial: [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "clusters", label: "Zonas", icon: Building2 },
    { id: "tiendas", label: "Tiendas", icon: Building2 },
    { id: "usuarios", label: "Personal", icon: Users },
    { id: "gestion", label: "Incidencias", icon: AlertTriangle },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "reportes", label: "Reportes", icon: FileSpreadsheet },
    { id: "historial", label: "Historial", icon: History },
  ],
  marketing: [
    { id: "marketing-inicio", label: "Inicio", icon: BarChart3 },
    { id: "marketing-personal", label: "Personal", icon: Users },
    { id: "marketing-asistencia", label: "Asistencia", icon: CalendarCheck2 },
    { id: "marketing-validacion", label: "Validación", icon: ClipboardCheck },
    { id: "marketing-campanas", label: "Campaña", icon: FileSpreadsheet },
    { id: "marketing-incidencias", label: "Incidencias", icon: AlertTriangle },
    { id: "marketing-capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "marketing-seguidores", label: "Seguidores por redes", icon: Users },
  ],
  coach: [
    { id: "cursos", label: "Crear capacitaciones", icon: GraduationCap },
    { id: "capacitaciones", label: "Asignar y seguimiento", icon: BarChart3 },
  ],
  jefe_zonal: [
    { id: "dashboard", label: "Resumen", icon: BarChart3 },
    { id: "tiendas", label: "Mis tiendas", icon: Building2 },
    { id: "zonal-personal", label: "Mis equipos", icon: Users },
    { id: "zonal-tareas", label: "Cronogramas y tareas", icon: ClipboardCheck },
    { id: "zonal-supervisiones", label: "Auditorías", icon: ClipboardCheck },
    { id: "zonal-incidencias", label: "Incidencias", icon: AlertTriangle },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "historial", label: "Historial", icon: History },
  ],
  jefe_tienda: [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "mi-tienda-gestion", label: "Mi tienda", icon: Building2 },
    { id: "usuarios", label: "Personal", icon: Users },
    { id: "asistencias", label: "Asistencias", icon: CalendarCheck2 },
    { id: "incidencias-tienda", label: "Incidencias", icon: AlertTriangle },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "mis-capacitaciones", label: "Mis capacitaciones", icon: GraduationCap },
    { id: "reportes", label: "Reportes", icon: FileSpreadsheet },
    { id: "historial", label: "Historial", icon: History },
  ],
  asistente_tienda: [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "usuarios", label: "Personal", icon: Users },
    { id: "asistencias", label: "Asistencias", icon: CalendarCheck2 },
    { id: "incidencias-tienda", label: "Incidencias", icon: AlertTriangle },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
  ],
  trabajador: [
    { id: "mi-asistencia", label: "Mi asistencia", icon: CalendarCheck2 },
    { id: "mis-capacitaciones", label: "Mis capacitaciones", icon: GraduationCap },
    { id: "profile", label: "Mi perfil", icon: UserCircle2 },
  ],
  seguridad: [
    { id: "seguridad", label: "Inicio", icon: BarChart3 },
    { id: "seguridad-trafico", label: "Tráfico", icon: Users },
    { id: "seguridad-incidencias", label: "Incidencias", icon: ShieldCheck },
  ],
};
navByRole.jefe_seguridad = navByRole.seguridad;
navByRole.vendedor = navByRole.trabajador;
navByRole.asistente = navByRole.trabajador;
navByRole.caja = navByRole.trabajador;
navByRole.almacenero = navByRole.trabajador;
navByRole.jefe_area = navByRole.trabajador;
const roleLabels = {
  gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", marketing: "Marketing", coach: "Coach",
  jefe_zonal: "Jefe zonal", jefe_tienda: "Jefe de tienda", asistente_tienda: "Asistente de tienda",
  trabajador: "Trabajador", vendedor: "Vendedor", asistente: "Asistente", caja: "Caja", almacenero: "Almacenero", jefe_area: "Jefe de área", seguridad: "Seguridad", jefe_seguridad: "Jefe de seguridad",
};

export default function Layout({ user, page, onNavigate, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [marketingTheme, setMarketingTheme] = useState(() => {
    try { return localStorage.getItem("marketing-theme") === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const isMarketing = page.startsWith("marketing-");
  const toggleMarketingTheme = () => {
    const next = marketingTheme === "light" ? "dark" : "light";
    setMarketingTheme(next);
    try { localStorage.setItem("marketing-theme", next); } catch { /* Keep switching available when storage is disabled. */ }
  };
  const items = navByRole[user.rol] || [];
  useEffect(() => { setMobileOpen(false); setUserMenuOpen(false); }, [page]);

  return (
    <div className={`app-shell ${compact ? "app-shell--compact" : ""} ${isMarketing ? `marketing-theme marketing-${marketingTheme}` : ""}`}>
      {mobileOpen && <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <span className="brand__mark">A</span>
          <div><strong>Asiste</strong><small>Tiendas &amp; equipos</small></div>
          <button className="sidebar-mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <nav>
          {items.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => onNavigate(id)} title={label}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar__footer">
          {user.rol === "jefe_zonal" && userMenuOpen && <button className="logout-button" onClick={() => { setUserMenuOpen(false); onNavigate("ajustes-zonal"); }}><Settings size={18} /><span>Ajustes</span></button>}
          <div className="user-chip" role={user.rol === "jefe_zonal" ? "button" : undefined} tabIndex={user.rol === "jefe_zonal" ? 0 : undefined} aria-expanded={user.rol === "jefe_zonal" ? userMenuOpen : undefined} aria-label={user.rol === "jefe_zonal" ? "Abrir menú de usuario" : undefined} onClick={() => { if (user.rol === "jefe_zonal") setUserMenuOpen(value => !value); }} onKeyDown={event => { if (user.rol === "jefe_zonal" && ["Enter", " "].includes(event.key)) { event.preventDefault(); setUserMenuOpen(value => !value); } if (event.key === "Escape") setUserMenuOpen(false); }}>
            <span>{(user.nombres || user.usuario || "U").charAt(0).toUpperCase()}</span>
            <div><strong>{user.nombres} {user.apellidos}</strong><small>{roleLabels[user.rol] || user.rol}</small></div>
          </div>
          <button className="logout-button" onClick={onLogout} title="Cerrar sesión"><LogOut size={18} /><span>Salir</span></button>
        </div>
      </aside>
      <main className="workspace">
        <div className="mobile-topbar">
          <button onClick={() => setMobileOpen(true)}><Menu /></button>
          <span className="brand__mark brand__mark--small">A</span>
          <strong>Asiste</strong>
        </div>
        <button className="compact-toggle" onClick={() => setCompact(!compact)} title="Contraer menú"><PanelLeftClose size={18} /></button>
        <div className="workspace__content">
          {isMarketing && <div className="marketing-theme-toolbar">
            <button type="button" className="button button--ghost marketing-theme-toggle" onClick={toggleMarketingTheme} aria-label={`Cambiar a modo ${marketingTheme === "light" ? "oscuro" : "claro"}`}>
              {marketingTheme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              Modo {marketingTheme === "light" ? "oscuro" : "claro"}
            </button>
          </div>}
          {children}
        </div>
      </main>
    </div>
  );
}
