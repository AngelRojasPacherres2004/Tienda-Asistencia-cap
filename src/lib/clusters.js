export function clusterLabel(value) {
  const suffix = String(value || "").trim().toUpperCase().replace(/^CL[ÚU]STER\s*/, "");
  return suffix ? `CLÚSTER ${suffix}` : "Sin asignar";
}

export function isCommercialCluster(cluster) {
  const code = String(cluster?.codigo || "").trim().toUpperCase().replace(/^CL[ÚU]STER\s*/, "");
  const name = String(cluster?.nombre || "").trim().toUpperCase().replace(/^CL[ÚU]STER\s*/, "");
  return [code, name].some(value => value === "A" || value === "B");
}
