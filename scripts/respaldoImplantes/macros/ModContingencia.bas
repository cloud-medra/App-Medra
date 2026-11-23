Attribute VB_Name = "ModContingencia"
' Respaldo de contingencia de Implantes: botones "Mover cargados" (hoja
' Gestiones) y "Devolver a pendientes" (hoja Cargados).
'
' - Mover cargados: las gestiones de contingencia con Estado = CARGADO
'   (todas sus lineas CARGADO, PAD o SIN CARGO; lo calcula la formula de la
'   columna Estado) pasan a la hoja Cargados como VALORES, una fila por linea
'   con la cabecera de su gestion, la fecha/hora y quien las movio. Sus filas
'   en Gestiones e Items se limpian (solo las celdas que se escriben): las
'   formulas quedan para reutilizarlas.
' - Devolver a pendientes: vuelve una gestion de Cargados a filas libres de
'   Gestiones e Items. Los N de linea son fijos por fila, asi que la linea
'   padre se traduce del N original al N de la fila donde queda.
'
' Las columnas siguen a libroRespaldo.js (COLUMNAS_GESTIONES, COLUMNAS_ITEMS
' y COLUMNAS_CARGADOS): si cambian alla, hay que cambiarlas aca.
' Este archivo se importa en Windows-1252: solo caracteres latinos (sin
' rayas largas ni flechas).
Option Explicit

Private Const HOJA_GESTIONES As String = "Gestiones"
Private Const HOJA_ITEMS As String = "Ítems"
Private Const HOJA_CARGADOS As String = "Cargados"
Private Const PRIMERA As Long = 3

' Gestiones (A = 1)
Private Const G_ULTIMA_ENTRADA As Long = 16   ' B..P se escriben
Private Const G_ESTADO As Long = 17           ' Q
Private Const G_N_ITEMS As Long = 18          ' R
Private Const G_ORIGEN As Long = 22           ' V
Private Const G_REGISTRADO As Long = 23       ' W
Private Const G_COLUMNAS As Long = 26         ' hasta Z
' Autocompletado desde Reporte Info: celda visible -> auxiliar con el dato de
' Reporte Info (AUTOCOMPLETADO_GESTION en libroRespaldo.js). E=5->AG=33,
' L=12->AH=34, M=13->AI=35, N=14->AJ=36, O=15->AK=37.
Private Const G_AUTOCOMPLETADO As String = "5:33,12:34,13:35,14:36,15:37"

' Items
Private Const I_LINEA As Long = 1             ' A
Private Const I_CLAVE As Long = 2             ' B
Private Const I_TIPO As Long = 3              ' C
Private Const I_PADRE As Long = 4             ' D
Private Const I_ULTIMA_ENTRADA As Long = 11   ' B..K se escriben
Private Const I_ALERTA As Long = 21           ' U
Private Const I_ORIGEN As Long = 22           ' V
Private Const I_REGISTRADO As Long = 23       ' W
Private Const I_TIPO_EF As Long = 25          ' Y (vacio = NORMAL)
Private Const I_ESTADO_EF As Long = 26        ' Z (PAD en lineas PAD)
Private Const I_SIN_CODIGO As Long = 33       ' AG
Private Const I_RECARGO As Long = 35          ' AI
Private Const I_COLUMNAS As Long = 36         ' hasta AJ

' Cargados
Private Const C_COLUMNAS As Long = 44
Private Const C_CLAVE As Long = 3
Private Const C_LINEA As Long = 21

' ---------------------------------------------------------------------------
' Botones
' ---------------------------------------------------------------------------

