import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ClipboardCheck, Download, FileSpreadsheet, FileText, Plus, Save, Upload } from "lucide-react";
import { api, downloadFile, formatDate, todayISO } from "../lib/api";
import { exportExcel } from "../lib/excelExport";
import { EmptyState, Field, Loading, Modal, Notice, PageHeader, StatusBadge } from "../components/UI";
import AuditObservationCenter from "../components/AuditObservationCenter";
import UploadPicker from "../components/UploadPicker";

const DOCUMENTOS_POR_AREA = {
  "Municipalidad": ["Certificado de Defensa Civil", "Licencia de Funcionamiento"],
  "Contabilidad": ["Ficha RUC"],
  "Ingeniero eléctrico": ["Pozo a Tierra", "Plan de Contingencia y Seguridad", "Rociadores", "Sistema de alarma contra incendios"],
  "Proveedor": ["Láminas de seguridad"],
  "Ingeniero civil": ["Plano de evacuación", "Plano de señalización", "Plano de instalaciones eléctricas", "Plano de arquitectura", "Plano de ubicación"],
  "Correos especiales": ["Correo recibido"],
};
const AREAS_DOCUMENTOS = Object.keys(DOCUMENTOS_POR_AREA);
const AREAS_REQUERIMIENTOS = ["Operaciones","Sistemas","Marketing","Seguridad","Logística","Mantenimiento","Recursos Humanos","Otro"];
const tabs = [["resumen","Resumen"],["metas","Metas mensuales"],["documentos","Documentos"],["operacion","Operación"],["auditorias","Auditorías"]];
const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const reportKindBySub = { municipal:"documentos", reclamaciones:"reclamaciones", requerimientos:"requerimientos", observaciones:"supervisiones" };
const blank = (type) => ({
  documento: { area_documental:AREAS_DOCUMENTOS[0], responsables:[AREAS_DOCUMENTOS[0]], codigo:"", tipo_documento:DOCUMENTOS_POR_AREA[AREAS_DOCUMENTOS[0]][0], frecuencia_revision:"Anual", fecha_emision:"", fecha_vencimiento:"", estado:"vigente", archivo:null },
  reclamacion: { codigo_hoja:"", fecha:todayISO(), consumidor_nombre:"", consumidor_documento:"", consumidor_contacto:"", producto_servicio:"", monto:"", tipo:"reclamo", detalle:"", pedido_consumidor:"", observaciones_proveedor:"", acciones_adoptadas:"", fecha_respuesta:"", responsable:"", estado:"registrado", archivo:null },
  requerimiento: { requerimiento:"", cantidad:"", areas_responsables:[], urgencia:"corto_plazo", fecha_inicio:todayISO(), fecha_fin_objetivo:"", estado:"pendiente", comentario:"", archivo:null },
  seguimiento_requerimiento: { requerimiento_id:null, comentario:"", estado:"en_proceso", archivo:null },
  observacion: { accion_realizada:"", comentario:"", soporte_requerido:false, archivo:null },
}[type]);

