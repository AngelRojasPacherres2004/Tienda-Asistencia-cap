import { Component, Fragment, lazy, Suspense, useEffect, useRef, useState } from "react";
import { api, setStoreContext } from "./lib/api";
import Layout from "./components/Layout";
import { Loading, Notice } from "./components/UI";

const Login = lazy(() => import("./pages/Login"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const CommercialDashboard = lazy(() => import("./pages/CommercialDashboard"));
const CommercialPersonnel = lazy(() => import("./pages/CommercialPersonnel"));
const CommercialPortal = lazy(() => import("./pages/CommercialPortal"));
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
const Reportes = lazy(() => import("./pages/Reportes"));
const CoachSalesReports = lazy(() => import("./pages/CoachSalesReports"));
const HistorialMovimientos = lazy(() => import("./pages/HistorialMovimientos"));
const AjustesZonal = lazy(() => import("./pages/AjustesZonal"));
const Marketing = lazy(() => import("./pages/Marketing"));
const RmsBatchUpload = lazy(() => import("./pages/RmsBatchUpload"));

const homePageByRole = {
  gerencia_general: "dashboard", gerente_comercial: "dashboard", sistemas: "sistemas", marketing: "marketing-inicio", coach: "dashboard", jefe_zonal: "dashboard",
  jefe_tienda: "dashboard", asistente_tienda: "dashboard", trabajador: "mi-asistencia", vendedor: "mi-asistencia", asistente: "mi-asistencia", caja: "mi-asistencia", almacenero: "mi-asistencia", jefe_area: "mi-asistencia", seguridad: "seguridad", jefe_seguridad: "seguridad",
};

class PageErrorBoundary extends Component {
  state = { error: null, retry: 0 };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error) { console.error("Error al cargar la sección:", error); }
  render() {
    if (this.state.error) return <div className="notice notice--error" role="alert"><span>No se pudo abrir esta sección.</span><button type="button" className="button button--ghost button--small" onClick={() => this.setState((state) => ({ error: null, retry: state.retry + 1 }))}>Reintentar</button></div>;
    return <Fragment key={this.state.retry}>{this.props.children}</Fragment>;
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [switchingStore, setSwitchingStore] = useState(false);
  const [sessionNotice, setSessionNotice] = useState("");
  const sessionRequest = useRef(0);

  useEffect(() => {
    api("/auth/me")
      .then(({ user: account }) => {
        setStoreContext(account);
        setUser(account);
        setPage(homePageByRole[account.rol] || "dashboard");
      })
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (user?.rol !== "jefe_tienda" || switchingStore) return;
    let active = true, pending = false;
    const refresh = async event => {
      if (pending) return;
      pending = true;
      const request = ++sessionRequest.current;
      try {
        const { user: account } = await api("/auth/me");
        if (!active || request !== sessionRequest.current) return;
        setStoreContext(account);
        setUser(current => JSON.stringify(current) === JSON.stringify(account) ? current : account);
        if (account.apoyo_revocado || event?.detail) setSessionNotice(event?.detail || "El apoyo se deshabilitó. Se ha restablecido tu tienda principal.");
      } catch (err) {
        if (active && request === sessionRequest.current && err.status === 401) { setStoreContext(null); setUser(null); }
      } finally { pending = false; }
    };
    const interval = window.setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    window.addEventListener("store-access-changed", refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("store-access-changed", refresh); };
  }, [user?.rol, switchingStore]);

  const login = (account) => {
    setStoreContext(account);
    setUser(account);
    setPage(homePageByRole[account.rol] || "dashboard");
  };
  const logout = async () => {
    ++sessionRequest.current;
    await api("/auth/logout", { method: "POST" }).catch(() => {});
    setUser(null);
    setStoreContext(null);
  };
  const changeStore = async storeId => {
    if (switchingStore || Number(storeId) === Number(user.tienda_id)) return;
    ++sessionRequest.current;
    setSwitchingStore(true); setSessionNotice("");
    try {
      const { user: account } = await api("/auth/tienda", { method: "POST", body: { tienda_id: Number(storeId) } });
      setStoreContext(account); setUser(account);
    } catch (err) {
      setSessionNotice(err.message);
      // A grant may have been revoked while the selector was open.
      const result = await api("/auth/me").catch(() => null);
      if (result) { setStoreContext(result.user); setUser(result.user); }
    } finally { setSwitchingStore(false); }
  };

  if (checking) return <div className="splash"><Loading label="Preparando tu espacio…" /></div>;
  if (!user) return <Suspense fallback={<div className="splash"><Loading /></div>}><Login onLogin={login} /></Suspense>;

  const isStoreManagement = ["jefe_tienda", "asistente_tienda"].includes(user.rol);
  const storeHome = <MiTienda user={user} onNavigate={setPage} />;
  const content = {
    dashboard: ["gerente_comercial", "jefe_zonal", "jefe_tienda", "coach"].includes(user.rol)
      ? <CommercialPortal storeContextId={user.rol === "jefe_tienda" ? user.tienda_id : null} /> : user.rol === "sistemas" ? <RmsBatchUpload /> : <Dashboard user={user} />,
    "asiste-operativo": user.rol === "gerente_comercial" ? <CommercialDashboard onNavigate={setPage} /> : user.rol === "jefe_zonal" || isStoreManagement ? storeHome : <Dashboard user={user} />,
    documentos: <Documentos />,
    usuarios: user.rol === "gerente_comercial" ? <CommercialPersonnel user={user} /> : isStoreManagement ? <Personal user={user} /> : <Usuarios user={user} />,
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
    "zonal-personal": <Usuarios user={user} zonalTeam />,
    "zonal-asistencia": <ZonalModule section="asistencia" user={user} />,
    "zonal-supervisiones": <ZonalModule section="supervisiones" user={user} />,
    "zonal-incidencias": <ZonalModule section="incidencias" user={user} />,
    reportes: user.rol === "coach" ? <CoachSalesReports user={user}/> : <Reportes user={user} />,
    historial: <HistorialMovimientos user={user} />,
    "ajustes-zonal": ["jefe_zonal", "gerencia_general", "gerente_comercial"].includes(user.rol) ? <AjustesZonal general={["gerencia_general", "gerente_comercial"].includes(user.rol)} /> : <Profile />,
    "marketing-inicio": <Marketing section="inicio" />,
    "marketing-personal": <Marketing section="personal" />,
    "marketing-asistencia": <Marketing section="asistencia" />,
    "marketing-validacion": <Marketing section="validacion" />,
    "marketing-incidencias": <Marketing section="incidencias" />,
    "marketing-capacitaciones": <Marketing section="capacitaciones" />,
    "marketing-campanas": <Marketing section="campanas" />,
    "marketing-seguidores": <Marketing section="seguidores" />,
    sistemas: user.rol === "sistemas" ? <RmsBatchUpload /> : <Dashboard user={user} />,
  }[page] || <Dashboard user={user} />;

  return (
    <Layout user={user} page={page} onNavigate={setPage} onLogout={logout} onStoreChange={changeStore} switchingStore={switchingStore}>
      {sessionNotice && <Notice type="error" onClose={() => setSessionNotice("")}>{sessionNotice}</Notice>}
      {switchingStore ? <Loading label="Cambiando de tienda…" /> : <PageErrorBoundary key={`${user.id}:${user.tienda_id}:${page}`}><Suspense fallback={<Loading />}>{content}</Suspense></PageErrorBoundary>}
    </Layout>
  );
}
