param(
  [Parameter(Mandatory = $true)]
  [string]$LogoPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputDir
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

function New-AppIcon {
  param(
    [System.Drawing.Image]$Logo,
    [int]$Size,
    [string]$OutputPath
  )

  $canvas = New-Object System.Drawing.Bitmap($Size, $Size)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.Clear([System.Drawing.Color]::White)

  $padding = [Math]::Round($Size * 0.10)
  $maxWidth = $Size - ($padding * 2)
  $maxHeight = [Math]::Round($Size * 0.62)
  $scale = [Math]::Min($maxWidth / $Logo.Width, $maxHeight / $Logo.Height)
  $drawWidth = [Math]::Round($Logo.Width * $scale)
  $drawHeight = [Math]::Round($Logo.Height * $scale)
  $x = [Math]::Round(($Size - $drawWidth) / 2)
  $y = [Math]::Round(($Size - $drawHeight) / 2)

  $graphics.DrawImage($Logo, $x, $y, $drawWidth, $drawHeight)
  $canvas.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $graphics.Dispose()
  $canvas.Dispose()
}

$logo = [System.Drawing.Image]::FromFile($LogoPath)

New-AppIcon -Logo $logo -Size 192 -OutputPath (Join-Path $OutputDir "icon-192.png")
New-AppIcon -Logo $logo -Size 512 -OutputPath (Join-Path $OutputDir "icon-512.png")
New-AppIcon -Logo $logo -Size 180 -OutputPath (Join-Path $OutputDir "apple-touch-icon.png")

$logo.Dispose()

Write-Host "Generated app icons in $OutputDir"
