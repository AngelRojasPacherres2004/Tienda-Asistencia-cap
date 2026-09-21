import { useEffect, useMemo, useState } from "react";
import { ClipboardCheck, FileText, Plus, Upload } from "lucide-react";
import { api, formatDate, todayISO } from "../lib/api";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";

const DOCUMENTOS = ["Certificado de Defensa Civil","Licencia de Funcionamiento","Ficha RUC","Pozo a Tierra","Plan de Contingencia y Seguridad","Certificados de capacitación","Fumigación","Extintores","Luces de emergencia","Detectores de humo","Prueba hidrostática","Láminas de seguridad","Rociadores","Sistema de alarma contra incendios","Plano de evacuación","Plano de señalización","Plano de instalaciones eléctricas","Plano de arquitectura","Plano de ubicación"];
const AREAS_DOCUMENTOS = ["Municipalidad","Contabilidad","Ingeniero eléctrico","Calcin","Proveedor","Ingeniero civil","Correos especiales"];
const tabs = [["resumen","Resumen"],["documentos","Documentos"],["operacion","Operación"],["seguimiento","Seguimiento"]];
const blank = (type) => ({
  documento: { area_responsable:AREAS_DOCUMENTOS[0], codigo:"", tipo_documento:DOCUMENTOS[0], frecuencia_revision:"Anual", fecha_emision:"", fecha_vencimiento:"", estado:"vigente", archivo:null },
  reclamacion: { codigo_hoja:"", fecha:todayISO(), consumidor_nombre:"", consumidor_documento:"", consumidor_contacto:"", producto_servicio:"", monto:"", tipo:"reclamo", detalle:"", pedido_consumidor:"", observaciones_proveedor:"", acciones_adoptadas:"", fecha_respuesta:"", responsable:"", estado:"registrado", archivo:null },
  accion: { fecha:todayISO(), tipo:"marketing", responsable:"", accion:"", estado:"pendiente", objetivo:"", observacion:"", archivo:null },
  bitacora: { fecha:todayISO(), venta_dia:"", categoria:"operacion", evento:"", descripcion:"", archivo:null },
  mejora: { fecha:todayISO(), seccion:"", area:"", responsable:"", que_mejoro:"", como_se_hizo:"", estado:"registrada", resultado_beneficio:"", antes:null, despues:null },
  observacion: { accion_realizada:"", comentario:"", soporte_requerido:false, archivo:null },
}[type]);

