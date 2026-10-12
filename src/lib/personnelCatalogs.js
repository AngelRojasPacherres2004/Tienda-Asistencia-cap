export const DEPARTURE_REASONS = [
  ["MEJOR OFERTA", "Mejor oferta"],
  ["SALUD", "Salud"],
  ["AUSENTISMO", "Ausentismo"],
  ["PERSONAL", "Motivos personales"],
  ["DESERCIÓN", "Deserción"],
  ["CAMBIO DE TIENDA", "Cambio de tienda"],
  ["RENUNCIA", "Renuncia"],
  ["OTRO", "Otro"],
];

const keyOf = (value) => String(value || "").trim().normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase();

const aliases = {
  "MEJOR OFERTA LABORAL": "MEJOR OFERTA",
  "MOTIVOS PERSONALES": "PERSONAL",
  "MOTIVO PERSONAL": "PERSONAL",
  "CAMBIO TIENDA": "CAMBIO DE TIENDA",
  "DESERCION": "DESERCIÓN",
};

export function normalizeDepartureReason(value) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  if (!cleaned) return "";
  const key = keyOf(cleaned);
  return aliases[key] || DEPARTURE_REASONS.find(([code]) => keyOf(code) === key)?.[0] || cleaned;
}

export function validDepartureReason(value) {
  return DEPARTURE_REASONS.some(([code]) => code === normalizeDepartureReason(value));
}

export function departureReasonOptions(current = "") {
  const value = normalizeDepartureReason(current);
  return value && !validDepartureReason(value)
    ? [...DEPARTURE_REASONS, [value, `${value} (histórico)`]]
    : DEPARTURE_REASONS;
}
