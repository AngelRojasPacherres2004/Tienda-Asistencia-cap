import { loadEnv } from "vite";
import { deflateSync } from "node:zlib";

const env = loadEnv("development", process.cwd(), "");
const rest = `${env.SUPABASE_URL}/rest/v1`;
const storage = `${env.SUPABASE_URL}/storage/v1/object/mi-tienda`;
const auth = { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` };
if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) throw new Error("Faltan credenciales de Supabase.");

async function request(path, options = {}) {
  const response = await fetch(`${rest}/${path}`, { ...options, headers: { ...auth, "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${path}: ${response.status} ${text}`);
  return text ? JSON.parse(text) : null;
}
const insert = (table, rows, returning = false) => rows.length ? request(table, { method: "POST", headers: { Prefer: returning ? "return=representation" : "return=minimal" }, body: JSON.stringify(rows) }) : [];
const patch = (table, id, body) => request(`${table}?id=eq.${id}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const name = Buffer.from(type); const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([name, data])));
  return Buffer.concat([length, name, data, crc]);
}
function image(seed, resolved = false) {
  const width = 720, height = 420, rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3); row[0] = 0;
    for (let x = 0; x < width; x++) {
      const zone = (x > 80 && x < 640 && y > 70 && y < 350);
      const accent = ((x + y + seed * 17) % 83) < 8;
      const r = resolved ? 28 : 92, g = resolved ? 126 : 77, b = resolved ? 91 : 55;
      row[1 + x * 3] = zone ? r + (accent ? 45 : 0) : 20;
      row[2 + x * 3] = zone ? g + (accent ? 35 : 0) : 22;
      row[3 + x * 3] = zone ? b + (accent ? 25 : 0) : 24;
    }
    rows.push(row);
  }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}
function pdf(title, lines) {
  const safe = (value) => String(value).replace(/[()\\]/g, " ").normalize("NFD").replace(/[^\x20-\x7E]/g, "");
  const commands = [`BT /F1 18 Tf 54 790 Td (${safe(title)}) Tj`, "/F1 10 Tf 0 -28 Td"];
  for (const line of lines) commands.push(`(${safe(line)}) Tj 0 -17 Td`);
  commands.push("ET"); const stream = commands.join("\n");
  const objects = ["1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj", "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj", "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >> endobj", `4 0 obj << /Length ${Buffer.byteLength(stream)} >> stream\n${stream}\nendstream endobj`, "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj"];
  let body = "%PDF-1.4\n", offsets = [0]; for (const object of objects) { offsets.push(Buffer.byteLength(body)); body += `${object}\n`; }
  const xref = Buffer.byteLength(body); body += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10,"0")} 00000 n `).join("\n")}\ntrailer << /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(body);
}
async function upload(path, content, type) {
  const response = await fetch(`${storage}/${path}`, { method: "POST", headers: { ...auth, "Content-Type": type, "x-upsert": "true" }, body: content });
  if (!response.ok) throw new Error(`storage ${path}: ${response.status} ${await response.text()}`);
  return path;
}

const stores = (await request("tiendas?select=id,nombre,jefe_id,cluster_id&estado=eq.activo&order=id.asc"));
const clusters = await request("clusters?select=id,nombre,jefe_zonal_id&estado=eq.activo");
const zonalByCluster = new Map(clusters.map((row) => [row.id, row.jefe_zonal_id]));
const users = await request("usuarios?select=id,nombres,apellidos,rol,tienda_id&estado=eq.activo");
const registrar = new Map(stores.map((store) => [store.id, store.jefe_id || users.find((user) => user.tienda_id === store.id)?.id]));
const files = new Map();
for (const store of stores) {
  const root = `demo-realista/tienda-${store.id}`;
  const entries = {
    checklist: [`${root}/checklist-supervision-setiembre.pdf`, pdf(`Checklist de supervision - ${store.nombre}`, ["Periodo: septiembre 2026", "Apertura y caja: conforme", "Seguridad y extintores: conforme", "Sala de ventas: observacion menor", "Almacen: requiere ordenamiento", "Firma digitalizada del administrador"]) , "application/pdf"],
    acta: [`${root}/acta-incidencia.pdf`, pdf(`Acta de incidencia - ${store.nombre}`, ["Fecha: 18/09/2026", "Evento atendido y documentado", "Se revisaron camaras y declaraciones", "Seguimiento asignado al administrador"]) , "application/pdf"],
    inicial: [`${root}/hallazgo-inicial.png`, image(store.id, false), "image/png"],
    cierre: [`${root}/hallazgo-corregido.png`, image(store.id, true), "image/png"],
    accion: [`${root}/evidencia-accion.png`, image(store.id + 10, true), "image/png"],
    municipal: [`${root}/certificado-municipal.pdf`, pdf(`Certificado municipal - ${store.nombre}`, ["Documento demostrativo", "Emision: 01/09/2026", "Vencimiento: 01/09/2027", "Estado: vigente"]) , "application/pdf"],
  };
  for (const [key, [path, data, type]] of Object.entries(entries)) { await upload(path, data, type); files.set(`${store.id}-${key}`, path); }
}

