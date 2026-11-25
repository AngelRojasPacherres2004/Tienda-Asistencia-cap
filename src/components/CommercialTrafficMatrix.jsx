import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import TrafficHourMatrix from './TrafficHourMatrix';
import '../pages/store-commercial-panels.css';

export default function CommercialTrafficMatrix({ user, tiendaId = '', scopeName = '' }) {
  const [stores, setStores] = useState([]);
  useEffect(() => {
    let active = true;
    api('/tiendas').then(rows => { if (active) setStores(rows); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <div className="store-commercial-panels store-dashboard-shell is-light commercial-traffic-matrix"><TrafficHourMatrix user={user} tiendaId={tiendaId} scopeName={scopeName || (tiendaId ? 'Tienda seleccionada' : 'Todas las tiendas')} comparisonStores={stores} storeFormat currentMonth coloredHeatmap /></div>;
}