const FileField = ({ label, onChange, accept=".pdf,image/*", capture }) => {
  const [file,setFile] = useState(null);
  return <div className="field file-field"><span>{label}</span><UploadPicker label={`Cargar ${label}`} file={file} accept={accept} capture={capture} onChange={selected => { setFile(selected); onChange(selected); }}/></div>;
};
const Text = ({ label, name, form, setForm, ...props }) => <Field label={label}><input {...props} value={form[name] ?? ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></Field>;
const Area = ({ label, name, form, setForm }) => <Field label={label}><textarea rows="3" value={form[name] ?? ""} onChange={(e) => setForm({ ...form, [name]: e.target.value })} /></Field>;
const Select = ({ label, name, form, setForm, options }) => <Field label={label}><select value={form[name]} onChange={(e) => setForm({ ...form, [name]: e.target.value })}>{options.map(([v,l]) => <option value={v} key={v}>{l}</option>)}</select></Field>;

export default function MiTiendaGestion() {
  const [data,setData] = useState(null), [tab,setTab] = useState("resumen"), [sub,setSub] = useState("municipal");
  const [modal,setModal] = useState(null), [form,setForm] = useState(null), [busy,setBusy] = useState(false), [error,setError] = useState("");
  const [actionError,setActionError] = useState("");
  const load = () => api("/mi-tienda-gestion").then(setData).catch((e) => setData({ error:e.message }));
  useEffect(() => { load(); }, []);
  const open = (type, values={}) => {
    setError(""); setModal(type);
    if (type !== "documento") { setForm({ ...blank(type), ...values }); return; }
    const area = AREAS_DOCUMENTOS.includes(values.area_documental) ? values.area_documental : AREAS_DOCUMENTOS.includes(values.responsables?.[0]) ? values.responsables[0] : AREAS_DOCUMENTOS[0];
    const documentos = DOCUMENTOS_POR_AREA[area];
    setForm({ ...blank(type), ...values, area_documental:area, responsables:[area], tipo_documento:documentos.includes(values.tipo_documento) ? values.tipo_documento : documentos[0] });
  };
  const upload = async (file, folder) => {
    if (!file) return null; if (file.size > 5*1024*1024) throw new Error("El archivo supera los 5 MB.");
    const base64 = await new Promise((resolve,reject) => { const reader=new FileReader(); reader.onload=()=>resolve(reader.result); reader.onerror=reject; reader.readAsDataURL(file); });
    return api("/mi-tienda-gestion/archivo", { method:"POST", body:{ nombre:file.name, mime:file.type, base64, carpeta:folder } });
  };
  const save = async () => {
    setBusy(true); setError("");
    try {
      let payload={...form}, endpoint=modal;
      if (form.archivo) { const f=await upload(form.archivo,modal); payload[["requerimiento","seguimiento_requerimiento"].includes(modal) ? "evidencia_path" : modal === "observacion" ? "evidencia_cierre_path" : "archivo_path"]=f.path; payload[["requerimiento","seguimiento_requerimiento"].includes(modal) ? "evidencia_nombre" : modal === "observacion" ? "evidencia_cierre_nombre" : "archivo_nombre"]=f.nombre; }
      delete payload.archivo; delete payload.antes; delete payload.despues; delete payload.foto;
      if (modal === "observacion") endpoint=`observaciones/${form.id}`;
      else if (modal === "seguimiento_requerimiento") endpoint=`requerimientos/${form.requerimiento_id}/seguimiento`;
      else endpoint={documento:"documentos",reclamacion:"reclamaciones",requerimiento:"requerimientos"}[modal] + (form.id ? `/${form.id}` : "");
      await api(`/mi-tienda-gestion/${endpoint}`, { method:form.id && modal!=="seguimiento_requerimiento" ? "PUT":"POST", body:payload }); setModal(null); await load();
    } catch(e) { setError(e.message); } finally { setBusy(false); }
  };
  const viewFile = async (path) => {
    setActionError("");
    try { const {url}=await api("/mi-tienda-gestion/archivo-url",{method:"POST",body:{path}}); window.open(url,"_blank","noopener,noreferrer"); }
    catch (e) { setActionError(e.message); }
  };
  const exportFile = async (kind, filename) => {
    setActionError("");
    try { await downloadFile(`/api/reportes/${kind}/export.xlsx`, filename); }
    catch (e) { setActionError(e.message); }
  };
  const currentRows = useMemo(() => data?.[sub === "municipal" ? "documentos" : sub] || [], [data,sub]);
  if (!data) return <Loading />;
  if (data.error) return <div><Notice type="error">{data.error}</Notice><button className="button button--ghost" onClick={load}>Reintentar</button></div>;
  const t=data.tienda || {}, r=data.resumen || {};
  return <section className="store-management-page">
    <PageHeader eyebrow="Gestión de tienda" title="Mi tienda" />
    {actionError && <Notice type="error">{actionError}</Notice>}
    <div className="mini-tabs">{tabs.map(([id,label]) => <button className={tab===id?"active":""} onClick={()=>setTab(id)} key={id}>{label}</button>)}</div>

    {tab === "resumen" && <div className="store-module">
      <section className="panel store-block"><header><div><small>Datos principales</small><h2>{t.nombre}</h2></div><button className="button button--ghost" onClick={()=>open("datos",{nombre:t.nombre??"",formato:t.formato??"PROPIA",distrito:t.distrito??"",direccion:t.direccion??"",metraje_m2:t.metraje_m2??"",capacidad_stock_unid:t.capacidad_stock_unid??"",capacidad_stock_calzado_unid:t.capacidad_stock_calzado_unid??"",capacidad_stock_textil_unid:t.capacidad_stock_textil_unid??""})}>Editar datos</button></header><div className="store-data-grid">{[["Formato",t.formato],["Distrito",t.distrito],["Dirección",t.direccion],["Metros cuadrados",t.metraje_m2!=null?`${t.metraje_m2} m²`:null],["Capacidad total",t.capacidad_stock_unid!=null?`${t.capacidad_stock_unid} unid.`:null],["Capacidad calzado",t.capacidad_stock_calzado_unid!=null?`${t.capacidad_stock_calzado_unid} unid.`:null],["Capacidad textil",t.capacidad_stock_textil_unid!=null?`${t.capacidad_stock_textil_unid} unid.`:null]].map(([l,v])=><div key={l}><small>{l}</small><strong>{v??"Sin registrar"}</strong></div>)}</div></section>
      <div className="store-summary-grid">{[["Documentos próximos a vencer",r.documentos_por_vencer],["Reclamos en atención",r.reclamos_en_atencion],["Observaciones zonales abiertas",r.observaciones_abiertas]].map(([l,v])=><section className="panel mini-status" key={l}><small>{l}</small><strong>{v}</strong></section>)}</div>
    </div>}

    {tab === "metas" && <StoreGoalsPlanner />}

    {tab === "documentos" && <ModuleTabs items={[["municipal","Documentación municipal"],["reclamaciones","Libro de reclamaciones"],["alertas","Configuración de alertas"]]} sub={sub} setSub={setSub} />}
    {tab === "operacion" && <ModuleTabs items={[["requerimientos","Requerimientos de tienda"]]} sub={sub} setSub={setSub} />}
    {tab === "auditorias" && <AuditObservationCenter observations={data.observaciones||[]} visits={data.visitas||[]} onLift={(row)=>open("observacion",{...row,archivo:null})} onViewFile={viewFile} onExport={()=>exportFile("supervisiones","reporte-auditorias.xlsx")}/>}
    {sub === "alertas" && <DocumentAlertSettings documents={data.documentos || []} reload={load} />}
    {!['resumen','metas','auditorias'].includes(tab) && sub !== "alertas" && <Records section={sub} rows={currentRows} open={open} viewFile={viewFile} exportRows={()=>exportFile(reportKindBySub[sub],`reporte-${reportKindBySub[sub]}.xlsx`)} />}

    <EditorModal type={modal} form={form} setForm={setForm} error={error} busy={busy} onClose={()=>setModal(null)} onSave={modal==="datos" ? async()=>{setBusy(true);try{await api("/mi-tienda-gestion/datos",{method:"PUT",body:form});setModal(null);await load();}catch(e){setError(e.message);}finally{setBusy(false);}} : save} />
  </section>;
}

function StoreGoalsPlanner() {
  const initialYear = Number(todayISO().slice(0, 4));
  const [year, setYear] = useState(initialYear);
  const [goals, setGoals] = useState(() => MONTHS.map((_, index) => ({ mes:index + 1, meta_venta:"" })));
  const [loading, setLoading] = useState(true); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState(null);
  const importRef = useRef(null);
  useEffect(() => {
    let active = true; setLoading(true); setNotice(null);
    api(`/mi-tienda-gestion/metas?anio=${year}`).then(result => {
      if (!active) return;
      const byMonth = new Map((result.metas || []).map(row => [Number(row.mes), row]));
      setGoals(MONTHS.map((_, index) => ({ mes:index + 1, meta_venta:byMonth.get(index + 1)?.meta_venta ?? "" })));
    }).catch(error => active && setNotice({ type:"error", text:error.message })).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [year]);
  const setGoal = (month, value) => setGoals(rows => rows.map(row => row.mes === month ? { ...row, meta_venta:value } : row));
  const total = goals.reduce((sum, row) => sum + (Number(row.meta_venta) || 0), 0);
  const save = async () => {
    setBusy(true); setNotice(null);
    try {
      const result = await api("/mi-tienda-gestion/metas", { method:"PUT", body:{ anio:year, metas:goals } });
      const byMonth = new Map((result.metas || []).map(row => [Number(row.mes), row]));
      setGoals(MONTHS.map((_, index) => ({ mes:index + 1, meta_venta:byMonth.get(index + 1)?.meta_venta ?? "" })));
      setNotice({ type:"success", text:"Metas guardadas. El dashboard comercial general ya usará estos valores." });
    } catch (error) { setNotice({ type:"error", text:error.message }); }
    finally { setBusy(false); }
  };
  const downloadTemplate = () => exportExcel(`metas-mensuales-${year}.xlsx`, MONTHS.map((month, index) => ({ Mes:month, "Número de mes":index + 1, "Meta de venta (S/)":Number(goals[index].meta_venta) || "" })), "Metas");
  const importExcel = async event => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    setBusy(true); setNotice(null);
    try {
      const { default: ExcelJS } = await import("exceljs"); const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await file.arrayBuffer()); const sheet = workbook.worksheets[0];
      if (!sheet) throw new Error("El archivo no contiene una hoja de metas.");
      const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      const headers = {}; sheet.getRow(1).eachCell((cell, column) => { headers[normalize(cell.value)] = column; });
      const monthColumn = headers["numero de mes"] || headers["mes numero"] || headers["mes"];
      const targetColumn = headers["meta de venta (s/)"] || headers["meta de venta"] || headers["meta"];
      if (!monthColumn || !targetColumn) throw new Error("Usa la plantilla: faltan las columnas Mes y Meta de venta (S/).");
      const imported = new Map();
      sheet.eachRow((row, index) => {
        if (index === 1) return;
        const rawMonth = row.getCell(monthColumn).value; const normalizedMonth = normalize(rawMonth);
        const month = Number(rawMonth) || MONTHS.findIndex(name => normalize(name) === normalizedMonth) + 1;
        const target = row.getCell(targetColumn).value;
        if (month >= 1 && month <= 12 && target !== "" && target != null && Number.isFinite(Number(target)) && Number(target) >= 0) imported.set(month, String(Number(target)));
      });
      if (!imported.size) throw new Error("No se encontraron metas válidas en el Excel.");
      setGoals(rows => rows.map(row => imported.has(row.mes) ? { ...row, meta_venta:imported.get(row.mes) } : row));
      setNotice({ type:"success", text:`Se cargaron ${imported.size} meses. Revisa los montos y pulsa Guardar metas.` });
    } catch (error) { setNotice({ type:"error", text:error.message }); }
    finally { setBusy(false); }
  };
  return <section className="panel store-goals-panel">
    <header><div><small>Plan comercial por tienda</small><h2>Metas mensuales</h2><p>Estos montos alimentan Meta, Brecha y Meta vs real del dashboard general.</p></div><div className="store-goals-actions"><label>Año<select value={year} onChange={event => setYear(Number(event.target.value))}>{Array.from({length:5},(_,index)=>initialYear - 1 + index).map(option=><option value={option} key={option}>{option}</option>)}</select></label><button className="button button--ghost" type="button" onClick={downloadTemplate}><Download size={15}/>Plantilla</button><button className="button button--ghost" type="button" disabled={busy} onClick={()=>importRef.current?.click()}><Upload size={15}/>Subir Excel</button><input ref={importRef} className="visually-hidden" type="file" accept=".xlsx" onChange={importExcel}/></div></header>
    {notice && <Notice type={notice.type}>{notice.text}</Notice>}
    {loading ? <Loading /> : <><div className="store-goals-grid">{goals.map((row,index)=><label key={row.mes}><span>{MONTHS[index]}</span><div><b>S/</b><input type="number" min="0" step="100" inputMode="decimal" value={row.meta_venta} onChange={event=>setGoal(row.mes,event.target.value)} aria-label={`Meta de ${MONTHS[index]}`} placeholder="0"/></div></label>)}</div><footer><div><FileSpreadsheet size={18}/><span>Meta anual calculada</span><strong>{new Intl.NumberFormat("es-PE",{style:"currency",currency:"PEN",maximumFractionDigits:0}).format(total)}</strong></div><button type="button" className="button button--primary" disabled={busy} onClick={save}><Save size={16}/>{busy?"Guardando…":"Guardar metas"}</button></footer></>}
  </section>;
}