Public Sub MoverCargados()
    Dim filasG As Collection, filasI As Collection, nAlertas As Long
    BuscarCargados filasG, filasI, nAlertas
    If filasG.Count = 0 Then
        MsgBox "No hay gestiones con Estado CARGADO para mover." & vbCrLf & _
               "(Una gestión queda CARGADO cuando todas sus líneas están CARGADO, PAD o SIN CARGO.)", _
               vbInformation, "Mover cargados"
        Exit Sub
    End If

    Dim aviso As String
    aviso = "Se moverán " & filasG.Count & " gestión(es) y " & filasI.Count & " ítem(s) a la hoja Cargados."
    If nAlertas > 0 Then aviso = aviso & vbCrLf & vbCrLf & "Atención: " & nAlertas & " de esos ítems tienen una alerta (columna Alerta de Ítems)."
    aviso = aviso & vbCrLf & vbCrLf & "Sus filas en Gestiones e Ítems quedarán libres para volver a usarlas." & vbCrLf & "¿Continuar?"
    If MsgBox(aviso, vbYesNo + vbQuestion + vbDefaultButton2, "Mover cargados") <> vbYes Then Exit Sub

    Dim quien As String
    quien = Trim(InputBox("Su nombre (queda registrado en la hoja Cargados):", "Mover cargados", Application.UserName))
    If quien = "" Then Exit Sub

    Dim resultado As String
    resultado = MoverCargadosAuto(quien)
    MsgBox "Listo: " & Split(resultado, ";")(0) & " gestión(es) y " & Split(resultado, ";")(1) & " ítem(s) movidos a Cargados." & vbCrLf & _
           "Guarde el archivo (Ctrl+G).", vbInformation, "Mover cargados"
End Sub

Public Sub DevolverAPendientes()
    Dim wsC As Worksheet
    Set wsC = ThisWorkbook.Worksheets(HOJA_CARGADOS)
    If Not ActiveSheet Is wsC Or ActiveCell.Row < PRIMERA Then
        MsgBox "En la hoja Cargados, seleccione una celda de una fila de la gestión que quiere devolver y vuelva a presionar el botón.", _
               vbInformation, "Devolver a pendientes"
        Exit Sub
    End If
    Dim clave As String
    clave = Txt(wsC.Cells(ActiveCell.Row, C_CLAVE).Value)
    If clave = "" Then
        MsgBox "La fila seleccionada no tiene una gestión.", vbInformation, "Devolver a pendientes"
        Exit Sub
    End If
    Dim filas As Collection
    Set filas = FilasDeClaveEnCargados(wsC, clave)
    If MsgBox("Se devolverá la gestión" & vbCrLf & clave & vbCrLf & "con " & filas.Count & " línea(s) a Gestiones e Ítems." & vbCrLf & vbCrLf & "¿Continuar?", _
              vbYesNo + vbQuestion + vbDefaultButton2, "Devolver a pendientes") <> vbYes Then Exit Sub

    Dim resultado As String
    resultado = DevolverGestionAuto(clave)
    If Left(resultado, 5) = "ERROR" Then
        MsgBox Mid(resultado, 7), vbExclamation, "Devolver a pendientes"
    Else
        MsgBox "Listo: la gestión volvió a Gestiones (fila " & Split(resultado, ";")(1) & ") con " & Split(resultado, ";")(2) & " línea(s) en Ítems." & vbCrLf & _
               "Guarde el archivo (Ctrl+G).", vbInformation, "Devolver a pendientes"
    End If
End Sub

' Crea los botones (una vez, al armar el .xlsm o tras importar este módulo a mano).
Public Sub InstalarBotones()
    CrearBoton ThisWorkbook.Worksheets(HOJA_GESTIONES), "btnMoverCargados", "Mover cargados", "MoverCargados", 150
    CrearBoton ThisWorkbook.Worksheets(HOJA_CARGADOS), "btnDevolverPendientes", "Devolver a pendientes", "DevolverAPendientes", 170
End Sub

' ---------------------------------------------------------------------------
' Lógica sin diálogos (también la usa la prueba automática)
' ---------------------------------------------------------------------------

