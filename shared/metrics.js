export const PRESENT_STATES = new Set(["presente", "tardanza", "medio_turno", "apoyo"]);
export const TRAFFIC_HOURS = Array.from({ length: 14 }, (_, i) => `${String(i + 9).padStart(2, "0")}:00-${String(i + 10).padStart(2, "0")}:00`);
export const NORMAL_TRAFFIC_HOURS = TRAFFIC_HOURS.slice(0, 13);

export function businessDate(value = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en", {
    timeZone: "America/Lima", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value)).map(({ type, value: part }) => [type, part]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function addDays(date, days) {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function isWorkday(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay() !== 0;
}

export function countWorkdays(start, end) {
  let count = 0;
  for (let date = start; date <= end; date = addDays(date, 1)) if (isWorkday(date)) count += 1;
  return count;
}

export function trafficPeak(hours) {
  return [...hours.entries()].filter(([hour]) => TRAFFIC_HOURS.includes(hour))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
}

export function attendanceCounts(rows) {
  const counts = { presente: 0, tardanza: 0, ausencia: 0, otros: 0, total: rows.length };
  for (const row of rows) {
    if (row.estado === "tardanza") counts.tardanza += 1;
    else if (PRESENT_STATES.has(row.estado)) counts.presente += 1;
    else if (row.estado === "falta") counts.ausencia += 1;
    else counts.otros += 1;
  }
  return counts;
}

export function courseProgress(courses, people, progress) {
  const byPerson = new Map(progress.map(row => [`${row.curso_id}|${row.usuario_id}`, row.estado]));
  return courses.map(course => {
    const roles = new Set((course.curso_roles || []).map(row => row.rol_codigo));
    const counts = { completados: 0, en_curso: 0, pendientes: 0 };
    for (const person of people) {
      if (!roles.has(person.rol)) continue;
      const state = byPerson.get(`${course.id}|${person.id}`);
      counts[state === "completado" ? "completados" : state === "en_curso" ? "en_curso" : "pendientes"] += 1;
    }
    return { curso_id: course.id, titulo: course.nombre, ...counts };
  }).filter(row => row.completados + row.en_curso + row.pendientes > 0)
    .sort((a, b) => b.pendientes - a.pendientes || a.titulo.localeCompare(b.titulo));
}

// Opening balance excludes arrivals on day 1; departures on the closing day
// count as exits. This preserves opening + arrivals - departures = closing.
export function rotationCounts(periods, start, end) {
  const valid = periods.filter(row => row.fecha_ingreso);
  return {
    ingreso: valid.filter(row => row.fecha_ingreso >= start && row.fecha_ingreso <= end).length,
    salida: valid.filter(row => row.fecha_salida && row.fecha_salida >= start && row.fecha_salida <= end).length,
    personal_inicio: valid.filter(row => row.fecha_ingreso < start && (!row.fecha_salida || row.fecha_salida >= start)).length,
    personal_fin: valid.filter(row => row.fecha_ingreso <= end && (!row.fecha_salida || row.fecha_salida > end)).length,
  };
}

export function employmentPeriods(person) {
  const rows = person.periodos_laborales || [];
  if (!rows.length) return person.fecha_ingreso ? [person] : [];
  return rows.some(row => row.fecha_ingreso === person.fecha_ingreso)
    ? rows.map(row => row.fecha_ingreso === person.fecha_ingreso ? { ...row, fecha_salida: person.fecha_salida } : row)
    : [...rows, ...(person.fecha_ingreso ? [person] : [])];
}

export function pendingAttendance(people, marks, start, end) {
  const recorded = new Set(marks.map(row => `${row.usuario_id}|${row.fecha}`));
  const expected = new Set();
  for (const person of people) {
    for (const period of employmentPeriods(person)) {
      const first = period.fecha_ingreso > start ? period.fecha_ingreso : start;
      const last = period.fecha_salida && period.fecha_salida < end ? period.fecha_salida : end;
      for (let date = first; date <= last; date = addDays(date, 1)) {
        if (isWorkday(date)) expected.add(`${person.id}|${date}`);
      }
    }
  }
  return [...expected].filter(key => !recorded.has(key)).length;
}