function ModuleTabs({items,sub,setSub}) { useEffect(()=>{ if(!items.some(([id])=>id===sub)) setSub(items[0][0]); },[items,sub,setSub]); return <div className="subsection-tabs">{items.map(([id,label])=><button key={id} className={sub===id?"active":""} onClick={()=>setSub(id)}>{label}</button>)}</div>; }

function DocumentAlertSettings({ documents, reload }) {
  const [days, setDays] = useState({}); const [saving, setSaving] = useState(null); const [error, setError] = useState("");
  useEffect(() => { setDays(Object.fromEntries(documents.map((document) => [document.id, String(document.dias_alerta || 30)]))); }, [documents]);
  const save = async (document) => {
    const dias_alerta = Number(days[document.id]);
    if (!Number.isInteger(dias_alerta) || dias_alerta < 1 || dias_alerta > 365) { setError("Ingresa entre 1 y 365 días."); return; }
    setSaving(document.id); setError("");
    try { await api(`/mi-tienda-gestion/documentos/${document.id}`, { method:"PUT", body:{ dias_alerta } }); await reload(); }
    catch (e) { setError(e.message); } finally { setSaving(null); }
  };
  return <section className="panel records-panel alert-settings"><header><div><small>Configuración</small><h2>Alertas de vencimiento</h2><p>Define con cuántos días de anticipación deseas recibir la alerta de cada documento.</p></div></header>{error&&<Notice type="error">{error}</Notice>}{!documents.length?<EmptyState icon={FileText} title="Sin documentos" text="Registra un documento para configurar su alerta."/>:<div className="alert-settings__list">{documents.map((document)=><article key={document.id}><div><strong>{document.tipo_documento}</strong><small>{document.area_responsable || "Sin área"} · Vence {formatDate(document.fecha_vencimiento)}</small></div><label><span>Avisar antes de</span><input type="number" min="1" max="365" value={days[document.id] ?? 30} onChange={(event)=>setDays({ ...days, [document.id]:event.target.value })}/><em>días</em></label><button className="button button--ghost" disabled={saving===document.id} onClick={()=>save(document)}>{saving===document.id?"Guardando…":"Guardar"}</button></article>)}</div>}</section>;
}

