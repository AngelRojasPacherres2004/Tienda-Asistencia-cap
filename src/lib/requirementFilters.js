export const requirementCode = row => `REQ-${String(row.id).padStart(4, "0")}`;
export const requirementAuthor = person => [person?.nombres, person?.apellidos].filter(Boolean).join(" ") || "Sin autor registrado";
export const isRequirementOverdue = (row, today) => !["atendido", "cancelado"].includes(row.estado) && Boolean(row.fecha_fin_objetivo) && row.fecha_fin_objetivo < today;

export function filterRequirements(rows, filters, today) {
  const priorities = ["urgente", "corto_plazo", "mediano_plazo", "largo_plazo"];
  return rows.filter(row => (!filters.store || String(row.tienda_id) === filters.store)
    && (!filters.status || row.estado === filters.status) && (!filters.urgency || row.urgencia === filters.urgency)
    && (!filters.area || row.areas_responsables?.includes(filters.area))
    && (!filters.from || row.fecha_inicio >= filters.from) && (!filters.to || row.fecha_inicio <= filters.to)
    && (!filters.late || isRequirementOverdue(row, today))
    && [requirementCode(row), row.requerimiento, row.tienda_nombre, requirementAuthor(row.autor), row.comentario]
      .join(" ").toLocaleLowerCase("es").includes((filters.search || "").trim().toLocaleLowerCase("es")))
    .sort((a, b) => (filters.order === "gestion" ? Number(["atendido", "cancelado"].includes(a.estado)) - Number(["atendido", "cancelado"].includes(b.estado))
      || Number(isRequirementOverdue(b, today)) - Number(isRequirementOverdue(a, today))
      || priorities.indexOf(a.urgencia) - priorities.indexOf(b.urgencia)
      || (a.fecha_fin_objetivo || "9999").localeCompare(b.fecha_fin_objetivo || "9999")
      : filters.order === "urgencia" ? priorities.indexOf(a.urgencia) - priorities.indexOf(b.urgencia)
      : filters.order === "objetivo" ? (a.fecha_fin_objetivo || "9999").localeCompare(b.fecha_fin_objetivo || "9999") : 0)
      || String(b.created_at).localeCompare(String(a.created_at)) || Number(b.id) - Number(a.id));
}
