import { fieldWarning, marketingError } from "./marketingErrors";
import { MarketingFeedback } from "./marketingFeedback";
import { useState } from "react";
import { Field, Modal } from "../components/UI";

const rubros = ["Textil", "Hogar", "Calzado", "Tecnología", "Electro", "Belleza", "Deportes", "Juguetería", "Accesorios", "Otros"];

export default function MarketingCampaignModal({ open, campaign, set, people, stores, saving, error, onClose, onSubmit, registration = false, approved = [], onSelect }) {
  const [validationError, setValidationError] = useState(null);
  if (!open) return null;
  const submit = async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const invalid = [...form.elements].find(control => control.willValidate && !control.checkValidity());
    if (invalid) {

      setValidationError(fieldWarning(invalid));
      invalid.focus();
      form.querySelector(".campaign-feedback")?.scrollIntoView({ block: "nearest" });
      return;
    }
    setValidationError(null);
    try {
      await onSubmit(event);
    } catch (exception) {
      setValidationError(marketingError(exception));
    }
  };
  return <Modal open={open} wide title={registration ? "Registrar campaña aprobada" : "Crear campaña"} subtitle={registration ? "Selecciona una campaña aprobada y completa su registro." : "La campaña se crea con estado Pendiente para su validación."} onClose={saving ? () => {} : onClose}>
    <form className="form-grid" noValidate onSubmit={submit}>
      <MarketingFeedback message={validationError || error} />
      {registration ? <Field label="Campaña aprobada" className="span-2"><select required value={campaign.validacion_id || ""} disabled={saving} onChange={e => onSelect(e.target.value)}><option value="">Selecciona una campaña aprobada</option>{approved.map(row => <option key={row.id} value={row.id}>{row.nombre}</option>)}</select>{!approved.length && <span>No hay campañas aprobadas pendientes de registro. Crea y aprueba una campaña en Validación.</span>}</Field> : <Field label="Nombre"><input required value={campaign.nombre} onChange={e => set("nombre", e.target.value)} /></Field>}
      <Field label="Rubro"><select required value={campaign.rubros} onChange={e => set("rubros", e.target.value)}><option value="">Selecciona un rubro</option>{rubros.map(rubro => <option key={rubro} value={rubro}>{rubro}</option>)}</select></Field>
      <Field label="Fecha de inicio"><input required type="date" value={campaign.fecha_inicio} onChange={e => set("fecha_inicio", e.target.value)} /></Field>
      <Field label="Fecha final"><input required type="date" min={campaign.fecha_inicio || undefined} value={campaign.fecha_fin} onChange={e => set("fecha_fin", e.target.value)} /></Field>
      <Field label="Presupuesto inicial" hint={registration ? "Se carga desde la validación aprobada." : undefined}><input required readOnly={registration} type="number" min="0" step="0.01" value={campaign.presupuesto_previsto} onChange={e => set("presupuesto_previsto", e.target.value)} /></Field>
      <Field label="Presupuesto real"><input type="number" min="0" step="0.01" value={campaign.presupuesto_real} onChange={e => set("presupuesto_real", e.target.value)} /></Field>
      <AssignmentSelect label="Personal de Marketing" placeholder="Selecciona personal" options={people.map(person => ({ id: person.id, label: `${person.nombres} ${person.apellidos}` }))} values={campaign.trabajadores_ids} onChange={values => set("trabajadores_ids", values)} disabled={saving} />
      <AssignmentSelect label="Tiendas" placeholder="Selecciona una tienda" options={stores.map(store => ({ id: store.id, label: store.nombre }))} values={campaign.tiendas_ids} onChange={values => set("tiendas_ids", values)} disabled={saving} />
      <Field label="Descripción" className="span-2"><textarea rows={3} value={campaign.descripcion} onChange={e => set("descripcion", e.target.value)} /></Field>
      <div className="form-actions span-2"><button type="button" className="button button--ghost" disabled={saving} onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div>
    </form>
  </Modal>;
}

function AssignmentSelect({ label, placeholder, options, values, onChange, disabled }) {
  const ids = values.map(String);
  const available = options.filter(option => !ids.includes(String(option.id)));
  return <Field label={label} className="span-2" hint="Agrega una o varias opciones desde la lista.">
    <select value="" disabled={disabled || !available.length} onChange={event => {
      if (event.target.value) onChange([...values, Number(event.target.value)]);
    }}><option value="">{available.length ? placeholder : "No hay más opciones disponibles"}</option>{available.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
    {values.length > 0 && <div className="campaign-selections">{values.map(id => <button key={id} type="button" className="button button--ghost button--small" disabled={disabled} aria-label={`Quitar ${options.find(option => String(option.id) === String(id))?.label || id}`} onClick={() => onChange(values.filter(value => String(value) !== String(id)))}>{options.find(option => String(option.id) === String(id))?.label || id} ×</button>)}</div>}
  </Field>;
}
