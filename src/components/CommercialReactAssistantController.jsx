import React, { useEffect, useRef, useState } from "react";
import CommercialReactAssistantWidget from "./CommercialReactAssistantWidget";

const INITIAL_MESSAGES = [{ role: "assistant", content: "Hola. Puedo resumir los KPIs visibles, explicar variaciones y ayudarte con stock, cobertura, EOQ o ROP." }];
const SUGGESTIONS = {
  coach: [
    { label: "VENTAS Y EQUIPO", prompt: "Como coach, identifica una oportunidad de ejecución de ventas respaldada por los indicadores visibles y propone una acción de acompañamiento concreta." },
    { label: "CONVERSIÓN", prompt: "Analiza únicamente la conversión y el ticket visibles. Señala un hallazgo comprobable y una práctica de venta que el equipo pueda probar." },
    { label: "CAPACITACIÓN", prompt: "Indica qué necesidad de capacitación se desprende de los datos visibles. No atribuyas avances a cursos referenciales." },
  ],
  jefe_zonal: [
    { label: "PRIORIDAD ZONAL", prompt: "Identifica la prioridad comercial del clúster asignado con cifras visibles y una acción de seguimiento para las tiendas de la zona." },
    { label: "COMPARAR TIENDAS", prompt: "Compara solo las tiendas autorizadas que tengan cifras comparables. Identifica la brecha más importante y una acción zonal." },
    { label: "STOCK DE LA ZONA", prompt: "Analiza el stock y la cobertura visibles del clúster y recomienda una verificación o redistribución justificada." },
  ],
  jefe_tienda: [
    { label: "MI TIENDA", prompt: "Resume el indicador más importante de mi tienda y propone una acción que pueda ejecutar hoy con mi equipo." },
    { label: "VENTAS", prompt: "Analiza venta, ticket y conversión visibles de mi tienda. Recomienda una acción concreta sin comparar con otras tiendas." },
    { label: "STOCK", prompt: "Analiza el stock y la cobertura visibles de mi tienda y señala una verificación prioritaria." },
  ],
  default: [
    { label: "RESUMIR KPIs", prompt: "RESUMEN KPI ESTRUCTURADO. Entrega: 1) lectura ejecutiva de los KPIs visibles; 2) fórmulas clave presentes en el contexto; 3) plan priorizado con tres acciones. Omite métricas no visibles." },
    { label: "PLAN COMERCIAL", prompt: "Resume qué impulsa o frena la venta visible e identifica dos oportunidades concretas y tres acciones priorizadas, respaldadas por cifras." },
    { label: "RIESGO Y STOCK", prompt: "Analiza solo los indicadores disponibles de stock, cobertura, rotación y reposición. Señala alertas comprobables y acciones proporcionadas." },
  ],
};
const TITLES = { coach: "ASISTENTE DE VENTAS", jefe_zonal: "ASISTENTE ZONAL", jefe_tienda: "ASISTENTE DE TIENDA" };

function microphoneAvailable() {
  if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") return false;
  const policy = document.permissionsPolicy ?? document.featurePolicy;
  return !policy || policy.allowsFeature("microphone");
}

export default function CommercialReactAssistantController({ role, context, controller }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  const [messages, setMessages] = useState(INITIAL_MESSAGES);
  const recorder = useRef(null);
  const stream = useRef(null);
  const chunks = useRef([]);

  useEffect(() => () => {
    if (recorder.current) recorder.current.onstop = null;
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach(track => track.stop());
  }, []);

  const transcribe = async (audio, name) => {
    setBusy(true);
    setError("");
    try {
      const text = await controller.transcribeReactAssistant(audio, name);
      setDraft(text.trim());
      if (!text.trim()) setError("No se detectó voz en el audio.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo transcribir el audio.");
    } finally { setBusy(false); }
  };

  const send = async suggested => {
    const content = (suggested ?? draft).trim();
    if (!content || busy) return;
    const conversation = [...messages, { role: "user", content }];
    setMessages(conversation);
    setDraft("");
    setError("");
    setBusy(true);
    try {
      const answer = await controller.askReactAssistant(conversation.slice(-10), context);
      setMessages(items => [...items, { role: "assistant", content: answer }]);
    } catch (cause) {
      setError(cause instanceof Error && cause.message ? cause.message : "El asistente no está disponible ahora.");
    } finally { setBusy(false); }
  };

  const toggleRecording = async () => {
    if (recording) { recorder.current?.stop(); return; }
    if (!microphoneAvailable()) { setError("Este navegador no permite grabar audio."); return; }
    try {
      setError("");
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: true });
      chunks.current = [];
      const next = new MediaRecorder(stream.current);
      recorder.current = next;
      next.ondataavailable = event => { if (event.data.size) chunks.current.push(event.data); };
      next.onstop = () => {
        setRecording(false);
        const mimeType = next.mimeType || "audio/webm";
        const extension = mimeType.includes("ogg") ? "ogg" : mimeType.includes("mp4") ? "m4a" : "webm";
        const audio = new Blob(chunks.current, { type: mimeType });
        stream.current?.getTracks().forEach(track => track.stop());
        stream.current = null;
        recorder.current = null;
        void transcribe(audio, `consulta.${extension}`);
      };
      next.start();
      setRecording(true);
    } catch {
      setError("No se pudo acceder al micrófono. Revisa el permiso del navegador.");
      stream.current?.getTracks().forEach(track => track.stop());
      stream.current = null;
    }
  };

  const onAction = action => {
    if (action.type === "toggle") setOpen(value => !value);
    else if (action.type === "draft") setDraft(action.value);
    else if (action.type === "send") void send();
    else if (action.type === "suggestion") void send(action.value);
    else if (action.type === "audio" && action.file && !busy) void transcribe(action.file, action.file.name || "consulta.webm");
    else if (action.type === "record" && !busy) void toggleRecording();
  };
  return <CommercialReactAssistantWidget model={{ open, draft, busy, recording, error, messages,
    title: TITLES[role] || "ASISTENTE COMERCIAL", suggestions: SUGGESTIONS[role] || SUGGESTIONS.default,
    canRecord: microphoneAvailable() }} onAction={onAction} />;
}
