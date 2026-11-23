# Respaldo de contingencia de Implantes

Si el sistema se cae, el equipo trabaja en un Excel (`respaldo_implantes_AAAA-MM-DD.xlsx`) y después esas filas se reimportan. El script `scripts/respaldoImplantes/generarRespaldoImplantes.js` genera el archivo con:

- las gestiones e ítems del mes abierto, como foto bloqueada (`ORIGEN = SISTEMA`);
- filas libres con fórmulas y validaciones para trabajar durante la caída (`ORIGEN = CONTINGENCIA`);
- los catálogos (referencias activas sin fibras, empresas, centros, recargos y listas fijas) y una hoja de instrucciones para el equipo.

Archivos: `datosRespaldo.js` (lógica pura, con test), `libroRespaldo.js` (armado del Excel, con test), `datosDemo.js` (datos ficticios) y `generarRespaldoImplantes.js` (lectura, cifrado y copias).

## Requisitos (una sola vez)

1. Dependencias: `npm install` y `npm install --prefix functions`.
2. Credenciales de **solo lectura** para Firestore. Se recomienda una cuenta de servicio dedicada, así el script no puede escribir aunque tuviera un error:
   1. Google Cloud Console → proyecto `workcraft-491b7` → IAM y administración → Cuentas de servicio → **Crear cuenta de servicio** (por ejemplo `respaldo-implantes-lectura`).
   2. Rol: **Visor de Cloud Datastore** (`roles/datastore.viewer`). Ningún otro.
   3. En la cuenta creada: Claves → Agregar clave → JSON. Guardarla fuera del repo, en una carpeta solo de este usuario (por ejemplo `C:\Medra\credenciales\respaldo-lectura.json`).
3. Variables de entorno del usuario de Windows. En PowerShell (después, abrir una terminal nueva):

   ```powershell
   [Environment]::SetEnvironmentVariable('GOOGLE_APPLICATION_CREDENTIALS', 'C:\Medra\credenciales\respaldo-lectura.json', 'User')
   [Environment]::SetEnvironmentVariable('RESPALDO_IMPLANTES_CLAVE', '<contraseña de al menos 12 caracteres>', 'User')
   ```

   Sin `RESPALDO_IMPLANTES_CLAVE` el script se detiene y no genera nada: el archivo **siempre** sale cifrado (ECMA-376 Agile, el mismo método de "Cifrar con contraseña" de Excel). La contraseña se comunica al equipo por un canal distinto al del archivo.

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
2. **General**: nombre `Medra - Respaldo Implantes`. Elegir "Ejecutar solo cuando el usuario haya iniciado sesión" (lo más simple; usa las variables del paso 3 de Requisitos) o "Ejecutar tanto si el usuario inició sesión como si no" (pide la contraseña de Windows; útil si el equipo queda encendido sin sesión).
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

## Verificado

- Excel 16, datos ficticios con ~3.000 referencias, 400 gestiones y 1.463 ítems (más 880 y 3.220 filas libres): abre en ~2 s, recalcula en 0,1 s y sin errores de fórmula. Se probaron filas de contingencia: normal, PAD con contenido, lote adicional que supera la cantidad, referencia inexistente, referencia ambigua, empresa distinta, línea padre inválida y Documentos.
- LibreOffice: pendiente (no está instalado en el equipo de desarrollo). El archivo pide recalcular al abrir (`fullCalcOnLoad`); si no mostrara valores, la hoja Instrucciones indica Ctrl+Mayús+F9.

## Reimportación (propuesta, sin implementar)

Script `functions/scripts/importarContingenciaImplantes.js`, como los demás scripts de mantención: **simula por defecto** y escribe solo con `--aplicar`, previa aprobación, en horario de poco uso y por lotes espaciados (las gestiones disparan triggers: zonas por diagnóstico, admisiones gestionadas y descripciones de Reporte Info). Recibe el archivo cifrado y la contraseña por variable de entorno.

1. **Lectura:** solo filas `CONTINGENCIA`, es decir sin ID de sistema. Nada calculado se toma del Excel: código, precio, veces costo, venta, total y estado se recalculan con el catálogo y los recargos vigentes al importar (la misma lógica de `calcularCamposFinancieros` y del estado del bloque). Si el resultado difiere de lo que mostraba el Excel, por ejemplo porque cambió un precio, se informa.
2. **Validaciones de gestión:**
   - admisión con solo dígitos, fecha válida y empresa activa del maestro;
   - CLAVE repetida dentro del archivo → error;
   - gestión que ya existe en el sistema (misma admisión + empresa + fecha, consultada como `revisarDuplicadoGestion`) → no se crea, y sus ítems de contingencia se agregan a la existente. Si esa gestión ya está **SOLICITADA**, no se toca y queda en el informe para cargarla a mano, porque agregarle ítems exigiría reimputar.
3. **Validaciones de ítems:**
   - CLAVE existente (en el archivo o en el sistema);
   - cantidad > 0, línea padre válida y lotes que no superan la cantidad;
   - referencia ambigua → error;
   - duplicado por **referencia + lote** en la misma gestión, contra lo guardado y dentro del archivo → se omite salvo que se confirme.
4. **Resumen previo:** gestiones nuevas, gestiones existentes con ítems agregados, ítems nuevos, duplicados omitidos, errores (filas que no se importan) y advertencias (sin código, empresa no coincide, sin rango de recargo, diferencia con el total de la cotización), con las filas del Excel para corregirlas.
5. **Escritura** (misma forma que `guardarDesdeDetalle`, con `writeBatch`):
   - ítems con `id` nuevo y `periodoAnio`/`periodoMes` del período abierto al importar;
   - `solicitud: 'PENDIENTE'` y `ocPendiente` calculado;
   - `registradoPor` = "Registrado por" del Excel;
   - `origen: 'CONTINGENCIA'` e `importadoEl`;
   - convenio, previsión, médico y descripción desde Reporte Info si vienen vacíos;
   - logs `CREACION` / `ITEM_CREADO` con `origen: 'CONTINGENCIA'`.
6. **Idempotencia:** cada gestión e ítem guarda `idContingencia` (hash de la CLAVE y del N° de línea); una segunda corrida con el mismo archivo los reconoce y no duplica.
7. **No hace:** Solicitud, imputación, OC ni fibras. Eso se hace en el sistema después de importar. La hoja Documentos es la lista de PDF por subir con Carga masiva.

## Seguridad

El archivo tiene datos de pacientes (Ley 19.628 y Ley 20.584).

- Siempre cifrado. La contraseña va en una variable de entorno, nunca en el repo, y se entrega por un canal distinto al del archivo.
- Guardarlo en una carpeta compartida de la clínica con acceso solo para el equipo de Implantes, y tener una copia local en los equipos que lo usarán: una caída del sistema puede venir con una caída de red.
- No enviarlo por correo ni WhatsApp, ni dejarlo en Descargas o el escritorio. `.gitignore` excluye `respaldo_implantes*.xlsx` y el script rechaza una salida dentro del repo.
- Al terminar la contingencia y reimportar, borrar las copias locales. Cambiar la contraseña si alguien que la conocía deja el equipo.
