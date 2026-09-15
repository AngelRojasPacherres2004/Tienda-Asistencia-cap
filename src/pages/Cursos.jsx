import { useEffect, useState } from "react";
import { GraduationCap, Pencil, Trash2, UserRound } from "lucide-react";
import { api } from "../lib/api";
import {
  EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge, SuccessDialog,
} from "../components/UI";
import { AsignarPanel } from "./Capacitaciones";

const blankCurso = { nombre: "", competencia: "", activo: true };
const blankEncargado = { nombre: "", activo: true };

export default function Cursos({ user }) {
  const esGerenteComercial = user?.rol === "gerente_comercial";
  const [tab, setTab] = useState("cursos");
  const [cursos, setCursos] = useState(null);
  const [encargados, setEncargados] = useState(null);
  const [editingCurso, setEditingCurso] = useState(null);
  const [editingEncargado, setEditingEncargado] = useState(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [cursoError, setCursoError] = useState("");
  const [encargadoError, setEncargadoError] = useState("");
  const [success, setSuccess] = useState(null);

  const loadCursos = () => api("/cursos").then(setCursos).catch((err) => setNotice({ type: "error", text: err.message }));
  const loadEncargados = () => api("/encargados").then(setEncargados).catch((err) => setNotice({ type: "error", text: err.message }));
  useEffect(() => {
    loadCursos();
    if (!esGerenteComercial) loadEncargados();
  }, [esGerenteComercial]);

  const saveCurso = async (event) => {
    event.preventDefault();
    setBusy(true); setCursoError("");
    try {
      await api(editingCurso.id ? `/cursos/${editingCurso.id}` : "/cursos", {
        method: editingCurso.id ? "PUT" : "POST", body: editingCurso,
      });
      setEditingCurso(null);
      await loadCursos();
      setSuccess({ title: editingCurso.id ? "Capacitación actualizada" : "Capacitación creada", message: "La información de la capacitación se guardó correctamente." });
    } catch (err) {
      setCursoError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const deleteCurso = async (curso) => {
    if (!window.confirm(`¿Eliminar el curso "${curso.nombre}"?`)) return;
    setNotice(null);
    try {
      const result = await api(`/cursos/${curso.id}`, { method: "DELETE" });
      await loadCursos();
      setNotice({
        type: "success",
        text: result.inhabilitado
          ? "Ese curso ya tiene progreso registrado por trabajadores, así que se inhabilitó en vez de eliminarse."
          : "Curso eliminado.",
      });
    } catch (err) {
      setNotice({ type: "error", text: err.message });
    }
  };

  const saveEncargado = async (event) => {
    event.preventDefault();
    setBusy(true); setEncargadoError("");
    try {
      await api(editingEncargado.id ? `/encargados/${editingEncargado.id}` : "/encargados", {
        method: editingEncargado.id ? "PUT" : "POST", body: editingEncargado,
      });
      setEditingEncargado(null);
      await loadEncargados();
      setSuccess({ title: editingEncargado.id ? "Encargado actualizado" : "Encargado creado", message: "La información del encargado se guardó correctamente." });
    } catch (err) {
      setEncargadoError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Catálogo"
        title={esGerenteComercial ? "Capacitaciones y cambio de estado" : "Capacitaciones y Encargados"}
        subtitle={esGerenteComercial ? "Administra los cursos y asígnalos a los trabajadores bajo tu supervisión." : "Cursos disponibles y encargados que se pueden asignar en cualquier tienda."}
        action={
          tab === "cursos"
            ? <button className="button button--primary" onClick={() => { setCursoError(""); setEditingCurso({ ...blankCurso }); }}>Nueva capacitación</button>
            : !esGerenteComercial && <button className="button button--primary" onClick={() => { setEncargadoError(""); setEditingEncargado({ ...blankEncargado }); }}>Nuevo encargado</button>
        }
      />
      {notice && <Notice type={notice.type} onClose={() => setNotice(null)}>{notice.text}</Notice>}

      <div className="segmented">
        <button className={tab === "cursos" ? "active" : ""} onClick={() => setTab("cursos")}>Capacitaciones</button>
        <button className={tab === "encargados" ? "active" : ""} onClick={() => setTab("encargados")}>{esGerenteComercial ? "Cambio de estado" : "Encargados"}</button>
      </div>

      {tab === "cursos" ? (
        !cursos ? <Loading /> : cursos.length ? (
          <div className="table-panel">
            <div className="data-table data-table--cursos">
              <div className="data-table__head"><span>Capacitación</span><span>Competencia</span><span>Estado</span><span /></div>
              {cursos.map((curso) => (
                <div className="data-table__row" key={curso.id}>
                  <span className="cell-primary">{curso.nombre}</span>
                  <span>{curso.competencia}</span>
                  <span><StatusBadge value={curso.activo ? "activo" : "inactivo"} /></span>
                  <div className="row-actions">
                    <button onClick={() => { setCursoError(""); setEditingCurso({ ...curso }); }} aria-label="Editar"><Pencil size={15} /></button>
                    <button className="danger" onClick={() => deleteCurso(curso)} aria-label="Eliminar"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState icon={GraduationCap} title="Sin capacitaciones" text="Todavía no hay capacitaciones en el catálogo." />
      ) : esGerenteComercial ? (
        cursos ? (
          cursos.filter((curso) => curso.activo).length
            ? <AsignarPanel cursos={cursos.filter((curso) => curso.activo)} estadosPermitidos={["en_curso", "completado"]} restringirTransiciones={false} />
            : <EmptyState icon={GraduationCap} title="Sin capacitaciones activas" text="Activa o crea una capacitación antes de cambiar estados." />
        ) : <Loading />
      ) : (
        !encargados ? <Loading /> : encargados.length ? (
          <div className="table-panel">
            <div className="data-table data-table--encargados">
              <div className="data-table__head"><span>Encargado</span><span>Estado</span><span /></div>
              {encargados.map((encargado) => (
                <div className="data-table__row" key={encargado.id}>
                  <span className="cell-primary">{encargado.nombre}</span>
                  <span><StatusBadge value={encargado.activo ? "activo" : "inactivo"} /></span>
                  <div className="row-actions">
                    <button onClick={() => { setEncargadoError(""); setEditingEncargado({ ...encargado }); }} aria-label="Editar"><Pencil size={15} /></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : <EmptyState icon={UserRound} title="Sin encargados" text="Todavía no hay encargados en el catálogo." />
      )}

      <Modal open={!!editingCurso} title={editingCurso?.id ? "Editar capacitación" : "Nueva capacitación"} onClose={() => { setEditingCurso(null); setCursoError(""); }}>
        {editingCurso && (
          <form className="form-grid" onSubmit={saveCurso}>
            {cursoError && <div className="span-2"><Notice type="error" onClose={() => setCursoError("")}>{cursoError}</Notice></div>}
            <Field label="Capacitación" className="span-2">
              <input required value={editingCurso.nombre} onChange={(e) => setEditingCurso({ ...editingCurso, nombre: e.target.value })} />
            </Field>
            <Field label="Competencia" className="span-2">
              <input required value={editingCurso.competencia} onChange={(e) => setEditingCurso({ ...editingCurso, competencia: e.target.value })} />
            </Field>
            <Field label="Estado" className="span-2">
              <select value={editingCurso.activo ? "activo" : "inactivo"} onChange={(e) => setEditingCurso({ ...editingCurso, activo: e.target.value === "activo" })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </Field>
            <div className="form-actions span-2">
              <button type="button" className="button button--ghost" onClick={() => setEditingCurso(null)}>Cancelar</button>
              <button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        )}
      </Modal>

      <Modal open={!!editingEncargado} title={editingEncargado?.id ? "Editar encargado" : "Nuevo encargado"} onClose={() => { setEditingEncargado(null); setEncargadoError(""); }}>
        {editingEncargado && (
          <form className="form-grid" onSubmit={saveEncargado}>
            {encargadoError && <div className="span-2"><Notice type="error" onClose={() => setEncargadoError("")}>{encargadoError}</Notice></div>}
            <Field label="Nombre" className="span-2">
              <input required value={editingEncargado.nombre} onChange={(e) => setEditingEncargado({ ...editingEncargado, nombre: e.target.value })} />
            </Field>
            <Field label="Estado" className="span-2">
              <select value={editingEncargado.activo ? "activo" : "inactivo"} onChange={(e) => setEditingEncargado({ ...editingEncargado, activo: e.target.value === "activo" })}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </Field>
            <div className="form-actions span-2">
              <button type="button" className="button button--ghost" onClick={() => setEditingEncargado(null)}>Cancelar</button>
              <button className="button button--primary" disabled={busy}>{busy ? "Guardando…" : "Guardar"}</button>
            </div>
          </form>
        )}
      </Modal>
      <SuccessDialog open={!!success} title={success?.title} message={success?.message} onContinue={() => setSuccess(null)} />
    </>
  );
}
