Attribute VB_Name = "ModContingencia"
' Respaldo de contingencia de Implantes: botones "Mover cargados" (hoja
' Items) y "Devolver a pendientes" (hoja Cargados).
'
' - Mover cargados: las gestiones de contingencia con Estado = CARGADO
'   (todas sus lineas CARGADO, PAD o SIN CARGO; lo calcula la formula de la
'   columna Estado) pasan a la hoja Cargados como VALORES, una fila por linea
'   con la cabecera de su gestion, la fecha/hora y quien las movio. Ademas se
'   agregan a Solicitud Implantes y Resumen. Sus filas en Gestiones e Items
'   se limpian (solo las celdas que se escriben): las formulas quedan.
' - Devolver a pendientes: vuelve una gestion de Cargados a filas libres de
'   Gestiones e Items. Los N de linea son fijos por fila, asi que la linea
'   padre se traduce del N original al N de la fila donde queda.
'
' - Crear libro del mes (hoja Nuevo mes): copia este libro como
'   respaldo_implantes_AAAA-MM.xlsm en la misma carpeta, vacía Gestiones,
'   Items, Cargados, Solicitud Implantes y Resumen, escribe el año y el mes
'   del libro (Catálogos K3 y L3, CELDAS_LIBRO en libroRespaldo.js) y lo abre.
'   Cada libro solo acepta gestiones con fecha de su mes; la plantilla base
'   (sin mes) no deja registrar.
'
' - Marcas de cambio en Códigos, Empresas y Recargos: la columna CAMBIO es
'   una fórmula (NUEVO / MODIFICADO / BORRADO); FECHA CAMBIO la escribe
'   RegistrarCambioCatalogo, llamada desde Workbook_SheetChange del módulo
'   del libro (lo agrega macros/armarXlsm.ps1).
'
' Items y Cargados se leen POR EL TITULO de su encabezado (fila 2), no por
' la posicion: el orden de sus columnas puede cambiar en libroRespaldo.js
' (COLUMNAS_ITEMS, COLUMNAS_CARGADOS) sin tocar este modulo, mientras los
' titulos sean los mismos. Gestiones (COLUMNAS_GESTIONES) usa posiciones.
' Este archivo se importa en Windows-1252: solo caracteres latinos (sin
' rayas largas ni flechas).
Option Explicit

Private Const HOJA_GESTIONES As String = "Gestiones"
Private Const HOJA_ITEMS As String = "Ítems"
Private Const HOJA_CARGADOS As String = "Cargados"
' Las dos hojas del Excel de Solicitud de la app (COLUMNAS_SOLICITUD y
' COLUMNAS_RESUMEN en libroRespaldo.js). Encabezado en la fila 1.
Private Const HOJA_SOLICITUD As String = "Solicitud Implantes"
Private Const HOJA_RESUMEN As String = "Resumen"
Private Const HOJA_CATALOGOS As String = "Catálogos"
Private Const HOJA_NUEVO_MES As String = "Nuevo mes"
' Mes del libro (Catálogos) y datos del libro a crear (Nuevo mes).
Private Const LIBRO_ANIO As String = "K3"
Private Const LIBRO_MES As String = "L3"
Private Const NM_ANIO As String = "B5"
Private Const NM_MES As String = "B6"
Private Const MESES As String = "ENERO,FEBRERO,MARZO,ABRIL,MAYO,JUNIO,JULIO,AGOSTO,SEPTIEMBRE,OCTUBRE,NOVIEMBRE,DICIEMBRE"
Private Const PREFIJO_LIBRO As String = "respaldo_implantes_"
' Mensajes de la validación de Gestiones en un libro con mes (MENSAJES_LIBRO
' en libroRespaldo.js; la plantilla base trae el de "sin mes").
Private Const MSJ_ADMISION As String = "Solo dígitos, sin puntos ni espacios."
' Hojas con marcas de cambio: hoja:primera columna de datos:última:CAMBIO:FECHA CAMBIO
' (MARCAS_CAMBIO en libroRespaldo.js; lo comprueba un test).
Private Const MARCAS As String = "Códigos:2:14:17:18|Empresas:1:3:4:5|Recargos:1:5:6:7"
Private Const MSJ_FECHA As String = "Este libro es de {MES}. Registra esta gestión en el libro del mes de su fecha (respaldo_implantes_AAAA-MM.xlsm)."
Private Const S_COLUMNAS As Long = 18          ' ... FECHA MOVIMIENTO (17), CLAVE (18)
Private Const R_COLUMNAS As Long = 13          ' ... FECHA MOVIMIENTO (12), CLAVE (13)
Private Const PRIMERA As Long = 3
Private Const FILA_TITULOS As Long = 2
' Contraseña de protección de las hojas. En el repo queda solo el marcador:
' generarPlantillaImplantes.js lo reemplaza al armar el .xlsm con el valor de
' la variable de entorno RESPALDO_IMPLANTES_CLAVE_HOJAS.
Private Const CLAVE_HOJAS As String = "__CLAVE_HOJAS__"

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
' Columna de Cargados de cada columna de Gestiones que se escribe (B..P y W).
Private Const G_DESDE_CARGADOS As String = "2:Admisión|3:Fecha|4:Empresa|5:Nombre paciente|6:Total cotización|7:Informe|8:Centro|9:Atributo|10:Lado|11:Observación|12:Convenio|13:Previsión|14:Médico|15:Descripción|16:Estado sin ítems|23:Registrado por (gestión)"