function Records({section,rows,open,viewFile,exportRows}) {
  const config={municipal:["documento","Actualizar documento"],reclamaciones:["reclamacion","Registrar reclamación"],requerimientos:["requerimiento","Nuevo requerimiento"],observaciones:[null,null]}[section] || [];
  const title={municipal:"Documentación municipal",reclamaciones:"Libro de reclamaciones",requerimientos:"Requerimientos de tienda",observaciones:"Observaciones zonales"}[section];
  const createLabel=section==="municipal" && !rows.length ? "Registrar documento" : config[1];
  const primary=(row)=>row.tipo_documento||row.codigo_hoja||row.accion||row.requerimiento||row.area_item;
  const secondary=(row)=>row.responsables?.join(" · ")||row.area_responsable||row.consumidor_nombre||row.responsable||row.areas_responsables?.join(" · ")||row.descripcion;
  const path=(row)=>row.archivo_path||row.evidencia_path||row.evidencia_inicial_path||row.foto_despues_path;
  return <section className="panel records-panel"><header><div><small>Subsección</small><h2>{title}</h2></div><div className="header-actions"><button className="button button--ghost" onClick={exportRows}>Descargar Excel</button>{config[0]&&<button className="button button--primary" onClick={()=>open(config[0])}><Plus size={15}/>{createLabel}</button>}</div></header>
    {!rows.length?<EmptyState icon={section==="municipal"?FileText:ClipboardCheck} title="Sin registros" text={config[0] ? `Usa “${createLabel}” para iniciar.` : ""}/>:<div className="compact-record-list">{rows.map(row=><article className={section==="requerimientos"?"requirement-record":""} key={row.id}><div><strong>{section==="requerimientos"?`REQ-${String(row.id).padStart(4,"0")} · `:""}{primary(row)||"Registro"}</strong><small>{secondary(row)||"Sin detalle"} · {formatDate(row.fecha||row.fecha_inicio||row.fecha_vencimiento||row.created_at)}</small>{section==="requerimientos"&&row.fecha_fin_objetivo&&<small>Fecha objetivo: {formatDate(row.fecha_fin_objetivo)} · {row.urgencia?.replaceAll("_"," ")}</small>}</div><StatusBadge value={row.estado||row.prioridad}/><div className="record-actions">{path(row)&&<button onClick={()=>viewFile(path(row))}>Ver archivo</button>}{section==="municipal"&&<button onClick={()=>open("documento",{...row,archivo:null})}>Renovar / editar</button>}{section==="reclamaciones"&&<button onClick={()=>open("reclamacion",{...row,archivo:null})}>Actualizar estado</button>}{section==="requerimientos"&&<><button onClick={()=>open("requerimiento",{...row,archivo:null})}>Ver / actualizar</button><button onClick={()=>open("seguimiento_requerimiento",{...blank("seguimiento_requerimiento"),requerimiento_id:row.id,estado:row.estado})}>Seguimiento</button></>}{section==="observaciones"&&!(["levantada","en_validacion"].includes(row.estado))&&<button onClick={()=>open("observacion",{...blank("observacion"),id:row.id})}>Levantar</button>}</div>{section==="requerimientos"&&!!row.seguimientos?.length&&<div className="requirement-timeline">{row.seguimientos.map(item=><div key={item.id}><span>{formatDate(item.created_at)}</span><strong>{item.usuarios ? `${item.usuarios.nombres||""} ${item.usuarios.apellidos||""}`.trim() : "Usuario"}</strong><span>{item.comentario}</span><StatusBadge value={item.estado}/></div>)}</div>}</article>)}</div>}
  </section>;
}

