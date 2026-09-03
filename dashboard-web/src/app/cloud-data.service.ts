import { Injectable, computed, signal } from '@angular/core';
import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { readRuntimeConfig } from './runtime-config';

type ReleaseRow = {
  id: string;
  version: string;
  sales_cutoff: string;
  stock_cutoff: string;
  generated_at: string;
  published_at: string;
};

type FilePart = { path: string; bytes: number; sha256: string };
type DashboardFileRow = { logical_name: string; parts: FilePart[] };
type SessionAction = 'claim' | 'ensure' | 'verify' | 'release';

@Injectable({ providedIn: 'root' })
export class CloudDataService {
  private readonly config = readRuntimeConfig();
  private readonly client: SupabaseClient | null = this.config.dataMode === 'supabase'
    ? createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  private initializePromise?: Promise<void>;
  private fileManifest = new Map<string, FilePart[]>();
  private sessionCheckTimer?: ReturnType<typeof setInterval>;

  readonly authReady = signal(false);
  readonly session = signal<Session | null>(null);
  readonly authError = signal('');
  readonly dataVersion = signal('LOCAL');
  readonly remoteEnabled = computed(() => this.client !== null);
  readonly hasAccess = computed(() => !this.remoteEnabled() || this.session() !== null);
  // La dirección interna de Auth no se expone nunca en la interfaz.
  readonly userName = computed(() => {
    const value = this.session()?.user.user_metadata?.['display_name'];
    return typeof value === 'string' && value.trim() ? value.trim() : 'Usuario';
  });
  readonly assistantEnabled = true;

  initialize(): Promise<void> {
    if (this.initializePromise) return this.initializePromise;
    this.initializePromise = this.initializeAuth();
    return this.initializePromise;
  }

