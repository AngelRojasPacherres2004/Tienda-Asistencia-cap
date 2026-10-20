import { useState } from "react";
import { KeyRound } from "lucide-react";
import { api } from "../lib/api";
import "../pages/credential-permissions.css";

export default function RequiredCredentialChange({ user, onComplete, onLogout }) {
  const [form, setForm] = useState({ usuario: user.usuario || "", password: "", confirmarPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (form.password !== form.confirmarPassword) { setError("Las contraseñas no coinciden."); return; }
    setBusy(true);
    try {
      const { user: updated } = await api("/auth/change-credentials", { method: "POST", body: form });
      onComplete(updated);
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }

  return <main className="credential-change-screen">
    <section className="credential-change-card" role="dialog" aria-modal="true" aria-labelledby="credential-change-title">
      <span className="credential-change-card__icon"><KeyRound size={25}/></span>
      <h1 id="credential-change-title">Actualiza tu acceso</h1>
      <p>Sistemas habilitó el cambio de usuario y contraseña para tu cuenta. Completa ambos campos para continuar.</p>
      {error && <div className="notice notice--error" role="alert">{error}</div>}
      <form onSubmit={submit}>
        <label>Nuevo usuario<input autoFocus autoComplete="username" value={form.usuario} onChange={event => setForm({ ...form, usuario: event.target.value })} minLength={2} maxLength={40} required/></label>
        <label>Nueva contraseña<input type="password" autoComplete="new-password" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} minLength={8} maxLength={72} required/></label>
        <label>Confirmar contraseña<input type="password" autoComplete="new-password" value={form.confirmarPassword} onChange={event => setForm({ ...form, confirmarPassword: event.target.value })} minLength={8} maxLength={72} required/></label>
        <button type="submit" className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar y continuar"}</button>
      </form>
      <button type="button" className="button button--ghost credential-change-card__logout" onClick={onLogout}>Cerrar sesión</button>
    </section>
  </main>;
}
