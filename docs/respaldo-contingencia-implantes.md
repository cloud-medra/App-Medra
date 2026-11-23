# Respaldo de contingencia de Implantes

Si el sistema se cae, el equipo trabaja en un Excel (`respaldo_implantes_AAAA-MM-DD.xlsx`) y después esas filas se reimportan. El script `scripts/respaldoImplantes/generarRespaldoImplantes.js` genera el archivo con:

- las gestiones e ítems del mes abierto, como foto (`ORIGEN = SISTEMA`) en la que solo se pueden cambiar algunos campos (ver "Cambios en filas del sistema");
- filas libres con fórmulas y validaciones para trabajar durante la caída (`ORIGEN = CONTINGENCIA`);
- los catálogos (referencias activas sin fibras, empresas, centros, recargos y listas fijas) y una hoja de instrucciones para el equipo.

Archivos: `datosRespaldo.js` (lógica pura, con test), `libroRespaldo.js` (armado del Excel, con test), `datosDemo.js` (datos ficticios) y `generarRespaldoImplantes.js` (lectura, cifrado y copias).

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
| Ítems | Cantidad, Lote, Vencimiento, Estado carga | Sin Estado carga en PAD (padre y contenido) ni en líneas sin código; sin Lote ni Vencimiento en el PAD PADRE; en una fibra solo Estado carga |

- Las celdas editables de una fila del sistema van en blanco, no en gris (`camposEditablesItem` y `CAMPOS_EDITABLES_GESTION` en `datosRespaldo.js`).
- El valor exportado queda en columnas ocultas (`orig: …`). La columna **MODIFICADO** (fórmula) dice SÍ si alguno difiere, y cada celda cambiada se pinta ámbar. Si se vuelve a escribir el valor original, regresa a NO.
- En las filas del sistema, Total ítem y Venta son fórmulas con el precio y las veces costo guardados, así siguen a la cantidad (y a SIN CARGO = 0). La suma y el estado de la gestión se recalculan.

## Verificado

Solo en **Microsoft Excel** (es el programa que se usa; LibreOffice no se probó ni se usa).

- Excel 16, datos ficticios con ~3.000 referencias, 400 gestiones y 1.463 ítems (más 880 y 3.220 filas libres): abre en ~2 s, recalcula en 0,1 s y sin errores de fórmula.
- Filas de contingencia probadas: normal, PAD con contenido, lote adicional que supera la cantidad, referencia inexistente, referencia ambigua, empresa distinta, línea padre inválida y Documentos.
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
8. **No hace:** Solicitud, imputación, OC ni fibras. Eso se hace en el sistema después de importar. La hoja Documentos es la lista de PDF por subir con Carga masiva.

## Seguridad

El archivo tiene datos de pacientes (Ley 19.628 y Ley 20.584).

- Siempre cifrado. La contraseña va en una variable de entorno, nunca en el repo, y se entrega por un canal distinto al del archivo.
- Guardarlo en una carpeta compartida de la clínica con acceso solo para el equipo de Implantes, y tener una copia local en los equipos que lo usarán: una caída del sistema puede venir con una caída de red.
- No enviarlo por correo ni WhatsApp, ni dejarlo en Descargas o el escritorio. `.gitignore` excluye `respaldo_implantes*.xlsx` y el script rechaza una salida dentro del repo.
- Al terminar la contingencia y reimportar, borrar las copias locales. Cambiar la contraseña si alguien que la conocía deja el equipo.
