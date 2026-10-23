import { useEffect, useMemo, useState } from "react";
import { Save } from "lucide-react";
import { api } from "../lib/api";
import { Loading, Notice, PageHeader, SearchInput } from "../components/UI";

const MONTHS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const money = (value) => new Intl.NumberFormat("es-PE", {
  style: "currency", currency: "PEN", maximumFractionDigits: 0,
}).format(Number(value) || 0);

function valuesFor(data, rubro) {
  const values = {};
  for (const goal of data?.metas || []) {
    if (String(goal.rubro || "") !== rubro) continue;
    values[`${goal.tienda_id}|${goal.mes}`] = String(goal.meta_venta ?? "");
  }
  return values;
}

export default function MetasComerciales() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [data, setData] = useState(null);
  const [rubro, setRubro] = useState("");
  const [values, setValues] = useState({});
  const [annualTarget, setAnnualTarget] = useState("");
  const [search, setSearch] = useState("");
  const [cluster, setCluster] = useState("todos");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true); setNotice(null);
    api(`/commercial-goals?anio=${year}`).then((result) => {
      if (!active) return;
      setData(result); setAnnualTarget(String(result.meta_anual ?? ""));
    }).catch((error) => active && setNotice({ type: "error", text: error.message }))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [year]);

  useEffect(() => { if (data) setValues(valuesFor(data, rubro)); }, [rubro, data]);

  const stores = useMemo(() => data?.stores || [], [data]);
  const clusters = useMemo(() => [...new Set(stores.map((store) => store.cluster).filter(Boolean))].sort(), [stores]);
  const visibleStores = useMemo(() => stores.filter((store) =>
    (cluster === "todos" || store.cluster === cluster)
    && [store.nombre, store.codigo, store.cluster].join(" ").toLowerCase().includes(search.toLowerCase())),
  [stores, cluster, search]);
  const valueOf = (storeId, month) => values[`${storeId}|${month}`] ?? "";
  const setValue = (storeId, month, value) => setValues((current) => ({ ...current, [`${storeId}|${month}`]: value }));
  const rowTotal = (storeId) => MONTHS.reduce((sum, _, index) => sum + (Number(valueOf(storeId, index + 1)) || 0), 0);
  const monthTotals = MONTHS.map((_, index) => stores.reduce((sum, store) => sum + (Number(valueOf(store.id, index + 1)) || 0), 0));
  const matrixTotal = monthTotals.reduce((sum, value) => sum + value, 0);
  const difference = !rubro && annualTarget !== "" ? matrixTotal - Number(annualTarget) : null;

  const save = async () => {
    setBusy(true); setNotice(null);
    try {
      const metas = stores.flatMap((store) => MONTHS.map((_, index) => ({
        tienda_id: store.id, mes: index + 1, meta_venta: valueOf(store.id, index + 1),
      })));
      const result = await api("/commercial-goals", {
        method: "PUT", body: { anio: year, rubro, meta_anual: rubro ? undefined : annualTarget, metas },
      });
      setData(result); setValues(valuesFor(result, rubro)); setAnnualTarget(String(result.meta_anual ?? ""));
      setNotice({ type: "success", text: `Metas ${rubro ? `de ${rubro}` : "totales"} guardadas y conectadas con el dashboard comercial.` });
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  return <section className="commercial-goals-page" style={{ "--primary": "var(--gold)", "--surface-soft": "color-mix(in srgb, var(--surface) 88%, var(--gold))" }}>
    <PageHeader eyebrow="Gerencia comercial" title="Metas comerciales" action={<button className="button button--primary" disabled={busy || loading} onClick={save}><Save size={17}/>{busy ? "Guardando…" : "Guardar metas"}</button>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

    <section className="commercial-goals-controls panel">
      <label><span>Año</span><select value={year} onChange={(event) => setYear(Number(event.target.value))}>{Array.from({ length: 6 }, (_, index) => currentYear - 1 + index).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <label><span>Alcance</span><select value={rubro} onChange={(event) => setRubro(event.target.value)}><option value="">Total por tienda</option>{(data?.rubros || []).map((item) => <option value={item} key={item}>Rubro · {item}</option>)}</select></label>
      {!rubro && <label className="commercial-goals-annual"><span>Meta anual corporativa</span><div><b>S/</b><input type="number" min="0" step="1000" value={annualTarget} onChange={(event) => setAnnualTarget(event.target.value)} placeholder="0" /></div></label>}
    </section>

    <div className="commercial-goals-summary" aria-label="Resumen del plan">
      <article><small>{rubro ? `Meta anual · ${rubro}` : "Suma anual"}</small><strong>{money(matrixTotal)}</strong></article>
      <article><small>Tiendas</small><strong>{stores.length}</strong></article>
      <article className={difference === null || difference === 0 ? "" : "has-warning"}><small>{difference === null ? "Alcance" : "Diferencia anual"}</small><strong>{difference === null ? (rubro || "Total") : money(difference)}</strong></article>
    </div>

    <div className="commercial-goals-toolbar toolbar">
      <SearchInput value={search} onChange={setSearch} placeholder="Buscar tienda…" />
      <select aria-label="Filtrar por clúster" value={cluster} onChange={(event) => setCluster(event.target.value)}><option value="todos">Todos los clústeres</option>{clusters.map((item) => <option value={item} key={item}>{item}</option>)}</select>
      <span>{visibleStores.length} de {stores.length} tiendas</span>
    </div>

    {loading ? <Loading label="Cargando plan comercial…" /> : <section className="panel commercial-goals-matrix-card" aria-label={rubro ? `Metas mensuales de ${rubro}` : "Metas mensuales por tienda"}>
      <div className="commercial-goals-scroll">
        <table className="commercial-goals-table">
          <thead><tr><th>Tienda</th>{MONTHS.map((month) => <th key={month}>{month}</th>)}<th>Total anual</th></tr></thead>
          <tbody>
            {visibleStores.map((store) => <tr key={store.id}>
              <th><strong>{store.nombre}</strong><small>{store.cluster || "Sin clúster"}{store.estado !== "activo" ? " · Inactiva" : ""}</small></th>
              {MONTHS.map((month, index) => <td key={month}><div className="commercial-goals-cell"><span>S/</span><input type="number" min="0" step="100" inputMode="decimal" aria-label={`${store.nombre}, ${month}`} value={valueOf(store.id, index + 1)} onChange={(event) => setValue(store.id, index + 1, event.target.value)} placeholder="0" /></div></td>)}
              <td className="commercial-goals-total">{money(rowTotal(store.id))}</td>
            </tr>)}
          </tbody>
          <tfoot><tr><th>Total red</th>{monthTotals.map((total, index) => <td key={MONTHS[index]}>{money(total)}</td>)}<td>{money(matrixTotal)}</td></tr></tfoot>
        </table>
      </div>
    </section>}
  </section>;
}
