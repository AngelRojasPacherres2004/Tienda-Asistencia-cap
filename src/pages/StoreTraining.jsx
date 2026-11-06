import { lazy, Suspense, useState } from 'react';
import { Loading } from '../components/UI';
import './store-commercial-panels.css';

const Capacitaciones = lazy(() => import('./Capacitaciones'));
const MisCapacitaciones = lazy(() => import('./MisCapacitaciones'));

export default function StoreTraining({ user, initialView = 'equipo' }) {
  const [view, setView] = useState(initialView);
  return <section className="store-training-hub">
    <div className="module-view-tabs store-training-tabs" role="tablist" aria-label="Capacitaciones"><button type="button" role="tab" aria-selected={view === 'equipo'} className={view === 'equipo' ? 'active' : ''} onClick={() => setView('equipo')}>Capacitaciones del equipo</button><button type="button" role="tab" aria-selected={view === 'mis'} className={view === 'mis' ? 'active' : ''} onClick={() => setView('mis')}>Mis capacitaciones</button></div>
    <Suspense fallback={<Loading />}>
      {view === 'equipo' ? <Capacitaciones user={user} /> : <MisCapacitaciones />}
    </Suspense>
  </section>;
}