' Devuelve "gestiones;items".
Public Function MoverCargadosAuto(ByVal quien As String) As String
    Dim wsG As Worksheet, wsI As Worksheet, wsC As Worksheet
    Set wsG = ThisWorkbook.Worksheets(HOJA_GESTIONES)
    Set wsI = ThisWorkbook.Worksheets(HOJA_ITEMS)
    Set wsC = ThisWorkbook.Worksheets(HOJA_CARGADOS)

    Dim filasG As Collection, filasI As Collection, nAlertas As Long
    BuscarCargados filasG, filasI, nAlertas
    If filasG.Count = 0 Then
        MoverCargadosAuto = "0;0"
        Exit Function
    End If

    Dim gDatos As Variant, iDatos As Variant
    gDatos = wsG.Range(wsG.Cells(PRIMERA, 1), wsG.Cells(UltimaFila(wsG, 1), G_COLUMNAS)).Value
    iDatos = wsI.Range(wsI.Cells(PRIMERA, 1), wsI.Cells(UltimaFila(wsI, I_LINEA), I_COLUMNAS)).Value

    ' CLAVE -> índice de fila en gDatos
    Dim porClave As Object, fg As Variant
    Set porClave = CreateObject("Scripting.Dictionary")
    For Each fg In filasG
        porClave(Txt(gDatos(fg - PRIMERA + 1, 1))) = fg - PRIMERA + 1
    Next fg

    Dim salida() As Variant, k As Long, fi As Variant, gi As Long, ii As Long, c As Long, ahora As Date
    ReDim salida(1 To filasI.Count, 1 To C_COLUMNAS)
    ahora = Now
    k = 0
    For Each fi In filasI
        k = k + 1
        ii = fi - PRIMERA + 1
        gi = porClave(Txt(iDatos(ii, I_CLAVE)))
        salida(k, 1) = ahora
        salida(k, 2) = quien
        salida(k, 3) = gDatos(gi, 1)                       ' CLAVE
        For c = 2 To G_ULTIMA_ENTRADA                       ' Admisión .. Estado sin ítems
            salida(k, c + 2) = gDatos(gi, c)
        Next c
        salida(k, 19) = gDatos(gi, G_ESTADO)
        salida(k, 20) = gDatos(gi, G_REGISTRADO)
        salida(k, 21) = iDatos(ii, I_LINEA)
        salida(k, 22) = iDatos(ii, I_TIPO_EF)
        salida(k, 23) = iDatos(ii, I_PADRE)
        For c = 5 To 9                                      ' N° cotización .. Vencimiento
            salida(k, c + 19) = iDatos(ii, c)
        Next c
        salida(k, 29) = iDatos(ii, I_ESTADO_EF)
        salida(k, 30) = iDatos(ii, 11)                      ' Precio manual
        For c = 12 To 20                                    ' Código .. Venta
            salida(k, c + 19) = iDatos(ii, c)
        Next c
        salida(k, 40) = iDatos(ii, I_SIN_CODIGO)
        salida(k, 41) = iDatos(ii, I_RECARGO)
        salida(k, 42) = iDatos(ii, I_ALERTA)
        salida(k, 43) = iDatos(ii, I_REGISTRADO)
        salida(k, 44) = iDatos(ii, I_ORIGEN)
        For c = 1 To C_COLUMNAS
            If IsError(salida(k, c)) Then salida(k, c) = ""
        Next c
    Next fi

    Dim calculo As XlCalculation
    calculo = Application.Calculation
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    On Error GoTo Fallo
    Desproteger wsG: Desproteger wsI: Desproteger wsC

    Dim destino As Long
    destino = UltimaFila(wsC, C_CLAVE) + 1
    If destino < PRIMERA Then destino = PRIMERA
    wsC.Range(wsC.Cells(destino, 1), wsC.Cells(destino + filasI.Count - 1, C_COLUMNAS)).Value = salida

    For Each fi In filasI
        wsI.Range(wsI.Cells(fi, I_CLAVE), wsI.Cells(fi, I_ULTIMA_ENTRADA)).ClearContents
        wsI.Cells(fi, I_REGISTRADO).ClearContents
    Next fi
    For Each fg In filasG
        wsG.Range(wsG.Cells(fg, 2), wsG.Cells(fg, G_ULTIMA_ENTRADA)).ClearContents
        wsG.Cells(fg, G_REGISTRADO).ClearContents
        RestaurarAutocompletado wsG, CLng(fg)
    Next fg

    MoverCargadosAuto = filasG.Count & ";" & filasI.Count
