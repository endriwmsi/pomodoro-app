# Gera as imagens do instalador (NSIS) a partir do ícone do aplicativo e das
# capturas de tela em docs/images. Rode de novo quando o ícone ou as capturas
# mudarem:
#
#   powershell -NoProfile -ExecutionPolicy Bypass -File src-tauri\installer\make-assets.ps1
#
# Saída, nesta pasta: sidebar.bmp (164 x 314), header.bmp (150 x 57) e
# preview.bmp (675 x 236). O NSIS só aceita BMP.

Add-Type -AssemblyName System.Drawing

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$root = Split-Path -Parent (Split-Path -Parent $here)
$images = Join-Path $root 'docs\images'

$ink = [System.Drawing.Color]::FromArgb(244, 243, 238)
$muted = [System.Drawing.Color]::FromArgb(150, 150, 156)
$accent = [System.Drawing.Color]::FromArgb(245, 194, 81)
$night = [System.Drawing.Color]::FromArgb(14, 14, 16)

function New-Canvas([int]$width, [int]$height, [System.Drawing.Color]$background) {
  $bitmap = New-Object System.Drawing.Bitmap $width, $height, ([System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = 'AntiAlias'
  $graphics.InterpolationMode = 'HighQualityBicubic'
  $graphics.PixelOffsetMode = 'HighQuality'
  $graphics.TextRenderingHint = 'AntiAliasGridFit'
  $graphics.Clear($background)
  return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Save-Canvas($canvas, [string]$name) {
  $canvas.Graphics.Dispose()
  $canvas.Bitmap.Save((Join-Path $here $name), [System.Drawing.Imaging.ImageFormat]::Bmp)
  $canvas.Bitmap.Dispose()
  Write-Output "ok $name"
}

function Draw-Text($graphics, [string]$text, [string]$family, [single]$size, [System.Drawing.FontStyle]$style,
  [System.Drawing.Color]$color, [single]$x, [single]$y, [single]$width = 0) {
  $font = New-Object System.Drawing.Font $family, $size, $style, ([System.Drawing.GraphicsUnit]::Pixel)
  $brush = New-Object System.Drawing.SolidBrush $color
  if ($width -gt 0) {
    $graphics.DrawString($text, $font, $brush, (New-Object System.Drawing.RectangleF $x, $y, $width, 200))
  } else {
    $graphics.DrawString($text, $font, $brush, $x, $y)
  }
  $brush.Dispose(); $font.Dispose()
}

$icon = [System.Drawing.Image]::FromFile((Join-Path $root 'src-tauri\icons\128x128@2x.png'))

# --- Barra lateral das páginas de boas-vindas e de conclusão -----------------
$c = New-Canvas 164 314 $night
$c.Graphics.DrawImage($icon, 18, 22, 44, 44)
Draw-Text $c.Graphics 'Compasso' 'Segoe UI' 21 Bold $ink 16 76
Draw-Text $c.Graphics 'Pomodoro, Kanban e um notch sempre à mão.' 'Segoe UI' 11.5 Regular $muted 18 106 132
$y = 168
foreach ($line in @('100% local', 'Sem rastreamento', 'Sem conta', 'Código aberto (MIT)')) {
  $dot = New-Object System.Drawing.SolidBrush $accent
  $c.Graphics.FillEllipse($dot, 19, $y + 6, 5, 5); $dot.Dispose()
  Draw-Text $c.Graphics $line 'Segoe UI' 12 Regular $ink 30 $y
  $y += 24
}
Draw-Text $c.Graphics 'github.com/endriwmsi' 'Segoe UI' 10.5 Regular $muted 18 286
Save-Canvas $c 'sidebar.bmp'

# --- Cabeçalho das demais páginas (sobre fundo branco) -----------------------
$c = New-Canvas 150 57 ([System.Drawing.Color]::White)
$c.Graphics.DrawImage($icon, 104, 10, 36, 36)
Save-Canvas $c 'header.bmp'

# --- Página "Conheça o Compasso": dashboard e notch --------------------------
$c = New-Canvas 675 236 $night
$dashboard = [System.Drawing.Image]::FromFile((Join-Path $images 'dashboard.png'))
$notch = [System.Drawing.Image]::FromFile((Join-Path $images 'notch-clima.png'))
# O dashboard ocupa a altura toda, à esquerda; o notch, à direita, com legenda.
$dashWidth = [int](236 * $dashboard.Width / $dashboard.Height)
$c.Graphics.DrawImage($dashboard, 0, 0, $dashWidth, 236)
$notchX = $dashWidth + 14
$notchWidth = 675 - $notchX - 10
$notchHeight = [int]($notchWidth * $notch.Height / $notch.Width)
$c.Graphics.DrawImage($notch, $notchX, 0, $notchWidth, $notchHeight)
Draw-Text $c.Graphics 'O notch' 'Segoe UI' 15 Bold $ink $notchX ($notchHeight + 14)
Draw-Text $c.Graphics 'Timer, tarefas, música e clima em um painel que desce da borda da tela ao passar o mouse.' `
  'Segoe UI' 12 Regular $muted $notchX ($notchHeight + 38) $notchWidth
$dashboard.Dispose(); $notch.Dispose()
Save-Canvas $c 'preview.bmp'

$icon.Dispose()
