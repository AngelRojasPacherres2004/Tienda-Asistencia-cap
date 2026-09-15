import { useEffect, useMemo, useState } from "react";
import {
  Download,
  Eye,
  FilePlus2,
  Plus,
  ShieldAlert,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import { api, todayISO } from "../lib/api";
import {
  EmptyState,
  Field,
  Loading,
  Modal,
  Notice,
  PageHeader,
  StatusBadge,
  SuccessDialog,
} from "../components/UI";

const labels = {
  borrador: "Borrador",
  abierta: "Abierta",
  revision: "En revisión",
  cerrada: "Cerrada",
};
const nowTime = () =>
  new Date().toLocaleTimeString("en-GB", {
    timeZone: "America/Lima",
    hour: "2-digit",
    minute: "2-digit",
  });
const blank = () => ({
  step: 1,
  titulo: "",
  tipo: "",
  area: "",
  severidad: "media",
  fecha: todayISO(),
  hora: nowTime(),
  descripcion: "",
  intervencion: false,
  detencion: false,
  productos: [],
  personas: [],
  evidencias: [],
});
const money = (value) => `S/ ${Number(value || 0).toFixed(2)}`;

function WizardSteps({ step }) {
  return (
    <div className="incident-steps">
      <span className={step === 1 ? "active" : step > 1 ? "done" : ""}>
        1 Datos generales
      </span>
      <span className={step === 2 ? "active" : step > 2 ? "done" : ""}>
        2 Productos e involucrados
      </span>
      <span className={step === 3 ? "active" : ""}>3 Revisar y enviar</span>
    </div>
  );
}

function GeneralStep({ data, setData, errors }) {
  return (
    <div className="form-grid">
      <Field label="Código" hint="Se genera al enviar.">
        <input disabled value={`INC-${new Date().getFullYear()}-AUTOMÁTICO`} />
      </Field>
      <Field label="Fecha" error={errors.fecha}>
        <input
          type="date"
          value={data.fecha}
          onChange={(e) => setData({ ...data, fecha: e.target.value })}
        />
      </Field>
      <Field label="Hora" error={errors.hora}>
        <input
          type="time"
          value={data.hora}
          onChange={(e) => setData({ ...data, hora: e.target.value })}
        />
      </Field>
      <Field label="Tipo de incidencia" error={errors.tipo}>
        <select
          value={data.tipo}
          onChange={(e) =>
            setData({ ...data, tipo: e.target.value, titulo: e.target.value })
          }
        >
          <option value="">Seleccionar</option>
          <option>Robo</option>
          <option>Robo frustrado</option>
          <option>Falta</option>
          <option>Accidente</option>
          <option>Daño</option>
          <option>Otro</option>
        </select>
      </Field>
      <Field label="Área / ubicación" error={errors.area}>
        <input
          value={data.area}
          onChange={(e) => setData({ ...data, area: e.target.value })}
          placeholder="Piso de venta, almacén…"
        />
      </Field>
      <Field label="Severidad">
        <select
          value={data.severidad}
          onChange={(e) => setData({ ...data, severidad: e.target.value })}
        >
          <option value="baja">Baja</option>
          <option value="media">Media</option>
          <option value="alta">Alta</option>
          <option value="critica">Crítica</option>
        </select>
      </Field>
      <Field
        label="Descripción del hecho"
        error={errors.descripcion}
        className="span-2"
      >
        <textarea
          rows="6"
          value={data.descripcion}
          onChange={(e) => setData({ ...data, descripcion: e.target.value })}
          placeholder="Describe qué ocurrió, cómo fue detectado y qué acciones iniciales se tomaron…"
        />
      </Field>
      <Field label="¿Hubo intervención?">
        <div className="choice-pills">
          <button
            type="button"
            className={data.intervencion ? "active" : ""}
            onClick={() => setData({ ...data, intervencion: true })}
          >
            Sí
          </button>
          <button
            type="button"
            className={!data.intervencion ? "active" : ""}
            onClick={() => setData({ ...data, intervencion: false })}
          >
            No
          </button>
        </div>
      </Field>
      <Field label="¿Hubo detención?">
        <div className="choice-pills">
          <button
            type="button"
            className={data.detencion ? "active" : ""}
            onClick={() => setData({ ...data, detencion: true })}
          >
            Sí
          </button>
          <button
            type="button"
            className={!data.detencion ? "active" : ""}
            onClick={() => setData({ ...data, detencion: false })}
          >
            No
          </button>
        </div>
      </Field>
    </div>
  );
}

function InvolvedStep({ data, setData, setNotice }) {
  const [product, setProduct] = useState({
    codigo: "",
    producto: "",
    marca: "",
    cantidad: 1,
    precio: "",
    recuperado: false,
  });
  const [person, setPerson] = useState({
    nombre: "",
    rol: "Involucrado",
    documento: "",
    observacion: "",
  });
  const addProduct = () => {
    if (
      !product.producto.trim() ||
      Number(product.cantidad) < 1 ||
      Number(product.precio) < 0
    )
      return setNotice({
        type: "error",
        text: "Completa correctamente el producto, cantidad y precio.",
      });
    const item = {
      ...product,
      cantidad: Number(product.cantidad),
      precio: Number(product.precio) || 0,
      total: Number(product.cantidad) * (Number(product.precio) || 0),
    };
    setData({ ...data, productos: [...data.productos, item] });
    setProduct({
      codigo: "",
      producto: "",
      marca: "",
      cantidad: 1,
      precio: "",
      recuperado: false,
    });
  };
  const addPerson = () => {
    if (!person.nombre.trim())
      return setNotice({
        type: "error",
        text: "Ingresa el nombre o descripción de la persona.",
      });
    if (person.documento && !/^\d{8}$/.test(person.documento))
      return setNotice({ type: "error", text: "El DNI debe tener 8 dígitos." });
    setData({ ...data, personas: [...data.personas, person] });
    setPerson({
      nombre: "",
      rol: "Involucrado",
      documento: "",
      observacion: "",
    });
  };
  const addFiles = async (files) => {
    const selected = [...files];
    if (data.evidencias.length + selected.length > 6)
      return setNotice({
        type: "error",
        text: "Puedes adjuntar hasta 6 evidencias.",
      });
    if (selected.some((file) => file.size > 1024 * 1024))
      return setNotice({
        type: "error",
        text: "Cada evidencia debe pesar como máximo 1 MB.",
      });
    const total =
      selected.reduce((sum, file) => sum + file.size, 0) +
      data.evidencias.reduce((sum, item) => sum + (item.size || 0), 0);
    if (total > 3 * 1024 * 1024)
      return setNotice({
        type: "error",
        text: "Las evidencias no pueden superar 3 MB en total.",
      });
    const converted = await Promise.all(
      selected.map(
        (file) =>
          new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({
                nombre: file.name,
                tipo: file.type || "application/octet-stream",
                size: file.size,
                data_url: reader.result,
              });
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
      ),
    );
    setData({ ...data, evidencias: [...data.evidencias, ...converted] });
  };
  return (
    <div className="incident-involved">
      <section>
        <header>
          <div>
            <h3>Productos involucrados</h3>
            <p>Registra uno o varios productos.</p>
          </div>
        </header>
        <div className="inline-entry inline-entry--product">
          <input
            value={product.codigo}
            onChange={(e) => setProduct({ ...product, codigo: e.target.value })}
            placeholder="Código / SKU"
          />
          <input
            value={product.producto}
            onChange={(e) =>
              setProduct({ ...product, producto: e.target.value })
            }
            placeholder="Producto *"
          />
          <input
            value={product.marca}
            onChange={(e) => setProduct({ ...product, marca: e.target.value })}
            placeholder="Marca"
          />
          <input
            type="number"
            min="1"
            value={product.cantidad}
            onChange={(e) =>
              setProduct({ ...product, cantidad: e.target.value })
            }
            placeholder="Cant."
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={product.precio}
            onChange={(e) => setProduct({ ...product, precio: e.target.value })}
            placeholder="Valor"
          />
          <label>
            <input
              type="checkbox"
              checked={product.recuperado}
              onChange={(e) =>
                setProduct({ ...product, recuperado: e.target.checked })
              }
            />
            Recuperado
          </label>
          <button type="button" onClick={addProduct}>
            <Plus />
            Agregar
          </button>
        </div>
        {data.productos.length ? (
          <div className="wizard-list">
            {data.productos.map((item, index) => (
              <div key={`${item.codigo}-${index}`}>
                <span>
                  <strong>{item.producto}</strong>
                  <small>
                    {item.codigo || "Sin SKU"} · {item.marca || "Sin marca"}
                  </small>
                </span>
                <span>
                  {item.cantidad} × {money(item.precio)}
                </span>
                <span>{item.recuperado ? "Recuperado" : "No recuperado"}</span>
                <button
                  type="button"
                  onClick={() =>
                    setData({
                      ...data,
                      productos: data.productos.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="wizard-empty">Sin productos agregados.</p>
        )}
      </section>
      <section>
        <header>
          <div>
            <h3>Personas involucradas</h3>
            <p>Reportantes, testigos o involucrados.</p>
          </div>
        </header>
        <div className="inline-entry inline-entry--person">
          <input
            value={person.nombre}
            onChange={(e) => setPerson({ ...person, nombre: e.target.value })}
            placeholder="Nombre o descripción *"
          />
          <select
            value={person.rol}
            onChange={(e) => setPerson({ ...person, rol: e.target.value })}
          >
            <option>Involucrado</option>
            <option>Reportante</option>
            <option>Testigo</option>
            <option>Personal de tienda</option>
          </select>
          <input
            inputMode="numeric"
            maxLength="8"
            value={person.documento}
            onChange={(e) =>
              setPerson({
                ...person,
                documento: e.target.value.replace(/\D/g, ""),
              })
            }
            placeholder="DNI"
          />
          <input
            value={person.observacion}
            onChange={(e) =>
              setPerson({ ...person, observacion: e.target.value })
            }
            placeholder="Observación"
          />
          <button type="button" onClick={addPerson}>
            <UserPlus />
            Agregar
          </button>
        </div>
        {data.personas.length ? (
          <div className="wizard-list">
            {data.personas.map((item, index) => (
              <div key={`${item.nombre}-${index}`}>
                <span>
                  <strong>{item.nombre}</strong>
                  <small>{item.rol}</small>
                </span>
                <span>{item.documento || "Sin documento"}</span>
                <span>{item.observacion || "—"}</span>
                <button
                  type="button"
                  onClick={() =>
                    setData({
                      ...data,
                      personas: data.personas.filter((_, i) => i !== index),
                    })
                  }
                >
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="wizard-empty">Sin personas agregadas.</p>
        )}
      </section>
      <section>
        <header>
          <div>
            <h3>Evidencias</h3>
            <p>
              Fotos, documentos o videos. Máximo 6 archivos y 3 MB en total.
            </p>
          </div>
          <label className="button button--ghost">
            <FilePlus2 size={16} />
            Adjuntar
            <input
              hidden
              multiple
              type="file"
              accept="image/*,video/*,.pdf,.doc,.docx"
              onChange={(e) => addFiles(e.target.files)}
            />
          </label>
        </header>
        {data.evidencias.length ? (
          <div className="evidence-list">
            {data.evidencias.map((item, index) => (
              <div key={`${item.nombre}-${index}`}>
                <span>{item.nombre}</span>
                <small>{Math.ceil(item.size / 1024)} KB</small>
                <button
                  type="button"
                  onClick={() =>
                    setData({
                      ...data,
                      evidencias: data.evidencias.filter((_, i) => i !== index),
                    })
                  }
                >
                  <X />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="wizard-empty">Sin evidencias adjuntas.</p>
        )}
      </section>
    </div>
  );
}

function ReviewStep({ data }) {
  const value = data.productos.reduce(
    (sum, item) => sum + Number(item.total || 0),
    0,
  );
  const recovered = data.productos
    .filter((item) => item.recuperado)
    .reduce((sum, item) => sum + Number(item.total || 0), 0);
  return (
    <div className="incident-review">
      <header>
        <div>
          <h2>INC-{new Date().getFullYear()}-AUTOMÁTICO</h2>
          <p>
            {data.tipo} · {data.fecha} · {data.hora}
          </p>
        </div>
        <span className={`severity severity--${data.severidad}`}>
          {data.severidad}
        </span>
      </header>
      <p>{data.descripcion}</p>
      <dl>
        <div>
          <dt>Productos</dt>
          <dd>
            {data.productos.reduce((sum, item) => sum + item.cantidad, 0)}
          </dd>
        </div>
        <div>
          <dt>Valor involucrado</dt>
          <dd>{money(value)}</dd>
        </div>
        <div>
          <dt>Recuperado</dt>
          <dd>{money(recovered)}</dd>
        </div>
        <div>
          <dt>Personas</dt>
          <dd>{data.personas.length}</dd>
        </div>
        <div>
          <dt>Evidencias</dt>
          <dd>{data.evidencias.length}</dd>
        </div>
        <div>
          <dt>Detención</dt>
          <dd>{data.detencion ? "Sí" : "No"}</dd>
        </div>
      </dl>
    </div>
  );
}

export default function Incidentes({ user }) {
  const canCreate = ["seguridad", "administrador_tienda"].includes(
    user?.rol_db,
  );
  const draftKey = `asiste-incidente-borrador-${user?.id || "actual"}`;
  const [items, setItems] = useState(null);
  const [editing, setEditing] = useState(null);
  const [viewing, setViewing] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [success, setSuccess] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    estado: "todos",
    severidad: "todas",
  });
  const load = () =>
    api("/incidentes")
      .then(setItems)
      .catch((error) => {
        setItems([]);
        setNotice({ type: "error", text: error.message });
      });
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (editing) {
      try {
        localStorage.setItem(draftKey, JSON.stringify(editing));
      } catch {
        setNotice({
          type: "error",
          text: "El borrador es demasiado grande para guardarse automáticamente. Elimina alguna evidencia pesada.",
        });
      }
    }
  }, [editing, draftKey]);
  const rows = useMemo(
    () =>
      (items || []).filter(
        (item) =>
          (filters.estado === "todos" || item.estado === filters.estado) &&
          (filters.severidad === "todas" ||
            item.severidad === filters.severidad) &&
          `${item.codigo} ${item.tipo} ${item.descripcion}`
            .toLowerCase()
            .includes(filters.search.toLowerCase()),
      ),
    [items, filters],
  );
  const openNew = () => {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(draftKey));
    } catch {
      /* borrador inválido */
    }
    setEditing(saved || blank());
    setErrors({});
  };
  const validateGeneral = () => {
    const next = {};
    if (!editing.tipo) next.tipo = "Selecciona el tipo.";
    if (!editing.area.trim()) next.area = "Ingresa el área o ubicación.";
    if (!editing.fecha) next.fecha = "Selecciona la fecha.";
    if (!editing.hora) next.hora = "Ingresa la hora.";
    if (editing.descripcion.trim().length < 10)
      next.descripcion = "Describe el hecho con al menos 10 caracteres.";
    setErrors(next);
    return !Object.keys(next).length;
  };
  const next = () => {
    setNotice(null);
    if (editing.step === 1 && !validateGeneral()) return;
    setEditing({ ...editing, step: Math.min(3, editing.step + 1) });
  };
  const save = async (borrador = false) => {
    if (!validateGeneral()) {
      setEditing({ ...editing, step: 1 });
      setNotice({
        type: "error",
        text: borrador
          ? "Completa los datos generales antes de guardar el borrador."
          : "Revisa los datos generales obligatorios.",
      });
      return;
    }
    if (borrador) {
      try {
        localStorage.setItem(draftKey, JSON.stringify(editing));
        setEditing(null);
        setSuccess({
          title: "Borrador guardado",
          message:
            "El borrador quedó guardado en este navegador y continuará al abrir Nueva incidencia.",
        });
      } catch {
        setNotice({
          type: "error",
          text: "No se pudo guardar el borrador. Elimina alguna evidencia pesada e inténtalo nuevamente.",
        });
      }
      return;
    }
    setBusy(true);
    try {
      await api("/incidentes", {
        method: "POST",
        body: { ...editing, borrador },
      });
      localStorage.removeItem(draftKey);
      setEditing(null);
      await load();
      setSuccess({
        title: "Incidencia enviada",
        message: "El evento quedó registrado correctamente.",
      });
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };
  const changeState = async (estado) => {
    setBusy(true);
    try {
      await api(`/incidentes/${viewing.id}`, {
        method: "PATCH",
        body: { estado },
      });
      setViewing({ ...viewing, estado });
      await load();
    } catch (error) {
      setNotice({ type: "error", text: error.message });
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <PageHeader
        eyebrow={
          user?.rol_db === "gerente" ? "Consulta comercial" : "Seguridad"
        }
        title="Incidencias"
        subtitle={
          canCreate
            ? "Registro guiado, seguimiento y cierre de eventos de seguridad."
            : "Consulta de incidencias, severidad, estado, evidencias y seguimiento."
        }
        action={
          canCreate ? (
            <button className="button button--primary" onClick={openNew}>
              <Plus size={16} />
              Nueva incidencia
            </button>
          ) : null
        }
      />
      {notice && (
        <Notice type={notice.type} onClose={() => setNotice(null)}>
          {notice.text}
        </Notice>
      )}
      <section className="compact-metrics security-metrics">
        <div>
          <span>Abiertas</span>
          <strong>
            {(items || []).filter((x) => x.estado === "abierta").length}
          </strong>
          <small>Requieren atención</small>
        </div>
        <div>
          <span>En revisión</span>
          <strong>
            {
              (items || []).filter((x) =>
                ["revision", "borrador"].includes(x.estado),
              ).length
            }
          </strong>
          <small>Pendientes de validar</small>
        </div>
        <div>
          <span>Cerradas</span>
          <strong>
            {(items || []).filter((x) => x.estado === "cerrada").length}
          </strong>
          <small>Histórico registrado</small>
        </div>
      </section>
      <section className="panel">
        <div className="toolbar toolbar--filters">
          <input
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            placeholder="Código, tipo o detalle"
          />
          <select
            value={filters.estado}
            onChange={(e) => setFilters({ ...filters, estado: e.target.value })}
          >
            <option value="todos">Todos los estados</option>
            {Object.entries(labels).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <select
            value={filters.severidad}
            onChange={(e) =>
              setFilters({ ...filters, severidad: e.target.value })
            }
          >
            <option value="todas">Todas las severidades</option>
            <option value="baja">Baja</option>
            <option value="media">Media</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </select>
        </div>
        {!items ? (
          <Loading />
        ) : rows.length ? (
          <div className="data-table data-table--incidents">
            <div className="data-table__head">
              <span>Código</span>
              <span>Fecha</span>
              <span>Tipo</span>
              <span>Severidad</span>
              <span>Estado</span>
              <span>Evidencias</span>
              <span />
            </div>
            {rows.map((item) => (
              <div className="data-table__row" key={item.id}>
                <strong>{item.codigo || `INC-${item.id}`}</strong>
                <span>{item.fecha}</span>
                <span>{item.tipo || item.titulo}</span>
                <span className={`severity severity--${item.severidad}`}>
                  {item.severidad}
                </span>
                <StatusBadge value={item.estado} label={labels[item.estado]} />
                <span>{item.evidencias?.length || 0} archivos</span>
                <button
                  className="icon-button"
                  onClick={() => setViewing(item)}
                >
                  <Eye size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            icon={ShieldAlert}
            title="Sin incidencias"
            text="No hay incidencias con los filtros seleccionados."
          />
        )}
      </section>
      <Modal
        open={!!editing}
        wide
        title="Nueva incidencia"
        subtitle="Registro guiado en 3 fases · Borrador automático"
        onClose={() => !busy && setEditing(null)}
      >
        {editing && (
          <div className="incident-wizard">
            <WizardSteps step={editing.step} />
            {editing.step === 1 && (
              <GeneralStep
                data={editing}
                setData={setEditing}
                errors={errors}
              />
            )}
            {editing.step === 2 && (
              <InvolvedStep
                data={editing}
                setData={setEditing}
                setNotice={setNotice}
              />
            )}
            {editing.step === 3 && <ReviewStep data={editing} />}
            <div className="form-actions wizard-actions">
              <button
                type="button"
                className="button button--ghost"
                onClick={() =>
                  editing.step === 1
                    ? setEditing(null)
                    : setEditing({ ...editing, step: editing.step - 1 })
                }
              >
                {editing.step === 1 ? "Cancelar" : "Volver"}
              </button>
              <button
                type="button"
                className="button button--ghost"
                disabled={busy}
                onClick={() => save(true)}
              >
                Guardar borrador
              </button>
              {editing.step < 3 ? (
                <button
                  type="button"
                  className="button button--primary"
                  onClick={next}
                >
                  Continuar
                </button>
              ) : (
                <button
                  type="button"
                  className="button button--primary"
                  disabled={busy}
                  onClick={() => save(false)}
                >
                  {busy ? "Enviando…" : "Enviar incidencia"}
                </button>
              )}
            </div>
          </div>
        )}
      </Modal>
      <Modal
        open={!!viewing}
        wide
        title={viewing?.codigo || "Detalle de incidencia"}
        subtitle={
          viewing
            ? `${viewing.tipo} · ${viewing.fecha} ${String(viewing.hora).slice(0, 5)}`
            : ""
        }
        onClose={() => setViewing(null)}
      >
        {viewing && (
          <div className="incident-detail">
            <div className="incident-detail__badges">
              <span className={`severity severity--${viewing.severidad}`}>
                {viewing.severidad}
              </span>
              <StatusBadge
                value={viewing.estado}
                label={labels[viewing.estado]}
              />
            </div>
            <h3>Resumen del evento</h3>
            <dl>
              <div>
                <dt>Tipo</dt>
                <dd>{viewing.tipo}</dd>
              </div>
              <div>
                <dt>Área</dt>
                <dd>{viewing.area || "—"}</dd>
              </div>
              <div>
                <dt>Reportado por</dt>
                <dd>{viewing.reportado_por_nombre}</dd>
              </div>
              <div>
                <dt>Evidencias</dt>
                <dd>{viewing.evidencias?.length || 0}</dd>
              </div>
              <div>
                <dt>Productos</dt>
                <dd>
                  {viewing.productos?.reduce(
                    (sum, x) => sum + Number(x.cantidad || 0),
                    0,
                  ) || 0}
                </dd>
              </div>
              <div>
                <dt>Valor involucrado</dt>
                <dd>
                  {money(
                    viewing.productos?.reduce(
                      (sum, x) => sum + Number(x.total || 0),
                      0,
                    ),
                  )}
                </dd>
              </div>
              <div>
                <dt>Personas</dt>
                <dd>{viewing.personas?.length || 0}</dd>
              </div>
              <div>
                <dt>Detención</dt>
                <dd>{viewing.detencion ? "Sí" : "No"}</dd>
              </div>
            </dl>
            <p>{viewing.descripcion}</p>
            {viewing.evidencias?.length > 0 && (
              <div className="evidence-list evidence-list--detail">
                {viewing.evidencias.map((item, index) => (
                  <a
                    key={`${item.nombre}-${index}`}
                    href={item.data_url}
                    download={item.nombre}
                  >
                    <Download size={15} />
                    {item.nombre}
                  </a>
                ))}
              </div>
            )}
            {canCreate && <div className="form-actions">
              <button
                className="button button--ghost"
                disabled={busy || viewing.estado === "revision"}
                onClick={() => changeState("revision")}
              >
                Enviar a revisión
              </button>
              <button
                className="button button--primary"
                disabled={busy || viewing.estado === "cerrada"}
                onClick={() => changeState("cerrada")}
              >
                Cerrar incidencia
              </button>
            </div>}
          </div>
        )}
      </Modal>
      <SuccessDialog
        open={!!success}
        title={success?.title}
        message={success?.message}
        onContinue={() => setSuccess(false)}
      />
    </>
  );
}
