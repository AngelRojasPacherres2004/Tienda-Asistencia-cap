export type DashboardDataMode = 'local' | 'supabase' | 'portal';

export type DashboardRuntimeConfig = {
  dataMode: DashboardDataMode;
  supabaseUrl: string;
  supabasePublishableKey: string;
  groqAssistantEnabled: boolean;
  groqChatModel?: string;
  groqFallbackModels?: string[];
};

declare global {
  interface Window {
    __DASHBOARD_CONFIG__?: Partial<DashboardRuntimeConfig>;
  }
}

const DEFAULT_CONFIG: DashboardRuntimeConfig = {
  dataMode: 'local',
  supabaseUrl: '',
  supabasePublishableKey: '',
  groqAssistantEnabled: true,
  groqChatModel: 'openai/gpt-oss-120b',
  groqFallbackModels: ['openai/gpt-oss-20b', 'qwen/qwen3.8-27b'],
};

export function readRuntimeConfig(): DashboardRuntimeConfig {
  if (typeof window === 'undefined') return DEFAULT_CONFIG;
  const supplied = window.__DASHBOARD_CONFIG__ ?? {};
  const remoteReady = supplied.dataMode === 'supabase'
    && !!supplied.supabaseUrl
    && !!supplied.supabasePublishableKey;

  return {
    ...DEFAULT_CONFIG,
    ...supplied,
    dataMode: supplied.dataMode === 'portal' ? 'portal' : remoteReady ? 'supabase' : 'local',
    supabaseUrl: supplied.supabaseUrl?.trim() ?? '',
    supabasePublishableKey: supplied.supabasePublishableKey?.trim() ?? '',
    groqAssistantEnabled: supplied.groqAssistantEnabled !== false,
    groqChatModel: supplied.groqChatModel?.trim() || DEFAULT_CONFIG.groqChatModel,
    groqFallbackModels: supplied.groqFallbackModels || DEFAULT_CONFIG.groqFallbackModels,
  };
}
