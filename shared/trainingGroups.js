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
      "CAP 1 - Inducción general (cultura y empresa)",
      "Manual de funciones",
      "CAP 2 - Capacitación del puesto (técnica y operativa)",
      "CAP 3 - Seguridad y salud en el trabajo (SST)",
      "CAP 6 - Calidad y metodología 5S"
    ]
  },
  {
    "id": "ventas",
    "roles": [
      "vendedor",
      "trabajador"
    ],
    "courses": [
      "CAP 1 - Inducción general (cultura y empresa)",
      "Manual de funciones",
      "CAP 2 - Capacitación del puesto (técnica y operativa)",
      "CAP 3 - Seguridad y salud en el trabajo (SST)",
      "CAP 6 - Calidad y metodología 5S",
      "Técnica de venta",
      "CAP 7 Comunicación asertiva y escucha activa",
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
      "CAP 1 - Inducción general (cultura y empresa)",
      "Manual de funciones",
      "Cronograma comercial",
      "CAP 2 - Capacitación del puesto (técnica y operativa)",
      "CAP 3 - Seguridad y salud en el trabajo (SST)",
      "CAP 6 - Calidad y metodología 5S",
      "Técnica de venta",
      "CAP 7 Comunicación asertiva y escucha activa",
      "Dominio del producto"
    ]
  }
];

export function compareTrainingCourses(role) {
  const plan = trainingGroups.find(group => group.roles.includes(role))?.courses
    || trainingGroups.find(group => group.id === 'administracion').courses;
  return (a, b) => {
    const titleA = a.nombre ?? a.titulo ?? '';
    const titleB = b.nombre ?? b.titulo ?? '';
    const indexA = plan.indexOf(titleA);
    const indexB = plan.indexOf(titleB);
    return (indexA < 0 ? Infinity : indexA) - (indexB < 0 ? Infinity : indexB)
      || titleA.localeCompare(titleB, 'es');
  };
}
