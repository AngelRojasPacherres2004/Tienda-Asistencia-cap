import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./lib/api";
import Layout from "./components/Layout";
import { Loading } from "./components/UI";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Usuarios = lazy(() => import("./pages/Usuarios"));
const Tiendas = lazy(() => import("./pages/Tiendas"));
const Cursos = lazy(() => import("./pages/Cursos"));
const Documentos = lazy(() => import("./pages/Documentos"));
const Asistencias = lazy(() => import("./pages/Asistencias"));
const Capacitaciones = lazy(() => import("./pages/Capacitaciones"));
const MiAsistencia = lazy(() => import("./pages/MiAsistencia"));
const MisCapacitaciones = lazy(() => import("./pages/MisCapacitaciones"));
const Profile = lazy(() => import("./pages/Profile"));
const Incidentes = lazy(() => import("./pages/Incidentes"));
const DocumentosLegales = lazy(() => import("./pages/DocumentosLegales"));
const Consultas = lazy(() => import("./pages/Consultas"));
const NotificacionesAsistencia = lazy(() => import("./pages/NotificacionesAsistencia"));
const ErroresAmonestaciones = lazy(() => import("./pages/ErroresAmonestaciones"));
const Trafico = lazy(() => import("./pages/Trafico"));
const MiTienda = lazy(() => import("./pages/MiTienda"));
const ModuloProximo = lazy(() => import("./pages/ModuloProximo"));
const SeguridadInicio = lazy(() => import("./pages/SeguridadInicio"));
const PersonalGeneral = lazy(() => import("./pages/PersonalGeneral"));
const Metas = lazy(() => import("./pages/Metas"));

const homePageByRole = { admin: "dashboard", jefe_tienda: "dashboard", empleado: "mi-asistencia", seguridad: "seguridad-inicio", coach: "cursos" };

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState("dashboard");

  useEffect(() => {
    api("/auth/me")
      .then(({ user: account }) => {
        setUser(account);
        setPage(homePageByRole[account.rol] || "dashboard");
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  const login = (account) => {
    setUser(account);
    setPage(homePageByRole[account.rol] || "dashboard");
  };
  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
  };

  if (checking) return <div className="splash"><Loading label="Preparando tu espacio…" /></div>;
  if (!user) return <Suspense fallback={<div className="splash"><Loading /></div>}><Login onLogin={login} /></Suspense>;

  const content = {
    dashboard: <Dashboard user={user} />,
    documentos: <Documentos />,
    reportes: <Documentos variant="reportes" />,
    usuarios: <Usuarios user={user} />,
    tiendas: <Tiendas />,
    cursos: <Cursos user={user} />,
    asistencias: <Asistencias />,
    capacitaciones: <Capacitaciones user={user} />,
    "mi-asistencia": <MiAsistencia />,
    "mis-capacitaciones": <MisCapacitaciones />,
    profile: <Profile />,
    incidentes: <Incidentes user={user} />,
    "documentos-legales": <DocumentosLegales user={user} />,
    consultas: <Consultas user={user} />,
    "notificaciones-asistencia": <NotificacionesAsistencia user={user} />,
    "errores-amonestaciones": <ErroresAmonestaciones user={user} />,
    trafico: <Trafico />,
    "mi-tienda": <MiTienda user={user} onNavigate={setPage} />,
    tareas: <ModuloProximo title="Tareas" />,
    controles: <ModuloProximo title="Controles" />,
    "seguridad-inicio": <SeguridadInicio onNavigate={setPage} />,
    zonas: <Usuarios user={user} variant="zonas" />,
    "personal-general": <PersonalGeneral />,
    metas: <Metas />,
  }[page] || <Dashboard user={user} />;

  return (
    <Layout user={user} page={page} onNavigate={setPage} onLogout={logout}>
      <Suspense fallback={<Loading />}>{content}</Suspense>
    </Layout>
  );
}
