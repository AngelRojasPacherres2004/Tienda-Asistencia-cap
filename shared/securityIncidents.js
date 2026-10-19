const securityTypes = new Set(["robo", "robo_frustrado", "robo_interno", "estafa", "asalto", "fiscalizacion", "cambio_precio"]);

export function isSecurityIncident(row) {
  return securityTypes.has(row?.tipo) || row?.tipo === "otro" && row?.asunto === "Otra incidencia de seguridad";
}