' Items: celdas que se escriben (se limpian al mover y se llenan al devolver).
Private Const I_ENTRADAS As String = "CLAVE|Tipo de línea|Línea padre|N° cotización|Referencia|Cantidad|Lote|Vencimiento|Estado carga|Precio manual|Registrado por"
' Columna de Items de donde sale cada columna de Cargados, como Cargados>Items
' (con '>': algunos títulos tienen ':'). Las de la gestión
' salen de Gestiones; ver ValorGestion).
Private Const C_DESDE_ITEMS As String = "N° línea (original)>N° línea|Tipo de línea>aux: tipo|Línea padre (original)>Línea padre|N° cotización>N° cotización|Referencia>Referencia|Código real>Código real|Cantidad>Cantidad|Lote>Lote|Vencimiento>Vencimiento|Estado carga>aux: estado|Precio manual>Precio manual|Código>Código|Precio unitario>Precio unitario|Empresa producto>Empresa producto|Clase>Clase|Tipo>Tipo|Descriptor>Descriptor|Veces costo>Veces costo|Total ítem>Total ítem|Venta>Venta|Sin código (1 = sí)>aux: sin código|Recargo encontrado (1 = sí)>aux: recargo encontrado|Alerta>Alerta|Registrado por (ítem)>Registrado por|ORIGEN>ORIGEN"

' ---------------------------------------------------------------------------
' Botones
' ---------------------------------------------------------------------------

Public Sub MoverCargados()
    If LibroMes() = 0 Then
        MsgBox "Esta es la plantilla base (sin mes): no tiene gestiones." & vbCrLf & "Cree el libro del mes en la hoja " & HOJA_NUEVO_MES & ".", vbExclamation, "Mover cargados"
        Exit Sub
    End If
    Dim filasG As Collection, filasI As Collection, nAlertas As Long, nFuera As Long
    BuscarCargados filasG, filasI, nAlertas, nFuera
    Dim avisoFuera As String
    If nFuera > 0 Then avisoFuera = vbCrLf & vbCrLf & nFuera & " gestión(es) CARGADO con fecha fuera del mes del libro (" & NombreLibro() & ") no se moverán: regístrelas en el libro de su mes (columna Alerta de Gestiones)."
    If filasG.Count = 0 Then
        MsgBox "No hay gestiones con Estado CARGADO para mover." & vbCrLf & _
               "(Una gestión queda CARGADO cuando todas sus líneas están CARGADO, PAD o SIN CARGO.)" & avisoFuera, _
               vbInformation, "Mover cargados"
        Exit Sub
    End If

    Dim aviso As String
    aviso = "Se moverán " & filasG.Count & " gestión(es) y " & filasI.Count & " ítem(s) a la hoja Cargados." & avisoFuera
    If nAlertas > 0 Then aviso = aviso & vbCrLf & vbCrLf & "Atención: " & nAlertas & " de esos ítems tienen una alerta (columna Alerta de Ítems)."
    aviso = aviso & vbCrLf & vbCrLf & "Sus filas en Gestiones e Ítems quedarán libres para volver a usarlas." & vbCrLf & "¿Continuar?"
    If MsgBox(aviso, vbYesNo + vbQuestion + vbDefaultButton2, "Mover cargados") <> vbYes Then Exit Sub

    Dim quien As String
    quien = Trim(InputBox("Su nombre (queda registrado en la hoja Cargados):", "Mover cargados", Application.UserName))
    If quien = "" Then Exit Sub

    Dim resultado As String
    resultado = MoverCargadosAuto(quien)
    If Left(resultado, 5) = "ERROR" Then
        MsgBox Mid(resultado, 7), vbExclamation, "Mover cargados"
    Else
        MsgBox "Listo: " & Split(resultado, ";")(0) & " gestión(es) y " & Split(resultado, ";")(1) & " ítem(s) movidos a Cargados." & vbCrLf & _
               "Guarde el archivo (Ctrl+G).", vbInformation, "Mover cargados"
    End If
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
    clave = Txt(wsC.Cells(ActiveCell.Row, Col(Titulos(wsC), "CLAVE")).Value)
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

' Crea los botones (una vez, al armar el .xlsm).
Public Sub InstalarBotones()
    CrearBoton ThisWorkbook.Worksheets(HOJA_ITEMS), "btnMoverCargados", "Mover cargados", "MoverCargados", 150
    CrearBoton ThisWorkbook.Worksheets(HOJA_CARGADOS), "btnDevolverPendientes", "Devolver a pendientes", "DevolverAPendientes", 170
    CrearBoton ThisWorkbook.Worksheets(HOJA_NUEVO_MES), "btnCrearLibroMes", "Crear libro del mes", "CrearLibroDelMes", 170, "A9"
End Sub

Public Sub CrearLibroDelMes()
    Dim ws As Worksheet, resultado As String
    Set ws = ThisWorkbook.Worksheets(HOJA_NUEVO_MES)
    resultado = CrearLibroDelMesAuto(ws.Range(NM_ANIO).Value, ws.Range(NM_MES).Value, True)
    If Left(resultado, 5) = "ERROR" Then
        MsgBox Mid(resultado, 7), vbExclamation, "Crear libro del mes"
    Else
        MsgBox "Listo: se creó y se abrió el libro" & vbCrLf & Mid(resultado, 4) & vbCrLf & vbCrLf & _
               "Registre ahí las gestiones de ese mes.", vbInformation, "Crear libro del mes"
    End If
End Sub

' ---------------------------------------------------------------------------
' Lógica sin diálogos (también la usa la prueba automática)
' ---------------------------------------------------------------------------

