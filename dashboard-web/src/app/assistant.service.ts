import { Injectable } from '@angular/core';
import { CloudDataService } from './cloud-data.service';

export type AssistantMessage = { role: 'user' | 'assistant'; content: string };

@Injectable({ providedIn: 'root' })
export class AssistantService {
  constructor(private readonly cloud: CloudDataService) {}

  async ask(messages: AssistantMessage[], context = ''): Promise<string> {
    const payload = await this.cloud.invokeFunction<{ answer?: string; error?: string }>('groq-chat', { messages, context });
    if (payload.error) throw new Error(payload.error);
    return payload.answer || 'Sin respuesta.';
  }

  async transcribe(audio: Blob, fileName = 'consulta.webm'): Promise<string> {
    const body = new FormData();
    body.append('audio', audio, fileName);
    const payload = await this.cloud.invokeFunction<{ text?: string; error?: string }>('groq-transcribe', body);
    if (payload.error) throw new Error(payload.error);
    return payload.text || '';
  }
}
