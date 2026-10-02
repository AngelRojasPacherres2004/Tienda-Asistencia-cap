import { useState } from "react";
import { Field, Modal } from "../components/UI";
import { fieldWarning, marketingError } from "./marketingErrors";
import { MarketingFeedback } from "./marketingFeedback";

export default function MarketingFollowersModal({ open, follower, set, saving, error, onClose, onSubmit }) {
  const [warning, setWarning] = useState(null);
  if (!open) return null;
  return <Modal open={open} wide title="Agregar seguidores" subtitle="Registra la cantidad de seguidores de una red social." onClose={saving ? () => {} : onClose}>
    <form className="form-grid" noValidate onSubmit={async event => {
      event.preventDefault();
      const invalid = [...event.currentTarget.elements].find(control => control.willValidate && !control.checkValidity());
      if (invalid) { setWarning(fieldWarning(invalid)); invalid.focus(); return; }
      setWarning(null);
      try { await onSubmit(event); } catch (exception) { setWarning(marketingError(exception)); }
    }}>
      <MarketingFeedback message={warning || error} />
      <Field label="Red social"><select required value={follower.red} onChange={e => set("red", e.target.value)}>{["Instagram", "Facebook", "TikTok", "YouTube", "LinkedIn", "X"].map(red => <option key={red} value={red}>{red}</option>)}</select></Field>
      <Field label="Fecha"><input required type="date" value={follower.fecha} onChange={e => set("fecha", e.target.value)} /></Field>
      <Field label="Cantidad de seguidores"><input required type="number" min="0" step="1" value={follower.cantidad} onChange={e => set("cantidad", e.target.value)} /></Field>
      <Field label="Observaciones" className="span-2"><textarea rows={3} value={follower.observaciones} onChange={e => set("observaciones", e.target.value)} /></Field>
      <div className="form-actions span-2"><button type="button" className="button button--ghost" disabled={saving} onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div>
    </form>
  </Modal>;
}
