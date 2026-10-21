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

type FileEncoding = 'identity' | 'gzip';
type FilePart = { path: string; bytes: number; sha256: string; encoding?: FileEncoding };
type DashboardFileRow = { logical_name: string; checksum_sha256: string; parts: FilePart[] };
export type DashboardFileSource = {
  urls: string[];
  encoding: FileEncoding;
  cacheKey: string;
  cacheVersion: string;
  cacheEnabled: boolean;
};
type SessionAction = 'claim' | 'ensure' | 'verify' | 'release';
type AccessScopeType = 'all' | 'store' | 'cluster' | 'none';
export type DashboardAccessProfile = {
  roleCode: string;
  roleName: string;
  canAccessDashboard: boolean;
  scopeType: AccessScopeType;
  stores: string[];
  clusters: string[];
};

const LOCAL_ACCESS: DashboardAccessProfile = {
  roleCode: 'jefe_comercial',
  roleName: 'Jefe comercial',
  canAccessDashboard: true,
  scopeType: 'all',
  stores: [],
  clusters: [],
};

@Injectable({ providedIn: 'root' })
export class CloudDataService {
  private readonly config = readRuntimeConfig();
  private readonly portalMode = this.config.dataMode === 'portal';
  readonly portalEnabled = this.portalMode;
  private readonly client: SupabaseClient | null = this.config.dataMode === 'supabase'
    ? createClient(this.config.supabaseUrl, this.config.supabasePublishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;
  private initializePromise?: Promise<void>;
  private fileManifest = new Map<string, DashboardFileRow>();

  readonly authReady = signal(false);
  readonly session = signal<Session | null>(null);
  private readonly portalUser = signal<{ nombres?: string; apellidos?: string } | null>(null);
  readonly accessProfile = signal<DashboardAccessProfile | null>(this.client || this.portalMode ? null : LOCAL_ACCESS);
  readonly authError = signal('');
  readonly dataVersion = signal('LOCAL');
  readonly remoteEnabled = computed(() => this.client !== null || this.portalMode);
  readonly hasAccess = computed(() => this.portalMode
    ? this.portalUser() !== null && this.accessProfile()?.canAccessDashboard === true
    : !this.remoteEnabled() || (this.session() !== null && this.accessProfile()?.canAccessDashboard === true));
  // La dirección interna de Auth no se expone nunca en la interfaz.
  readonly userName = computed(() => {
    if (this.portalMode) {
      const user = this.portalUser();
      return [user?.nombres, user?.apellidos].filter(Boolean).join(' ') || 'Usuario';
    }
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
    if (this.portalMode) {
      try {
        const [account, scope] = await Promise.all([
          this.portalRequest<{ user: { nombres?: string; apellidos?: string } }>('/auth/me'),
          this.portalRequest<{ access: { scopeType: AccessScopeType; scopeValue: string | null; storeIds: string[] } }>('/commercial/access'),
        ]);
        const access = scope.access;
        this.portalUser.set(account.user);
        this.accessProfile.set({
          roleCode: access.scopeType,
          roleName: access.scopeType === 'all' ? 'Comercial' : access.scopeType === 'cluster' ? 'Zonal' : 'Tienda',
          canAccessDashboard: true,
          scopeType: access.scopeType,
          stores: access.scopeType === 'store' ? [access.scopeValue || ''] : [],
          clusters: access.scopeType === 'cluster' ? [access.scopeValue || ''] : [],
        });
      } catch (error) {
        this.authError.set(error instanceof Error ? error.message : 'No tienes acceso al dashboard comercial.');
      } finally {
        this.authReady.set(true);
      }
      return;
    }
    if (!this.client) {
      this.authReady.set(true);
      return;
    }

    const { data, error } = await this.client.auth.getSession();
    if (error) this.authError.set('No se pudo validar la sesión guardada.');
    this.session.set(data.session);
    if (data.session) {
      try {
        const allowed = await this.loadAccessProfile();
        if (!allowed) {
          await this.endLocalSession('Tu rol no tiene acceso al dashboard comercial.');
          this.authReady.set(true);
          return;
        }
        const active = await this.controlSession('ensure', true);
        if (!active) await this.endLocalSession('Esta cuenta ya está abierta en otro dispositivo.');
      } catch {
        await this.endLocalSession('No se pudo validar este dispositivo. Vuelve a iniciar sesión.');
      }
    }
    this.client.auth.onAuthStateChange((_event, session) => {
      this.session.set(session);
      if (!session) this.accessProfile.set(null);
      this.clearManifest();
    });
    this.authReady.set(true);
  }

  async signIn(identity: string, password: string): Promise<boolean> {
    this.authError.set('');
    if (this.portalMode) {
      this.authError.set('Inicia sesión desde la página principal de Asiste.');
      return false;
    }
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
      const payload = await response.json().catch(() => ({})) as { access_token?: string; refresh_token?: string; error?: string };
      if (!response.ok || !payload.access_token || !payload.refresh_token) {
        if (response.status === 403 && payload.error) {
          this.authError.set(payload.error);
          return false;
        }
        throw new Error('Acceso denegado.');
      }
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
      const allowed = await this.loadAccessProfile();
      if (!allowed) {
        await this.endLocalSession('Tu rol no tiene acceso al dashboard comercial.');
        return false;
      }
      const active = await this.controlSession('claim', true);
      if (!active) throw new Error('La sesión no quedó activa.');
    } catch {
      await this.endLocalSession('No se pudo registrar este dispositivo. Inténtalo nuevamente.');
      return false;
    }
    return true;
  }

  async signOut(): Promise<void> {
    if (this.portalMode) {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
      window.top?.location.assign('/');
      return;
    }
    if (this.client && this.session()) {
      await this.controlSession('release', false);
      await this.client.auth.signOut({ scope: 'local' });
    }
    this.session.set(null);
    this.accessProfile.set(this.client ? null : LOCAL_ACCESS);
    this.clearManifest();
  }

  async jsonSource(logicalName: string): Promise<DashboardFileSource> {
    if (this.portalMode) {
      const source = await this.portalRequest<DashboardFileSource>(`/commercial/files/${encodeURIComponent(logicalName)}`);
      this.dataVersion.set(source.cacheVersion);
      return source;
    }
    if (!this.client) {
      return {
        urls: [`assets/data/${logicalName}`],
        encoding: 'identity',
        cacheKey: logicalName,
        cacheVersion: 'LOCAL',
        cacheEnabled: false,
      };
    }
    if (!this.session()) throw new Error('La sesión venció. Vuelve a iniciar sesión.');
    if (!this.fileManifest.size) await this.loadPublishedManifest();

    const file = this.fileManifest.get(logicalName);
    if (!file?.parts?.length) throw new Error(`El archivo ${logicalName} no existe en la versión publicada.`);
    const paths = file.parts.map(part => part.path);
    const { data, error } = await this.client.storage.from('dashboard-data').createSignedUrls(paths, 5 * 60);
    if (error || !data) throw new Error(`No se pudo autorizar la descarga de ${logicalName}.`);
    const urls = data.map(item => item.signedUrl).filter((url): url is string => !!url);
    if (urls.length !== paths.length) throw new Error(`La versión publicada de ${logicalName} está incompleta.`);
    const encoding = file.parts.every(part => part.encoding === 'gzip') ? 'gzip' : 'identity';
    return {
      urls,
      encoding,
      cacheKey: `${logicalName}:${file.checksum_sha256 || paths.join('|')}`,
      cacheVersion: this.dataVersion(),
      cacheEnabled: true,
    };
  }

  async refreshManifest(): Promise<void> {
    this.clearManifest();
    if (this.portalMode) {
      const data = await this.portalRequest<{ release: { version: string } }>('/commercial/manifest');
      this.dataVersion.set(data.release.version);
      return;
    }
    if (this.client && this.session()) await this.loadPublishedManifest();
  }

  accessToken(): string {
    return this.session()?.access_token ?? '';
  }

  async invokeFunction<T>(name: string, body: object | FormData): Promise<T> {
    if (this.portalMode) {
      if (name !== 'groq-chat' && name !== 'groq-transcribe') throw new Error('La función solicitada no está disponible en Asiste.');
      return this.portalRequest<T>(name === 'groq-chat' ? '/assistant/chat' : '/assistant/transcribe', {
        method: 'POST',
        body: body instanceof FormData ? body : JSON.stringify(body),
        headers: body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
      });
    }
    if (!this.client || !this.session()) throw new Error('Debes iniciar sesión para usar esta función.');
    const { data, error } = await this.client.functions.invoke<T>(name, { body });
    if (error) throw new Error(error.message || `No se pudo ejecutar ${name}.`);
    if (data === null) throw new Error(`${name} no devolvió una respuesta.`);
    return data;
  }

  async latestPublishedVersion(): Promise<string | null> {
    if (this.portalMode) {
      const data = await this.portalRequest<{ release: { version: string } }>('/commercial/manifest').catch(() => null);
      return data?.release.version ?? null;
    }
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

    const access = this.accessProfile();
    if (!access?.canAccessDashboard) throw new Error('Tu rol no tiene acceso al dashboard comercial.');
    const scoped = access.scopeType !== 'all';
    const values = access.scopeType === 'store' ? access.stores : access.clusters;
    if (scoped && (access.scopeType === 'none' || values.length !== 1)) {
      throw new Error('La asignación de tienda o clúster debe contener exactamente un ámbito.');
    }
    let filesQuery = this.client
      .from(scoped ? 'dashboard_scope_files' : 'dashboard_files')
      .select('logical_name,checksum_sha256,parts')
      .eq('release_id', release.id);
    if (scoped) filesQuery = filesQuery.eq('scope_type', access.scopeType).eq('scope_value', values[0]);
    const { data: filesData, error: filesError } = await filesQuery;
    if (filesError) throw new Error('No se pudo consultar el contenido de la versión vigente.');

    const rows = (filesData ?? []) as DashboardFileRow[];
    this.fileManifest = new Map(rows.map(row => [row.logical_name, row]));
    this.dataVersion.set(release.version);
  }

  private async loadAccessProfile(): Promise<boolean> {
    if (!this.client) {
      this.accessProfile.set(LOCAL_ACCESS);
      return true;
    }
    const userId = this.session()?.user.id;
    if (!userId) {
      this.accessProfile.set(null);
      return false;
    }

    const { data: user, error: userError } = await this.client
      .from('dashboard_users')
      .select('role,is_active')
      .eq('user_id', userId)
      .maybeSingle();
    if (userError || !user?.is_active || !user.role) {
      this.accessProfile.set(null);
      return false;
    }

    const [{ data: role, error: roleError }, { data: scopes, error: scopesError }] = await Promise.all([
      this.client
        .from('dashboard_roles')
        .select('code,name,can_access_dashboard,scope_type,is_active')
        .eq('code', user.role)
        .maybeSingle(),
      this.client
        .from('dashboard_user_scopes')
        .select('scope_type,scope_value')
        .eq('user_id', userId),
    ]);
    if (roleError || scopesError || !role?.is_active) {
      this.accessProfile.set(null);
      return false;
    }

    const scopeRows = (scopes ?? []) as Array<{ scope_type: 'store' | 'cluster'; scope_value: string }>;
    const access: DashboardAccessProfile = {
      roleCode: String(role.code),
      roleName: String(role.name),
      canAccessDashboard: role.can_access_dashboard === true,
      scopeType: role.scope_type as AccessScopeType,
      stores: scopeRows.filter(item => item.scope_type === 'store').map(item => item.scope_value),
      clusters: scopeRows.filter(item => item.scope_type === 'cluster').map(item => item.scope_value),
    };
    const requiredScopesPresent = access.scopeType === 'all'
      || (access.scopeType === 'store' && access.stores.length > 0)
      || (access.scopeType === 'cluster' && access.clusters.length > 0);
    access.canAccessDashboard = access.canAccessDashboard && requiredScopesPresent;
    this.accessProfile.set(access);
    return access.canAccessDashboard;
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

  private async endLocalSession(message: string): Promise<void> {
    if (this.client) await this.client.auth.signOut({ scope: 'local' }).catch(() => undefined);
    this.session.set(null);
    this.accessProfile.set(this.client ? null : LOCAL_ACCESS);
    this.clearManifest();
    this.authError.set(message);
  }

  private clearManifest(): void {
    this.fileManifest.clear();
    this.dataVersion.set(this.client || this.portalMode ? 'SIN CARGAR' : 'LOCAL');
  }

  private async portalRequest<T>(path: string, options: RequestInit = {}): Promise<T> {
    const response = await fetch(`/api${path}`, { credentials: 'same-origin', cache: 'no-store', ...options });
    const payload = await response.json().catch(() => ({})) as T & { error?: string };
    if (!response.ok) throw new Error(payload.error || `No se pudo consultar Asiste (HTTP ${response.status}).`);
    return payload;
  }
}
