# Rasterise the DateTracker mark (see assets/icons/favicon.svg) to PNG icons.
# Windows PowerShell, from the repo root:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts/make-app-icons.ps1
Add-Type -AssemblyName System.Drawing

$out = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\assets\icons'))
$bg = [System.Drawing.Color]::FromArgb(255, 0xC8, 0x95, 0x6C)   # copper
$fg = [System.Drawing.Color]::FromArgb(255, 0x1A, 0x14, 0x10)   # near-black

function New-RoundedRect([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
  $p = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $p.AddArc($x, $y, $d, $d, 180, 90)
  $p.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $p.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $p.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $p.CloseFigure()
  return $p
}

# $fullBleed: square background (maskable / apple-touch); otherwise a rounded square with transparent corners.
function New-Icon([int]$size, [string]$name, [bool]$fullBleed) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::Transparent)
  $s = $size / 64.0
  $brush = New-Object System.Drawing.SolidBrush $bg
  if ($fullBleed) { $g.FillRectangle($brush, 0, 0, $size, $size) }
  else { $g.FillPath($brush, (New-RoundedRect 0 0 $size $size (14 * $s))) }

  $pen = New-Object System.Drawing.Pen $fg, (5 * $s)
  $r = 15 * $s
  $c = 32 * $s
  $g.DrawEllipse($pen, $c - $r, $c - $r, 2 * $r, 2 * $r)
  $dot = 5 * $s
  $g.FillEllipse((New-Object System.Drawing.SolidBrush $fg), $c - $dot, $c - $dot, 2 * $dot, 2 * $dot)

  $g.Dispose()
  $path = Join-Path $out $name
  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  Write-Output ("{0} {1}x{1} {2} bytes" -f $name, $size, (Get-Item $path).Length)
}

New-Icon 192 'icon-192.png' $false
New-Icon 512 'icon-512.png' $false
New-Icon 512 'icon-maskable-512.png' $true
New-Icon 180 'apple-touch-icon.png' $true
