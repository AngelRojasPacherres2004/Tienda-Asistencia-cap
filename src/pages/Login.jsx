import { useEffect, useRef, useState } from "react";
import { ArrowRight, CalendarCheck2, Eye, EyeOff, GraduationCap, LoaderCircle, LockKeyhole, ShieldCheck, UserRound, Users } from "lucide-react";
import { api } from "../lib/api";
import "./Login.css";

export default function Login({ onLogin }) {
  const video = useRef(null);
  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const applyPreference = () => { if (preference.matches) video.current?.pause(); else video.current?.play().catch(() => {}); };
    applyPreference();
    preference.addEventListener("change", applyPreference);
    return () => preference.removeEventListener("change", applyPreference);
  }, []);
  const [form, setForm] = useState({ usuario: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async event => {
    event.preventDefault();
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { user } = await api("/auth/login", { method: "POST", body: form }); onLogin(user);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  };

  return <main className="portal-login">
    <video ref={video} className="portal-login__video" muted loop playsInline preload="auto" aria-hidden="true" tabIndex={-1}><source src="/login_actual.mp4" type="video/mp4"/></video>
    <div className="portal-login__layout">
      <header className="portal-login__brand"><img src="/logo-almacen-remates.png" alt="Almacén de Remates" width="124" height="72"/></header>
      <section className="portal-login__intro" aria-labelledby="login-intro-title">
        <span className="portal-login__eyebrow"><i/>CONECTADOS PARA CRECER</span>
        <h1 id="login-intro-title"><span className="portal-login__headline-line">Tu equipo.</span><span className="portal-login__headline-line">Tus tiendas.</span><span>Todo en orden.</span></h1>
        <p>La gestión de nuestras tiendas empieza aquí. Un solo espacio para acompañar a tu equipo, cada día.</p>
        <div className="portal-login__features"><span><Users size={17}/>Personas</span><span><CalendarCheck2 size={17}/>Asistencia</span><span><GraduationCap size={17}/>Capacitación</span></div>
      </section>
      <section className="portal-login__access" aria-labelledby="login-form-title">
        <form className="portal-login__card" onSubmit={submit} aria-busy={busy}>
          <span className="portal-login__access-icon"><LockKeyhole size={25}/></span>
          <span className="portal-login__eyebrow">BIENVENIDO A ASISTE</span>
          <h2 id="login-form-title">Ingresa a tu espacio</h2>
          <p>Todo listo para empezar. Ingresa con tu usuario y contraseña.</p>
          {error && <div className="portal-login__error" role="alert">{error}</div>}
          <fieldset disabled={busy}>
              <label className="portal-login__field"><span>Usuario</span><div><UserRound size={18}/><input key="usuario" name="username" required autoComplete="username" autoCapitalize="none" spellCheck={false} placeholder="Ingresa tu usuario" value={form.usuario} onChange={event => setForm({ ...form, usuario: event.target.value })}/></div></label>
              <label className="portal-login__field"><span>Contraseña</span><div><LockKeyhole size={18}/><input name="password" required autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Ingresa tu contraseña" value={form.password} onChange={event => setForm({ ...form, password: event.target.value })}/><button type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={showPassword}>{showPassword ? <EyeOff size={19}/> : <Eye size={19}/>}</button></div></label>
            <button type="submit" className="portal-login__submit">{busy ? <><LoaderCircle size={19} className="portal-login__spinner"/>Verificando acceso…</> : <>Ingresar al portal<ArrowRight size={19}/></>}</button>
          </fieldset>
          <div className="portal-login__help"><ShieldCheck size={16}/><span>¿Necesitas acceso? Contacta al administrador de tu tienda.</span></div>
        </form>
      </section>
      <footer className="portal-login__footer"><span>Almacén de Remates · Asiste</span></footer>
    </div>
  </main>;
}
