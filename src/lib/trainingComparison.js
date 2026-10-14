export function trainingStoreComparison(stores, clusters, people, clusterFilter = "todos") {
  const clusterById = new Map(clusters.map(cluster => [String(cluster.id), cluster]));
  const rows = new Map(stores.map(store => {
    const cluster = clusterById.get(String(store.cluster_id));
    const clusterCode = String(cluster?.codigo || cluster?.nombre || "").trim().toUpperCase().replace(/^CL[ÚU]STER\s*/, "");
    return [String(store.id), { id: store.id, name: store.nombre, clusterCode, clusterName: cluster?.codigo || cluster?.nombre || "", total: 0, completado: 0, en_curso: 0, pendiente: 0 }];
  }));
  const seen = new Set();
  for (const person of people) {
    if (person.estado !== "activo" || seen.has(String(person.id))) continue;
    const row = rows.get(String(person.tienda_id));
    if (!row) continue;
    seen.add(String(person.id));
    row.total += 1;
    const state = ["completado", "en_curso"].includes(person.progreso_estado) ? person.progreso_estado : "pendiente";
    row[state] += 1;
  }
  return [...rows.values()]
    .filter(row => clusterFilter === "todos" || row.clusterCode === clusterFilter)
    .map(row => ({ ...row, percentage: row.total ? row.completado * 100 / row.total : null, majority: row.total > 0 && row.completado * 2 > row.total, complete: row.total > 0 && row.completado === row.total }))
    .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1) || a.name.localeCompare(b.name, "es") || Number(a.id) - Number(b.id));
}
