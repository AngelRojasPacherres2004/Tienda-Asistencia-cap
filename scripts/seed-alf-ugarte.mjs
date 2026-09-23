import { loadEnv } from "vite";

const env = loadEnv("development", process.cwd(), "");
const base = `${env.SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: env.SUPABASE_SECRET_KEY,
  Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}`,
  "Content-Type": "application/json",
};

async function request(path, options = {}) {
  const response = await fetch(`${base}/${path}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${body}`);
  return body ? JSON.parse(body) : null;
}

const roster = [
  ["Paola", "Gonzales Osorio", "jefe_tienda", "Administración de tienda"],
  ["Claudia Juana", "Mayhua Gaza", "asistente_tienda", "Administración de tienda"],
  ["Clarissa Liceth", "Morales Diaz", "caja", "Caja"],
  ["Augusta", "Aburto Torres", "jefe_area", "Textil"],
  ["Elizabeth", "Esquivel Lazo", "vendedor", "Textil"],
  ["Jessy Alexandra", "Mucushua Roncal", "vendedor", "Textil"],
  ["Naomi Sunimari", "Pino Chipana", "vendedor", "Textil"],
  ["Deyzzy", "Castillo Delgado", "jefe_area", "Calzado"],
  ["Jassir Antonio", "Marquez Contreras", "vendedor", "Calzado"],
  ["Emma", "Cruz Mundaca", "vendedor", "Calzado"],
  ["Yoselyn", "Vilca Cahuana", "vendedor", "Calzado"],
  ["Sonia", "Valle Vasquez", "vendedor", "Calzado"],
  ["Rebeca Yuliana", "Cortez Villegas", "vendedor", "Calzado"],
  ["Alexander", "Goyzueta Salas", "vendedor", "Hogar y tecnología"],
  ["Richard", "del Aguila Isuiza", "jefe_seguridad", "Seguridad"],
  ["Franco", "Guayame Bardales", "seguridad", "Seguridad"],
  ["Dany Mariana", "Salas Piro", "seguridad", "Seguridad"],
].map(([nombres, apellidos, rol, area_laboral], index) => ({
  nombres,
  apellidos,
  rol,
  area_laboral,
  dni: String(78110001 + index),
  usuario: `alf.${nombres.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}.${apellidos.split(" ")[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")}`,
}));

const clusters = await request("clusters?select=id,nombre,jefe_zonal_id&estado=eq.activo&order=id.asc&limit=1");
if (!clusters.length) throw new Error("No existe un clúster activo para asignar la tienda.");

let stores = await request("tiendas?select=id,nombre,jefe_id,cluster_id&nombre=ilike.ALF.%20UGARTE&limit=1");
if (!stores.length) {
  stores = await request("tiendas", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      nombre: "ALF. UGARTE",
      direccion: "Av. Alfonso Ugarte",
      estado: "activo",
      cluster_id: clusters[0].id,
    }),
  });
}
const store = stores[0];

const usernames = roster.map((person) => person.usuario);
const existing = await request(`usuarios?select=id,usuario,dni,nombres,apellidos,rol,tienda_id&usuario=in.(${usernames.join(",")})`);
const existingByUsername = new Map(existing.map((person) => [person.usuario, person]));
const existingDnis = new Set((await request("usuarios?select=dni")).map((person) => person.dni));

for (const person of roster) {
  const saved = existingByUsername.get(person.usuario);
  if (saved) {
    await request(`usuarios?id=eq.${saved.id}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({
        nombres: person.nombres,
        apellidos: person.apellidos,
        rol: person.rol,
        area_laboral: person.area_laboral,
        tienda_id: store.id,
        estado: "activo",
      }),
    });
    continue;
  }
  if (existingDnis.has(person.dni)) throw new Error(`El DNI provisional ${person.dni} ya está en uso.`);
  await request("usuarios", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({
      ...person,
      password: null,
      tienda_id: store.id,
      estado: "activo",
      fecha_ingreso: "2026-09-01",
      nacionalidad: "Peruana",
    }),
  });
}

const savedUsers = await request(`usuarios?select=id,usuario,dni,nombres,apellidos,rol,area_laboral,tienda_id&usuario=in.(${usernames.join(",")})&order=id.asc`);
const admin = savedUsers.find((person) => person.usuario === roster[0].usuario);
await request(`tiendas?id=eq.${store.id}`, {
  method: "PATCH",
  headers: { Prefer: "return=minimal" },
  body: JSON.stringify({ jefe_id: admin.id, cluster_id: clusters[0].id, estado: "activo" }),
});

const periods = await request(`periodos_laborales?select=usuario_id&usuario_id=in.(${savedUsers.map((person) => person.id).join(",")})&fecha_salida=is.null`);
const periodUserIds = new Set(periods.map((period) => period.usuario_id));
const missingPeriods = savedUsers
  .filter((person) => !periodUserIds.has(person.id))
  .map((person) => ({ usuario_id: person.id, fecha_ingreso: "2026-09-01" }));
if (missingPeriods.length) {
  await request("periodos_laborales", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(missingPeriods),
  });
}

console.log(JSON.stringify({
  tienda: "ALF. UGARTE",
  tienda_id: store.id,
  cluster: clusters[0].nombre,
  administrador: `${admin.nombres} ${admin.apellidos}`,
  empleados: savedUsers.length,
  cuentas_con_acceso: 0,
  nota: "Los DNI son provisionales y las cuentas no tienen contraseña hasta completar los datos reales.",
}, null, 2));
