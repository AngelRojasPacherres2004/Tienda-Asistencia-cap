import React, { useRef } from "react";

export default function CommercialReactBirthdayModal({ model, onAction }) {
  const closeButton = useRef(null);
  return <section className="card chart-card chart-expanded ticket-modal birthday-modal" role="dialog" aria-modal="true" aria-labelledby="birthday-modal-title" data-react-commercial-module="birthday-modal"
    onKeyDown={event => {
      if (event.key === "Escape") onAction({ type: "close" });
      if (event.key === "Tab") { event.preventDefault(); closeButton.current?.focus(); }
    }}>
    <button ref={closeButton} type="button" className="chart-expand" aria-label="Cerrar cumpleaños" onClick={() => onAction({ type: "close" })}>×</button>
    <h2 id="birthday-modal-title">CUMPLEAÑOS · {model.month}</h2>
    <div className="ticket-monthly-table"><table aria-label="Colaboradores que cumplen años en el mes"><thead><tr><th>Día</th><th>Colaborador</th><th>Tienda</th><th>Cargo</th></tr></thead><tbody>
      {model.rows.length ? model.rows.map((person, index) => <tr key={`${person.name}-${index}`}><td>{person.day}</td><th scope="row">{person.name}</th><td>{person.store}</td><td>{person.role}</td></tr>) : <tr><td colSpan={4}>No hay cumpleaños registrados en este mes.</td></tr>}
    </tbody></table></div>
  </section>;
}
