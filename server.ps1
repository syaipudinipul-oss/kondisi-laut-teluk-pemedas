param(
    [int]$Port = 4173
)

$ErrorActionPreference = 'Stop'
$siteRoot = [System.IO.Path]::GetFullPath($PSScriptRoot)
$siteBoundary = $siteRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
$listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $Port)

function Get-ContentType([string]$Path) {
    switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
        '.html' { return 'text/html; charset=utf-8' }
        '.css'  { return 'text/css; charset=utf-8' }
        '.js'   { return 'application/javascript; charset=utf-8' }
        '.json' { return 'application/json; charset=utf-8' }
        '.svg'  { return 'image/svg+xml' }
        '.png'  { return 'image/png' }
        '.jpg'  { return 'image/jpeg' }
        '.jpeg' { return 'image/jpeg' }
        '.ico'  { return 'image/x-icon' }
        default { return 'application/octet-stream' }
    }
}

function Send-Response($Stream, [int]$Status, [string]$Reason, [byte[]]$Body, [string]$ContentType) {
    $header = "HTTP/1.1 $Status $Reason`r`nContent-Type: $ContentType`r`nContent-Length: $($Body.Length)`r`nCache-Control: no-store`r`nConnection: close`r`n`r`n"
    $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
    $Stream.Write($headerBytes, 0, $headerBytes.Length)
    if ($Body.Length -gt 0) {
        $Stream.Write($Body, 0, $Body.Length)
    }
    $Stream.Flush()
}

$listener.Start()
Write-Host "Kondisi Laut berjalan di http://127.0.0.1:$Port"
Write-Host 'Tekan Ctrl+C untuk berhenti.'

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }

            while ($true) {
                $line = $reader.ReadLine()
                if ([string]::IsNullOrEmpty($line)) { break }
            }

            $parts = $requestLine.Split(' ')
            if ($parts.Length -lt 2 -or $parts[0] -ne 'GET') {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Method Not Allowed')
                Send-Response $stream 405 'Method Not Allowed' $body 'text/plain; charset=utf-8'
                continue
            }

            $requestPath = $parts[1].Split('?')[0]
            $requestPath = [System.Uri]::UnescapeDataString($requestPath).TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($requestPath)) { $requestPath = 'index.html' }
            $requestPath = $requestPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $fullPath = [System.IO.Path]::GetFullPath((Join-Path $siteRoot $requestPath))

            if (-not $fullPath.StartsWith($siteBoundary, [System.StringComparison]::OrdinalIgnoreCase)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Forbidden')
                Send-Response $stream 403 'Forbidden' $body 'text/plain; charset=utf-8'
                continue
            }

            if (-not [System.IO.File]::Exists($fullPath)) {
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not Found')
                Send-Response $stream 404 'Not Found' $body 'text/plain; charset=utf-8'
                continue
            }

            $body = [System.IO.File]::ReadAllBytes($fullPath)
            Send-Response $stream 200 'OK' $body (Get-ContentType $fullPath)
        }
        catch {
            Write-Warning $_.Exception.Message
        }
        finally {
            $client.Close()
        }
    }
}
finally {
    $listener.Stop()
}
