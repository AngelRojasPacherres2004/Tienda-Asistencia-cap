export default function OptionalProfileField({ label, checked, onChange, children, className = "" }) {
  return <div className={`optional-profile-field ${className}`}>
    <label className="optional-profile-field__toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>Registrar {label.toLocaleLowerCase("es")}</span>
    </label>
    {checked ? children : <small className="optional-profile-field__empty">No registrado</small>}
  </div>;
}
