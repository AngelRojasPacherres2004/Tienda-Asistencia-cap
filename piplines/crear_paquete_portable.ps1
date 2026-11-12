<#!
.SYNOPSIS
  Crea el ZIP portable del Dashboard General sin credenciales ni datos locales.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Version
)

$ErrorActionPreference = 'Stop'

function Assert-PathInsideRoot([string]$Path) {
    $resolved = [System.IO.Path]::GetFullPath($Path)
    $rootPrefix = $script:ProjectRoot.TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($rootPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Ruta fuera del proyecto: $resolved"
    }
    return $resolved
}

function Copy-ProjectFile([string]$RelativePath) {
    $source = Join-Path $script:ProjectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { return }
    $destination = Join-Path $script:StageRoot $RelativePath
    $parent = Split-Path -Parent $destination
    New-Item -ItemType Directory -Force -Path $parent | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
}

function Copy-ProjectDirectory([string]$RelativePath) {
    $source = Join-Path $script:ProjectRoot $RelativePath
    if (-not (Test-Path -LiteralPath $source -PathType Container)) { return }
    $destination = Join-Path $script:StageRoot $RelativePath
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Get-ChildItem -LiteralPath $source -Force -Recurse | Where-Object {
        $_.FullName -notmatch '\\(node_modules|\.temp|__pycache__|\.netlify|\.git|dist)\\'
    } | ForEach-Object {
        $relative = $_.FullName.Substring($source.Length).TrimStart('\')
        $target = Join-Path $destination $relative
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $target | Out-Null
        } else {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        }
    }
}

$ProjectRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot 'package.json') -PathType Leaf)) {
    throw 'No se encontro package.json en la raiz indicada.'
}

$safeVersion = ($Version -replace '[^0-9A-Za-z._-]', '')
if ([string]::IsNullOrWhiteSpace($safeVersion)) { throw 'La version del paquete no es valida.' }

$PackageName = "DashboardGeneral_Portable_v$safeVersion"
$OutputRoot = Assert-PathInsideRoot (Join-Path $ProjectRoot 'paquetes_portables')
$StageRoot = Assert-PathInsideRoot (Join-Path $OutputRoot $PackageName)
$ZipPath = Assert-PathInsideRoot (Join-Path $OutputRoot "$PackageName.zip")

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null
if (Test-Path -LiteralPath $StageRoot) { Remove-Item -LiteralPath $StageRoot -Recurse -Force }
if (Test-Path -LiteralPath $ZipPath) { Remove-Item -LiteralPath $ZipPath -Force }
New-Item -ItemType Directory -Force -Path $StageRoot | Out-Null

# Estos son los únicos lanzadores del flujo vigente.
'0_ABRIR_PANEL.bat', '1_INSTALAR_REQUISITOS.bat', '2_ACTUALIZAR_DATOS.bat',
'3_CREAR_PAQUETE_PORTABLE.bat', '4_EJECUTAR_DASHBOARD_WEB.bat',
'.env.example', '.env.supabase.local.example', 'package.json', 'package-lock.json',
'index.html', 'vite.config.js', 'netlify.toml', 'README.md', 'LEEME_PORTABLE.md' |
    ForEach-Object { Copy-ProjectFile $_ }

'piplines', 'shared', 'netlify', 'supabase', 'src', 'public', 'scripts', 'dist' |
    ForEach-Object { Copy-ProjectDirectory $_ }

# La operación se entrega vacía: nunca se transportan Excel ni Parquet históricos.
New-Item -ItemType Directory -Force -Path (Join-Path $StageRoot 'Entrada') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StageRoot 'Salida') | Out-Null
'Entrada\.gitkeep', 'Entrada\LEEME_OPERATIVO.md', 'Salida\.gitkeep' | ForEach-Object { Copy-ProjectFile $_ }

# Verificación explícita: las credenciales privadas no pueden filtrarse al ZIP.
$privateFiles = Get-ChildItem -LiteralPath $StageRoot -Force -Recurse -File | Where-Object {
    $_.Name -in '.env', '.env.supabase.local', 'CREDENCIALES_SUPABASE_LOCAL.txt', 'credenciales.txt', 'ACCESOS_DASHBOARD_POR_ROL.txt'
}
if ($privateFiles) {
    throw "El paquete contiene un archivo privado: $($privateFiles[0].FullName)"
}

Compress-Archive -LiteralPath $StageRoot -DestinationPath $ZipPath -CompressionLevel Optimal -Force
if (-not (Test-Path -LiteralPath $ZipPath -PathType Leaf) -or (Get-Item -LiteralPath $ZipPath).Length -lt 1024) {
    throw 'El archivo ZIP no se pudo validar.'
}

Remove-Item -LiteralPath $StageRoot -Recurse -Force
Write-Host "Paquete creado: $ZipPath"
Write-Host ("Tamano: {0:N1} MB" -f ((Get-Item -LiteralPath $ZipPath).Length / 1MB))
