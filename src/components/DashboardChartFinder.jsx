import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CHART_PAGES, searchCharts } from './chartSearchCatalog.js';

export default function CommercialChartSearch({ controller, page, storeAdmin }) {
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [pending, setPending] = useState(null);
  const [message, setMessage] = useState('');
  const host = useRef(null);
  const toggle = useRef(null);
  const listId = useId();
  const results = useMemo(() => searchCharts(query, { storeAdmin }), [query, storeAdmin]);
  useEffect(() => { if (expanded) host.current?.querySelector('input')?.focus(); }, [expanded]);
  useEffect(() => {
    if (!pending || page !== pending.page) return;
    const root = host.current?.getRootNode();
    if (!root) return;
    let highlightTimer;
    let highlighted;
    let originalTabIndex;
    const reveal = () => {
      const target = root.querySelector(pending.selector);
      if (!target) return false;
      target.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
      originalTabIndex = target.getAttribute('tabindex');
      target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
      target.classList.add('chart-search-highlight');
      highlighted = target;
      highlightTimer = setTimeout(() => target.classList.remove('chart-search-highlight'), 3500);
      setMessage(`Mostrando: ${pending.title}. Se conservan tus filtros.`);
      return true;
    };
    const observer = new MutationObserver(() => { if (reveal()) observer.disconnect(); });
    if (!reveal()) observer.observe(root, { childList: true, subtree: true });
    const timeout = setTimeout(() => {
      observer.disconnect();
      if (!highlighted) setMessage('La gráfica aún no está disponible. Revisa el estado de carga de esta sección.');
    }, 10000);
    return () => {
      observer.disconnect(); clearTimeout(timeout); clearTimeout(highlightTimer);
      highlighted?.classList.remove('chart-search-highlight');
      if (highlighted) { if (originalTabIndex == null) highlighted.removeAttribute('tabindex'); else highlighted.setAttribute('tabindex', originalTabIndex); }
    };
  }, [pending, page]);
  const choose = item => {
    setQuery(item.title); setOpen(false); setExpanded(false); setMessage(`Abriendo ${item.title}…`);
    setPending(item);
    void controller.goPage(item.page).catch(() => { setPending(null); setMessage('No se pudo abrir la sección. Vuelve a intentarlo.'); });
  };
  return <div className="dashboard-chart-finder" ref={host} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) { setOpen(false); setExpanded(false); } }}>
    <button className="chart-search-toggle" type="button" ref={toggle} aria-label={expanded ? 'Cerrar buscador de gráficas' : 'Buscar gráfica'} aria-expanded={expanded} aria-controls={`${listId}-panel`} onClick={() => setExpanded(value => !value)}><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg></button>
    <div className="chart-search" id={`${listId}-panel`} hidden={!expanded}>
    <label htmlFor={`${listId}-input`}>Buscar gráfica</label>
    <div className="chart-search-field"><span aria-hidden="true">⌕</span><input id={`${listId}-input`} role="combobox" aria-autocomplete="list" aria-expanded={open && query.trim().length > 0} aria-controls={listId} aria-activedescendant={open && results[active] ? `${listId}-${active}` : undefined} value={query} maxLength={160} placeholder="Ej.: ventas por tienda, stock antiguo o cuánto personal hay" onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setPending(null); setMessage(''); setActive(0); setOpen(true); }} onKeyDown={event => {
      if (event.key === 'Escape') { setOpen(false); setExpanded(false); toggle.current?.focus(); return; }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setActive(index => Math.max(0, Math.min(results.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)))); }
      if (event.key === 'Enter' && results[active]) { event.preventDefault(); choose(results[active]); }
    }} />{query && <button type="button" aria-label="Limpiar búsqueda de gráficas" onClick={() => { setQuery(''); setMessage(''); setActive(0); host.current.querySelector('input').focus(); }}>×</button>}</div>
    <small>Busca por tema o describe lo que necesitas. Reconoce sinónimos y errores de escritura.</small>
    {open && query.trim() && <div className="chart-search-results" id={listId} role="listbox" aria-label="Gráficas encontradas">
      {results.map((item, index) => <button type="button" role="option" aria-selected={active === index} id={`${listId}-${index}`} key={item.id} onMouseEnter={() => setActive(index)} onClick={() => choose(item)}><strong>{item.title}</strong><span>{CHART_PAGES[item.page]} · Ir a gráfica →</span></button>)}
      {!results.length && <p role="status">No encontré una gráfica para esa búsqueda. Prueba con ventas, metas, inventario, tráfico o personal.</p>}
    </div>}
    <span className="chart-search-status" role="status">{message}</span>
    </div>
  </div>;
}
