# OpenWeb — PowerShell installer
# Secure installation:
#   Invoke-WebRequest -Uri "https://raw.githubusercontent.com/QWKiks/openweb/main/install.ps1" -OutFile "install.ps1"
#   Get-Content install.ps1 # inspect script integrity
#   .\install.ps1

$Repo = "https://github.com/QWKiks/openweb.git"
$Dir = "$env:USERPROFILE\.openweb"

Write-Host ""
Write-Host "  OpenWeb — Install" -ForegroundColor Cyan
Write-Host ""

if (Test-Path "$Dir\package.json") {
    Write-Host "  ✓ Already installed at $Dir" -ForegroundColor Green
} else {
    Write-Host "  Cloning from GitHub..."
    git clone $Repo $Dir
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  ✗ Git clone failed. Install git or clone manually:" -ForegroundColor Red
        Write-Host "    git clone $Repo `"$Dir`""
        exit 1
    }
}

Write-Host "  Installing dependencies..."
Push-Location $Dir
npm install
Pop-Location

Write-Host ""
Write-Host "  Registering MCP server with AI tools..." -ForegroundColor Cyan
Push-Location $Dir
node setup-mcp.js --all
Pop-Location

Write-Host ""
Write-Host "  ─────────────────────────────────────────────"
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host "    1. Open chrome://extensions"
Write-Host "    2. Enable Developer mode (top right)"
Write-Host "    3. Click 'Load unpacked' → select:"
Write-Host "       $Dir"
Write-Host "    4. Click the OpenWeb icon → Connect"
Write-Host "    5. Start the daemon:  node $Dir\daemon.js"
Write-Host ""
Write-Host "  Done! Restart your AI tool to pick up MCP." -ForegroundColor Green
Write-Host ""
