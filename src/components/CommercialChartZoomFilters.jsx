import React, { useState } from "react";

const LABELS = {
  category: { label: "Rubro", all: "TODOS" },
  gender: { label: "Género", all: "TODOS" },
  line: { label: "Línea", all: "TODAS" },
  subline: { label: "Sublínea", all: "TODAS" },
  brand: { label: "Marca", all: "TODAS" },
};

function selectionLabel(values, all) {
  if (!values?.length) return all;
  if (values.length === 1) return values[0];
  return `${values.length} seleccionados`;
}

export default function CommercialChartZoomFilters({ filters, keys, onAction }) {
  const [openKey, setOpenKey] = useState(null);
  const [searches, setSearches] = useState({});
  if (!filters || !keys?.length) return null;
  return <div className="chart-zoom-filters" aria-label="Filtros del gráfico ampliado">
    {keys.map(key => {
      const descriptor = LABELS[key];
      if (!descriptor) return null;
      const options = filters.options?.[key] || [];
      const values = filters.selected?.[key] || [];
      const disabled = (key === "gender" && !filters.genderEnabled) || Boolean(filters.disabledKeys?.includes(key));
      const disabledText = key === "gender" && !filters.genderEnabled ? "Selecciona Textil o Calzado" : (filters.disabledText || "Disponible al actualizar datos");
      const search = searches[key] || "";
      const visibleOptions = options.filter(option => option.toLowerCase().includes(search.toLowerCase()));
      return <label key={key} className={`chart-zoom-filter${disabled ? " is-disabled" : ""}`}>
        <span>{descriptor.label}</span>
        <details className="filter-dropdown" open={!disabled && openKey === key} onToggle={event => setOpenKey(event.currentTarget.open ? key : null)}>
          <summary aria-disabled={disabled}>{disabled ? disabledText : selectionLabel(values, descriptor.all)}</summary>
          <div className="filter-menu">
            <input className="filter-search" type="search" value={search} placeholder={`Buscar ${descriptor.label.toLowerCase()}`} onChange={event => setSearches({ ...searches, [key]: event.target.value })} />
            <button type="button" className={!values.length ? "active" : ""} onClick={() => onAction({ type: `clear:${key}` })}>{descriptor.all}</button>
            {visibleOptions.map(option => <button type="button" key={option} className={values.includes(option) ? "active" : ""} onClick={() => onAction({ type: `toggle:${key}`, value: option })}>{option}</button>)}
          </div>
        </details>
      </label>;
    })}
    <button type="button" className="chart-zoom-filters__clear" onClick={() => onAction({ type: "resetHierarchy" })}>Limpiar</button>
  </div>;
}
