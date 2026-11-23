import { sectionsForRole } from '../../shared/section-catalog.js';
import { canLimitToCommercialSummary } from '../../shared/commercial-summary-only.js';

export function createModulePermissionsDomain({ supabase, bodyOf, httpError, dbError, disabledPassword }) {
  async function setModulePermission(event, user, targetId) {
    if (user.rol !== 'sistemas') throw httpError('Solo Sistemas puede administrar el acceso a secciones.', 403);
    const { data: actor, error: actorError } = await supabase.from('usuarios')
      .select('rol,estado').eq('id', user.id).maybeSingle();
    if (actorError) throw dbError(actorError);
    if (actor?.rol !== 'sistemas' || actor.estado !== 'activo')
      throw httpError('Tu cuenta ya no tiene permiso de Sistemas.', 403);
    const id = Number(targetId);
    const body = bodyOf(event);
    const hasSections = Object.hasOwn(body, 'sections');
    if (!Number.isSafeInteger(id) || id < 1 || (!hasSections && typeof body.summaryOnly !== 'boolean')
      || (hasSections && Object.hasOwn(body, 'summaryOnly')))
      throw httpError('Indica una cuenta y un permiso válidos.', 400);
    const { data: target, error: targetError } = await supabase.from('usuarios')
      .select('id,rol,estado,usuario,password').eq('id', id).maybeSingle();
    if (targetError) throw dbError(targetError);
    if (!target || target.estado !== 'activo' || !target.usuario || !target.password || target.password === disabledPassword)
      throw httpError('La cuenta no tiene acceso activo al sistema.', 400);
    if (!hasSections && body.summaryOnly && !canLimitToCommercialSummary(target))
      throw httpError('Este rol no dispone de Resumen comercial.', 400);
    let sections = hasSections ? body.sections : body.summaryOnly ? ['dashboard'] : null;
    const eligible = sectionsForRole(target.rol).map(section => section.id);
    if (sections !== null) {
      if (!Array.isArray(sections) || !sections.length || sections.length > 64
        || sections.some(section => typeof section !== 'string' || !eligible.includes(section)))
        throw httpError('Selecciona al menos una sección válida para el rol de la cuenta.', 400);
      sections = [...new Set(sections)];
      if (target.rol === 'sistemas' && !sections.includes('sistemas-credenciales'))
        throw httpError('Sistemas debe conservar Acceso y credenciales para administrar los permisos.', 400);
    }
    const summaryOnly = canLimitToCommercialSummary(target) && sections?.length === 1 && sections[0] === 'dashboard';
    const { data, error } = await supabase.from('usuarios')
      .update({ acceso_solo_resumen_comercial: Boolean(summaryOnly), secciones_permitidas: sections })
      .eq('id', id).eq('rol', target.rol).eq('estado', 'activo')
      .select('id,usuario,acceso_solo_resumen_comercial,secciones_permitidas').maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw httpError('La cuenta cambió mientras se guardaba. Actualiza la lista.', 409);
    return { account: data };
  }
  return { setModulePermission };
}
