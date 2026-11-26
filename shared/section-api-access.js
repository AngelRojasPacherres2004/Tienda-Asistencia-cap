import { allowedSections } from './section-catalog.js';
import { allowsSummaryRequest, isCommercialSummaryOnly } from './commercial-summary-only.js';

// These are additional limits, never substitutes for the router's role/store checks.
export function allowsSectionRequest(user, method, path) {
  if (isCommercialSummaryOnly(user)) return allowsSummaryRequest(user, method, path);
  if (!Array.isArray(user?.secciones_permitidas)) return true;
  const sections = new Set(allowedSections(user));
  const has = (...ids) => ids.some(id => sections.has(id));
  const get = method === 'GET';
  if (has('dashboard') && allowsSummaryRequest({ ...user, secciones_permitidas: ['dashboard'], acceso_solo_resumen_comercial: true }, method, path)) return true;
  if (path.startsWith('/systems/credential-permissions') || path.startsWith('/systems/module-permissions')) return has('sistemas-credenciales');
  if (path.startsWith('/systems/maintenance/')) return has('sistemas-registros');
  if (path.startsWith('/systems/batches') || path.startsWith('/systems/uploads')) return has('sistemas');
  if (path.startsWith('/marketing')) {
    if (get && path === '/marketing') return [...sections].some(id => id.startsWith('marketing-'));
    if (path === '/marketing/facebook-insights') return get && has('marketing-seguidores');
    const module = path.split('/')[2];
    const ids = {staff:'marketing-personal',attendance:'marketing-asistencia',validations:'marketing-validacion',trainings:'marketing-capacitaciones',warnings:'marketing-incidencias',errors:'marketing-incidencias',incidents:'marketing-incidencias',campaigns:'marketing-campanas',deliverables:'marketing-campanas',followers:'marketing-seguidores'};
    return has(ids[module]);
  }
  if (path.startsWith('/commercial/transfer-groups')) return has('transferencia');
  if (path.startsWith('/commercial-goals')) return has('metas-comerciales');
  if (path.startsWith('/commercial/annual-reports') || path.startsWith('/commercial/normalized-reports')) return has('reportes');
  if (path.startsWith('/commercial/') || path.startsWith('/assistant/')) return has('transferencia') && allowsSummaryRequest({...user,secciones_permitidas:['dashboard'],acceso_solo_resumen_comercial:true},method,path);
  if (path === '/perfil') return get && has('profile','mi-asistencia','mi-tienda','mi-tienda-gestion','asiste-operativo');
  if (path.startsWith('/mis-asistencias')) return get && has('mi-asistencia');
  if (path.startsWith('/mis-capacitaciones')) return get && has('mis-capacitaciones');
  if (path.startsWith('/usuarios') || path.startsWith('/personas/directorio')) return has('usuarios','zonal-personal') || get && has('tiendas','capacitaciones','cursos','asistencias','reportes');
  if (path.startsWith('/tiendas')) return has('tiendas') || get && has('capacitaciones','cursos','asistencias','reportes','zonal-supervisiones','ajustes-zonal','gestion');
  if (path.startsWith('/clusters')) return has('clusters') || get && has('tiendas','usuarios','capacitaciones','reportes','ajustes-zonal');
  if (path.startsWith('/cursos') || path.startsWith('/encargados')) return has('cursos') || get && has('capacitaciones','mis-capacitaciones');
  if (path.startsWith('/capacitaciones')) return has('capacitaciones') || get && has('mis-capacitaciones','cursos');
  if (path.startsWith('/asistencias')) return has('asistencias','zonal-asistencia') || get && has('reportes');
  if (path.startsWith('/reportes')) return has('reportes');
  if (path.startsWith('/movimientos')) return get && has('historial');
  if (path.startsWith('/zonal/apoyos-tienda')) return has('ajustes-zonal');
  if (path.startsWith('/zonal/cluster')) return get && has('tiendas','zonal-personal','zonal-supervisiones');
  if (path.startsWith('/zonal/reportes-asistencia')) return has('reportes','zonal-asistencia','ajustes-zonal');
  if (/^\/zonal\/(supervisiones|requerimientos|observaciones)/.test(path)) return has('zonal-supervisiones');
  if (path.startsWith('/zonal/incidencias')) return has('zonal-incidencias');
  if (/^\/zonal\/(personal|administradores)/.test(path)) return has('zonal-personal');
  if (/^\/zonal\/(asistencia|tareas)/.test(path)) return has('zonal-asistencia');
  if (path === '/zonal/comparativa') return get && has('dashboard','asiste-operativo');
  if (path.startsWith('/gerencia/comparativa')) return has('ajustes-zonal','gestion');
  if (path.startsWith('/trafico')) return has('seguridad-trafico','gestion');
  if (path.startsWith('/seguridad-central')) return has('seguridad-central');
  if (/^\/(incidencias|marcas|productos\/catalogo)/.test(path)) return has('seguridad-incidencias','gestion');
  if (path.startsWith('/mi-tienda-gestion')) return has('mi-tienda-gestion');
  if (/^\/(documentos|amonestaciones|errores-personal|coberturas)/.test(path)) return has('documentos','gestion','mi-tienda-gestion');
  if (path.startsWith('/operaciones') || path === '/dashboard' || path.startsWith('/gerencia/alertas') || path.startsWith('/personal/resumen')) return get && has('asiste-operativo','mi-tienda','gestion');
  return false;
}
