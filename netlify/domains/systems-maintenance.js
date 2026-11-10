export function createSystemsMaintenanceDomain({ supabase, readAllResult, httpError, dbError, storeStaffRoles }) {
  async function authorize(actor) {
    if (actor.rol !== 'sistemas') throw httpError('Solo Sistemas puede gestionar estos registros.', 403);
    const { data, error } = await supabase.from('usuarios').select('id,rol,estado').eq('id', actor.id).maybeSingle();
    if (error) throw dbError(error);
    if (data?.rol !== 'sistemas' || data.estado !== 'activo') throw httpError('Tu cuenta ya no tiene acceso de Sistemas.', 403);
  }

  async function listPersonnel(actor) {
    await authorize(actor);
    const { data, error } = await readAllResult(supabase.from('usuarios')
      .select('id,nombres,apellidos,dni,rol,estado,suspendido_sistemas,tienda_id,tiendas!usuarios_tienda_id_fkey(nombre)')
      .in('rol', storeStaffRoles).order('id'));
    if (error) throw dbError(error);
    return { people: (data || []).map(({ tiendas, ...row }) => ({ ...row, tienda_nombre: tiendas?.nombre || 'Sin tienda' })) };
  }

  async function listTransfers(actor) {
    await authorize(actor);
    const { data: mappings, error: mappingError } = await readAllResult(supabase.from('commercial_store_map')
      .select('dashboard_store_id,tiendas(nombre)'), 'dashboard_store_id');
    if (mappingError) throw dbError(mappingError);
    const names = new Map((mappings || []).map(row => [row.dashboard_store_id, row.tiendas?.nombre]));
    const { data, error } = await readAllResult(supabase.from('commercial_transfer_items')
      .select('id,grupo_id,tienda_origen,tienda_destino,producto,codigo_producto,cantidad,estado,numero_guia,creado_en')
      .order('creado_en', { ascending: false }).order('id'));
    if (error) throw dbError(error);
    const groups = new Map();
    for (const row of data || []) {
      const group = groups.get(row.grupo_id) || { id: row.grupo_id, origin: names.get(row.tienda_origen) || row.tienda_origen,
        destination: names.get(row.tienda_destino) || row.tienda_destino, status: row.estado, guide: row.numero_guia,
        createdAt: row.creado_en, quantity: 0, items: [] };
      group.quantity += Number(row.cantidad) || 0;
      group.items.push({ product: row.producto, code: row.codigo_producto, quantity: row.cantidad });
      groups.set(row.grupo_id, group);
    }
    return { groups: [...groups.values()] };
  }

  async function deleteTransfer(actor, groupId) {
    await authorize(actor);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(groupId))
      throw httpError('Selecciona un grupo válido.', 400);
    const { data, error } = await supabase.from('commercial_transfer_items').delete().eq('grupo_id', groupId).select('id');
    if (error) throw dbError(error);
    if (!data?.length) throw httpError('El grupo ya no existe. Actualiza la lista.', 404);
    return { deleted: true, count: data.length };
  }

  async function deletePersonnel(actor, targetId) {
    await authorize(actor);
    const id = Number(targetId);
    if (!Number.isSafeInteger(id) || id < 1) throw httpError('Selecciona una persona válida.', 400);
    if (id === Number(actor.id)) throw httpError('No puedes eliminarte a ti mismo.', 400);
    const { data, error } = await supabase.rpc('systems_delete_personnel', { p_actor_id: actor.id, p_target_id: id });
    if (error?.code === '42501') throw httpError(error.message, 403);
    if (error?.code === 'P0002') throw httpError('La persona ya no existe. Actualiza la lista.', 404);
    if (error) throw dbError(error);
    if (data?.deleted !== true) throw httpError('No se pudo confirmar la eliminación.', 500);
    return data;
  }

  async function suspendPersonnel(actor, targetId, suspended) {
    await authorize(actor);
    const id = Number(targetId);
    if (!Number.isSafeInteger(id) || id < 1 || id === Number(actor.id) || typeof suspended !== 'boolean')
      throw httpError('Selecciona una persona y una acción válidas.', 400);
    const { data, error } = await supabase.rpc('systems_suspend_personnel', { p_actor_id: actor.id, p_target_id: id, p_suspend: suspended });
    if (error?.code === '42501') throw httpError(error.message, 403);
    if (error?.code === 'P0002') throw httpError('La persona ya no existe.', 404);
    if (error?.code === 'P0001') throw httpError(error.message, 409);
    if (error) throw dbError(error);
    if (data?.suspendido_sistemas !== suspended) throw httpError('No se pudo confirmar el cambio de estado.', 500);
    return { person: data };
  }

  return { listPersonnel, listTransfers, deleteTransfer, deletePersonnel, suspendPersonnel };
}