  private async initializeAuth(): Promise<void> {
    if (!this.client) {
      this.authReady.set(true);
      return;
    }

    const { data, error } = await this.client.auth.getSession();
    if (error) this.authError.set('No se pudo validar la sesión guardada.');
    this.session.set(data.session);
    if (data.session) {
      try {
        const active = await this.controlSession('ensure', true);
        if (!active) await this.endLocalSession('Esta cuenta ya está abierta en otro dispositivo.');
      } catch {
        await this.endLocalSession('No se pudo validar este dispositivo. Vuelve a iniciar sesión.');
      }
    }
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      this.clearManifest();
    });
    this.startSessionMonitor();
    this.authReady.set(true);
  }

  async signIn(identity: string, password: string): Promise<boolean> {
    this.authError.set('');
    if (!this.client) return true;
    const username = identity.trim();
    let accessToken = '';
    let refreshToken = '';
    try {
      const response = await fetch(`${this.config.supabaseUrl}/functions/v1/username-login`, {
        method: 'POST',
        headers: { apikey: this.config.supabasePublishableKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const payload = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string };
      if (!response.ok || !payload.access_token || !payload.refresh_token) throw new Error('Acceso denegado.');
      accessToken = payload.access_token;
      refreshToken = payload.refresh_token;
    } catch {
      this.authError.set('Usuario o contraseña incorrectos.');
      return false;
    }
    const { data, error } = await this.client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error || !data.session) {
      this.authError.set('No se pudo iniciar la sesión. Inténtalo nuevamente.');
      return false;
    }
    this.session.set(data.session);
    try {
      const active = await this.controlSession('claim', true);
      if (!active) throw new Error('La sesión no quedó activa.');
    } catch {
      await this.endLocalSession('No se pudo registrar este dispositivo. Inténtalo nuevamente.');
      return false;
    }
    return true;
  }

  async signOut(): Promise<void> {
    if (this.client && this.session()) {
      await this.controlSession('release', false);
      await this.client.auth.signOut({ scope: 'local' });
    }
    this.session.set(null);
    this.clearManifest();
  }

  async jsonUrls(logicalName: string): Promise<string[]> {
    if (!this.client) return [`assets/data/${logicalName}`];
    if (!this.session()) throw new Error('La sesión venció. Vuelve a iniciar sesión.');
    if (!this.fileManifest.size) await this.loadPublishedManifest();

    const parts = this.fileManifest.get(logicalName);
    if (!parts?.length) throw new Error(`El archivo ${logicalName} no existe en la versión publicada.`);
    const paths = parts.map(part => part.path);
    const { data, error } = await this.client.storage.from('dashboard-data').createSignedUrls(paths, 5 * 60);
    if (error || !data) throw new Error(`No se pudo autorizar la descarga de ${logicalName}.`);
    const urls = data.map(item => item.signedUrl).filter((url): url is string => !!url);
    if (urls.length !== paths.length) throw new Error(`La versión publicada de ${logicalName} está incompleta.`);
    return urls;
  }

  async refreshManifest(): Promise<void> {
    this.clearManifest();
    if (this.client && this.session()) await this.loadPublishedManifest();
  }

  accessToken(): string {
    return this.session()?.access_token ?? '';
  }

  async invokeFunction<T>(name: string, body: object | FormData): Promise<T> {
    if (!this.client || !this.session()) throw new Error('Debes iniciar sesión para usar esta función.');
    const { data, error } = await this.client.functions.invoke<T>(name, { body });
    if (error) throw new Error(error.message || `No se pudo ejecutar ${name}.`);
    if (data === null) throw new Error(`${name} no devolvió una respuesta.`);
    return data;
  }

  async latestPublishedVersion(): Promise<string | null> {
    if (!this.client || !this.session()) return null;
    const { data, error } = await this.client
      .from('dashboard_releases')
      .select('version')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return (data as { version?: string } | null)?.version ?? null;
  }

  private async loadPublishedManifest(): Promise<void> {
    if (!this.client) return;

    const userId = this.session()?.user.id;
    const { data: profile, error: profileError } = await this.client
      .from('dashboard_users')
      .select('is_active,active_session_id')
      .eq('user_id', userId ?? '')
      .maybeSingle();
    if (profileError || !profile || profile.is_active !== true) {
      throw new Error('Tu usuario todavía no está habilitado para ver este dashboard.');
    }

    const { data: releaseData, error: releaseError } = await this.client
      .from('dashboard_releases')
      .select('id,version,sales_cutoff,stock_cutoff,generated_at,published_at')
      .eq('status', 'published')
      .order('published_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (releaseError) throw new Error('No se pudo consultar la versión vigente de los datos.');
    const release = releaseData as ReleaseRow | null;
    if (!release) throw new Error('Aún no existe una versión de datos publicada por el BAT 2.');

    const { data: filesData, error: filesError } = await this.client
      .from('dashboard_files')
      .select('logical_name,parts')
      .eq('release_id', release.id);
    if (filesError) throw new Error('No se pudo consultar el contenido de la versión vigente.');

    const rows = (filesData ?? []) as DashboardFileRow[];
    this.fileManifest = new Map(rows.map(row => [row.logical_name, row.parts]));
    this.dataVersion.set(release.version);
  }

  private async controlSession(action: SessionAction, strict: boolean): Promise<boolean> {
    if (!this.client || !this.session()) return false;
    const { data, error } = await this.client.functions.invoke<{ active?: boolean }>('session-control', { body: { action } });
    if (!error) return action === 'release' ? true : data?.active === true;
    const response = (error as { context?: Response }).context;
    if (response?.status === 409 || response?.status === 401 || response?.status === 403) return false;
    if (strict) throw error;
    // Una caída temporal del control no debe expulsar a un usuario válido.
    return true;
  }

  private startSessionMonitor(): void {
    if (!this.client || this.sessionCheckTimer) return;
    this.sessionCheckTimer = setInterval(() => {
      if (!this.session() || (typeof document !== 'undefined' && document.visibilityState !== 'visible')) return;
      void this.controlSession('verify', false).then(active => {
        if (!active) void this.endLocalSession('La cuenta se abrió en otro dispositivo. Ingresa nuevamente para continuar.');
      });
    }, 30_000);
  }

  private async endLocalSession(message: string): Promise<void> {
    if (this.client) await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    this.session.set(null);
    this.clearManifest();
    this.authError.set(message);
  }

  private clearManifest(): void {
    this.fileManifest.clear();
    this.dataVersion.set(this.client ? 'SIN CARGAR' : 'LOCAL');
  }
}