Fin:
    Proteger wsG: Proteger wsI: Proteger wsC
    Application.Calculation = calculo
    Application.ScreenUpdating = True
    Exit Function
Fallo:
    MoverCargadosAuto = "ERROR;" & Err.Description
    Resume Fin
End Function

' Devuelve "OK;filaGestion;lineas" o "ERROR;mensaje".
Public Function DevolverGestionAuto(ByVal clave As String) As String
    Dim wsG As Worksheet, wsI As Worksheet, wsC As Worksheet
    Set wsG = ThisWorkbook.Worksheets(HOJA_GESTIONES)
    Set wsI = ThisWorkbook.Worksheets(HOJA_ITEMS)
    Set wsC = ThisWorkbook.Worksheets(HOJA_CARGADOS)

    Dim filasC As Collection
    Set filasC = FilasDeClaveEnCargados(wsC, clave)
    If filasC.Count = 0 Then
        DevolverGestionAuto = "ERROR;La gestión " & clave & " no está en Cargados."
        Exit Function
    End If

    Application.Calculate
    Dim gDatos As Variant, iDatos As Variant, r As Long, c As Long, libre As Boolean
    gDatos = wsG.Range(wsG.Cells(PRIMERA, 1), wsG.Cells(UltimaFila(wsG, 1), G_COLUMNAS)).Value
    iDatos = wsI.Range(wsI.Cells(PRIMERA, 1), wsI.Cells(UltimaFila(wsI, I_LINEA), I_COLUMNAS)).Value

    Dim filaG As Long
    For r = 1 To UBound(gDatos, 1)
        If Txt(gDatos(r, 1)) = clave Then
            DevolverGestionAuto = "ERROR;En Gestiones ya hay una gestión con la CLAVE " & clave & " (fila " & (r + PRIMERA - 1) & "). Cámbiela o bórrela antes de devolver."
            Exit Function
        End If
        If filaG = 0 Then
            libre = (Txt(gDatos(r, G_REGISTRADO)) = "")
            For c = 2 To G_ULTIMA_ENTRADA
                If Txt(gDatos(r, c)) <> "" Then libre = False
            Next c
            If libre Then filaG = r + PRIMERA - 1
        End If
    Next r
    If filaG = 0 Then
        DevolverGestionAuto = "ERROR;No quedan filas libres en Gestiones."
        Exit Function
    End If

    Dim filasI As New Collection
    For r = 1 To UBound(iDatos, 1)
        If filasI.Count = filasC.Count Then Exit For
        libre = (Txt(iDatos(r, I_REGISTRADO)) = "")
        For c = I_CLAVE To I_ULTIMA_ENTRADA
            If Txt(iDatos(r, c)) <> "" Then libre = False
        Next c
        If libre Then filasI.Add r + PRIMERA - 1
    Next r
    If filasI.Count < filasC.Count Then
        DevolverGestionAuto = "ERROR;No quedan suficientes filas libres en Ítems (" & filasC.Count & " necesarias)."
        Exit Function
    End If

    ' N° de línea original -> N° de la fila donde queda
    Dim nueva As Object, k As Long
    Set nueva = CreateObject("Scripting.Dictionary")
    For k = 1 To filasC.Count
        nueva(Txt(wsC.Cells(filasC(k), C_LINEA).Value)) = wsI.Cells(filasI(k), I_LINEA).Value
    Next k

    Dim calculo As XlCalculation
    calculo = Application.Calculation
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    On Error GoTo Fallo
    Desproteger wsG: Desproteger wsI: Desproteger wsC

    Dim r0 As Long
    r0 = filasC(1)
    For c = 2 To G_ULTIMA_ENTRADA
        If AuxiliarDe(c) = 0 Then wsG.Cells(filaG, c).Value = wsC.Cells(r0, c + 2).Value
    Next c
    wsG.Cells(filaG, G_REGISTRADO).Value = wsC.Cells(r0, 20).Value
    ' Autocompletado: si lo guardado es lo mismo que trae Reporte Info (o
    ' está vacío), vuelve la fórmula; si se había escrito a mano, el valor.
    RestaurarAutocompletado wsG, filaG
    wsG.Calculate
    Dim aux As Long
    For c = 2 To G_ULTIMA_ENTRADA
        aux = AuxiliarDe(c)
        If aux > 0 Then
            If Txt(wsC.Cells(r0, c + 2).Value) <> "" And Txt(wsC.Cells(r0, c + 2).Value) <> Txt(wsG.Cells(filaG, aux).Value) Then
                wsG.Cells(filaG, c).Value = wsC.Cells(r0, c + 2).Value
            End If
        End If
    Next c

    Dim rc As Long, ri As Long, padre As String
    For k = 1 To filasC.Count
        rc = filasC(k)
        ri = filasI(k)
        wsI.Cells(ri, I_CLAVE).Value = clave
        wsI.Cells(ri, I_TIPO).Value = wsC.Cells(rc, 22).Value
        padre = Txt(wsC.Cells(rc, 23).Value)
        If padre <> "" Then
            If nueva.Exists(padre) Then wsI.Cells(ri, I_PADRE).Value = nueva(padre) Else wsI.Cells(ri, I_PADRE).Value = wsC.Cells(rc, 23).Value
        End If
        For c = 5 To 9
            wsI.Cells(ri, c).Value = wsC.Cells(rc, c + 19).Value
        Next c
        wsI.Cells(ri, 10).Value = wsC.Cells(rc, 29).Value   ' Estado carga
        wsI.Cells(ri, 11).Value = wsC.Cells(rc, 30).Value   ' Precio manual
        wsI.Cells(ri, I_REGISTRADO).Value = wsC.Cells(rc, 43).Value
    Next k

    For k = filasC.Count To 1 Step -1
        wsC.Rows(filasC(k)).Delete
    Next k

    DevolverGestionAuto = "OK;" & filaG & ";" & filasC.Count
