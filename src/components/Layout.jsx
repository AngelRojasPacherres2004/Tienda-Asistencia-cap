import {
  AlertTriangle, BarChart3, Building2, CalendarCheck2, ClipboardCheck, GraduationCap,
  FileSpreadsheet, History, KeyRound, LogOut, Menu, Moon, PanelLeftClose, Settings, ShieldCheck, Sun, Target, UserCircle2, Users, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import "../role-themes.css";
import "../marketing-light.css";
import "../dashboard-light.css";
import "../theme-consistency.css";
import "../store-support.css";
import { isOperationalDemo } from "../lib/operationalDemo";
import StoreMailbox from "./StoreMailbox";

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
    { id: "dashboard", label: "Resumen comercial", icon: BarChart3 },
    { id: "asiste-operativo", label: "Resumen", icon: ClipboardCheck },
    { id: "metas-comerciales", label: "Metas comerciales", icon: Target },
    { id: "tiendas", label: "Tiendas y clústeres", icon: Building2 },
    { id: "usuarios", label: "Personal", icon: Users },
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
    { id: "dashboard", label: "Resumen comercial", icon: BarChart3 },
    { id: "cursos", label: "Crear capacitaciones", icon: GraduationCap },
    { id: "capacitaciones", label: "Asignar y seguimiento", icon: BarChart3 },
    { id: "reportes", label: "Reportes de ventas", icon: FileSpreadsheet },
  ],
  jefe_zonal: [
    { id: "dashboard", label: "Resumen comercial", icon: BarChart3 },
    { id: "asiste-operativo", label: "Resumen", icon: ClipboardCheck },
    { id: "tiendas", label: "Mis tiendas", icon: Building2 },
    { id: "zonal-personal", label: "Mis equipos", icon: Users },
    { id: "zonal-supervisiones", label: "Auditorías", icon: ClipboardCheck },
    { id: "zonal-incidencias", label: "Incidencias", icon: AlertTriangle },
    { id: "capacitaciones", label: "Capacitaciones", icon: GraduationCap },
    { id: "reportes", label: "Reportes", icon: FileSpreadsheet },
    { id: "historial", label: "Historial", icon: History },
  ],
  jefe_tienda: [
    { id: "dashboard", label: "Resumen comercial", icon: BarChart3 },
    { id: "asiste-operativo", label: "Resumen", icon: ClipboardCheck },
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
  administrador_seguridad: [
    { id: "seguridad-central", label: "Control de seguridad", icon: ShieldCheck },
  ],
  sistemas: [
    { id: "sistemas", label: "Carga de datos", icon: FileSpreadsheet },
    { id: "sistemas-credenciales", label: "Acceso y credenciales", icon: KeyRound },
  ],
};
navByRole.jefe_seguridad = navByRole.seguridad;
navByRole.vendedor = navByRole.trabajador;
navByRole.asistente = navByRole.trabajador;
navByRole.caja = navByRole.trabajador;
navByRole.almacenero = navByRole.trabajador;
navByRole.jefe_area = navByRole.trabajador;
const roleLabels = {
  gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", administrador_seguridad: "Administrador de seguridad", sistemas: "Sistemas", marketing: "Marketing", coach: "Coach",
  jefe_zonal: "Jefe zonal", jefe_tienda: "Administrador de tienda", asistente_tienda: "Asistente de tienda",
  trabajador: "Trabajador", vendedor: "Vendedor", asistente: "Asistente", caja: "Caja", almacenero: "Almacenero", jefe_area: "Jefe de área", seguridad: "Seguridad", jefe_seguridad: "Jefe de seguridad",
};

const compactRoleLabels = {
  gerencia_general: "Ger. general", gerente_comercial: "Ger. comercial", administrador_seguridad: "Ad. seguridad",
  sistemas: "Sistemas", marketing: "Marketing", coach: "Coach", jefe_zonal: "Jef. zonal",
  jefe_tienda: "Ad. tienda", asistente_tienda: "Asist. tienda", trabajador: "Trabajador",
  vendedor: "Vendedor", asistente: "Asistente", caja: "Caja", almacenero: "Almacén",
  jefe_area: "Jef. área", seguridad: "Seguridad", jefe_seguridad: "Jef. seguridad",
};

const conciseUserName = (user) => {
  const names = String(user.nombres || "").trim().split(/\s+/).filter(Boolean);
  const surnames = String(user.apellidos || "").trim().split(/\s+/).filter(Boolean);
  return [names[0], surnames[0]].filter(Boolean).join(" ") || user.usuario || "Usuario";
};

