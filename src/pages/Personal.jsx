import { useState } from "react";
import Usuarios from "./Usuarios";
import CoberturasEspeciales from "./CoberturasEspeciales";

export default function Personal({ user }) {
  const [section, setSection] = useState("trabajadores");
  return <>
    <div className="mini-tabs personal-tabs" aria-label="Secciones de personal">
      <button className={section === "trabajadores" ? "active" : ""} onClick={() => setSection("trabajadores")}>Trabajadores</button>
      <button className={section === "cobertura" ? "active" : ""} onClick={() => setSection("cobertura")}>Cobertura especial</button>
    </div>
    {section === "trabajadores" ? <Usuarios user={user} /> : <CoberturasEspeciales />}
  </>;
}
