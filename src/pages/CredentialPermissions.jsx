import { canLimitToCommercialSummary } from '../../shared/commercial-summary-only.js';
import { useEffect, useMemo, useState } from "react";
import { KeyRound, Search } from "lucide-react";
import { api } from "../lib/api";
import { Loading, Notice, PageHeader } from "../components/UI";
import "./credential-permissions.css";


export default function CredentialPermissions() {
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyAccounts, setBusyAccounts] = useState({});
  const [accessDrafts, setAccessDrafts] = useState({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    api("/systems/credential-permissions")
      .then(result => { if (active) setAccounts(result.accounts || []); })
      .catch(failure => { if (active) setError(failure.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return accounts.filter(account => !term ||
      `${account.nombres} ${account.apellidos} ${account.usuario} ${account.rol}`.toLocaleLowerCase("es").includes(term));
  }, [accounts, search]);

  const setAccountBusy = (id, action) => setBusyAccounts(previous => ({ ...previous, [id]: action }));
  const mergeAccount = updated => setAccounts(previous => previous.map(item => item.id === updated.id ? { ...item, ...updated } : item));

  async function saveModuleAccess(account) {
    const summaryOnly = accessDrafts[account.id] ?? Boolean(account.acceso_solo_resumen_comercial);
    if (busyAccounts[account.id] || summaryOnly === Boolean(account.acceso_solo_resumen_comercial)) return;
    setAccountBusy(account.id, "save"); setError(""); setMessage("");
    try {
      const { account: updated } = await api(`/systems/module-permissions/${account.id}`, {
        method: "PATCH", body: { summaryOnly },
      });
      mergeAccount(updated);
      setAccessDrafts(previous => {
        const next = { ...previous };
        delete next[account.id];
        return next;
      });
      setMessage(`Secciones actualizadas para ${account.usuario}: ${updated.acceso_solo_resumen_comercial ? "solo Resumen comercial, en modo lectura" : "acceso según su rol"}.`);
    } catch (failure) { setError(failure.message); }
    finally { setAccountBusy(account.id, null); }
  }

  async function resetCredentials(account) {
    if (busyAccounts[account.id]) return;
    if (!window.confirm(`Se restablecerá el acceso de ${account.usuario} a la clave temporal 123. Al ingresar deberá cambiar usuario y contraseña. ¿Continuar?`)) return;
    setAccountBusy(account.id, "reset"); setError(""); setMessage("");
    try {
      const { account: updated } = await api(`/systems/credential-permissions/${account.id}`, {
        method: "PATCH", body: { enabled: true },
      });
      mergeAccount(updated);
      setMessage(`Acceso restablecido para ${account.usuario}. La clave temporal es 123; al iniciar sesión deberá cambiar usuario y contraseña.`);
    } catch (failure) { setError(failure.message); }
    finally { setAccountBusy(account.id, null); }
  }

  return <div className="credential-permissions">
    <PageHeader eyebrow="Sistemas" title="Acceso y credenciales" />
    {error && <Notice type="error" onClose={() => setError("")}>{error}</Notice>}
    {message && <Notice onClose={() => setMessage("")}>{message}</Notice>}
    <section className="credential-permissions__card">
      <div className="credential-permissions__heading"><KeyRound size={22}/><h2>Permisos por cuenta</h2></div>
      <p>Elige <strong>Según su rol</strong> para conservar las secciones habituales o <strong>Solo Resumen comercial</strong> para permitir únicamente la consulta del dashboard. Guarda el cambio en la fila de la persona.</p>
      <p className="credential-permissions__help">La restricción está disponible para cuentas con rol comercial, zonal, de tienda y coach. Guardar secciones conserva su usuario y contraseña. El botón «Restablecer a 123» cambia las credenciales y exige renovarlas en el siguiente ingreso.</p>
      <label className="credential-permissions__search"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar persona, usuario o rol" aria-label="Buscar cuenta"/></label>
      {loading ? <Loading /> : <div className="credential-permissions__table-wrap"><table>
        <thead><tr><th>Persona</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Secciones permitidas</th><th>Credenciales</th></tr></thead>
        <tbody>{filtered.map(account => {
          const draft = accessDrafts[account.id] ?? Boolean(account.acceso_solo_resumen_comercial);
          const changed = draft !== Boolean(account.acceso_solo_resumen_comercial);
          const busy = busyAccounts[account.id];
          return <tr key={account.id}>
            <td data-label="Persona">{account.nombres} {account.apellidos}</td><td data-label="Usuario">{account.usuario}</td><td data-label="Rol">{account.rol.replaceAll("_", " ")}</td>
            <td data-label="Estado">{account.cambio_credenciales_pendiente ? "Cambio obligatorio pendiente" : "Activo"}</td>
            <td data-label="Secciones permitidas">{canLimitToCommercialSummary(account) ? <div className="credential-permissions__access">
              <select aria-label={`Secciones permitidas de ${account.usuario}`} value={draft ? "summary" : "role"} disabled={Boolean(busy)} onChange={event => setAccessDrafts(previous => ({ ...previous, [account.id]: event.target.value === "summary" }))}>
                <option value="role">Según su rol</option><option value="summary">Solo Resumen comercial</option>
              </select>
              <button type="button" className="button button--primary button--small" disabled={!changed || Boolean(busy)} aria-label={`Guardar secciones de ${account.usuario}`} onClick={() => saveModuleAccess(account)}>{busy === "save" ? "Guardando…" : "Guardar"}</button>
              {changed && <small className="credential-permissions__pending">Cambio sin guardar</small>}
            </div> : <span className="credential-permissions__help">Según su rol</span>}</td>
            <td data-label="Credenciales"><button type="button" className="button button--ghost button--small" disabled={Boolean(busy)} onClick={() => resetCredentials(account)}>{busy === "reset" ? "Restableciendo…" : "Restablecer a 123"}</button></td>
          </tr>;
        })}</tbody>
      </table>{!filtered.length && <p className="credential-permissions__empty">No hay cuentas que coincidan.</p>}</div>}
    </section>
  </div>;
}
