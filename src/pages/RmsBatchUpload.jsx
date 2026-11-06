import { useCallback, useEffect, useRef, useState } from "react";
import { FileSpreadsheet, HardDriveUpload, PlayCircle } from "lucide-react";
import { api, formatDateTime, todayISO } from "../lib/api";
import { Notice, PageHeader } from "../components/UI";
import UploadPicker from "../components/UploadPicker";
import { COMMERCIAL_BATCH_MAX_BYTES, COMMERCIAL_BATCH_SOURCES } from "../../shared/commercialBatch.js";
import { SYSTEM_UPLOAD_MAX_BYTES, validateSystemUpload } from "../../shared/systemUpload.js";
import "./system-uploads.css";

const UPLOAD_SOURCES = COMMERCIAL_BATCH_SOURCES;

async function checkSignature(file) {
  const head = String.fromCharCode(...new Uint8Array(await file.slice(0, 4).arrayBuffer()));
  const tail = String.fromCharCode(...new Uint8Array(await file.slice(-4).arrayBuffer()));
  if (head !== "PAR1" || tail !== "PAR1") throw new Error(`${file.name} no es un Parquet válido.`);
}

// ---------- Simulación de carga ----------
function SimulationPanel({ files, cutoff }) {
  const [simRunning, setSimRunning] = useState(false);
  const [simProgress, setSimProgress] = useState({});
  const [simDone, setSimDone] = useState(false);
  const intervalRef = useRef(null);

  const allSources = UPLOAD_SOURCES;

  const runSimulation = () => {
    setSimDone(false);
    setSimProgress({});
    setSimRunning(true);
    const progress = {};
    allSources.forEach((s) => (progress[s.id] = 0));
    setSimProgress({ ...progress });

    let tick = 0;
    intervalRef.current = setInterval(() => {
      tick += 1;
      let allDone = true;
      allSources.forEach((s) => {
        if (progress[s.id] < 100) {
          progress[s.id] = Math.min(100, progress[s.id] + Math.random() * 15 + 5);
          allDone = false;
        }
      });
      setSimProgress({ ...progress });
      if (allDone || tick > 50) {
        clearInterval(intervalRef.current);
        allSources.forEach((s) => (progress[s.id] = 100));
        setSimProgress({ ...progress });
        setSimRunning(false);
        setSimDone(true);
      }
    }, 200);
  };

  useEffect(() => () => clearInterval(intervalRef.current), []);

  return (
    <section className="system-uploads__card" style={{ marginTop: 12 }}>
      <div className="system-uploads__heading">
        <PlayCircle size={22} />
        <h2>Simulación de carga</h2>
      </div>
      <p className="system-uploads__hint">
        Prueba el flujo de subida sin enviar datos reales. Simula el progreso de cada archivo
        con corte <strong>{cutoff.split("-").reverse().join("/")}</strong>.
      </p>

      <div style={{ marginBottom: 12 }}>
        {allSources.map((s) => {
          const pct = Math.round(simProgress[s.id] || 0);
          const fileInfo = files[s.id];
          return (
            <div key={s.id} style={{ marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 2 }}>
                <span>
                  <strong>{s.label}</strong>
                  {fileInfo ? (
                    <span style={{ color: "#5f6b7a", marginLeft: 6 }}>
                      ({(fileInfo.size / 1024 / 1024).toFixed(1)} MB)
                    </span>
                  ) : (
                    <span style={{ color: "#bbb", marginLeft: 6 }}>(sin archivo)</span>
                  )}
                </span>
                <span style={{ color: pct === 100 ? "#22c55e" : "#18213a" }}>{pct}%</span>
              </div>
              <div style={{ background: "#e5e7eb", borderRadius: 4, height: 6 }}>
                <div
                  style={{
                    width: `${pct}%`,
                    background: pct === 100 ? "#22c55e" : "#2563eb",
                    height: "100%",
                    borderRadius: 4,
                    transition: "width 0.2s",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {simDone && (
        <p style={{ color: "#22c55e", fontWeight: 600, marginBottom: 8 }}>
          ✓ Simulación completada — el lote con corte {cutoff} quedaría actualizado.
        </p>
      )}

      <button
        className="button button--primary"
        type="button"
        onClick={runSimulation}
        disabled={simRunning}
        style={{ marginTop: 4 }}
      >
        {simRunning ? "Simulando…" : "▶ Simular carga"}
      </button>
    </section>
  );
}

// ---------- Componente principal ----------
export default function RmsBatchUpload() {
  const [cutoff, setCutoff] = useState(todayISO);
  const [files, setFiles] = useState({});
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const ready = UPLOAD_SOURCES.every((item) => files[item.id]);

  const refresh = useCallback(async () => {
    try {
      setBatches((await api("/systems/batches")).batches || []);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  async function submit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    setError("");
    setMessage("");
    if (!ready) {
      setError("Selecciona los cuatro archivos: Ventas, Transferencias, Ingresos y Stock.");
      return;
    }
    const receipts = [];
    let completed = false;
    try {
      const selected = UPLOAD_SOURCES.map((item) => {
        const file = files[item.id];
        if (!file.name.toLowerCase().endsWith(".parquet")) {
          throw new Error(`${item.label} debe cargarse como archivo .parquet.`);
        }
        return {
          source: item.id,
          file,
          validated: validateSystemUpload({ source: item.id, fileName: file.name, fileSize: file.size }),
        };
      });
      if (selected.reduce((total, item) => total + item.file.size, 0) > COMMERCIAL_BATCH_MAX_BYTES) {
        throw new Error("El lote completo no debe superar 300 MB.");
      }
      await Promise.all(selected.map((item) => checkSignature(item.file)));
      setBusy(true);
      setProgress(0);
      const batchId = crypto.randomUUID();
      const totalParts = selected.reduce((total, item) => total + item.validated.chunks, 0);
      let uploadedParts = 0;

      for (const { source, file } of selected) {
        const session = await api("/systems/batches/start", {
          method: "POST",
          body: { batchId, cutoff, source, fileName: file.name, fileSize: file.size },
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
          setProgress(Math.round((uploadedParts / totalParts) * 100));
        }
      }
      await api("/systems/batches/complete", { method: "POST", body: { receipts } });
      completed = true;
      setMessage(
        `Lote con corte ${cutoff} registrado: Ventas, Transferencias, Ingresos y Stock. `
        + "Las demás fuentes se leen desde las tablas de la base de datos."
      );
      setFiles({});
      form.reset();
      await refresh();
    } catch (failure) {
      if (receipts.length && !completed) {
        await api("/systems/batches/cancel", { method: "POST", body: { receipts } }).catch(() => {});
      }
      setError(failure.message || "No se pudo completar el lote.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="system-uploads commercial-batch">
      <PageHeader eyebrow="Asistente comercial" title="Carga de archivos operativos" />
      {error && <Notice type="error" onClose={() => setError("")}>{error}</Notice>}
      {message && <Notice onClose={() => setMessage("")}>{message}</Notice>}

      <form className="system-uploads__card" onSubmit={submit}>
        <div className="system-uploads__heading">
          <HardDriveUpload size={23} />
          <h2>Subir datos del año</h2>
        </div>

        {/* El corte se registra con el lote para no adelantar datos de ventas. */}
        <div className="commercial-batch__fields" style={{ marginBottom: 16 }}>
          <label className="system-uploads__field" style={{ maxWidth: 220 }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>FECHA DE CORTE</span>
            <input
              type="date"
              value={cutoff}
              max={todayISO()}
              disabled={busy}
              onChange={(e) => setCutoff(e.target.value)}
              style={{ fontSize: 15, fontWeight: 600 }}
            />
          </label>
          <p className="system-uploads__hint" style={{ marginTop: 4 }}>
            El corte debe corresponder al último día incluido en los cuatro archivos.
          </p>
        </div>

        {/* Los únicos archivos operativos que se reciben en el lote. */}
        <div className="commercial-batch__fields">
          {UPLOAD_SOURCES.map((item) => (
            <div className="system-uploads__field" key={item.id}>
              <span>{item.label}</span>
              <UploadPicker
                label={`Cargar ${item.label}`}
                file={files[item.id]}
                accept=".parquet"
                disabled={busy}
                onChange={(file) => setFiles((prev) => ({ ...prev, [item.id]: file }))}
              />
            </div>
          ))}
        </div>

        <p className="system-uploads__hint">
          Solo archivos Parquet; máximo {Math.round(SYSTEM_UPLOAD_MAX_BYTES / 1024 / 1024)} MB por archivo y{" "}
          {Math.round(COMMERCIAL_BATCH_MAX_BYTES / 1024 / 1024)} MB por lote.
          Metas, tráfico, personal, mermas, guías y catálogos se consultan desde la base de datos.
        </p>

        {busy && (
          <div
            className="system-uploads__progress"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div style={{ width: `${progress}%` }} />
          </div>
        )}

        <button className="button button--primary" type="submit" disabled={busy || !ready}>
          {busy ? `Cargando ${progress}%…` : "Cargar lote operativo"}
        </button>
        <p className="system-uploads__hint">
          El dashboard mantiene su versión publicada hasta completar la validación del nuevo lote.
        </p>
      </form>

      {/* Panel de simulación */}
      <SimulationPanel files={files} cutoff={cutoff} />

      {/* Historial */}
      <section className="system-uploads__card system-uploads__history">
        <div className="system-uploads__heading">
          <FileSpreadsheet size={22} />
          <h2>Lotes recibidos</h2>
        </div>
        {loading ? (
          <p>Cargando…</p>
        ) : batches.length ? (
          <div className="system-uploads__table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Año</th>
                  <th>Fuentes</th>
                  <th>Recibido</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch) => (
                  <tr key={batch.id}>
                    <td>{batch.cutoff?.slice(0, 4) || "—"}</td>
                    <td>{batch.files.map((f) => f.source).join(" · ")}</td>
                    <td>{formatDateTime(batch.receivedAt)}</td>
                    <td>{batch.status === "pending_processing" ? "Por procesar" : batch.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="system-uploads__empty">Aún no hay lotes recibidos.</p>
        )}
      </section>
    </div>
  );
}