const existingVisits = await request("visitas_zonales?select=id,tienda_id,periodo&periodo=eq.Septiembre%202026%20%C2%B7%20Control%20integral");
const visitByStore = new Map(existingVisits.map((row) => [row.tienda_id, row]));
for (const store of stores) {
  if (!visitByStore.has(store.id)) {
    const [visit] = await insert("visitas_zonales", [{ tienda_id: store.id, jefe_zonal_id: zonalByCluster.get(store.cluster_id), fecha: `2026-09-${String(10 + store.id).padStart(2,"0")}`, periodo: "Septiembre 2026 · Control integral", puntaje: 78 + store.id * 3, checklist_path: files.get(`${store.id}-checklist`), checklist_nombre: `Checklist_${store.nombre.replaceAll(" ","_")}.pdf`, observacion_general: "Operación estable. Se identificaron oportunidades en exhibición, señalización y orden documental." }], true);
    visitByStore.set(store.id, visit);
  } else await patch("visitas_zonales", visitByStore.get(store.id).id, { checklist_path: files.get(`${store.id}-checklist`), checklist_nombre: `Checklist_${store.nombre.replaceAll(" ","_")}.pdf` });
}

const existingObs = await request("observaciones_zonales?select=id,visita_id,area_item&comentario=like.%5BDEMO%20REALISTA%5D%25");
for (const store of stores) {
  const visit = visitByStore.get(store.id); const existingKeys = new Set(existingObs.filter((row) => row.visita_id === visit.id).map((row) => row.area_item));
  const templates = [
    ["Visual merchandising", "alta", "Corregir la exhibición de productos de campaña y liberar el pasillo principal.", "en_validacion"],
    ["Seguridad", "media", "Actualizar la señalización de la ruta de evacuación cercana a caja.", "levantada"],
    ["Documentación", "urgente", "Regularizar el archivo físico de certificados y responsables vigentes.", "en_proceso"],
  ];
  const rows = templates.filter(([area]) => !existingKeys.has(area)).map(([area_item, prioridad, descripcion, estado], index) => ({ visita_id: visit.id, tienda_id: store.id, area_item, prioridad, fecha_limite: `2026-09-${22 + index}`, descripcion, accion_solicitada: "Corregir, documentar el cambio y remitir evidencia al jefe zonal.", evidencia_inicial_path: files.get(`${store.id}-inicial`) ?? null, evidencia_inicial_nombre: `hallazgo_${index + 1}.png`, estado, accion_realizada: estado === "en_proceso" ? "Coordinación en curso con el equipo responsable." : "Se corrigió el punto observado y se capacitó al turno de cierre.", evidencia_cierre_path: estado === "en_proceso" ? null : (files.get(`${store.id}-cierre`) ?? null), evidencia_cierre_nombre: estado === "en_proceso" ? null : `cierre_${index + 1}.png`, soporte_requerido: prioridad === "urgente", comentario: "[DEMO REALISTA] Seguimiento documentado de supervisión zonal.", validado_por: estado === "levantada" ? (zonalByCluster.get(store.cluster_id) ?? null) : null, comentario_validacion: estado === "levantada" ? "Evidencia revisada. Corrección conforme." : null, fecha_validacion: estado === "levantada" ? "2026-09-21T15:30:00-05:00" : null }));
  await insert("observaciones_zonales", rows);
}

