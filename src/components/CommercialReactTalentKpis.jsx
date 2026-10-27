import React from "react";

export default function CommercialReactTalentKpis({ model, onAction }) {
  return <div className="talent-kpis" data-react-commercial-module="talent-kpis">
    <article title="Fórmula: suma de colaboradores del contexto filtrado por mes ÷ número de meses seleccionados; redondeado a personas enteras."><span>PERSONAL PROMEDIO</span><strong className={model.personnelMissing ? "missing" : undefined}>{model.personnel}</strong></article>
    <article title="Fórmula: venta neta del período ÷ colaboradores promedio del contexto filtrado."><span>VENTA × COLAB</span><small>{model.personnel} COLAB.</small><strong className={model.saleCollaboratorMissing ? "missing" : undefined}>{model.saleCollaborator}</strong></article>
    <article title="Distribución del personal activo por género sobre la dotación promedio del período; redondeada a personas enteras."><span>GÉNERO · M / F</span><strong>{model.gender}</strong></article>
    <article title="Fórmula: suma de edades válidas de colaboradores activos ÷ colaboradores activos con fecha de nacimiento válida."><span>EDAD PROMEDIO</span><strong>{model.averageAge}</strong></article>
    <article title="Fórmula: promedio mensual del personal del área comercial; redondeado a personas enteras."><span>PERSONAL DE VENTA</span><strong>{model.salesStaff}</strong></article>
    <article title="Solo considera Administrador de tienda y Asistente de tienda activos en el período."><span>PERSONAL ADMINISTRATIVO</span><strong>{model.administrativeStaff}</strong></article>
    <article title="Fórmula: tienda con mayor venta neta ÷ colaboradores reales del mes."><span>TIENDA MÁS PRODUCTIVA</span><strong>{model.topStore}</strong></article>
    <article className="birthday-kpi" role="button" tabIndex={0} aria-haspopup="dialog" onClick={() => onAction({ type: "birthdays" })} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onAction({ type: "birthdays" }); } }}><span>CUMPLEAÑOS DEL MES</span><strong>{model.birthdays}</strong><small>VER COLABORADORES ↗</small></article>
  </div>;
}