Fin:
    Proteger wsG: Proteger wsI: Proteger wsC
    Application.Calculation = calculo
    Application.ScreenUpdating = True
    Exit Function
Fallo:
    DevolverGestionAuto = "ERROR;" & Err.Description
    Resume Fin
End Function

' ---------------------------------------------------------------------------
' Auxiliares
' ---------------------------------------------------------------------------

' Filas de Gestiones (de contingencia, Estado CARGADO, con ítems) y de sus ítems.
Private Sub BuscarCargados(ByRef filasG As Collection, ByRef filasI As Collection, ByRef nAlertas As Long)
    Dim wsG As Worksheet, wsI As Worksheet
    Set wsG = ThisWorkbook.Worksheets(HOJA_GESTIONES)
    Set wsI = ThisWorkbook.Worksheets(HOJA_ITEMS)
    Set filasG = New Collection
    Set filasI = New Collection
    nAlertas = 0
    Application.Calculate

    Dim gDatos As Variant, iDatos As Variant, r As Long, claves As Object
    Set claves = CreateObject("Scripting.Dictionary")
    gDatos = wsG.Range(wsG.Cells(PRIMERA, 1), wsG.Cells(UltimaFila(wsG, 1), G_COLUMNAS)).Value
    For r = 1 To UBound(gDatos, 1)
        If Txt(gDatos(r, G_ORIGEN)) = "CONTINGENCIA" And Txt(gDatos(r, G_ESTADO)) = "CARGADO" And Val(Txt(gDatos(r, G_N_ITEMS))) > 0 Then
            If Not claves.Exists(Txt(gDatos(r, 1))) Then
                claves(Txt(gDatos(r, 1))) = True
                filasG.Add r + PRIMERA - 1
            End If
        End If
    Next r
    If filasG.Count = 0 Then Exit Sub

    iDatos = wsI.Range(wsI.Cells(PRIMERA, 1), wsI.Cells(UltimaFila(wsI, I_LINEA), I_COLUMNAS)).Value
    For r = 1 To UBound(iDatos, 1)
        If claves.Exists(Txt(iDatos(r, I_CLAVE))) And Txt(iDatos(r, I_ORIGEN)) = "CONTINGENCIA" Then
            filasI.Add r + PRIMERA - 1
            If Txt(iDatos(r, I_ALERTA)) <> "" Then nAlertas = nAlertas + 1
        End If
    Next r
