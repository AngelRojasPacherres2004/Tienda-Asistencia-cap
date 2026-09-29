export const auditScoreOptions = [
  { value: 1, label: "Deficiente" },
  { value: 2, label: "Insatisfactorio" },
  { value: 3, label: "Satisfactorio" },
  { value: 4, label: "Sobresaliente" },
  { value: 5, label: "Óptimo" },
];

export const storeAuditChecklist = [
  {
    id: "infraestructura", title: "Mobiliario e infraestructura", weight: 20,
    items: [
      ["1.1", "Productos ordenados y tallados.", "quincenal"],
      ["1.2", "Almacén: limpieza, orden, stock y merma.", "quincenal"],
      ["1.3", "Vitrinas, ganchos, trupán, mamparas y espejos limpios y en buen estado.", "quincenal"],
      ["1.4", "Maniquíes, habladores y micas en buen estado.", "quincenal"],
      ["1.5", "Paredes, ventanas, puertas, baños y fachada limpios y en buen estado.", "quincenal"],
      ["1.6", "Iluminación, focos o fluorescentes en buen estado.", "quincenal"],
      ["1.7", "Módulos de calzado, palmeras y caballetes limpios y en buen estado.", "quincenal"],
    ],
  },
  {
    id: "marketing", title: "Marketing, campañas y ofertas", weight: 20,
    items: [
      ["2.1", "Rótulos de productos, ofertas y descuentos en cada hablador.", "quincenal"],
      ["2.2", "Ubicación de productos con descuento y ofertas en el piso de ventas.", "quincenal"],
      ["2.3", "Banners, viniles y publicidad en módulos y paredes en buen estado.", "quincenal"],
      ["2.4", "Evidencia de activaciones con muñecos los fines de semana y feriados.", "quincenal"],
      ["2.5", "Parlante, USB y micrófono en buen estado.", "quincenal"],
      ["2.6", "Videos publicitarios compartidos con colaboradores y en sus redes sociales.", "quincenal"],
      ["2.7", "Los colaboradores conocen las promociones vigentes y los videos de influencers.", "quincenal"],
      ["2.8", "Trabajos adicionales del administrador para generar tráfico en tienda.", "quincenal"],
      ["2.9", "Inventario de mobiliario de ventas y de marketing actualizado.", "mensual"],
    ],
  },
  {
    id: "documentos_sistemas", title: "Licencias, formatos, manuales y sistemas", weight: 20,
    items: [
      ["3.1", "Botiquín completo y vigente.", "mensual"],
      ["3.2", "Extintores vigentes y con fecha de caducidad controlada.", "mensual"],
      ["3.6", "Cronograma del administrador actualizado.", "mensual"],
      ["3.7", "Planograma o layout con fecha de actualización.", "mensual"],
      ["3.8", "FORM007: organigrama y registro de personal.", "mensual"],
      ["3.9", "FORM029: reunión semanal.", "semanal"],
      ["3.10", "FORM028: ronda diaria del administrador.", "diario"],
      ["3.11", "FORM002: conteo rápido por marca.", "por_verificar"],
      ["3.12", "Formato de productos de baja y alta rotación.", "mensual"],
      ["3.13", "FORM001: reposición de mercadería por área.", "diario"],
      ["3.14", "FORM022: informe de deterioro, merma, desmedro y robo.", "mensual"],
      ["3.15", "Formato de problemas de tienda.", "mensual"],
      ["3.16", "Análisis de indicadores KPI.", "mensual"],
      ["3.17", "Folder de documentación municipal.", "mensual"],
      ["3.18", "Folder físico o virtual de formatos de tienda.", "mensual"],
      ["3.19", "Manuales físicos o virtuales de funciones, ventas, textil, calzado y seguridad.", "mensual"],
      ["3.20", "Recepción de guías registrada en el sistema.", "diario"],
      ["3.21", "Formato de mejora continua con fecha de actualización.", "semanal"],
      ["3.22", "Bitácora diaria actualizada.", "diario"],
      ["3.23", "Formato de levantamiento de observaciones del checklist.", "quincenal"],
      ["3.24", "Libro de reclamaciones actualizado.", "quincenal"],
    ],
  },
  {
    id: "personal", title: "Personal", weight: 20,
    items: [
      ["4.1", "Cartilla de seguimiento de meta por colaborador y por hora.", "quincenal"],
      ["4.2", "Control diario, semanal y mensual de ventas por asesor.", "diario"],
      ["4.3", "Reporte de asistencias y tardanzas del personal.", "quincenal"],
      ["4.4", "Faltas de personal anticipadas y solicitudes de contratación o apoyo gestionadas.", "semanal"],
      ["4.5", "Inducción, capacitación, seguimiento, sanción y promoción del personal.", "mensual"],
      ["4.6", "Folder del personal con documentos y evaluaciones de desempeño.", "mensual"],
    ],
  },
  {
    id: "seguridad", title: "Seguridad", weight: 20,
    items: [
      ["5.1", "Cuaderno de incidencias de seguridad revisado y firmado.", "quincenal"],
      ["5.2", "FORM025: ronda diaria de seguridad.", "quincenal"],
      ["5.3", "FORM005: inspección de seguridad de tienda.", "mensual"],
    ],
  },
].map((section) => ({
  ...section,
  items: section.items.map(([id, text, period]) => ({ id, text, period, sectionId: section.id, section: section.title })),
}));

export const auditItems = storeAuditChecklist.flatMap((section) => section.items);

export const defaultCorrectionDays = (period) => ({
  diario: 1,
  semanal: 3,
  quincenal: 3,
  mensual: 5,
  por_verificar: 3,
}[period] || 3);

export const auditPeriodLabel = (period) => ({
  diario: "Diario",
  semanal: "Semanal",
  quincenal: "Quincenal",
  mensual: "Mensual",
  por_verificar: "Por verificar",
}[period] || period);
