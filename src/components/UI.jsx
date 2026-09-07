import { AlertTriangle, Check, ChevronLeft, ChevronRight, Search, X } from "lucide-react";

export function PageHeader({ eyebrow, title, subtitle, action }) {
  return (
    <header className="page-header">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {action}
    </header>
  );
}

export function StatusBadge({ value, label }) {
  const key = String(value || "").toLowerCase().replace(/\s+/g, "-");
  return <span className={`status status--${key}`}><i />{label ?? (value || "Sin estado")}</span>;
}

export function Modal({ open, title, subtitle, children, onClose, wide = false }) {
  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`modal ${wide ? "modal--wide" : ""}`} role="dialog" aria-modal="true">
        <header className="modal__header">
          <div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
          <button className="icon-button" onClick={onClose} aria-label="Cerrar"><X size={20} /></button>
        </header>
        <div className="modal__body">{children}</div>
      </section>
    </div>
  );
}

export function ConfirmDialog({ open, title, message, onConfirm, onClose, busy }) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <div className="confirm-copy">
        <span className="confirm-icon"><AlertTriangle size={22} /></span>
        <p>{message}</p>
      </div>
      <div className="form-actions">
        <button className="button button--ghost" onClick={onClose}>Cancelar</button>
        <button className="button button--danger" disabled={busy} onClick={onConfirm}>
          {busy ? "Eliminando…" : "Sí, eliminar"}
        </button>
      </div>
    </Modal>
  );
}

export function SearchInput({ value, onChange, placeholder = "Buscar…", ...rest }) {
  return (
    <label className="search-input">
      <Search size={18} />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} {...rest} />
    </label>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      {Icon && <span><Icon size={25} /></span>}
      <h3>{title}</h3><p>{text}</p>{action}
    </div>
  );
}

export function Loading({ label = "Cargando información…" }) {
  return <div className="loading"><i /><span>{label}</span></div>;
}

export function Notice({ type = "success", children, onClose }) {
  return (
    <div className={`notice notice--${type}`}>
      {type === "success" && <Check size={17} />}
      {type === "error" && <AlertTriangle size={17} />}
      <span>{children}</span>
      {onClose && <button onClick={onClose}><X size={16} /></button>}
    </div>
  );
}

export function SaveSuccessDialog({ open, action, onContinue }) {
  if (!open) return null;
  return (
    <div className="save-success-backdrop" role="dialog" aria-modal="true" aria-labelledby="save-success-title">
      <section className="save-success-card">
        <span className="save-success-icon"><Check size={34} strokeWidth={3} /></span>
        <p className="eyebrow">Operación completada</p>
        <h2 id="save-success-title">{action}</h2>
        <p className="save-success-copy">Los cambios se guardaron correctamente.</p>
        <button className="button button--primary button--large" onClick={onContinue}>Continuar</button>
      </section>
    </div>
  );
}

export function Pagination({ page, pages, onChange }) {
  if (pages <= 1) return null;
  return (
    <div className="pagination">
      <button disabled={page === 1} onClick={() => onChange(page - 1)}><ChevronLeft size={17} /></button>
      <span>Página <strong>{page}</strong> de {pages}</span>
      <button disabled={page === pages} onClick={() => onChange(page + 1)}><ChevronRight size={17} /></button>
    </div>
  );
}

export function Field({ label, hint, children, className = "" }) {
  return <label className={`field ${className}`}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}
