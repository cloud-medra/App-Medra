param(
  [Parameter(Mandatory = $true)][string]$Xlsx,
  [Parameter(Mandatory = $true)][string]$Bas,
  [Parameter(Mandatory = $true)][string]$Xlsm
)
# Arma la plantilla con macros: abre el .xlsx generado por exceljs en Excel,
# importa el módulo VBA (.bas en Windows-1252), crea los botones con la macro
# InstalarBotones y guarda como .xlsm (formato 52).
#
# Importar código VBA por automatización exige "Confiar en el acceso al
# modelo de objetos de proyectos de VBA" (AccessVBOM). Se activa SOLO
# mientras corre este script y se restaura el valor anterior al terminar,
# también si algo falla (decisión del usuario del 23-11-2026).
$ErrorActionPreference = 'Stop'

$ruta = 'HKCU:\Software\Microsoft\Office\16.0\Excel\Security'
$nombre = 'AccessVBOM'
if (-not (Test-Path $ruta)) { New-Item -Path $ruta -Force | Out-Null }
$anterior = (Get-ItemProperty -Path $ruta -Name $nombre -ErrorAction SilentlyContinue).$nombre

Add-Type -Namespace Medra -Name Ventana -MemberDefinition '[DllImport("user32.dll")] public static extern int GetWindowThreadProcessId(System.IntPtr hWnd, out int pid);'

function Restaurar {
  if ($null -eq $anterior) {
    Remove-ItemProperty -Path $ruta -Name $nombre -ErrorAction SilentlyContinue
  } else {
    Set-ItemProperty -Path $ruta -Name $nombre -Value $anterior -Type DWord
  }
}

$xl = $null
$procesoExcel = 0
try {
  Set-ItemProperty -Path $ruta -Name $nombre -Value 1 -Type DWord
  $xl = New-Object -ComObject Excel.Application
  # Proceso de ESTA instancia (no toca otros Excel abiertos por el usuario).
  $null = [Medra.Ventana]::GetWindowThreadProcessId([System.IntPtr]$xl.Hwnd, [ref]$procesoExcel)
  $xl.Visible = $false
  $xl.DisplayAlerts = $false
  # Solo para esta instancia: deja ejecutar InstalarBotones del libro abierto.
  $xl.AutomationSecurity = 1
  $wb = $xl.Workbooks.Open($Xlsx)
  $null = $wb.VBProject.VBComponents.Import($Bas)
  # Evento del libro: al editar Códigos, Empresas o Recargos escribe FECHA
  # CAMBIO (la lógica está en ModContingencia.RegistrarCambioCatalogo). El
  # módulo del libro se llama ThisWorkbook o EsteLibro según el idioma.
  $moduloLibro = $wb.VBProject.VBComponents.Item($wb.CodeName).CodeModule
  $moduloLibro.AddFromString("Private Sub Workbook_SheetChange(ByVal Sh As Object, ByVal Target As Range)`r`n    RegistrarCambioCatalogo Sh, Target`r`nEnd Sub")
  $xl.Run("'" + $wb.Name + "'!InstalarBotones")
  # Sin "Quitar información personal al guardar": con macros, Excel muestra
  # en cada guardado la advertencia "Ten cuidado: es posible que algunas
  # partes del documento incluyan información personal…" (y una macro que
  # guarda queda esperando esa respuesta).
  $wb.RemovePersonalInformation = $false
  # Hoja inicial al abrir: la primera (Gestiones; Instrucciones va al final).
  $wb.Worksheets.Item(1).Activate()
  if (Test-Path $Xlsm) { Remove-Item $Xlsm -Force }
  $wb.SaveAs($Xlsm, 52)
  $wb.Close($false)
  Write-Output 'OK'
}
finally {
  if ($xl) {
    $xl.Quit()
    [System.Runtime.InteropServices.Marshal]::ReleaseComObject($xl) | Out-Null
    $xl = $null
    [System.GC]::Collect()
    [System.GC]::WaitForPendingFinalizers()
  }
  # Excel vuelve a escribir su configuración de seguridad al cerrarse: se
  # restaura recién cuando su proceso terminó (si no, quedaba activado).
  if ($procesoExcel -gt 0) {
    Wait-Process -Id $procesoExcel -Timeout 60 -ErrorAction SilentlyContinue
    if (Get-Process -Id $procesoExcel -ErrorAction SilentlyContinue) { Stop-Process -Id $procesoExcel -Force }
  }
  Restaurar
  $actual = (Get-ItemProperty -Path $ruta -Name $nombre -ErrorAction SilentlyContinue).$nombre
  if ($actual -ne $anterior) {
    Restaurar
    Write-Output "AVISO: AccessVBOM no quedó en su valor anterior ($anterior); revise Archivo > Opciones > Centro de confianza."
  }
}
