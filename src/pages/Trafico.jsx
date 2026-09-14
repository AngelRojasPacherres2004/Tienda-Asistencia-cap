import { Construction, TrafficCone } from "lucide-react";
import { PageHeader } from "../components/UI";

export default function Trafico() {
  return <>
    <PageHeader eyebrow="Seguridad" title="Tráfico" subtitle="Control y seguimiento del tráfico de la operación." />
    <section className="panel construction-panel">
      <span className="construction-panel__icon"><TrafficCone size={32} /></span>
      <Construction size={24} />
      <h2>En construcción</h2>
      <p>Esta sección estará disponible próximamente.</p>
    </section>
  </>;
}
