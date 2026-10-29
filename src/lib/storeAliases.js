// Alias comerciales presentes en el catálogo del dashboard. Tiendas nuevas
// se muestran por su nombre hasta que tengan un alias confirmado.
const aliases = {
  'ALFONSO UGARTE': 'ALF', ALIPIO: 'ALI', ANGAMOS: 'ANG', ARAMBURU: 'ARA',
  ARGENTINA: 'ARG', AYACUCHO: 'AYA', CALLAO: 'CAL', CHORRILLOS: 'CHO',
  EMANCIPACION: 'EMA', INDEPENDENCIA: 'IND', 'JR. DE LA UNION 797': 'JRU',
  'LA MARINA': 'MAR', PERSHING: 'PER', 'PUENTE PIEDRA': 'PP', PUNO: 'PU',
  'PLAZA UNION': 'PZU', TRUJILLO: 'TRU',
};

export function storeAlias(name) {
  const key = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toUpperCase();
  return aliases[key] || '';
}
