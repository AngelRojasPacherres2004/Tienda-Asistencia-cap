import { useState } from "react";
import TrafficHourMatrix from "../components/TrafficHourMatrix";
import AttendanceOverviewMatrix from "../components/AttendanceOverviewMatrix";
import MarketingTrafficChart from "./MarketingTrafficChart";
import "./store-commercial-panels.css";

const marketingUser = { rol: "marketing" };

export default function MarketingOperations({ stores, people }) {
  const [storeId, setStoreId] = useState("");
  const scopeName = stores.find(store => String(store.id) === storeId)?.nombre || "Todas las tiendas";
  return <div className="store-commercial-panels store-dashboard-shell is-light manager-traffic-panels">
    <MarketingTrafficChart stores={stores} />
    <TrafficHourMatrix user={marketingUser} tiendaId={storeId} scopeName={scopeName}
      comparisonStores={stores} storeFormat currentMonth coloredHeatmap
      storeFilter={<label>Tienda<select aria-label="Tienda de tráfico" value={storeId} onChange={event => setStoreId(event.target.value)}>
        <option value="">Todas las tiendas</option>
        {stores.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}
      </select></label>} />
    <AttendanceOverviewMatrix scopeName="Personal de Marketing" marketingPeople={people} />
  </div>;
}
