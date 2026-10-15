import { useCallback, useEffect, useMemo, useState } from "react";
import { FileSpreadsheet, HardDriveUpload } from "lucide-react";
import { api, formatDateTime, todayISO } from "../lib/api";
import { Notice, PageHeader } from "../components/UI";
import UploadPicker from "../components/UploadPicker";
import { COMMERCIAL_BATCH_MAX_BYTES, COMMERCIAL_BATCH_SOURCES } from "../../shared/commercialBatch.js";
import { SYSTEM_UPLOAD_MAX_BYTES, validateSystemUpload } from "../../shared/systemUpload.js";
import "./system-uploads.css";

function cutoffOptions() {
  const today = todayISO();
  const [year, month] = today.split("-").map(Number);
  const values = [today];
  for (let offset = 0; offset < 18; offset += 1) {
    const last = new Date(Date.UTC(year, month - offset, 0)).toISOString().slice(0, 10);
    if (last <= today && !values.includes(last)) values.push(last);
  }
  return values.sort().reverse();
}

async function checkSignature(file, extension) {
  const head = String.fromCharCode(...new Uint8Array(await file.slice(0, 4).arrayBuffer()));
  if (extension === ".parquet") {
    const tail = String.fromCharCode(...new Uint8Array(await file.slice(-4).arrayBuffer()));
    if (head !== "PAR1" || tail !== "PAR1") throw new Error(`${file.name} no es un Parquet válido.`);
  } else if (head !== "PK\x03\x04") throw new Error(`${file.name} no es un Excel .xlsx válido.`);
}

export default function RmsBatchUpload() {
  const options = useMemo(cutoffOptions, []);
  const [cutoff, setCutoff] = useState(options[1] || options[0]);
  const [files, setFiles] = useState({});
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const ready = COMMERCIAL_BATCH_SOURCES.every(item => files[item.id]);

  const refresh = useCallback(async () => {
    try { setBatches((await api("/systems/batches")).batches || []); }
    catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError(""); setMessage("");
    if (!ready) { setError("Selecciona los cuatro archivos RMS."); return; }
    const receipts = [];
    let completed = false;
    try {
      const selected = COMMERCIAL_BATCH_SOURCES.map(item => {
        const file = files[item.id];
        return { source: item.id, file, validated: validateSystemUpload({ source: item.id, fileName: file.name, fileSize: file.size }) };
      });
      if (selected.reduce((total, item) => total + item.file.size, 0) > COMMERCIAL_BATCH_MAX_BYTES) {
        throw new Error("El lote completo no debe superar 300 MB. Divide o comprime los archivos de origen.");
      }
      await Promise.all(selected.map(item => checkSignature(item.file, item.validated.extension)));
      setBusy(true); setProgress(0);
      const batchId = crypto.randomUUID();
      const totalParts = selected.reduce((total, item) => total + item.validated.chunks, 0);
      let uploadedParts = 0;
      for (const { source, file } of selected) {
        const session = await api("/systems/batches/start", {
          method: "POST", body: { batchId, cutoff, source, fileName: file.name, fileSize: file.size },
        });
        receipts.push(session.receipt);
        for (let index = 0; index < session.parts.length; index += 1) {
          const chunk = file.slice(index * session.chunkSize, (index + 1) * session.chunkSize);
          const payload = new FormData();
          payload.append("cacheControl", "3600");
          payload.append("", chunk, `part-${index}.bin`);
          const response = await fetch(session.parts[index], { method: "PUT", body: payload });
          if (!response.ok) throw new Error(`No se pudo enviar ${file.name}, parte ${index + 1}.`);
          uploadedParts += 1;
          setProgress(Math.round(uploadedParts / totalParts * 100));
        }
      }
      await api("/systems/batches/complete", { method: "POST", body: { receipts } });
      completed = true;
      setMessage("Lote recibido. La fecha de corte y los cuatro archivos quedaron registrados; aún falta procesar y publicar la actualización.");
      setFiles({});
      form.reset();
      await refresh();
    } catch (failure) {
      if (receipts.length && !completed) await api("/systems/batches/cancel", { method: "POST", body: { receipts } }).catch(() => {});
      setError(failure.message || "No se pudo completar el lote.");
    } finally { setBusy(false); }
  }

  return <div className="system-uploads commercial-batch">
    <PageHeader eyebrow="Sistemas" title="Actualización de datos RMS" />
    {error && <Notice type="error" onClose={() => setError("")}>{error}</Notice>}
    {message && <Notice onClose={() => setMessage("")}>{message}</Notice>}
    <form className="system-uploads__card" onSubmit={submit}>
      <div className="system-uploads__heading"><HardDriveUpload size={23}/><h2>Lote comercial</h2></div>
      <div className="commercial-batch__fields">
        {COMMERCIAL_BATCH_SOURCES.map(item => <div className="system-uploads__field" key={item.id}><span>{item.label}</span>
          <UploadPicker label={`Cargar ${item.label}`} file={files[item.id]} accept=".xlsx,.parquet" disabled={busy}
            onChange={file => setFiles(previous => ({ ...previous, [item.id]: file }))}/>
        </div>)}
        <label className="system-uploads__field">Fecha de corte
          <select value={cutoff} disabled={busy} onChange={event => setCutoff(event.target.value)}>
            {options.map(value => <option value={value} key={value}>{value.split("-").reverse().join("/")}</option>)}
          </select>
        </label>
      </div>
      <p className="system-uploads__hint">Archivos Excel o Parquet; máximo {Math.round(SYSTEM_UPLOAD_MAX_BYTES / 1024 / 1024)} MB por archivo y {Math.round(COMMERCIAL_BATCH_MAX_BYTES / 1024 / 1024)} MB por lote.</p>
      {busy && <div className="system-uploads__progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><div style={{ width: `${progress}%` }}/></div>}
      <button className="button button--primary" type="submit" disabled={busy || !ready}>{busy ? `Cargando ${progress}%…` : "Cargar / preparar actualización"}</button>
      <p className="system-uploads__hint">El dashboard conserva su versión publicada hasta completar la normalización y la validación del nuevo lote.</p>
    </form>
    <section className="system-uploads__card system-uploads__history">
      <div className="system-uploads__heading"><FileSpreadsheet size={22}/><h2>Lotes recibidos</h2></div>
      {loading ? <p>Cargando…</p> : batches.length ? <div className="system-uploads__table-wrap"><table>
        <thead><tr><th>Fecha de corte</th><th>Fuentes</th><th>Recibido</th><th>Estado</th></tr></thead>
        <tbody>{batches.map(batch => <tr key={batch.id}><td>{batch.cutoff}</td><td>{batch.files.map(file => file.source).join(" · ")}</td><td>{formatDateTime(batch.receivedAt)}</td><td>Por procesar</td></tr>)}</tbody>
      </table></div> : <p className="system-uploads__empty">Aún no hay lotes recibidos.</p>}
    </section>
  </div>;
}
