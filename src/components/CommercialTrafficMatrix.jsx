import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import TrafficHourMatrix from './TrafficHourMatrix';

export default function CommercialTrafficMatrix({ user, period }) {
  const [stores, setStores] = useState([]);
  const { year, monthNumber } = period;
  const matrixPeriod = useMemo(() => ({ year, monthNumber, week: '', day: '' }), [year, monthNumber]);
  useEffect(() => {
    let active = true;
    api('/tiendas').then(rows => { if (active) setStores(rows); }).catch(() => {});
    return () => { active = false; };
  }, []);
  return <TrafficHourMatrix user={user} scopeName="todas las tiendas" period={matrixPeriod} comparisonStores={stores} />;
}
