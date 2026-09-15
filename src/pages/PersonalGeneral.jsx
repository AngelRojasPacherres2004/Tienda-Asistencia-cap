import { useEffect, useMemo, useState } from "react";
import { UsersRound } from "lucide-react";
import { api, formatDate } from "../lib/api";
import { EmptyState, Loading, Notice, PageHeader, SearchInput, StatusBadge } from "../components/UI";

const roles = { gerente_comercial: "Gerente comercial", gerente: "Gerente comercial", jefe_zonal: "Jefe zonal", jefe_tienda: "Administrador de tienda", administrador_tienda: "Administrador de tienda", trabajador: "Empleado", empleado: "Empleado", vendedor: "Vendedor", seguridad: "Seguridad", coach: "Coach", asistente_tienda: "Empleado" };

export default function PersonalGeneral() {
  const [items, setItems] = useState(null); const [search, setSearch] = useState(""); const [error, setError] = useState("");
  useEffect(() => { api("/usuarios?alcance=organizacion").then(setItems).catch((e) => setError(e.message)); }, []);
  const rows = useMemo(() => (items || []).filter((x) => `${x.nombres} ${x.apellidos} ${x.dni} ${x.tienda_nombre || ""} ${roles[x.rol] || x.rol}`.toLowerCase().includes(search.toLowerCase())), [items, search]);
  return <><PageHeader eyebrow="Organización" title="Personal" subtitle="Consulta general de cargos, tienda actual, ingresos, traslados y salidas. Sin registro de asistencia ni amonestaciones." />{error && <Notice type="error">{error}</Notice>}<div className="toolbar"><SearchInput value={search} onChange={setSearch} placeholder="Buscar nombre, DNI, cargo o tienda…" /><span>{rows.length} personas</span></div>{!items ? <Loading /> : rows.length ? <div className="table-panel"><div className="data-table data-table--personal-general"><div className="data-table__head"><span>Persona</span><span>DNI</span><span>Cargo</span><span>Tienda actual</span><span>Ingreso</span><span>Salida</span><span>Estado</span></div>{rows.map((x) => <div className="data-table__row" key={x.id}><div className="person-cell"><span className="avatar">{x.nombres.charAt(0)}</span><strong>{x.nombres} {x.apellidos}</strong></div><span className="mono">{x.dni}</span><span>{roles[x.rol] || x.rol}</span><span>{x.tienda_nombre || "Corporativo"}</span><span>{formatDate(x.fecha_ingreso)}</span><span>{formatDate(x.fecha_salida)}</span><StatusBadge value={x.estado} /></div>)}</div></div> : <EmptyState icon={UsersRound} title="Sin personal" text="No hay resultados para esta búsqueda." />}</>;
}
