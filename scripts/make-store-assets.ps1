# Generates Play Store listing graphics (store\icon-512.png, store\feature-1024x500.png).
# The app icon is drawn from vector primitives mirroring public\icon.svg — the raster
# icon PNGs in this repo have an opaque gray matte baked in, so they are NOT used.
# Rerunnable: overwrites both outputs.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$outDir = Join-Path $root 'store'
New-Item -ItemType Directory -Force $outDir | Out-Null

$paper = [System.Drawing.ColorTranslator]::FromHtml('#fbf6e9')
$ink = [System.Drawing.ColorTranslator]::FromHtml('#2e2c25')
$blue = [System.Drawing.ColorTranslator]::FromHtml('#3F51D6')
$cream = [System.Drawing.ColorTranslator]::FromHtml('#FFFDF6')
$purple = [System.Drawing.ColorTranslator]::FromHtml('#8B7BF4')

function New-Canvas([int]$w, [int]$h) {
  $bmp = New-Object System.Drawing.Bitmap($w, $h)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $g.InterpolationMode = 'HighQualityBicubic'
  $g.TextRenderingHint = 'AntiAlias'
  return $bmp, $g
}

# Draws the SonGul icon into a 512x512 box at the current transform.
# $rounded: clip to the rounded-rect app tile (feature graphic); otherwise full-bleed.
function Draw-SongulIcon([System.Drawing.Graphics]$g, [bool]$rounded) {
  $blueBrush = New-Object System.Drawing.SolidBrush($blue)
  if ($rounded) {
    $r = 112; $d = $r * 2
    $tile = New-Object System.Drawing.Drawing2D.GraphicsPath
    $tile.AddArc(0, 0, $d, $d, 180, 90)
    $tile.AddArc(512 - $d, 0, $d, $d, 270, 90)
    $tile.AddArc(512 - $d, 512 - $d, $d, $d, 0, 90)
    $tile.AddArc(0, 512 - $d, $d, $d, 90, 90)
    $tile.CloseFigure()
    $g.FillPath($blueBrush, $tile)
    $tile.Dispose()
  } else {
    $g.FillRectangle($blueBrush, -1, -1, 514, 514)
  }
  $blueBrush.Dispose()

  # '손' glyph — SVG: center x=246, baseline y=330, size 218
  $creamBrush = New-Object System.Drawing.SolidBrush($cream)
  $font = New-Object System.Drawing.Font('Malgun Gothic', 218, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Alignment = 'Center'
  $rect = New-Object System.Drawing.RectangleF(-10, 108, 512, 320)
  $g.DrawString([char]0xC190, $font, $creamBrush, $rect, $fmt)
  $font.Dispose(); $fmt.Dispose()

  # sprout accent — SVG: translate(352 96) rotate(12)
  $saved = $g.Save()
  $g.TranslateTransform(352, 96)
  $g.RotateTransform(12)
  $stemPen = New-Object System.Drawing.Pen($cream, 13)
  $stemPen.StartCap = 'Round'; $stemPen.EndCap = 'Round'
  $g.DrawBezier($stemPen, 0, 62, 4, 34, 10, 18, 22, 0)
  $stemPen.Dispose()
  $leafR = New-Object System.Drawing.Drawing2D.GraphicsPath
  $leafR.AddBezier(22, 2, 44, -16, 74, -12, 86, 6)
  $leafR.AddBezier(86, 6, 66, 22, 36, 22, 22, 2)
  $leafR.CloseFigure()
  $purpleBrush = New-Object System.Drawing.SolidBrush($purple)
  $g.FillPath($purpleBrush, $leafR)
  $leafR.Dispose(); $purpleBrush.Dispose()
  $leafL = New-Object System.Drawing.Drawing2D.GraphicsPath
  $leafL.AddBezier(18, 6, -2, -8, -26, -2, -34, 12)
  $leafL.AddBezier(-34, 12, -18, 26, 4, 22, 18, 6)
  $leafL.CloseFigure()
  $g.FillPath($creamBrush, $leafL)
  $leafL.Dispose()
  $g.Restore($saved)
  $creamBrush.Dispose()
}

# Largest Malgun Gothic font (starting at $size) whose rendered width fits $maxW.
function Fit-Font([System.Drawing.Graphics]$g, [string]$text, [single]$size, [single]$maxW, [System.Drawing.FontStyle]$style) {
  while ($size -gt 10) {
    $f = New-Object System.Drawing.Font('Malgun Gothic', $size, $style)
    if ($g.MeasureString($text, $f).Width -le $maxW) { return $f }
    $f.Dispose(); $size -= 2
  }
  return New-Object System.Drawing.Font('Malgun Gothic', 10, $style)
}

# --- 512x512 store icon: full-bleed (Play applies its own corner mask) ---
$bmp, $g = New-Canvas 512 512
Draw-SongulIcon $g $false
$g.Dispose()
$bmp.Save((Join-Path $outDir 'icon-512.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# --- 1024x500 feature graphic: rounded tile left, wordmark + tagline right ---
$bmp, $g = New-Canvas 1024 500
$g.Clear($paper)
$saved = $g.Save()
$g.TranslateTransform(70, 90)
$g.ScaleTransform(320 / 512, 320 / 512)
Draw-SongulIcon $g $true
$g.Restore($saved)

$brush = New-Object System.Drawing.SolidBrush($ink)
$maxW = 1024 - 420 - 40
$title = Fit-Font $g '손글 SonGul' 64 $maxW ([System.Drawing.FontStyle]::Bold)
$tag = Fit-Font $g 'Learn Korean by hand · 손으로 배우는 한국어' 24 $maxW ([System.Drawing.FontStyle]::Regular)
$g.DrawString('손글 SonGul', $title, $brush, 420, 160)
$g.DrawString('Learn Korean by hand · 손으로 배우는 한국어', $tag, $brush, 424, 290)
$title.Dispose(); $tag.Dispose(); $brush.Dispose()
$g.Dispose()
$bmp.Save((Join-Path $outDir 'feature-1024x500.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Dispose()

# --- verify dimensions ---
foreach ($spec in @(@('icon-512.png', 512, 512), @('feature-1024x500.png', 1024, 500))) {
  $img = [System.Drawing.Image]::FromFile((Join-Path $outDir $spec[0]))
  if ($img.Width -ne $spec[1] -or $img.Height -ne $spec[2]) { throw "$($spec[0]) is $($img.Width)x$($img.Height)" }
  $img.Dispose()
  Write-Host "OK $($spec[0]) $($spec[1])x$($spec[2])"
}
