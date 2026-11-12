import { useCallback, useEffect, useState } from "react";
import { FileSpreadsheet, HardDriveUpload, ShieldCheck } from "lucide-react";
import { api, formatDateTime } from "../lib/api";
import { Notice, PageHeader } from "../components/UI";
import UploadPicker from "../components/UploadPicker";
import {
  COMMERCIAL_BATCH_CORE_SOURCES, COMMERCIAL_BATCH_MAX_BYTES, COMMERCIAL_BATCH_SOURCES,
  isMonthEnd, validateCommercialBatchFile, validateCutoff,
} from "../../shared/commercialBatch.js";
import { SYSTEM_UPLOAD_MAX_BYTES, validateSystemUpload } from "../../shared/systemUpload.js";
import "./system-uploads.css";

const SOURCE_BY_ID = Object.fromEntries(COMMERCIAL_BATCH_SOURCES.map(item => [item.id, item]));

async function checkSignature(file) {
  const head = String.fromCharCode(...new Uint8Array(await file.slice(0, 4).arrayBuffer()));
  const tail = String.fromCharCode(...new Uint8Array(await file.slice(-4).arrayBuffer()));
  if (head !== "PAR1" || tail !== "PAR1") throw new Error(`${file.name} no es un Parquet válido.`);
}

async function sha256(file) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function parseManifest(text) {
  const manifest = JSON.parse(text);
  if (manifest?.schema !== "operacion-mensual-v1") throw new Error("El manifiesto no fue generado por la operación local vigente.");
  validateCutoff(manifest.fechaCorte);
  if (manifest.periodo !== manifest.fechaCorte.replaceAll("-", "").slice(0, 6)) throw new Error("El período y la fecha de corte del manifiesto no coinciden.");
  const closing = isMonthEnd(manifest.fechaCorte);
  if (Boolean(manifest.stockIncluido) !== closing || (closing && manifest.estado !== "CERRADO")) {
    throw new Error("El manifiesto no respeta la regla de Stock para el cierre mensual.");
  }
  const expected = closing ? COMMERCIAL_BATCH_SOURCES : COMMERCIAL_BATCH_CORE_SOURCES;
  const fileIds = Object.keys(manifest.archivos || {}).sort();
  if (fileIds.join("|") !== expected.map(item => item.id).sort().join("|")) {
    throw new Error("El manifiesto no contiene exactamente las fuentes requeridas para su fecha de corte.");
  }
  expected.forEach(item => {
    const file = manifest.archivos[item.id];
    if (!file || file.file !== item.fileName || !Number.isSafeInteger(file.bytes) || !/^[0-9a-f]{64}$/.test(file.sha256 || "")) {
      throw new Error(`La información de ${item.label} en el manifiesto no es válida.`);
    }
  });
  return manifest;
}

