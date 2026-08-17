param(
  [Parameter(Mandatory = $true)]
  [string]$StateFile
)

$ErrorActionPreference = 'Continue'
Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null
[System.Windows.Forms.Application]::EnableVisualStyles()

Add-Type -ReferencedAssemblies @('System.Windows.Forms', 'System.Drawing') -TypeDefinition @"
using System;
using System.Windows.Forms;
using System.Runtime.InteropServices;

public class GtOverlayForm : Form {
  protected override bool ShowWithoutActivation { get { return true; } }
  protected override CreateParams CreateParams {
    get {
      CreateParams cp = base.CreateParams;
      cp.ExStyle |= 0x08000000 | 0x00000080 | 0x00000008;
      return cp;
    }
  }
}

public static class GtOverlayNative {
  public const int HWND_TOPMOST = -1;
  public const uint SWP_NOMOVE = 0x0002;
  public const uint SWP_NOSIZE = 0x0001;
  public const uint SWP_NOACTIVATE = 0x0010;
  public const uint SWP_SHOWWINDOW = 0x0040;
  public const int SW_SHOWNOACTIVATE = 4;

  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")]
  public static extern bool SetWindowPos(IntPtr hWnd, IntPtr hWndInsertAfter, int X, int Y, int cx, int cy, uint uFlags);
  [DllImport("user32.dll")]
  public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@

$script:lastWrite = [datetime]::MinValue
$script:escDown = $false
$script:placed = $false
$script:drag = $false
$script:dragX = 0
$script:dragY = 0

$form = New-Object GtOverlayForm
$form.Text = 'GameTranslator'
$form.FormBorderStyle = [System.Windows.Forms.FormBorderStyle]::None
$form.StartPosition = [System.Windows.Forms.FormStartPosition]::Manual
$form.ShowInTaskbar = $false
$form.TopMost = $true
$form.MinimizeBox = $false
$form.MaximizeBox = $false
$form.ControlBox = $false
$form.BackColor = [System.Drawing.Color]::FromArgb(13, 18, 15)
$form.ForeColor = [System.Drawing.Color]::FromArgb(238, 246, 234)
$form.Width = 440
$form.Height = 180
$form.Padding = New-Object System.Windows.Forms.Padding 0
$form.KeyPreview = $true
$form.Visible = $false

$titleFont = [System.Drawing.Font]::new('Segoe UI', 11.0, [System.Drawing.FontStyle]::Bold)
$bodyFont = [System.Drawing.Font]::new('Segoe UI', 13.0)
$noteFont = [System.Drawing.Font]::new('Segoe UI', 10.0)
$smallFont = [System.Drawing.Font]::new('Segoe UI', 9.0, [System.Drawing.FontStyle]::Bold)

$titleBar = New-Object System.Windows.Forms.Panel
$titleBar.Height = 34
$titleBar.Dock = [System.Windows.Forms.DockStyle]::Top
$titleBar.BackColor = [System.Drawing.Color]::FromArgb(8, 12, 10)

$title = New-Object System.Windows.Forms.Label
$title.Text = 'Tarjima'
$title.Font = $titleFont
$title.ForeColor = [System.Drawing.Color]::FromArgb(198, 255, 74)
$title.AutoSize = $true
$title.Location = New-Object System.Drawing.Point 14, 7

$closeBtn = New-Object System.Windows.Forms.Label
$closeBtn.Text = 'x'
$closeBtn.Font = $titleFont
$closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(139, 155, 143)
$closeBtn.AutoSize = $false
$closeBtn.Width = 34
$closeBtn.Height = 34
$closeBtn.TextAlign = [System.Drawing.ContentAlignment]::MiddleCenter
$closeBtn.Cursor = [System.Windows.Forms.Cursors]::Hand
$closeBtn.Anchor = [System.Windows.Forms.AnchorStyles]::Top -bor [System.Windows.Forms.AnchorStyles]::Right

$body = New-Object System.Windows.Forms.Label
$body.Font = $bodyFont
$body.ForeColor = [System.Drawing.Color]::FromArgb(238, 246, 234)
$body.AutoSize = $false
$body.Location = New-Object System.Drawing.Point 14, 46
$body.Width = 412

$noteHead = New-Object System.Windows.Forms.Label
$noteHead.Text = 'IZOH'
$noteHead.Font = $smallFont
$noteHead.ForeColor = [System.Drawing.Color]::FromArgb(62, 224, 168)
$noteHead.AutoSize = $true
$noteHead.Visible = $false

$noteBody = New-Object System.Windows.Forms.Label
$noteBody.Font = $noteFont
$noteBody.ForeColor = [System.Drawing.Color]::FromArgb(215, 245, 232)
$noteBody.AutoSize = $false
$noteBody.Visible = $false

$form.Controls.Add($body)
$form.Controls.Add($noteHead)
$form.Controls.Add($noteBody)
$form.Controls.Add($titleBar)
$titleBar.Controls.Add($title)
$titleBar.Controls.Add($closeBtn)

$hideTimer = New-Object System.Windows.Forms.Timer
$hideTimer.Interval = 20000
$hideTimer.Add_Tick({
  $hideTimer.Stop()
  Hide-Overlay
})

function Place-Default {
  $wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
  $form.Left = $wa.Right - $form.Width - 16
  $form.Top = $wa.Top + 16
  $script:placed = $true
}

function Hide-Overlay {
  $hideTimer.Stop()
  $form.Hide()
}

function Show-Overlay {
  if (-not $script:placed) { Place-Default }
  if ($form.WindowState -eq [System.Windows.Forms.FormWindowState]::Minimized) {
    $form.WindowState = [System.Windows.Forms.FormWindowState]::Normal
  }
  [GtOverlayNative]::ShowWindow($form.Handle, [GtOverlayNative]::SW_SHOWNOACTIVATE)
  [GtOverlayNative]::SetWindowPos(
    $form.Handle,
    [IntPtr][GtOverlayNative]::HWND_TOPMOST,
    0, 0, 0, 0,
    [GtOverlayNative]::SWP_NOMOVE -bor [GtOverlayNative]::SWP_NOSIZE -bor [GtOverlayNative]::SWP_NOACTIVATE -bor [GtOverlayNative]::SWP_SHOWWINDOW
  )
  $form.Visible = $true
}

function Update-Layout {
  $maxBody = [Math]::Max(80, [int]([System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea.Height * 0.62))
  $g = $form.CreateGraphics()
  $bodySize = $g.MeasureString($body.Text, $body.Font, 412)
  $body.Height = [Math]::Min($maxBody, [Math]::Max(36, [int][Math]::Ceiling($bodySize.Height) + 8))
  $y = 46 + $body.Height + 8
  if ($noteBody.Visible) {
    $noteHead.Location = New-Object System.Drawing.Point 14, $y
    $y += 20
    $noteSize = $g.MeasureString($noteBody.Text, $noteBody.Font, 412)
    $noteBody.Location = New-Object System.Drawing.Point 14, $y
    $noteBody.Width = 412
    $noteBody.Height = [Math]::Min(120, [Math]::Max(20, [int][Math]::Ceiling($noteSize.Height) + 4))
    $y += $noteBody.Height + 14
  } else {
    $y += 8
  }
  $g.Dispose()
  $form.Height = [Math]::Max(96, $y)
  $form.Width = 440
  $closeBtn.Left = $titleBar.Width - $closeBtn.Width
  if (-not $script:placed) { Place-Default }
}

function Read-State {
  if (-not (Test-Path -LiteralPath $StateFile)) { return $null }
  for ($i = 0; $i -lt 6; $i++) {
    try {
      $raw = [System.IO.File]::ReadAllText($StateFile, [System.Text.Encoding]::UTF8)
      if (-not $raw) { return $null }
      return $raw | ConvertFrom-Json
    } catch {
      Start-Sleep -Milliseconds 30
    }
  }
  return $null
}

function Update-FromFile {
  if (-not (Test-Path -LiteralPath $StateFile)) { return }
  $write = [System.IO.File]::GetLastWriteTimeUtc($StateFile)
  if ($write -eq $script:lastWrite) { return }
  $obj = Read-State
  if ($null -eq $obj) { return }
  $script:lastWrite = $write

  $status = [string]$obj.status
  if ($status -eq 'hide') {
    Hide-Overlay
    return
  }

  $noteHead.Visible = $false
  $noteBody.Visible = $false
  $body.ForeColor = [System.Drawing.Color]::FromArgb(238, 246, 234)

  if ($status -eq 'loading') {
    $title.Text = 'Tarjima'
    $body.Text = "Tarjima qilinmoqda..."
    $hideTimer.Stop()
  } elseif ($status -eq 'error') {
    $title.Text = 'Xato'
    $err = [string]$obj.error
    if (-not $err) { $err = 'Tarjima muvaffaqiyatsiz' }
    $body.Text = $err
    $body.ForeColor = [System.Drawing.Color]::FromArgb(255, 138, 138)
    $hideTimer.Stop()
    $hideTimer.Start()
  } else {
    $title.Text = 'Tarjima'
    $text = [string]$obj.translation
    if (-not $text) { $text = 'Matn topilmadi' }
    $body.Text = $text.Replace("`n", [Environment]::NewLine)
    $note = [string]$obj.note
    if ($note) {
      $noteHead.Visible = $true
      $noteBody.Visible = $true
      $noteBody.Text = $note.Replace("`n", [Environment]::NewLine)
    }
    $hideTimer.Stop()
    $hideTimer.Start()
  }

  Update-Layout
  Show-Overlay
}

$script:booted = $false
$form.Add_Shown({
  if ($script:booted) { return }
  $script:booted = $true
  $form.Hide()
  Update-FromFile
})

$form.Add_Resize({
  $closeBtn.Left = $titleBar.Width - $closeBtn.Width
})

$form.Add_Paint({
  param($sender, $e)
  $pen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(90, 198, 255, 74), 1)
  $e.Graphics.DrawRectangle($pen, 0, 0, $form.Width - 1, $form.Height - 1)
  $pen.Dispose()
})

$form.Add_KeyDown({
  param($sender, $e)
  if ($e.KeyCode -eq [System.Windows.Forms.Keys]::Escape) {
    Hide-Overlay
  }
})

$closeBtn.Add_Click({ Hide-Overlay })
$closeBtn.Add_MouseEnter({ $closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(255, 109, 109) })
$closeBtn.Add_MouseLeave({ $closeBtn.ForeColor = [System.Drawing.Color]::FromArgb(139, 155, 143) })

function Start-Drag($e) {
  $script:drag = $true
  $script:dragX = $e.X
  $script:dragY = $e.Y
}
function Do-Drag($e) {
  if (-not $script:drag) { return }
  $form.Left = $form.Left + $e.X - $script:dragX
  $form.Top = $form.Top + $e.Y - $script:dragY
}
function Stop-Drag { $script:drag = $false }

$titleBar.Add_MouseDown({ param($s, $e) Start-Drag $e })
$titleBar.Add_MouseMove({ param($s, $e) Do-Drag $e })
$titleBar.Add_MouseUp({ Stop-Drag })
$title.Add_MouseDown({ param($s, $e) Start-Drag $e })
$title.Add_MouseMove({ param($s, $e) Do-Drag $e })
$title.Add_MouseUp({ Stop-Drag })

$poll = New-Object System.Windows.Forms.Timer
$poll.Interval = 100
$poll.Add_Tick({
  Update-FromFile
  if (-not $form.Visible) {
    $script:escDown = (([GtOverlayNative]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0)
    return
  }
  $esc = (([GtOverlayNative]::GetAsyncKeyState(0x1B) -band 0x8000) -ne 0)
  if ($esc -and -not $script:escDown) {
    Hide-Overlay
  }
  $script:escDown = $esc
})
$poll.Start()

$dir = Split-Path -Parent $StateFile
$name = Split-Path -Leaf $StateFile
if ($dir -and (Test-Path -LiteralPath $dir)) {
  $fsWatch = New-Object System.IO.FileSystemWatcher $dir, $name
  $fsWatch.NotifyFilter = [System.IO.NotifyFilters]::LastWrite -bor [System.IO.NotifyFilters]::Size -bor [System.IO.NotifyFilters]::FileName
  $fsWatch.SynchronizingObject = $form
  $fsWatch.Add_Changed({ Update-FromFile })
  $fsWatch.Add_Created({ Update-FromFile })
  $fsWatch.EnableRaisingEvents = $true
}

[System.Windows.Forms.Application]::Run($form)
