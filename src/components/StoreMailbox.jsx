import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, Check, ChevronDown, FileClock, Inbox, LoaderCircle, MessageSquareText, Send, X } from "lucide-react";
import { api, todayISO } from "../lib/api";
import "./StoreMailbox.css";

const dateLabel = value => value
  ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Lima" }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`))
  : "Fecha pendiente";
const dateTimeLabel = value => value
  ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(value))
  : "";
const fullName = user => [user?.nombres, user?.apellidos].filter(Boolean).join(" ") || "Usuario";

export default function StoreMailbox({ user, hidden }) {
  const isZonal = user.rol === "jefe_zonal";
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState("recibidos");
  const [storeId, setStoreId] = useState("");
  const [data, setData] = useState({ tiendas: [], mensajes: [], documentos: [] });
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal) => {
    setLoading(true);
    try {
      const query = isZonal && storeId ? `?tienda_id=${encodeURIComponent(storeId)}` : "";
      const result = await api(`/bandeja-zonal-tienda${query}`, { cacheTtlMs: 0, signal });
      setData(result);
      if (isZonal && !storeId && result.tiendas?.length) setStoreId(String(result.tiendas[0].id));
      setError("");
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || "No se pudo cargar la bandeja.");
    } finally {
      setLoading(false);
    }
  }, [isZonal, storeId]);

  useEffect(() => {
    if (!open) return undefined;
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = window.setInterval(() => void refresh(), 45000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [open, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => { if (event.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  useEffect(() => { if (hidden) setOpen(false); }, [hidden]);

  const messages = useMemo(() => data.mensajes || [], [data.mensajes]);
  const received = messages.filter(message => Number(message.destinatario_id) === Number(user.id));
  const sent = messages.filter(message => Number(message.remitente_id) === Number(user.id));
  const unread = received.filter(message => !message.leido_en).length;

  const selectTab = async next => {
    setTab(next);
    if (next !== "recibidos") return;
    const unreadIds = received.filter(message => !message.leido_en).map(message => message.id);
    if (!unreadIds.length) return;
    setData(current => ({ ...current, mensajes: (current.mensajes || []).map(message =>
      unreadIds.includes(message.id) ? { ...message, leido_en: new Date().toISOString() } : message) }));
    await Promise.all(unreadIds.map(id => api(`/bandeja-zonal-tienda/mensajes/${id}/leido`, { method: "PATCH" }).catch(() => {})));
  };

  const send = async event => {
    event.preventDefault();
    if (!draft.trim() || sending || (isZonal && !storeId)) return;
    setSending(true);
    try {
      await api("/bandeja-zonal-tienda/mensajes", { method: "POST", body: { tienda_id: Number(data.tienda_id || storeId), mensaje: draft.trim() } });
      setDraft("");
      await refresh();
      setTab("enviados");
    } catch (err) {
      setError(err.message || "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  };

  if (hidden) return null;

  return <>
    <button type="button" className="store-mailbox-trigger" onClick={() => setOpen(value => !value)} aria-label={open ? "Cerrar bandeja zonal" : "Abrir bandeja zonal"} aria-expanded={open}>
      {open ? <X size={20} /> : <MessageSquareText size={20} />}
      <span>Bandeja zonal</span>
      {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
    </button>
    {open && <div className="store-mailbox-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
      <section className="store-mailbox" role="dialog" aria-modal="true" aria-labelledby="store-mailbox-title">
        <header className="store-mailbox__header">
          <div><span className="store-mailbox__eyebrow">COMUNICACIÓN DE TIENDA</span><h2 id="store-mailbox-title">Bandeja de mensajes</h2><p>Mensajes con {isZonal ? "el administrador de tienda" : "tu jefe zonal"}</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar bandeja"><X size={19} /></button>
        </header>
        {isZonal && <label className="store-mailbox__store"><span>Tienda</span><span className="store-mailbox__select"><Inbox size={16} /><select value={storeId} onChange={event => setStoreId(event.target.value)} aria-label="Seleccionar tienda">
          {(data.tiendas || []).map(store => <option key={store.id} value={String(store.id)}>{store.nombre}</option>)}
        </select><ChevronDown size={15} /></span></label>}
        <nav className="store-mailbox__tabs" aria-label="Secciones de la bandeja">
          <button type="button" className={tab === "recibidos" ? "is-active" : ""} onClick={() => void selectTab("recibidos")}>Recibidos{unread > 0 && <i>{unread}</i>}</button>
          <button type="button" className={tab === "enviados" ? "is-active" : ""} onClick={() => void selectTab("enviados")}>Enviados</button>
          {!isZonal && <button type="button" className={tab === "documentos" ? "is-active" : ""} onClick={() => void selectTab("documentos")}><FileClock size={15} />Vencimientos</button>}
        </nav>
        {error && <div className="store-mailbox__error" role="alert">{error}</div>}
        <div className="store-mailbox__content" aria-live="polite">
          {loading && !messages.length && <div className="store-mailbox__empty"><LoaderCircle className="store-mailbox__spinner" size={21} />Cargando bandeja…</div>}
          {!loading && isZonal && !data.tiendas?.length && <div className="store-mailbox__empty">No tienes tiendas asignadas a tu zona.</div>}
          {tab === "documentos" && !isZonal && <div className="store-mailbox__documents">
            {(data.documentos || []).length ? data.documentos.map(document => {
              const days = Math.max(0, Math.round((Date.parse(`${document.fecha_vencimiento}T12:00:00Z`) - Date.parse(`${todayISO()}T12:00:00Z`)) / 86400000));
              return <article className={`store-mailbox__document ${days <= 7 ? "is-urgent" : ""}`} key={document.id}>
                <span className="store-mailbox__document-icon"><FileClock size={18} /></span>
                <div><strong>{document.tipo_documento}</strong><small>{document.codigo ? `Código ${document.codigo} · ` : ""}{dateLabel(document.fecha_vencimiento)}</small></div>
                <b>{days === 0 ? "Hoy" : `${days} d`}</b>
              </article>;
            }) : <div className="store-mailbox__empty">No hay documentos próximos a vencer.</div>}
          </div>}
          {tab !== "documentos" && (() => {
            const rows = tab === "recibidos" ? received : sent;
            return rows.length ? <div className="store-mailbox__messages">{rows.map(message => <article className={`store-mailbox__message ${Number(message.destinatario_id) === Number(user.id) && !message.leido_en ? "is-unread" : ""}`} key={message.id}>
              <div className="store-mailbox__message-top"><strong>{tab === "recibidos" ? `De ${fullName(message.remitente)}` : `Para ${fullName(message.destinatario)}`}</strong><time>{dateTimeLabel(message.created_at)}</time></div>
              <p>{message.mensaje}</p>
              {tab === "enviados" && <small className="store-mailbox__delivery">{message.leido_en ? <><Check size={13} /> Leído</> : "Enviado"}</small>}
            </article>)}</div> : <div className="store-mailbox__empty"><Bell size={21} />{tab === "recibidos" ? "Aún no tienes mensajes recibidos." : "Aún no has enviado mensajes."}</div>;
          })()}
        </div>
        {tab !== "documentos" && <form className="store-mailbox__compose" onSubmit={send}>
          <label htmlFor="store-mailbox-draft">Nuevo mensaje</label>
          <textarea id="store-mailbox-draft" rows="3" maxLength="2000" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe un mensaje para tu contraparte…" disabled={isZonal && !storeId} />
          <div><small>{draft.length}/2000</small><button type="submit" disabled={!draft.trim() || sending || (isZonal && !storeId)}>{sending ? <LoaderCircle className="store-mailbox__spinner" size={16} /> : <Send size={16} />}Enviar</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
