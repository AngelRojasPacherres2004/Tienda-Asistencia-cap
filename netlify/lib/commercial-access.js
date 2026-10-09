const commercialRoles = new Set(["gerente_comercial", "jefe_zonal", "jefe_tienda"]);

export function commercialAccess(account, scope, storeMap, assignedCluster) {
  if (!account || account.estado !== "activo" || !commercialRoles.has(account.rol) || !scope) return null;
  if (account.rol === "gerente_comercial") {
    return scope.scope_type === "all" && scope.scope_value == null
      ? { scopeType: "all", scopeValue: null, storeIds: storeMap.map(row => row.dashboard_store_id) }
      : null;
  }
  if (account.rol === "jefe_zonal") {
    if (scope.scope_type !== "cluster" || scope.scope_value !== assignedCluster?.codigo || assignedCluster?.estado !== "activo") return null;
    const storeIds = storeMap.filter(row => row.cluster_code === scope.scope_value).map(row => row.dashboard_store_id);
    return storeIds.length ? { scopeType: "cluster", scopeValue: scope.scope_value, storeIds } : null;
  }
  const match = storeMap.find(row => row.dashboard_store_id === scope.scope_value && Number(row.tienda_id) === Number(account.tienda_id));
  return scope.scope_type === "store" && match
    ? { scopeType: "store", scopeValue: match.dashboard_store_id, storeIds: [match.dashboard_store_id] }
    : null;
}

export function validCommercialPartPath(path, access, logicalName) {
  if (typeof path !== "string" || !/^dashboard(?:-[a-z0-9-]+)?\.json$/.test(logicalName)) return false;
  const scopePath = access.scopeType === "all"
    ? ""
    : `scoped/${access.scopeType}/${access.scopeValue}/`;
  const expectedSuffix = `/${scopePath}${logicalName}.gz/`;
  const prefix = path.slice(0, path.indexOf("/"));
  return /^[0-9]{8}T[0-9]{6}Z-[a-f0-9]{12}$/.test(prefix)
    && path.startsWith(`${prefix}${expectedSuffix}`)
    && /^part-[0-9]{4}$/.test(path.slice(`${prefix}${expectedSuffix}`.length));
}
