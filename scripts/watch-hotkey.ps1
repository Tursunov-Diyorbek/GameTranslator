param(
  [Parameter(Mandatory = $true)]
  [int]$Vk,
  [Parameter(Mandatory = $true)]
  [string]$OutFile,
  [int]$ToggleVk = 0
)

$ErrorActionPreference = 'Continue'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName System.Windows.Forms | Out-Null
Add-Type -AssemblyName System.Drawing | Out-Null

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class GtNative {
  [DllImport("user32.dll")]
  public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")]
  public static extern uint GetClipboardSequenceNumber();
  [DllImport("user32.dll")]
  public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);

  public static void SendWinShiftS() {
    const byte VK_MENU = 0x12;
    const byte VK_LWIN = 0x5B;
    const byte VK_SHIFT = 0x10;
    const byte VK_S = 0x53;
    const uint KEYUP = 0x0002;
    keybd_event(VK_MENU, 0, KEYUP, UIntPtr.Zero);
    keybd_event(VK_LWIN, 0, 0, UIntPtr.Zero);
    keybd_event(VK_SHIFT, 0, 0, UIntPtr.Zero);
    keybd_event(VK_S, 0, 0, UIntPtr.Zero);
    keybd_event(VK_S, 0, KEYUP, UIntPtr.Zero);
    keybd_event(VK_SHIFT, 0, KEYUP, UIntPtr.Zero);
    keybd_event(VK_LWIN, 0, KEYUP, UIntPtr.Zero);
  }
}
"@

function Save-ClipboardJpeg([string]$path) {
  try {
    if (-not [System.Windows.Forms.Clipboard]::ContainsImage()) {
      return $false
    }

    $img = [System.Windows.Forms.Clipboard]::GetImage()
    if ($null -eq $img) {
      return $false
    }

    $max = 960
    $scale = [Math]::Min(1.0, $max / [Math]::Max($img.Width, $img.Height))
    $nw = [Math]::Max(1, [int]($img.Width * $scale))
    $nh = [Math]::Max(1, [int]($img.Height * $scale))
    $bmp = New-Object System.Drawing.Bitmap $nw, $nh
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.DrawImage($img, 0, 0, $nw, $nh)
    $g.Dispose()
    $img.Dispose()

    $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
      Where-Object { $_.MimeType -eq 'image/jpeg' } |
      Select-Object -First 1
    $ep = New-Object System.Drawing.Imaging.EncoderParameters 1
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter (
      [System.Drawing.Imaging.Encoder]::Quality,
        [long]62
    )

    $dir = Split-Path -Parent $path
    if ($dir -and -not (Test-Path $dir)) {
      New-Item -ItemType Directory -Path $dir | Out-Null
    }

    $tmp = "$path.tmp"
    $bmp.Save($tmp, $codec, $ep)
    $bmp.Dispose()
    Move-Item -LiteralPath $tmp -Destination $path -Force
    return $true
  } catch {
    return $false
  }
}

function Get-SnipHost {
  Get-Process -Name 'ScreenClippingHost', 'ScreenSketch', 'SnippingTool' -ErrorAction SilentlyContinue
}

function Emit([string]$line) {
  [Console]::Out.WriteLine($line)
  [Console]::Out.Flush()
}

$armFile = "$OutFile.arm"
$enabledFile = "$OutFile.on"
$lastSeq = [GtNative]::GetClipboardSequenceNumber()
$keyDown = $false
$toggleDown = $false
$escDown = $false
$winSDown = $false
$snipOpen = $false
$sawHost = $false
$hostGoneAt = $null
$vkEsc = 0x1B
$vkLWin = 0x5B
$vkRWin = 0x5C
$vkShift = 0x10
$vkS = 0x53

function Open-SnipSession {
  if ($script:snipOpen) { return }
  $script:snipOpen = $true
  $script:sawHost = $false
  $script:hostGoneAt = $null
  $script:lastSeq = [GtNative]::GetClipboardSequenceNumber()
  Emit "OPEN"
}

function Start-SnipOverlay {
  [GtNative]::SendWinShiftS()
  Open-SnipSession
}

function Close-SnipSession([string]$result) {
  if (-not $script:snipOpen) { return }
  $script:snipOpen = $false
  $script:sawHost = $false
  $script:hostGoneAt = $null
  Emit $result
}

while ($true) {
  if (Test-Path $armFile) {
    Remove-Item $armFile -Force -ErrorAction SilentlyContinue
    if (Test-Path $enabledFile) {
      Start-SnipOverlay
    }
  }

  $pressed = ([GtNative]::GetAsyncKeyState($Vk) -band 0x8000) -ne 0
  if ($pressed -and -not $keyDown -and -not $snipOpen -and (Test-Path $enabledFile)) {
    Start-SnipOverlay
  }
  $keyDown = $pressed

  if ($ToggleVk -gt 0) {
    $toggled = ([GtNative]::GetAsyncKeyState($ToggleVk) -band 0x8000) -ne 0
    if ($toggled -and -not $toggleDown) {
      Emit "TOGGLE"
    }
    $toggleDown = $toggled
  }

  $win = (([GtNative]::GetAsyncKeyState($vkLWin) -band 0x8000) -ne 0) -or (([GtNative]::GetAsyncKeyState($vkRWin) -band 0x8000) -ne 0)
  $shift = ([GtNative]::GetAsyncKeyState($vkShift) -band 0x8000) -ne 0
  $sKey = ([GtNative]::GetAsyncKeyState($vkS) -band 0x8000) -ne 0
  $winS = $win -and $shift -and $sKey
  if ($winS -and -not $winSDown) {
    Open-SnipSession
  }
  $winSDown = $winS

  $esc = ([GtNative]::GetAsyncKeyState($vkEsc) -band 0x8000) -ne 0
  if ($esc -and -not $escDown -and $snipOpen) {
    Close-SnipSession "CANCEL"
  }
  $escDown = $esc

  if ($snipOpen) {
    $hostProc = Get-SnipHost
    if ($hostProc) {
      $sawHost = $true
      $hostGoneAt = $null
    } elseif ($sawHost) {
      if ($null -eq $hostGoneAt) {
        $hostGoneAt = Get-Date
      }
      if (Save-ClipboardJpeg $OutFile) {
        Close-SnipSession "SNIP"
      } elseif (((Get-Date) - $hostGoneAt).TotalMilliseconds -ge 1600) {
        Close-SnipSession "CANCEL"
      }
    }
  }

  $seq = [GtNative]::GetClipboardSequenceNumber()
  if ($seq -ne $lastSeq) {
    $lastSeq = $seq
    if ($snipOpen) {
      Start-Sleep -Milliseconds 80
      if (Save-ClipboardJpeg $OutFile) {
        Close-SnipSession "SNIP"
      }
    }
  }

  Start-Sleep -Milliseconds 25
}