' Devuelve "gestiones;items;fuera del mes" o "ERROR;mensaje".
' `fechaMovimiento` (opcional): para la prueba automática; el botón usa Now.
Public Function MoverCargadosAuto(ByVal quien As String, Optional ByVal fechaMovimiento As Variant) As String
    Dim wsG As Worksheet, wsI As Worksheet, wsC As Worksheet
    Set wsG = ThisWorkbook.Worksheets(HOJA_GESTIONES)
    Set wsI = ThisWorkbook.Worksheets(HOJA_ITEMS)
    Set wsC = ThisWorkbook.Worksheets(HOJA_CARGADOS)

    If LibroMes() = 0 Then
        MoverCargadosAuto = "ERROR;Esta es la plantilla base (sin mes): cree el libro del mes en la hoja " & HOJA_NUEVO_MES & "."
        Exit Function
    End If
    Dim filasG As Collection, filasI As Collection, nAlertas As Long, nFuera As Long
    BuscarCargados filasG, filasI, nAlertas, nFuera
    If filasG.Count = 0 Then
        MoverCargadosAuto = "0;0;" & nFuera
        Exit Function
    End If

    Dim ti As Object, tc As Object
    Set ti = Titulos(wsI)
    Set tc = Titulos(wsC)

    Dim gDatos As Variant, iDatos As Variant
    gDatos = wsG.Range(wsG.Cells(PRIMERA, 1), wsG.Cells(UltimaFila(wsG, 1), G_COLUMNAS)).Value
    iDatos = wsI.Range(wsI.Cells(PRIMERA, 1), wsI.Cells(UltimaFila(wsI, Col(ti, "N° línea")), UltimaColumna(wsI))).Value

    ' CLAVE -> índice de fila en gDatos
    Dim porClave As Object, fg As Variant
    Set porClave = CreateObject("Scripting.Dictionary")
    For Each fg In filasG
        porClave(Txt(gDatos(fg - PRIMERA + 1, 1))) = fg - PRIMERA + 1
    Next fg

    ' Cargados: una fila por ítem, cada columna según su título.
    Dim nC As Long, tituloC As Variant, desdeItems As Object, par As Variant
    nC = UltimaColumna(wsC)
    Set desdeItems = CreateObject("Scripting.Dictionary")
    For Each par In Split(C_DESDE_ITEMS, "|")
        desdeItems(Split(par, ">")(0)) = Col(ti, Split(par, ">")(1))
    Next par

    Dim salida() As Variant, k As Long, fi As Variant, gi As Long, ii As Long, c As Long, ahora As Date
    ReDim salida(1 To filasI.Count, 1 To nC)
    If IsMissing(fechaMovimiento) Then ahora = Now Else ahora = CDate(fechaMovimiento)
    Dim iClave As Long
    iClave = Col(ti, "CLAVE")
    k = 0
    For Each fi In filasI
        k = k + 1
        ii = fi - PRIMERA + 1
        gi = porClave(Txt(iDatos(ii, iClave)))
        For c = 1 To nC
            tituloC = Txt(wsC.Cells(FILA_TITULOS, c).Value)
            If tituloC = "Movido el" Then
                salida(k, c) = ahora
            ElseIf tituloC = "Movido por" Then
                salida(k, c) = quien
            ElseIf desdeItems.Exists(tituloC) Then
                salida(k, c) = iDatos(ii, desdeItems(tituloC))
            Else
                salida(k, c) = ValorGestion(gDatos, gi, tituloC)
            End If
            If IsError(salida(k, c)) Then salida(k, c) = ""
        Next c
    Next fi

    ' Filas de las hojas Solicitud Implantes y Resumen (como la Solicitud de
    ' la app; ver construirFilasExcelSolicitud). Fechas como texto dd-mm-aaaa.
    Dim sol() As Variant, res() As Variant, fechaTxt As String, tipoLinea As String
    ReDim sol(1 To filasI.Count, 1 To S_COLUMNAS)
    ReDim res(1 To filasI.Count, 1 To R_COLUMNAS)
    fechaTxt = Format(ahora, "dd-mm-yyyy")
    Dim iCodigo As Long, iDescriptor As Long, iCantidad As Long, iPrecio As Long, iTipo As Long
    Dim iCot As Long, iLote As Long, iVenc As Long, iVenta As Long, iTipoEf As Long, iEstadoEf As Long
    iCodigo = Col(ti, "Código"): iDescriptor = Col(ti, "Descriptor"): iCantidad = Col(ti, "Cantidad")
    iPrecio = Col(ti, "Precio unitario"): iTipo = Col(ti, "Tipo"): iCot = Col(ti, "N° cotización")
    iLote = Col(ti, "Lote"): iVenc = Col(ti, "Vencimiento"): iVenta = Col(ti, "Venta")
    iTipoEf = Col(ti, "aux: tipo"): iEstadoEf = Col(ti, "aux: estado")
    k = 0
    For Each fi In filasI
        k = k + 1
        ii = fi - PRIMERA + 1
        gi = porClave(Txt(iDatos(ii, iClave)))
        tipoLinea = Txt(iDatos(ii, iTipoEf))
        sol(k, 1) = Txt(gDatos(gi, 2))                                  ' ID
        sol(k, 2) = OP(gDatos(gi, 5))                                   ' PACIENTE
        sol(k, 3) = OP(gDatos(gi, 14))                                  ' MEDICO
        sol(k, 4) = FechaTexto(gDatos(gi, 3))                           ' FECHA
        sol(k, 5) = OP(gDatos(gi, 4))                                   ' EMPRESA
        sol(k, 6) = OP(iDatos(ii, iCodigo))                             ' CODIGO ("No lleva OC" donde corresponde)
        sol(k, 7) = OP(iDatos(ii, iDescriptor))                         ' DESCRIPCION
        sol(k, 8) = Num(iDatos(ii, iCantidad))                          ' CANTIDAD
        sol(k, 9) = Num(iDatos(ii, iPrecio))                            ' PRECIO
        sol(k, 10) = OP(iDatos(ii, iTipo))                              ' ATRIBUTO (tipo del ítem)
        sol(k, 11) = fechaTxt                                           ' FECHA REGISTRO
        sol(k, 12) = FechaTexto(gDatos(gi, 3))                          ' FECHA CARGA
        sol(k, 13) = OP(iDatos(ii, iCot))                               ' N° COTIZACION
        sol(k, 14) = fechaTxt                                           ' FECHA INGRESO
        sol(k, 15) = LoteSistema(iDatos(ii, iLote), tipoLinea)          ' LOTE
        sol(k, 16) = VencimientoSistema(iDatos(ii, iVenc), tipoLinea)   ' VENCIMIENTO
        sol(k, 17) = DateValue(ahora)                                   ' FECHA MOVIMIENTO
        sol(k, 18) = Txt(gDatos(gi, 1))                                 ' CLAVE
        res(k, 1) = fechaTxt                                            ' Ingreso
        res(k, 2) = IIf(Txt(gDatos(gi, 8)) = "", "PABELLON", Txt(gDatos(gi, 8)))  ' Area (centro)
        res(k, 3) = OP(gDatos(gi, 13))                                  ' Previsión
        res(k, 4) = Txt(gDatos(gi, 2))                                  ' Id
        res(k, 5) = OP(iDatos(ii, iCodigo))                             ' Cód
        res(k, 6) = Num(iDatos(ii, iCantidad))                          ' Cant
        res(k, 7) = Num(iDatos(ii, iVenta))                             ' Venta
        res(k, 8) = OP(gDatos(gi, 14))                                  ' Médico
        res(k, 9) = FechaTexto(gDatos(gi, 3))                           ' Fecha
        res(k, 10) = OP(iDatos(ii, iDescriptor))                        ' Descripción
        res(k, 11) = IIf(Txt(iDatos(ii, iEstadoEf)) = "", "PENDIENTE", Txt(iDatos(ii, iEstadoEf)))  ' Estado
        res(k, 12) = DateValue(ahora)                                   ' FECHA MOVIMIENTO
        res(k, 13) = Txt(gDatos(gi, 1))                                 ' CLAVE
    Next fi

    Dim wsS As Worksheet, wsR As Worksheet
    Set wsS = ThisWorkbook.Worksheets(HOJA_SOLICITUD)
    Set wsR = ThisWorkbook.Worksheets(HOJA_RESUMEN)

    Dim calculo As XlCalculation
    calculo = Application.Calculation
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    On Error GoTo Fallo
    Desproteger wsG: Desproteger wsI: Desproteger wsC: Desproteger wsS: Desproteger wsR

    ' Acumulativo: se agrega debajo de lo que ya hay (encabezado en la fila 1).
    Dim filaS As Long, filaR As Long
    filaS = wsS.Cells(wsS.Rows.Count, S_COLUMNAS).End(xlUp).Row + 1
    filaR = wsR.Cells(wsR.Rows.Count, R_COLUMNAS).End(xlUp).Row + 1
    wsS.Range(wsS.Cells(filaS, 1), wsS.Cells(filaS + filasI.Count - 1, S_COLUMNAS)).Value = sol
    wsR.Range(wsR.Cells(filaR, 1), wsR.Cells(filaR + filasI.Count - 1, R_COLUMNAS)).Value = res

    Dim destino As Long
    destino = UltimaFila(wsC, Col(tc, "CLAVE")) + 1
    If destino < PRIMERA Then destino = PRIMERA
    wsC.Range(wsC.Cells(destino, 1), wsC.Cells(destino + filasI.Count - 1, nC)).Value = salida

    Dim entrada As Variant
    For Each fi In filasI
        For Each entrada In Split(I_ENTRADAS, "|")
            wsI.Cells(fi, Col(ti, entrada)).ClearContents
        Next entrada
    Next fi
    For Each fg In filasG
        wsG.Range(wsG.Cells(fg, 2), wsG.Cells(fg, G_ULTIMA_ENTRADA)).ClearContents
        wsG.Cells(fg, G_REGISTRADO).ClearContents
        RestaurarAutocompletado wsG, CLng(fg)
    Next fg

    MoverCargadosAuto = filasG.Count & ";" & filasI.Count & ";" & nFuera
