[CmdletBinding()]
param(
  [ValidateSet('Success', 'ConnectionFailure', 'RecoverySuccess', 'FailureRecovery')]
  [string]$Mode = 'Success'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$docker = (Get-Command docker -ErrorAction Stop).Source
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$migrationsPath = Join-Path $repoRoot 'apps\api\prisma\migrations'
$dockerfilePath = Join-Path $repoRoot 'apps\api\Dockerfile'
$runId = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$taskSlug = if ($Mode -eq 'Success') { 'a21b6c1' } else { 'a21b6c2' }
$prefix = "pispiar-$taskSlug-$runId"
$networkName = "$prefix-net"
$ownershipCanaryNetwork = "$prefix-ownership-canary"
$ownershipCanaryRunId = [Guid]::NewGuid().ToString('N').Substring(0, 12)
$databaseContainer = "$prefix-db"
$migratorImage = "$prefix-migrator:local"
$databaseUser = "migrator_$runId"
$databaseName = "migrations_$runId"
$passwordBytes = [byte[]]::new(24)
[Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
$databasePassword = [Convert]::ToHexString($passwordBytes).ToLowerInvariant()
$databaseUrl = "postgresql://${databaseUser}:${databasePassword}@database:5432/${databaseName}?schema=public"
$runLabel = 'io.pispiar.run'
$taskLabel = 'io.pispiar.task'
$taskValue = if ($Mode -eq 'Success') { 'A-21B.6c.1' } else { 'A-21B.6c.2' }
$sensitiveValues = @($databaseUrl, $databasePassword, $databaseUser, $databaseName)

$networkCreationAttempted = $false
$ownershipCanaryCreationAttempted = $false
$databaseCreationAttempted = $false
$imageCreated = $false
$ownedTransientContainers = [Collections.Generic.List[string]]::new()
$cleanupErrors = [Collections.Generic.List[string]]::new()
$failure = $null
$cleanupSucceeded = $false
$connectionFailureObserved = $false
$ownershipSafetyVerified = $false
$expectedMigrations = @()
$firstMigrationMs = 0L
$secondMigrationMs = 0L
$totalStopwatch = [Diagnostics.Stopwatch]::StartNew()

function Protect-Text {
  param([AllowEmptyString()][string]$Text)

  $sanitized = $Text
  foreach ($value in $script:sensitiveValues) {
    if (-not [string]::IsNullOrEmpty($value)) {
      $sanitized = $sanitized.Replace($value, '[REDACTADO]')
    }
  }
  return $sanitized
}

function Invoke-DockerCapture {
  param([Parameter(Mandatory)][string[]]$Arguments)

  $output = & $script:docker @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    $message = ($output | ForEach-Object { $_.ToString() }) -join "`n"
    throw (Protect-Text "Docker falló: $message")
  }
  return (($output | ForEach-Object { $_.ToString() }) -join "`n").Trim()
}

function Invoke-DockerWithEnvironment {
  param(
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][hashtable]$Environment
  )

  $startInfo = [Diagnostics.ProcessStartInfo]::new()
  $startInfo.FileName = $script:docker
  $startInfo.UseShellExecute = $false
  $startInfo.RedirectStandardOutput = $true
  $startInfo.RedirectStandardError = $true
  foreach ($argument in $Arguments) {
    [void]$startInfo.ArgumentList.Add($argument)
  }
  foreach ($entry in $Environment.GetEnumerator()) {
    $startInfo.Environment[$entry.Key] = $entry.Value
  }

  $process = [Diagnostics.Process]::new()
  $process.StartInfo = $startInfo
  [void]$process.Start()
  $stdoutTask = $process.StandardOutput.ReadToEndAsync()
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.WaitForExit()
  $stdout = $stdoutTask.GetAwaiter().GetResult()
  $stderr = $stderrTask.GetAwaiter().GetResult()
  if ($process.ExitCode -ne 0) {
    throw (Protect-Text "Docker falló: $stderr`n$stdout")
  }
  return $stdout.Trim()
}

