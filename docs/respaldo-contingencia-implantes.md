# Respaldo de contingencia de Implantes

## Plantilla (lo que se usa hoy)

Decisión del 23-11-2026: por ahora se usa una **plantilla** sin datos de pacientes, sin conexión a Firestore, sin credenciales y sin tarea programada. La exportación automática con datos del sistema (más abajo) queda para más adelante.

El script genera **un solo archivo**, la **plantilla base**: `C:\Users\<usuario>\Documents\Medra\Contingencia\respaldo_implantes.xlsm`.
- Se reemplaza cada vez que se regenera.
- En esa carpeta no quedan copias, pruebas ni archivos intermedios: el script los arma en una carpeta temporal del sistema y la borra al terminar, también si algo falla.
- La plantilla base no tiene mes y no deja registrar: solo sirve para crear los **libros mensuales** (`respaldo_implantes_AAAA-MM.xlsm`, en la misma carpeta) con el botón "Crear libro del mes". Ver "Un libro por mes".

Tiene 15 hojas, en este orden:

| # | Hoja | Qué tiene |
|---|---|---|
| 1 | Instrucciones | Cómo usarla, de dónde salen los catálogos y la fecha en que se cargaron |
| 2 | Nuevo mes | Año y mes, con el botón "Crear libro del mes" |
| 3 | Gestiones | 1.000 filas; en la fila 1, el mes del libro ("LIBRO NOVIEMBRE 2026") |
| 4 | Ítems | 4.000 filas, con el botón "Mover cargados" |
| 5 | Cargados | Gestiones ya cargadas, con el botón "Devolver a pendientes" |
| 6 | Solicitud Implantes | Como la hoja del Excel de Solicitud de la app; se llena al mover (acumulativo) |
| 7 | Resumen | Como la hoja Resumen del Excel de Solicitud; se llena al mover (acumulativo) |
| 8 | Reporte Info | Admisiones de los últimos 60 días (autocompletado de Gestiones) |
| 9 | Códigos | Maestro de Códigos (búsqueda por referencia en Ítems). EMPRESA, TIPO, SEGMENTO y CLASE con desplegable y en rojo si el valor no está en su lista |
| 10 | Empresas | Desplegable de Empresa en Gestiones |
| 11 | Centros | Desplegable de Centro en Gestiones |
| 12 | Recargos | Rangos de recargo (veces costo y venta en Ítems) |
| 13 | Previsiones | Desplegable de Previsión en Gestiones |
| 14 | Convenios | Desplegable de Convenio en Gestiones |
| 15 | Catálogos | Listas fijas del sistema (estados, informe, lado, tipo de línea, y Tipo, Segmento y Clase de Códigos), los meses y el mes del libro (K3 año, L3 mes) |

La hoja Documentos se eliminó el 23-11-2026 (no se usa).

### Bloquear el proyecto VBA (a mano, después de cada regeneración)

Las macros guardan la contraseña de las hojas. Para que no se vea con Alt+F11, hay que bloquear el proyecto VBA con esa misma contraseña.
- Excel no ofrece una forma de hacerlo por automatización: no hay función para eso.
- Las alternativas (simular teclas en el diálogo, o escribir la estructura cifrada del proyecto dentro del archivo) son frágiles o arriesgan dejar las macros inutilizables.
- Por eso es un paso manual. El script lo recuerda al terminar, y la hoja Instrucciones repite los pasos:

1. Abra respaldo_implantes.xlsm en Excel (no hace falta habilitar las macros) y presione Alt+F11.
2. En el Explorador de proyectos (Ctrl+R si no se ve), haga clic derecho en "VBAProject (respaldo_implantes.xlsm)" → "Propiedades de VBAProject...".
3. Pestaña "Protección": marque "Bloquear proyecto para visualización" y escriba la contraseña de las hojas (variable RESPALDO_IMPLANTES_CLAVE_HOJAS) en "Contraseña" y en "Confirmar contraseña". Aceptar.
4. Cierre el editor, guarde (Ctrl+G) y cierre Excel. El bloqueo se aplica al volver a abrir.
5. Compruebe: abra el archivo, Alt+F11 y doble clic en "VBAProject": debe pedir contraseña.

Si se regenera el archivo, el bloqueo se pierde (el archivo es nuevo) y hay que repetir estos pasos.

### Protección de hojas y fórmulas ocultas

- Todas las hojas están protegidas con contraseña. Toda celda con fórmula queda **Oculta**: al seleccionarla, la barra de fórmulas muestra solo el resultado.
- Las celdas donde se escribe o se pega siguen desbloqueadas. Las fórmulas del autocompletado de Gestiones (E, L a O) quedan desbloqueadas y ocultas, para poder escribir encima.
- Los filtros, los desplegables y los botones funcionan con las hojas protegidas: las macros desprotegen y vuelven a proteger con la misma contraseña.
- **La contraseña sale de la variable de entorno `RESPALDO_IMPLANTES_CLAVE_HOJAS`** (mínimo 8 caracteres, sin tildes ni caracteres especiales fuera de los comunes). Sin ella, el script no genera nada.
  - En el repo nunca está: el módulo VBA tiene el marcador `__CLAVE_HOJAS__` y el script lo reemplaza solo en la copia temporal con que arma el `.xlsm`.
  - En el archivo queda el hash de la protección (SHA-512) y la contraseña dentro del módulo VBA, porque los botones necesitan desproteger (decisión del 23-11-2026). Para que no se vea con Alt+F11 se bloquea el proyecto VBA (sección anterior). Aun así, la protección de hojas de Excel es una barrera contra cambios por error, no una medida de seguridad fuerte.
- Configurarla una vez, en PowerShell (después abrir una terminal nueva):

  ```powershell
  [Environment]::SetEnvironmentVariable('RESPALDO_IMPLANTES_CLAVE_HOJAS', '<contraseña>', 'User')
  ```

  Guárdela también en el gestor de contraseñas de la clínica. Si se pierde, basta definir una nueva y regenerar el archivo. Para desproteger una hoja a mano (Revisar → Desproteger hoja) se usa esa misma contraseña.

