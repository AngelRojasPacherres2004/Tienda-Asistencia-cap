<#!
.SYNOPSIS
  Crea una copia portable completa: credenciales autorizadas e histórico técnico.
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

function Copy-DataDirectory([string]$SourcePath, [string]$DestinationRelativePath) {
    if (-not (Test-Path -LiteralPath $SourcePath -PathType Container)) {
        throw "No existe el histórico requerido: $SourcePath"
    }
    $destination = Join-Path $script:StageRoot $DestinationRelativePath
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    Get-ChildItem -LiteralPath $SourcePath -Force -Recurse | ForEach-Object {
        $relative = $_.FullName.Substring($SourcePath.Length).TrimStart('\')
        $target = Join-Path $destination $relative
        if ($_.PSIsContainer) {
            New-Item -ItemType Directory -Force -Path $target | Out-Null
        } else {
            New-Item -ItemType Directory -Force -Path (Split-Path -Parent $target) | Out-Null
            Copy-Item -LiteralPath $_.FullName -Destination $target -Force
        }
    }
}

function Get-Sha256Hex([string]$Path) {
    # Get-FileHash no existe en algunas instalaciones antiguas de Windows
    # PowerShell. Se usa .NET para que la firma sea portable y determinista.
    $algorithm = [System.Security.Cryptography.SHA256]::Create()
    $stream = [System.IO.File]::OpenRead($Path)
    try {
        return (($algorithm.ComputeHash($stream) | ForEach-Object { $_.ToString('x2') }) -join '')
    } finally {
        $stream.Dispose()
        $algorithm.Dispose()
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
$ZipTempPath = Assert-PathInsideRoot (Join-Path $OutputRoot ".${PackageName}.$PID.creando.zip")
$ChecksumPath = Assert-PathInsideRoot (Join-Path $OutputRoot "$PackageName.zip.sha256")
$ChecksumTempPath = Assert-PathInsideRoot (Join-Path $OutputRoot ".${PackageName}.$PID.creando.sha256")
$LockPath = Assert-PathInsideRoot (Join-Path $OutputRoot ".${PackageName}.lock")

New-Item -ItemType Directory -Force -Path $OutputRoot | Out-Null

# Evita que dos clics (o dos terminales) construyan y reemplacen el mismo ZIP
# simultáneamente. New-Item es atómico: solo una ejecución puede crear el lock.
if (Test-Path -LiteralPath $LockPath -PathType Leaf) {
    $owner = (Get-Content -LiteralPath $LockPath -Raw -ErrorAction SilentlyContinue).Trim()
    $active = $false
    if ($owner -match '^\d+$') {
        $active = $null -ne (Get-Process -Id ([int]$owner) -ErrorAction SilentlyContinue)
    }
    if ($active) {
        throw "Ya se está creando $PackageName (proceso $owner). Espera a que termine antes de volver a pulsar el botón."
    }
    Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
}
try {
    New-Item -ItemType File -Path $LockPath -ErrorAction Stop | Out-Null
} catch {
    throw "No se pudo reservar $PackageName para crear el ZIP. Espera unos segundos y vuelve a intentarlo."
}
Set-Content -LiteralPath $LockPath -Value $PID -Encoding ascii
$lockCreated = $true
trap {
    Remove-Item -LiteralPath $ZipTempPath -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $ChecksumTempPath -Force -ErrorAction SilentlyContinue
    if ($lockCreated) { Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue }
    throw $_
}

if (Test-Path -LiteralPath $StageRoot) { Remove-Item -LiteralPath $StageRoot -Recurse -Force }
Remove-Item -LiteralPath $ZipTempPath -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $ChecksumTempPath -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $StageRoot | Out-Null

# Estos son los lanzadores del flujo portable vigente.
'0_ABRIR_PANEL.bat', '1_INSTALAR_REQUISITOS.bat', '2_ACTUALIZAR_DATOS.bat',
'3_CREAR_PAQUETE_PORTABLE.bat', '4_EJECUTAR_DASHBOARD_WEB.bat', '5_PUBLICAR_WEB.bat',
'.env', '.env.example', '.env.supabase.local.example', 'package.json', 'package-lock.json',
'index.html', 'vite.config.js', 'netlify.toml', 'README.md', 'LEEME_PORTABLE.md' |
    ForEach-Object { Copy-ProjectFile $_ }

'piplines', 'shared', 'netlify', 'supabase', 'src', 'public', 'scripts', 'dist' |
    ForEach-Object { Copy-ProjectDirectory $_ }

# Los Excel RMS se cargan por período; no se requieren Excel antiguos. El
# histórico requerido para reconstruir el dashboard sí viaja dentro del ZIP.
New-Item -ItemType Directory -Force -Path (Join-Path $StageRoot 'Entrada') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $StageRoot 'Salida') | Out-Null
'Entrada\.gitkeep', 'Entrada\LEEME_OPERATIVO.md', 'Salida\.gitkeep' | ForEach-Object { Copy-ProjectFile $_ }

# Se prefiere la base activa; el respaldo técnico permite crear el primer ZIP
# completo sin volver a procesar los Excel históricos.
$Capa1Source = Join-Path $ProjectRoot 'capa1'
if (-not (Test-Path -LiteralPath (Join-Path $Capa1Source 'Fact_Ventas.parquet') -PathType Leaf)) {
    $Capa1Source = Join-Path $ProjectRoot '.retirado_legacy\capa1'
}
$Capa2Source = Join-Path $ProjectRoot 'capa2'
if (-not (Test-Path -LiteralPath (Join-Path $Capa2Source 'FactVentas.parquet') -PathType Leaf)) {
    $Capa2Source = Join-Path $ProjectRoot '.retirado_legacy\capa2'
}

foreach ($name in 'Fact_Ventas.parquet', 'Fact_Ingresos.parquet', 'Fact_Transferencias.parquet', 'Fact_Stock.parquet') {
    if (-not (Test-Path -LiteralPath (Join-Path $Capa1Source $name) -PathType Leaf)) {
        throw "Falta $name en Capa 1. No se crea un ZIP incompleto."
    }
}
foreach ($name in 'FactVentas.parquet', 'FactIngresos.parquet', 'FactTransferencias.parquet', 'FactStock.parquet') {
    if (-not (Test-Path -LiteralPath (Join-Path $Capa2Source $name) -PathType Leaf)) {
        throw "Falta $name en Capa 2. No se crea un ZIP incompleto."
    }
}
if (-not (Test-Path -LiteralPath (Join-Path $ProjectRoot '.env') -PathType Leaf)) {
    throw 'Falta .env: el ZIP completo necesita las credenciales privadas autorizadas.'
}

Copy-DataDirectory $Capa1Source 'capa1'
Copy-DataDirectory $Capa2Source 'capa2'

if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
    throw 'No se encontró tar.exe de Windows; no se puede crear un ZIP íntegro de este tamaño.'
}

# Compress-Archive ha generado ZIP truncados con históricos grandes en algunas
# instalaciones de Windows. libarchive (tar.exe) produce ZIP64 de forma estable.
# El ZIP se crea primero con un nombre temporal invisible para el operador: el
# archivo final no aparece ni se puede copiar hasta que se haya leído completo.
& tar.exe -a -c -f $ZipTempPath -C $OutputRoot $PackageName
if ($LASTEXITCODE -ne 0) { throw 'tar.exe no pudo crear el paquete ZIP.' }
if (-not (Test-Path -LiteralPath $ZipTempPath -PathType Leaf) -or (Get-Item -LiteralPath $ZipTempPath).Length -lt 1024) {
    throw 'El archivo ZIP no se pudo crear.'
}

# La validación debe leer todos los streams, no solo listar sus nombres: así se
# detecta cualquier "final inesperado del archivo" antes de entregar el ZIP.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = $null
try {
    $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipTempPath)
    if ($archive.Entries.Count -lt 10) { throw 'El ZIP no contiene los archivos esperados.' }
    $buffer = New-Object byte[] (1024 * 1024)
    foreach ($entry in $archive.Entries) {
        $stream = $entry.Open()
        try {
            while ($stream.Read($buffer, 0, $buffer.Length) -gt 0) { }
        } finally {
            $stream.Dispose()
        }
    }
} catch {
    Remove-Item -LiteralPath $ZipTempPath -Force -ErrorAction SilentlyContinue
    throw "El ZIP quedó incompleto o corrupto: $($_.Exception.Message)"
} finally {
    if ($null -ne $archive) { $archive.Dispose() }
}

# El ZIP y su firma se preparan temporalmente. Ambos se publican recién tras
# validar todos los bytes, para impedir que se copie un archivo a medio crear.
$hash = Get-Sha256Hex $ZipTempPath
Set-Content -LiteralPath $ChecksumTempPath -Value "${hash} *${PackageName}.zip" -Encoding ascii

# La sustitución es atómica dentro de la misma carpeta. Un ZIP anterior se
# mantiene intacto si la nueva creación o su verificación llegaran a fallar.
Move-Item -LiteralPath $ZipTempPath -Destination $ZipPath -Force
Move-Item -LiteralPath $ChecksumTempPath -Destination $ChecksumPath -Force
Remove-Item -LiteralPath $StageRoot -Recurse -Force
$lockCreated = $false
Remove-Item -LiteralPath $LockPath -Force -ErrorAction SilentlyContinue
Write-Host "Paquete creado: $ZipPath"
Write-Host ("Tamano: {0:N1} MB" -f ((Get-Item -LiteralPath $ZipPath).Length / 1MB))
Write-Host "Integridad SHA-256: $ChecksumPath"