const municipal = await request("documentos_municipales?select=id,tienda_id,codigo&codigo=like.DEMO-AGO-%25");
for (const row of municipal) await patch("documentos_municipales", row.id, { archivo_path: files.get(`${row.tienda_id}-municipal`), archivo_nombre: `${row.codigo}.pdf` });
const claims = await request("reclamaciones_tienda?select=id,tienda_id,codigo_hoja&codigo_hoja=like.DEMO-AGO-%25");
for (const row of claims) await patch("reclamaciones_tienda", row.id, { archivo_path: files.get(`${row.tienda_id}-acta`), archivo_nombre: `sustento_${row.codigo_hoja}.pdf` });
const actions = await request("acciones_tienda?select=id,tienda_id,accion&accion=like.%5BDEMO%20AGO%202026%5D%25");
for (const row of actions) await patch("acciones_tienda", row.id, { evidencia_path: files.get(`${row.tienda_id}-accion`), evidencia_nombre: `evidencia_accion_${row.id}.png` });
const improvements = await request("mejoras_continuas?select=id,tienda_id&que_mejoro=like.%5BDEMO%20AGO%202026%5D%25");
for (const row of improvements) await patch("mejoras_continuas", row.id, { foto_antes_path: files.get(`${row.tienda_id}-inicial`), foto_antes_nombre: "antes.png", foto_despues_path: files.get(`${row.tienda_id}-cierre`), foto_despues_nombre: "despues.png" });

const existingReq = await request("requerimientos_tienda?select=tienda_id,requerimiento&comentario=eq.%5BDEMO%20REALISTA%20SEP%202026%5D");
const reqKeys = new Set(existingReq.map((row) => `${row.tienda_id}-${row.requerimiento}`));
const reqTemplates = [
  ["Reposición de señalética de seguridad", 8, ["Seguridad","Operaciones"], "urgente", "en_proceso"],
  ["Mantenimiento preventivo de luminarias", 12, ["Mantenimiento"], "corto_plazo", "pendiente"],
  ["Material gráfico para campaña comercial", 25, ["Marketing","Ventas"], "mediano_plazo", "atendido"],
];
const requirements = stores.flatMap((store) => reqTemplates.map(([requerimiento,cantidad,areas_responsables,urgencia,estado], index) => ({ tienda_id: store.id, requerimiento, cantidad, areas_responsables, urgencia, fecha_inicio: `2026-09-${14 + index}`, fecha_fin_objetivo: `2026-09-${24 + index}`, estado, evidencia_path: files.get(`${store.id}-${index === 0 ? "accion" : "acta"}`), evidencia_nombre: index === 0 ? "evidencia.png" : "sustento.pdf", comentario: "[DEMO REALISTA SEP 2026]", creado_por: registrar.get(store.id) })).filter((row) => !reqKeys.has(`${row.tienda_id}-${row.requerimiento}`)));
await insert("requerimientos_tienda", requirements);

const zonalIncidents = await request("incidencias_zonales?select=id,jefe_zonal_id,descripcion&descripcion=like.%5BDEMO%20REALISTA%5D%25");
const zonalKeys = new Set(zonalIncidents.map((row) => `${row.jefe_zonal_id}-${row.descripcion}`));
const zonalRows = clusters.flatMap((cluster) => {
  const assigned = stores.filter((store) => store.cluster_id === cluster.id); if (!cluster.jefe_zonal_id || !assigned.length) return [];
  return [
    { jefe_zonal_id: cluster.jefe_zonal_id, tipo: "diferencia_transferencia", alcance: "entre_tiendas", tienda_origen_id: assigned[0].id, tienda_afectada_id: assigned.at(-1).id, fecha: "2026-09-17", descripcion: "[DEMO REALISTA] Diferencia de dos unidades en transferencia, regularizada con guía y conteo conjunto.", estado: "cerrada", responsable_seguimiento: "Jefatura zonal", evidencia_path: files.get(`${assigned[0].id}-acta`), evidencia_nombre: "acta_transferencia.pdf" },
    { jefe_zonal_id: cluster.jefe_zonal_id, tipo: "proveedor", alcance: "varias_tiendas", tienda_origen_id: assigned[0].id, tienda_afectada_id: assigned.at(-1).id, fecha: "2026-09-20", descripcion: "[DEMO REALISTA] Retraso del proveedor de material POP con impacto en el inicio de campaña.", estado: "en_seguimiento", responsable_seguimiento: "Jefatura zonal", evidencia_path: files.get(`${assigned.at(-1).id}-acta`), evidencia_nombre: "comunicacion_proveedor.pdf" },
  ];
}).filter((row) => !zonalKeys.has(`${row.jefe_zonal_id}-${row.descripcion}`));
await insert("incidencias_zonales", zonalRows);

console.log(JSON.stringify({ tiendas: stores.length, archivos_subidos: files.size, visitas_con_checklist: visitByStore.size, observaciones_nuevas: stores.length * 3 - existingObs.length, requerimientos_nuevos: requirements.length, incidencias_zonales_nuevas: zonalRows.length, documentos_con_pdf: municipal.length, reclamos_con_pdf: claims.length, acciones_con_imagen: actions.length, mejoras_con_antes_despues: improvements.length }, null, 2));
