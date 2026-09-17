import {
  AlertTriangle, BarChart3, Building2, CalendarCheck2, FileClock, GraduationCap,
  LogOut, Menu, PanelLeftClose, ShieldCheck, UserCircle2, Users, X,
} from "lucide-react";
import { useEffect, useState } from "react";

const navByRole = {
  gerencia_general: [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "usuarios", label: "Usuarios", icon: Users },
    { id: "clusters", label: "Clústeres", icon: Building2 },
    { id: "tiendas", label: "Tiendas", icon: Building2 },
    { id: "gestion", label: "Gestión operativa", icon: AlertTriangle },
  ],
  gerente_comercial: [
    { id: "dashboard", label: "Resumen comercial", icon: BarChart3 },
    { id: "usuarios", label: "Equipo de gestión", icon: Users },
    { id: "clusters", label: "Clústeres", icon: Building2 },
    { id: "tiendas", label: "Tiendas", icon: Building2 },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "gestion", label: "Gestión operativa", icon: AlertTriangle },
  ],
  coach: [
    { id: "dashboard", label: "Resumen", icon: BarChart3 },
    { id: "tiendas", label: "Tiendas", icon: Building2 },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "gestion", label: "Seguimiento", icon: AlertTriangle },
  ],
  jefe_zonal: [
    { id: "dashboard", label: "Resumen zonal", icon: BarChart3 },
    { id: "usuarios", label: "Administradores", icon: Users },
    { id: "tiendas", label: "Tiendas asignadas", icon: Building2 },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "gestion", label: "Gestión operativa", icon: AlertTriangle },
  ],
  jefe_tienda: [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "usuarios", label: "Personal", icon: Users },
    { id: "asistencias", label: "Asistencias", icon: CalendarCheck2 },
    { id: "gestion", label: "Controles", icon: FileClock },
    { id: "incidencias-tienda", label: "Incidencias", icon: AlertTriangle },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
  ],
  asistente_tienda: [
    { id: "dashboard", label: "Inicio", icon: BarChart3 },
    { id: "usuarios", label: "Personal", icon: Users },
    { id: "asistencias", label: "Asistencias", icon: CalendarCheck2 },
    { id: "gestion", label: "Controles", icon: FileClock },
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
const roleLabels = {
  gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", coach: "Coach",
  jefe_zonal: "Jefe zonal", jefe_tienda: "Administrador de tienda", asistente_tienda: "Asistente de tienda",
  trabajador: "Trabajador", seguridad: "Seguridad",
};

export default function Layout({ user, page, onNavigate, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const items = navByRole[user.rol] || [];
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
          <span className="nav-label">Espacio de trabajo</span>
          {items.map(({ id, label, icon: Icon }) => (
            <button key={id} className={page === id ? "active" : ""} onClick={() => onNavigate(id)} title={label}>
              <Icon size={19} /><span>{label}</span>
            </button>
          ))}
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