Fin:
    Proteger wsG: Proteger wsI: Proteger wsC: Proteger wsS: Proteger wsR
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

    Dim ti As Object, tc As Object
    Set ti = Titulos(wsI)
    Set tc = Titulos(wsC)

    Application.Calculate
    Dim gDatos As Variant, iDatos As Variant, r As Long, c As Long, libre As Boolean, entrada As Variant
    gDatos = wsG.Range(wsG.Cells(PRIMERA, 1), wsG.Cells(UltimaFila(wsG, 1), G_COLUMNAS)).Value
    iDatos = wsI.Range(wsI.Cells(PRIMERA, 1), wsI.Cells(UltimaFila(wsI, Col(ti, "N° línea")), UltimaColumna(wsI))).Value

    Dim filaG As Long
    For r = 1 To UBound(gDatos, 1)
        If Txt(gDatos(r, 1)) = clave Then
            DevolverGestionAuto = "ERROR;En Gestiones ya hay una gestión con la CLAVE " & clave & " (fila " & (r + PRIMERA - 1) & "). Cámbiela o bórrela antes de devolver."
            Exit Function
        End If
        If filaG = 0 Then
            libre = (Txt(gDatos(r, G_REGISTRADO)) = "")
            For c = 2 To G_ULTIMA_ENTRADA
                If Txt(gDatos(r, c)) <> "" And AuxiliarDe(c) = 0 Then libre = False
            Next c
            If Txt(gDatos(r, 2)) <> "" Then libre = False
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
        libre = True
        For Each entrada In Split(I_ENTRADAS, "|")
            If Txt(iDatos(r, Col(ti, entrada))) <> "" Then libre = False
        Next entrada
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
        nueva(Txt(wsC.Cells(filasC(k), Col(tc, "N° línea (original)")).Value)) = wsI.Cells(filasI(k), Col(ti, "N° línea")).Value
    Next k

    Dim calculo As XlCalculation
    calculo = Application.Calculation
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    On Error GoTo Fallo
    Desproteger wsG: Desproteger wsI: Desproteger wsC

    ' Gestión: cada columna que se escribe, desde su columna de Cargados.
    Dim r0 As Long, par As Variant, colG As Long, valorC As Variant
    r0 = filasC(1)
    For Each par In Split(G_DESDE_CARGADOS, "|")
        colG = CLng(Split(par, ":")(0))
        If AuxiliarDe(colG) = 0 Then wsG.Cells(filaG, colG).Value = wsC.Cells(r0, Col(tc, Split(par, ":")(1))).Value
    Next par
    ' Autocompletado: si lo guardado es lo mismo que trae Reporte Info (o
    ' está vacío), vuelve la fórmula; si se había escrito a mano, el valor.
    RestaurarAutocompletado wsG, filaG
    wsG.Calculate
    For Each par In Split(G_DESDE_CARGADOS, "|")
        colG = CLng(Split(par, ":")(0))
        If AuxiliarDe(colG) > 0 Then
            valorC = wsC.Cells(r0, Col(tc, Split(par, ":")(1))).Value
            If Txt(valorC) <> "" And Txt(valorC) <> Txt(wsG.Cells(filaG, AuxiliarDe(colG)).Value) Then wsG.Cells(filaG, colG).Value = valorC
        End If
    Next par

    ' Ítems: las celdas que se escriben, desde Cargados (la línea padre se
    ' traduce al N° de la fila donde queda).
    Dim rc As Long, ri As Long, padre As String
    For k = 1 To filasC.Count
        rc = filasC(k)
        ri = filasI(k)
        wsI.Cells(ri, Col(ti, "CLAVE")).Value = clave
        wsI.Cells(ri, Col(ti, "Tipo de línea")).Value = wsC.Cells(rc, Col(tc, "Tipo de línea")).Value
        padre = Txt(wsC.Cells(rc, Col(tc, "Línea padre (original)")).Value)
        If padre <> "" Then
            If nueva.Exists(padre) Then wsI.Cells(ri, Col(ti, "Línea padre")).Value = nueva(padre) Else wsI.Cells(ri, Col(ti, "Línea padre")).Value = padre
        End If
        For Each entrada In Split("N° cotización|Referencia|Cantidad|Lote|Vencimiento|Estado carga|Precio manual", "|")
            wsI.Cells(ri, Col(ti, entrada)).Value = wsC.Cells(rc, Col(tc, entrada)).Value
        Next entrada
        ' En Cargados el estado de una línea PAD es "PAD" (lo calcula Ítems);
        ' en Ítems esa celda va vacía, como al registrarla.
        If Txt(wsC.Cells(rc, Col(tc, "Estado carga")).Value) = "PAD" Then wsI.Cells(ri, Col(ti, "Estado carga")).ClearContents
        wsI.Cells(ri, Col(ti, "Registrado por")).Value = wsC.Cells(rc, Col(tc, "Registrado por (ítem)")).Value
    Next k

    For k = filasC.Count To 1 Step -1
        wsC.Rows(filasC(k)).Delete
    Next k
    QuitarFilasDeClave ThisWorkbook.Worksheets(HOJA_SOLICITUD), S_COLUMNAS, clave
    QuitarFilasDeClave ThisWorkbook.Worksheets(HOJA_RESUMEN), R_COLUMNAS, clave

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
' Marcas de cambio en catálogos
' ---------------------------------------------------------------------------

