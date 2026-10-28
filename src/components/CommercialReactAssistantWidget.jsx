import React, { useEffect, useRef } from "react";
import assistantCss from "./commercial-assistant.css?inline";

const scopedCss = `@scope (.assistant-react-root) { ${assistantCss.replaceAll(":host", ".assistant-react-root")} }`;

export default function CommercialReactAssistantWidget({ model, onAction }) {
  const messages = useRef(null);
  const emit = (type, value) => onAction({ type, value });
  useEffect(() => { if (model.open && messages.current) messages.current.scrollTop = messages.current.scrollHeight; }, [model.open, model.messages, model.busy]);
  return <div className="assistant-react-root" data-react-commercial-module="assistant-widget">
    <style>{scopedCss}</style>
    <button type="button" className="assistant-launcher" onClick={() => emit("toggle")} aria-expanded={model.open} aria-label="Abrir asistente comercial"><span>IA</span></button>
    {model.open && <section className="assistant-panel" aria-label="Asistente comercial con inteligencia artificial">
      <header><div><span>IA · GROQ</span><strong>{model.title}</strong></div><button type="button" onClick={() => emit("toggle")} aria-label="Cerrar asistente">×</button></header>
      <div className="assistant-suggestions" aria-label="Consultas sugeridas">{model.suggestions.map(suggestion => <button type="button" key={suggestion.label} onClick={() => emit("suggestion", suggestion.prompt)}>{suggestion.label}</button>)}</div>
      <div ref={messages} className="assistant-messages" aria-live="polite">
        {model.messages.map((message, index) => <article key={index} className={message.role === "user" ? "user" : undefined}><span>{message.role === "user" ? "TÚ" : "IA"}</span><p>{message.content}</p></article>)}
        {model.busy && <article><span>IA</span><p className="assistant-thinking">Analizando…</p></article>}
      </div>
      {model.error && <p className="assistant-error" role="alert">{model.error}</p>}
      <form className="assistant-composer" onSubmit={event => { event.preventDefault(); emit("send"); }}>
        <textarea rows={2} name="assistantQuestion" maxLength={2000} placeholder="Pregunta sobre los datos visibles…" value={model.draft} onChange={event => emit("draft", event.target.value)} disabled={model.busy} />
        <div><label className="assistant-upload" title="Grabar o elegir un audio">🎧<input type="file" accept="audio/*" capture="user" disabled={model.busy} onChange={event => { const file = event.target.files?.[0]; if (file) onAction({ type: "audio", file }); event.target.value = ""; }} /></label>
          {model.canRecord && <button type="button" className={`assistant-mic${model.recording ? " recording" : ""}`} onClick={() => emit("record")} disabled={model.busy} aria-label={model.recording ? "Detener grabación" : "Hablar por micrófono"}>{model.recording ? "■" : "🎤"}</button>}
          <button type="submit" className="assistant-send" disabled={model.busy || !model.draft.trim()}>ENVIAR</button>
        </div>
      </form>
    </section>}
  </div>;
}
