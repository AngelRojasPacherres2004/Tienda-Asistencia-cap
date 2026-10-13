import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AssistantMessage, AssistantService } from './assistant.service';

@Component({
  selector: 'dashboard-assistant',
  imports: [CommonModule, FormsModule],
  templateUrl: './assistant-widget.html',
  styleUrl: './assistant-widget.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DashboardAssistantWidgetComponent {
  private readonly assistant = inject(AssistantService);
  private recorder?: MediaRecorder;
  private recordingStream?: MediaStream;
  private chunks: BlobPart[] = [];

  readonly context = input('');
  readonly role = input('');
  readonly assistantTitle = computed(() => this.role() === 'coach' ? 'ASISTENTE DE VENTAS'
    : this.role() === 'jefe_zonal' ? 'ASISTENTE ZONAL'
    : this.role() === 'jefe_tienda' ? 'ASISTENTE DE TIENDA' : 'ASISTENTE COMERCIAL');
  readonly suggestions = computed(() => {
    if (this.role() === 'coach') return [
      { label: 'VENTAS Y EQUIPO', prompt: 'Como coach, identifica una oportunidad de ejecución de ventas respaldada por los indicadores visibles y propone una acción de acompañamiento concreta.' },
      { label: 'CONVERSIÓN', prompt: 'Analiza únicamente la conversión y el ticket visibles. Señala un hallazgo comprobable y una práctica de venta que el equipo pueda probar.' },
      { label: 'CAPACITACIÓN', prompt: 'Indica qué necesidad de capacitación se desprende de los datos visibles. No atribuyas avances a cursos referenciales.' },
    ];
    if (this.role() === 'jefe_zonal') return [
      { label: 'PRIORIDAD ZONAL', prompt: 'Identifica la prioridad comercial del clúster asignado con cifras visibles y una acción de seguimiento para las tiendas de la zona.' },
      { label: 'COMPARAR TIENDAS', prompt: 'Compara solo las tiendas autorizadas que tengan cifras comparables. Identifica la brecha más importante y una acción zonal.' },
      { label: 'STOCK DE LA ZONA', prompt: 'Analiza el stock y la cobertura visibles del clúster y recomienda una verificación o redistribución justificada.' },
    ];
    if (this.role() === 'jefe_tienda') return [
      { label: 'MI TIENDA', prompt: 'Resume el indicador más importante de mi tienda y propone una acción que pueda ejecutar hoy con mi equipo.' },
      { label: 'VENTAS', prompt: 'Analiza venta, ticket y conversión visibles de mi tienda. Recomienda una acción concreta sin comparar con otras tiendas.' },
      { label: 'STOCK', prompt: 'Analiza el stock y la cobertura visibles de mi tienda y señala una verificación prioritaria.' },
    ];
    return [
      { label: 'RESUMIR KPIs', prompt: 'RESUMEN KPI ESTRUCTURADO. Entrega: 1) lectura ejecutiva de los KPIs visibles; 2) fórmulas clave presentes en el contexto; 3) plan priorizado con tres acciones. Omite métricas no visibles.' },
      { label: 'PLAN COMERCIAL', prompt: 'Resume qué impulsa o frena la venta visible e identifica dos oportunidades concretas y tres acciones priorizadas, respaldadas por cifras.' },
      { label: 'RIESGO Y STOCK', prompt: 'Analiza solo los indicadores disponibles de stock, cobertura, rotación y reposición. Señala alertas comprobables y acciones proporcionadas.' },
    ];
  });
  readonly messageList = viewChild<ElementRef<HTMLElement>>('messageList');
  readonly open = signal(false);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly recording = signal(false);
  readonly error = signal('');
  readonly messages = signal<AssistantMessage[]>([
    { role: 'assistant', content: 'Hola. Puedo resumir los KPIs visibles, explicar variaciones y ayudarte con stock, cobertura, EOQ o ROP.' },
  ]);
  readonly canRecord = computed(() => {
    if (typeof navigator === 'undefined' || typeof document === 'undefined' || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return false;
    const policy = (document as Document & { permissionsPolicy?: { allowsFeature(name: string): boolean }; featurePolicy?: { allowsFeature(name: string): boolean } }).permissionsPolicy
      ?? (document as Document & { featurePolicy?: { allowsFeature(name: string): boolean } }).featurePolicy;
    return !policy || policy.allowsFeature('microphone');
  });

  toggle(): void {
    this.open.update(value => !value);
    if (this.open()) setTimeout(() => this.scrollToEnd(), 0);
  }

  async send(suggested?: string): Promise<void> {
    const content = (suggested ?? this.draft()).trim();
    if (!content || this.busy()) return;
    const conversation = [...this.messages(), { role: 'user', content } satisfies AssistantMessage];
    this.messages.set(conversation);
    this.draft.set('');
    this.error.set('');
    this.busy.set(true);
    this.scrollToEnd();
    try {
      const answer = await this.assistant.ask(conversation.slice(-10), this.context());
      this.messages.update(items => [...items, { role: 'assistant', content: answer }]);
    } catch (error) {
      this.error.set(this.unavailableMessage(error));
    } finally {
      this.busy.set(false);
      this.scrollToEnd();
    }
  }

  async toggleRecording(): Promise<void> {
    if (this.recording()) {
      this.recorder?.stop();
      return;
    }
    if (!this.canRecord()) {
      this.error.set('Este navegador no permite grabar audio.');
      return;
    }
    try {
      this.error.set('');
      this.recordingStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.chunks = [];
      this.recorder = new MediaRecorder(this.recordingStream);
      this.recorder.ondataavailable = event => { if (event.data.size) this.chunks.push(event.data); };
      this.recorder.onstop = () => void this.finishRecording();
      this.recorder.start();
      this.recording.set(true);
    } catch {
      this.error.set('No se pudo acceder al micrófono. Revisa el permiso del navegador.');
      this.stopTracks();
    }
  }

  async selectAudio(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const file = inputElement.files?.[0];
    if (!file || this.busy()) return;
    this.error.set('');
    this.busy.set(true);
    try {
      const transcript = await this.assistant.transcribe(file, file.name || 'consulta.webm');
      this.draft.set(transcript.trim());
      if (!transcript.trim()) this.error.set('No se detectó voz en el audio.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo transcribir el audio.');
    } finally {
      inputElement.value = '';
      this.busy.set(false);
    }
  }

  private async finishRecording(): Promise<void> {
    this.recording.set(false);
    this.busy.set(true);
    try {
      const mimeType = this.recorder?.mimeType || 'audio/webm';
      const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
      const audio = new Blob(this.chunks, { type: mimeType });
      const transcript = await this.assistant.transcribe(audio, `consulta.${extension}`);
      this.draft.set(transcript.trim());
      if (!transcript.trim()) this.error.set('No se detectó voz en la grabación.');
    } catch (error) {
      this.error.set(error instanceof Error ? error.message : 'No se pudo transcribir el audio.');
    } finally {
      this.busy.set(false);
      this.stopTracks();
    }
  }

  private stopTracks(): void {
    this.recordingStream?.getTracks().forEach(track => track.stop());
    this.recordingStream = undefined;
    this.recorder = undefined;
    this.chunks = [];
  }

  private unavailableMessage(error: unknown): string {
    const detail = error instanceof Error ? error.message.toLowerCase() : '';
    if (detail.includes('sesión') || detail.includes('sesiÃ³n')) return 'Tu sesión cambió. Vuelve a ingresar para usar el asistente.';
    if (error instanceof Error && error.message) return error.message;
    return 'El asistente no está disponible ahora. El dashboard continúa funcionando normalmente.';
  }

  private scrollToEnd(): void {
    setTimeout(() => {
      const element = this.messageList()?.nativeElement;
      if (element) element.scrollTop = element.scrollHeight;
    }, 0);
  }
}