' Al editar datos de Códigos, Empresas o Recargos: FECHA CAMBIO = hoy en las
' filas que quedaron marcadas (NUEVO, MODIFICADO o BORRADO); vacía si la
' fila volvió a su valor original. Solo mira las filas preparadas.
Public Sub RegistrarCambioCatalogo(ByVal Sh As Object, ByVal Target As Range)
    Dim par As Variant, partes As Variant, ws As Worksheet, zona As Range, area As Range
    Dim colCambio As Long, colFecha As Long, ultima As Long, r As Long
    For Each par In Split(MARCAS, "|")
        partes = Split(par, ":")
        If Sh.Name = partes(0) Then
            Set ws = Sh
            colCambio = CLng(partes(3))
            colFecha = CLng(partes(4))
            ultima = ws.Cells(ws.Rows.Count, colCambio).End(xlUp).Row
            If ultima < PRIMERA Then Exit Sub
            Set zona = Application.Intersect(Target, ws.Range(ws.Cells(PRIMERA, CLng(partes(1))), ws.Cells(ultima, CLng(partes(2)))))
            If zona Is Nothing Then Exit Sub
            Application.EnableEvents = False
            On Error GoTo Fin
            Desproteger ws
            For Each area In zona.Areas
                For r = area.Row To area.Row + area.Rows.Count - 1
                    ws.Cells(r, colCambio).Calculate
                    If Txt(ws.Cells(r, colCambio).Value) = "" Then
                        ws.Cells(r, colFecha).ClearContents
                    Else
                        ws.Cells(r, colFecha).Value = Date
                    End If
                Next r
            Next area
Fin:
            Proteger ws
            Application.EnableEvents = True
            Exit Sub
        End If
    Next par
End Sub

' ---------------------------------------------------------------------------
' Libro del mes
' ---------------------------------------------------------------------------

