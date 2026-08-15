export type DashboardDataMode = 'local' | 'supabase';

export type DashboardRuntimeConfig = {
  dataMode: DashboardDataMode;
  supabaseUrl: string;
  supabasePublishableKey: string;
  groqAssistantEnabled: boolean;
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
  groqAssistantEnabled: false,
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
    dataMode: remoteReady ? 'supabase' : 'local',
    supabaseUrl: supplied.supabaseUrl?.trim() ?? '',
    supabasePublishableKey: supplied.supabasePublishableKey?.trim() ?? '',
    groqAssistantEnabled: supplied.groqAssistantEnabled === true,
  };
}
