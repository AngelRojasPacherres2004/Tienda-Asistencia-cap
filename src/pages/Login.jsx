import { useState } from "react";
import { ArrowRight, CalendarCheck2, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { Notice } from "../components/UI";

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ usuario: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event) => {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const { user } = await api("/auth/login", { method: "POST", body: form });
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="login-page">
      <section className="login-story">
        <div className="login-story__mesh" />
        <div className="login-brand"><span className="brand__mark">A</span><strong>Asiste</strong></div>
        <div className="login-story__content">
          <span className="eyebrow eyebrow--light">Tus tiendas, en un solo lugar</span>
          <h1>Asistencias y capacitaciones<br />sin perder el control.</h1>
          <p>Gestiona el personal de cada tienda, registra su asistencia diaria y sus capacitaciones desde un espacio pensado para avanzar sin ruido.</p>
          <div className="login-features">
            <div><CalendarCheck2 size={20} /><span><strong>Registro diario</strong><small>Asistencia y capacitaciones al día, por tienda.</small></span></div>
            <div><ShieldCheck size={20} /><span><strong>Acceso protegido</strong><small>Información aislada por roles y permisos.</small></span></div>
          </div>
        </div>
        <small className="login-story__footer">Asiste · Gestión de tiendas</small>
      </section>
      <section className="login-form-side">
        <video
          className="login-form-video"
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-hidden="true"
        >
          <source src="/login_derecha.mp4" type="video/mp4" />
        </video>
        <form className="login-card" onSubmit={submit}>
          <div className="login-card__top">
            <span className="login-icon"><LockKeyhole size={22} /></span>
            <span className="eyebrow">Acceso seguro</span>
          </div>
          <h2>Qué gusto verte</h2>
          <p>Ingresa tus credenciales para continuar.</p>
          {error && <Notice type="error">{error}</Notice>}
          <label className="login-field">
            <span>Usuario</span>
            <div><UserRound size={18} /><input autoFocus required autoComplete="username" placeholder="Tu usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} /></div>
          </label>
          <label className="login-field">
            <span>Contraseña</span>
            <div>
              <LockKeyhole size={18} />
              <input required autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Tu contraseña" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar contraseña">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </div>
          </label>
          <button className="button button--primary button--large" disabled={busy}>
            {busy ? "Verificando…" : <>Entrar al sistema <ArrowRight size={18} /></>}
          </button>
          <small className="login-help">¿No tienes acceso? Solicita tus credenciales al administrador.</small>
        </form>
      </section>
    </main>
  );
}
