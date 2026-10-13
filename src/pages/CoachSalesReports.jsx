import { PageHeader } from "../components/UI";
import NormalizedReports from "./NormalizedReports";

export default function CoachSalesReports({ user }) {
  return <div className="report-page">
    <PageHeader eyebrow="Coach" title="Reportes de ventas"/>
    <NormalizedReports user={user}/>
  </div>;
}