- Trae fórmulas, desplegables, alertas y los botones "Mover cargados" y "Devolver a pendientes".
- Los catálogos (Reporte Info, Códigos, Empresas, Previsiones, Convenios, Centros y Recargos) se cargan desde los archivos que exporta la app o, en el caso de Reporte Info, desde el Excel de la clínica.
- No lleva contraseña: se le pone en Excel antes de usarla, porque una vez usada tiene datos de pacientes.

### Regenerar con archivos nuevos (cuando cambien precios o referencias)

1. En la app, exportar los maestros. Los nombres de archivo ya traen la fecha, y el script la usa como fecha de los catálogos:

   | Catálogo | Dónde se exporta | Archivo |
   |---|---|---|
   | Códigos (con código) | Maestros → Codigos → pestaña "Con código" → Importar / Exportar → Exportar registros | `registros_con_codigo_AAAA-MM-DD.csv` |
   | Códigos (sin código) | Maestros → Codigos → pestaña "Sin código" → Importar / Exportar → Exportar | `codigos_pendientes_AAAA-MM-DD.xlsx` |
   | Empresas | Maestros → Empresas → configuración → Exportar a Excel / CSV | `empresas_maestros_AAAA-MM-DD.xlsx` |
   | Centros | Maestros → Centros → configuración → Exportar (hoja Centros) | `centros_maestros_AAAA-MM-DD.xlsx` |
   | Recargos | Maestros → Recargos → configuración → Exportar (hoja Recargos; las fórmulas de veces costo y venta la leen) | `recargos_maestros_AAAA-MM-DD.xlsx` |
   | Reporte Info | El **Excel de la clínica** que se importa en Documentos → Reportes Info (uno o varios, por ejemplo uno por mes) | el nombre que tenga |
   | Previsiones | Maestros → Previsiones → configuración → Exportar | `previsiones_maestros_AAAA-MM-DD.xlsx` |
   | Convenios | Maestros → Convenios → configuración → Exportar | `convenios_maestros_AAAA-MM-DD.xlsx` |

   - **Reporte Info:** el botón "Exportar" de Reportes Info **no trae Convenio**. Además exporta un mes a la vez y solo las columnas que el usuario ve. Sirve, pero Convenio queda vacío y el script lo avisa. Por eso conviene el archivo original de la clínica, que trae todas las columnas.

   - El CSV de Códigos debe exportarlo un usuario que vea **todas** las columnas, porque el export solo trae las visibles.
   - Desde el PR #9 el CSV trae también `ESTADO`, la única columna nueva y que va al final. Hace falta porque la pestaña "Con código" muestra las inactivas y no permite filtrarlas por estado; sin esa columna, la plantilla ofrecería códigos que el sistema no ofrece. Con un CSV anterior, el script avisa que no pudo quitar las inactivas.
