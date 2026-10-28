export default function CommercialReactHeader({ model, onLogout }) {
  const { title, cutoffDate, version, storeSummary, showLogout, userName } = model;
  return (
    <header className="brand-header" data-react-commercial-module="header">
      <div className="brand-block">
        <img src="/comercial/logo-almacen-remates.png" alt="Almacén de Remates" />
        {storeSummary && <p className="store-summary"><strong>{storeSummary.total} TIENDAS</strong><span>{storeSummary.metro} METRO</span><span>{storeSummary.outside} NO METRO</span></p>}
      </div>
      <div><h1>{title}</h1></div>
      <div className="header-actions">
        <div className="cutoff"><span>CORTE COMERCIAL</span><strong>{cutoffDate}</strong><small>{version}</small></div>
        {showLogout && <button type="button" className="logout" onClick={onLogout} title={userName}>SALIR</button>}
      </div>
    </header>
  );
}
