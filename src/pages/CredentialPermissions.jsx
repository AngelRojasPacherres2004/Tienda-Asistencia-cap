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

  async function resetCredentials(account) {
    if (!window.confirm(`Se restablecerá el acceso de ${account.usuario} a la clave temporal 123. Al ingresar deberá cambiar usuario y contraseña. ¿Continuar?`)) return;
    setBusyId(account.id); setError(""); setMessage("");
    try {
      const { account: updated } = await api(`/systems/credential-permissions/${account.id}`, {
        method: "PATCH", body: { enabled: true },
      });
      setAccounts(previous => previous.map(item => item.id === updated.id ? { ...item, ...updated } : item));
      setMessage(`Acceso restablecido para ${account.usuario}. La clave temporal es 123; al iniciar sesión deberá cambiar usuario y contraseña.`);
    } catch (failure) { setError(failure.message); }
    finally { setBusyId(null); }
  }

  return <div className="credential-permissions">
    <PageHeader eyebrow="Sistemas" title="Acceso y credenciales" />
    {error && <Notice type="error" onClose={() => setError("")}>{error}</Notice>}
    {message && <Notice onClose={() => setMessage("")}>{message}</Notice>}
    <section className="credential-permissions__card">
      <div className="credential-permissions__heading"><KeyRound size={22}/><h2>Restablecer acceso por cuenta</h2></div>
      <p>Al restablecer, la contraseña temporal será <strong>123</strong>. Se solicitará obligatoriamente un nuevo usuario y una contraseña segura en el siguiente ingreso.</p>
      <label className="credential-permissions__search"><Search size={18}/><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar persona, usuario o rol" aria-label="Buscar cuenta"/></label>
      {loading ? <Loading /> : <div className="credential-permissions__table-wrap"><table>
        <thead><tr><th>Persona</th><th>Usuario</th><th>Rol</th><th>Estado</th><th>Acción</th></tr></thead>
        <tbody>{filtered.map(account => <tr key={account.id}>
          <td>{account.nombres} {account.apellidos}</td><td>{account.usuario}</td><td>{account.rol.replaceAll("_", " ")}</td>
          <td>{account.cambio_credenciales_pendiente ? "Cambio obligatorio pendiente" : "Activo"}</td>
          <td><button type="button" className="button button--primary button--small" disabled={busyId === account.id} onClick={() => resetCredentials(account)}>{busyId === account.id ? "Restableciendo…" : "Restablecer a 123"}</button></td>
        </tr>)}</tbody>
      </table>{!filtered.length && <p className="credential-permissions__empty">No hay cuentas que coincidan.</p>}</div>}
    </section>
  </div>;
}
