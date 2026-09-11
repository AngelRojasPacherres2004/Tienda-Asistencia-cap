import { useEffect, useState } from "react";
import { Building2, CalendarCheck2, UserCircle2 } from "lucide-react";
import { api, formatDate } from "../lib/api";
import { Loading, Notice, PageHeader, StatusBadge } from "../components/UI";

const roleLabels = { admin: "Administrador", jefe_zonal: "Administrador zonal", jefe_tienda: "Jefe de tienda", empleado: "Empleado", gerente: "Gerente", seguridad: "Seguridad" };

export default function Profile() {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => { api("/perfil").then(setProfile).catch((err) => setError(err.message)); }, []);
  if (error) return <Notice type="error">{error}</Notice>;
  if (!profile) return <Loading />;

  return (
    <>
      <PageHeader eyebrow="Cuenta" title="Mi perfil" subtitle="Tu información y tu asistencia del mes." />
      <section className="profile-hero">
        <span className="profile-avatar">{profile.nombres.charAt(0)}</span>
        <div>
          <StatusBadge value={profile.estado} />
          <h2>{profile.nombres} {profile.apellidos}</h2>
          <p>@{profile.usuario} · {roleLabels[profile.rol] || profile.rol}</p>
        </div>
        <div className="profile-completion">
          <strong>{profile.asistencia_mes ?? "—"}{profile.asistencia_mes !== null ? "%" : ""}</strong>
          <span>Asistencia del mes</span>
        </div>
      </section>
      <section className="worker-summary">
        <div><span className="worker-summary__icon blue"><UserCircle2 /></span><div><small>DNI</small><strong>{profile.dni}</strong></div></div>
        <div><span className="worker-summary__icon violet"><Building2 /></span><div><small>Tienda</small><strong>{profile.tienda_nombre || "—"}</strong></div></div>
        <div><span className="worker-summary__icon amber"><CalendarCheck2 /></span><div><small>Días registrados este mes</small><strong>{profile.dias_registrados_mes}</strong></div></div>
      </section>
      <section className="profile-details panel">
        <header className="panel__header"><div><h2>Información personal</h2><p>Datos administrados por tu organización</p></div></header>
        <dl>
          <div><dt>Nombre completo</dt><dd>{profile.nombres} {profile.apellidos}</dd></div>
          <div><dt>Usuario</dt><dd>{profile.usuario}</dd></div>
          <div><dt>Teléfono</dt><dd>{profile.telefono || "—"}</dd></div>
          <div><dt>Rol</dt><dd>{roleLabels[profile.rol] || profile.rol}</dd></div>
          <div><dt>Tienda</dt><dd>{profile.tienda_nombre || "—"}</dd></div>
          <div><dt>Miembro desde</dt><dd>{formatDate(profile.fecha_creacion)}</dd></div>
        </dl>
      </section>
    </>
  );
}
