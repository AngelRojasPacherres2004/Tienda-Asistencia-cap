import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import TrafficHourMatrix from './TrafficHourMatrix';
import '../pages/store-commercial-panels.css';

export default function CommercialTrafficMatrix({ user }) {
  const [stores, setStores] = useState([]);
  useEffect(() => {
    let active = true;
    api('/tiendas').then(rows => { if (active) setStores(rows); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <div className="store-commercial-panels store-dashboard-shell is-light commercial-traffic-matrix"><TrafficHourMatrix user={user} scopeName="Todas las tiendas" comparisonStores={stores} storeFormat currentMonth /></div>;
}
