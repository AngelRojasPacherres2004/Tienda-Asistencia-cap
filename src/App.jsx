import { Component, lazy, Suspense, useEffect, useState } from "react";
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
const GestionTienda = lazy(() => import("./pages/GestionTienda"));
const Seguridad = lazy(() => import("./pages/Seguridad"));
const TraficoSeguridad = lazy(() => import("./pages/TraficoSeguridad"));
const IncidenciasSeguridad = lazy(() => import("./pages/IncidenciasSeguridad"));
const MiTienda = lazy(() => import("./pages/MiTienda"));
const IncidenciasTienda = lazy(() => import("./pages/IncidenciasTienda"));
const Clusters = lazy(() => import("./pages/Clusters"));
const CoberturasEspeciales = lazy(() => import("./pages/CoberturasEspeciales"));
const MiTiendaGestion = lazy(() => import("./pages/MiTiendaGestion"));
const Personal = lazy(() => import("./pages/Personal"));
const ZonalModule = lazy(() => import("./pages/ZonalModule"));

const homePageByRole = {
  gerencia_general: "dashboard", gerente_comercial: "dashboard", coach: "capacitaciones", jefe_zonal: "dashboard",
  jefe_tienda: "dashboard", asistente_tienda: "dashboard", trabajador: "mi-asistencia", vendedor: "mi-asistencia", asistente: "mi-asistencia", caja: "mi-asistencia", almacenero: "mi-asistencia", jefe_area: "mi-asistencia", seguridad: "seguridad", jefe_seguridad: "seguridad",
};

class PageErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("Error al cargar la sección:", error); }
  render() {
    if (this.state.error) return <div className="notice notice--error">No se pudo cargar esta sección. Actualiza la página para obtener la versión más reciente.</div>;
    return this.props.children;
  }
}

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

  const isStoreManagement = ["jefe_tienda", "asistente_tienda"].includes(user.rol);
  const storeHome = <MiTienda user={user} onNavigate={setPage} />;
  const content = {
    dashboard: isStoreManagement || user.rol === "jefe_zonal" ? storeHome : <Dashboard user={user} />,
    documentos: <Documentos />,
    usuarios: isStoreManagement ? <Personal user={user} /> : <Usuarios user={user} />,
    tiendas: <Tiendas user={user} />,
    clusters: <Clusters />,
    cursos: <Cursos user={user} />,
    asistencias: <Asistencias />,
    capacitaciones: <Capacitaciones user={user} />,
    "mi-asistencia": <MiAsistencia />,
    "mis-capacitaciones": <MisCapacitaciones />,
    profile: <Profile />,
    gestion: <GestionTienda user={user} />,
    seguridad: <Seguridad user={user} />,
    "seguridad-trafico": <TraficoSeguridad user={user} />,
    "seguridad-incidencias": <IncidenciasSeguridad user={user} />,
    "mi-tienda": isStoreManagement ? storeHome : <Dashboard user={user} />,
    "mi-tienda-gestion": user.rol === "jefe_tienda" ? <MiTiendaGestion /> : storeHome,
    "incidencias-tienda": <IncidenciasTienda user={user} />,
    coberturas: <CoberturasEspeciales />,
    "zonal-personal": <ZonalModule section="personal" />,
    "zonal-asistencia": <ZonalModule section="asistencia" />,
    "zonal-tareas": <ZonalModule section="tareas" />,
    "zonal-supervisiones": <ZonalModule section="supervisiones" />,
    "zonal-incidencias": <ZonalModule section="incidencias" />,
  }[page] || <Dashboard user={user} />;

  return (
    <Layout user={user} page={page} onNavigate={setPage} onLogout={logout}>
      <PageErrorBoundary key={page}><Suspense fallback={<Loading />}>{content}</Suspense></PageErrorBoundary>
    </Layout>
  );
}
