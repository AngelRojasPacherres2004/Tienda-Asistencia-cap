const summaryRoles = new Set(['gerente_comercial', 'jefe_zonal', 'jefe_tienda', 'asistente_tienda', 'coach']);

export function canLimitToCommercialSummary(user) {
  return summaryRoles.has(user?.rol);
}

export function isCommercialSummaryOnly(user) {
  return user?.acceso_solo_resumen_comercial === true;
}

const dashboardReads = new Set([
  '/commercial/access', '/commercial/manifest', '/commercial/operational-summary',
  '/commercial/traffic-summary', '/commercial/store-goals', '/commercial/company-ranking',
  '/commercial/store-transfers', '/commercial/transfer-groups',
  '/dashboard', '/tiendas', '/clusters', '/gerencia/alertas', '/personal/resumen',
  '/trafico/matriz', '/asistencias/historial', '/zonal/cluster',
  '/perfil', '/operaciones/resumen', '/documentos-alertas',
  '/operaciones/pronostico-ventas', '/cursos', '/capacitaciones/trabajadores',
]);
const dashboardQueries = new Set([
  '/commercial/product-codes', '/commercial/stock-insights',
  '/assistant/chat', '/assistant/transcribe',
]);

export function allowsSummaryRequest(user, method, path) {
  if (!isCommercialSummaryOnly(user)) return true;
  return (method === 'GET' && (dashboardReads.has(path)
    || /^\/commercial\/files\/dashboard(?:-[a-z0-9-]+)?\.json$/.test(path)))
    || (method === 'POST' && dashboardQueries.has(path));
}
