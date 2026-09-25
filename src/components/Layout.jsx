import {
  AlertTriangle, BarChart3, Building2, CalendarCheck2, ClipboardCheck, GraduationCap,
  FileSpreadsheet, History, LogOut, Menu, PanelLeftClose, ShieldCheck, UserCircle2, Users, X,
} from "lucide-react";
import { useEffect, useState } from "react";

const navByRole = {
  gerencia_general: [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "usuarios", label: "Usuarios", icon: Users },
    { id: "clusters", label: "Clústeres", icon: Building2 },
    { id: "tiendas", label: "Tiendas", icon: Building2 },
    { id: "zonal-supervisiones", label: "Supervisiones", icon: ClipboardCheck },
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
  coach: [
    { id: "cursos", label: "Crear capacitaciones", icon: GraduationCap },
    { id: "capacitaciones", label: "Asignar y seguimiento", icon: BarChart3 },
  ],
  jefe_zonal: [
    { id: "dashboard", label: "Resumen zonal", icon: BarChart3, group: "Inicio" },
    { id: "tiendas", label: "Mis tiendas", icon: Building2, group: "Operación zonal" },
    { id: "zonal-asistencia", label: "Asistencia", icon: CalendarCheck2, group: "Operación zonal" },
    { id: "zonal-tareas", label: "Cronogramas y tareas", icon: ClipboardCheck, group: "Operación zonal" },
    { id: "zonal-supervisiones", label: "Supervisiones", icon: ClipboardCheck, group: "Operación zonal" },
    { id: "zonal-incidencias", label: "Incidencias", icon: AlertTriangle, group: "Operación zonal" },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap, group: "Consulta y exportación" },
    { id: "reportes", label: "Reportes", icon: FileSpreadsheet, group: "Consulta y exportación" },
    { id: "historial", label: "Historial", icon: History, group: "Consulta y exportación" },
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
  gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", coach: "Coach",
  jefe_zonal: "Jefe zonal", jefe_tienda: "Jefe de tienda", asistente_tienda: "Asistente de tienda",
  trabajador: "Trabajador", vendedor: "Vendedor", asistente: "Asistente", caja: "Caja", almacenero: "Almacenero", jefe_area: "Jefe de área", seguridad: "Seguridad", jefe_seguridad: "Jefe de seguridad",
};

export default function Layout({ user, page, onNavigate, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const items = navByRole[user.rol] || [];
  const groupedItems = items.reduce((groups, item) => {
    const key = item.group || "Espacio de trabajo";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
    return groups;
  }, new Map());
  useEffect(() => setMobileOpen(false), [page]);

  return (
    <div className={`app-shell ${compact ? "app-shell--compact" : ""}`}>
      {mobileOpen && <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`sidebar ${mobileOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <span className="brand__mark">A</span>
          <div><strong>Asiste</strong><small>Tiendas &amp; equipos</small></div>
          <button className="sidebar-mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <nav>
          {[...groupedItems.entries()].map(([group, groupItems]) => <div className="nav-group" key={group}>
            <span className="nav-label">{group}</span>
            {groupItems.map(({ id, label, icon: Icon }) => (
              <button key={id} className={page === id ? "active" : ""} onClick={() => onNavigate(id)} title={label}>
                <Icon size={19} /><span>{label}</span>
              </button>
            ))}
          </div>)}
        </nav>
        <div className="sidebar__footer">
          <div className="user-chip">
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
        <div className="workspace__content">{children}</div>
      </main>
    </div>
  );
}
