import React from "react";

function DayFilter({ model, emit }) {
  const active = model.dateRangeActive;
  return <div className={`date-range-filter${model.dayEnabled ? "" : " disabled-filter"}`}>
    <span>DÍA</span>
    <div className="date-input-wrap">
      <button type="button" className="day-picker-trigger" disabled={!model.dayEnabled} onClick={() => emit("toggleCalendar")}>{active ? model.dayLabel : model.dayEnabled ? "TODOS EL MES" : "TODOS"}</button>
      {active && <button type="button" className="day-clear-btn" onClick={() => emit("clearDateRange")} title="Limpiar filtro de día" aria-label="Limpiar filtro de día">×</button>}
    </div>
    {model.calendarOpen && model.dayEnabled && <>
      <button type="button" className="calendar-backdrop" aria-label="Cerrar calendario" onClick={() => emit("closeCalendar")} />
      <div className="calendar-popover">
        <div className="calendar-header"><strong>{model.calendarTitle}</strong><button type="button" className="calendar-close" onClick={() => emit("closeCalendar")}>×</button></div>
        <div className="calendar-weekdays"><span>DOM</span><span>LUN</span><span>MAR</span><span>MIÉ</span><span>JUE</span><span>VIE</span><span>SÁB</span></div>
        <div className="calendar-grid">{(model.calendarDays || []).map(day => day.blank ? <span key={day.key} className="calendar-blank" /> : <button key={day.key} type="button" className={["calendar-day", day.date === model.fromDate || day.date === model.toDate ? "selected" : "", model.fromDate && model.toDate && day.date >= model.fromDate && day.date <= model.toDate ? "in-range" : "", day.date === model.fromDate && model.toDate ? "range-start" : "", day.date === model.toDate ? "range-end" : ""].filter(Boolean).join(" ")} disabled={day.disabled || model.dayLoading} onClick={() => emit("calendarDay", day.date)}>{day.day}</button>)}</div>
        <div className="calendar-footer"><small className={model.dayError ? "calendar-error" : ""}>{model.dayLoading ? "Cargando ventas del mes…" : model.dayError || (active ? model.dayLabel : "")}</small><div className="calendar-actions">{active && <button type="button" className="calendar-clear-btn" onClick={() => emit("clearDateRange")}>Limpiar día</button>}<button type="button" className="calendar-apply-btn" onClick={() => emit("closeCalendar")}>Aceptar</button></div></div>
      </div>
    </>}
  </div>;
}

export default function CommercialReactFilters({ model, onAction }) {
  const emit = (type, value) => onAction({ type, value });
  return <div data-react-commercial-module="filters">
    <div className={`dashboard-filter-toolbar${model.open ? " is-open" : ""}`}><button type="button" className="dashboard-filter-trigger" aria-label="Abrir filtros y listas" title="Filtros y listas" aria-expanded={model.open} aria-controls="dashboard-filter-drawer" onClick={() => emit("toggleDrawer")}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v4M16 10v4M10 16v4"/></svg></button></div>
    <aside id="dashboard-filter-drawer" className={`dashboard-filter-drawer${model.open ? " is-open" : ""}`} inert={!model.open ? "" : undefined} aria-label="Filtros del dashboard" onKeyDown={event => { if (event.key === "Escape") emit("closeDrawer"); }}>
      <header className="dashboard-filter-heading"><h2>Tiempo de análisis</h2></header>
      <section className="filter-panel" aria-label="Filtros de tiempo"><div className="filters filters--time-only">
        <label>AÑO<select value={model.year} onChange={event => emit("year", Number(event.target.value))}>{model.years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
        <div className="filter-field"><span>MES</span><details className="filter-dropdown" open={model.openFilter === "month"}><summary onClick={event => { event.preventDefault(); emit("toggleFilter", "month"); }}>{model.labels.month}</summary><div className="filter-menu"><input className="filter-search" type="search" placeholder="Buscar mes..." value={model.search.month || ""} onChange={event => emit("search", `month:${event.target.value}`)} /><button type="button" className={!model.selected.month.length ? "active" : ""} onClick={() => emit("clear:month")}>ACUMULADO</button>{model.options.month.map(month => <button key={month} type="button" className={model.selected.month.includes(month) ? "active" : ""} aria-pressed={model.selected.month.includes(month)} onClick={() => emit("toggle:month", month)}>{model.monthNames[month - 1].slice(0, 3).toUpperCase()}</button>)}</div></details></div>
        <DayFilter model={model} emit={emit} />
        <button className="reset" type="button" onClick={() => emit("reset")} title="Restablecer todos los filtros" aria-label="Restablecer todos los filtros"><span>↺</span></button>
      </div></section>
    </aside>
  </div>;
}
