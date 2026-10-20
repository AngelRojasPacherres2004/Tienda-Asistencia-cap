const districtAliases = new Map([
  ["RIMAC", "RÍMAC"], ["SJL", "SAN JUAN DE LURIGANCHO"],
  ["SMP", "SAN MARTÍN DE PORRES"], ["VILLA MARIA", "VILLA MARÍA DEL TRIUNFO"],
  ["VILLA MARIA DEL TRIUNFO", "VILLA MARÍA DEL TRIUNFO"],
  ["VILLA EL SAVADOR", "VILLA EL SALVADOR"],
]);
const nationalityInDistrict = new Map([["PERUANA", "Peruana"], ["PERUANO", "Peruana"], ["CHILENA", "Chilena"], ["CHILENO", "Chilena"]]);

export function normalizedPersonnelFields(person) {
  const district = String(person.distrito || "").trim().toUpperCase();
  const career = String(person.carrera || "").trim();
  const nationality = String(person.nacionalidad || "").trim();
  return {
    distrito: nationalityInDistrict.has(district) ? null : districtAliases.get(district) || district || null,
    nacionalidad: nationality || nationalityInDistrict.get(district) || null,
    carrera: /^(NINGUN[AO]|N\/?A|NO APLICA|SIN CARRERA)$/i.test(career) ? null : career || null,
  };
}
