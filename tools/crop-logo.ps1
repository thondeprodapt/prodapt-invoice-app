param(
  [Parameter(Mandatory = $true)]
  [string]$InputPath,

  [Parameter(Mandatory = $true)]
  [string]$OutputPath
)

$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$bitmap = [System.Drawing.Bitmap]::FromFile($InputPath)
$minX = $bitmap.Width
$minY = $bitmap.Height
$maxX = 0
$maxY = 0

for ($y = 0; $y -lt $bitmap.Height; $y++) {
  for ($x = 0; $x -lt $bitmap.Width; $x++) {
    $pixel = $bitmap.GetPixel($x, $y)
    if ($pixel.R -lt 245 -or $pixel.G -lt 245 -or $pixel.B -lt 245) {
      if ($x -lt $minX) { $minX = $x }
      if ($y -lt $minY) { $minY = $y }
      if ($x -gt $maxX) { $maxX = $x }
      if ($y -gt $maxY) { $maxY = $y }
    }
  }
}

$padding = 12
$minX = [Math]::Max(0, $minX - $padding)
$minY = [Math]::Max(0, $minY - $padding)
$maxX = [Math]::Min($bitmap.Width - 1, $maxX + $padding)
$maxY = [Math]::Min($bitmap.Height - 1, $maxY + $padding)
$cropRectangle = New-Object System.Drawing.Rectangle($minX, $minY, ($maxX - $minX + 1), ($maxY - $minY + 1))
$cropped = $bitmap.Clone($cropRectangle, $bitmap.PixelFormat)

$cropped.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$cropped.Dispose()
$bitmap.Dispose()

Write-Host "Cropped logo saved to $OutputPath"