' Crea respaldo_implantes_AAAA-MM.xlsm en la carpeta de este libro, como copia
' (conserva macros, bloqueo del proyecto VBA y protección), y lo prepara.
' Devuelve "OK;ruta" o "ERROR;mensaje". `abrir` = False lo deja cerrado.
Public Function CrearLibroDelMesAuto(ByVal anio As Variant, ByVal mes As Variant, Optional ByVal abrir As Boolean = True) As String
    If Not EsEntero(anio, 2020, 2100) Then
        CrearLibroDelMesAuto = "ERROR;Escriba un año válido (2020 a 2100) en la hoja " & HOJA_NUEVO_MES & "."
        Exit Function
    End If
    If Not EsEntero(mes, 1, 12) Then
        CrearLibroDelMesAuto = "ERROR;Escriba un mes válido (1 a 12) en la hoja " & HOJA_NUEVO_MES & "."
        Exit Function
    End If
    If ThisWorkbook.Path = "" Then
        CrearLibroDelMesAuto = "ERROR;Guarde este archivo antes de crear el libro del mes."
        Exit Function
    End If
    ' Las filas exportadas del sistema no se vacían con la macro.
    If Application.WorksheetFunction.CountIf(ThisWorkbook.Worksheets(HOJA_GESTIONES).Columns(G_ORIGEN), "SISTEMA") > 0 Then
        CrearLibroDelMesAuto = "ERROR;Este libro tiene filas exportadas del sistema: cree el libro del mes desde la plantilla base (respaldo_implantes.xlsm)."
        Exit Function
    End If

    Dim nombre As String, destino As String, wb As Workbook, resultado As String
    nombre = PREFIJO_LIBRO & CLng(anio) & "-" & Format(CLng(mes), "00") & ".xlsm"
    destino = ThisWorkbook.Path & Application.PathSeparator & nombre
    If Dir(destino) <> "" Then
        CrearLibroDelMesAuto = "ERROR;Ya existe el libro " & nombre & " en esta carpeta: no se sobrescribe. Ábralo desde la carpeta."
        Exit Function
    End If
    For Each wb In Application.Workbooks
        If LCase(wb.Name) = LCase(nombre) Then
            CrearLibroDelMesAuto = "ERROR;Hay un libro abierto con el nombre " & nombre & ": ciérrelo antes."
            Exit Function
        End If
    Next wb

    On Error GoTo Fallo
    ThisWorkbook.SaveCopyAs destino
    Set wb = Application.Workbooks.Open(destino)
    resultado = Application.Run("'" & wb.Name & "'!PrepararLibroDelMes", CLng(anio), CLng(mes))
    If Left(resultado, 2) <> "OK" Then
        wb.Close False
        Kill destino
        CrearLibroDelMesAuto = resultado
        Exit Function
    End If
    wb.Save
    If abrir Then
        wb.Activate
        wb.Worksheets(HOJA_GESTIONES).Activate
    Else
        wb.Close False
    End If
    CrearLibroDelMesAuto = "OK;" & destino
    Exit Function
Fallo:
    CrearLibroDelMesAuto = "ERROR;No se pudo crear " & nombre & ": " & Err.Description
End Function

' Corre en el libro nuevo (ThisWorkbook = la copia): vacía las hojas de
' trabajo y escribe su año y mes. Devuelve "OK" o "ERROR;mensaje".
Public Function PrepararLibroDelMes(ByVal anio As Long, ByVal mes As Long) As String
    Dim wsG As Worksheet, wsI As Worksheet, wsC As Worksheet, wsS As Worksheet, wsR As Worksheet, wsCat As Worksheet
    Set wsG = ThisWorkbook.Worksheets(HOJA_GESTIONES)
    Set wsI = ThisWorkbook.Worksheets(HOJA_ITEMS)
    Set wsC = ThisWorkbook.Worksheets(HOJA_CARGADOS)
    Set wsS = ThisWorkbook.Worksheets(HOJA_SOLICITUD)
    Set wsR = ThisWorkbook.Worksheets(HOJA_RESUMEN)
    Set wsCat = ThisWorkbook.Worksheets(HOJA_CATALOGOS)

    Dim calculo As XlCalculation
    calculo = Application.Calculation
    Application.ScreenUpdating = False
    Application.Calculation = xlCalculationManual
    On Error GoTo Fallo
    Desproteger wsG: Desproteger wsI: Desproteger wsC: Desproteger wsS: Desproteger wsR: Desproteger wsCat

    ' Gestiones: las celdas que se escriben; el autocompletado vuelve a su fórmula.
    Dim ultima As Long, c As Long, par As Variant, entrada As Variant, ti As Object
    ultima = UltimaFila(wsG, 1)
    If ultima >= PRIMERA Then
        For c = 2 To G_ULTIMA_ENTRADA
            If AuxiliarDe(c) = 0 Then wsG.Range(wsG.Cells(PRIMERA, c), wsG.Cells(ultima, c)).ClearContents
        Next c
        wsG.Range(wsG.Cells(PRIMERA, G_REGISTRADO), wsG.Cells(ultima, G_REGISTRADO)).ClearContents
        For Each par In Split(G_AUTOCOMPLETADO, ",")
            wsG.Range(wsG.Cells(PRIMERA, CLng(Split(par, ":")(0))), wsG.Cells(ultima, CLng(Split(par, ":")(0)))).FormulaR1C1 = "=RC" & CLng(Split(par, ":")(1))
        Next par
        ' Mensajes de la validación con el mes de este libro.
        With wsG.Range(wsG.Cells(PRIMERA, 2), wsG.Cells(ultima, 2)).Validation
            .ErrorTitle = "Admisión"
            .ErrorMessage = MSJ_ADMISION
        End With
        With wsG.Range(wsG.Cells(PRIMERA, 3), wsG.Cells(ultima, 3)).Validation
            .ErrorTitle = "Fecha"
            .ErrorMessage = Replace(MSJ_FECHA, "{MES}", Split(MESES, ",")(mes - 1) & " " & anio)
        End With
    End If

    ' Ítems: las celdas que se escriben (N° de línea y fórmulas quedan).
    Set ti = Titulos(wsI)
    ultima = UltimaFila(wsI, Col(ti, "N° línea"))
    If ultima >= PRIMERA Then
        For Each entrada In Split(I_ENTRADAS, "|")
            wsI.Range(wsI.Cells(PRIMERA, Col(ti, entrada)), wsI.Cells(ultima, Col(ti, entrada))).ClearContents
        Next entrada
    End If

    ' Cargados (datos desde la fila 3), Solicitud Implantes y Resumen (desde la 2).
    ultima = UltimaFila(wsC, Col(Titulos(wsC), "CLAVE"))
    If ultima >= PRIMERA Then wsC.Rows(PRIMERA & ":" & ultima).Delete
    ultima = wsS.Cells(wsS.Rows.Count, S_COLUMNAS).End(xlUp).Row
    If ultima >= 2 Then wsS.Rows("2:" & ultima).Delete
    ultima = wsR.Cells(wsR.Rows.Count, R_COLUMNAS).End(xlUp).Row
    If ultima >= 2 Then wsR.Rows("2:" & ultima).Delete

    wsCat.Range(LIBRO_ANIO).Value = anio
    wsCat.Range(LIBRO_MES).Value = mes
    ' Sin "Quitar información personal al guardar" (ver armarXlsm.ps1): si
    ' no, cada guardado muestra una advertencia de privacidad.
    ThisWorkbook.RemovePersonalInformation = False
    PrepararLibroDelMes = "OK"
