import { useEffect, useState } from 'react';
import { RefreshCw, Search, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { ConfirmDialog, Loading, Notice, PageHeader, Pagination } from '../components/UI';
import { OPERATIONAL_ROLE_LABELS } from '../../shared/roleCatalog';
import './credential-permissions.css';
import './systems-maintenance.css';

export default function SystemsMaintenance() {
  const [tab, setTab] = useState('transfers');
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState('');
  const [store, setStore] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [deleting, setDeleting] = useState(null);
  const [suspending, setSuspending] = useState(null);
  const [personnelStatus, setPersonnelStatus] = useState('visible');
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const personnel = tab === 'personnel';

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setRows([]);
    api(`/systems/maintenance/${tab}`, { cacheTtlMs: 0 })
      .then(result => { if (active) setRows(result[tab === 'personnel' ? 'people' : 'groups'] || []); })
      .catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tab, revision]);

  const stores = [...new Set(rows.flatMap(row => personnel ? [row.tienda_nombre] : [row.origin, row.destination]))].sort();
  const term = search.trim().toLocaleLowerCase('es');
  const filtered = rows.filter(row => {
    if (personnel && personnelStatus === 'visible' && row.suspendido_sistemas) return false;
    if (personnel && personnelStatus === 'suspended' && !row.suspendido_sistemas) return false;
    if (store && !(personnel ? row.tienda_nombre === store : row.origin === store || row.destination === store)) return false;
    const text = personnel ? `${row.nombres} ${row.apellidos} ${row.dni || ''} ${row.tienda_nombre} ${OPERATIONAL_ROLE_LABELS[row.rol] || row.rol}`
      : `${row.id} ${row.origin} ${row.destination} ${row.guide || ''} ${row.items.map(item => `${item.product} ${item.code}`).join(' ')}`;
    return text.toLocaleLowerCase('es').includes(term);
  });
  const pages = Math.max(1, Math.ceil(filtered.length / 20));
  const currentPage = Math.min(page, pages);
  const visible = filtered.slice((currentPage - 1) * 20, currentPage * 20);

  async function remove() {
    setBusy(true); setDeleteError('');
    try {
      await api(`/systems/maintenance/${tab}/${deleting.id}`, { method: 'DELETE', retry: false });
      setRows(previous => previous.filter(row => row.id !== deleting.id));
      setDeleting(null); setMessage(personnel ? 'Persona e historial personal eliminados definitivamente.' : 'Grupo de transferencias eliminado.');
    } catch (failure) { setDeleteError(failure.message); }
    finally { setBusy(false); }
  }

  function changeTab(value) {
    setTab(value); setSearch(''); setStore(''); setPage(1); setMessage('');
  }

  async function changeSuspension() {
    setBusy(true); setDeleteError('');
    try {
      const suspended = !suspending.suspendido_sistemas;
      const { person } = await api(`/systems/maintenance/personnel/${suspending.id}`, { method: 'PATCH', body: { suspended }, retry: false });
      setRows(previous => previous.map(row => row.id === person.id ? { ...row, ...person } : row));
      setSuspending(null);
      setMessage(suspended ? 'Trabajador suspendido y oculto. Su historial se conserva.' : 'Trabajador reactivado. Ya aparece en la lista de personal.');
    } catch (failure) { setDeleteError(failure.message); }
    finally { setBusy(false); }
  }

  return <div className="credential-permissions systems-maintenance">
    <PageHeader eyebrow="Sistemas" title="Gestión de registros" subtitle="Personal de todas las tiendas y transferencias guardadas." />
    <div className="module-view-tabs"><button type="button" className={!personnel ? 'active' : ''} onClick={() => changeTab('transfers')}>Transferencias guardadas</button><button type="button" className={personnel ? 'active' : ''} onClick={() => changeTab('personnel')}>Personal por tienda</button></div>
    {error && <Notice type="error">{error}</Notice>}
    {message && <Notice onClose={() => setMessage('')}>{message}</Notice>}
    <section className="credential-permissions__card">
      <div className="systems-maintenance__filters">
        <label className="credential-permissions__search"><Search size={18} /><input aria-label="Buscar registros" placeholder={personnel ? 'Nombre, DNI o rol' : 'Producto, código, grupo o guía'} value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
        <label className="field"><span>Tienda</span><select value={store} onChange={event => { setStore(event.target.value); setPage(1); }}><option value="">Todas las tiendas</option>{stores.map(name => <option key={name}>{name}</option>)}</select></label>
        {personnel && <label className="field"><span>Visibilidad</span><select value={personnelStatus} onChange={event => { setPersonnelStatus(event.target.value); setPage(1); }}><option value="visible">Personal visible</option><option value="suspended">Suspendidos</option><option value="all">Todos</option></select></label>}
        <button type="button" className="button button--ghost" disabled={loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={16} />Actualizar</button>
      </div>
      {loading ? <Loading /> : <><p>{filtered.length} {personnel ? 'personas' : 'grupos guardados'}</p><div className="credential-permissions__table-wrap"><table>
        <thead><tr>{(personnel ? ['Persona', 'DNI', 'Tienda', 'Rol', 'Estado', 'Acción'] : ['Grupo y productos', 'Origen', 'Destino', 'Unidades', 'Estado / guía', 'Acción']).map(label => <th key={label}>{label}</th>)}</tr></thead>
        <tbody>{visible.map(row => <tr key={row.id}>{personnel ? <><td>{row.nombres} {row.apellidos}</td><td>{row.dni || '—'}</td><td>{row.tienda_nombre}</td><td>{OPERATIONAL_ROLE_LABELS[row.rol] || row.rol}</td><td>{row.suspendido_sistemas ? 'Suspendido' : row.estado}</td><td><div className="systems-maintenance__actions">{(row.estado === 'activo' || row.suspendido_sistemas) && <button type="button" className="button button--ghost button--small" onClick={() => { setSuspending(row); setDeleteError(''); }}>{row.suspendido_sistemas ? 'Reactivar' : 'Suspender'}</button>}<button type="button" className="button button--danger button--small" onClick={() => { setDeleting(row); setDeleteError(''); }}><Trash2 size={15} />Eliminar persona</button></div></td></> : <>
          <td><details><summary>{row.items.length} productos · {new Date(row.createdAt).toLocaleDateString('es-PE')}</summary><small>{row.id}</small><ul>{row.items.map((item, index) => <li key={index}>{item.code} · {item.product} · {item.quantity} und</li>)}</ul></details></td>
          <td>{row.origin}</td><td>{row.destination}</td><td>{row.quantity}</td><td>{row.status}<br />{row.guide || 'Sin guía'}</td>
          <td><button type="button" className="button button--danger button--small" onClick={() => { setDeleting(row); setDeleteError(''); }}><Trash2 size={15} />Eliminar grupo</button></td>
        </>}</tr>)}</tbody>
      </table>{!filtered.length && <p className="credential-permissions__empty">No hay registros que coincidan.</p>}</div><Pagination page={currentPage} pages={pages} onChange={setPage} /></>}
    </section>
    <ConfirmDialog open={Boolean(suspending)} title={suspending?.suspendido_sistemas ? 'Reactivar trabajador' : 'Suspender trabajador'} message={suspending ? suspending.suspendido_sistemas
      ? `${suspending.nombres} ${suspending.apellidos} volverá a aparecer en la lista de personal y recuperará su acceso.`
      : `${suspending.nombres} ${suspending.apellidos} quedará oculto de la lista habitual de personal y no podrá ingresar al sistema. Sus datos e historial se conservarán. Podrás reactivarlo desde el filtro Suspendidos.` : ''} onConfirm={changeSuspension} onClose={() => { if (!busy) setSuspending(null); }} busy={busy} error={deleteError} confirmLabel={suspending?.suspendido_sistemas ? 'Sí, reactivar' : 'Sí, suspender'} busyLabel="Guardando…" />
    <ConfirmDialog open={Boolean(deleting)} title={personnel ? 'Eliminar persona e historial' : 'Eliminar grupo guardado'} message={deleting ? personnel
      ? `Se eliminará definitivamente a ${deleting.nombres} ${deleting.apellidos}, DNI ${deleting.dni || 'sin registrar'}, de ${deleting.tienda_nombre}, junto con su asistencia, capacitaciones, períodos laborales y demás registros personales. Los documentos y registros compartidos de tienda se conservarán; las autorías obligatorias pasarán a la cuenta de Sistemas y se dejará constancia del cambio. Esta acción no se puede deshacer.`
      : `Se eliminarán definitivamente los ${deleting.items.length} productos guardados del grupo ${deleting.id}, de ${deleting.origin} hacia ${deleting.destination}. Estado: ${deleting.status}${deleting.guide ? `, guía ${deleting.guide}` : ''}. Esta acción no se puede deshacer.` : ''} onConfirm={remove} onClose={() => { if (!busy) setDeleting(null); }} busy={busy} error={deleteError} />
  </div>;
}