2. Usar los archivos donde quedaron al descargarlos (por ejemplo, Descargas). **No los copie a la carpeta Contingencia**, que solo debe tener `respaldo_implantes.xlsm`. Desde la raíz del repo:

   ```powershell
   $d = "$env:USERPROFILE\Downloads"
   node scripts/respaldoImplantes/generarPlantillaImplantes.js `
     --codigos  "$d\registros_con_codigo_2026-11-23.csv" `
     --codigos  "$d\codigos_pendientes_2026-11-23.xlsx" `
     --empresas "$d\empresas_maestros_2026-11-23.xlsx" `
     --centros  "$d\centros_maestros_2026-11-23.xlsx" `
     --recargos "$d\recargos_maestros_2026-11-23.xlsx" `
     --reporte-info "$d\reporte_clinica_octubre.xlsx" `
     --reporte-info "$d\reporte_clinica_noviembre.xlsx" `
     --previsiones "$d\previsiones_maestros_2026-11-23.xlsx" `
     --convenios "$d\convenios_maestros_2026-11-23.xlsx"
   ```

   - El archivo sale siempre en `Documents\Medra\Contingencia\respaldo_implantes.xlsm` del usuario. `--salida "<carpeta>"` cambia la carpeta (debe estar fuera del repo).
   - Después de generar, borre los archivos exportados de Descargas: Reporte Info tiene datos de pacientes.

   - `--reporte-info` se puede repetir. Se cargan solo las filas de los últimos **60 días**; con `--dias 90` (u otro número) se cambia el período.
   - Sin `--previsiones` o `--convenios`, esas listas se arman con los valores distintos que aparecen en Reporte Info.

   Cada `--…` es opcional: el catálogo que no se indique queda vacío para pegarlo a mano. Acepta `.csv` y `.xlsx`.
3. El script hace lo siguiente:
   - quita las inactivas de Códigos, las empresas inactivas y los centros que no se usan en Gestiones;
   - reemplaza `respaldo_implantes.xlsm`. Si está abierto en Excel, no lo toca, avisa "ciérrelo en Excel y vuelva a intentarlo" y no deja archivos sueltos (comprobado);
   - muestra cuántos registros cargó de cada archivo.
4. Volver a distribuir la plantilla nueva al equipo. Un archivo de contingencia **ya en uso** no se actualiza solo: sus catálogos se reemplazan pegando a mano, como explica su hoja Instrucciones.

### Controles de la hoja Códigos

- EMPRESA tiene la lista de la hoja Empresas. TIPO, SEGMENTO y CLASE tienen las listas del sistema, importadas de `TIPOS_CODIGO` y `SEGMENTOS_CODIGO` (`camposCodigo.js`) y de `CLASES_CODIGO` (`clasesCodigo.js`):
  - TIPO: COTIZACION, CONSIGNACION.
  - SEGMENTO: IMPLANTES, CONSIGNACION, HEMODINAMIA.
  - CLASE: IMPLANTE, INSUMOS, PAD, KIT. Es INSUMOS, en plural, como en el sistema.
- Los desplegables avisan pero no bloquean, porque la importación masiva del sistema no valida estos campos y puede haber valores antiguos.
- Pegar encima con "pegar todo" borra la validación. Por eso, además, un formato condicional pinta de rojo cualquier valor que no esté en su lista: el control funciona aunque se pegue encima. Con la lista vacía (por ejemplo, la hoja Empresas sin cargar) no se marca nada.

### Catálogos provisionales

Un archivo que no tiene el nombre de la exportación oficial de la app (por ejemplo `recargos_maestros_AAAA-MM-DD.xlsx`) se carga igual, pero queda marcado como **PROVISIONAL**:
- en Instrucciones aparece "cargados de forma PROVISIONAL. Deben reemplazarse por la exportación oficial de la app", sin el nombre del archivo;
- el script avisa al generar.

El 23-11-2026 los Recargos se cargaron así, transcritos de un pantallazo de Maestros → Recargos (15 rangos, todos como ACTIVO). Hay que reemplazarlos por el export oficial.

### Códigos: "Con código" + "Sin código"

La vista general de Códigos Maestros no se puede exportar, pero es exactamente la suma de las pestañas "Con código" (registros con código o con la marca `tieneCodigo`) y "Sin código" (registros sin código). Por eso:
- `--codigos` se puede repetir y se pasan los dos exports.
- El script los une (`unirCodigos`) y quita repetidos: un registro marcado como con código pero con el código vacío aparece en las dos pestañas. Se considera el mismo registro si coinciden código, referencia y empresa.
- Van primero los que tienen código, así una referencia que está con y sin código en la misma empresa encuentra la que tiene código.
- Las referencias sin código **sí van en la plantilla**: Cargas las ofrece al escribir la referencia (el autocompletado solo exige que estén activas), y al elegirlas la línea queda "sin código" y la gestión INCOMPLETO. En la plantilla pasa lo mismo: se completan empresa, precio y descriptor, y la alerta dice "Sin código".
- El export de "Sin código" trae ESTADO al final desde la rama `feat/contingencia-codigos-sin-codigo` (`useImportExportPendientes.js`, igual que "Con código"). Con un export anterior a ese despliegue sus inactivas no se pueden quitar y el script lo avisa.

### Reporte Info y autocompletado en Gestiones

La hoja Reporte Info tiene **una fila por admisión**, como la arma `reporteInfoDesdeFilas` (`catalogosExportados.js`). Toma los mismos campos que el sistema al escribir el ID en Gestiones (`handleIdChange` en `useGestionesImplantesData.js`):

| Gestiones | Reporte Info |
|---|---|
| Convenio | "Convenio" |
| Previsión | "Isapre" (no la columna "Previsión") |
| Médico | "1° Cirujano" |
| Descripción | "Descripción" |
| Nombre | "Paciente" (el sistema no lo completa; se agregó a pedido) |

- El sistema usa el primer registro de la admisión. La plantilla usa el primero por fecha y Cod.Artículo, y si un campo viene vacío, toma el del siguiente registro que lo tenga.
- En Gestiones, las columnas ocultas AF a AK buscan la admisión, como texto, en Reporte Info. Las celdas visibles E y L a O muestran ese dato con `=AG3`, `=AH3`, etc.
- Esas celdas están desbloqueadas: se puede escribir encima y solo cambia esa celda. El dato a mano se ve en letra azul cursiva.
- Para volver al dato de Reporte Info, se copia la celda de otra fila.
- "Mover cargados" restaura esas fórmulas al liberar una fila. "Devolver a pendientes" deja la fórmula donde el dato coincide con Reporte Info y el valor donde se había escrito a mano.
- La columna **Alerta** (AE) avisa "Admisión no está en Reporte Info", y la Admisión se pinta naranja. También avisa "Convenio fuera de la lista" y "Previsión fuera de la lista".
- Convenio y Previsión tienen desplegable (hojas Convenios y Previsiones) con estilo **advertencia**: Excel pregunta, pero deja usar el valor.

### Cómo se insertan las macros

exceljs no puede escribir macros. El script genera el `.xlsx` y llama a `macros/armarXlsm.ps1`, que abre el archivo en Excel, importa `macros/ModContingencia.bas`, crea los botones con su macro `InstalarBotones` y lo guarda como `.xlsm`. Por eso hace falta Excel instalado en el equipo donde se corre.

- Importar VBA por automatización exige "Confiar en el acceso al modelo de objetos de proyectos de VBA" (`AccessVBOM`). El script lo activa **solo mientras arma el archivo** y después deja el valor que había.
- Excel vuelve a escribir esa opción al cerrarse, así que el script espera a que su propia instancia de Excel termine (sin tocar otros Excel abiertos), restaura el valor y lo vuelve a comprobar.
- Los botones apuntan al libro donde están: una copia renombrada usa sus propias macros (comprobado).
- Si Excel no logra armar el archivo, el script falla, informa el error y deja intacto el `respaldo_implantes.xlsm` anterior.

### Macros

### Un libro por mes

Decisión del 23-11-2026, para que el archivo no crezca: un libro por mes, `respaldo_implantes_AAAA-MM.xlsm`.
- **Crear:** hoja "Nuevo mes" → Año y Mes (1 a 12) → botón "Crear libro del mes" (macro `CrearLibroDelMes`). Valida año (2020 a 2100) y mes, y crea el libro en la carpeta del archivo abierto con `SaveCopyAs`, que conserva macros, bloqueo del proyecto VBA y protección. Después lo abre y corre en él `PrepararLibroDelMes`, que vacía Gestiones, Ítems (las celdas que se escriben; N° de línea y fórmulas quedan), Cargados, Solicitud Implantes y Resumen, restaura el autocompletado y escribe el año y el mes en Catálogos K3 y L3. Queda abierto en Gestiones.
- **El libro del mes es el que manda** (aclaración del 23-11-2026): durante el mes ahí se agregan o corrigen los catálogos, y a fin de mes el libro siguiente se crea **desde ese mismo libro**. La plantilla base solo se usa para crear el primer libro; una plantilla regenerada no trae los cambios hechos en los libros.
- **Se mantienen:** Códigos, Empresas, Centros, Recargos, Previsiones, Convenios, Reporte Info, Catálogos e Instrucciones, tal como estén en el libro desde el que se crea (con los cambios del mes y sus marcas), y todas sus filas preparadas.
- **No se traspasan gestiones:** las pendientes se quedan en el libro de su mes. Todos los libros tienen las mismas columnas (sirve para el resumen anual).
- **Repetido:** si ya existe el libro de ese año y mes en la carpeta (o hay uno abierto con ese nombre), no lo sobrescribe y avisa. Tampoco se crea desde un libro con filas exportadas del sistema.
- **Solo fechas de su mes:** la Fecha de Gestiones tiene una validación que exige el año y el mes de Catálogos K3/L3; no depende de la fecha de hoy. El mensaje dice "Este libro es de NOVIEMBRE 2026. Registra esta gestión en el libro del mes de su fecha…". Excel no permite que el mensaje de una validación dependa del valor escrito, así que el mes que corresponde lo dice la Alerta.
- **Lo pegado se salta la validación:** la Fecha se pinta de rojo, la Alerta (en rojo) dice "Fecha fuera del mes del libro (es de OCTUBRE 2026)" y "Mover cargados" no mueve esas gestiones: las cuenta y lo avisa (`MoverCargadosAuto` devuelve `gestiones;ítems;fuera del mes`).
- **Plantilla base (sin mes):** Admisión y Fecha rechazan todo con el mensaje "Esta es la plantilla base (sin mes): no permite registrar…" (sin ellas no hay CLAVE para Ítems), la fila 1 de Gestiones lo dice en rojo y "Mover cargados" no hace nada. La macro cambia esos mensajes al crear el libro.
- Las validaciones de Admisión y Fecha van **sin "Omitir blancos"**: con esa opción, Excel no valida cuando la fórmula mira una celda vacía (el mes de la plantilla base).
- El mes del libro se ve en la fila 2 de Instrucciones, en "Nuevo mes", en la fila 1 de Gestiones y en el nombre del archivo.
- El modo con datos del sistema arma el libro ya con su mes (`libroMes`, el mes exportado).

Probado en Excel 16 (23-11-2026), en una carpeta de prueba que se borró al terminar. La aceptación se midió con `Range.Validation.Value`, porque escribir por automatización no dispara la validación, igual que pegar:
- base: rechaza Admisión y Fecha, y "Mover cargados" no hace nada; mes 13 y año 1999 se rechazan;
- libro de noviembre 2026: acepta 20-11-2026 y rechaza 15-10-2026 (en rojo, con la alerta); con las dos gestiones CARGADO, "Mover cargados" movió solo la de noviembre (`1;1;1`);
- crear noviembre otra vez: "Ya existe el libro…";
- libro de octubre 2026: acepta 15-10-2026 y rechaza 20-11-2026;
- diciembre creado desde el libro de noviembre con datos: Gestiones, Ítems, Cargados, Solicitud y Resumen vacías, el autocompletado restaurado, las mismas columnas y todas las hojas protegidas; noviembre conservó su gestión.

### Catálogos editables y marcas de cambio

- **Edición con las hojas protegidas:** las celdas de datos de Códigos (B a N), Empresas, Centros, Recargos, Previsiones, Convenios y Reporte Info (A a G) están desbloqueadas en todas las filas preparadas. Para agregar se escribe en la primera fila vacía; no se insertan ni borran filas (bloqueado). Las fórmulas (Códigos A, O, P; Reporte Info H; las marcas) siguen bloqueadas y ocultas.
- **Las búsquedas cubren todas las filas preparadas:** Ítems busca en Códigos, y los recargos, los desplegables de Gestiones (Empresa, Centro, Convenio, Previsión) y el autocompletado desde Reporte Info, sobre el rango completo. Una fila nueva se reconoce sin hacer nada. Filas preparadas (`MINIMO_CATALOGOS`): Códigos 6.000, Empresas 300, Centros 100, Recargos 50, Previsiones 200, Convenios 300 y Reporte Info 10.000 (subió de 3.000 porque se pega a mano el Excel de la clínica, con varias filas por admisión). Si un catálogo trae más, se dejan 1,5 veces lo cargado.
- **Catálogos pegados a mano** (decisión del 23-11-2026): la plantilla base se genera con todos los catálogos vacíos (el script sin `--codigos` ni los demás archivos) y el usuario los pega. Instrucciones, sección "PEGAR LOS CATÁLOGOS", dice en qué celda pegar cada uno y el orden de sus columnas (el de la fila 2). Probado en Excel con las hojas protegidas: tanto "Pegar valores" como el pegado normal funcionan y no dañan las fórmulas, la protección, el desbloqueo de las celdas ni los desplegables de Códigos. Un código con ceros a la izquierda llega como número si el CSV se abrió con doble clic; Instrucciones explica cómo evitarlo.
- **Orden la primera vez:** en la plantilla base, pegar los catálogos, "Fijar catálogos como base", guardar, y crear el libro del mes con "Nuevo mes". "Crear libro del mes" funciona desde la plantilla base y copia lo que haya en ella.
- **Fijar catálogos como base** (botón en Códigos, A1; macro `FijarCatalogosBase` / `FijarCatalogosBaseAuto`): pide confirmación ("Se reiniciarán todas las marcas de cambio. ¿Continuar?"), copia los datos actuales de Códigos, Empresas, Centros y Recargos a sus columnas `orig: …` y borra FECHA CAMBIO, así CAMBIO queda vacío. Se usa después de pegar los catálogos y después de pasar los cambios al Maestro de la app.
- **Marcas (Códigos, Empresas, Centros y Recargos, `MARCAS_CAMBIO`):** a la derecha de los datos van CAMBIO, FECHA CAMBIO y una columna oculta `orig: …` por cada dato, con el valor original (el de la última vez que se fijó la base).
  - CAMBIO es una fórmula: NUEVO (fila sin original), MODIFICADO (alguna celda distinta de su original) o BORRADO (fila vaciada que tenía original). Se pinta verde, ámbar o rojo. Compara celda a celda y sin convertir a texto, así no depende del separador decimal del equipo. Excel compara textos sin distinguir mayúsculas, así que un cambio solo de mayúsculas no se marca.
  - FECHA CAMBIO la escribe `RegistrarCambioCatalogo` (en `ModContingencia.bas`), llamada desde `Workbook_SheetChange`, que `armarXlsm.ps1` agrega al módulo del libro (ThisWorkbook o EsteLibro). Con las macros deshabilitadas queda vacía.
  - Volver a escribir el valor original quita la marca y la fecha.
  - Las marcas y los originales viajan con la copia al libro del mes siguiente; se reinician solo al regenerar la plantilla, después de pasar los cambios al Maestro de la app.
- **Reporte Info:** Instrucciones explica cómo pegar uno nuevo en el libro del mes, columna por columna desde A3, con "Pegar valores". Se puede pegar con admisiones repetidas, porque se usa la primera de cada una.
- **Advertencia de privacidad al guardar:** Excel dejaba activada en el libro la opción "Quitar información personal al guardar" (`RemovePersonalInformation`). Con macros, esa opción muestra en cada guardado "Ten cuidado: es posible que algunas partes del documento incluyan información personal…" y una macro que guarda queda esperando. `armarXlsm.ps1` y `PrepararLibroDelMes` la desactivan.

### Vista de carga y Código real (Ítems y Cargados)

Desde el 23-11-2026 Ítems y Cargados empiezan con la **vista de carga**, lo que se revisa al cargar en el sistema: `N° línea | Admisión | Fecha | Código | Cantidad | Venta | Estado carga`. Encabezado verde, borde grueso al final y congelada hasta Estado carga. Después siguen CLAVE, Tipo de línea, Línea padre, N° cotización, Referencia, Cantidad (ingresar), Código real, Lote, Vencimiento y el resto.
- En Ítems, Admisión y Fecha son fórmulas (bloqueadas y ocultas) que salen de la CLAVE (`admisión|empresa|AAAA-MM-DD`); Fecha en `dd-mm-aaaa`. Se escribe Estado carga; Código y Venta siguen siendo fórmulas.
- Desde el 24-11-2026 la cantidad se escribe en **Cantidad (ingresar)**, justo después de Referencia; Cantidad (E, vista de carga) es una fórmula que la muestra, como Admisión y Fecha. En las filas del sistema la celda editable y su original (`orig: Cantidad`) son los de Cantidad (ingresar).
- **Valores automáticos por tipo de línea** (24-11-2026; `valoresPorTipo` en `libroRespaldo.js`, `FormulasDefectoItem` en la macro): PAD PADRE → Lote y Vencimiento "PAD"; CONTENIDO PAD → Estado carga "CONTENIDO". Son fórmulas en celdas que se escriben (como el autocompletado de Gestiones); la validación no deja escribir Lote/Vencimiento en un PAD PADRE ni otro estado en un CONTENIDO PAD (su lista solo trae CONTENIDO, Catálogos I3). Las macros vuelven a poner las fórmulas al limpiar una fila (Mover cargados, Crear libro del mes) y al devolverla.
- **Estado carga**: se cambia en NORMAL y en PAD PADRE (antes el PAD tenía estado fijo "PAD"); el CONTENIDO PAD es CONTENIDO y cuenta como cargado. Una gestión queda CARGADO cuando todas sus líneas están CARGADO, CONTENIDO o SIN CARGO (también "PAD", que traen las filas del sistema).
- **Código real**: el código del catálogo según la referencia en **todas** las líneas, también CONTENIDO PAD, LOTE ADICIONAL y SIN CARGO. **Código** no cambia: "No lleva OC" en esas líneas. Solicitud Implantes y Resumen siguen usando Código.
- Ítems se define por clave en `DEF_ITEMS` (`libroRespaldo.js`): la letra sale de la posición y las fórmulas usan `I.<clave>`, así el orden se cambia en un solo lugar.

`ModContingencia.bas` ubica las columnas de Ítems y Cargados **por el título** del encabezado (fila 2), no por la posición. Cambiar el orden en `COLUMNAS_ITEMS` o `COLUMNAS_CARGADOS` no toca la macro; cambiar o agregar un título sí (`I_ENTRADAS`, `C_DESDE_ITEMS`, `G_DESDE_CARGADOS`), y lo comprueba un test. Gestiones (`COLUMNAS_GESTIONES`) sigue por posición.

**Mover cargados** (botón en la hoja Ítems, donde se trabaja el detalle; mueve la gestión completa):
- Toma las gestiones con `ORIGEN = CONTINGENCIA` y Estado = CARGADO, la misma regla del sistema: todas sus líneas CARGADO, CONTENIDO o SIN CARGO (o "PAD" en filas del sistema). Solo las de fecha del mes del libro; en la plantilla base no hace nada.
- Antes de mover, avisa cuántas gestiones e ítems son (y cuántos ítems tienen alerta), pide el nombre de quien mueve y la confirmación.
- Escribe en Cargados **valores**, una fila por línea, con la cabecera de su gestión, lo calculado (código, código real, precio, veces costo, total, venta, sin código, recargo encontrado) y el N° de línea y la línea padre originales.
- En Gestiones e Ítems limpia solo las celdas que se escriben; las fórmulas quedan.

**Devolver a pendientes** (hoja Cargados, con una celda de la gestión seleccionada):
- Vuelve la gestión a la primera fila libre de Gestiones y a filas libres de Ítems, y la quita de Cargados.
- Como el N° de línea es fijo por fila, traduce la línea padre del número original al de la fila donde queda.
- No devuelve una gestión si su CLAVE ya existe en Gestiones.

Las dos macros tienen una versión sin diálogos (`MoverCargadosAuto(quien)` y `DevolverGestionAuto(clave)`), que usa la prueba automática.

### Probado: Reporte Info (Excel 16, datos ficticios)

- **Datos:** un Excel "de la clínica" con 5 filas (dos de la misma admisión y una de agosto) y las exportaciones de Previsiones (con una inactiva) y Convenios.
- **Carga:** quedaron 3 admisiones; la de agosto quedó fuera de los 60 días.
- **Admisión en Reporte Info:** Nombre, Convenio, Previsión (Isapre), Médico y Descripción se completaron solos.
- **Admisión que no está:** Alerta "Admisión no está en Reporte Info" y Admisión en naranja. Al escribir los datos a mano con una previsión que no está en la lista, se sumó "Previsión fuera de la lista".
- **Médico escrito a mano** sobre una admisión encontrada: solo esa celda perdió la fórmula y quedó en cursiva; la fila siguiente siguió autocompletando.
- **Mover cargados:** guardó los datos a mano y restauró las fórmulas en las filas liberadas.
- **Devolver a pendientes:** dejó fórmula en lo autocompletado y el valor a mano en el Médico corregido.
- Sin errores de fórmula.

### Probado (Excel 16, datos ficticios)

Exportaciones ficticias con el formato de la app: 2.997 códigos (uno inactivo, una referencia en dos empresas), 4 empresas (una inactiva), centros y recargos desordenados con uno inactivo. Se cargaron 2.996 códigos; veces costo se lee de la hoja Recargos (el rango inactivo se ignora).
- Se cargaron 2.995 códigos, 3 empresas, 2 centros y 3 rangos, y `AccessVBOM` quedó como estaba.
- Prueba con tres gestiones:
  1. Una con todo CARGADO o SIN CARGO.
  2. Una con estados mezclados.
  3. Una con PAD PADRE, dos líneas de contenido, una placa y un lote adicional.
- "Mover cargados" movió 2 gestiones y 8 ítems como valores, sin fórmulas. Dejó la gestión con estados mezclados y limpió las demás filas, que quedaron con sus fórmulas.
- "Devolver a pendientes" devolvió la del PAD con la línea padre traducida (6→1 y 9→6). Volvió a quedar CARGADO, sin alertas ni errores de fórmula.

## Respaldo con datos del sistema (para más adelante)

Si el sistema se cae, el equipo trabaja en un Excel (`respaldo_implantes_AAAA-MM-DD.xlsx`) y después esas filas se reimportan. El script `scripts/respaldoImplantes/generarRespaldoImplantes.js` genera el archivo con:

- las gestiones e ítems del mes abierto, como foto (`ORIGEN = SISTEMA`) en la que solo se pueden cambiar algunos campos (ver "Cambios en filas del sistema");
- filas libres con fórmulas y validaciones para trabajar durante la caída (`ORIGEN = CONTINGENCIA`);
- los catálogos (referencias activas, empresas, centros, recargos y listas fijas) y una hoja de instrucciones para el equipo.

Archivos: `datosRespaldo.js` (lógica pura, con test), `libroRespaldo.js` (armado del Excel, con test), `datosDemo.js` (datos ficticios), `generarRespaldoImplantes.js` (lectura, cifrado y copias) y `generarPlantillaImplantes.js` (plantilla vacía). En este modo los catálogos se llenan solos, con la misma disposición de columnas que la plantilla.

## Requisitos (una sola vez)

1. Dependencias: `npm install` y `npm install --prefix functions`.
2. Credenciales de **solo lectura** para Firestore. Se recomienda una cuenta de servicio dedicada, así el script no puede escribir aunque tuviera un error:
   1. Google Cloud Console → proyecto `workcraft-491b7` → IAM y administración → Cuentas de servicio → **Crear cuenta de servicio** (por ejemplo `respaldo-implantes-lectura`).
   2. Rol: **Visor de Cloud Datastore** (`roles/datastore.viewer`). Ningún otro.
   3. En la cuenta creada: Claves → Agregar clave → JSON. El navegador la descarga a Descargas: muévala de inmediato como se indica abajo.
3. **Dónde guardar el JSON.** En una carpeta del perfil del usuario, **fuera del repo y fuera de carpetas sincronizadas** (OneDrive, Google Drive, Escritorio o Documentos si están sincronizados), con permisos solo para su usuario. En PowerShell:

   ```powershell
   $dir = "$env:USERPROFILE\.medra-credenciales"
   New-Item -ItemType Directory -Force $dir | Out-Null
   # Quita los permisos heredados y deja acceso solo a su usuario
   icacls $dir /inheritance:r /grant:r "${env:USERNAME}:(OI)(CI)F"
   # Mueve la clave descargada (ajuste el nombre) y le aplica los permisos de la carpeta
   Move-Item "$env:USERPROFILE\Downloads\workcraft-491b7-*.json" "$dir\respaldo-lectura.json"
   icacls "$dir\respaldo-lectura.json" /reset
   # Comprobar: debe aparecer solo su usuario
   icacls "$dir\respaldo-lectura.json"
   ```

   No la copie a otros equipos, no la envíe por correo ni chat y no la suba al repo. Si otro equipo necesita generar el respaldo, cree **otra clave** para ese equipo: así se puede revocar una sin afectar a la otra.
4. Variables de entorno del usuario de Windows. En PowerShell (después, abrir una terminal nueva):

   ```powershell
   [Environment]::SetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', "$env:USERPROFILE\.medra-credenciales\respaldo-lectura.json", 'User')
   [Environment]::SetEnvironmentVariable('RESPALDO_IMPLANTES_CLAVE', '<contraseña de al menos 12 caracteres>', 'User')
   ```

   Sin `RESPALDO_IMPLANTES_CLAVE` el script se detiene y no genera nada: el archivo **siempre** sale cifrado (ECMA-376 Agile, el mismo método de "Cifrar con contraseña" de Excel). La contraseña se comunica al equipo por un canal distinto al del archivo.

### Si la clave JSON se filtra (o se pierde el equipo)

La clave da lectura de **toda** la base de Firestore, no solo de Implantes. Ante cualquier duda, revocarla; crear otra toma un minuto.

1. Google Cloud Console → IAM y administración → Cuentas de servicio → `respaldo-implantes-lectura` → pestaña **Claves** → eliminar la clave filtrada (identificarla por su ID, que coincide con `private_key_id` del JSON). Deja de funcionar de inmediato.
2. Si no se sabe cuál clave fue, o se sospecha uso indebido: en la misma pantalla, **Inhabilitar** la cuenta de servicio (corta todas sus claves) y después crear una cuenta nueva.
3. Crear una clave nueva, guardarla como en el paso 3 y borrar la copia vieja del equipo.
4. Revisar en Cloud Logging los accesos de la cuenta (`protoPayload.authenticationInfo.principalEmail` = la cuenta de servicio). Firestore no registra las lecturas por defecto: si se quiere ese rastro, activar los registros de auditoría de "Acceso a datos" de Cloud Firestore en IAM → Registros de auditoría (tienen costo).
5. Si la clave estuvo en un lugar público (por ejemplo un repositorio), considerar expuesto todo lo que había en Firestore y avisar a quien corresponda.

Además, renovar la clave una vez al año (crear la nueva, cambiarla en el equipo y eliminar la anterior).

## Ejecutar

Desde la raíz del repo:

```powershell
# Cuánto costará (unas 10 lecturas): período, gestiones del mes, maestros
node scripts/respaldoImplantes/generarRespaldoImplantes.js --contar

