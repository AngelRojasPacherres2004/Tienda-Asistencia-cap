import { countries } from '../../shared/store-personnel.js';
import { departureReasonOptions, normalizeDepartureReason } from '../lib/personnelCatalogs';
import { useState } from 'react';
import { Field, Notice } from './UI';
import OptionalProfileField from './OptionalProfileField';

const accessRoles = new Set(['asistente_tienda', 'jefe_seguridad', 'jefe_tienda']);

export default function StoreNewPersonForm({ value, set, errors, formError, onSubmit, onClose, busy, roles, roleLabels, districts, today, stores, editing = false }) {
  const [touched, setTouched] = useState({});
  const [invalid, setInvalid] = useState({});
  const [optionalFields, setOptionalFields] = useState(() => ({
    email: Boolean(String(value.email || '').trim()),
    telefono_emergencia: Boolean(String(value.telefono_emergencia || '').trim()),
    numero_hijos: value.numero_hijos !== '' && value.numero_hijos != null && Number(value.numero_hijos) > 0,
    alergia: Boolean(String(value.alergia || '').trim()),
    condicion_salud: Boolean(String(value.condicion_salud || '').trim()),
  }));
  const valid = node => node.validity.valid && (!node.required || String(node.value).trim().length > 0);
  const check = event => {
    const input = event.target;
    if (!input.name) return;
    setTouched(current => ({ ...current, [input.name]: true }));
    setInvalid(current => ({ ...current, [input.name]: valid(input) ? '' : 'Revisa este campo.' }));
  };
  const field = (name, label, input, options = {}) => <Field key={name} label={label} className={options.wide ? 'span-2' : ''} error={errors[name] || (touched[name] && invalid[name])}>{input}</Field>;
  const input = (name, props = {}) => <input name={name} required={!editing} value={value[name] ?? ''} onChange={event => set(name, event.target.value)} {...props} />;
  const select = (name, choices) => <select name={name} required={!editing} value={value[name] || ''} onChange={event => set(name, event.target.value)}><option value="">Selecciona</option>{choices.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
  const toggleOptional = (name, enabled) => { setOptionalFields(current => ({ ...current, [name]: enabled })); if (!enabled) set(name, ''); };
  const section = title => <div className="form-section-title span-2"><strong>{title}</strong></div>;
  return <form className="form-grid" noValidate onBlur={check} onSubmit={event => {
    const inputs = [...event.currentTarget.querySelectorAll('input,select,textarea')];
    const bad = Object.fromEntries(inputs.filter(node => node.name && !valid(node)).map(node => [node.name, 'Revisa este campo.']));
    if (Object.keys(bad).length) { event.preventDefault(); setInvalid(bad); setTouched(Object.fromEntries(Object.keys(bad).map(key => [key, true]))); return; }
    onSubmit(event);
  }}>
    {formError && <div className="span-2"><Notice type="error">{formError}</Notice></div>}
    {section('Identificación y contacto')}
    {field('tipo_documento', 'Tipo de documento', <select name="tipo_documento" value={value.tipo_documento} onChange={event => { set('tipo_documento', event.target.value); set('dni', ''); }}><option value="dni">DNI</option><option value="ce">Carné de extranjería</option></select>)}
    {field('dni', value.tipo_documento === 'ce' ? 'CE' : 'DNI', input('dni', { required: true, inputMode: 'numeric', pattern: value.tipo_documento === 'ce' ? '[0-9]{9}' : '[0-9]{8}', maxLength: value.tipo_documento === 'ce' ? 9 : 8 }))}
    {field('nombres', 'Nombres', input('nombres', { required: true, minLength: 2 }))}
    {field('apellidos', 'Apellidos', input('apellidos', { required: true, minLength: 2 }))}
    {field('telefono', 'Teléfono', input('telefono', { inputMode: 'numeric', pattern: '[0-9]{9}', maxLength: 9 }))}
    <OptionalProfileField label="Correo" checked={optionalFields.email} onChange={(enabled) => toggleOptional('email', enabled)}>{field('email', 'Correo', input('email', { type: 'email', required: true }))}</OptionalProfileField>
    {section('Información laboral')}
    {field('fecha_ingreso', 'Fecha de ingreso', input('fecha_ingreso', { type: 'date', required: true }))}
    {field('fecha_nacimiento', 'Fecha de nacimiento', input('fecha_nacimiento', { type: 'date', max: today }))}
    {field('sueldo', 'Sueldo', input('sueldo', { type: 'number', min: 0, step: '0.01' }))}
    {editing && <>{field('fecha_salida', 'Fecha de retiro', <input name="fecha_salida" type="date" min={value.fecha_ingreso || undefined} value={value.fecha_salida || ''} onChange={event => { const fecha = event.target.value; set('fecha_salida', fecha); set('estado', fecha ? 'inactivo' : 'activo'); if (!fecha) set('motivo_salida', ''); }} />)}{field('motivo_salida', 'Motivo de retiro', <select name="motivo_salida" required={Boolean(value.fecha_salida)} value={normalizeDepartureReason(value.motivo_salida)} onChange={event => set('motivo_salida', event.target.value)}><option value="">Selecciona un motivo</option>{departureReasonOptions(value.motivo_salida).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select>)}</>}
    {field('rol', 'Rol', <select name="rol" value={value.rol} onChange={event => { const role = event.target.value; set('rol', role); if (!accessRoles.has(role)) { set('usuario', ''); set('password', ''); } }}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>)}
    {stores && field('tienda_id', 'Tienda asignada', <select name="tienda_id" value={value.tienda_id || ''} onChange={event => set('tienda_id', event.target.value)}><option value="">Sin asignar (disponible)</option>{stores.map(store => <option key={store.id} value={store.id}>{store.nombre}</option>)}</select>)}
    {field('regimen_jornada', 'Régimen / jornada (horas)', input('regimen_jornada', { type: 'number', min: 0.01, max: 24, step: 0.01, placeholder: 'Ej. 8 o 4.5' }))}
    {field('tipo_turno', 'Turno', select('tipo_turno', [['apertura', 'Apertura'], ['cierre', 'Cierre']]))}
    {accessRoles.has(value.rol) && <>{field('usuario', 'Usuario', input('usuario', { required: false, pattern: '[A-Za-z0-9._-]{2,}' }))}{field('password', 'Contraseña', input('password', { required: false, type: 'password', minLength: 3 }))}</>}
    {section('Datos personales y emergencia')}
    {field('sexo', 'Sexo', select('sexo', [['hombre', 'Hombre'], ['mujer', 'Mujer'], ['no_especificado', 'Sin especificar']]))}
    {field('nacionalidad', 'País de origen', select('nacionalidad', countries.map(country => [country, country])))}
    <OptionalProfileField label="Teléfono de emergencia" checked={optionalFields.telefono_emergencia} onChange={(enabled) => toggleOptional('telefono_emergencia', enabled)}>{field('telefono_emergencia', 'Teléfono de emergencia', input('telefono_emergencia', { required: true, inputMode: 'numeric', pattern: '[0-9]{9}', maxLength: 9 }))}</OptionalProfileField>
    {field('contacto_emergencia', 'Contacto de emergencia', input('contacto_emergencia'))}
    {field('distrito', 'Distrito', select('distrito', districts.map(district => [district, district])))}
    {field('direccion', 'Dirección', input('direccion'))}
    {section('Estudios y familia')}
    {field('grado_academico', 'Nivel de estudios', <select name="grado_academico" required={!editing} value={value.grado_academico || ''} onChange={event => { const grado = event.target.value; set('grado_academico', grado); if (!['tecnico', 'universitario', 'postgrado'].includes(grado)) { set('carrera', ''); set('ciclo_semestre', ''); } }}><option value="">Selecciona</option><option value="primaria">Primaria</option><option value="secundaria">Secundaria</option><option value="tecnico">Técnico</option><option value="universitario">Universitario</option><option value="sin_especificar">Sin especificar</option></select>)}
    {['tecnico', 'universitario', 'postgrado'].includes(value.grado_academico) && field('carrera', 'Carrera', input('carrera'))}
    {field('tiene_parentesco', '¿Tiene parentesco?', <select value={value.tiene_parentesco ? 'si' : 'no'} onChange={event => set('tiene_parentesco', event.target.value === 'si')}><option value="no">No</option><option value="si">Sí</option></select>)}
    {value.tiene_parentesco && <>{field('tipo_parentesco', 'Tipo de parentesco', select('tipo_parentesco', [['padre_madre', 'Padre / madre'], ['hermano_hermana', 'Hermano / hermana'], ['conyuge_pareja', 'Cónyuge / pareja'], ['hijo_hija', 'Hijo / hija'], ['otro', 'Otro']]))}{field('familiar_vinculo', 'Nombre del familiar', input('familiar_vinculo'))}</>}
    {field('estado_civil', 'Estado civil', select('estado_civil', [['soltero', 'Soltero(a)'], ['casado', 'Casado(a)'], ['conviviente', 'Conviviente'], ['divorciado', 'Divorciado(a)'], ['viudo', 'Viudo(a)'], ['sin_especificar', 'Sin especificar']]))}
    <OptionalProfileField label="Número de hijos" checked={optionalFields.numero_hijos} onChange={(enabled) => toggleOptional('numero_hijos', enabled)}>{field('numero_hijos', 'Número de hijos', input('numero_hijos', { required: true, type: 'number', min: 0, step: 1 }))}</OptionalProfileField>
    {section('Tallas y salud')}
    {field('talla_polo', 'Talla polo/casaca', select('talla_polo', ['s', 'm', 'l', 'xl', 'xxl'].map(size => [size, size.toUpperCase()])))}
    {field('talla_zapatillas', 'Talla de zapatos', input('talla_zapatillas', { type: 'number', min: 0, step: 0.5 }))}
    <OptionalProfileField label="Alergia" className="span-2" checked={optionalFields.alergia} onChange={(enabled) => toggleOptional('alergia', enabled)}>{field('alergia', 'Alergia', <textarea name="alergia" required placeholder="Describe la alergia" maxLength={500} value={value.alergia || ''} onChange={event => set('alergia', event.target.value)} />)}</OptionalProfileField>
    <OptionalProfileField label="Condición de salud" className="span-2" checked={optionalFields.condicion_salud} onChange={(enabled) => toggleOptional('condicion_salud', enabled)}>{field('condicion_salud', 'Condición de salud', <textarea name="condicion_salud" required placeholder="Describe la condición, tratamiento o restricción" maxLength={500} value={value.condicion_salud || ''} onChange={event => set('condicion_salud', event.target.value)} />)}</OptionalProfileField>
    <div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
  </form>;
}
