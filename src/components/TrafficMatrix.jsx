import { useEffect, useState } from "react";
import { api, formatDate, todayISO } from "../lib/api";
import { Loading, Notice } from "./UI";
import "./traffic-matrix.css";

export default function TrafficMatrix({ ranges, onSaved }) {
  const [fecha] = useState(todayISO);
  const [records, setRecords] = useState(null);
  const [drafts, setDrafts] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setRecords(null);
    api(`/trafico?desde=${fecha}&hasta=${fecha}`, { signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setRecords(Object.fromEntries(data.map(row => [row.rango_hora, row]))); })
      .catch(err => { if (!controller.signal.aborted) setError(err.message); });
    return () => controller.abort();
  }, [fecha, attempt]);
  const value = range => drafts[range] ?? { cantidad: String(records?.[range]?.cantidad ?? ""), observaciones: records?.[range]?.observaciones || "" };
  const change = (range, field, next) => setDrafts(current => ({ ...current, [range]: { ...value(range), [field]: next } }));
  const changed = ranges.filter(({ value: range }) => drafts[range] && (drafts[range].cantidad !== String(records?.[range]?.cantidad ?? "") || drafts[range].observaciones !== (records?.[range]?.observaciones || "")));
  const total = ranges.reduce((sum, range) => sum + (Number(value(range.value).cantidad) || 0), 0);
  const save = async event => {
    event.preventDefault();
    if (saving || !changed.length) return;
    if (fecha !== todayISO()) { setError("Cambió el día. Recarga la página para registrar hoy."); return; }
    const registros = changed.map(({ value: range }) => ({ rango_hora: range, ...value(range) }));
    if (registros.some(row => row.cantidad.trim() === "" || !Number.isSafeInteger(Number(row.cantidad)) || Number(row.cantidad) < 0)) {
      setError("Escribe un número entero de visitantes en las filas modificadas. Usa 0 si no hubo visitantes."); return;
    }
    setSaving(true); setError(""); setSuccess("");
    try {
      const saved = await api("/trafico", { method: "POST", body: { fecha, registros } });
      setRecords(current => ({ ...current, ...Object.fromEntries(saved.map(row => [row.rango_hora, row])) }));
      setDrafts({}); setSuccess("Tráfico guardado correctamente.");
      await onSaved();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  };
  if (!records) return error ? <Notice type="error">{error} <button className="button button--ghost" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></Notice> : <Loading />;
  return <form onSubmit={save} className="traffic-matrix">
    <p>Fecha: <strong>{formatDate(fecha)}</strong>. Completa los horarios contados; deja vacíos los pendientes.</p>
    {success && <Notice type="success">{success}</Notice>}
    {error && <Notice type="error">{error}</Notice>}
    <div className="traffic-matrix__scroll"><table>
      <colgroup><col className="traffic-matrix__hours"/><col className="traffic-matrix__count"/></colgroup>
      <thead><tr><th scope="col">Horario</th><th scope="col">Visitantes</th></tr></thead>
      <tbody>{ranges.map(range => <tr key={range.value}>
        <th scope="row"><span className="traffic-matrix__full-hour">{range.label}</span><span className="traffic-matrix__short-hour">{range.value.replace("-", "–")}</span></th>
        <td><input aria-label={`Visitantes ${range.label}`} type="number" inputMode="numeric" min="0" step="1" disabled={saving} value={value(range.value).cantidad} placeholder="Pendiente" onChange={event => change(range.value, "cantidad", event.target.value)} /></td>
      </tr>)}</tbody>
      <tfoot><tr><th scope="row">Total del día</th><td><strong>{total.toLocaleString("es-PE")}</strong></td></tr></tfoot>
    </table></div>
    <div className="form-actions"><button type="submit" className="button button--primary" disabled={saving || !changed.length}>{saving ? "Guardando…" : "Guardar tráfico"}</button></div>
  </form>;
}