function Test-DockerResource {
  param(
    [Parameter(Mandatory)][ValidateSet('container', 'image', 'network')][string]$Type,
    [Parameter(Mandatory)][string]$Name
  )

  & $script:docker $Type inspect $Name *> $null
  return $LASTEXITCODE -eq 0
}

function Assert-Equal {
  param(
    [Parameter(Mandatory)][AllowNull()]$Actual,
    [Parameter(Mandatory)]$Expected,
    [Parameter(Mandatory)][string]$Description
  )

  if ($Actual -cne $Expected) {
    throw "Verificación fallida: $Description."
  }
}

function ConvertTo-Lines {
  param([AllowEmptyString()][string]$Text)

  return @($Text -split "`r?`n" | Where-Object { $_ -ne '' })
}

function Assert-LinesEqual {
  param(
    [Parameter(Mandatory)][AllowNull()][AllowEmptyCollection()][string[]]$Actual,
    [Parameter(Mandatory)][string[]]$Expected,
    [Parameter(Mandatory)][string]$Description
  )

  $actualText = $Actual -join "`n"
  $expectedText = $Expected -join "`n"
  if ($actualText -cne $expectedText) {
    throw "Verificación fallida: $Description."
  }
}

function Invoke-Psql {
  param([Parameter(Mandatory)][string]$Sql)

  return Invoke-DockerCapture @(
    'exec', $script:databaseContainer,
    'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-U', $script:databaseUser,
    '-d', $script:databaseName, '-Atqc', $Sql
  )
}

function Remove-OwnedContainer {
  param([Parameter(Mandatory)][string]$Name)

  if (-not (Test-DockerResource -Type container -Name $Name)) {
    return
  }
  $label = Invoke-DockerCapture @(
    'container', 'inspect', '--format', "{{ index .Config.Labels `"$script:runLabel`" }}", $Name
  )
  if ($label -cne $script:runId) {
    throw "Se rechazó eliminar un contenedor sin ownership de esta corrida."
  }
  & $script:docker container rm --force --volumes $Name *> $null
  if ($LASTEXITCODE -ne 0) {
    throw "No se pudo eliminar un contenedor propio de la prueba."
  }
}

function Remove-NetworkWithOwnership {
  param(
    [Parameter(Mandatory)][string]$Name,
    [Parameter(Mandatory)][string]$ExpectedRunId
  )

  if (-not (Test-DockerResource -Type network -Name $Name)) {
    return
  }
  $label = Invoke-DockerCapture @(
    'network', 'inspect', '--format', "{{ index .Labels `"$script:runLabel`" }}", $Name
  )
  if ($label -cne $ExpectedRunId) {
    throw 'Se rechazó eliminar una red sin el ownership exacto esperado.'
  }
  & $script:docker network rm $Name *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'No se pudo eliminar una red propia de la prueba.'
  }
}

if ($Mode -eq 'FailureRecovery') {
  Write-Host 'ESCENARIO=FALLO_DE_CONEXION_Y_CLEANUP'
  & pwsh -NoProfile -File $PSCommandPath -Mode ConnectionFailure
  if ($LASTEXITCODE -ne 0) {
    throw 'El escenario controlado de fallo de conexión no cumplió sus aserciones.'
  }

  Write-Host 'ESCENARIO=REINTENTO_EN_AMBIENTE_NUEVO'
  & pwsh -NoProfile -File $PSCommandPath -Mode RecoverySuccess
  if ($LASTEXITCODE -ne 0) {
    throw 'El reintento sobre un ambiente nuevo no completó correctamente.'
  }

  Write-Host 'FAILURE_RECOVERY=OK'
  return
}

