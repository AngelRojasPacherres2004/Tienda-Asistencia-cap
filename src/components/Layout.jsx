import { canAccessSection, sectionsForRole } from '../../shared/section-catalog.js';
import {
  AlertTriangle, BarChart3, Building2, CalendarCheck2, ClipboardCheck, GraduationCap,
  FileSpreadsheet, History, KeyRound, LogOut, Menu, MessageSquareText, Moon, PanelLeftClose, Settings, ShieldCheck, Sun, Target, Truck, UserCircle2, Users, X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { storeAlias } from '../lib/storeAliases';
import "../role-themes.css";
import "../marketing-light.css";
import "../dashboard-light.css";
import "../theme-consistency.css";
import "../store-support.css";
import { isOperationalDemo } from "../lib/operationalDemo";
import StoreMailbox from "./StoreMailbox";

const sectionIcons = { AlertTriangle, BarChart3, Building2, CalendarCheck2, ClipboardCheck, GraduationCap,
  FileSpreadsheet, History, KeyRound, ShieldCheck, Target, Truck, UserCircle2, Users };
const roleLabels = {
  gerencia_general: "Gerencia general", gerente_comercial: "Gerente comercial", administrador_seguridad: "Administrador de seguridad", sistemas: "Sistemas", asistente_comercial: "Asistente comercial", marketing: "Marketing", coach: "Coach",
  jefe_zonal: "Jefe zonal", jefe_tienda: "Administrador de tienda", asistente_tienda: "Asistente de tienda",
  trabajador: "Trabajador", vendedor: "Vendedor", asistente: "Asistente", caja: "Caja", almacenero: "Almacenero", jefe_area: "Jefe de área", seguridad: "Seguridad", jefe_seguridad: "Jefe de seguridad",
};

const compactRoleLabels = {
  gerencia_general: "Ger. general", gerente_comercial: "Ger. comercial", administrador_seguridad: "Ad. seguridad",
  sistemas: "Sistemas", asistente_comercial: "Asistente comercial", marketing: "Marketing", coach: "Coach", jefe_zonal: "Jef. zonal",
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
  const [mailboxOpen, setMailboxOpen] = useState(false);
  const [mailboxPending, setMailboxPending] = useState(0);
  const canUseMailbox = !Array.isArray(user.secciones_permitidas) && !user.acceso_solo_resumen_comercial && ["jefe_zonal", "jefe_tienda"].includes(user.rol);
  const hidePersonInitials = ["jefe_zonal", "seguridad", "jefe_seguridad", "administrador_seguridad"].includes(user.rol);
  const isStoreSecurity = ["seguridad", "jefe_seguridad"].includes(user.rol);
  const isDashboard = ["dashboard", "mi-tienda", "asiste-operativo"].includes(page);
  const isCommercial = ["gerencia_general", "gerente_comercial", "jefe_zonal", "jefe_tienda", "asistente_tienda", "coach"].includes(user.rol);
  const isCommercialDashboard = page === "dashboard" && ["gerencia_general", "gerente_comercial", "coach", "jefe_zonal", "jefe_tienda", "asistente_tienda"].includes(user.rol);
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
  const canOpenSettings = canAccessSection(user, "ajustes-zonal");
  const items = sectionsForRole(user.rol).filter(item => !item.hidden && canAccessSection(user, item.id));
  const navigationItems = [...items];
  if (canUseMailbox) navigationItems.splice(Math.ceil(items.length / 2), 0, { id: "bandeja", label: "Bandeja de mensajes", icon: "MessageSquareText" });
  const activeStore = user.tiendas_disponibles?.find(store => Number(store.id) === Number(user.tienda_id));
  const storeName = activeStore?.nombre || user.tienda_nombre;
  const activeAlias = activeStore?.alias || user.tienda_alias || storeAlias(storeName);
  useEffect(() => { setMobileOpen(false); setUserMenuOpen(false); }, [page]);

  return (
    <div className={`app-shell app-theme ${["gerencia_general", "gerente_comercial", "jefe_tienda", "asistente_tienda"].includes(user.rol) ? "store-navigation-readable" : ""} ${hidePersonInitials ? "without-person-initials" : ""} app-${marketingTheme} marketing-theme marketing-${marketingTheme} ${compact ? "app-shell--compact" : ""} ${isCommercialDashboard ? "app-shell--commercial-dashboard" : ""}`}>
      {mobileOpen && <button className="sidebar-overlay" onClick={() => setMobileOpen(false)} aria-label="Cerrar menú" />}
      <aside className={`sidebar sidebar--readable ${mobileOpen ? "sidebar--open" : ""}`}>
        <div className="brand">
          <button className="sidebar-mobile-close" onClick={() => setMobileOpen(false)}><X size={20} /></button>
        </div>
        <nav>
          {navigationItems.map(({ id, label, icon }) => { const Icon = icon === "MessageSquareText" ? MessageSquareText : sectionIcons[icon] || BarChart3; return (
            <button key={id} className={(id === "bandeja" ? mailboxOpen : !mailboxOpen && page === id) ? "active" : ""} onClick={() => { setMailboxOpen(id === "bandeja"); setMobileOpen(false); if (id !== "bandeja") onNavigate(id); }} title={label}>
              <Icon size={19} /><span>{label}</span>
              {id === "bandeja" && mailboxPending > 0 && <b className="sidebar-mailbox-count">{mailboxPending}</b>}
            </button>
          ); })}
        </nav>
        <div className="sidebar__footer">
          {canOpenSettings && userMenuOpen && <button className="logout-button" onClick={() => { setUserMenuOpen(false); onNavigate("ajustes-zonal"); }}><Settings size={18} /><span>Ajustes</span></button>}
          <div className={`user-chip ${isStoreSecurity ? "user-chip--security" : ""}`} role={canOpenSettings ? "button" : undefined} tabIndex={canOpenSettings ? 0 : undefined} aria-expanded={canOpenSettings ? userMenuOpen : undefined} aria-label={canOpenSettings ? "Abrir menú de usuario" : undefined} onClick={() => { if (canOpenSettings) setUserMenuOpen(value => !value); }} onKeyDown={event => { if (canOpenSettings && ["Enter", " "].includes(event.key)) { event.preventDefault(); setUserMenuOpen(value => !value); } if (event.key === "Escape") setUserMenuOpen(false); }}>
            {!['jefe_tienda', 'asistente_tienda'].includes(user.rol) && !hidePersonInitials && <span>{(user.nombres || user.usuario || "U").charAt(0).toUpperCase()}</span>}
            <div title={`${user.nombres || ""} ${user.apellidos || ""}`.trim()}><strong>{conciseUserName(user)}</strong><small>{['jefe_tienda', 'asistente_tienda'].includes(user.rol) || isStoreSecurity ? roleLabels[user.rol] : compactRoleLabels[user.rol] || roleLabels[user.rol] || user.rol}{!['jefe_tienda', 'asistente_tienda'].includes(user.rol) && user.dni ? ` · DNI ${user.dni}` : ""}</small>{isStoreSecurity && <small className="user-chip__store">Tienda: {storeName || "Sin tienda asignada"}</small>}{['jefe_tienda', 'asistente_tienda'].includes(user.rol) && storeName && <small title={[storeName, activeAlias].filter(Boolean).join(' · ')}>{storeName}{activeAlias && activeAlias !== storeName ? ` · ${activeAlias}` : ''}</small>}</div>
          </div>
          <button className="logout-button" onClick={onLogout} title="Cerrar sesión"><LogOut size={18} /><span>Salir</span></button>
        </div>
      </aside>
      <button type="button" className="compact-toggle" onClick={() => setCompact(!compact)} title={compact ? "Expandir menú" : "Contraer menú"} aria-label={compact ? "Expandir menú" : "Contraer menú"} aria-expanded={!compact}><PanelLeftClose size={18} /></button>
      <main className={`workspace ${isCommercial ? "commercial-role" : ""} ${isDashboard && !isCommercialDashboard ? "app-light marketing-light dashboard-light" : ""}`}>
        <div className="mobile-topbar">
          <button onClick={() => setMobileOpen(true)} aria-label="Abrir menú"><Menu /></button>
          <strong>Menú</strong>
        </div>
        <div className={`workspace__content ${isCommercialDashboard ? "workspace__content--commercial" : ""}`}>
          {page !== "dashboard" && page !== "transferencia" && user.rol === "jefe_tienda" && user.tiendas_disponibles?.length > 1 && <div className="store-context-toolbar">
            <label><Building2 size={17} />Tienda activa<select aria-label="Cambiar tienda activa" value={String(user.tienda_id || "")} disabled={switchingStore} onChange={event => onStoreChange(event.target.value)}>{user.tiendas_disponibles.map(store => <option key={store.id} value={String(store.id)}>{store.nombre}{store.principal ? " · Principal" : " · Apoyo"}</option>)}</select></label>
            <span className="store-context-label">{user.tienda_id === user.tienda_principal_id ? "Tienda principal" : "Acceso de apoyo habilitado"}</span>
          </div>}
          {page === "asiste-operativo" && isOperationalDemo() && <div className="operational-demo-banner" role="status"><strong>VISTA DEMO LOCAL</strong><span>Tráfico y comparativo zonal simulados. No se guardan en bd-app ni alteran los KPI reales.</span><a href={window.location.pathname}>Ver datos reales</a></div>}
          {!isDashboard && !(page === "transferencia" && ["jefe_tienda", "asistente_tienda", "gerente_comercial"].includes(user.rol)) && <div className="marketing-theme-toolbar">
            <button type="button" className="button button--ghost marketing-theme-toggle" onClick={toggleMarketingTheme} aria-label={`Cambiar a modo ${marketingTheme === "light" ? "oscuro" : "claro"}`}>
              {marketingTheme === "light" ? <Moon size={16} /> : <Sun size={16} />}
              Modo {marketingTheme === "light" ? "oscuro" : "claro"}
            </button>
          </div>}
          {(!mailboxOpen || !canUseMailbox) && children}
          {canUseMailbox && <StoreMailbox key={`${user.id}:${user.tienda_id || ""}`} user={user} embedded isOpen={mailboxOpen} onClose={() => setMailboxOpen(false)} onOpen={() => { setMailboxOpen(true); setMobileOpen(false); }} onPendingChange={setMailboxPending} />}
        </div>
      </main>
    </div>
  );
}
