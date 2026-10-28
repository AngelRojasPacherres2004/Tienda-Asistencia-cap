export const ATTENDANCE_OPTIONS = [
  { value: 'presente', label: 'Asistencia' },
  { value: 'tardanza', label: 'Tardanza' },
  { value: 'medio_turno', label: 'Medio turno' },
  { value: 'descanso', label: 'Descanso', description: 'Ese día no trabaja.' },
  { value: 'apoyo', label: 'Apoyo (salida)', description: 'Trabajador de esta tienda que fue a apoyar a otra tienda.' },
  { value: 'apoyo_ingreso', label: 'Apoyo (ingreso)', description: 'Trabajador de otra tienda que está apoyando aquí.' },
  { value: 'falta', label: 'Falta' },
  { value: 'permiso', label: 'Permiso' },
  { value: 'descanso_medico', label: 'Descanso médico' },
  { value: 'suspension', label: 'Suspensión' },
];
export const ATTENDANCE_LABELS = Object.fromEntries(ATTENDANCE_OPTIONS.map(({ value, label }) => [value, label]));
export const PRESENT_STATES = new Set(['presente', 'tardanza', 'medio_turno', 'apoyo_ingreso']);
export const attendancePersonId = row => row.persona_id ?? row.usuario_id ?? `cobertura-${row.cobertura_trabajador_id}`;
export const attendancePersonName = row => row.usuarios
  ? `${row.usuarios.nombres || ''} ${row.usuarios.apellidos || ''}`.trim()
  : row.cobertura_trabajador?.nombre_manual || row.nombre || '';

// Consolidated views show the physical presence rather than the origin departure.
export function attendanceDayIndex(rows) {
  const result = new Map();
  for (const row of rows) {
    const key = `${attendancePersonId(row)}-${Number(row.fecha.slice(8, 10))}`;
    if (!PRESENT_STATES.has(result.get(key)?.estado) || PRESENT_STATES.has(row.estado)) result.set(key, row);
  }
  return result;
}
