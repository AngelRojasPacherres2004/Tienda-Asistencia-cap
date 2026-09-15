import { Construction } from "lucide-react";
import { PageHeader } from "../components/UI";

export default function ModuloProximo({ title }) {
  return <><PageHeader eyebrow="Mi tienda" title={title} subtitle={`Gestión de ${title.toLowerCase()} de tu tienda.`} /><section className="panel construction-panel"><Construction size={32} /><h2>En construcción</h2><p>Esta sección estará disponible próximamente.</p></section></>;
}
