import React from "react";

export default function CommercialReactTalentKpis({ model, onAction }) {
  return <div className="talent-kpis" data-react-commercial-module="talent-kpis">
    <article className="workers-kpi" tabIndex={0} aria-label={`Total de trabajadores activos: ${model.totalWorkers}. ${(model.workerRoles || []).map(row => `${row.role}: ${row.count}`).join('; ')}`}>
      <span>TOTAL DE TRABAJADORES</span><strong>{model.totalWorkers}</strong>
      <small>VER POR ROL</small>
      <div className="workers-kpi-tooltip" role="tooltip">
        <b>Trabajadores activos por rol</b>
        {(model.workerRoles || []).map(row => <div key={row.role}><span>{row.role}</span><strong>{row.count}</strong></div>)}
        {!model.workerRoles?.length && <p>{model.workersAvailable ? 'Sin trabajadores activos.' : 'No se pudo obtener el personal activo.'}</p>}
      </div>
    </article>
    <article title="Venta neta del período seleccionado ÷ trabajadores activos actuales de las tiendas seleccionadas."><span>VENTA × COLAB</span><small>{model.personnel} COLAB. ACTIVOS</small><strong className={model.saleCollaboratorMissing ? "missing" : undefined}>{model.saleCollaborator}</strong></article>
    <article title="Conteo de hombres y mujeres entre los trabajadores activos actuales. Los datos sin especificar se muestran por separado."><span>GÉNERO · M / F</span><strong>{model.gender}</strong><small>{model.genderNote}</small></article>
    <article title="Edad actual promedio de los trabajadores activos con fecha de nacimiento válida."><span>EDAD PROMEDIO</span><strong>{model.averageAge}</strong><small>{model.ageNote}</small></article>
    {model.showTopStore && <article title="Tienda con mayor venta neta del período por trabajador activo actual."><span>TIENDA MÁS PRODUCTIVA</span><strong>{model.topStore}</strong></article>}
    <article className="birthday-kpi" role="button" tabIndex={0} aria-haspopup="dialog" onClick={() => onAction({ type: "birthdays" })} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onAction({ type: "birthdays" }); } }}><span>CUMPLEAÑOS DEL MES</span><strong>{model.birthdays}</strong><small>{model.birthdayNote}</small><small>VER COLABORADORES ↗</small></article>
  </div>;
}
