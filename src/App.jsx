import { Component, Fragment, lazy, Suspense, useEffect, useRef, useState } from "react";
import { api, lockStoreContext, setStoreContext } from "./lib/api";
import { consumeStoreNavigation, restartStoreNavigation } from "./lib/storeNavigation";
import Layout from "./components/Layout";
import { Loading, Notice } from "./components/UI";
import RequiredCredentialChange from "./components/RequiredCredentialChange";

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
const SecurityAdmin = lazy(() => import("./pages/SecurityAdmin"));
const CredentialPermissions = lazy(() => import("./pages/CredentialPermissions"));

const homePageByRole = {
  gerencia_general: "dashboard", gerente_comercial: "dashboard", administrador_seguridad: "seguridad-central", sistemas: "sistemas", marketing: "marketing-inicio", coach: "dashboard", jefe_zonal: "dashboard",
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
    let active = true;
    api("/auth/me")
      .then(({ user: account }) => {
        if (!active) return;
        setStoreContext(account);
        setUser(account);
        const navigation = consumeStoreNavigation(account);
        setPage(navigation?.page || homePageByRole[account.rol] || "dashboard");
        setSessionNotice(navigation?.notice || "");
      })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
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
        if (Number(account.tienda_id) !== Number(user.tienda_id)) {
          lockStoreContext();
          restartStoreNavigation(account, page, event?.detail || (account.apoyo_revocado ? "El apoyo se deshabilitó. Se ha restablecido tu tienda principal." : "La tienda activa cambió en otra ventana. Se actualizó esta vista."));
          return;
        }
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
  }, [user?.rol, user?.tienda_id, page, switchingStore]);

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
    lockStoreContext();
    setSwitchingStore(true); setSessionNotice("");
    let restarting = false;
    try {
      const { user: account } = await api("/auth/tienda", { method: "POST", body: { tienda_id: Number(storeId) } });
      // A fresh page prevents an old upload/save continuation from inheriting the new store.
      restarting = true;
      restartStoreNavigation(account, page);
    } catch (err) {
      setSessionNotice(err.message);
      // A grant may have been revoked while the selector was open.
      const result = await api("/auth/me").catch(() => null);
      if (result && Number(result.user.tienda_id) !== Number(user.tienda_id)) {
        restarting = true;
        restartStoreNavigation(result.user, page, err.message);
      } else {
        setStoreContext(result?.user || user);
        if (result) setUser(result.user);
      }
    } finally { if (!restarting) setSwitchingStore(false); }
  };

  if (checking) return <div className="splash"><Loading label="Preparando tu espacio…" /></div>;
  if (!user) return <Suspense fallback={<div className="splash"><Loading /></div>}><Login onLogin={login} /></Suspense>;
  if (user.cambio_credenciales_pendiente) return <RequiredCredentialChange user={user} onComplete={account => { setStoreContext(account); setUser(account); }} onLogout={logout} />;

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
    "seguridad-central": user.rol === "administrador_seguridad" ? <SecurityAdmin /> : <Dashboard user={user} />,
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
    "sistemas-credenciales": user.rol === "sistemas" ? <CredentialPermissions /> : <Dashboard user={user} />,
  }[page] || <Dashboard user={user} />;

  return (
    <Layout user={user} page={page} onNavigate={setPage} onLogout={logout} onStoreChange={changeStore} switchingStore={switchingStore}>
      {sessionNotice && <Notice type="error" onClose={() => setSessionNotice("")}>{sessionNotice}</Notice>}
      {switchingStore ? <Loading label="Cambiando de tienda…" /> : <PageErrorBoundary key={`${user.id}:${user.tienda_id}:${page}`}><Suspense fallback={<Loading />}>{content}</Suspense></PageErrorBoundary>}
    </Layout>
  );
}
