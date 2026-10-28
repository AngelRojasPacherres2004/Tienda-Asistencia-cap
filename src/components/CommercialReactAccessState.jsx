import React from "react";

export default function CommercialReactAccessState({ model, onAction }) {
  const emit = (type, value) => onAction({ type, value });
  if (model.mode === "validating") return <section className="status-panel" data-react-commercial-module="commercial-access"><span className="loader" /><strong>Validando acceso seguro…</strong></section>;
  if (model.mode === "denied") return <section className="status-panel error" data-react-commercial-module="commercial-access"><strong>No tienes acceso al dashboard comercial.</strong><span>{model.error || "Inicia sesión en Asiste con un rol comercial autorizado."}</span><a href="/">VOLVER A ASISTE</a></section>;
  if (model.mode === "error") return <section className="status-panel error" data-react-commercial-module="commercial-access"><strong>No se pudo abrir el dashboard.</strong><span>{model.error}</span><button type="button" className="retry-button" onClick={() => emit("retry")}>REINTENTAR</button></section>;
  if (model.mode === "loading") return <section className="status-panel" aria-label="Cargando información" data-react-commercial-module="commercial-access"><span className="loader" /></section>;
  return <section className="login-page" aria-label="Inicio de sesión" data-react-commercial-module="commercial-access"><form className="login-card" onSubmit={event => { event.preventDefault(); emit("login"); }}>
    <img src="/comercial/logo-almacen-remates.png" alt="Almacén de Remates" />
    <div><span className="login-kicker">ACCESO PRIVADO</span><h1>Dashboard ejecutivo</h1><p>Ingresa con tu usuario y contraseña asignados.</p></div>
    <label><span>USUARIO</span><input type="text" name="identity" autoComplete="username" required value={model.email} onChange={event => emit("identity", event.target.value)} /></label>
    <label><span>CONTRASEÑA</span><input type="password" name="password" autoComplete="current-password" required minLength={3} value={model.password} onChange={event => emit("password", event.target.value)} /></label>
    {model.error && <p className="login-error" role="alert">{model.error}</p>}
    <button type="submit" disabled={model.busy || !model.email || !model.password}>{model.busy ? "INGRESANDO…" : "INGRESAR"}</button>
  </form></section>;
}
