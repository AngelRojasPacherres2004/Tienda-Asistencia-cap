import React from "react";

const FILTERS = [
  { key: "cluster", title: "CLÚSTER", all: "TODOS", search: "Buscar clúster..." },
  { key: "format", title: "FORMATO", all: "TODOS", search: "Buscar formato..." },
  { key: "store", title: "TIENDA", all: "TODAS", search: "Buscar tienda..." },
  { key: "category", title: "RUBRO", all: "TODOS", search: "Buscar rubro..." },
  { key: "gender", title: "GÉNERO", all: "TODOS", search: "Buscar género..." },
  { key: "line", title: "LÍNEA", all: "TODAS", search: "Buscar línea..." },
  { key: "subline", title: "SUBLÍNEA", all: "TODAS", search: "Buscar sublínea..." },
];

function FilterDropdown({ item, model, emit }) {
  const { key, title, all, search } = item;
  const locked = key === "store" ? model.storeLocked : key === "cluster" ? model.clusterLocked : key === "gender" ? !model.genderEnabled : false;
  const selected = model.selected[key] || [];
  const options = model.options[key] || [];
  const label = model.labels[key] || all;
  return <div className={`filter-field${locked ? " disabled-filter" : ""}`}>
    <span>{title}</span>
    <details className="filter-dropdown" open={model.openFilter === key} aria-disabled={locked || undefined} style={locked && key !== "gender" ? { pointerEvents: "none" } : undefined}>
      <summary onClick={event => { event.preventDefault(); if (!locked) emit("toggleFilter", key); }}>{label}</summary>
      <div className="filter-menu">
        <input className="filter-search" type="search" placeholder={search} value={model.search[key] || ""} onChange={event => emit("search", `${key}:${event.target.value}`)} />
        <button type="button" className={!selected.length ? "active" : ""} disabled={key === "gender" && locked} onClick={() => emit(`clear:${key}`)}>{all}</button>
        {options.map(option => {
          const value = typeof option === "object" ? option.storeId : option;
          const text = key === "store" ? option.store || option.alias : key === "cluster" && option === "CD" ? "CD (CD + ONLINE)" : option;
          return <button key={value} type="button" className={selected.includes(value) ? "active" : ""} aria-pressed={selected.includes(value)} onClick={() => emit(`toggle:${key}`, value)}>{text}</button>;
        })}
      </div>
    </details>
  </div>;
}

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
      <header className="dashboard-filter-heading"><h2>Filtros del dashboard</h2></header>
      <section className="filter-panel" aria-label="Filtros del dashboard"><div className="filters">
        <label>AÑO<select value={model.year} onChange={event => emit("year", Number(event.target.value))}>{model.years.map(year => <option key={year} value={year}>{year}</option>)}</select></label>
        <div className="filter-field"><span>MES</span><details className="filter-dropdown" open={model.openFilter === "month"}><summary onClick={event => { event.preventDefault(); emit("toggleFilter", "month"); }}>{model.labels.month}</summary><div className="filter-menu"><input className="filter-search" type="search" placeholder="Buscar mes..." value={model.search.month || ""} onChange={event => emit("search", `month:${event.target.value}`)} /><button type="button" className={!model.selected.month.length ? "active" : ""} onClick={() => emit("clear:month")}>ACUMULADO</button>{model.options.month.map(month => <button key={month} type="button" className={model.selected.month.includes(month) ? "active" : ""} aria-pressed={model.selected.month.includes(month)} onClick={() => emit("toggle:month", month)}>{model.monthNames[month - 1].slice(0, 3).toUpperCase()}</button>)}</div></details></div>
        <DayFilter model={model} emit={emit} />
        {FILTERS.map(item => <FilterDropdown key={item.key} item={item} model={model} emit={emit} />)}
        <button className="reset" type="button" onClick={() => emit("reset")} title="Restablecer todos los filtros" aria-label="Restablecer todos los filtros"><span>↺</span></button>
      </div></section>
    </aside>
  </div>;
}
