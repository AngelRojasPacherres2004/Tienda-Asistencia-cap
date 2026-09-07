import { lazy, Suspense, useEffect, useState } from "react";
import { api } from "./lib/api";
import Layout from "./components/Layout";
import { Loading, SaveSuccessDialog } from "./components/UI";

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

const homePageByRole = { admin: "dashboard", jefe_tienda: "dashboard", empleado: "mi-asistencia" };

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [page, setPage] = useState("dashboard");
  const [saveFeedback, setSaveFeedback] = useState(null);

  useEffect(() => {
    const handleSave = (event) => setSaveFeedback(event.detail);
    window.addEventListener("asiste:save-success", handleSave);
    return () => window.removeEventListener("asiste:save-success", handleSave);
  }, []);

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
    usuarios: <Usuarios user={user} />,
    tiendas: <Tiendas />,
    cursos: <Cursos />,
    asistencias: <Asistencias />,
    capacitaciones: <Capacitaciones />,
    "mi-asistencia": <MiAsistencia />,
    "mis-capacitaciones": <MisCapacitaciones />,
    profile: <Profile />,
  }[page] || <Dashboard user={user} />;

  return (
    <>
      <SaveSuccessDialog open={!!saveFeedback} action={saveFeedback?.action} onContinue={() => setSaveFeedback(null)} />
      <Layout user={user} page={page} onNavigate={setPage} onLogout={logout}>
        <Suspense fallback={<Loading />}>{content}</Suspense>
      </Layout>
    </>
  );
}