Fin:
    Proteger wsG: Proteger wsI: Proteger wsC: Proteger wsS: Proteger wsR: Proteger wsCat
    Application.Calculation = calculo
    Application.ScreenUpdating = True
    Application.Calculate
    Exit Function
Fallo:
    PrepararLibroDelMes = "ERROR;No se pudo preparar el libro: " & Err.Description
    Resume Fin
End Function

' Mes del libro (0 en la plantilla base) y su nombre ("NOVIEMBRE 2026").
Private Function LibroMes() As Long
    LibroMes = Val(Txt(ThisWorkbook.Worksheets(HOJA_CATALOGOS).Range(LIBRO_MES).Value))
End Function

Private Function LibroAnio() As Long
    LibroAnio = Val(Txt(ThisWorkbook.Worksheets(HOJA_CATALOGOS).Range(LIBRO_ANIO).Value))
End Function

Private Function NombreLibro() As String
    If LibroMes() < 1 Or LibroMes() > 12 Then Exit Function
    NombreLibro = Split(MESES, ",")(LibroMes() - 1) & " " & LibroAnio()
End Function

' La fecha de una gestión es del mes del libro.
Private Function EsDelMes(ByVal v As Variant) As Boolean
    Dim d As Date
    If IsError(v) Or IsEmpty(v) Then Exit Function
    If VarType(v) = vbDate Then
        d = v
    ElseIf IsNumeric(v) Then
        d = CDate(v)
    Else
        Exit Function
    End If
    EsDelMes = (Year(d) = LibroAnio() And Month(d) = LibroMes())
End Function

Private Function EsEntero(ByVal v As Variant, ByVal minimo As Long, ByVal maximo As Long) As Boolean
    If IsError(v) Or IsEmpty(v) Then Exit Function
    If Not IsNumeric(v) Then Exit Function
    If CDbl(v) <> Int(CDbl(v)) Then Exit Function
    EsEntero = (CDbl(v) >= minimo And CDbl(v) <= maximo)
End Function

' ---------------------------------------------------------------------------
' Auxiliares
' ---------------------------------------------------------------------------

' Filas de Gestiones (de contingencia, Estado CARGADO, con ítems y fecha del
' mes del libro) y de sus ítems. nFuera: las CARGADO de otro mes (pegadas
' saltándose la validación), que no se mueven.
Private Sub BuscarCargados(ByRef filasG As Collection, ByRef filasI As Collection, ByRef nAlertas As Long, ByRef nFuera As Long)
    Dim wsG As Worksheet, wsI As Worksheet
    Set wsG = ThisWorkbook.Worksheets(HOJA_GESTIONES)
    Set wsI = ThisWorkbook.Worksheets(HOJA_ITEMS)
    Set filasG = New Collection
    Set filasI = New Collection
    nAlertas = 0
    nFuera = 0
    Application.Calculate

    Dim gDatos As Variant, iDatos As Variant, r As Long, claves As Object
    Set claves = CreateObject("Scripting.Dictionary")
    gDatos = wsG.Range(wsG.Cells(PRIMERA, 1), wsG.Cells(UltimaFila(wsG, 1), G_COLUMNAS)).Value
    For r = 1 To UBound(gDatos, 1)
        If Txt(gDatos(r, G_ORIGEN)) = "CONTINGENCIA" And Txt(gDatos(r, G_ESTADO)) = "CARGADO" And Val(Txt(gDatos(r, G_N_ITEMS))) > 0 Then
            If Not EsDelMes(gDatos(r, 3)) Then
                nFuera = nFuera + 1
            ElseIf Not claves.Exists(Txt(gDatos(r, 1))) Then
                claves(Txt(gDatos(r, 1))) = True
                filasG.Add r + PRIMERA - 1
            End If
        End If
    Next r
    If filasG.Count = 0 Then Exit Sub

    Dim ti As Object, iClave As Long, iOrigen As Long, iAlerta As Long
    Set ti = Titulos(wsI)
    iClave = Col(ti, "CLAVE"): iOrigen = Col(ti, "ORIGEN"): iAlerta = Col(ti, "Alerta")
    iDatos = wsI.Range(wsI.Cells(PRIMERA, 1), wsI.Cells(UltimaFila(wsI, Col(ti, "N° línea")), UltimaColumna(wsI))).Value
    For r = 1 To UBound(iDatos, 1)
        If claves.Exists(Txt(iDatos(r, iClave))) And Txt(iDatos(r, iOrigen)) = "CONTINGENCIA" Then
            filasI.Add r + PRIMERA - 1
            If Txt(iDatos(r, iAlerta)) <> "" Then nAlertas = nAlertas + 1
        End If
    Next r
End Sub

