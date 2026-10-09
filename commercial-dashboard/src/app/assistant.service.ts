import { Injectable } from '@angular/core';
import { CloudDataService } from './cloud-data.service';
import { readRuntimeConfig } from './runtime-config';

export type AssistantMessage = { role: 'user' | 'assistant'; content: string };

@Injectable({ providedIn: 'root' })
export class AssistantService {
  private readonly config = readRuntimeConfig();

  constructor(private readonly cloud: CloudDataService) {}

  async ask(messages: AssistantMessage[], context = ''): Promise<string> {
    if (!this.config.groqAssistantEnabled) throw new Error('El asistente de IA está desactivado en esta instalación.');

    // En una publicación remota la clave permanece dentro de la Edge Function.
    if (this.cloud.remoteEnabled() && this.cloud.hasAccess()) {
      try {
        const payload = await this.cloud.invokeFunction<{ answer?: string; error?: string }>('groq-chat', { messages, context });
        if (payload?.answer) return payload.answer;
        if (payload?.error) throw new Error(payload.error);
      } catch (err) {
        throw err instanceof Error ? err : new Error('No se pudo conectar con el asistente remoto.');
      }
    }

    const payload = await this.localRequest<{ answer?: string; error?: string }>('/api/assistant/chat', { messages, context });
    if (!payload.answer) throw new Error(payload.error || 'El asistente local no devolvió una respuesta.');
    return payload.answer;
  }

  async transcribe(audio: Blob, fileName = 'consulta.webm'): Promise<string> {
    if (!this.config.groqAssistantEnabled) throw new Error('El asistente de IA está desactivado en esta instalación.');

    if (this.cloud.portalEnabled) {
      const data = new Uint8Array(await audio.arrayBuffer());
      let binary = '';
      for (let offset = 0; offset < data.length; offset += 0x8000) {
        binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
      }
      const payload = await this.localRequest<{ text?: string; error?: string }>('/api/assistant/transcribe', {
        audioBase64: btoa(binary), fileName, mimeType: audio.type,
      });
      if (payload.text == null) throw new Error(payload.error || 'La transcripción no devolvió texto.');
      return payload.text;
    }

    if (this.cloud.remoteEnabled() && this.cloud.hasAccess()) {
      try {
        const body = new FormData();
        body.append('audio', audio, fileName);
        const payload = await this.cloud.invokeFunction<{ text?: string; error?: string }>('groq-transcribe', body);
        if (payload?.text) return payload.text;
        if (payload?.error) throw new Error(payload.error);
      } catch (err) {
        throw err instanceof Error ? err : new Error('No se pudo conectar con la transcripción remota.');
      }
    }

    const data = new Uint8Array(await audio.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < data.length; offset += 0x8000) {
      binary += String.fromCharCode(...data.subarray(offset, offset + 0x8000));
    }
    const payload = await this.localRequest<{ text?: string; error?: string }>('/api/assistant/transcribe', {
      audioBase64: btoa(binary), fileName, mimeType: audio.type,
    });
    if (payload.text == null) throw new Error(payload.error || 'La transcripción local no devolvió texto.');
    return payload.text;
  }

  private async localRequest<T>(path: string, body: object): Promise<T> {
    const response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || `Error local HTTP ${response.status}`);
    return payload;
  }
}
