// A PostgREST fixture: every request to the test database stays in memory.
export function supportFixture() {
  return {
    usuarios: [
      { id: 1, nombres: "Zonal", apellidos: "Lima", usuario: "ZONAL", rol: "jefe_zonal", estado: "activo", tienda_id: null },
      { id: 2, nombres: "Ana", apellidos: "Torres", dni: "12345678", usuario: "ALF", password: "test-only", rol: "jefe_tienda", estado: "activo", tienda_id: 10 },
      { id: 3, nombres: "Luis", apellidos: "Perez", dni: "87654321", usuario: "MAR", rol: "jefe_tienda", estado: "activo", tienda_id: 20 },
      { id: 4, nombres: "Juan", apellidos: "Soto", dni: "45678912", usuario: "IND", rol: "jefe_tienda", estado: "activo", tienda_id: 30 },
      { id: 5, nombres: "Personal", apellidos: "Principal", rol: "vendedor", estado: "activo", tienda_id: 10 },
      { id: 6, nombres: "Personal", apellidos: "Apoyo", rol: "vendedor", estado: "activo", tienda_id: 20 },
    ],
    tiendas: [
      { id: 10, nombre: "ALFONSO UGARTE", estado: "activo", cluster_id: 100, direccion: "Dirección principal" },
      { id: 20, nombre: "MARISCAL", estado: "activo", cluster_id: 100, direccion: "Dirección apoyo" },
      { id: 30, nombre: "INDEPENDENCIA", estado: "activo", cluster_id: 200 },
    ],
    clusters: [{ id: 100, jefe_zonal_id: 1, codigo: "A", estado: "activo" }],
    apoyos_administradores_tienda: [],
    commercial_store_map: [
      { tienda_id: 10, dashboard_store_id: "T010", cluster_code: "A" },
      { tienda_id: 20, dashboard_store_id: "T020", cluster_code: "A" },
      { tienda_id: 30, dashboard_store_id: "T030", cluster_code: "B" },
    ],
    commercial_user_scopes: [{ usuario_id: 2, scope_type: "store", scope_value: "T010" }],
  };
}

export function memoryPostgrest(tables, fallbackFetch = globalThis.fetch) {
  return async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    if (url.hostname !== "store-support.invalid") return fallbackFetch(input, init);
    const name = url.pathname.split("/").at(-1);
    const data = tables[name] || (tables[name] = []);
    const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json", "Content-Range": `0-${Math.max(0, data.length - 1)}/${data.length}` } });
    const matches = row => [...url.searchParams].every(([key, filter]) => {
      if (["select", "order", "limit", "offset"].includes(key)) return true;
      const [op, ...rest] = filter.split("."); const value = rest.join(".");
      if (op === "eq") return String(row[key]) === value;
      if (op === "in") return value.slice(1, -1).split(",").includes(String(row[key]));
      return true;
    });
    let rows = data.filter(matches);
    const method = init.method || "GET";
    if (method === "POST") {
      const body = JSON.parse(init.body);
      if (name === "apoyos_administradores_tienda" && data.some(row => row.usuario_id === body.usuario_id && row.tienda_id === body.tienda_id)) return response({ code: "23505", message: "duplicate" }, 409);
      const row = { id: Math.max(0, ...data.map(row => row.id || 0)) + 1, created_at: new Date().toISOString(), ...body };
      data.push(row); rows = [row];
    }
    if (method === "PATCH") { const body = JSON.parse(init.body); rows.forEach(row => Object.assign(row, body)); }
    const header = new Headers(init.headers);
    const offset = Number(url.searchParams.get("offset") || 0);
    const limit = Number(url.searchParams.get("limit") || rows.length);
    rows = rows.slice(offset, offset + limit);
    if (header.get("accept")?.includes("vnd.pgrst.object")) {
      if (!rows.length) return response({ code: "PGRST116", details: "The result contains 0 rows" }, 406);
      return response(rows[0], method === "POST" ? 201 : 200);
    }
    return response(rows, method === "POST" ? 201 : 200);
  };
}