export default function Layout({ user, page, onNavigate, onLogout, onStoreChange, switchingStore, children }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const isDashboard = ["dashboard", "mi-tienda", "asiste-operativo"].includes(page);
  const isCommercial = ["gerente_comercial", "jefe_zonal", "jefe_tienda", "coach"].includes(user.rol);
  const isCommercialDashboard = page === "dashboard" && ["gerente_comercial", "coach", "jefe_zonal", "jefe_tienda"].includes(user.rol);
  const [marketingTheme, setMarketingTheme] = useState(() => {
    try { return (localStorage.getItem("app-theme") || localStorage.getItem("marketing-theme")) === "dark" ? "dark" : "light"; }
    catch { return "light"; }
  });
  const setLightMode = value => {
    const light = typeof value === "function" ? value(marketingTheme === "light") : value;
    const next = light ? "light" : "dark";
    setMarketingTheme(next);
    try { localStorage.setItem("app-theme", next); } catch { /* Keep switching available when storage is disabled. */ }
  };
  const toggleMarketingTheme = () => setLightMode(marketingTheme !== "light");
  const items = navByRole[user.rol] || [];
  useEffect(() => { setMobileOpen(false); setUserMenuOpen(false); }, [page]);

  return (
    <div className={`app-shell app-theme app-${marketingTheme} marketing-theme marketing-${marketingTheme} ${compact ? "app-shell--compact" : ""} ${isCommercialDashboard ? "app-shell--commercial-dashboard" : ""}`}>
      {mobileOpen && <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`sidebar sidebar--readable ${mobileOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
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
          {["jefe_zonal", "gerencia_general", "gerente_comercial"].includes(user.rol) && userMenuOpen && <button className="logout-button" onClick={() => { setUserMenuOpen(false); onNavigate("ajustes-zonal"); }}><Settings size={18} /><span>Ajustes</span></button>}
          <div className="user-chip" role={["jefe_zonal", "gerencia_general", "gerente_comercial"].includes(user.rol) ? "button" : undefined} tabIndex={["jefe_zonal", "gerencia_general", "gerente_comercial"].includes(user.rol) ? 0 : undefined} aria-expanded={["jefe_zonal", "gerencia_general", "gerente_comercial"].includes(user.rol) ? userMenuOpen : undefined} aria-label={["jefe_zonal", "gerencia_general", "gerente_comercial"].includes(user.rol) ? "Abrir menú de usuario" : undefined} onClick={() => { if (["jefe_zonal", "gerencia_general", "gerente_comercial"].includes(user.rol)) setUserMenuOpen(value => !value); }} onKeyDown={event => { if (["jefe_zonal", "gerencia_general", "gerente_comercial"].includes(user.rol) && ["Enter", " "].includes(event.key)) { event.preventDefault(); setUserMenuOpen(value => !value); } if (event.key === "Escape") setUserMenuOpen(false); }}>
            <span>{(user.nombres || user.usuario || "U").charAt(0).toUpperCase()}</span>
            <div title={`${user.nombres || ""} ${user.apellidos || ""}`.trim()}><strong>{conciseUserName(user)}</strong><small>{compactRoleLabels[user.rol] || roleLabels[user.rol] || user.rol}{user.dni ? ` · DNI ${user.dni}` : ""}</small></div>
          </div>
          <button className="logout-button" onClick={onLogout} title="Cerrar sesión"><LogOut size={18} /><span>Salir</span></button>
        </div>
      </aside>
      <button type="button" className="compact-toggle" onClick={() => setCompact(!compact)} title={compact ? "Expandir menú" : "Contraer menú"} aria-label={compact ? "Expandir menú" : "Contraer menú"} aria-expanded={!compact}><PanelLeftClose size={18} /></button>
      <main className={`workspace ${isCommercial ? "commercial-role" : ""} ${isDashboard && !isCommercialDashboard ? "app-light marketing-light dashboard-light" : ""}`}>
        <div className="mobile-topbar">
          <button onClick={() => setMobileOpen(true)}><Menu /></button>
          <strong>Menú</strong>
        </div>
        <div className={`workspace__content ${isCommercialDashboard ? "workspace__content--commercial" : ""}`}>
          {page !== "dashboard" && user.rol === "jefe_tienda" && user.tiendas_disponibles?.length > 1 && <div className="store-context-toolbar">
            <label><Building2 size={17} />Tienda activa<select aria-label="Cambiar tienda activa" value={String(user.tienda_id || "")} disabled={switchingStore} onChange={event => onStoreChange(event.target.value)}>{user.tiendas_disponibles.map(store => <option key={store.id} value={String(store.id)}>{store.nombre}{store.principal ? " · Principal" : " · Apoyo"}</option>)}</select></label>
            <span className="store-context-label">{user.tienda_id === user.tienda_principal_id ? "Tienda principal" : "Acceso de apoyo habilitado"}</span>
          </div>}
          {page === "asiste-operativo" && isOperationalDemo() && <div className="operational-demo-banner" role="status"><strong>VISTA DEMO LOCAL</strong><span>Tráfico y comparativo zonal simulados. No se guardan en bd-app ni alteran los KPI reales.</span><a href={window.location.pathname}>Ver datos reales</a></div>}
          {!isDashboard && <div className="marketing-theme-toolbar">
            <button type="button" className="button button--ghost marketing-theme-toggle" onClick={toggleMarketingTheme} aria-label={`Cambiar a modo ${marketingTheme === "light" ? "oscuro" : "claro"}`}>
              {marketingTheme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              Modo {marketingTheme === "light" ? "oscuro" : "claro"}
            </button>
          </div>}
          {children}
        </div>
      </main>
      {["jefe_zonal", "jefe_tienda"].includes(user.rol) && <StoreMailbox user={user} hidden={isCommercialDashboard} />}
    </div>
  );
}
