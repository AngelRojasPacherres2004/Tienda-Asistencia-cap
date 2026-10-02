export function latestCampaignValidation(validations, campaignId) {
  return validations.filter(row => String(row.campana_id) === String(campaignId))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || Number(b.id) - Number(a.id))[0];
}

export function campaignStatus(campaign, validations) {
  return latestCampaignValidation(validations, campaign.id)?.estado || campaign.estado_validacion || "pendiente";
}

export function approvedCampaigns(campaigns, validations) {
  return campaigns.filter(campaign => !campaign.registro_completado && campaignStatus(campaign, validations) === "aprobada")
    .map(campaign => ({ ...campaign, presupuesto_previsto: latestCampaignValidation(validations, campaign.id)?.presupuesto ?? campaign.presupuesto_previsto }));
}
export function approvedValidations(validations) {
  return validations.filter(row => row.estado === "aprobada" && !row.campana_id)
    .map(row => ({ id: row.id, nombre: row.nombre, descripcion: row.descripcion, presupuesto_previsto: row.presupuesto }));
}
