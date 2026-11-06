const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const routeKey = row => JSON.stringify([row.productId, row.source, row.destination]);

export function createTransferGroupsDomain({ supabase, currentCommercialAccess, commercialStoreTransfers, commercialCompanyRanking, readAllResult, bodyOf, httpError, dbError }) {
  const table = 'commercial_transfer_items';
  const fail = (message, status = 400) => { throw httpError(message, status); };
  async function accessFor(user) {
    const access = await currentCommercialAccess(user);
    if (!['jefe_tienda', 'gerente_comercial', 'jefe_zonal'].includes(access.role)) fail('No tienes permiso para gestionar traslados.', 403);
    return access;
  }
  async function listTransferGroups(user) {
    const access = await accessFor(user);
    const { data, error } = await readAllResult(supabase.from(table).select('*').in('tienda_origen', access.storeIds).order('creado_en', { ascending: false }).order('id'));
    if (error) throw dbError(error);
    const ranking = await commercialCompanyRanking(user);
    const names = new Map(ranking.stores.map(store => [store.storeId, store.alias || store.store]));
    const groups = new Map();
    for (const row of data || []) {
      const group = groups.get(row.grupo_id) || { id: row.grupo_id, destination: row.tienda_destino,
        name: names.get(row.tienda_destino) || row.tienda_destino, status: row.estado,
        guide: row.numero_guia, createdAt: row.creado_en, validatedAt: row.validado_en, quantity: 0, items: [] };
      group.quantity += row.cantidad;
      group.items.push({ id: row.id, productId: row.producto_id, product: row.producto, code: row.codigo_producto,
        size: row.talla, source: row.tienda_origen, sourceName: names.get(row.tienda_origen) || row.tienda_origen, quantity: row.cantidad });
      groups.set(row.grupo_id, group);
    }
    return { groups: [...groups.values()], canValidate: ['gerente_comercial', 'jefe_zonal'].includes(access.role) };
  }
  async function saveTransferGroup(event, user) {
    const access = await accessFor(user);
    const input = bodyOf(event);
    if (!uuid.test(input.groupId || '') || !Array.isArray(input.items) || input.items.length < 1 || input.items.length > 200) fail('El grupo debe contener entre 1 y 200 productos.');
    const { data: existing, error: existingError } = await supabase.from(table).select('creado_por,tienda_origen,tienda_destino,producto_id,cantidad').eq('grupo_id', input.groupId);
    if (existingError) throw dbError(existingError);
    if (existing?.length) {
      if (!existing.every(row => row.creado_por === Number(user.id) && access.storeIds.includes(row.tienda_origen))) fail('El grupo ya existe.', 409);
      if (existing.length !== input.items.length || !existing.every(row => input.items.some(item => item && item.source === row.tienda_origen && item.destination === row.tienda_destino && item.productId === row.producto_id && item.quantity === row.cantidad))) fail('El grupo ya fue guardado con otras cantidades. Actualiza la sección Guardados.', 409);
      return { groupId: input.groupId };
    }
    const recommendations = await commercialStoreTransfers(user);
    const routes = new Map(recommendations.routes.map(row => [routeKey(row), row]));
    const seen = new Set(); const outgoing = new Map(); const incoming = new Map(); const destinations = new Set();
    const rows = input.items.map(item => {
      if (!item || typeof item !== 'object') fail('Producto no válido.');
      const key = routeKey(item); const route = routes.get(key);
      if (!route || !access.storeIds.includes(route.source)) fail('Uno de los productos no tiene un traslado autorizado desde tu tienda.', 403);
      if (!Number.isSafeInteger(item.quantity) || item.quantity <= 0 || item.quantity > route.suggested) fail('La cantidad supera el máximo permitido para un producto.');
      if (seen.has(key)) fail('El grupo contiene productos repetidos.');
      seen.add(key); destinations.add(route.destination);
      const sourceKey = JSON.stringify([route.source, route.productId]); const destinationKey = JSON.stringify([route.destination, route.productId]);
      outgoing.set(sourceKey, (outgoing.get(sourceKey) || 0) + item.quantity);
      incoming.set(destinationKey, (incoming.get(destinationKey) || 0) + item.quantity);
      if (outgoing.get(sourceKey) > Math.max(0, Math.floor(route.sourceStock - route.sourceSales))
        || incoming.get(destinationKey) > Math.max(0, Math.ceil(route.destinationSales - route.destinationStock))) fail('La selección supera el excedente o la necesidad disponible.');
      return { grupo_id: input.groupId, tienda_origen: route.source, tienda_destino: route.destination,
        producto_id: route.productId, codigo_producto: route.productCode || '', producto: route.product,
        talla: typeof item.size === 'string' ? item.size.slice(0, 40) : '', cantidad: item.quantity, creado_por: user.id };
    });
    if (destinations.size !== 1) fail('Cada grupo debe tener una única tienda destino.');
    const { error } = await supabase.from(table).insert(rows);
    if (error) throw dbError(error);
    return { groupId: input.groupId };
  }
  async function updateTransferGroup(event, user) {
    const access = await accessFor(user); const input = bodyOf(event);
    if (!uuid.test(input.groupId || '')) fail('Grupo no válido.');
    const { data: rows, error } = await supabase.from(table).select('tienda_origen,estado').eq('grupo_id', input.groupId);
    if (error) throw dbError(error);
    if (!rows?.length) fail('El grupo no existe.', 404);
    if (!rows.every(row => access.storeIds.includes(row.tienda_origen))) fail('El grupo está fuera de tu alcance.', 403);
    let update;
    if (input.action === 'validate') {
      if (!['gerente_comercial', 'jefe_zonal'].includes(access.role)) fail('Solo gerente comercial o jefe zonal pueden validar.', 403);
      if (rows.every(row => row.estado === 'validado')) return { groupId: input.groupId };
      update = { estado: 'validado', validado_por: user.id, validado_en: new Date().toISOString() };
    } else if (input.action === 'guide') {
      if (!rows.every(row => row.estado === 'validado')) fail('Primero debe validarse el grupo.', 409);
      if (typeof input.guide !== 'string' || input.guide.trim().length > 80) fail('El número de guía admite hasta 80 caracteres.');
      update = { numero_guia: input.guide.trim() };
    } else fail('Acción no válida.');
    const { error: updateError } = await supabase.from(table).update(update).eq('grupo_id', input.groupId);
    if (updateError) throw dbError(updateError);
    return { groupId: input.groupId };
  }
  return { listTransferGroups, saveTransferGroup, updateTransferGroup };
}
