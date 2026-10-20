import { useEffect, useRef, useState } from "react";
import { Loading, Notice } from "../components/UI";

export default function CommercialPortal({ storeContextId = null }) {
  const host = useRef(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let dispose;
    const load = async () => {
      try {
        const response = await fetch("/comercial/index.html", { cache: "no-cache" });
        if (!response.ok) throw new Error("No se pudo cargar el dashboard comercial.");
        const documentHtml = new DOMParser().parseFromString(await response.text(), "text/html");
        const script = documentHtml.querySelector('script[type="module"][src]')?.getAttribute("src");
        const stylesheet = documentHtml.querySelector('link[rel="stylesheet"]')?.getAttribute("href");
        if (!script || !stylesheet) throw new Error("El dashboard comercial necesita compilarse nuevamente.");
        window.__DASHBOARD_CONFIG__ = { dataMode: "portal", groqAssistantEnabled: true, storeContextId };
        await import(/* @vite-ignore */ new URL(script, `${location.origin}/comercial/`).href);
        if (!active) return;
        dispose = await window.mountCommercialDashboard(host.current, new URL(stylesheet, `${location.origin}/comercial/`).href);
        if (!active) dispose();
        else setLoading(false);
      } catch (err) {
        if (active) { setError(err.message); setLoading(false); }
      }
    };
    load();
    return () => { active = false; dispose?.(); };
  }, [storeContextId]);

  return (
    <section className="commercial-portal" aria-label="Dashboard ejecutivo comercial">
      {loading && <Loading />}
      {error && <Notice type="error">{error}</Notice>}
      <div ref={host} className="commercial-portal-host" />
    </section>
  );
}
