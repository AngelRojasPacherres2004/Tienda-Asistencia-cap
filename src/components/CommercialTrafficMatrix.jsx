import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import TrafficHourMatrix from './TrafficHourMatrix';
import '../pages/store-commercial-panels.css';

export default function CommercialTrafficMatrix({ user, tiendaId = '', tiendaIds, scopeName = '' }) {
  const [stores, setStores] = useState([]);
  useEffect(() => {
    let active = true;
    api('/tiendas').then(rows => { if (active) setStores(rows); }).catch(() => {});
    return () => { active = false; };
  }, []);
  const scopedStores = Array.isArray(tiendaIds) ? stores.filter(store => tiendaIds.includes(String(store.id))) : stores;
  if (Array.isArray(tiendaIds) && !tiendaIds.length) return <p>No hay tiendas en el alcance seleccionado.</p>;
  return <div className="store-commercial-panels store-dashboard-shell is-light commercial-traffic-matrix"><TrafficHourMatrix user={user} tiendaId={tiendaId} scopeName={scopeName || (tiendaId ? 'Tienda seleccionada' : 'Tiendas seleccionadas')} comparisonStores={scopedStores} allowedStoreIds={tiendaIds} storeFormat currentMonth coloredHeatmap /></div>;
}
