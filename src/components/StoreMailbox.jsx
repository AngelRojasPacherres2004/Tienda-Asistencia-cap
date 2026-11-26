import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, Check, FileClock, LoaderCircle, MessageSquareText, Send, X } from "lucide-react";
import { api, todayISO } from "../lib/api";
import "./StoreMailbox.css";
import { mailboxConversation, mailboxMessageStatus } from "../../shared/store-mailbox.js";

const statusLabels = { pendientes: "Sin ver", vistos: "Visto · sin responder", respondidos: "Respondido" };

const dateLabel = value => value
  ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", year: "numeric", timeZone: "America/Lima" }).format(new Date(`${String(value).slice(0, 10)}T12:00:00Z`))
  : "Fecha pendiente";
const dateTimeLabel = value => value
  ? new Intl.DateTimeFormat("es-PE", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Lima" }).format(new Date(value))
  : "";
const fullName = user => [user?.nombres, user?.apellidos].filter(Boolean).join(" ") || "Usuario";

export default function StoreMailbox({ user, hidden, embedded = false, isOpen = false, onClose, onOpen, onPendingChange }) {
  const isZonal = user.rol === "jefe_zonal";
  const [localOpen, setLocalOpen] = useState(false);
  const open = embedded ? isOpen : localOpen;
  const setOpen = value => { if (embedded) { if (value) onOpen?.(); else onClose?.(); } else setLocalOpen(value); };
  const [loaded, setLoaded] = useState(false);
  const [startupNotice, setStartupNotice] = useState(false);
  const startupChecked = useRef(false);
  const startupDialog = useRef(null);
  useEffect(() => {
    if (!startupNotice) return;
    const previousFocus = document.activeElement;
    startupDialog.current?.querySelector("button")?.focus();
    return () => { if (previousFocus?.isConnected) previousFocus.focus(); };
  }, [startupNotice]);
  const [tab, setTab] = useState("todos");
  const [storeId, setStoreId] = useState("");
  const [startingConversation, setStartingConversation] = useState(false);
  const [data, setData] = useState({ conversations: [], documentos: [] });
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async (signal) => {
    setLoading(true);
    try {
      const result = await api("/bandeja-zonal-tienda", { cacheTtlMs: 0, signal });
      const conversations = isZonal
        ? await Promise.all((result.tiendas || []).map(async store => ({
          ...await api(`/bandeja-zonal-tienda?tienda_id=${store.id}`, { cacheTtlMs: 0, signal }), store,
        })))
        : [{ ...result, store: { id: result.tienda_id, nombre: (await api("/perfil", { signal })).tienda_nombre || user.tienda_nombre || "Mi tienda" } }];
      const documentos = conversations.flatMap(item => (item.documentos || []).map(document => ({ ...document, tienda_id: item.store.id, tienda_nombre: item.store.nombre })))
        .sort((a, b) => String(a.fecha_vencimiento).localeCompare(String(b.fecha_vencimiento)));
      setData({ conversations, documentos });
      setLoaded(true);
      setError("");
    } catch (err) {
      if (err.name !== "AbortError") setError(err.message || "No se pudo cargar la bandeja.");
    } finally {
      setLoading(false);
    }
  }, [isZonal, user.tienda_nombre]);

  useEffect(() => {
    if (hidden) return undefined;
    const controller = new AbortController();
    void refresh(controller.signal);
    const interval = window.setInterval(() => void refresh(), 45000);
    return () => { controller.abort(); window.clearInterval(interval); };
  }, [hidden, refresh]);

  useEffect(() => {
    if (!open) return undefined;
    const closeOnEscape = event => { if (event.key === "Escape") { if (embedded) onClose?.(); else setLocalOpen(false); } };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open, embedded, onClose]);

  useEffect(() => { if (hidden) setLocalOpen(false); }, [hidden]);

  const conversations = useMemo(() => data.conversations.map(item => {
    const summary = mailboxConversation(item.mensajes || [], user.id);
    const other = summary.messages.find(message => Number(message.remitente_id) !== Number(user.id))?.remitente
      || summary.messages.find(message => Number(message.destinatario_id) !== Number(user.id))?.destinatario;
    return { ...item, ...summary, name: isZonal ? "Administrador de tienda" : other ? fullName(other) : "Jefe zonal" };
  }).sort((a, b) => Date.parse(b.latest?.created_at || 0) - Date.parse(a.latest?.created_at || 0)), [data.conversations, user.id, isZonal]);
  const active = conversations.find(item => String(item.store.id) === storeId);
  const startedConversations = conversations.filter(item => item.messages.length > 0);
  const unread = conversations.reduce((total, item) => total + item.unread, 0);
  const pendingReplies = conversations.reduce((total, item) => total + item.pendingReplies, 0);
  useEffect(() => { onPendingChange?.(pendingReplies); }, [pendingReplies, onPendingChange]);
  useEffect(() => {
    if (!loaded || startupChecked.current) return;
    startupChecked.current = true;
    if ((isZonal && pendingReplies > 0) || data.documentos.length > 0) setStartupNotice(true);
  }, [loaded, isZonal, pendingReplies, data.documentos.length]);
  const visible = startedConversations.filter(item => tab === "todos" || item.status === tab);

  useEffect(() => {
    if (!open || !storeId || tab === "documentos") return;
    const current = data.conversations.find(item => String(item.store.id) === storeId);
    const ids = (current?.mensajes || []).filter(message => Number(message.destinatario_id) === Number(user.id) && !message.leido_en).map(message => message.id);
    if (!ids.length) return;
    let cancelled = false;
    void Promise.all(ids.map(async id => {
      await api(`/bandeja-zonal-tienda/mensajes/${id}/leido`, { method: "PATCH" });
      return id;
    })).then(readIds => {
      if (cancelled) return;
      setData(value => ({ ...value, conversations: value.conversations.map(item => ({
        ...item, mensajes: (item.mensajes || []).map(message => readIds.includes(message.id) ? { ...message, leido_en: new Date().toISOString() } : message),
      })) }));
    }).catch(err => { if (!cancelled) setError(err.message || "No se pudo confirmar la lectura."); });
    return () => { cancelled = true; };
  }, [open, storeId, tab, data.conversations, user.id]);

  const send = async event => {
    event.preventDefault();
    if (!draft.trim() || sending || !active) return;
    setSending(true);
    try {
      await api("/bandeja-zonal-tienda/mensajes", { method: "POST", body: { tienda_id: Number(active.store.id), mensaje: draft.trim() } });
      setDraft("");
      await refresh();

    } catch (err) {
      setError(err.message || "No se pudo enviar el mensaje.");
    } finally {
      setSending(false);
    }
  };

  if (hidden) return null;

  return <>
    {!embedded && <button type="button" className="store-mailbox-trigger" onClick={() => setOpen(!open)} aria-label={open ? "Cerrar bandeja zonal" : "Abrir bandeja zonal"} aria-expanded={open}>
      {open ? <X size={20} /> : <MessageSquareText size={20} />}
      <span>Bandeja zonal</span>
      {unread > 0 && <b>{unread > 9 ? "9+" : unread}</b>}
    </button>}
    {startupNotice && <div className="store-mailbox-startup-backdrop">
      <section ref={startupDialog} className="store-mailbox-startup" role="dialog" aria-modal="true" aria-labelledby="store-mailbox-startup-title" onKeyDown={event => {
        if (event.key === "Escape") { event.stopPropagation(); setStartupNotice(false); }
        if (event.key === "Tab") {
          const buttons = startupDialog.current.querySelectorAll("button");
          const first = buttons[0], last = buttons[buttons.length - 1];
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      }}>
        <Bell size={28} />
        <h2 id="store-mailbox-startup-title">{isZonal && pendingReplies > 0
          ? `Tienes ${pendingReplies} ${pendingReplies === 1 ? "mensaje por contestar" : "mensajes por contestar"}`
          : `Tienes ${data.documentos.length} ${data.documentos.length === 1 ? "documento por vencer" : "documentos por vencer"}`}</h2>
        {isZonal && pendingReplies > 0 && <>
          <p>Los mensajes vistos también siguen pendientes hasta que envíes una respuesta.</p>
          <ul className="store-mailbox-startup__messages">{conversations.filter(item => item.pendingReplies > 0).map(item => <li key={item.store.id}><span>{item.store.nombre}</span><strong>{item.pendingReplies}</strong></li>)}</ul>
        </>}
        {data.documentos.length > 0 && <>
          {isZonal && pendingReplies > 0 && <h3>{data.documentos.length} {data.documentos.length === 1 ? "documento por vencer" : "documentos por vencer"}</h3>}
          <p>Revisa los próximos vencimientos en la bandeja.</p>
        </>}
        <div><button type="button" onClick={() => setStartupNotice(false)}>Más tarde</button>
          {isZonal && pendingReplies > 0 && <button type="button" onClick={() => { setStartupNotice(false); setTab("todos"); setStoreId(""); setOpen(true); }}>Ir a la bandeja</button>}
          {data.documentos.length > 0 && <button type="button" onClick={() => { setStartupNotice(false); setTab("documentos"); setStoreId(""); setOpen(true); }}>Ver vencimientos</button>}
        </div>
      </section>
    </div>}
    {open && <div className={embedded ? "store-mailbox-page" : "store-mailbox-backdrop"} onMouseDown={event => { if (!embedded && event.target === event.currentTarget) setOpen(false); }}>
      <section className="store-mailbox" role={embedded ? "region" : "dialog"} aria-modal={embedded ? undefined : true} aria-labelledby="store-mailbox-title">
        <header className="store-mailbox__header">
          <div><span className="store-mailbox__eyebrow">COMUNICACIÓN DE TIENDA</span><h2 id="store-mailbox-title">Bandeja de mensajes</h2><p>Mensajes con {isZonal ? "el administrador de tienda" : "tu jefe zonal"}</p></div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar bandeja"><X size={19} /></button>
        </header>
        <nav className="store-mailbox__tabs" aria-label="Secciones de la bandeja">
          {[["todos", "Todos"], ["pendientes", "Pendientes"], ["vistos", "Vistos"], ["respondidos", "Respondidos"]].map(([key, label]) => <button key={key} type="button" className={tab === key ? "is-active" : ""} onClick={() => { setTab(key); setStoreId(""); setDraft(""); setStartingConversation(false); }}>{label}<i>{key === "todos" ? startedConversations.length : startedConversations.filter(item => item.status === key).length}</i></button>)}
          <button type="button" className={tab === "documentos" ? "is-active" : ""} onClick={() => { setTab("documentos"); setStoreId(""); }}><FileClock size={15} />Vencimientos</button>
        </nav>
        {tab !== "documentos" && !active && <div className="store-mailbox__new-conversation">
          <button type="button" onClick={() => setStartingConversation(value => !value)}>Nuevo mensaje</button>
          {startingConversation && <label>Selecciona {isZonal ? "una tienda" : "la conversación"}<select aria-label="Destino del nuevo mensaje" value="" onChange={event => { setStoreId(event.target.value); setDraft(""); setStartingConversation(false); }}>
            <option value="" disabled>Seleccionar…</option>{conversations.map(item => <option key={item.store.id} value={item.store.id}>{item.name} · {item.store.nombre}</option>)}
          </select></label>}
        </div>}
        {error && <div className="store-mailbox__error" role="alert">{error}</div>}
        <div className="store-mailbox__content" aria-live="polite">
          {loading && !conversations.length && <div className="store-mailbox__empty"><LoaderCircle className="store-mailbox__spinner" size={21} />Cargando bandeja…</div>}
          {!loading && isZonal && !conversations.length && <div className="store-mailbox__empty">No tienes tiendas asignadas a tu zona.</div>}
          {tab === "documentos" && <div className="store-mailbox__documents">
            {(data.documentos || []).length ? data.documentos.map(document => {
              const days = Math.max(0, Math.round((Date.parse(`${document.fecha_vencimiento}T12:00:00Z`) - Date.parse(`${todayISO()}T12:00:00Z`)) / 86400000));
              return <article className={`store-mailbox__document ${days <= 7 ? "is-urgent" : ""}`} key={`${document.tienda_id}:${document.id}`}>
                <span className="store-mailbox__document-icon"><FileClock size={18} /></span>
                <div><span className="store-mailbox__store-label">{document.tienda_nombre}</span><strong>{document.tipo_documento}</strong><small>{document.codigo ? `Código ${document.codigo} · ` : ""}{dateLabel(document.fecha_vencimiento)}</small></div>
                <b>{days === 0 ? "Hoy" : `${days} d`}</b>
              </article>;
            }) : <div className="store-mailbox__empty">No hay documentos próximos a vencer.</div>}
          </div>}
          {tab !== "documentos" && (active ? <>
            <button type="button" className="store-mailbox__back" onClick={() => { setStoreId(""); setDraft(""); }}><ArrowLeft size={16} />Conversaciones</button>
            <div className="store-mailbox__conversation-heading"><strong>{active.name}</strong><span className="store-mailbox__store-label">{active.store.nombre}</span></div>
            <div className="store-mailbox__messages">{active.messages.map(message => {
              const own = Number(message.remitente_id) === Number(user.id);
              return <article className={`store-mailbox__message ${own ? "is-own" : ""} ${!own && !message.leido_en ? "is-unread" : ""}`} key={message.id}>
                <div className="store-mailbox__message-top"><strong>{own ? "Tú" : isZonal ? "Administrador de tienda" : fullName(message.remitente)}</strong><time>{dateTimeLabel(message.created_at)}</time></div>
                <p>{message.mensaje}</p>
                <small className="store-mailbox__delivery"><Check size={13} />{statusLabels[mailboxMessageStatus(message, active.messages)]}</small>
              </article>;
            })}</div>
          </> : <div className="store-mailbox__conversations">{visible.map(item => <button type="button" className={`store-mailbox__conversation ${item.unread ? "is-unread" : ""}`} key={item.store.id} onClick={() => { setStoreId(String(item.store.id)); setDraft(""); }}>
            <span className="store-mailbox__avatar">{item.name.slice(0, 1).toUpperCase()}</span>
            <span className="store-mailbox__preview"><strong>{item.name}</strong><span>{item.store.nombre}</span><small>{item.latest?.mensaje || "Iniciar conversación"}</small><em>{item.latest ? statusLabels[item.status] : "Sin mensajes"}</em></span>
            <span className="store-mailbox__conversation-meta"><time>{dateTimeLabel(item.latest?.created_at)}</time>{item.unread > 0 && <b>{item.unread}</b>}</span>
          </button>)}{!visible.length && !loading && <div className="store-mailbox__empty"><Bell size={21} />No hay conversaciones en este filtro.</div>}</div>)}
        </div>
        {tab !== "documentos" && active && <form className="store-mailbox__compose" onSubmit={send}>
          <label htmlFor="store-mailbox-draft">{active.needsReply ? "Respuesta pendiente: envía un mensaje para marcar como respondido" : "Nuevo mensaje"}</label>
          <textarea id="store-mailbox-draft" rows="3" maxLength="2000" value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escribe un mensaje para tu contraparte…" disabled={!active} />
          <div><small>{draft.length}/2000</small><button type="submit" disabled={!draft.trim() || sending || !active}>{sending ? <LoaderCircle className="store-mailbox__spinner" size={16} /> : <Send size={16} />}Enviar</button></div>
        </form>}
      </section>
    </div>}
  </>;
}