' Valor de la gestión para una columna de Cargados (por su título).
Private Function ValorGestion(ByVal gDatos As Variant, ByVal gi As Long, ByVal titulo As String) As Variant
    Dim par As Variant
    ValorGestion = ""
    If titulo = "CLAVE" Then ValorGestion = gDatos(gi, 1): Exit Function
    If titulo = "Estado gestión" Then ValorGestion = gDatos(gi, G_ESTADO): Exit Function
    For Each par In Split(G_DESDE_CARGADOS, "|")
        If Split(par, ":")(1) = titulo Then ValorGestion = gDatos(gi, CLng(Split(par, ":")(0))): Exit Function
    Next par
End Function

' Títulos de la fila de encabezados -> N° de columna.
Private Function Titulos(ByVal ws As Worksheet) As Object
    Dim d As Object, c As Long, t As String
    Set d = CreateObject("Scripting.Dictionary")
    For c = 1 To UltimaColumna(ws)
        t = Txt(ws.Cells(FILA_TITULOS, c).Value)
        If t <> "" And Not d.Exists(t) Then d(t) = c
    Next c
    Set Titulos = d
End Function

' Columna de un título; si no existe, error claro (la planilla no coincide con la macro).
Private Function Col(ByVal titulos As Object, ByVal titulo As String) As Long
    If Not titulos.Exists(titulo) Then Err.Raise vbObjectError + 1, "ModContingencia", "No se encontró la columna """ & titulo & """: la planilla no coincide con la macro."
    Col = titulos(titulo)
End Function

Private Function UltimaColumna(ByVal ws As Worksheet) As Long
    UltimaColumna = ws.Cells(FILA_TITULOS, ws.Columns.Count).End(xlToLeft).Column
End Function

Private Function FilasDeClaveEnCargados(ByVal wsC As Worksheet, ByVal clave As String) As Collection
    Dim filas As New Collection, r As Long, ultima As Long, cClave As Long
    cClave = Col(Titulos(wsC), "CLAVE")
    ultima = UltimaFila(wsC, cClave)
    For r = PRIMERA To ultima
        If Txt(wsC.Cells(r, cClave).Value) = clave Then filas.Add r
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

' Quita (de abajo hacia arriba) las filas de una gestión en Solicitud
' Implantes o Resumen, buscando su CLAVE en la última columna.
Private Sub QuitarFilasDeClave(ByVal ws As Worksheet, ByVal colClave As Long, ByVal clave As String)
    Dim r As Long
    Desproteger ws
    For r = ws.Cells(ws.Rows.Count, colClave).End(xlUp).Row To 2 Step -1
        If Txt(ws.Cells(r, colClave).Value) = clave Then ws.Rows(r).Delete
    Next r
    Proteger ws
End Sub

' Valor o "P" si está vacío (como el Excel de Solicitud de la app).
Private Function OP(ByVal v As Variant) As String
    OP = Txt(v)
    If OP = "" Then OP = "P"
End Function

' Número (0 si está vacío o no es número), como "|| 0" en la app.
Private Function Num(ByVal v As Variant) As Variant
    If IsError(v) Then
        Num = 0
    ElseIf IsNumeric(v) And Not IsEmpty(v) Then
        Num = CDbl(v)
    Else
        Num = 0
    End If
End Function

' Fecha como texto dd-mm-aaaa (formatearFechaExcel de la app); un texto que
' no es fecha ("Sin fecha", "PAD") queda tal cual.
Private Function FechaTexto(ByVal v As Variant) As String
    If IsError(v) Or IsEmpty(v) Then
        FechaTexto = ""
    ElseIf VarType(v) = vbDate Then
        FechaTexto = Format(v, "dd-mm-yyyy")
    ElseIf IsNumeric(v) Then
        FechaTexto = Format(CDate(v), "dd-mm-yyyy")
    Else
        FechaTexto = Trim(CStr(v))
    End If
End Function

' Lote y vencimiento como los guarda el sistema al cargar: el PAD PADRE
' lleva "PAD"; el contenido del PAD, "P" y vacío; las demás líneas,
' "Sin lote" y "Sin fecha" si no se escribieron.
Private Function LoteSistema(ByVal v As Variant, ByVal tipoLinea As String) As String
    LoteSistema = Txt(v)
    If tipoLinea = "PAD PADRE" Then
        LoteSistema = "PAD"
    ElseIf LoteSistema = "" Then
        If tipoLinea = "CONTENIDO PAD" Then LoteSistema = "P" Else LoteSistema = "Sin lote"
    End If
End Function

Private Function VencimientoSistema(ByVal v As Variant, ByVal tipoLinea As String) As String
    VencimientoSistema = FechaTexto(v)
    If tipoLinea = "PAD PADRE" Then
        VencimientoSistema = "PAD"
    ElseIf VencimientoSistema = "" And tipoLinea <> "CONTENIDO PAD" Then
        VencimientoSistema = "Sin fecha"
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

' Mismas opciones que pone el script al generar la planilla.
Private Sub Proteger(ByVal ws As Worksheet)
    ws.Protect Password:=CLAVE_HOJAS, DrawingObjects:=False, Contents:=True, Scenarios:=False, _
               AllowFormattingColumns:=True, AllowFormattingRows:=True, AllowFiltering:=True
End Sub

Private Sub Desproteger(ByVal ws As Worksheet)
    ws.Unprotect Password:=CLAVE_HOJAS
End Sub

Private Sub CrearBoton(ByVal ws As Worksheet, ByVal nombre As String, ByVal texto As String, ByVal accion As String, ByVal ancho As Double, Optional ByVal celda As String = "A1")
    Desproteger ws
    On Error Resume Next
    ws.Buttons(nombre).Delete
    On Error GoTo 0
    Dim b As Object
    Set b = ws.Buttons.Add(ws.Range(celda).Left + 3, ws.Range(celda).Top + 3, ancho, 24)
    b.Name = nombre
    b.Caption = texto
    b.OnAction = accion
    b.Font.Bold = True
    Proteger ws
End Sub
