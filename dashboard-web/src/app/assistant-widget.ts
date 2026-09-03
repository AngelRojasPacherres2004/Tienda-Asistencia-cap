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
