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
    const { summaryOnly } = bodyOf(event);
    if (!Number.isSafeInteger(id) || id < 1 || typeof summaryOnly !== 'boolean')
      throw httpError('Indica una cuenta y un permiso válidos.', 400);
    const { data: target, error: targetError } = await supabase.from('usuarios')
      .select('id,rol,estado,usuario,password').eq('id', id).maybeSingle();
    if (targetError) throw dbError(targetError);
    if (!target || target.estado !== 'activo' || !target.usuario || !target.password || target.password === disabledPassword)
      throw httpError('La cuenta no tiene acceso activo al sistema.', 400);
    if (summaryOnly && !canLimitToCommercialSummary(target))
      throw httpError('Este rol no dispone de Resumen comercial.', 400);
    const { data, error } = await supabase.from('usuarios')
      .update({ acceso_solo_resumen_comercial: summaryOnly })
      .eq('id', id).eq('rol', target.rol).eq('estado', 'activo')
      .select('id,usuario,acceso_solo_resumen_comercial').maybeSingle();
    if (error) throw dbError(error);
    if (!data) throw httpError('La cuenta cambió mientras se guardaba. Actualiza la lista.', 409);
    return { account: data };
  }
  return { setModulePermission };
}
