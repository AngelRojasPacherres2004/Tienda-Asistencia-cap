import { fieldWarning, marketingError } from "./marketingErrors";
import { MarketingFeedback } from "./marketingFeedback";
import { useState } from "react";
import { Field, Modal } from "../components/UI";
import { todayISO } from "../lib/api";
import { weekDays } from "./marketingStaff";

export default function MarketingStaffModal({ open, editing, setEditing, roles, saving, onClose, onSubmit, error }) {
  const [validationError, setValidationError] = useState(null);
  if (!open) return null;
  const fieldErrors = {};
  const isStoreAdmin = true;
  const availableRoles = roles;
  const roleLabels = Object.fromEntries(roles.map(role => [role, role.replaceAll("_", " ")]));
  const set = (key, value) => setEditing(current => ({ ...current, [key]: value }));
  const setSchedule = (day, key, value) => setEditing(current => ({ ...current, horarios: current.horarios.map(row => row.dia_semana === day ? { ...row, [key]: value } : row) }));
  return <Modal open={open} wide title={editing.id ? "Editar personal de Marketing" : "Agregar personal"} subtitle="Completa la ficha personal, laboral y el horario semanal." onClose={saving ? () => {} : onClose}>
    <form className="form-grid" noValidate onSubmit={async event => {
      event.preventDefault();
      const invalid = [...event.currentTarget.elements].find(control => control.willValidate && !control.checkValidity());
      if (invalid) {

        setValidationError(fieldWarning(invalid));
        invalid.focus();
        return;
      }
      setValidationError(null);
      try { await onSubmit(event); } catch (exception) { setValidationError(marketingError(exception)); }
    }}>
      <MarketingFeedback message={validationError || error} />
            <Field label="Nombres" error={fieldErrors.nombres}><input required value={editing.nombres} onChange={(e) => set("nombres", e.target.value)} /></Field>
            <Field label="Apellidos" error={fieldErrors.apellidos}><input required value={editing.apellidos} onChange={(e) => set("apellidos", e.target.value)} /></Field>
            <Field label="Tipo de documento"><select value={editing.tipo_documento || "dni"} onChange={(e) => { set("tipo_documento", e.target.value); set("dni", ""); }}><option value="dni">DNI</option><option value="ce">Carné de extranjería (CE)</option></select></Field>
            <Field label={editing.tipo_documento === "ce" ? "Número de CE" : "Número de DNI"} error={fieldErrors.dni} hint={`${editing.tipo_documento === "ce" ? 9 : 8} dígitos`}><input required inputMode="numeric" maxLength={editing.tipo_documento === "ce" ? 9 : 8} value={editing.dni} onChange={(e) => set("dni", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Teléfono" error={fieldErrors.telefono} hint="9 dígitos, opcional"><input maxLength={9} value={editing.telefono} onChange={(e) => set("telefono", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Correo" hint="Se usa para notificaciones de incidencias"><input type="email" value={editing.email || ""} onChange={(e) => set("email", e.target.value)} /></Field>
            <Field label="Fecha de ingreso" error={fieldErrors.fecha_ingreso}><input required type="date" value={editing.fecha_ingreso || ""} onChange={(e) => set("fecha_ingreso", e.target.value)} /></Field>
            <Field label="Fecha de nacimiento"><input type="date" max={todayISO()} value={editing.fecha_nacimiento || ""} onChange={(e) => set("fecha_nacimiento", e.target.value)} /></Field>
            <Field label="Edad" hint="Se calcula según la fecha de nacimiento"><input readOnly value={editing.fecha_nacimiento ? Math.max(0, Math.floor((Date.now() - new Date(`${editing.fecha_nacimiento}T12:00:00`).getTime()) / 31557600000)) : ""} /></Field>
            <Field label="Sueldo"><input type="number" min="0" step="0.01" placeholder="0,00" value={editing.sueldo ?? ""} onChange={(e) => set("sueldo", e.target.value)} /></Field>
            <Field label="Fecha de salida" error={fieldErrors.fecha_salida} hint={editing.id ? "Al guardarla, el trabajador quedará inactivo." : "Se registra únicamente al editar al trabajador."}><input type="date" disabled={!editing.id} min={editing.fecha_ingreso || undefined} value={editing.fecha_salida || ""} onChange={(e) => { set("fecha_salida", e.target.value); if (e.target.value) set("estado", "inactivo"); else set("motivo_salida", ""); }} /></Field>
            <Field label="Motivo de salida" error={fieldErrors.motivo_salida}><input required={Boolean(editing.fecha_salida)} disabled={!editing.id || !editing.fecha_salida} placeholder="Indica el motivo de la salida" value={editing.motivo_salida || ""} onChange={(e) => set("motivo_salida", e.target.value)} /></Field>
            {availableRoles.length > 0 && (
              <>
                <Field label="Rol">
                  <select value={editing.rol} onChange={(e) => set("rol", e.target.value)}>
                    {availableRoles.map((role) => <option key={role} value={role}>{roleLabels[role]}</option>)}
                  </select>
                </Field>
              </>
            )}
            <Field label="Estado" className="span-2">
              <select value={editing.estado} onChange={(e) => set("estado", e.target.value)}>
                <option value="activo">Activo</option>
                <option value="inactivo">Inactivo</option>
              </select>
            </Field>
            <Field label="Sexo"><select value={editing.sexo || "no_especificado"} onChange={(e) => set("sexo", e.target.value)}><option value="no_especificado">Sin especificar</option><option value="hombre">Hombre</option><option value="mujer">Mujer</option></select></Field>
            <Field label="Mes de cumpleaños"><input readOnly value={editing.fecha_nacimiento ? new Intl.DateTimeFormat("es-PE", { month: "long", timeZone: "UTC" }).format(new Date(`${editing.fecha_nacimiento}T12:00:00Z`)) : ""} /></Field>
            <Field label="Nacionalidad"><input value={editing.nacionalidad || ""} onChange={(e) => set("nacionalidad", e.target.value)} /></Field>
            <Field label="Teléfono de emergencia" error={fieldErrors.telefono_emergencia}><input maxLength={9} value={editing.telefono_emergencia || ""} onChange={(e) => set("telefono_emergencia", e.target.value.replace(/\D/g, ""))} /></Field>
            <Field label="Contacto de emergencia" hint="Nombres y apellidos"><input value={editing.contacto_emergencia || ""} onChange={(e) => set("contacto_emergencia", e.target.value)} /></Field>
            <Field label="Distrito"><input value={editing.distrito || ""} onChange={(e) => set("distrito", e.target.value)} /></Field>
            <Field label="Dirección" className="span-2"><textarea rows={2} value={editing.direccion || ""} onChange={(e) => set("direccion", e.target.value)} /></Field>
            <Field label="Nivel de estudio"><select value={editing.grado_academico || "sin_especificar"} onChange={(e) => { set("grado_academico", e.target.value); if (e.target.value !== "universitario") set("ciclo_semestre", ""); }}><option value="sin_especificar">Sin especificar</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option><option value="tecnico">Técnico</option><option value="universitario">Universitario</option>{!isStoreAdmin && <option value="postgrado">Posgrado</option>}</select></Field>
            {editing.grado_academico === "universitario" && <Field label="Ciclo / semestre"><input placeholder="Ej. 8vo ciclo" value={editing.ciclo_semestre || ""} onChange={(e) => set("ciclo_semestre", e.target.value)} /></Field>}
            {!isStoreAdmin && <Field label="Área"><input placeholder="Ej. Caja, almacén o ventas" value={editing.area_laboral || ""} onChange={(e) => set("area_laboral", e.target.value)} /></Field>}
            <Field label="Carrera"><input placeholder="Carrera técnica o profesional" value={editing.carrera || ""} onChange={(e) => set("carrera", e.target.value)} /></Field>
            <Field label="Régimen / jornada"><select value={editing.regimen_jornada || ""} onChange={(e) => set("regimen_jornada", e.target.value)}><option value="">Sin especificar</option><option value="4h">4 horas</option><option value="8h">8 horas</option><option value="12h">12 horas</option></select></Field>
            <Field label="Tipo de turno"><select value={editing.tipo_turno || ""} onChange={(e) => set("tipo_turno", e.target.value)}><option value="">Sin especificar</option><option value="apertura">Apertura</option><option value="intermedio">Intermedio</option><option value="cierre">Cierre</option><option value="part_time">Part time</option></select></Field>
            <Field label="¿Tiene parentesco?"><select value={editing.tiene_parentesco ? "si" : "no"} onChange={(e) => { const hasRelationship = e.target.value === "si"; set("tiene_parentesco", hasRelationship); if (!hasRelationship) setEditing((current) => ({ ...current, tipo_parentesco: "", familiar_vinculo: "" })); }}><option value="no">No</option><option value="si">Sí</option></select></Field>
            {editing.tiene_parentesco && <>
              <Field label="Tipo de parentesco" error={fieldErrors.tipo_parentesco}><select required value={editing.tipo_parentesco || ""} onChange={(e) => set("tipo_parentesco", e.target.value)}><option value="">Selecciona</option><option value="padre_madre">Padre / madre</option><option value="hermano_hermana">Hermano / hermana</option><option value="conyuge_pareja">Cónyuge / pareja</option><option value="hijo_hija">Hijo / hija</option><option value="otro">Otro</option></select></Field>
              <Field label="Familiar / vínculo" error={fieldErrors.familiar_vinculo}><input required placeholder="Nombre completo" value={editing.familiar_vinculo || ""} onChange={(e) => set("familiar_vinculo", e.target.value)} /></Field>
            </>}
            <Field label="Estado civil"><select value={editing.estado_civil || "sin_especificar"} onChange={(e) => set("estado_civil", e.target.value)}><option value="sin_especificar">Sin especificar</option><option value="soltero">Soltero(a)</option><option value="casado">Casado(a)</option><option value="conviviente">Conviviente</option><option value="divorciado">Divorciado(a)</option><option value="viudo">Viudo(a)</option></select></Field>
            <Field label="Número de hijos"><input type="number" min="0" step="1" value={editing.numero_hijos ?? ""} onChange={(e) => set("numero_hijos", e.target.value)} /></Field>
            <Field label="Talla de zapatillas"><input type="number" min="0" step="0.5" value={editing.talla_zapatillas ?? ""} onChange={(e) => set("talla_zapatillas", e.target.value)} /></Field>
            <Field label="Talla de polo"><select value={editing.talla_polo || "sin_especificar"} onChange={(e) => set("talla_polo", e.target.value)}><option value="sin_especificar">Sin especificar</option>{["s", "m", "l", "xl", "xxl"].map((size) => <option key={size} value={size}>{size.toUpperCase()}</option>)}</select></Field>
            <Field label="Alergia" className="span-2"><textarea rows={2} maxLength={500} placeholder="Ej. Ninguna, o detalla la alergia" value={editing.alergia || ""} onChange={(e) => set("alergia", e.target.value)} /></Field>
            <Field label="Condición de salud" className="span-2" hint="Opcional. Registra tratamientos, restricciones o consideraciones médicas relevantes.">
              <textarea rows={3} maxLength={500} placeholder="Ej. Ninguna, tratamiento o consideración médica" value={editing.condicion_salud || ""} onChange={(e) => set("condicion_salud", e.target.value)} />
            </Field>
            <div className="form-section-title span-2"><strong>Horario semanal</strong><span>Marca los días trabajados y registra sus horas.</span></div>
            {fieldErrors.horarios && <div className="field-error span-2">{fieldErrors.horarios}</div>}
            <div className="weekly-schedule span-2">
              {editing.horarios.map((row, index) => <div className="weekly-schedule__row" key={row.dia_semana}>
                <strong>{weekDays[index]}</strong>
                <label className="schedule-check"><input type="checkbox" checked={Boolean(row.trabaja)} onChange={(e) => setSchedule(row.dia_semana, "trabaja", e.target.checked)} /> Trabaja</label>
                <input aria-label={`Entrada ${weekDays[index]}`} type="time" disabled={!row.trabaja} value={row.hora_entrada || ""} onChange={(e) => setSchedule(row.dia_semana, "hora_entrada", e.target.value)} />
                <input aria-label={`Salida ${weekDays[index]}`} type="time" disabled={!row.trabaja} value={row.hora_salida || ""} onChange={(e) => setSchedule(row.dia_semana, "hora_salida", e.target.value)} />
              </div>)}
            </div>
      <div className="form-actions span-2"><button type="button" className="button button--ghost" disabled={saving} onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</button></div>
    </form>
  </Modal>;
}
