// Catálogo único de roles operativos. Los alias solo sirven para leer datos
// históricos; los formularios y nuevas altas deben guardar el código canónico.
export const OPERATIONAL_ROLE_LABELS = {
  gerencia_general: "Gerencia general",
  gerente_comercial: "Gerente comercial",
  administrador_seguridad: "Administrador de seguridad",
  sistemas: "Sistemas",
  asistente_comercial: "Asistente comercial",
  marketing: "Marketing",
  coach: "Coach",
  jefe_zonal: "Jefe zonal",
  jefe_tienda: "Administrador de tienda",
  asistente_tienda: "Asistente de tienda",
  jefe_seguridad: "Jefe de seguridad",
  jefe_area: "Jefe de área",
  seguridad: "Seguridad",
  caja: "Caja",
  almacenero: "Almacenero",
  vendedor: "Vendedor",
  asistente: "Asistente",
  trabajador: "Trabajador",
};

export const OPERATIONAL_ROLES = Object.freeze(Object.keys(OPERATIONAL_ROLE_LABELS));
export const ROLE_ALIASES = Object.freeze({
  admin: "gerencia_general",
  gerente: "gerente_comercial",
  jefe_comercial: "gerente_comercial",
  administrador_tienda: "jefe_tienda",
  zonal: "jefe_zonal",
});

export function normalizeOperationalRole(value) {
  const key = String(value || "").trim().toLowerCase().replaceAll(" ", "_");
  return ROLE_ALIASES[key] || key;
}

export const DASHBOARD_ROLE_ALIASES = Object.freeze({
  jefe_comercial: "gerente_comercial",
  administrador_tienda: "jefe_tienda",
  zonal: "jefe_zonal",
});

export function normalizeDashboardRole(value) {
  const key = String(value || "").trim().toLowerCase();
  return DASHBOARD_ROLE_ALIASES[key] || key;
}
