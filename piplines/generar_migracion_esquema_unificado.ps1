param(
  [Parameter(Mandatory = $true)]
  [string]$SourceProjectRef,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if (-not ('SupabaseCredentialReader' -as [type])) {
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;

public static class SupabaseCredentialReader {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct Credential {
    public uint Flags;
    public uint Type;
    public string TargetName;
    public string Comment;
    public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
    public uint CredentialBlobSize;
    public IntPtr CredentialBlob;
    public uint Persist;
    public uint AttributeCount;
    public IntPtr Attributes;
    public string TargetAlias;
    public string UserName;
  }

  [DllImport("advapi32.dll", EntryPoint = "CredReadW", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern bool CredRead(string target, uint type, uint flags, out IntPtr credentialPtr);

  [DllImport("advapi32.dll", SetLastError = true)]
  public static extern void CredFree(IntPtr credentialPtr);
}
'@
}

function Get-SupabaseAccessToken {
  $credentialPtr = [IntPtr]::Zero
  if (-not [SupabaseCredentialReader]::CredRead('Supabase CLI:supabase', 1, 0, [ref]$credentialPtr)) {
    throw 'No se pudo leer la sesión activa de Supabase CLI.'
  }

  try {
    $credential = [Runtime.InteropServices.Marshal]::PtrToStructure(
      $credentialPtr,
      [type][SupabaseCredentialReader+Credential]
    )
    $bytes = New-Object byte[] $credential.CredentialBlobSize
    [Runtime.InteropServices.Marshal]::Copy($credential.CredentialBlob, $bytes, 0, $bytes.Length)
    return [Text.Encoding]::UTF8.GetString($bytes).Trim([char]0)
  }
  finally {
    [SupabaseCredentialReader]::CredFree($credentialPtr)
  }
}

function Invoke-SupabaseSql {
  param([string]$Sql)

  $token = Get-SupabaseAccessToken
  $headers = @{ Authorization = "Bearer $token" }
  $body = @{ query = $Sql } | ConvertTo-Json -Compress
  $request = @{
    Method = 'Post'
    Uri = "https://api.supabase.com/v1/projects/$SourceProjectRef/database/query"
    Headers = $headers
    ContentType = 'application/json'
    Body = $body
  }
  Invoke-RestMethod @request
}

function Quote-Identifier {
  param([string]$Value)
  return '"' + $Value.Replace('"', '""') + '"'
}

$metadataSql = @'
with public_tables as (
  select
    c.oid,
    c.relname as table_name,
    obj_description(c.oid, 'pg_class') as table_comment,
    (
      select jsonb_agg(
        jsonb_build_object(
          'name', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'not_null', a.attnotnull,
          'identity_kind', a.attidentity,
          'generated_kind', a.attgenerated,
          'default_expression', pg_get_expr(ad.adbin, ad.adrelid),
          'comment', col_description(a.attrelid, a.attnum)
        )
        order by a.attnum
      )
      from pg_attribute a
      left join pg_attrdef ad
        on ad.adrelid = a.attrelid
       and ad.adnum = a.attnum
      where a.attrelid = c.oid
        and a.attnum > 0
        and not a.attisdropped
    ) as columns
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
), constraints_meta as (
  select
    c.relname as table_name,
    con.conname as constraint_name,
    con.contype as constraint_type,
    pg_get_constraintdef(con.oid, true) as definition
  from pg_constraint con
  join pg_class c on c.oid = con.conrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
), indexes_meta as (
  select
    table_class.relname as table_name,
    index_class.relname as index_name,
    pg_get_indexdef(index_class.oid) as definition
  from pg_index idx
  join pg_class table_class on table_class.oid = idx.indrelid
  join pg_namespace n on n.oid = table_class.relnamespace
  join pg_class index_class on index_class.oid = idx.indexrelid
  left join pg_constraint con on con.conindid = idx.indexrelid
  where n.nspname = 'public'
    and con.oid is null
), functions_meta as (
  select p.proname as function_name, pg_get_functiondef(p.oid) as definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
), triggers_meta as (
  select c.relname as table_name, t.tgname as trigger_name, pg_get_triggerdef(t.oid, true) as definition
  from pg_trigger t
  join pg_class c on c.oid = t.tgrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and not t.tgisinternal
)
select jsonb_build_object(
  'tables', coalesce((select jsonb_agg(to_jsonb(t) order by t.table_name) from public_tables t), '[]'::jsonb),
  'constraints', coalesce((select jsonb_agg(to_jsonb(c) order by c.table_name, c.constraint_name) from constraints_meta c), '[]'::jsonb),
  'indexes', coalesce((select jsonb_agg(to_jsonb(i) order by i.table_name, i.index_name) from indexes_meta i), '[]'::jsonb),
  'functions', coalesce((select jsonb_agg(to_jsonb(f) order by f.function_name) from functions_meta f), '[]'::jsonb),
  'triggers', coalesce((select jsonb_agg(to_jsonb(t) order by t.table_name, t.trigger_name) from triggers_meta t), '[]'::jsonb)
) as schema_metadata;
'@

$result = Invoke-SupabaseSql -Sql $metadataSql
$metadata = $result[0].schema_metadata

$constraintsByTable = @{}
foreach ($constraint in $metadata.constraints) {
  if (-not $constraintsByTable.ContainsKey($constraint.table_name)) {
    $constraintsByTable[$constraint.table_name] = @()
  }
  $constraintsByTable[$constraint.table_name] += $constraint
}

$sqlLines = [System.Collections.Generic.List[string]]::new()
$sqlLines.Add('-- Esquema canónico compartido por dashboardcomercial y thisisalexa.')
$sqlLines.Add('-- Generado desde la estructura operativa viva y completado con la plataforma del dashboard.')
$sqlLines.Add('')
$sqlLines.Add('create extension if not exists pgcrypto;')
$sqlLines.Add('')

foreach ($table in $metadata.tables) {
  $tableName = Quote-Identifier $table.table_name
  $definitionLines = [System.Collections.Generic.List[string]]::new()

  foreach ($column in $table.columns) {
    $columnSql = "  $(Quote-Identifier $column.name) $($column.type)"
    if ($column.generated_kind -eq 's') {
      $columnSql += " GENERATED ALWAYS AS ($($column.default_expression)) STORED"
    }
    elseif ($column.identity_kind -eq 'a') {
      $columnSql += ' GENERATED ALWAYS AS IDENTITY'
    }
    elseif ($column.identity_kind -eq 'd') {
      $columnSql += ' GENERATED BY DEFAULT AS IDENTITY'
    }
    elseif ($column.default_expression -and $column.default_expression -match '^nextval\(') {
      $columnSql += ' GENERATED BY DEFAULT AS IDENTITY'
    }
    elseif ($null -ne $column.default_expression -and "$($column.default_expression)" -ne '') {
      $columnSql += " DEFAULT $($column.default_expression)"
    }

    if ($column.not_null) {
      $columnSql += ' NOT NULL'
    }
    $definitionLines.Add($columnSql)
  }

  foreach ($constraint in $constraintsByTable[$table.table_name]) {
    if ($constraint.constraint_type -ne 'f') {
      $definitionLines.Add("  CONSTRAINT $(Quote-Identifier $constraint.constraint_name) $($constraint.definition)")
    }
  }

  $sqlLines.Add("create table if not exists public.$tableName (")
  for ($i = 0; $i -lt $definitionLines.Count; $i++) {
    $suffix = if ($i -lt $definitionLines.Count - 1) { ',' } else { '' }
    $sqlLines.Add($definitionLines[$i] + $suffix)
  }
  $sqlLines.Add(');')
  $sqlLines.Add('')

  if ($table.table_comment) {
    $comment = "$($table.table_comment)".Replace("'", "''")
    $sqlLines.Add("comment on table public.$tableName is '$comment';")
  }
  foreach ($column in $table.columns) {
    if ($column.comment) {
      $comment = "$($column.comment)".Replace("'", "''")
      $sqlLines.Add("comment on column public.$tableName.$(Quote-Identifier $column.name) is '$comment';")
    }
  }
  if ($table.table_comment -or ($table.columns | Where-Object { $_.comment })) {
    $sqlLines.Add('')
  }
}

$sqlLines.Add('-- Llaves foráneas agregadas después de crear todas las tablas para resolver ciclos.')
foreach ($constraint in $metadata.constraints) {
  if ($constraint.constraint_type -ne 'f') {
    continue
  }
  $tableLiteral = "public.$($constraint.table_name)".Replace("'", "''")
  $constraintLiteral = "$($constraint.constraint_name)".Replace("'", "''")
  $sqlLines.Add('do $migration$')
  $sqlLines.Add('begin')
  $sqlLines.Add("  if not exists (select 1 from pg_constraint where conrelid = '$tableLiteral'::regclass and conname = '$constraintLiteral') then")
  $sqlLines.Add("    alter table public.$(Quote-Identifier $constraint.table_name) add constraint $(Quote-Identifier $constraint.constraint_name) $($constraint.definition);")
  $sqlLines.Add('  end if;')
  $sqlLines.Add('end')
  $sqlLines.Add('$migration$;')
}
$sqlLines.Add('')

$sqlLines.Add('-- Índices secundarios del modelo operativo.')
foreach ($index in $metadata.indexes) {
  $indexSql = "$($index.definition)"
  $indexSql = $indexSql -replace '^CREATE UNIQUE INDEX ', 'CREATE UNIQUE INDEX IF NOT EXISTS '
  $indexSql = $indexSql -replace '^CREATE INDEX ', 'CREATE INDEX IF NOT EXISTS '
  $sqlLines.Add($indexSql + ';')
}
$sqlLines.Add('')

$sqlLines.Add('-- Funciones y disparadores operativos existentes.')
foreach ($function in $metadata.functions) {
  $functionSql = "$($function.definition)".Trim()
  if (-not $functionSql.EndsWith(';')) {
    $functionSql += ';'
  }
  $sqlLines.Add($functionSql)
  $sqlLines.Add('')
}
foreach ($trigger in $metadata.triggers) {
  $sqlLines.Add("drop trigger if exists $(Quote-Identifier $trigger.trigger_name) on public.$(Quote-Identifier $trigger.table_name);")
  $triggerSql = "$($trigger.definition)" -replace ' ON ([A-Za-z_][A-Za-z0-9_]*) ', ' ON public.$1 '
  $triggerSql = $triggerSql -replace 'EXECUTE FUNCTION ([A-Za-z_][A-Za-z0-9_]*)\(', 'EXECUTE FUNCTION public.$1('
  $sqlLines.Add($triggerSql + ';')
}
$sqlLines.Add('')

$sqlLines.Add('-- Plataforma técnica del dashboard.')
$sqlLines.Add(@'
create table if not exists public.dashboard_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'viewer' check (role in ('viewer', 'manager', 'admin')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  active_session_id uuid,
  session_claimed_at timestamptz,
  session_seen_at timestamptz,
  usuario text not null,
  cargo text not null default 'GENERAL',
  dispositivo text not null default 'xxxxxxx',
  username_key text not null,
  contrasena text not null
);

create table if not exists public.dashboard_releases (
  id uuid primary key default gen_random_uuid(),
  version text not null unique,
  status text not null default 'staging' check (status in ('staging', 'published', 'failed')),
  sales_cutoff date not null,
  stock_cutoff date not null,
  generated_at timestamptz not null,
  published_at timestamptz,
  total_bytes bigint not null default 0 check (total_bytes >= 0),
  checksum_sha256 text not null,
  manifest jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now()
);

create table if not exists public.dashboard_files (
  id bigint generated always as identity primary key,
  release_id uuid not null references public.dashboard_releases(id) on delete cascade,
  logical_name text not null,
  byte_size bigint not null check (byte_size >= 0),
  checksum_sha256 text not null,
  content_type text not null default 'application/json',
  parts jsonb not null check (jsonb_typeof(parts) = 'array'),
  created_at timestamptz not null default now(),
  unique (release_id, logical_name)
);

alter table public.dashboard_users
  add column if not exists active_session_id uuid,
  add column if not exists session_claimed_at timestamptz,
  add column if not exists session_seen_at timestamptz,
  add column if not exists usuario text,
  add column if not exists cargo text not null default 'GENERAL',
  add column if not exists dispositivo text not null default 'xxxxxxx',
  add column if not exists username_key text,
  add column if not exists contrasena text;

update public.dashboard_users
set usuario = coalesce(usuario, display_name, split_part((select email from auth.users where id = user_id), '@', 1))
where usuario is null;

update public.dashboard_users
set username_key = lower(trim(usuario))
where username_key is null and usuario is not null;

alter table public.dashboard_users
  alter column usuario set not null,
  alter column username_key set not null,
  alter column contrasena set not null;

create unique index if not exists dashboard_users_usuario_unique on public.dashboard_users (lower(usuario));
create unique index if not exists dashboard_users_username_key_unique on public.dashboard_users (username_key);
create index if not exists dashboard_releases_published_idx on public.dashboard_releases (published_at desc) where status = 'published';
create index if not exists dashboard_files_release_idx on public.dashboard_files (release_id);

create or replace function public.dashboard_normalize_username()
returns trigger
language plpgsql
set search_path = public
as $function$
begin
  new.usuario := trim(new.usuario);
  new.username_key := lower(new.usuario);
  if new.usuario !~ '^[A-Za-z0-9][A-Za-z0-9._-]{2,48}$' then
    raise exception 'El usuario debe tener entre 3 y 49 caracteres: letras, números, punto, guion o guion bajo.';
  end if;
  return new;
end;
$function$;

drop trigger if exists dashboard_users_normalize_username on public.dashboard_users;
create trigger dashboard_users_normalize_username
before insert or update of usuario on public.dashboard_users
for each row execute function public.dashboard_normalize_username();

alter table public.dashboard_users enable row level security;
alter table public.dashboard_releases enable row level security;
alter table public.dashboard_files enable row level security;

drop policy if exists "users can read own dashboard profile" on public.dashboard_users;
create policy "users can read own dashboard profile"
on public.dashboard_users for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "active session can read dashboard releases" on public.dashboard_releases;
create policy "active session can read dashboard releases"
on public.dashboard_releases for select to authenticated
using (
  exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "active session can read dashboard files" on public.dashboard_files;
create policy "active session can read dashboard files"
on public.dashboard_files for select to authenticated
using (
  exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "admins can delete dashboard releases" on public.dashboard_releases;
create policy "admins can delete dashboard releases"
on public.dashboard_releases for delete to authenticated
using (
  exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.role = 'admin'
  )
);

revoke all on table public.dashboard_users from anon;
revoke all on table public.dashboard_releases from anon;
revoke all on table public.dashboard_files from anon;
revoke all on table public.dashboard_users from authenticated;
revoke all on table public.dashboard_releases from authenticated;
revoke all on table public.dashboard_files from authenticated;
grant select (
  user_id, display_name, usuario, username_key, cargo, dispositivo, role,
  is_active, active_session_id, session_claimed_at, session_seen_at,
  created_at, updated_at
) on table public.dashboard_users to authenticated;
grant select, delete on table public.dashboard_releases to authenticated;
grant select on table public.dashboard_files to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'dashboard-data',
  'dashboard-data',
  false,
  6291456,
  array['application/octet-stream', 'application/json']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "active session can read private dashboard objects" on storage.objects;
create policy "active session can read private dashboard objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.active_session_id::text = ((select auth.jwt()) ->> 'session_id')
  )
);

drop policy if exists "admins can delete private dashboard objects" on storage.objects;
create policy "admins can delete private dashboard objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'dashboard-data'
  and exists (
    select 1 from public.dashboard_users u
    where u.user_id = (select auth.uid())
      and u.is_active = true
      and u.role = 'admin'
  )
);

comment on table public.dashboard_users is 'Directorio técnico de acceso al dashboard; separado del personal operativo de public.usuarios.';
comment on table public.dashboard_releases is 'Versiones atómicas publicadas por el proceso de actualización del dashboard.';
comment on table public.dashboard_files is 'Manifiesto y partes privadas de cada conjunto de datos del dashboard.';
comment on column public.dashboard_users.contrasena is 'Contraseña operativa en texto plano por requerimiento del propietario.';
'@)
$sqlLines.Add('')

$sqlLines.Add('-- Todas las tablas públicas quedan protegidas por RLS. Las tablas operativas no reciben políticas abiertas.')
foreach ($table in $metadata.tables) {
  $sqlLines.Add("alter table public.$(Quote-Identifier $table.table_name) enable row level security;")
}

$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory -and -not (Test-Path -LiteralPath $outputDirectory)) {
  New-Item -ItemType Directory -Path $outputDirectory | Out-Null
}

$content = ($sqlLines -join "`r`n") + "`r`n"
[IO.File]::WriteAllText($OutputPath, $content, [Text.UTF8Encoding]::new($false))
Write-Output "Migración generada: $OutputPath"
Write-Output "Tablas operativas: $($metadata.tables.Count)"
Write-Output "Restricciones: $($metadata.constraints.Count)"
Write-Output "Índices secundarios: $($metadata.indexes.Count)"