const FileField = ({ label, onChange, accept=".pdf,image/*" }) => <Field label={label}><input type="file" accept={accept} onChange={(e) => onChange(e.target.files?.[0] || null)} /></Field>;
const Text = ({ label, name, form, setForm, ...props }) => <Field label={label}><input {...props} value={form[name] ?? ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></Field>;
const Area = ({ label, name, form, setForm }) => <Field label={label}><textarea rows="3" value={form[name] ?? ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></Field>;
const Select = ({ label, name, form, setForm, options }) => <Field label={label}><select value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })}>{options.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></Field>;

function downloadCsv(name, rows) {
  if (!rows.length) return;
  const keys = Object.keys(rows[0]).filter((key) => !key.includes("path") && !key.includes("nombre") && key !== "creado_por");
  const escape = (value) => `"${String(value ?? "").replaceAll('"','""')}"`;
  const blob = new Blob(["\ufeff" + [keys.join(";"), ...rows.map((row) => keys.map((key) => escape(row[key])).join(";"))].join("\n")], { type:"text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob), link = document.createElement("a"); link.href=url; link.download=name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 500);
}

export default function MiTiendaGestion() {
  const [data,setData] = useState(null), [tab,setTab] = useState("resumen"), [sub,setSub] = useState("municipal");
  const [modal,setModal] = useState(null), [form,setForm] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const load = () => api("/mi-tienda-gestion").then(setData).catch((e) => setData({ error:e.message }));
  useEffect(() => { load(); }, []);
  const open = (type, values={}) => { setError(""); setModal(type); setForm({ ...blank(type), ...values }); };
  const upload = async (file, folder) => {
    if (!file) return null; if (file.size > 5*1024*1024) throw new Error("El archivo supera los 5 MB.");
    const base64 = await new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file); });
    return api("/mi-tienda-gestion/archivo", { method:"POST", body:{ nombre:file.name, mime:file.type, base64, carpeta:folder } });
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      let payload={...form}, endpoint=modal;
      if (form.archivo) { const f=await upload(form.archivo,modal); payload[modal === "accion" || modal === "bitacora" ? "evidencia_path" : modal === "observacion" ? "evidencia_cierre_path" : "archivo_path"]=f.path; payload[modal === "accion" || modal === "bitacora" ? "evidencia_nombre" : modal === "observacion" ? "evidencia_cierre_nombre" : "archivo_nombre"]=f.nombre; }
      if (modal === "mejora") { const [a,d]=await Promise.all([upload(form.antes,"mejoras"),upload(form.despues,"mejoras")]); if(a) Object.assign(payload,{foto_antes_path:a.path,foto_antes_nombre:a.nombre}); if(d) Object.assign(payload,{foto_despues_path:d.path,foto_despues_nombre:d.nombre}); }
      delete payload.archivo; delete payload.antes; delete payload.despues;
      if (modal === "observacion") endpoint=`observaciones/${form.id}`;
      else endpoint={documento:"documentos",reclamacion:"reclamaciones",accion:"acciones",bitacora:"bitacora",mejora:"mejoras"}[modal] + (form.id ? `/${form.id}` : "");
      await api(`/mi-tienda-gestion/${endpoint}`, { method:form.id ? "PUT":"POST", body:payload }); setModal(null); await load();
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const viewFile = async (path) => { const {url}=await api("/mi-tienda-gestion/archivo-url",{method:"POST",body:{path}}); window.open(url,"_blank","noopener,noreferrer"); };
  const currentRows = useMemo(() => data?.[sub === "municipal" ? "documentos" : sub] || [], [data,sub]);
  if (!data) return <Loading />;
  if (data.error) return <Notice type="error">{data.error}</Notice>;
  const t=data.tienda || {}, r=data.resumen || {};
  return <>
    <PageHeader eyebrow="Gestión de tienda" title="Mi tienda" subtitle="Documentación, operación y seguimiento en un solo espacio." />
    <div className="mini-tabs">{tabs.map(([id,label]) => <button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{label}</button>)}</div>

    {tab === "resumen" && <div className="store-module">
      <section className="panel store-block"><header><div><small>Datos principales</small><h2>{t.nombre}</h2></div><button className="button button--ghost" onClick={()=>open("datos",t)}>Editar datos</button></header><div className="store-data-grid">{[["Código",t.codigo],["Zona",t.zona],["Formato",t.formato],["Clúster",t.cluster],["Distrito",t.distrito],["Dirección",t.direccion],["Estado operativo",t.estado]].map(([l,v])=><div key={l}><small>{l}</small><strong>{v||"Sin registrar"}</strong></div>)}</div></section>
      <div className="store-summary-grid">{[["Documentos próximos a vencer",r.documentos_por_vencer],["Reclamos en atención",r.reclamos_en_atencion],["Observaciones zonales abiertas",r.observaciones_abiertas],["Próxima acción",r.proxima_accion?.accion||"Sin acciones"],["Última mejora",r.ultima_mejora?.que_mejoro||"Sin mejoras"],["Última bitácora",r.ultima_bitacora?.fecha?formatDate(r.ultima_bitacora.fecha):"Sin registros"]].map(([l,v])=><section className="panel mini-status" key={l}><small>{l}</small><strong>{v}</strong></section>)}</div>
    </div>}

    {tab === "documentos" && <ModuleTabs items={[["municipal","Documentación municipal"],["reclamaciones","Libro de reclamaciones"]]} sub={sub} setSub={setSub} />}
    {tab === "operacion" && <ModuleTabs items={[["acciones","Acciones de tienda"],["bitacora","Bitácora diaria"]]} sub={sub} setSub={setSub} />}
    {tab === "seguimiento" && <ModuleTabs items={[["observaciones","Observaciones zonales"],["mejoras","Mejora continua"]]} sub={sub} setSub={setSub} />}
    {tab !== "resumen" && <Records section={sub} rows={currentRows} open={open} viewFile={viewFile} exportRows={()=>downloadCsv(`${sub}.csv`,currentRows)} />}

    <EditorModal type={modal} form={form} setForm={setForm} error={error} busy={busy} onClose={()=>setModal(null)} onSave={modal==="datos" ? async()=>{setBusy(true);try{await api("/mi-tienda-gestion/datos",{method:"PUT",body:form});setModal(null);await load();}catch(e){setError(e.message);}finally{setBusy(false);}} : save} />
  </>;
}

function ModuleTabs({items,sub,setSub}) { useEffect(()=>{ if(!items.some(([id])=>id===sub)) setSub(items[0][0]); },[items,sub,setSub]); return <div className="subsection-tabs">{items.map(([id,label])=><button key={id} className={sub===id?"active":""} onClick={()=>setSub(id)}>{label}</button>)}</div>; }

function Records({section,rows,open,viewFile,exportRows}) {
  const config={municipal:["documento","Actualizar documento"],reclamaciones:["reclamacion","Registrar reclamación"],acciones:["accion","Nueva acción"],bitacora:["bitacora","Registrar día"],observaciones:[null,null],mejoras:["mejora","Registrar mejora"]}[section] || [];
  const title={municipal:"Documentación municipal",reclamaciones:"Libro de reclamaciones",acciones:"Acciones de tienda",bitacora:"Bitácora diaria",observaciones:"Observaciones zonales",mejoras:"Mejora continua"}[section];
  const primary=(row)=>row.tipo_documento||row.codigo_hoja||row.accion||row.evento||row.area_item||row.que_mejoro;
  const secondary=(row)=>row.area_responsable||row.consumidor_nombre||row.responsable||row.categoria||row.descripcion||row.area;
  const path=(row)=>row.archivo_path||row.evidencia_path||row.evidencia_inicial_path||row.foto_despues_path;
  return <section className="panel records-panel"><header><div><small>Subsección</small><h2>{title}</h2></div><div className="header-actions"><button className="button button--ghost" onClick={exportRows}>Exportar</button>{config[0]&&<button className="button button--primary" onClick={()=>open(config[0])}><Plus size={15}/>{config[1]}</button>}</div></header>
    {!rows.length?<EmptyState icon={section==="municipal"?FileText:ClipboardCheck} title="Sin registros" text="Aún no hay información en esta subsección."/>:<div className="compact-record-list">{rows.map(row=><article key={row.id}><div><strong>{primary(row)||"Registro"}</strong><small>{secondary(row)||"Sin detalle"} · {formatDate(row.fecha||row.fecha_vencimiento||row.created_at)}</small></div><StatusBadge value={row.estado||row.prioridad}/><div className="record-actions">{path(row)&&<button onClick={()=>viewFile(path(row))}>Ver archivo</button>}{section==="municipal"&&<button onClick={()=>open("documento",{...row,archivo:null})}>Renovar / editar</button>}{section==="bitacora"&&<button onClick={()=>open("bitacora",{...row,archivo:null})}>Editar</button>}{section==="observaciones"&&!(["levantada","en_validacion"].includes(row.estado))&&<button onClick={()=>open("observacion",{...blank("observacion"),id:row.id})}>Levantar</button>}</div></article>)}</div>}
  </section>;
}

function EditorModal({type,form,setForm,error,busy,onClose,onSave}) {
  if(!form) return null;
  const titles={datos:"Datos principales",documento:"Documento municipal",reclamacion:"Reclamación",accion:"Acción de tienda",bitacora:"Bitácora diaria",mejora:"Mejora continua",observacion:"Levantar observación"};
  return <Modal open={!!type} wide title={titles[type]} onClose={onClose}><div className="form-grid">{error&&<div className="span-2"><Notice type="error">{error}</Notice></div>}
    {type==="datos"&&<><Text label="Código" name="codigo" form={form} setForm={setForm}/><Text label="Zona" name="zona" form={form} setForm={setForm}/><Text label="Formato" name="formato" form={form} setForm={setForm}/><Text label="Distrito" name="distrito" form={form} setForm={setForm}/><Text label="Dirección" name="direccion" form={form} setForm={setForm}/></>}
    {type==="documento"&&<><Select label="Área responsable *" name="area_responsable" form={form} setForm={setForm} options={AREAS_DOCUMENTOS.map(x=>[x,x])}/><Text label="Código" name="codigo" form={form} setForm={setForm}/><Select label="Documento *" name="tipo_documento" form={form} setForm={setForm} options={DOCUMENTOS.map(x=>[x,x])}/><Text label="Frecuencia de revisión" name="frecuencia_revision" form={form} setForm={setForm}/><Text type="date" label="Fecha de emisión" name="fecha_emision" form={form} setForm={setForm}/><Text type="date" label="Fecha de vencimiento" name="fecha_vencimiento" form={form} setForm={setForm}/><Select label="Estado" name="estado" form={form} setForm={setForm} options={[["vigente","Vigente"],["por_vencer","Por vencer"],["vencido","Vencido"],["en_renovacion","En renovación"]]}/><FileField label="PDF o imagen" onChange={archivo=>setForm({...form,archivo})}/></>}
    {type==="reclamacion"&&<><Text label="Código de hoja *" name="codigo_hoja" form={form} setForm={setForm}/><Text type="date" label="Fecha *" name="fecha" form={form} setForm={setForm}/><Text label="Consumidor *" name="consumidor_nombre" form={form} setForm={setForm}/><Text label="Documento" name="consumidor_documento" form={form} setForm={setForm}/><Text label="Contacto" name="consumidor_contacto" form={form} setForm={setForm}/><Text label="Producto / servicio *" name="producto_servicio" form={form} setForm={setForm}/><Text type="number" label="Monto reclamado" name="monto" form={form} setForm={setForm}/><Select label="Tipo" name="tipo" form={form} setForm={setForm} options={[["reclamo","Reclamo"],["queja","Queja"]]}/><Area label="Detalle *" name="detalle" form={form} setForm={setForm}/><Area label="Pedido del consumidor" name="pedido_consumidor" form={form} setForm={setForm}/><Area label="Observaciones del proveedor" name="observaciones_proveedor" form={form} setForm={setForm}/><Area label="Acciones adoptadas" name="acciones_adoptadas" form={form} setForm={setForm}/><Text type="date" label="Fecha de respuesta" name="fecha_respuesta" form={form} setForm={setForm}/><Text label="Responsable" name="responsable" form={form} setForm={setForm}/><FileField label="Documento / evidencia" onChange={archivo=>setForm({...form,archivo})}/></>}
    {type==="accion"&&<><Text type="date" label="Fecha *" name="fecha" form={form} setForm={setForm}/><Select label="Tipo" name="tipo" form={form} setForm={setForm} options={["marketing","promocion","activacion","volanteo","remarketing","exhibicion","reunion","operacion","otro"].map(x=>[x,x])}/><Text label="Responsable *" name="responsable" form={form} setForm={setForm}/><Text label="Acción *" name="accion" form={form} setForm={setForm}/><Select label="Estado" name="estado" form={form} setForm={setForm} options={[["pendiente","Pendiente"],["en_progreso","En progreso"],["completada","Completada"],["cancelada","Cancelada"]]}/><Area label="Objetivo / descripción" name="objetivo" form={form} setForm={setForm}/><Area label="Observación" name="observacion" form={form} setForm={setForm}/><FileField label="Evidencia" onChange={archivo=>setForm({...form,archivo})}/></>}
    {type==="bitacora"&&<><Text type="date" label="Fecha *" name="fecha" form={form} setForm={setForm}/><Text type="number" label="Venta del día *" name="venta_dia" form={form} setForm={setForm}/><Text label="Categoría *" name="categoria" form={form} setForm={setForm}/><Text label="Evento / nota" name="evento" form={form} setForm={setForm}/><Area label="Descripción" name="descripcion" form={form} setForm={setForm}/><FileField label="Evidencia / referencia" onChange={archivo=>setForm({...form,archivo})}/><div className="span-2 form-hint">El tráfico se obtiene automáticamente de los registros de Seguridad para la fecha elegida.</div></>}
    {type==="mejora"&&<><Text type="date" label="Fecha *" name="fecha" form={form} setForm={setForm}/><Text label="Sección *" name="seccion" form={form} setForm={setForm}/><Text label="Área *" name="area" form={form} setForm={setForm}/><Text label="Responsable *" name="responsable" form={form} setForm={setForm}/><Area label="¿Qué se mejoró? *" name="que_mejoro" form={form} setForm={setForm}/><Area label="¿Cómo se hizo? *" name="como_se_hizo" form={form} setForm={setForm}/><FileField label="Foto antes" accept="image/*" onChange={antes=>setForm({...form,antes})}/><FileField label="Foto después" accept="image/*" onChange={despues=>setForm({...form,despues})}/><Select label="Estado" name="estado" form={form} setForm={setForm} options={[["registrada","Registrada"],["en_progreso","En progreso"],["completada","Completada"]]}/><Area label="Resultado / beneficio" name="resultado_beneficio" form={form} setForm={setForm}/></>}
    {type==="observacion"&&<><Area label="Acción correctiva realizada *" name="accion_realizada" form={form} setForm={setForm}/><Area label="Comentario" name="comentario" form={form} setForm={setForm}/><FileField label="Evidencia" onChange={archivo=>setForm({...form,archivo})}/><Field label="Soporte requerido"><label className="check-line"><input type="checkbox" checked={form.soporte_requerido} onChange={e=>setForm({...form,soporte_requerido:e.target.checked})}/> Sí, necesito soporte</label></Field></>}
    <div className="form-actions span-2"><button className="button button--ghost" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={busy} onClick={onSave}><Upload size={15}/>{busy?"Guardando…":"Guardar"}</button></div>
  </div></Modal>;
}
