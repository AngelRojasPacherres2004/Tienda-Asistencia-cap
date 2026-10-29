import { useState } from 'react';
import { Field, Notice } from './UI';

const regionNames = new Intl.DisplayNames(['es'], { type: 'region' });
const countries = [...new Set(Array.from({ length: 26 * 26 }, (_, index) => {
  const code = String.fromCharCode(65 + Math.floor(index / 26), 65 + index % 26);
  const name = regionNames.of(code);
  return name !== code && code !== 'ZZ' ? name : null;
}).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
const accessRoles = new Set(['asistente_tienda', 'jefe_seguridad']);

export default function StoreNewPersonForm({ value, set, errors, formError, onSubmit, onClose, busy, roles, roleLabels, districts, today }) {
  const [touched, setTouched] = useState({});
  const [invalid, setInvalid] = useState({});
  const valid = node => node.validity.valid && (!node.required || String(node.value).trim().length > 0);
  const check = event => {
    const input = event.target;
    if (!input.name) return;
    setTouched(current => ({ ...current, [input.name]: true }));
    setInvalid(current => ({ ...current, [input.name]: valid(input) ? '' : 'Revisa este campo.' }));
  };
  const field = (name, label, input, options = {}) => <Field key={name} label={label} className={options.wide ? 'span-2' : ''} error={errors[name] || (touched[name] && invalid[name])}>{input}</Field>;
  const input = (name, props = {}) => <input name={name} required value={value[name] ?? ''} onChange={event => set(name, event.target.value)} {...props} />;
  const select = (name, choices) => <select name={name} required value={value[name] || ''} onChange={event => set(name, event.target.value)}><option value="">Selecciona</option>{choices.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>;
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
    {field('email', 'Correo', input('email', { type: 'email' }))}
    {section('Información laboral')}
    {field('fecha_ingreso', 'Fecha de ingreso', input('fecha_ingreso', { type: 'date', required: true }))}
    {field('fecha_nacimiento', 'Fecha de nacimiento', input('fecha_nacimiento', { type: 'date', max: today }))}
    {field('sueldo', 'Sueldo', input('sueldo', { type: 'number', min: 0, step: '0.01' }))}
    {field('rol', 'Rol', <select name="rol" value={value.rol} onChange={event => { const role = event.target.value; set('rol', role); if (!accessRoles.has(role)) { set('usuario', ''); set('password', ''); } }}>{roles.map(role => <option key={role} value={role}>{roleLabels[role]}</option>)}</select>)}
    {accessRoles.has(value.rol) && <>{field('usuario', 'Usuario', input('usuario', { required: false, pattern: '[A-Za-z0-9._-]{2,}' }))}{field('password', 'Contraseña', input('password', { required: false, type: 'password', minLength: 3 }))}</>}
    {section('Datos personales y emergencia')}
    {field('sexo', 'Sexo', select('sexo', [['hombre', 'Hombre'], ['mujer', 'Mujer'], ['no_especificado', 'Sin especificar']]))}
    {field('nacionalidad', 'País de origen', select('nacionalidad', countries.map(country => [country, country])))}
    {field('telefono_emergencia', 'Teléfono de emergencia', input('telefono_emergencia', { inputMode: 'numeric', pattern: '[0-9]{9}', maxLength: 9 }))}
    {field('contacto_emergencia', 'Contacto de emergencia', input('contacto_emergencia'))}
    {field('distrito', 'Distrito', select('distrito', districts.map(district => [district, district])))}
    {field('direccion', 'Dirección', input('direccion'))}
    {section('Estudios y familia')}
    {field('grado_academico', 'Nivel de estudios', select('grado_academico', [['primaria', 'Primaria'], ['secundaria', 'Secundaria'], ['tecnico', 'Técnico'], ['universitario', 'Universitario'], ['sin_especificar', 'Sin especificar']]))}
    {field('carrera', 'Carrera', input('carrera'))}
    {field('tiene_parentesco', '¿Tiene parentesco?', <select value={value.tiene_parentesco ? 'si' : 'no'} onChange={event => set('tiene_parentesco', event.target.value === 'si')}><option value="no">No</option><option value="si">Sí</option></select>)}
    {value.tiene_parentesco && <>{field('tipo_parentesco', 'Tipo de parentesco', select('tipo_parentesco', [['padre_madre', 'Padre / madre'], ['hermano_hermana', 'Hermano / hermana'], ['conyuge_pareja', 'Cónyuge / pareja'], ['hijo_hija', 'Hijo / hija'], ['otro', 'Otro']]))}{field('familiar_vinculo', 'Nombre del familiar', input('familiar_vinculo'))}</>}
    {field('estado_civil', 'Estado civil', select('estado_civil', [['soltero', 'Soltero(a)'], ['casado', 'Casado(a)'], ['conviviente', 'Conviviente'], ['divorciado', 'Divorciado(a)'], ['viudo', 'Viudo(a)'], ['sin_especificar', 'Sin especificar']]))}
    {field('numero_hijos', 'Número de hijos', input('numero_hijos', { type: 'number', min: 0, step: 1 }))}
    {section('Tallas y salud')}
    {field('talla_polo', 'Talla de polo', select('talla_polo', ['s', 'm', 'l', 'xl', 'xxl'].map(size => [size, size.toUpperCase()])))}
    {field('talla_zapatillas', 'Talla de zapatos', input('talla_zapatillas', { type: 'number', min: 0, step: 0.5 }))}
    {field('alergia', 'Alergia', <textarea name="alergia" required placeholder="Escribe Ninguna si no tiene" maxLength={500} value={value.alergia || ''} onChange={event => set('alergia', event.target.value)} />, { wide: true })}
    {field('condicion_salud', 'Condición de salud', <textarea name="condicion_salud" required placeholder="Escribe Ninguna si no tiene" maxLength={500} value={value.condicion_salud || ''} onChange={event => set('condicion_salud', event.target.value)} />, { wide: true })}
    <div className="form-actions span-2"><button type="button" className="button button--ghost" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></div>
  </form>;
}
