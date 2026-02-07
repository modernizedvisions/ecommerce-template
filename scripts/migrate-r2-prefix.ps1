param(
  [Parameter(Mandatory = $true)] [string] $DbName,
  [Parameter(Mandatory = $true)] [string] $Bucket,
  [string] $OldPrefix = 'chesapeake-shell/',
  [string] $NewPrefix = 'doverdesign/',
  [switch] $Remote = $true,
  [switch] $DryRun = $false
)

$ErrorActionPreference = 'Stop'

if (-not $OldPrefix.EndsWith('/')) { $OldPrefix = "$OldPrefix/" }
if (-not $NewPrefix.EndsWith('/')) { $NewPrefix = "$NewPrefix/" }

$remoteFlag = if ($Remote) { '--remote' } else { '--local' }

Write-Host "[migrate] db=$DbName bucket=$Bucket old=$OldPrefix new=$NewPrefix remote=$Remote"

$imagesQuery = "SELECT storage_key FROM images WHERE storage_key LIKE '${OldPrefix}%';"
$customOrdersQuery = "SELECT image_storage_key AS storage_key FROM custom_orders WHERE image_storage_key LIKE '${OldPrefix}%';"

$imagesJson = wrangler d1 execute $DbName --command $imagesQuery $remoteFlag --json | ConvertFrom-Json
$customJson = wrangler d1 execute $DbName --command $customOrdersQuery $remoteFlag --json | ConvertFrom-Json

$keys = @()
$keys += $imagesJson[0].results | ForEach-Object { $_.storage_key }
$keys += $customJson[0].results | ForEach-Object { $_.storage_key }
$keys = $keys | Where-Object { $_ -and $_.StartsWith($OldPrefix) } | Sort-Object -Unique

Write-Host "[migrate] keys found: $($keys.Count)"
if ($keys.Count -eq 0) {
  Write-Host "[migrate] no keys to migrate."
  exit 0
}

if ($DryRun) {
  Write-Host "[migrate] dry-run sample:";
  $keys | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" }
  exit 0
}

$failures = @()
$completed = 0

foreach ($key in $keys) {
  $suffix = $key.Substring($OldPrefix.Length)
  $newKey = "$NewPrefix$suffix"

  $temp = New-TemporaryFile
  try {
    wrangler r2 object get "$Bucket/$key" $remoteFlag --file $temp.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $failures += $key
      continue
    }

    wrangler r2 object put "$Bucket/$newKey" $remoteFlag --file $temp.FullName | Out-Null
    if ($LASTEXITCODE -ne 0) {
      $failures += $key
      continue
    }

    $completed++
    if (($completed % 10) -eq 0) {
      Write-Host "[migrate] copied $completed / $($keys.Count)"
    }
  } finally {
    if (Test-Path $temp.FullName) {
      Remove-Item $temp.FullName -Force -ErrorAction SilentlyContinue
    }
  }
}

if ($failures.Count -gt 0) {
  Write-Host "[migrate] failures: $($failures.Count)"
  $failures | ForEach-Object { Write-Host "  $_" }
  Write-Host "[migrate] Aborting DB updates due to copy failures."
  exit 1
}

Write-Host "[migrate] R2 copy complete. Updating D1 references..."

$updateStatements = @(
  "UPDATE images SET storage_key = REPLACE(storage_key, '$OldPrefix', '$NewPrefix'), public_url = REPLACE(public_url, '$OldPrefix', '$NewPrefix') WHERE storage_key LIKE '${OldPrefix}%';",
  "UPDATE custom_orders SET image_storage_key = REPLACE(image_storage_key, '$OldPrefix', '$NewPrefix'), image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_storage_key LIKE '${OldPrefix}%' OR image_url LIKE '%${OldPrefix}%';",
  "UPDATE products SET image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_url LIKE '%${OldPrefix}%';",
  "UPDATE products SET image_urls_json = REPLACE(image_urls_json, '$OldPrefix', '$NewPrefix') WHERE image_urls_json LIKE '%${OldPrefix}%';",
  "UPDATE categories SET image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_url LIKE '%${OldPrefix}%';",
  "UPDATE categories SET hero_image_url = REPLACE(hero_image_url, '$OldPrefix', '$NewPrefix') WHERE hero_image_url LIKE '%${OldPrefix}%';",
  "UPDATE order_items SET image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_url LIKE '%${OldPrefix}%';",
  "UPDATE messages SET image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_url LIKE '%${OldPrefix}%';",
  "UPDATE messages SET inspo_image_url = REPLACE(inspo_image_url, '$OldPrefix', '$NewPrefix') WHERE inspo_image_url LIKE '%${OldPrefix}%';",
  "UPDATE custom_order_examples SET image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_url LIKE '%${OldPrefix}%';",
  "UPDATE product_images SET image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_url LIKE '%${OldPrefix}%';",
  "UPDATE hero_images SET image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_url LIKE '%${OldPrefix}%';",
  "UPDATE gallery_images SET image_url = REPLACE(image_url, '$OldPrefix', '$NewPrefix') WHERE image_url LIKE '%${OldPrefix}%';",
  "UPDATE gallery_images SET url = REPLACE(url, '$OldPrefix', '$NewPrefix') WHERE url LIKE '%${OldPrefix}%';",
  "UPDATE site_content SET json = REPLACE(json, '$OldPrefix', '$NewPrefix') WHERE json LIKE '%${OldPrefix}%';"
)

foreach ($stmt in $updateStatements) {
  wrangler d1 execute $DbName --command $stmt $remoteFlag | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "[migrate] DB update failed for statement: $stmt"
    exit 1
  }
}

Write-Host "[migrate] D1 updates complete."
