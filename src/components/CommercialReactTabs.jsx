export default function CommercialReactTabs({ page, onNavigate, talentLabel = 'GESTIÓN DE TALENTO' }) {
  return (
    <nav className="page-tabs" aria-label="Páginas del dashboard" data-react-commercial-module="page-tabs">
      <button type="button" className={page === 1 ? "active" : ""} onClick={() => onNavigate(1)}><span>01</span> GESTIÓN COMERCIAL</button>
      <button type="button" className={page === 2 ? "active" : ""} onClick={() => onNavigate(2)}><span>02</span> INVENTARIO Y PREDICTIVO</button>
      <button type="button" className={page === 3 ? "active" : ""} onClick={() => onNavigate(3)}><span>03</span> {talentLabel}</button>
    </nav>
  );
}