export default function RmsBatchUpload() {
  const [manifestFile, setManifestFile] = useState(null);
  const [manifest, setManifest] = useState(null);
  const [files, setFiles] = useState({});
  const [batches, setBatches] = useState([]);
  const [lastProcessed, setLastProcessed] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const expectedSources = manifest?.stockIncluido ? COMMERCIAL_BATCH_SOURCES : COMMERCIAL_BATCH_CORE_SOURCES;
  const cutoff = manifest?.fechaCorte || "";
  const ready = Boolean(manifest) && expectedSources.every(item => files[item.id]);

  const refresh = useCallback(async () => {
    try {
      const history = await api("/systems/batches");
      setBatches(history.batches || []);
      setLastProcessed(history.lastProcessedAt ? { at: history.lastProcessedAt, cutoff: history.lastProcessedCutoff, version: history.lastProcessedVersion } : null);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  async function chooseManifest(file) {
    setError(""); setMessage(""); setFiles({}); setManifestFile(file || null); setManifest(null);
    if (!file) return;
    try { setManifest(parseManifest(await file.text())); }
    catch (failure) { setError(failure.message || "No se pudo leer manifiesto.json."); }
  }

  async function submit(event) {
    event.preventDefault();
    setError(""); setMessage("");
    if (!ready || !manifest) { setError("Selecciona manifiesto.json y todos los Parquet indicados por ese lote."); return; }
    const receipts = [];
    let completed = false;
    try {
      const selected = expectedSources.map(item => {
        const file = files[item.id];
        validateCommercialBatchFile(item.id, file.name, cutoff);
        const expected = manifest.archivos[item.id];
        if (file.size !== expected.bytes) throw new Error(`${item.label} no coincide con el tamaño registrado en manifiesto.json.`);
        return { source: item.id, file, expected, validated: validateSystemUpload({ source: item.id, fileName: file.name, fileSize: file.size }) };
      });
      if (selected.reduce((total, item) => total + item.file.size, 0) > COMMERCIAL_BATCH_MAX_BYTES) throw new Error("El lote completo no debe superar 300 MB.");
      setBusy(true); setProgress(2);
      await Promise.all(selected.map(async item => {
        await checkSignature(item.file);
        if (await sha256(item.file) !== item.expected.sha256) throw new Error(`${SOURCE_BY_ID[item.source].label} no coincide con el checksum del manifiesto.`);
      }));
      const batchId = crypto.randomUUID();
      const totalParts = selected.reduce((total, item) => total + item.validated.chunks, 0);
      let uploadedParts = 0;
      for (const { source, file } of selected) {
        const session = await api("/systems/batches/start", { method: "POST", body: { batchId, cutoff, source, fileName: file.name, fileSize: file.size } });
        receipts.push(session.receipt);
        for (let index = 0; index < session.parts.length; index += 1) {
          const body = new FormData();
          body.append("", file.slice(index * session.chunkSize, (index + 1) * session.chunkSize), `part-${index}.bin`);
          const response = await fetch(session.parts[index], { method: "PUT", body });
          if (!response.ok) throw new Error(`No se pudo enviar ${file.name}, parte ${index + 1}.`);
          uploadedParts += 1; setProgress(Math.round((uploadedParts / totalParts) * 100));
        }
      }
      await api("/systems/batches/complete", { method: "POST", body: { receipts } });
      completed = true;
      setMessage(`Lote ${manifest.periodo} · corte ${cutoff} recibido con ${selected.length} Parquet.`);
      setFiles({}); setManifest(null); setManifestFile(null); event.currentTarget.reset(); await refresh();
    } catch (failure) {
      if (receipts.length && !completed) await api("/systems/batches/cancel", { method: "POST", body: { receipts } }).catch(() => {});
      setError(failure.message || "No se pudo completar el lote.");
    } finally { setBusy(false); setProgress(0); }
  }

  return <div className="system-uploads commercial-batch">
    <PageHeader eyebrow="Carga RMS" title="Carga de paquete Parquet" />
    {error && <Notice type="error" onClose={() => setError("")}>{error}</Notice>}
    {message && <Notice onClose={() => setMessage("")}>{message}</Notice>}
    <form className="system-uploads__card" onSubmit={submit}>
      <div className="system-uploads__heading"><HardDriveUpload size={23} /><h2>Validar y cargar lote</h2></div>
      <div className="commercial-batch__fields" style={{ marginBottom: 16 }}>
        <label className="system-uploads__field"><span>MANIFIESTO LOCAL</span><UploadPicker label="Seleccionar manifiesto.json" file={manifestFile} accept=".json,application/json" disabled={busy} onChange={chooseManifest} /></label>
        <label className="system-uploads__field"><span>FECHA DE CORTE</span><select value={cutoff} disabled><option value="">Selecciona manifiesto.json</option>{cutoff && <option value={cutoff}>{cutoff}</option>}</select></label>
      </div>
      {manifest && <p className="system-uploads__hint"><ShieldCheck size={15} /> Corte validado · período {manifest.periodo} · {manifest.stockIncluido ? "cierre mensual con Stock" : "actualización diaria sin Stock"}.</p>}
      <div className="commercial-batch__fields">
        {expectedSources.map(item => <div className="system-uploads__field" key={item.id}><span>{item.label}</span><UploadPicker label={`Cargar ${item.fileName}`} file={files[item.id]} accept=".parquet" disabled={busy || !manifest} onChange={file => setFiles(prev => ({ ...prev, [item.id]: file }))} /></div>)}
      </div>
      <p className="system-uploads__hint">El manifiesto no se publica. Verificamos fecha, período, fuentes, nombre, tamaño, checksum y firma Parquet antes de enviar. Máximo {Math.round(SYSTEM_UPLOAD_MAX_BYTES / 1024 / 1024)} MB por archivo.</p>
      {busy && <div className="system-uploads__progress" role="progressbar" aria-valuenow={progress} aria-valuemin="0" aria-valuemax="100"><div style={{ width: `${progress}%` }} /></div>}
      <button className="button button--primary" type="submit" disabled={busy || !ready}>{busy ? `Cargando ${progress}%…` : "Cargar lote validado"}</button>
    </form>
    <section className="system-uploads__card system-uploads__history">
      <div className="system-uploads__heading"><FileSpreadsheet size={22} /><h2>Lotes recibidos</h2></div>
      <p className="system-uploads__hint">{lastProcessed ? <>Último procesamiento publicado: <strong>{formatDateTime(lastProcessed.at)}</strong>{lastProcessed.cutoff ? ` · corte ${lastProcessed.cutoff}` : ""}{lastProcessed.version ? ` · versión ${lastProcessed.version}` : ""}.</> : "Aún no existe un lote publicado."}</p>
      {loading ? <p>Cargando…</p> : batches.length ? <div className="system-uploads__table-wrap"><table><thead><tr><th>Corte</th><th>Fuentes</th><th>Recibido</th><th>Estado</th></tr></thead><tbody>{batches.map(batch => <tr key={batch.id}><td>{batch.cutoff || "—"}</td><td>{batch.files.map(file => file.source).join(" · ")}</td><td>{formatDateTime(batch.receivedAt)}</td><td>{batch.status === "pending_processing" ? "Por procesar" : batch.status}</td></tr>)}</tbody></table></div> : <p className="system-uploads__empty">No hay lotes recibidos.</p>}
    </section>
  </div>;
}
