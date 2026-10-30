import { lazy, Suspense, useState } from 'react';
import { Loading } from '../components/UI';
import './store-commercial-panels.css';

const Capacitaciones = lazy(() => import('./Capacitaciones'));
const MisCapacitaciones = lazy(() => import('./MisCapacitaciones'));

export default function StoreTraining({ user, initialView = 'equipo' }) {
  const [view, setView] = useState(initialView);
  return <section className="store-training-hub">
    <div className="store-training-selector"><label htmlFor="store-training-view">Capacitaciones</label><select id="store-training-view" value={view} onChange={event => setView(event.target.value)}><option value="equipo">Capacitaciones del equipo</option><option value="mis">Mis capacitaciones</option></select></div>
    <Suspense fallback={<Loading />}>
      {view === 'equipo' ? <Capacitaciones user={user} /> : <MisCapacitaciones />}
    </Suspense>
  </section>;
}
