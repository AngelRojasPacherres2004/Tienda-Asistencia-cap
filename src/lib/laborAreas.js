export const LABOR_AREAS = [
  "Administración", "Almacén", "Caja", "Calzado", "Calzado / Textil",
  "Electro", "Electro menor", "Hogar", "Hogar / Electro", "Hogar / Tecnología",
  "Hogar y Menaje", "Seguridad", "Tecnología", "Textil", "Ventas",
];

const aliases = {
  ADMINISTRACION: "Administración", ADMINISTRATIVA: "Administración",
  ALMACEN: "Almacén", CAJA: "Caja", CALZADO: "Calzado",
  "CALZADO / TEXTIL": "Calzado / Textil", ELECTRO: "Electro",
  "ELECTRO MENOR": "Electro menor", HOGAR: "Hogar",
  "HOGAR / ELECTRO": "Hogar / Electro", "HOGAR / TECNOLOGIA": "Hogar / Tecnología",
  "HOGAR Y MENAJE": "Hogar y Menaje", SEGURIDAD: "Seguridad",
  TECNOLOGIA: "Tecnología", TEXTIL: "Textil", VENTAS: "Ventas",
};

const areaKey = (value = "") => String(value).trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").toUpperCase();

export function normalizeLaborArea(value) {
  const cleaned = String(value || "").trim().replace(/\s+/g, " ");
  return aliases[areaKey(cleaned)] || cleaned;
}

export function laborAreaOptions(values = []) {
  return [...new Set([...LABOR_AREAS, ...values.map(normalizeLaborArea).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, "es"));
}
