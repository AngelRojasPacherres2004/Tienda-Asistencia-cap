import { useState } from "react";
import { ArrowRight, CalendarCheck2, Camera, Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { api } from "../lib/api";
import { Notice } from "../components/UI";

export default function Login({ onLogin }) {
  const [form, setForm] = useState({ usuario: "", password: "" });
  const [support, setSupport] = useState({ dni: "", foto: null });
  const [supportMode, setSupportMode] = useState(false); const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const submit = async (event) => { event.preventDefault(); setBusy(true); setError(""); try { const { user } = await api("/auth/login", { method: "POST", body: form }); onLogin(user); } catch (err) { setError(err.message); } finally { setBusy(false); } };
  const submitSupport = async (event) => {
    event.preventDefault(); setBusy(true); setError("");
    try {
      if (!support.foto) throw new Error("Toma una foto de rostro para validar el acceso.");
      if (support.foto.size > 3 * 1024 * 1024) throw new Error("La foto debe pesar como máximo 3 MB.");
      const foto_base64 = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(support.foto); });
      const { user } = await api("/auth/apoyo-seguridad", { method: "POST", body: { dni: support.dni, foto_base64, foto_mime: support.foto.type } }); onLogin(user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };
  return <main className="login-page">
    <section className="login-story"><div className="login-story__mesh" /><div className="login-brand"><span className="brand__mark">A</span><strong>Asiste</strong></div><div className="login-story__content"><span className="eyebrow eyebrow--light">Tus tiendas, en un solo lugar</span><h1>Asistencias y capacitaciones<br />sin perder el control.</h1><p>Gestiona el personal de cada tienda, registra su asistencia diaria y sus capacitaciones desde un espacio pensado para avanzar sin ruido.</p><div className="login-features"><div><CalendarCheck2 size={20} /><span><strong>Registro diario</strong><small>Asistencia y capacitaciones al día, por tienda.</small></span></div><div><ShieldCheck size={20} /><span><strong>Acceso protegido</strong><small>Información aislada por roles y permisos.</small></span></div></div></div><small className="login-story__footer">Asiste · Gestión de tiendas</small></section>
    <section className="login-form-side"><video className="login-form-video" autoPlay muted loop playsInline preload="auto" aria-hidden="true"><source src="/login_derecha.mp4" type="video/mp4" /></video><form className="login-card" onSubmit={supportMode ? submitSupport : submit}>
      <div className="login-card__top"><span className="login-icon">{supportMode ? <ShieldCheck size={22} /> : <LockKeyhole size={22} />}</span><span className="eyebrow">Acceso seguro</span></div><h2>{supportMode ? "Acceso de apoyo temporal" : "Qué gusto verte"}</h2><p>{supportMode ? "Ingresa tu DNI y toma una foto actual de tu rostro." : "Ingresa tus credenciales para continuar."}</p>{error && <Notice type="error">{error}</Notice>}
      {supportMode ? <><label className="login-field"><span>DNI autorizado</span><div><UserRound size={18} /><input autoFocus required inputMode="numeric" pattern="[0-9]{8}" maxLength="8" placeholder="8 dígitos" value={support.dni} onChange={(e) => setSupport({ ...support, dni: e.target.value.replace(/\D/g, "") })} /></div></label><label className={`support-photo-field ${support.foto ? "has-photo" : ""}`}><Camera size={22} /><strong>{support.foto ? "Foto lista para validar" : "Tomar foto de rostro"}</strong><small>{support.foto?.name || "Se guardará como evidencia privada del acceso."}</small><input required type="file" accept="image/*" capture="user" onChange={(e) => setSupport({ ...support, foto: e.target.files?.[0] || null })} /></label></> : <><label className="login-field"><span>Usuario</span><div><UserRound size={18} /><input autoFocus required autoComplete="username" placeholder="Tu usuario" value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} /></div></label><label className="login-field"><span>Contraseña</span><div><LockKeyhole size={18} /><input required autoComplete="current-password" type={showPassword ? "text" : "password"} placeholder="Tu contraseña" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /><button type="button" onClick={() => setShowPassword(!showPassword)} aria-label="Mostrar contraseña">{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label></>}
      <button className="button button--primary button--large" disabled={busy}>{busy ? "Verificando…" : <>Entrar al sistema <ArrowRight size={18} /></>}</button><button type="button" className="login-support-toggle" onClick={() => { setSupportMode(!supportMode); setError(""); }}>{supportMode ? "Volver al acceso con usuario" : "Soy apoyo temporal de seguridad"}</button><small className="login-help">{supportMode ? "Disponible únicamente durante el periodo autorizado por la tienda." : "¿No tienes acceso? Solicita tus credenciales al administrador."}</small>
    </form></section>
  </main>;
}
