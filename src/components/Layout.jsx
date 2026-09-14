import {
  BarChart3, Bell, Building2, CalendarCheck2, FileSpreadsheet, GraduationCap,
  FileSearch, FileText, LogOut, Menu, PanelLeftClose, ShieldAlert, TrafficCone, UserCircle2, Users, X,
} from "lucide-react";
import { useEffect, useState } from "react";

const navByRole = {
  gerente: [
    { id: "dashboard", label: "Resumen", icon: BarChart3 },
    { id: "tiendas", label: "Tiendas", icon: Building2 },
    { id: "usuarios", label: "Zonales y Coaches", icon: Users },
    { id: "documentos", label: "Reportes", icon: FileSpreadsheet },
    { id: "cursos", label: "Capacitaciones", icon: GraduationCap },
    { id: "errores-amonestaciones", label: "Errores y amonestaciones", icon: ShieldAlert },
  ],
  jefe_tienda: [
    { id: "dashboard", label: "Resumen", icon: BarChart3 },
    { id: "asistencias", label: "Asistencias", icon: CalendarCheck2 },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "usuarios", label: "Mi equipo", icon: Users },
    { id: "profile", label: "Mi perfil", icon: UserCircle2 },
  ],
  empleado: [
    { id: "mi-asistencia", label: "Mi asistencia", icon: CalendarCheck2 },
    { id: "mis-capacitaciones", label: "Mis capacitaciones", icon: GraduationCap },
    { id: "profile", label: "Mi perfil", icon: UserCircle2 },
  ],
  seguridad: [
    { id: "incidentes", label: "Incidencias", icon: ShieldAlert },
    { id: "trafico", label: "Tráfico", icon: TrafficCone },
    { id: "profile", label: "Mi perfil", icon: UserCircle2 },
  ],
  coach: [
    { id: "cursos", label: "Capacitaciones", icon: GraduationCap },
    { id: "capacitaciones", label: "Seguimiento", icon: Users },
    { id: "profile", label: "Mi perfil", icon: UserCircle2 },
  ],
  jefe_zonal: [
    { id: "dashboard", label: "Resumen", icon: BarChart3 },
    { id: "usuarios", label: "Personal", icon: Users },
    { id: "cursos", label: "Capacitaciones", icon: GraduationCap },
    { id: "capacitaciones", label: "Seguimiento", icon: CalendarCheck2 },
    { id: "errores-amonestaciones", label: "Errores y amonestaciones", icon: ShieldAlert },
    { id: "documentos", label: "Reporte", icon: FileSpreadsheet },
  ],
};
const roleLabels = { gerente: "Gerente comercial", jefe_zonal: "Jefe zonal", administrador_tienda: "Administrador de tienda", empleado: "Empleado", vendedor: "Vendedor", seguridad: "Seguridad", coach: "Coach" };

export default function Layout({ user, page, onNavigate, onLogout, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const items = [
    ...(navByRole[user.rol_db] || navByRole[user.rol] || []),
    ...(user.rol_db === "gerente" ? [{ id: "notificaciones-asistencia", label: "Notificaciones", icon: Bell }] : []),
    ...(user.rol_db === "administrador_tienda"
      ? [
        { id: "errores-amonestaciones", label: "Amonestaciones", icon: ShieldAlert },
        { id: "consultas", label: "Consultas", icon: FileSearch },
        { id: "documentos-legales", label: "Documentos legales", icon: FileText },
      ]
      : []),
  ];
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
            <div><strong>{user.nombres} {user.apellidos}</strong><small>{roleLabels[user.rol_db || user.rol] || user.rol_db || user.rol}</small></div>
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
