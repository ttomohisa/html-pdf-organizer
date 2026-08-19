param(
  [switch]$ForceDownload,
  [string]$OutputPath = "",
  [double]$MaxOutputSizeMb = 4.0
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
Set-StrictMode -Version Latest
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TemplatePath = Join-Path $Root "src\index.template.html"
$VersionsPath = Join-Path $Root "versions.json"
$CacheRoot = Join-Path $Root ".cache"
$DistRoot = Join-Path $Root "dist"

if ([string]::IsNullOrWhiteSpace($OutputPath)) {
  $OutputPath = Join-Path $DistRoot "index.html"
} elseif (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
  $OutputPath = Join-Path $Root $OutputPath
}

New-Item -ItemType Directory -Force -Path $CacheRoot, $DistRoot | Out-Null

function Write-Step([string]$Message) {
  Write-Host "[PDF Organizer] $Message" -ForegroundColor Cyan
}

function Get-PackageFileName([string]$PackageName, [string]$Version) {
  $baseName = ($PackageName -split "/")[-1]
  return "$baseName-$Version.tgz"
}

function Get-NpmTarballUrl([string]$PackageName, [string]$Version) {
  $encodedName = $PackageName.Replace("@", "%40").Replace("/", "%2F")
  $fileName = Get-PackageFileName $PackageName $Version
  return "https://registry.npmjs.org/$encodedName/-/$fileName"
}

function Expand-NpmPackage([string]$PackageName, [string]$Version) {
  $packageKey = (($PackageName -replace "[^A-Za-z0-9._-]", "-") + "-" + $Version)
  $packageRoot = Join-Path $CacheRoot $packageKey
  $extractRoot = Join-Path $packageRoot "extracted"
  $packageDir = Join-Path $extractRoot "package"
  $archivePath = Join-Path $packageRoot (Get-PackageFileName $PackageName $Version)

  if ($ForceDownload -and (Test-Path $packageRoot)) {
    Remove-Item -Recurse -Force $packageRoot
  }

  if (-not (Test-Path $packageDir)) {
    New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
    if (-not (Test-Path $archivePath)) {
      $url = Get-NpmTarballUrl $PackageName $Version
      $partialPath = "$archivePath.part"
      Remove-Item -Force -ErrorAction SilentlyContinue $partialPath
      Write-Step "Downloading $PackageName@$Version"
      Invoke-WebRequest -Uri $url -OutFile $partialPath -UseBasicParsing -Headers @{ "User-Agent" = "pdf-organizer-offline-builder/1.0" }
      Move-Item -Force $partialPath $archivePath
    } else {
      Write-Step "Using cached archive for $PackageName@$Version"
    }

    Remove-Item -Recurse -Force -ErrorAction SilentlyContinue $extractRoot
    New-Item -ItemType Directory -Force -Path $extractRoot | Out-Null
    Write-Step "Extracting $PackageName@$Version"
    & tar.exe -xzf $archivePath -C $extractRoot
    if ($LASTEXITCODE -ne 0) { throw "tar.exe failed while extracting $archivePath" }
  }

  if (-not (Test-Path $packageDir)) { throw "The extracted npm package directory was not found: $packageDir" }
  $packageJsonPath = Join-Path $packageDir "package.json"
  if (-not (Test-Path $packageJsonPath)) { throw "package.json was not found in $packageDir" }
  $actualVersion = [string]((Get-Content -Raw -Encoding UTF8 $packageJsonPath | ConvertFrom-Json).version)
  if ($actualVersion -ne $Version) { throw "Expected $PackageName@$Version but the archive contains version $actualVersion" }
  return @{
    Root = $packageDir
    Archive = $archivePath
    ArchiveSha256 = (Get-FileHash -Algorithm SHA256 -Path $archivePath).Hash.ToLowerInvariant()
  }
}

function Get-GzipBase64FromBytes([byte[]]$Bytes) {
  $memory = [System.IO.MemoryStream]::new()
  try {
    $gzip = [System.IO.Compression.GZipStream]::new($memory, [System.IO.Compression.CompressionLevel]::Optimal, $true)
    try {
      $gzip.Write($Bytes, 0, $Bytes.Length)
    } finally {
      $gzip.Dispose()
    }
    return [Convert]::ToBase64String($memory.ToArray())
  } finally {
    $memory.Dispose()
  }
}

function Get-GzipBase64FromUtf8([string]$Text) {
  return Get-GzipBase64FromBytes ([System.Text.Encoding]::UTF8.GetBytes($Text))
}

function Get-GzipBase64FromFile([string]$Path) {
  if (-not (Test-Path $Path)) { throw "Required dependency file not found: $Path" }
  return Get-GzipBase64FromBytes ([System.IO.File]::ReadAllBytes($Path))
}

function Get-MinifiedJavaScript([string]$Path) {
  if (-not (Test-Path $Path)) { throw "Required dependency file not found: $Path" }
  $text = [System.IO.File]::ReadAllText($Path, [System.Text.Encoding]::UTF8)
  # Source map comments are unnecessary in the standalone artifact and may make DevTools look for extra files.
  $text = [regex]::Replace($text, "(?m)^\s*//# sourceMappingURL=.*$", "")
  return $text
}

function Get-EmbeddedAssetPack([string]$PackageRoot, [object[]]$Directories, [object[]]$ExcludedAssets) {
  # Most support files stay independently gzip-compressed so PDF.js can decode them lazily.
  # CMaps are small and highly repetitive, so packing them in groups improves compression
  # without forcing the browser to inflate the whole support-asset set at once.
  $entries = [ordered]@{}
  $bundles = New-Object System.Collections.ArrayList
  $excluded = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($path in $ExcludedAssets) { [void]$excluded.Add(([string]$path).Replace([char]92, [char]47)) }

  $files = New-Object System.Collections.ArrayList
  foreach ($directory in $Directories) {
    $directoryName = [string]$directory
    $fullDirectory = Join-Path $PackageRoot $directoryName
    if (-not (Test-Path $fullDirectory)) {
      Write-Warning "Optional PDF.js asset directory is not present in this version: $directoryName"
      continue
    }
    Get-ChildItem -Path $fullDirectory -File -Recurse |
      Where-Object { $_.Extension -notin @(".map", ".md", ".txt") -and $_.Name -notmatch "^LICENSE" } |
      Sort-Object FullName | ForEach-Object {
      $trimChars = [char[]]@([char]92, [char]47)
      $rootFull = [System.IO.Path]::GetFullPath($PackageRoot).TrimEnd($trimChars)
      $fileFull = [System.IO.Path]::GetFullPath($_.FullName)
      if (-not $fileFull.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Asset path is outside the package root: $fileFull"
      }
      $relative = $fileFull.Substring($rootFull.Length).TrimStart($trimChars).Replace([char]92, [char]47)
      if (-not $excluded.Contains($relative)) {
        [void]$files.Add(@{ Path = $relative; FullName = $_.FullName })
      }
    }
  }

  $cmapFiles = @($files | Where-Object { $_.Path.StartsWith("cmaps/", [System.StringComparison]::OrdinalIgnoreCase) })
  $chunkSize = 12
  for ($start = 0; $start -lt $cmapFiles.Count; $start += $chunkSize) {
    $memory = [System.IO.MemoryStream]::new()
    try {
      $chunkEnd = [Math]::Min($start + $chunkSize, $cmapFiles.Count)
      $bundleIndex = $bundles.Count
      for ($index = $start; $index -lt $chunkEnd; $index++) {
        $item = $cmapFiles[$index]
        $bytes = [System.IO.File]::ReadAllBytes([string]$item.FullName)
        $offset = [int]$memory.Length
        $memory.Write($bytes, 0, $bytes.Length)
        $entries[[string]$item.Path] = @($bundleIndex, $offset, $bytes.Length)
      }
      [void]$bundles.Add((Get-GzipBase64FromBytes $memory.ToArray()))
    } finally {
      $memory.Dispose()
    }
  }

  foreach ($item in $files) {
    $relative = [string]$item.Path
    if ($relative.StartsWith("cmaps/", [System.StringComparison]::OrdinalIgnoreCase)) { continue }
    $entries[$relative] = Get-GzipBase64FromFile ([string]$item.FullName)
  }

  return @{
    Entries = $entries
    Bundles = $bundles.ToArray()
    AssetCount = $entries.Count
    BundleCount = $bundles.Count
    CMapChunkSize = $chunkSize
  }
}


if (-not (Get-Command tar.exe -ErrorAction SilentlyContinue)) {
  throw "tar.exe was not found. Use a current Windows 10/11 environment, or install bsdtar and make tar.exe available in PATH."
}

$versions = Get-Content -Raw -Encoding UTF8 $VersionsPath | ConvertFrom-Json
$pdfLibPackage = Expand-NpmPackage $versions.pdfLib.package $versions.pdfLib.version
$pdfJsPackage = Expand-NpmPackage $versions.pdfJs.package $versions.pdfJs.version

$pdfLibPath = Join-Path $pdfLibPackage.Root ([string]$versions.pdfLib.entry)
$pdfJsPath = Join-Path $pdfJsPackage.Root ([string]$versions.pdfJs.entry)
$pdfWorkerPath = Join-Path $pdfJsPackage.Root ([string]$versions.pdfJs.worker)

$pdfLibSource = Get-MinifiedJavaScript $pdfLibPath
$pdfJsSource = Get-MinifiedJavaScript $pdfJsPath
$pdfWorkerSource = Get-MinifiedJavaScript $pdfWorkerPath

# The distributed browser builds should be self-contained modules. Abort on version changes that introduce relative imports.
foreach ($candidate in @(@{ Name = "PDF.js"; Text = $pdfJsSource }, @{ Name = "PDF.js worker"; Text = $pdfWorkerSource })) {
  if ($candidate.Text -match '(?m)^\s*import\s+.+?from\s+["'']\.{1,2}/' -or $candidate.Text -match 'import\(\s*["'']\.{1,2}/') {
    throw "$($candidate.Name) contains a relative module import. Review the new package layout before embedding this version."
  }
}

Write-Step "Embedding PDF.js support files"
$excludedAssets = @()
if ($null -ne $versions.pdfJs.excludedAssets) { $excludedAssets = @($versions.pdfJs.excludedAssets) }
$assetPack = Get-EmbeddedAssetPack $pdfJsPackage.Root $versions.pdfJs.assetDirectories $excludedAssets
if ($assetPack.AssetCount -eq 0) { throw "No PDF.js support assets were found. Check versions.json and the npm package layout." }
$assetEntriesJson = $assetPack.Entries | ConvertTo-Json -Compress -Depth 4
$assetBundlesJson = $assetPack.Bundles | ConvertTo-Json -Compress -Depth 4

$manifest = [ordered]@{
  build = "offline-v1.2-compact"
  generatedAtUtc = [DateTime]::UtcNow.ToString("o")
  payloadCompression = "gzip"
  dependencies = [ordered]@{
    pdfLib = [ordered]@{
      package = [string]$versions.pdfLib.package
      version = [string]$versions.pdfLib.version
      tarballSha256 = $pdfLibPackage.ArchiveSha256
      embeddedEntry = [string]$versions.pdfLib.entry
      embeddedEntrySha256 = (Get-FileHash -Algorithm SHA256 -Path $pdfLibPath).Hash.ToLowerInvariant()
    }
    pdfJs = [ordered]@{
      package = [string]$versions.pdfJs.package
      version = [string]$versions.pdfJs.version
      tarballSha256 = $pdfJsPackage.ArchiveSha256
      embeddedEntry = [string]$versions.pdfJs.entry
      embeddedWorker = [string]$versions.pdfJs.worker
      embeddedAssetCount = $assetPack.AssetCount
      embeddedAssetCompression = "gzip-per-file+cmap-chunks"
      embeddedAssetBundleCount = $assetPack.BundleCount
      cMapChunkSize = $assetPack.CMapChunkSize
      excludedAssets = @($excludedAssets)
      embeddedEntrySha256 = (Get-FileHash -Algorithm SHA256 -Path $pdfJsPath).Hash.ToLowerInvariant()
      embeddedWorkerSha256 = (Get-FileHash -Algorithm SHA256 -Path $pdfWorkerPath).Hash.ToLowerInvariant()
    }
  }
}
$manifestJson = $manifest | ConvertTo-Json -Compress -Depth 8

Write-Step "Generating standalone HTML"
$template = [System.IO.File]::ReadAllText($TemplatePath, [System.Text.Encoding]::UTF8)
$replacements = [ordered]@{
  "__PDF_LIB_GZIP_BASE64__" = Get-GzipBase64FromUtf8 $pdfLibSource
  "__PDF_JS_GZIP_BASE64__" = Get-GzipBase64FromUtf8 $pdfJsSource
  "__PDF_WORKER_GZIP_BASE64__" = Get-GzipBase64FromUtf8 $pdfWorkerSource
  "__PDF_ASSET_ENTRIES_JSON__" = $assetEntriesJson.Replace("<", "\u003c")
  "__PDF_ASSET_BUNDLES_JSON__" = $assetBundlesJson.Replace("<", "\u003c")
  "__DEPENDENCY_MANIFEST_JSON__" = $manifestJson.Replace("<", "\u003c")
}
foreach ($entry in $replacements.GetEnumerator()) {
  $count = ([regex]::Matches($template, [regex]::Escape($entry.Key))).Count
  if ($count -ne 1) { throw "Template placeholder $($entry.Key) must occur exactly once; found $count." }
  $template = $template.Replace($entry.Key, [string]$entry.Value)
}

$outputDirectory = Split-Path -Parent $OutputPath
New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
[System.IO.File]::WriteAllText($OutputPath, $template, (New-Object System.Text.UTF8Encoding($false)))
$manifestPath = Join-Path $outputDirectory "dependency-manifest.json"
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 8), (New-Object System.Text.UTF8Encoding($false)))
[System.IO.File]::WriteAllText((Join-Path $outputDirectory ".nojekyll"), "", (New-Object System.Text.UTF8Encoding($false)))

