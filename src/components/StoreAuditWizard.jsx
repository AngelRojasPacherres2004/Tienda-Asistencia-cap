import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardCheck, Clock3 } from "lucide-react";
import { api, todayISO } from "../lib/api";
import { Field, Modal, Notice, Pagination } from "./UI";
import { auditItems, auditPeriodLabel, auditScoreOptions, defaultCorrectionDays, storeAuditChecklist } from "../data/storeAuditChecklist";

const addDays = (value, days) => {
  const date = new Date(`${value || todayISO()}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const emptyAudit = () => ({ tienda_id: "", fecha: todayISO(), periodo: "primera_quincena", observacion_general: "", responses: {} });

export default function StoreAuditWizard({ open, stores, onClose, onSaved }) {
  const [form, setForm] = useState(emptyAudit);
  const [step, setStep] = useState(0);
  const [itemPage, setItemPage] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (open) { setForm(emptyAudit()); setStep(0); setItemPage(1); setError(""); } }, [open]);

  const answered = auditItems.filter((item) => Number(form.responses[item.id]?.score)).length;
  const findings = auditItems.filter((item) => Number(form.responses[item.id]?.score) > 0 && Number(form.responses[item.id]?.score) <= 3);
  const sectionScores = useMemo(() => storeAuditChecklist.map((section) => {
    const scores = section.items.map((item) => Number(form.responses[item.id]?.score || 0)).filter(Boolean);
    return { ...section, answered: scores.length, percent: scores.length === section.items.length ? Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length / 5 * 100) : null };
  }), [form.responses]);
  const totalPercent = sectionScores.every((section) => section.percent !== null)
    ? Math.round(sectionScores.reduce((sum, section) => sum + section.percent, 0) / sectionScores.length)
    : null;

  const updateResponse = (item, patch) => setForm((current) => {
    const previous = current.responses[item.id] || {};
    const next = { ...previous, ...patch };
    if (patch.score && Number(patch.score) <= 3 && !next.priority) next.priority = Number(patch.score) === 1 ? "urgente" : Number(patch.score) === 2 ? "alta" : "media";
    if (Number(next.score) <= 3 && !next.deadline) next.deadline = addDays(current.fecha, defaultCorrectionDays(item.period));
    return { ...current, responses: { ...current.responses, [item.id]: next } };
  });

  const validateSection = (section) => {
    const missingScore = section.items.find((item) => !Number(form.responses[item.id]?.score));
    if (missingScore) return `Califica el criterio ${missingScore.id} antes de continuar.`;
    const incompleteFinding = section.items.find((item) => {
      const response = form.responses[item.id] || {};
      return Number(response.score) <= 3 && (!response.note?.trim() || !response.action?.trim() || !response.deadline);
    });
    if (incompleteFinding) return `Completa el hallazgo, la acción y la fecha límite del criterio ${incompleteFinding.id}.`;
    return "";
  };

  const goNext = () => {
    setError("");
    if (step === 0) {
      if (!form.tienda_id || !form.fecha || !form.periodo) { setError("Selecciona la tienda, la fecha y el periodo de la auditoría."); return; }
    } else if (step <= storeAuditChecklist.length) {
      const message = validateSection(storeAuditChecklist[step - 1]);
      if (message) { setError(message); return; }
    }
    setStep((current) => Math.min(current + 1, storeAuditChecklist.length + 1)); setItemPage(1);
  };

  const submit = async () => {
    if (answered !== auditItems.length) { setError("Completa todos los criterios antes de registrar la auditoría."); return; }
    setBusy(true); setError("");
    try {
      await api("/zonal/supervisiones", {
        method: "POST",
        body: {
          tienda_id: Number(form.tienda_id), fecha: form.fecha, periodo: form.periodo,
          generalNote: form.observacion_general,
          items: auditItems.map((item) => ({ ...item, ...form.responses[item.id], score: Number(form.responses[item.id].score) })),
        },
      });
      onSaved?.();
    } catch (failure) { setError(failure.message); } finally { setBusy(false); }
  };

  const section = step > 0 && step <= storeAuditChecklist.length ? storeAuditChecklist[step - 1] : null;
  const sectionPages = section ? Math.max(1, Math.ceil(section.items.length / 6)) : 1;
  const visibleItems = section ? section.items.slice((itemPage - 1) * 6, itemPage * 6) : [];
  const selectedStore = stores.find((store) => String(store.id) === String(form.tienda_id));

  return <Modal open={open} extraWide title="Nueva auditoría de tienda" subtitle="Checklist digital de supervisión zonal" onClose={busy ? undefined : onClose}>
    <div className="audit-wizard">
      <header className="audit-wizard__progress"><div><ClipboardCheck size={20}/><span><strong>{answered} de {auditItems.length}</strong><small>criterios evaluados</small></span></div><div className="audit-wizard__bar"><i style={{ width: `${answered / auditItems.length * 100}%` }}/></div><b>{totalPercent === null ? "—" : `${totalPercent}%`}</b></header>
      <nav className="audit-wizard__steps"><button className={step === 0 ? "active" : ""} onClick={() => { setStep(0); setItemPage(1); }}>Datos</button>{storeAuditChecklist.map((item, index) => <button key={item.id} className={step === index + 1 ? "active" : item.items.every((entry) => form.responses[entry.id]?.score) ? "complete" : ""} onClick={() => { setStep(index + 1); setItemPage(1); }}>{index + 1}. {item.title}</button>)}<button className={step === storeAuditChecklist.length + 1 ? "active" : ""} onClick={() => setStep(storeAuditChecklist.length + 1)}>Resumen</button></nav>
      {error && <Notice type="error" onClose={() => setError("")}>{error}</Notice>}

      {step === 0 && <section className="audit-wizard__intro"><div><span className="audit-wizard__icon"><ClipboardCheck size={26}/></span><div><h3>Datos de la visita</h3><p>La auditoría quedará vinculada a la tienda y su administrador actual.</p></div></div><div className="form-grid"><Field label="Tienda *"><select required value={form.tienda_id} onChange={(event) => setForm({ ...form, tienda_id: event.target.value })}><option value="">Selecciona una tienda</option>{stores.filter((store) => store.estado === "activo").map((store) => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></Field><Field label="Fecha de visita *"><input required type="date" max={todayISO()} value={form.fecha} onChange={(event) => setForm({ ...form, fecha: event.target.value })}/></Field><Field label="Periodo *"><select value={form.periodo} onChange={(event) => setForm({ ...form, periodo: event.target.value })}><option value="primera_quincena">Primera quincena</option><option value="segunda_quincena">Segunda quincena</option><option value="extraordinaria">Auditoría extraordinaria</option></select></Field><Field label="Comentario general" className="span-2"><textarea rows="4" maxLength="800" placeholder="Contexto de la visita, acuerdos o situaciones relevantes" value={form.observacion_general} onChange={(event) => setForm({ ...form, observacion_general: event.target.value })}/></Field></div><aside><Clock3 size={18}/><span>Los criterios observados generan tareas para el administrador con fecha límite y posterior validación del Zonal.</span></aside></section>}

      {section && <section className="audit-section"><header><div><span>Sección {step} de {storeAuditChecklist.length} · peso {section.weight}%</span><h3>{section.title}</h3></div><strong>{sectionScores[step - 1].percent === null ? `${sectionScores[step - 1].answered}/${section.items.length}` : `${sectionScores[step - 1].percent}%`}</strong></header><div className="audit-items">{visibleItems.map((item) => { const response = form.responses[item.id] || {}; const requiresAction = Number(response.score) > 0 && Number(response.score) <= 3; return <article className={requiresAction ? "has-finding" : Number(response.score) >= 4 ? "is-compliant" : ""} key={item.id}><div className="audit-item__title"><span>{item.id}</span><div><strong>{item.text}</strong><small>{auditPeriodLabel(item.period)}</small></div>{requiresAction ? <AlertTriangle size={18}/> : Number(response.score) >= 4 ? <CheckCircle2 size={18}/> : null}</div><div className="audit-score" role="radiogroup" aria-label={`Calificación ${item.id}`}>{auditScoreOptions.map((option) => <button type="button" className={Number(response.score) === option.value ? "selected" : ""} aria-pressed={Number(response.score) === option.value} key={option.value} onClick={() => updateResponse(item, { score: option.value })}><b>{option.value}</b><span>{option.label}</span></button>)}</div>{requiresAction && <div className="audit-finding-fields"><Field label="Hallazgo *"><textarea required rows="3" maxLength="600" value={response.note || ""} onChange={(event) => updateResponse(item, { note: event.target.value })}/></Field><Field label="Acción solicitada *"><textarea required rows="3" maxLength="600" value={response.action || ""} onChange={(event) => updateResponse(item, { action: event.target.value })}/></Field><Field label="Prioridad *"><select value={response.priority || (Number(response.score) === 1 ? "urgente" : Number(response.score) === 2 ? "alta" : "media")} onChange={(event) => updateResponse(item, { priority: event.target.value })}><option value="baja">Baja</option><option value="media">Media</option><option value="alta">Alta</option><option value="urgente">Urgente</option></select></Field><Field label="Fecha límite *" hint={`${defaultCorrectionDays(item.period)} días sugeridos según la periodicidad.`}><input required type="date" min={form.fecha} value={response.deadline || addDays(form.fecha, defaultCorrectionDays(item.period))} onChange={(event) => updateResponse(item, { deadline: event.target.value })}/></Field></div>}</article>; })}</div>{sectionPages > 1 && <Pagination page={itemPage} pages={sectionPages} onChange={setItemPage}/>}</section>}

      {step === storeAuditChecklist.length + 1 && <section className="audit-summary"><header><div><span>Resultado calculado</span><h3>{selectedStore?.nombre || "Tienda"}</h3><p>{findings.length} observaciones requieren levantamiento.</p></div><strong className={totalPercent >= 80 ? "good" : totalPercent >= 60 ? "medium" : "low"}>{totalPercent ?? 0}%</strong></header><div className="audit-summary__sections">{sectionScores.map((item) => <article key={item.id}><span>{item.title}</span><strong>{item.percent ?? 0}%</strong><small>{item.weight}% del resultado final</small></article>)}</div>{findings.length ? <div className="audit-summary__findings"><h4>Observaciones que se enviarán al administrador</h4>{findings.slice(0, 8).map((item) => <div key={item.id}><span>{item.id}</span><p>{form.responses[item.id].note}</p><strong>Vence {form.responses[item.id].deadline}</strong></div>)}{findings.length > 8 && <small>Y {findings.length - 8} observaciones adicionales.</small>}</div> : <div className="audit-summary__clean"><CheckCircle2 size={24}/><strong>Auditoría sin observaciones</strong><span>Todos los criterios obtuvieron 4 o 5 puntos.</span></div>}</section>}

      <footer className="audit-wizard__actions"><button type="button" className="button button--ghost" disabled={busy || step === 0} onClick={() => { setStep((current) => Math.max(0, current - 1)); setItemPage(1); }}><ChevronLeft size={16}/>Anterior</button><span>Paso {step + 1} de {storeAuditChecklist.length + 2}</span>{step < storeAuditChecklist.length + 1 ? <button type="button" className="button button--primary" onClick={goNext}>Continuar<ChevronRight size={16}/></button> : <button type="button" className="button button--primary" disabled={busy || totalPercent === null} onClick={submit}>{busy ? "Registrando…" : "Registrar auditoría"}</button>}</footer>
    </div>
  </Modal>;
}
