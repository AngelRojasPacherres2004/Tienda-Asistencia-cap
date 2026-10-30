import { useEffect, useRef, useState } from "react";
import { Building2 } from "lucide-react";
import { Loading, Notice } from "../components/UI";

export default function CommercialPortal({ user, storeContextId = null, onStoreChange, switchingStore = false, onNavigate }) {
  const host = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    let dispose;
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        window.__DASHBOARD_CONFIG__ = {
          dataMode: "portal", groqAssistantEnabled: true, storeContextId,
          portalUser: { nombres: user?.nombres, apellidos: user?.apellidos },
        };
        const renderer = await import("../components/mount-commercial-react-independent");
        if (!active) return;
        dispose = renderer.mountCommercialReactIndependent(host.current, { user, onNavigate });
        setLoading(false);
      } catch (err) {
        if (active) { setError(err?.message || "No se pudo abrir el dashboard comercial."); setLoading(false); }
      }
    };
    load();
    return () => { active = false; dispose?.(); };
  }, [attempt, storeContextId, user, onNavigate]);

  return (
    <section className="commercial-portal" aria-label="Dashboard ejecutivo comercial">
      {user?.rol === "jefe_tienda" && user.tiendas_disponibles?.length > 1 && <div className="portal-store-context">
        <div><Building2 size={17} /><span>Vista comercial de</span></div>
        <label><span className="visually-hidden">Cambiar tienda activa</span><select aria-label="Cambiar tienda activa" value={String(user.tienda_id || "")} disabled={switchingStore} onChange={event => onStoreChange?.(event.target.value)}>{user.tiendas_disponibles.map(store => <option key={store.id} value={String(store.id)}>{store.nombre}{store.principal ? " · Principal" : " · Apoyo"}</option>)}</select></label>
        <strong>{user.tienda_id === user.tienda_principal_id ? "Tienda principal" : "Acceso de apoyo"}</strong>
      </div>}
      {loading && <Loading label="Preparando dashboard comercial…" />}
      {error && <div className="commercial-load-error"><Notice type="error">{error}</Notice><button type="button" className="button button--ghost" onClick={() => setAttempt(value => value + 1)}>Reintentar</button></div>}
      <div ref={host} className="commercial-portal-host" />
    </section>
  );
}