$remainingUrls = Select-String -InputObject $template -Pattern '<script[^>]+src\s*=\s*["'']https?://|import\s+.+?from\s+["'']https?://' -AllMatches
if ($remainingUrls) { throw "The generated HTML still contains a runtime external script or module URL." }
if ($template.Contains("__PDF_")) { throw "One or more dependency placeholders remain in the generated HTML." }

$outputHash = (Get-FileHash -Algorithm SHA256 -Path $OutputPath).Hash.ToLowerInvariant()
$outputSizeBytes = (Get-Item $OutputPath).Length
$outputSizeMb = [Math]::Round($outputSizeBytes / 1MB, 2)
Write-Host ""
Write-Host "[OK] Standalone HTML: $OutputPath" -ForegroundColor Green
Write-Host "[OK] Size: $outputSizeMb MB (gzip-compressed embedded payloads)"
Write-Host "[OK] SHA-256: $outputHash"
Write-Host "[OK] Runtime network access is blocked by CSP and the embedded asset loader."

if ($MaxOutputSizeMb -gt 0 -and $outputSizeBytes -gt ($MaxOutputSizeMb * 1MB)) {
  throw "Generated HTML is $outputSizeMb MB, exceeding the configured limit of $MaxOutputSizeMb MB. Review dependency growth or pass -MaxOutputSizeMb 0 to disable this guard."
}
