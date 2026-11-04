import { useEffect, useMemo, useState } from "react";
import { Save, Upload, Download } from "lucide-react";
import { GOAL_MONTHS, parseGoalMatrix } from '../lib/commercialGoalImport';
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
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [preview, setPreview] = useState(null);
  const [totalDraft, setTotalDraft] = useState(null);

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

  useEffect(() => { if (data) setValues(valuesFor(data, rubro)); setPreview(null); setTotalDraft(null); }, [rubro, data]);

  const stores = useMemo(() => data?.stores || [], [data]);
  const clusters = useMemo(() => [...new Set(stores.map((store) => store.cluster).filter(Boolean))].sort(), [stores]);
  const visibleStores = useMemo(() => stores.filter((store) =>
    (cluster === "todos" || store.cluster === cluster)
    && [store.nombre, store.codigo, store.cluster].join(" ").toLowerCase().includes(search.toLowerCase())),
  [stores, cluster, search]);
  const valueOf = (storeId, month) => values[`${storeId}|${month}`] ?? "";
  const setValue = (storeId, month, value) => {
    const key = `${storeId}|${month}`;
    setValues(current => ({ ...current, [key]:value }));
    if (!rubro) setTotalDraft(current => ({ ...current, [key]:value }));
  };
  const rowTotal = (storeId) => MONTHS.reduce((sum, _, index) => sum + (Number(valueOf(storeId, index + 1)) || 0), 0);
  const monthTotals = MONTHS.map((_, index) => stores.reduce((sum, store) => sum + (Number(valueOf(store.id, index + 1)) || 0), 0));
  const matrixTotal = monthTotals.reduce((sum, value) => sum + value, 0);
  const historical = year <= 2025;
  const automaticScope = !rubro;
  const readOnly = historical;
  const noTotalChanges = automaticScope && !Object.keys(totalDraft || {}).length;

  const template = async () => {
    try {
      const { default: ExcelJS } = await import('exceljs');
      const book = new ExcelJS.Workbook(), sheet = book.addWorksheet('Metas');
      sheet.addRow(['TIENDA', ...GOAL_MONTHS]); stores.forEach(s => sheet.addRow([s.codigo || s.nombre]));
      sheet.getRow(1).font = { bold:true }; sheet.getColumn(1).width = 28;
      const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const link = document.createElement('a'); link.href = url; link.download = `Plantilla_metas_${year}_${rubro || 'rubro'}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { setNotice({ type:'error', text:error.message }); }
  };
  const importFile = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file || historical || loading || busy) return;
    setPreview(null); setImporting(true); setNotice(null);
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size > 5 * 1024 * 1024) throw new Error('Selecciona un archivo .xlsx de hasta 5 MB.');
      const { default: ExcelJS } = await import('exceljs'); const book = new ExcelJS.Workbook();
      await book.xlsx.load(await file.arrayBuffer()); const sheet = book.worksheets[0];
      if (!sheet || sheet.rowCount > 1001) throw new Error('La primera hoja debe contener hasta 1,000 filas.');
      const rows = [];
      for (let r = 1; r <= sheet.rowCount; r++) { const row = []; for (let c = 1; c <= Math.min(sheet.columnCount, 40); c++) row.push(sheet.getRow(r).getCell(c).value); rows.push(row); }
      const parsed = parseGoalMatrix(rows, stores);
      if (parsed.year && parsed.year !== year) throw new Error(`Este archivo corresponde a ${parsed.year}. Selecciona ese año antes de importarlo.`);
      if (parsed.totalScope && rubro) throw new Error('CUOTA TIENDAS contiene cuotas totales. Selecciona Cuota total en Alcance para importarlo.');
      setPreview({ ...parsed, year, rubro, name:file.name });
    } catch (error) { setNotice({ type:'error', text:error.message }); }
    finally { setImporting(false); }
  };

  const save = async () => {
    if (readOnly || noTotalChanges || busy || loading || importing) return;
    setBusy(true); setNotice(null);
    try {
      const metas = automaticScope ? Object.entries(totalDraft || {}).map(([key, value]) => { const [store, month] = key.split('|'); return {tienda_id:Number(store), mes:Number(month), meta_venta:value}; }) : stores.flatMap((store) => MONTHS.map((_, index) => ({
        tienda_id: store.id, mes: index + 1, meta_venta: valueOf(store.id, index + 1),
      })));
      if (automaticScope && metas.some(row => row.meta_venta === '' || !Number.isFinite(Number(row.meta_venta)) || Number(row.meta_venta) < 0)) throw new Error('Completa las cuotas editadas con un monto válido. Usa 0 si la meta es cero.');
      const result = await api("/commercial-goals", {
        method: "PUT", body: { anio: year, rubro, metas, importacion_total:automaticScope },
      });
      setData(result); setValues(valuesFor(result, rubro)); setAnnualTarget(String(result.meta_anual ?? ""));
      setNotice({ type: "success", text: `Metas ${rubro ? `de ${rubro}` : "totales"} guardadas y conectadas con el dashboard comercial.` });
    } catch (error) { setNotice({ type: "error", text: error.message }); }
    finally { setBusy(false); }
  };

  return <section className="commercial-goals-page" style={{ "--primary": "var(--gold)", "--surface-soft": "color-mix(in srgb, var(--surface) 88%, var(--gold))" }}>
    <PageHeader eyebrow="Gerencia comercial" title="Metas comerciales" action={<div style={{display:'flex', gap:8, flexWrap:'wrap'}}><button className="button button--ghost" disabled={historical || busy || importing || loading} onClick={() => setImportOpen(v => !v)}><Upload size={17}/>Importar Excel</button><button className="button button--primary" disabled={busy || importing || loading || readOnly || noTotalChanges} onClick={save}><Save size={17}/>{busy ? "Guardando…" : readOnly ? "Solo lectura" : "Guardar metas"}</button></div>} />
    {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}
    {importOpen && <section className="panel" aria-label="Importar metas desde Excel" style={{padding:20, marginBottom:16, display:'grid', gap:12}}>
      <strong>Importar metas · {year} · {rubro || 'Cuotas totales'}</strong>
      <p>Primera hoja: TIENDA y ENE a DIC. Las celdas vacías conservan las metas actuales; cero reemplaza la meta por 0. Revisa la matriz y pulsa Guardar metas para registrarla.</p>
      <div style={{display:'flex', gap:12, flexWrap:'wrap', alignItems:'center'}}><button className="button button--ghost" disabled={loading || importing} onClick={template}><Download size={17}/>Descargar plantilla</button><label><span>{importing ? 'Validando…' : 'Seleccionar Excel'}</span><input type="file" accept=".xlsx" aria-label="Archivo Excel de metas" disabled={historical || busy || importing || loading} onChange={importFile}/></label></div>
      {preview && preview.year === year && preview.rubro === rubro && <div><p><strong>{preview.name}</strong>: {preview.storeCount} tiendas, {preview.count} metas · Suma a importar: {money(preview.total)}.</p><button className="button button--primary" disabled={historical || busy || importing} onClick={() => { if (automaticScope) setTotalDraft(current => ({...current, ...preview.patch})); setValues(current => ({...current, ...preview.patch})); setPreview(null); setImportOpen(false); setNotice({type:'success', text:'Metas cargadas en la matriz. Revisa los valores y pulsa Guardar metas para confirmar.'}); }}>Aplicar a la matriz</button> <button className="button button--ghost" onClick={() => setPreview(null)}>Cancelar importación</button></div>}
    </section>}

    <section className="commercial-goals-controls panel">
      <label><span>Año</span><select value={year} onChange={(event) => { const nextYear = Number(event.target.value); setYear(nextYear); if (nextYear <= 2025) setRubro(""); }}>{Array.from({ length: currentYear + 6 - 2024 }, (_, index) => 2024 + index).map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
      <label><span>Alcance</span><select value={rubro} onChange={(event) => setRubro(event.target.value)} disabled={historical}><option value="">Cuota total</option><option value="TEXTIL">Rubro · TEXTIL</option><option value="CALZADO">Rubro · CALZADO</option></select></label>
      {!rubro && <label className="commercial-goals-annual"><span>Meta anual corporativa · calculada</span><output>{money(annualTarget)}</output></label>}
      <p className="commercial-goals-mode">{historical ? `${year} es un año histórico: sus metas se pueden consultar, pero no modificar.` : automaticScope ? "Puedes editar las cuotas totales directamente y pulsar Guardar metas. Solo se guardan las celdas modificadas; usa 0 para una meta cero. Las cuotas explícitas tienen prioridad sobre el desglose por rubro." : `Editando únicamente las metas de ${rubro}.`}</p>
    </section>

    <div className="commercial-goals-summary" aria-label="Resumen del plan">
      <article><small>{rubro ? `Meta anual · ${rubro}` : "Suma anual"}</small><strong>{money(matrixTotal)}</strong></article>
      <article><small>Tiendas</small><strong>{stores.length}</strong></article>
      <article><small>Modo</small><strong>{historical ? "Histórico" : "Editable"}</strong></article>
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
              {MONTHS.map((month, index) => <td key={month}><div className={`commercial-goals-cell ${readOnly ? "is-readonly" : ""}`}><span>S/</span><input type="number" min="0" step="0.01" inputMode="decimal" aria-label={`${store.nombre}, ${month}`} value={valueOf(store.id, index + 1)} onChange={(event) => setValue(store.id, index + 1, event.target.value)} placeholder="0" readOnly={readOnly} disabled={busy || importing || loading} /></div></td>)}
              <td className="commercial-goals-total">{money(rowTotal(store.id))}</td>
            </tr>)}
          </tbody>
          <tfoot><tr><th>Total red</th>{monthTotals.map((total, index) => <td key={MONTHS[index]}>{money(total)}</td>)}<td>{money(matrixTotal)}</td></tr></tfoot>
        </table>
      </div>
    </section>}
  </section>;
}
