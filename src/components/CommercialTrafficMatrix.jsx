import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import TrafficHourMatrix from './TrafficHourMatrix';
import '../pages/store-commercial-panels.css';

export default function CommercialTrafficMatrix({ user, period }) {
  const [stores, setStores] = useState([]);
  const { year, monthNumber } = period;
  const matrixPeriod = useMemo(() => ({ year, monthNumber, week: '', day: '' }), [year, monthNumber]);
  useEffect(() => {
    let active = true;
    api('/tiendas').then(rows => { if (active) setStores(rows); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <div className="store-commercial-panels store-dashboard-shell is-light commercial-traffic-matrix"><TrafficHourMatrix user={user} scopeName="Todas las tiendas" period={matrixPeriod} comparisonStores={stores} storeFormat /></div>;
}
