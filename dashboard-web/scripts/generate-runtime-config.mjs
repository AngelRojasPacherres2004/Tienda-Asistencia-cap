import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const supabaseUrl = (process.env.SUPABASE_URL ?? '').trim();
const supabasePublishableKey = (process.env.SUPABASE_PUBLISHABLE_KEY ?? '').trim();
if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_PUBLISHABLE_KEY para compilar la versión Netlify.');
}

const config = {
  dataMode: 'supabase',
  supabaseUrl,
  supabasePublishableKey,
  groqAssistantEnabled: (process.env.GROQ_ASSISTANT_ENABLED ?? 'true').toLowerCase() !== 'false',
  groqChatModel: (process.env.GROQ_CHAT_MODEL ?? 'openai/gpt-oss-120b').trim(),
  groqFallbackModels: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
};
const output = `window.__DASHBOARD_CONFIG__ = ${JSON.stringify(config, null, 2)};\n`;
await writeFile(resolve('public/runtime-config.js'), output, 'utf8');
console.log('Configuración pública de Netlify generada.');