try {
  $context = Invoke-DockerCapture @('context', 'show')
  Assert-Equal -Actual $context -Expected 'desktop-linux' -Description 'contexto Docker Desktop local'
  $serverOs = Invoke-DockerCapture @('version', '--format', '{{.Server.Os}}')
  Assert-Equal -Actual $serverOs -Expected 'linux' -Description 'engine Docker Linux'
  $dockerOs = Invoke-DockerCapture @('info', '--format', '{{.OperatingSystem}}')
  if ($dockerOs -notmatch 'Docker Desktop') {
    throw 'El engine activo no se identifica como Docker Desktop.'
  }

  $expectedMigrations = @(
    Get-ChildItem -LiteralPath $migrationsPath -Directory |
      Sort-Object Name |
      Select-Object -ExpandProperty Name
  )
  if ($expectedMigrations.Count -eq 0) {
    throw 'No se encontraron migraciones versionadas.'
  }
  foreach ($migration in $expectedMigrations) {
    $sqlPath = Join-Path $migrationsPath "$migration\migration.sql"
    if (-not (Test-Path -LiteralPath $sqlPath -PathType Leaf)) {
      throw 'Una migración versionada no contiene migration.sql.'
    }
  }

  foreach ($resource in @(
    @{ Type = 'network'; Name = $networkName },
    @{ Type = 'network'; Name = $ownershipCanaryNetwork },
    @{ Type = 'container'; Name = $databaseContainer },
    @{ Type = 'image'; Name = $migratorImage }
  )) {
    if (Test-DockerResource -Type $resource.Type -Name $resource.Name) {
      throw 'Colisión inesperada con un recurso Docker preexistente; prueba abortada.'
    }
  }

  Write-Host 'Construyendo imagen migradora aislada...'
  $imageCreated = $true
  $buildArguments = @(
    'build', '--progress=plain', '--target', 'migrator',
    '--label', "$runLabel=$runId", '--label', "$taskLabel=$taskValue",
    '-f', $dockerfilePath,
    '-t', $migratorImage, $repoRoot
  )
  & $docker @buildArguments
  if ($LASTEXITCODE -ne 0) {
    throw 'Falló la construcción de la imagen migradora.'
  }

  # Docker puede crear un recurso aunque el comando devuelva un error.
  $networkCreationAttempted = $true
  [void](Invoke-DockerCapture @(
    'network', 'create', '--internal',
    '--label', "$runLabel=$runId", '--label', "$taskLabel=$taskValue", $networkName
  ))

  $databaseCreationAttempted = $true
  [void](Invoke-DockerWithEnvironment -Arguments @(
    'run', '--detach', '--name', $databaseContainer,
    '--network', $networkName, '--network-alias', 'database',
    '--label', "$runLabel=$runId", '--label', "$taskLabel=$taskValue",
    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=512m',
    '--env', 'POSTGRES_USER', '--env', 'POSTGRES_PASSWORD', '--env', 'POSTGRES_DB',
    'pgvector/pgvector:pg16'
  ) -Environment @{
    POSTGRES_USER = $databaseUser
    POSTGRES_PASSWORD = $databasePassword
    POSTGRES_DB = $databaseName
  })

  $ready = $false
  for ($attempt = 1; $attempt -le 60; $attempt++) {
    & $docker exec $databaseContainer pg_isready -U $databaseUser -d $databaseName *> $null
    if ($LASTEXITCODE -eq 0) {
      $ready = $true
      break
    }
    Start-Sleep -Seconds 1
  }
  if (-not $ready) {
    throw 'PostgreSQL descartable no quedó listo dentro del plazo esperado.'
  }

  Write-Host 'Verificando aislamiento y base vacía...'
  $portBindings = Invoke-DockerCapture @(
    'container', 'inspect', '--format', '{{json .HostConfig.PortBindings}}', $databaseContainer
  )
  if ($portBindings -notin @('null', '{}')) {
    throw 'El PostgreSQL descartable publicó puertos al host.'
  }
  $tmpfsJson = Invoke-DockerCapture @(
    'container', 'inspect', '--format', '{{json .HostConfig.Tmpfs}}', $databaseContainer
  )
  $tmpfsConfig = $tmpfsJson | ConvertFrom-Json -AsHashtable
  if ($tmpfsConfig.Count -ne 1 -or -not $tmpfsConfig.ContainsKey('/var/lib/postgresql/data')) {
    throw 'El PostgreSQL descartable no usa exclusivamente el tmpfs esperado.'
  }
  $tmpfsOptions = $tmpfsConfig['/var/lib/postgresql/data']
  foreach ($option in @('rw', 'noexec', 'nosuid', 'size=')) {
    if ($tmpfsOptions -notmatch [regex]::Escape($option)) {
      throw 'El tmpfs de PostgreSQL no tiene las opciones de aislamiento esperadas.'
    }
  }
  $volumeMounts = @(ConvertTo-Lines (Invoke-DockerCapture @(
    'container', 'inspect', '--format',
    '{{range .Mounts}}{{if eq .Type "volume"}}{{println .Name}}{{end}}{{end}}',
    $databaseContainer
  )))
  Assert-Equal -Actual $volumeMounts.Count -Expected 0 -Description 'ausencia de volúmenes Docker'
  $networkInternal = Invoke-DockerCapture @(
    'network', 'inspect', '--format', '{{.Internal}}', $networkName
  )
  Assert-Equal -Actual $networkInternal -Expected 'true' -Description 'red Docker interna'
  $networkContainers = Invoke-DockerCapture @(
    'network', 'inspect', '--format', '{{len .Containers}}', $networkName
  )
  Assert-Equal -Actual $networkContainers -Expected '1' -Description 'uso exclusivo de la red'

  Assert-Equal -Actual (Invoke-Psql 'SELECT current_database();') `
    -Expected $databaseName -Description 'base objetivo de la corrida'
  Assert-Equal -Actual (Invoke-Psql 'SELECT current_user;') `
    -Expected $databaseUser -Description 'rol objetivo de la corrida'
  Assert-Equal -Actual (Invoke-Psql 'SELECT pg_get_userbyid(datdba) = current_user FROM pg_database WHERE datname = current_database();') `
    -Expected 't' -Description 'ownership de la base objetivo'
  Assert-Equal -Actual (Invoke-Psql "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');") `
    -Expected '0' -Description 'base inicialmente vacía'
  Assert-Equal -Actual (Invoke-Psql "SELECT to_regclass('public._prisma_migrations') IS NULL;") `
    -Expected 't' -Description 'ausencia de historial Prisma previo'

  if ($Mode -eq 'ConnectionFailure') {
    Write-Host 'Verificando rechazo de cleanup sin ownership exacto...'
    $ownershipCanaryCreationAttempted = $true
    [void](Invoke-DockerCapture @(
      'network', 'create', '--internal',
      '--label', "$runLabel=$ownershipCanaryRunId", '--label', "$taskLabel=$taskValue",
      $ownershipCanaryNetwork
    ))
    $ownershipRejectionObserved = $false
    try {
      Remove-NetworkWithOwnership -Name $ownershipCanaryNetwork -ExpectedRunId $runId
    }
    catch {
      if ($_.Exception.Message -notmatch 'ownership exacto') {
        throw
      }
      $ownershipRejectionObserved = $true
    }
    if (-not $ownershipRejectionObserved -or
      -not (Test-DockerResource -Type network -Name $ownershipCanaryNetwork)) {
      throw 'El control de ownership no rechazó la eliminación del recurso canary.'
    }
    Remove-NetworkWithOwnership -Name $ownershipCanaryNetwork `
      -ExpectedRunId $ownershipCanaryRunId
    $ownershipCanaryCreationAttempted = $false
    $ownershipSafetyVerified = $true

    Write-Host 'Provocando fallo controlado de autenticación...'
    $invalidPasswordBytes = [byte[]]::new(24)
    [Security.Cryptography.RandomNumberGenerator]::Fill($invalidPasswordBytes)
    $invalidPassword = [Convert]::ToHexString($invalidPasswordBytes).ToLowerInvariant()
    $invalidDatabaseUrl = "postgresql://${databaseUser}:${invalidPassword}@database:5432/${databaseName}?schema=public"
    $sensitiveValues += @($invalidPassword, $invalidDatabaseUrl)
    $failureContainer = "$prefix-connection-failure"
    $ownedTransientContainers.Add($failureContainer)
    try {
      [void](Invoke-DockerWithEnvironment -Arguments @(
        'run', '--rm', '--name', $failureContainer, '--network', $networkName,
        '--label', "$runLabel=$runId", '--label', "$taskLabel=$taskValue",
        '--env', 'DATABASE_URL', $migratorImage, 'migrate', 'deploy'
      ) -Environment @{ DATABASE_URL = $invalidDatabaseUrl })
      throw 'El migrador aceptó credenciales intencionalmente inválidas.'
    }
    catch {
      $connectionError = Protect-Text $_.Exception.Message
      if ($connectionError -notmatch '(?i)(P1000|authentication failed|password authentication failed)') {
        throw "El fallo del migrador no fue el error de autenticación esperado: $connectionError"
      }
      $connectionFailureObserved = $true
    }
    Assert-Equal -Actual (Invoke-Psql "SELECT to_regclass('public._prisma_migrations') IS NULL;") `
      -Expected 't' -Description 'base intacta después del fallo de conexión'
  }
  else {
    Write-Host 'Aplicando migraciones en la base descartable...'
  $firstContainer = "$prefix-migrate-1"
  $ownedTransientContainers.Add($firstContainer)
  $firstStopwatch = [Diagnostics.Stopwatch]::StartNew()
  [void](Invoke-DockerWithEnvironment -Arguments @(
    'run', '--rm', '--name', $firstContainer, '--network', $networkName,
    '--label', "$runLabel=$runId", '--label', "$taskLabel=$taskValue",
    '--env', 'DATABASE_URL', $migratorImage, 'migrate', 'deploy'
  ) -Environment @{ DATABASE_URL = $databaseUrl })
  $firstStopwatch.Stop()
  $firstMigrationMs = $firstStopwatch.ElapsedMilliseconds

  Write-Host 'Verificando schema migrado...'
  $appliedMigrations = ConvertTo-Lines (Invoke-Psql @'
SELECT migration_name
FROM "_prisma_migrations"
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
ORDER BY migration_name;
'@)
  Assert-LinesEqual -Actual $appliedMigrations -Expected $expectedMigrations `
    -Description 'migraciones aplicadas'
  Assert-Equal -Actual (Invoke-Psql 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL OR checksum = '''' OR applied_steps_count <= 0;') `
    -Expected '0' -Description 'migraciones fallidas o inconclusas'

  Assert-LinesEqual -Actual (ConvertTo-Lines (Invoke-Psql "SELECT extname FROM pg_extension WHERE extname IN ('unaccent', 'vector') ORDER BY extname;")) `
    -Expected @('unaccent', 'vector') -Description 'extensiones requeridas'
  Assert-Equal -Actual (Invoke-Psql "SELECT count(*) FROM pg_ts_config c JOIN pg_namespace n ON n.oid = c.cfgnamespace WHERE n.nspname = 'public' AND c.cfgname = 'es_unaccent';") `
    -Expected '1' -Description 'configuración de búsqueda es_unaccent'

  $requiredTables = @(
    '_prisma_migrations', 'areas', 'chunks', 'conversations', 'document_conflict_alerts',
    'document_versions', 'documents', 'execution_steps', 'executions', 'messages',
    'procedure_versions', 'procedures', 'sessions', 'steps', 'user_invitations', 'users'
  ) | Sort-Object
  $tableList = "'" + ($requiredTables -join "','") + "'"
  $actualTables = ConvertTo-Lines (Invoke-Psql "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ($tableList) ORDER BY tablename;")
  Assert-LinesEqual -Actual $actualTables -Expected $requiredTables -Description 'tablas clave'

  $requiredIndexes = @(
    'chunks_area_ids_idx:gin',
    'chunks_content_fts_es_unaccent_idx:gin',
    'chunks_content_fts_idx:gin',
    'chunks_content_tsv_idx:gin',
    'chunks_embedding_idx:hnsw'
  ) | Sort-Object
  $indexNames = "'" + (($requiredIndexes | ForEach-Object { ($_ -split ':')[0] }) -join "','") + "'"
  $actualIndexes = ConvertTo-Lines (Invoke-Psql "SELECT idx.relname || ':' || am.amname FROM pg_index i JOIN pg_class idx ON idx.oid = i.indexrelid JOIN pg_am am ON am.oid = idx.relam WHERE idx.relname IN ($indexNames) ORDER BY idx.relname;")
  Assert-LinesEqual -Actual $actualIndexes -Expected $requiredIndexes -Description 'índices HNSW y GIN'

  $requiredConstraints = @(
    'chunks_document_version_id_fkey:f',
    'document_conflict_alerts_occurrences_check:c',
    'document_conflict_alerts_pair_order_check:c',
    'document_conflict_alerts_resolution_check:c'
  ) | Sort-Object
  $constraintNames = "'" + (($requiredConstraints | ForEach-Object { ($_ -split ':')[0] }) -join "','") + "'"
  $actualConstraints = ConvertTo-Lines (Invoke-Psql "SELECT conname || ':' || contype::text FROM pg_constraint WHERE conname IN ($constraintNames) ORDER BY conname;")
  Assert-LinesEqual -Actual $actualConstraints -Expected $requiredConstraints -Description 'constraints clave'

  Assert-LinesEqual -Actual (ConvertTo-Lines (Invoke-Psql @'
SELECT a.attname || ':' || format_type(a.atttypid, a.atttypmod) || ':' || a.attgenerated::text
FROM pg_attribute a
WHERE a.attrelid = 'public.chunks'::regclass
  AND a.attname IN ('content_tsv', 'embedding')
ORDER BY a.attname;
'@)) -Expected @('content_tsv:tsvector:s', 'embedding:vector(768):') `
    -Description 'tipos vector y tsvector generado'

  $historyBeforeSecondRun = ConvertTo-Lines (Invoke-Psql @'
SELECT migration_name || '|' || checksum || '|'
  || (finished_at IS NOT NULL)::text || '|'
  || (rolled_back_at IS NULL)::text || '|'
  || applied_steps_count::text
FROM "_prisma_migrations"
ORDER BY migration_name;
'@)
  $secondContainer = "$prefix-migrate-2"
  $ownedTransientContainers.Add($secondContainer)
  $secondStopwatch = [Diagnostics.Stopwatch]::StartNew()
  [void](Invoke-DockerWithEnvironment -Arguments @(
    'run', '--rm', '--name', $secondContainer, '--network', $networkName,
    '--label', "$runLabel=$runId", '--label', "$taskLabel=$taskValue",
    '--env', 'DATABASE_URL', $migratorImage, 'migrate', 'deploy'
  ) -Environment @{ DATABASE_URL = $databaseUrl })
  $secondStopwatch.Stop()
  $secondMigrationMs = $secondStopwatch.ElapsedMilliseconds

  $migrationsAfterSecondRun = ConvertTo-Lines (Invoke-Psql @'
SELECT migration_name
FROM "_prisma_migrations"
WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL
ORDER BY migration_name;
'@)
  Assert-LinesEqual -Actual $migrationsAfterSecondRun -Expected $expectedMigrations `
    -Description 'idempotencia del segundo migrate deploy'
  $historyAfterSecondRun = ConvertTo-Lines (Invoke-Psql @'
SELECT migration_name || '|' || checksum || '|'
  || (finished_at IS NOT NULL)::text || '|'
  || (rolled_back_at IS NULL)::text || '|'
  || applied_steps_count::text
FROM "_prisma_migrations"
ORDER BY migration_name;
'@)
  Assert-LinesEqual -Actual $historyAfterSecondRun -Expected $historyBeforeSecondRun `
    -Description 'historial Prisma con nombres, checksums y estado sin cambios'
  Assert-Equal -Actual (Invoke-Psql 'SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NULL OR rolled_back_at IS NOT NULL OR checksum = '''' OR applied_steps_count <= 0;') `
    -Expected '0' -Description 'estado final del historial Prisma'
  }
}
catch {
  $failure = Protect-Text $_.Exception.Message
}
finally {
  foreach ($container in $ownedTransientContainers) {
    try {
      Remove-OwnedContainer -Name $container
    }
    catch {
      $cleanupErrors.Add((Protect-Text $_.Exception.Message))
    }
  }
  if ($databaseCreationAttempted) {
    try {
      Remove-OwnedContainer -Name $databaseContainer
    }
    catch {
      $cleanupErrors.Add((Protect-Text $_.Exception.Message))
    }
  }
  if ($ownershipCanaryCreationAttempted) {
    try {
      Remove-NetworkWithOwnership -Name $ownershipCanaryNetwork `
        -ExpectedRunId $ownershipCanaryRunId
    }
    catch {
      $cleanupErrors.Add((Protect-Text $_.Exception.Message))
    }
  }
  if ($networkCreationAttempted) {
    try {
      Remove-NetworkWithOwnership -Name $networkName -ExpectedRunId $runId
    }
    catch {
      $cleanupErrors.Add((Protect-Text $_.Exception.Message))
    }
  }
  if ($imageCreated) {
    try {
      if (Test-DockerResource -Type image -Name $migratorImage) {
        $label = Invoke-DockerCapture @(
          'image', 'inspect', '--format', "{{ index .Config.Labels `"$runLabel`" }}", $migratorImage
        )
        if ($label -cne $runId) {
          throw 'Se rechazó eliminar una imagen sin ownership de esta corrida.'
        }
        & $docker image rm $migratorImage *> $null
        if ($LASTEXITCODE -ne 0) {
          throw 'No se pudo eliminar la imagen propia de la prueba.'
        }
      }
    }
    catch {
      $cleanupErrors.Add((Protect-Text $_.Exception.Message))
    }
  }

  foreach ($resource in @(
    @{ Type = 'container'; Name = $databaseContainer },
    @{ Type = 'network'; Name = $networkName },
    @{ Type = 'network'; Name = $ownershipCanaryNetwork },
    @{ Type = 'image'; Name = $migratorImage }
  )) {
    if (Test-DockerResource -Type $resource.Type -Name $resource.Name) {
      $cleanupErrors.Add("Quedó un recurso propio sin limpiar: $($resource.Type).")
    }
  }
  foreach ($container in $ownedTransientContainers) {
    if (Test-DockerResource -Type container -Name $container) {
      $cleanupErrors.Add('Quedó un contenedor transitorio propio sin limpiar.')
    }
  }

  $cleanupSucceeded = $cleanupErrors.Count -eq 0
  $totalStopwatch.Stop()
}

if ($cleanupErrors.Count -gt 0) {
  throw ("La limpieza segura falló: " + ($cleanupErrors -join ' | '))
}
if ($null -ne $failure) {
  throw $failure
}

if ($Mode -eq 'ConnectionFailure') {
  if (-not $connectionFailureObserved -or -not $ownershipSafetyVerified) {
    throw 'El escenario esperado no produjo todas sus evidencias.'
  }
  Write-Host 'RESULTADO=FALLO_CONTROLADO_OK'
  Write-Host 'CONNECTION_FAILURE=EXPECTED'
  Write-Host 'OWNERSHIP_SAFETY=OK'
  Write-Host "DURACION_TOTAL_MS=$($totalStopwatch.ElapsedMilliseconds)"
  Write-Host "LIMPIEZA=$(if ($cleanupSucceeded) { 'OK' } else { 'FALLO' })"
  return
}

Write-Host 'RESULTADO=OK'
Write-Host "MIGRACIONES=$($expectedMigrations.Count)"
Write-Host 'EXTENSIONES=vector,unaccent'
Write-Host 'INDICES=HNSW+GIN OK'
Write-Host 'IDEMPOTENCIA=OK'
Write-Host 'HISTORIAL_IDEMPOTENTE=NOMBRES+CHECKSUMS+ESTADO OK'
if ($Mode -eq 'RecoverySuccess') {
  Write-Host 'RETRY=OK'
}
Write-Host "PRIMER_MIGRATE_MS=$firstMigrationMs"
Write-Host "SEGUNDO_MIGRATE_MS=$secondMigrationMs"
Write-Host "DURACION_TOTAL_MS=$($totalStopwatch.ElapsedMilliseconds)"
Write-Host "LIMPIEZA=$(if ($cleanupSucceeded) { 'OK' } else { 'FALLO' })"