function EditorModal({type,form,setForm,error,busy,onClose,onSave}) {
  if(!form) return null;
  const titles={datos:"Datos principales",documento:"Documento municipal",reclamacion:"Reclamación",requerimiento:"Requerimiento de tienda",seguimiento_requerimiento:"Seguimiento del requerimiento",observacion:"Levantar observación"};
  return <Modal open={!!type} wide title={titles[type]} subtitle={type==="requerimiento"?"Registra la necesidad y deriva su atención al área responsable.":type==="seguimiento_requerimiento"?"Añade una actualización al historial del requerimiento.":undefined} onClose={onClose}><div className={`form-grid ${type==="requerimiento"?"requirement-form":""}`}>{error&&<div className="span-2"><Notice type="error">{error}</Notice></div>}
    {type==="datos"&&<><Text label="Tienda" name="nombre" form={form} setForm={setForm} maxLength={120} required/><Select label="Formato" name="formato" form={form} setForm={setForm} options={[["PROPIA","Propia"],["METRO","Metro"]]}/><Text label="Distrito" name="distrito" form={form} setForm={setForm} maxLength={80} required/><Text label="Dirección" name="direccion" form={form} setForm={setForm} maxLength={180} required/><Text type="number" min="0" step="0.01" label="Metros cuadrados (m²)" name="metraje_m2" form={form} setForm={setForm} required/><Text type="number" min="0" step="1" label="Capacidad total de stock (unid.)" name="capacidad_stock_unid" form={form} setForm={setForm} required/><Text type="number" min="0" step="1" label="Capacidad de calzado (unid.)" name="capacidad_stock_calzado_unid" form={form} setForm={setForm} required/><Text type="number" min="0" step="1" label="Capacidad de textil (unid.)" name="capacidad_stock_textil_unid" form={form} setForm={setForm} required/></>}
    {type==="documento"&&<><Field label="Área responsable *"><select required value={form.area_documental} onChange={(e)=>{const area=e.target.value;setForm({...form,area_documental:area,responsables:[area],tipo_documento:DOCUMENTOS_POR_AREA[area][0]});}}>{AREAS_DOCUMENTOS.map(area=><option value={area} key={area}>{area}</option>)}</select></Field><Select label="Documento *" name="tipo_documento" form={form} setForm={setForm} options={(DOCUMENTOS_POR_AREA[form.area_documental]||[]).map(documento=>[documento,documento])}/><Text label="Código" name="codigo" form={form} setForm={setForm}/><Text label="Frecuencia de revisión" name="frecuencia_revision" form={form} setForm={setForm}/><Text type="date" label="Fecha de emisión" name="fecha_emision" form={form} setForm={setForm}/><Text type="date" label="Fecha de vencimiento" name="fecha_vencimiento" form={form} setForm={setForm}/><Select label="Estado" name="estado" form={form} setForm={setForm} options={[["vigente","Vigente"],["por_vencer","Por vencer"],["vencido","Vencido"],["en_renovacion","En renovación"]]}/><FileField label="PDF o imagen" onChange={archivo=>setForm({...form,archivo})}/></>}
    {type==="reclamacion"&&<><Text label="Código de hoja *" name="codigo_hoja" form={form} setForm={setForm}/><Text type="date" label="Fecha *" name="fecha" form={form} setForm={setForm}/><Text label="Consumidor *" name="consumidor_nombre" form={form} setForm={setForm}/><Text label="Documento" name="consumidor_documento" form={form} setForm={setForm}/><Text label="Contacto" name="consumidor_contacto" form={form} setForm={setForm}/><Text label="Producto / servicio *" name="producto_servicio" form={form} setForm={setForm}/><Text type="number" label="Monto reclamado" name="monto" form={form} setForm={setForm}/><Select label="Tipo" name="tipo" form={form} setForm={setForm} options={[["reclamo","Reclamo"],["queja","Queja"]]}/><Select label="Estado *" name="estado" form={form} setForm={setForm} options={[["registrado","Registrado"],["en_atencion","En atención"],["respondido","Respondido"],["cerrado","Cerrado"]]}/><Area label="Detalle *" name="detalle" form={form} setForm={setForm}/><Area label="Pedido del consumidor" name="pedido_consumidor" form={form} setForm={setForm}/><Area label="Observaciones del proveedor" name="observaciones_proveedor" form={form} setForm={setForm}/><Area label="Acciones adoptadas" name="acciones_adoptadas" form={form} setForm={setForm}/><Text type="date" label="Fecha de respuesta" name="fecha_respuesta" form={form} setForm={setForm}/><Text label="Responsable" name="responsable" form={form} setForm={setForm}/><FileField label="Documento / evidencia" onChange={archivo=>setForm({...form,archivo})}/></>}
    {type==="requerimiento"&&<><div className="span-2"><Text label="Requerimiento / necesidad *" name="requerimiento" form={form} setForm={setForm} placeholder="Describe de forma breve lo que necesita la tienda"/></div><Text type="number" min="0" step="1" label="Cantidad / unidades" name="cantidad" form={form} setForm={setForm} placeholder="Ej. 2"/><Select label="Urgencia *" name="urgencia" form={form} setForm={setForm} options={[["urgente","Urgente"],["corto_plazo","Corto plazo"],["mediano_plazo","Mediano plazo"],["largo_plazo","Largo plazo"]]}/><div className="field span-2"><span>Áreas responsables *</span><div className="requirement-areas">{AREAS_REQUERIMIENTOS.map(area=>{const selected=form.areas_responsables?.includes(area);return <button type="button" className={selected?"selected":""} aria-pressed={selected} key={area} onClick={()=>setForm({...form,areas_responsables:selected?(form.areas_responsables||[]).filter(x=>x!==area):[...(form.areas_responsables||[]),area]})}><i>{selected&&<Check size={12}/>}</i><span>{area}</span></button>})}</div></div><Text type="date" label="Fecha de inicio *" name="fecha_inicio" form={form} setForm={setForm}/><Text type="date" label="Fecha fin objetivo" name="fecha_fin_objetivo" form={form} setForm={setForm}/><Select label="Estado" name="estado" form={form} setForm={setForm} options={[["pendiente","Pendiente"],["en_proceso","En proceso"],["atendido","Atendido"],["cancelado","Cancelado"]]}/><FileField label="Evidencia inicial" onChange={archivo=>setForm({...form,archivo})}/><div className="span-2"><Area label="Comentario adicional" name="comentario" form={form} setForm={setForm}/></div></>}
    {type==="seguimiento_requerimiento"&&<><Select label="Estado *" name="estado" form={form} setForm={setForm} options={[["pendiente","Pendiente"],["en_proceso","En proceso"],["atendido","Atendido"],["cancelado","Cancelado"]]}/><FileField label="Evidencia" onChange={archivo=>setForm({...form,archivo})}/><div className="span-2"><Area label="Comentario *" name="comentario" form={form} setForm={setForm}/></div></>}
    {type==="observacion"&&<><div className="span-2 audit-lift-context"><span>{form.area_item}</span><strong>{form.descripcion}</strong>{form.accion_solicitada&&<p><b>Acción solicitada:</b> {form.accion_solicitada}</p>}<small>Fecha límite: {formatDate(form.fecha_limite)} · Estado: {String(form.estado||"").replaceAll("_"," ")}</small>{form.estado==="rechazada"&&form.comentario_validacion&&<aside><b>Corrección solicitada por el Zonal:</b> {form.comentario_validacion}</aside>}</div><Area label="Acción correctiva realizada *" name="accion_realizada" form={form} setForm={setForm}/><Area label="Comentario" name="comentario" form={form} setForm={setForm}/><FileField label="Evidencia" onChange={archivo=>setForm({...form,archivo})}/><Field label="Soporte requerido"><label className="check-line"><input type="checkbox" checked={form.soporte_requerido} onChange={e=>setForm({...form,soporte_requerido:e.target.checked})}/> Sí, necesito soporte</label></Field></>}
    <div className="form-actions span-2"><button className="button button--ghost" onClick={onClose}>Cancelar</button><button className="button button--primary" disabled={busy} onClick={onSave}><Upload size={15}/>{busy?"Guardando…":"Guardar"}</button></div>
  </div></Modal>;
}
