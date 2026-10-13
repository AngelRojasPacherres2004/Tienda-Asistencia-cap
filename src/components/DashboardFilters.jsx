import { useState } from "react";
import { Filter, RotateCcw, X } from "lucide-react";
import { todayISO } from "../lib/api";

const months = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function DashboardFilters({ filters, setFilters, stores, range }) {
  const [open, setOpen] = useState(false);
  const today = todayISO(), year = today.slice(0, 4), month = today.slice(5, 7);
  const availableMonths = filters.anio === year ? months.slice(0, Number(month)) : months;
  const days = filters.anio === year && filters.mes === month ? Number(today.slice(8, 10)) : new Date(Number(filters.anio), Number(filters.mes), 0).getDate();
  const selected = stores.find(store => String(store.id) === filters.tienda_id);
  const update = (field, value) => setFilters(current => ({ ...current, [field]: value }));
  return <>
    <button type="button" className={`dashboard-filter-fab ${open ? "open" : ""}`} aria-expanded={open} aria-controls="commercial-dashboard-filters" onClick={() => setOpen(value => !value)}><Filter size={17}/><span>{open ? "Ocultar" : "Filtros"}</span></button>
    {open && <aside id="commercial-dashboard-filters" className="dashboard-filter-popover" aria-label="Filtros de Gestión">
      <div className="dashboard-filter-popover__head"><div><span className="eyebrow">Vista global</span><h2>Periodo y tienda</h2><small>{selected?.nombre || "Todas las tiendas"}</small></div><button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Cerrar filtros"><X size={17}/></button></div>
      <label className="field"><span>Tienda</span><select value={filters.tienda_id} onChange={event => update("tienda_id", event.target.value)}><option value="">Todas las tiendas</option>{stores.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select></label>
      <div className="dashboard-filter-selectors">
        <label className="field"><span>Año</span><select value={filters.anio} onChange={event => setFilters(current => ({ ...current, anio: event.target.value, mes: event.target.value === year && Number(current.mes) > Number(month) ? month : current.mes, dia: "" }))}>{Array.from({ length: Number(year) - 1999 }, (_, index) => String(Number(year) - index)).map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label className="field"><span>Mes</span><select value={filters.mes} onChange={event => setFilters(current => ({ ...current, mes: event.target.value, dia: "" }))}>{availableMonths.map((name, index) => <option key={name} value={String(index + 1).padStart(2, "0")}>{name}</option>)}</select></label>
        <label className="field"><span>Día</span><select value={filters.dia} onChange={event => update("dia", event.target.value)}><option value="">Todo el mes</option>{Array.from({ length: days }, (_, index) => String(index + 1).padStart(2, "0")).map(value => <option key={value} value={value}>{Number(value)}</option>)}</select></label>
      </div>
      <small className="dashboard-filter-summary">Desde {range.desde} hasta {range.hasta}</small>
      <button type="button" className="button button--ghost button--small" onClick={() => setFilters({ tienda_id: "", anio: year, mes: month, dia: "" })}><RotateCcw size={14}/>Mes actual</button>
    </aside>}
  </>;
}
