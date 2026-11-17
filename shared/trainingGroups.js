// Ordered learning plans for the roles agreed by the business.
export const trainingGroups = [
  {
    "id": "general",
    "roles": [
      "jefe_seguridad",
      "seguridad",
      "jefe_zonal",
      "gerente_comercial"
    ],
    "courses": [
      "Inducción general (cultura y empresa)",
      "Manual de funciones",
      "Capacitación del puesto (técnica y operativa)",
      "Seguridad y salud en el trabajo (SST)",
      "Calidad y metodología 5S"
    ]
  },
  {
    "id": "ventas",
    "roles": [
      "vendedor",
      "trabajador"
    ],
    "courses": [
      "Inducción general (cultura y empresa)",
      "Manual de funciones",
      "Capacitación del puesto (técnica y operativa)",
      "Seguridad y salud en el trabajo (SST)",
      "Calidad y metodología 5S",
      "Técnica de venta",
      "Comunicación asertiva y escucha activa",
      "Dominio del producto"
    ]
  },
  {
    "id": "administracion",
    "roles": [
      "jefe_tienda",
      "asistente_tienda"
    ],
    "courses": [
      "Inducción general (cultura y empresa)",
      "Manual de funciones",
      "Cronograma comercial",
      "Capacitación del puesto (técnica y operativa)",
      "Seguridad y salud en el trabajo (SST)",
      "Calidad y metodología 5S",
      "Técnica de venta",
      "Comunicación asertiva y escucha activa",
      "Dominio del producto"
    ]
  }
];

export function compareTrainingCourses(role) {
  const plan = trainingGroups.find(group => group.roles.includes(role))?.courses
    || trainingGroups.find(group => group.id === 'administracion').courses;
  return (a, b) => {
    const titleA = normalizeTrainingTitle(a.nombre ?? a.titulo ?? '');
    const titleB = normalizeTrainingTitle(b.nombre ?? b.titulo ?? '');
    const indexA = plan.indexOf(titleA);
    const indexB = plan.indexOf(titleB);
    return (indexA < 0 ? Infinity : indexA) - (indexB < 0 ? Infinity : indexB)
      || titleA.localeCompare(titleB, 'es');
  };
}

// Number by the recipient's plan; historical courses keep an unnumbered title.
export function trainingCourseLabel(title, role) {
  const plan = trainingGroups.find(group => group.roles.includes(role))?.courses;
  const cleanTitle = normalizeTrainingTitle(title);
  const index = plan?.indexOf(cleanTitle) ?? -1;
  return index < 0 ? cleanTitle : (index + 1) + '. ' + cleanTitle;
}

export function normalizeTrainingTitle(title) {
  return title.replace(/^CAP\s*\d+\s*(?:-\s*)?/i, '').trim();
}
