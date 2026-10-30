const regionNames = new Intl.DisplayNames(['es'], { type: 'region' });
export const countries = [...new Set(Array.from({ length: 26 * 26 }, (_, index) => {
  const code = String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26);
  const name = regionNames.of(code);
  return name !== code && code !== 'ZZ' ? name : null;
}).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));

export const districts = ["LIMA", "ATE", "BARRANCO", "BREÑA", "CARABAYLLO", "CHORRILLOS", "CIENEGUILLA", "COMAS", "EL AGUSTINO", "INDEPENDENCIA", "JESÚS MARÍA", "LA MOLINA", "LA VICTORIA", "LINCE", "LOS OLIVOS", "LURIGANCHO", "LURÍN", "MAGDALENA DEL MAR", "MIRAFLORES", "PACHACÁMAC", "PUCUSANA", "PUEBLO LIBRE", "PUENTE PIEDRA", "PUNTA HERMOSA", "PUNTA NEGRA", "RÍMAC", "SAN BARTOLO", "SAN BORJA", "SAN ISIDRO", "SAN JUAN DE LURIGANCHO", "SAN JUAN DE MIRAFLORES", "SAN LUIS", "SAN MARTÍN DE PORRES", "SAN MIGUEL", "SANTA ANITA", "SANTA MARÍA DEL MAR", "SANTA ROSA", "SANTIAGO DE SURCO", "SURQUILLO", "VILLA EL SALVADOR", "VILLA MARÍA DEL TRIUNFO"];

export const storePersonnelColumns = [
  ['Tipo de documento','tipo_documento'], ['DNI','dni'], ['Nombres','nombres'], ['Apellidos','apellidos'],
  ['Teléfono','telefono'], ['Correo','email'], ['Fecha ingreso','fecha_ingreso'], ['Fecha de nacimiento','fecha_nacimiento'],
  ['Sueldo','sueldo'], ['Rol','rol'], ['Usuario','usuario'], ['Contraseña','password'],
  ['Régimen / jornada (horas)','regimen_jornada'], ['Turno','tipo_turno'], ['Sexo','sexo'], ['País de origen','nacionalidad'],
  ['Teléfono de emergencia','telefono_emergencia'], ['Contacto de emergencia','contacto_emergencia'],
  ['Distrito','distrito'], ['Dirección','direccion'], ['Nivel de estudios','grado_academico'], ['Carrera','carrera'],
  ['Tiene parentesco','tiene_parentesco'], ['Tipo de parentesco','tipo_parentesco'], ['Nombre del familiar','familiar_vinculo'],
  ['Estado civil','estado_civil'], ['Número de hijos','numero_hijos'], ['Talla polo/casaca','talla_polo'],
  ['Talla de zapatos','talla_zapatillas'], ['Alergia','alergia'], ['Condición de salud','condicion_salud'],
];
export const storePersonnelLists = {
  tipo_documento: ['dni','ce'],
  rol: ['asistente_tienda','jefe_seguridad','jefe_area','seguridad','caja','almacenero','vendedor','asistente'],
  tipo_turno: ['apertura','cierre'], sexo: ['hombre','mujer','no_especificado'], nacionalidad: countries, distrito: districts,
  grado_academico: ['primaria','secundaria','tecnico','universitario','sin_especificar'],
  tiene_parentesco: ['No','Sí'], tipo_parentesco: ['padre_madre','hermano_hermana','conyuge_pareja','hijo_hija','otro'],
  estado_civil: ['soltero','casado','conviviente','divorciado','viudo','sin_especificar'], talla_polo: ['s','m','l','xl','xxl'],
};
export const normalizePersonnelHeader = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/gi, '').toLowerCase();

export function personnelChoiceLabel(key, value) {
  if (key === 'tipo_documento' || key === 'talla_polo') return value.toUpperCase();
  if (key === 'nacionalidad' || key === 'distrito' || key === 'tiene_parentesco') return value;
  const labels = {
    asistente_tienda: 'Asistente de tienda', jefe_seguridad: 'Jefe de seguridad', jefe_area: 'Jefe de área',
    no_especificado: 'Sin especificar', sin_especificar: 'Sin especificar', tecnico: 'Técnico',
    padre_madre: 'Padre / madre', hermano_hermana: 'Hermano / hermana', conyuge_pareja: 'Cónyuge / pareja', hijo_hija: 'Hijo / hija',
    soltero: 'Soltero(a)', casado: 'Casado(a)', divorciado: 'Divorciado(a)', viudo: 'Viudo(a)',
  };
  return labels[value] || value.charAt(0).toUpperCase() + value.slice(1);
}