End Sub

Private Function FilasDeClaveEnCargados(ByVal wsC As Worksheet, ByVal clave As String) As Collection
    Dim filas As New Collection, r As Long, ultima As Long
    ultima = UltimaFila(wsC, C_CLAVE)
    For r = PRIMERA To ultima
        If Txt(wsC.Cells(r, C_CLAVE).Value) = clave Then filas.Add r
    Next r
    Set FilasDeClaveEnCargados = filas
End Function

Private Function UltimaFila(ByVal ws As Worksheet, ByVal columna As Long) As Long
    UltimaFila = ws.Cells(ws.Rows.Count, columna).End(xlUp).Row
    If UltimaFila < PRIMERA - 1 Then UltimaFila = PRIMERA - 1
End Function

' Texto de una celda (los errores de fórmula cuentan como vacío).
Private Function Txt(ByVal v As Variant) As String
    If IsError(v) Then
        Txt = ""
    ElseIf IsEmpty(v) Then
        Txt = ""
    Else
        Txt = Trim(CStr(v))
    End If
End Function

' Columna auxiliar (dato de Reporte Info) de una columna autocompletada, o 0.
Private Function AuxiliarDe(ByVal columna As Long) As Long
    Dim par As Variant
    AuxiliarDe = 0
    For Each par In Split(G_AUTOCOMPLETADO, ",")
        If CLng(Split(par, ":")(0)) = columna Then AuxiliarDe = CLng(Split(par, ":")(1))
    Next par
End Function

' Vuelve a poner en la fila las fórmulas del autocompletado (=AG3, =AH3...).
Private Sub RestaurarAutocompletado(ByVal ws As Worksheet, ByVal fila As Long)
    Dim par As Variant
    For Each par In Split(G_AUTOCOMPLETADO, ",")
        ws.Cells(fila, CLng(Split(par, ":")(0))).Formula = "=" & ws.Cells(fila, CLng(Split(par, ":")(1))).Address(False, False)
    Next par
End Sub

' Mismas opciones que pone el script al generar la planilla (sin contraseña).
Private Sub Proteger(ByVal ws As Worksheet)
    ws.Protect Password:="", DrawingObjects:=False, Contents:=True, Scenarios:=False, _
               AllowFormattingColumns:=True, AllowFormattingRows:=True, AllowFiltering:=True
End Sub

Private Sub Desproteger(ByVal ws As Worksheet)
    ws.Unprotect Password:=""
End Sub

Private Sub CrearBoton(ByVal ws As Worksheet, ByVal nombre As String, ByVal texto As String, ByVal accion As String, ByVal ancho As Double)
    Desproteger ws
    On Error Resume Next
    ws.Buttons(nombre).Delete
    On Error GoTo 0
    Dim b As Object
    Set b = ws.Buttons.Add(ws.Range("A1").Left + 3, ws.Range("A1").Top + 3, ancho, 24)
    b.Name = nombre
    b.Caption = texto
    b.OnAction = accion
    b.Font.Bold = True
    Proteger ws
End Sub
