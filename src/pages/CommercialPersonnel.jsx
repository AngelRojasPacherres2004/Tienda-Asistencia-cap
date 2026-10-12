import { useState } from "react";
import { PageHeader } from "../components/UI";
import Reportes from "./Reportes";
import Usuarios from "./Usuarios";

export default function CommercialPersonnel({ user }) {
  const [view, setView] = useState("stores");
  return <>
    <PageHeader title="Personal" />
    <div className="module-view-tabs" role="tablist" aria-label="Vistas de personal">
      <button type="button" role="tab" aria-selected={view === "stores"} className={view === "stores" ? "active" : ""} onClick={() => setView("stores")}>Personal por tienda</button>
      <button type="button" role="tab" aria-selected={view === "leaders"} className={view === "leaders" ? "active" : ""} onClick={() => setView("leaders")}>Jefes zonales</button>
    </div>
    {view === "stores" ? <Reportes user={user} embedded initialKind="personal" allowedKinds={["personal"]} /> : <Usuarios user={user} embedded />}
  </>;
}
