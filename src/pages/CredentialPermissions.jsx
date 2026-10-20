import { useEffect, useMemo, useState } from "react";
import { KeyRound, Search } from "lucide-react";
import { api } from "../lib/api";
import { Loading, Notice, PageHeader } from "../components/UI";
import "./credential-permissions.css";

export default function CredentialPermissions() {
  const [accounts, setAccounts] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    api("/systems/credential-permissions")
      .then(result => setAccounts(result.accounts || []))
      .catch(failure => setError(failure.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("es");
    return accounts.filter(account => !term ||
      `${account.nombres} ${account.apellidos} ${account.usuario} ${account.rol}`.toLocaleLowerCase("es").includes(term));
  }, [accounts, search]);

  async function toggle(account) {
    setBusyId(account.id); setError(""); setMessage("");
    try {
      const { account: updated } = await api(`/systems/credential-permissions/${account.id}`, {
        method: "PATCH", body: { enabled: !account.cambio_credenciales_pendiente },
      });
      setAccounts(previous => previous.map(item => item.id === updated.id ? { ...item, ...updated } : item));
      setMessage(updated.cambio_credenciales_pendiente
        ? `Cambio habilitado para ${account.usuario}. Al iniciar sesión deberá actualizar sus credenciales.`
        : `Permiso retirado para ${account.usuario}.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusyId(null); }
  }

  return <div className="credential-permissions">
    <PageHeader eyebrow="Sistemas" title="Acceso y credenciales" />
    {error && <Notice type="error" onClose={() => setError("")}>{error}</Notice>}
    {message && <Notice onClose={() => setMessage("")}>{message}</Notice>}
    <section className="credential-permissions__card">
      <div className="credential-permissions__heading"><KeyRound size={22}/><h2>Habilitar cambio por cuenta</h2></div>
      <label className="credential-permissions__search"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar persona, usuario o rol" aria-label="Buscar cuenta"/></label>
      {loading ? <Loading /> : <div className="credential-permissions__table-wrap"><table>
        <thead><tr><th>Persona</th><th>Usuario</th><th>Rol</th><th>Cambio</th><th>Acción</th></tr></thead>
        <tbody>{filtered.map(account => <tr key={account.id}>
          <td>{account.nombres} {account.apellidos}</td><td>{account.usuario}</td><td>{account.rol.replaceAll("_", " ")}</td>
          <td>{account.cambio_credenciales_pendiente ? "Pendiente" : "No habilitado"}</td>
          <td><button type="button" className={`button ${account.cambio_credenciales_pendiente ? "button--ghost" : "button--primary"} button--small`} disabled={busyId === account.id} onClick={() => toggle(account)}>{busyId === account.id ? "Guardando…" : account.cambio_credenciales_pendiente ? "Deshabilitar" : "Habilitar"}</button></td>
        </tr>)}</tbody>
      </table>{!filtered.length && <p className="credential-permissions__empty">No hay cuentas que coincidan.</p>}</div>}
    </section>
  </div>;
}