# Generar el respaldo (la carpeta debe estar fuera del repo)
node scripts/respaldoImplantes/generarRespaldoImplantes.js --salida "D:\RespaldoImplantes"

# Otro mes, o datos ficticios sin Firestore (para probar)
node scripts/respaldoImplantes/generarRespaldoImplantes.js --salida "D:\RespaldoImplantes" --mes 2026-10
node scripts/respaldoImplantes/generarRespaldoImplantes.js --salida "D:\RespaldoImplantes" --demo
```

- El nombre lleva la fecha de Chile (`respaldo_implantes_2026-11-23.xlsx`). Si se corre dos veces el mismo día, se reemplaza el de ese día. Se conservan las **3 copias más recientes** de la carpeta y se borran las demás (solo archivos con ese nombre exacto).
- El archivo se escribe primero como `.tmp` y luego se renombra: si algo falla, no queda un respaldo a medias con el nombre bueno.
- Lecturas por corrida: períodos abiertos (pocos) + 1 por gestión del mes + 1 por documento de `maestros_codigos`, `maestros_empresas`, `maestros_centros` y `maestros_recargos` + 1 (conteo del mes anterior, para dimensionar). Las filas libres son al menos el doble del volumen del mes (o del anterior, si fue mayor).

## Programarlo en el Programador de tareas de Windows

1. Win + R → `taskschd.msc` → **Crear tarea…** (no "Crear tarea básica", para tener todas las opciones).
2. **General**: nombre `Medra - Respaldo Implantes`. Elegir "Ejecutar solo cuando el usuario haya iniciado sesión" (lo más simple; usa las variables del paso 4 de Requisitos) o "Ejecutar tanto si el usuario inició sesión como si no" (pide la contraseña de Windows; útil si el equipo queda encendido sin sesión).
3. **Desencadenadores** → Nuevo → Diariamente, 07:00. Opcional: un segundo a las 13:30.
4. **Acciones** → Nuevo → Iniciar un programa:
   - Programa: `C:\Windows\System32\cmd.exe`
   - Argumentos: `/c ""C:\Program Files\nodejs\node.exe" scripts\respaldoImplantes\generarRespaldoImplantes.js --salida "D:\RespaldoImplantes" >> "D:\RespaldoImplantes\respaldo.log" 2>&1"`
   - Iniciar en: `C:\Users\maiko\Workspace\medra.cl\App-Medra`
5. **Condiciones**: en un notebook, desmarcar "Iniciar la tarea solo si el equipo está conectado a la corriente alterna".
6. **Configuración**: marcar "Ejecutar la tarea lo antes posible si no se ejecutó a la hora programada" y "Detener la tarea si se ejecuta durante más de 1 hora".
7. Probar: clic derecho sobre la tarea → **Ejecutar**, y revisar `respaldo.log` (trae conteos y nombres de archivo, sin datos de pacientes) y el `.xlsx` nuevo.

Tras actualizar el repo (`git pull`), volver a correr `npm install` si cambiaron las dependencias.

**Frecuencia recomendada:** una vez al día, temprano (07:00). Cada corrida cuesta unas 3.300 lecturas más una por gestión del mes; a diario son del orden de 100.000 a 150.000 lecturas al mes, unos pocos centavos de dólar. Son solo lecturas con credenciales de administrador: no disparan Functions ni usan la cuota de CPU de Cloud Run. Dos veces al día duplica un costo que sigue siendo mínimo; más seguido no aporta, porque una caída se cubre con el respaldo del día más lo que se registre en el Excel. Antes de una mantención programada conviene correrlo a mano.

Si `--salida` es una carpeta sincronizada de la clínica (unidad compartida o Drive de escritorio), cada equipo recibe la copia; la rotación también borra ahí las antiguas.

## Fechas y CLAVE

- Las fechas se guardan como fechas de Excel y se **muestran** `dd-mm-aaaa`.
- La CLAVE (`admisión|empresa|AAAA-MM-DD`) se arma con `AÑO()`, `MES()` y `DIA()` más `TEXTO(…;"00")`, que no dependen del idioma de Excel (un `TEXTO(fecha;"aaaa-mm-dd")` sí dependería). Es la misma forma de la ruta del sistema (`getDetallesRef`).
- Al reimportar no se confía en el texto de la CLAVE: se recalcula desde admisión, empresa y fecha con `fechaExcelAISO` (`datosRespaldo.js`, con test), que acepta lo que puede entregar Excel (fecha, número de serie, `dd-mm-aaaa` o `AAAA-MM-DD`), y se comprueba que coincida con la de la fila. Los ítems se enlazan con esa CLAVE recalculada.

## Cambios en filas del sistema

Durante la caída se pueden actualizar algunos campos de lo ya registrado (filas `SISTEMA`). El resto de la fila sigue bloqueado.

| Hoja | Campos editables | Excepciones (igual que en Cargas) |
|---|---|---|
| Gestiones | Informe, Lado, Observación | — |
| Ítems | Cantidad (ingresar), Lote, Vencimiento, Estado carga | Sin Estado carga en el CONTENIDO PAD ni en líneas sin código; sin Lote ni Vencimiento en el PAD PADRE |

- Las celdas editables de una fila del sistema van en blanco, no en gris (`camposEditablesItem` y `CAMPOS_EDITABLES_GESTION` en `datosRespaldo.js`).
- El valor exportado queda en columnas ocultas (`orig: …`). La columna **MODIFICADO** (fórmula) dice SÍ si alguno difiere, y cada celda cambiada se pinta ámbar. Si se vuelve a escribir el valor original, regresa a NO.
- En las filas del sistema, Total ítem y Venta son fórmulas con el precio y las veces costo guardados, así siguen a la cantidad (y a SIN CARGO = 0). La suma y el estado de la gestión se recalculan.

## Verificado

Solo en **Microsoft Excel** (es el programa que se usa; LibreOffice no se probó ni se usa).

- Excel 16, datos ficticios con ~3.000 referencias, 400 gestiones y 1.463 ítems (más 880 y 3.220 filas libres): abre en ~2 s, recalcula en 0,1 s y sin errores de fórmula.
- Filas de contingencia probadas: normal, PAD con contenido, lote adicional que supera la cantidad, referencia inexistente, referencia ambigua, empresa distinta y línea padre inválida.
- Filas del sistema: al cambiar cantidad, estado carga y observación, MODIFICADO pasa a SÍ, la celda se pinta, se actualizan total y suma de la gestión, y al restaurar vuelve a NO. Referencia y empresa siguen bloqueadas.

## Reimportación (propuesta, sin implementar)

Script `functions/scripts/importarContingenciaImplantes.js`, como los demás scripts de mantención: **simula por defecto** y escribe solo con `--aplicar`, previa aprobación, en horario de poco uso y por lotes espaciados (las gestiones disparan triggers: zonas por diagnóstico, admisiones gestionadas y descripciones de Reporte Info). Recibe el archivo cifrado y la contraseña por variable de entorno.

1. **Lectura:** filas `CONTINGENCIA` (nuevas, sin ID de sistema) y filas `SISTEMA` modificadas. Nada calculado se toma del Excel: ni MODIFICADO, ni código, precio, veces costo, venta, total o estado. Todo se recalcula: la modificación, comparando cada celda editable con su columna `orig:`; lo demás, con el catálogo y los recargos vigentes al importar (la misma lógica de `calcularCamposFinancieros` y del estado del bloque). Si el resultado difiere de lo que mostraba el Excel, por ejemplo porque cambió un precio, se informa.
2. **Validaciones de gestión:**
   - admisión con solo dígitos, fecha válida y empresa activa del maestro;
   - CLAVE repetida dentro del archivo → error;
   - gestión que ya existe en el sistema (misma admisión + empresa + fecha, consultada como `revisarDuplicadoGestion`) → no se crea, y sus ítems de contingencia se agregan a la existente. Si esa gestión ya está **SOLICITADA**, no se toca y queda en el informe para cargarla a mano, porque agregarle ítems exigiría reimputar.
3. **Validaciones de ítems:**
   - CLAVE existente (en el archivo o en el sistema);
   - cantidad > 0, línea padre válida y lotes que no superan la cantidad;
   - referencia ambigua → error;
   - duplicado por **referencia + lote** en la misma gestión, contra lo guardado y dentro del archivo → se omite salvo que se confirme.
4. **Modificaciones de filas del sistema:**
   - se ubican por **ID sistema**: la gestión por su ruta (columna X de Gestiones, a la que lleva la CLAVE del ítem) y el ítem por su `id` dentro de `cotizaciones[0].items`; 1 lectura por gestión modificada;
   - solo se aplican los campos editables de esa fila (se vuelve a revisar con `camposEditablesItem`; un cambio en otra columna, por ejemplo si alguien quitó la protección, se ignora y se informa);
   - **conflicto:** si el valor actual en Firestore ya no es el original del Excel (alguien lo cambió en el sistema después de generar el respaldo), ese campo no se aplica y se informa con los tres valores (original, sistema y Excel);
   - gestión **SOLICITADA**, o con ítems de un período **cerrado** (el mismo candado de Cargas): no se toca nada y queda en el informe para hacerlo a mano;
   - Cantidad: se recalculan total y venta con el precio guardado y los recargos vigentes; en una línea con lotes adicionales, no puede quedar menor que la suma de sus lotes. Lote vacío = "Sin lote"; Vencimiento vacío = "Sin fecha" y fecha → `AAAA-MM-DD`. Estado carga con `camposCambioEstadoCarga` (a SIN CARGO guarda código y precio en `sinCargoOriginal`; desde SIN CARGO los recupera y recalcula);
   - gestión: Informe, Lado (nombre → id de `LADOS`) y Observación en mayúsculas;
   - después se **recalcula el estado de la gestión** con la regla del bloque (sin código → INCOMPLETO; todos iguales → ese estado; mezcla → INCOMPLETO) y `ocPendiente`;
   - log `ITEM_EDITADO` por ítem con `origen: 'CONTINGENCIA'` y cada campo con su valor anterior y nuevo (como los de Cargas), y `EDICION` con `origen: 'CONTINGENCIA'` si cambió algún campo de la gestión;
   - aplicar dos veces el mismo cambio no hace nada: si el valor ya es el del Excel, no se escribe ni se registra.
5. **Resumen previo:** gestiones nuevas, gestiones existentes con ítems agregados, ítems nuevos, ítems y gestiones modificados (campo: antes → después), duplicados omitidos, conflictos, gestiones no tocadas por estar SOLICITADAS o en período cerrado, errores (filas que no se importan) y advertencias (sin código, empresa no coincide, sin rango de recargo, diferencia con el total de la cotización), con las filas del Excel para corregirlas.
6. **Escritura** (misma forma que `guardarDesdeDetalle`, con `writeBatch`; las modificaciones, en una transacción por gestión que relee el documento para no pisar un cambio simultáneo):
   - ítems con `id` nuevo y `periodoAnio`/`periodoMes` del período abierto al importar;
   - `solicitud: 'PENDIENTE'` y `ocPendiente` calculado;
   - `registradoPor` = "Registrado por" del Excel;
   - `origen: 'CONTINGENCIA'` e `importadoEl`;
   - convenio, previsión, médico y descripción desde Reporte Info si vienen vacíos;
   - logs `CREACION` / `ITEM_CREADO` con `origen: 'CONTINGENCIA'`.
7. **Idempotencia:** cada gestión e ítem nuevo guarda `idContingencia` (hash de la CLAVE y del N° de línea); una segunda corrida con el mismo archivo los reconoce y no duplica. Las modificaciones ya aplicadas tampoco se repiten (punto 4).
8. **No hace:** Solicitud, imputación ni OC. Eso se hace en el sistema después de importar.

## Seguridad

El archivo tiene datos de pacientes (Ley 19.628 y Ley 20.584).

- Siempre cifrado. La contraseña va en una variable de entorno, nunca en el repo, y se entrega por un canal distinto al del archivo.
- Guardarlo en una carpeta compartida de la clínica con acceso solo para el equipo de Implantes, y tener una copia local en los equipos que lo usarán: una caída del sistema puede venir con una caída de red.
- No enviarlo por correo ni WhatsApp, ni dejarlo en Descargas o el escritorio. `.gitignore` excluye `respaldo_implantes*.xlsx` y el script rechaza una salida dentro del repo.
- Al terminar la contingencia y reimportar, borrar las copias locales. Cambiar la contraseña si alguien que la conocía deja el equipo.
