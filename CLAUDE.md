# CLAUDE.md

**Responder siempre en español**, en todas las sesiones.

## Reglas

- **No usar los emuladores de Firebase.** No iniciar `npm run emuladores`, `npm run dev:emuladores` ni `firebase emulators:*`, y no ejecutar `npm run test:emulador` ni los tests de `tests/emulador/`. Para verificar, usar `npm run build`, la revisión del código y los tests unitarios con vitest (`npm test` o `npx vitest run <ruta>`), que no usan emuladores y sí se pueden correr. Con la suite completa algunos tests pueden fallar por timeout de 5 s en este equipo: si fallan, correr esos archivos aparte (por ejemplo con `--testTimeout=30000`) antes de darlos por rotos.
- **Desplegar las Cloud Functions de a 2 o 3 por vez.** La cuota de CPU de Cloud Run en `us-central1` ("Total CPU allocation, per project per region") está al límite y no se pudo aumentar: un `firebase deploy --only functions` completo falla con `Quota exceeded for total allowable CPU per project per region`. Desplegar por tandas, esperando a que termine cada una antes de lanzar la siguiente:

  ```bash
  npx firebase-tools deploy --only functions:funcionA,functions:funcionB,functions:funcionC --project workcraft-491b7
  ```

  Si una tanda falla por cuota, esperar unos minutos y reintentarla una vez; si vuelve a fallar, detenerse. Hacerlo de preferencia en horario de poco uso de la app.

  No usar `npm run deploy`, porque despliega todas las Functions juntas y falla por la cuota de CPU. Desplegar siempre por tandas.

## Arquitectura

Medra: plataforma interna (SPA) para gestionar implantes, hemodinamia, consignación, documentos, laboratorio, vacunatorio, bodega e inventario de una clínica, con imputación mensual por períodos. Proyecto Firebase `workcraft-491b7`.

### Stack
- **Frontend:** React 19 + Vite 8, Tailwind 4, `lucide-react`. `react-router-dom` solo separa el login (`/`) de `/plataforma/*`. Dentro de la plataforma, la navegación es por estado (ver Flujos).
- **Backend:** Firebase: Auth (custom token), Firestore, Storage y Hosting (SPA, todo redirige a `index.html`). Cloud Functions v2 en `us-central1`, Node 24, CommonJS; la lógica compartida está en `.mjs`.
- **Librerías clave:**
  - Excel: `xlsx` (SheetJS) y `exceljs`.
  - PDF: `jspdf` + `jspdf-autotable` para generar, `pdfjs-dist` + `tesseract.js` para leer guías.
  - Otras: `papaparse` (CSV), `@zxing` (códigos de barra), `react-hook-form` + `zod` (formularios).
- **Tests:** vitest + jsdom + Testing Library. Cada test va junto a su archivo (`*.test.js[x]`).

### Carpetas
- `src/pages/Dashboard.jsx`: armazón de la app después del login.
  - Contiene el sidebar, el header y la vista de acceso rápido.
  - `VIEW_MAP` asocia cada ruta de ítem a su pantalla.
- `src/config/`: configuración del menú y los permisos. Si una pantalla no aparece en el menú, revisar acá primero.
  - `modulesConfig.jsx`: `MODULES` (módulos e ítems del menú: ruta, ícono, color de `PALETA_MENU`, flags).
  - `gruposMenu.jsx`: grupos del sidebar (Finanzas, Usuarios y accesos) dentro del módulo `administracion`.
  - `accesoMenu.js`: qué ítems ve cada usuario.
  - `componentMaps/`: secciones y botones de cada vista, para los permisos granulares.
  - `modulosActivos.js`: módulos e ítems activos.
- `src/components/modulos/<área>/<pantalla>/`: pantallas. Las áreas son:
  - `operaciones/`: implantes, hemodinamia, consignación, documentos y `shared`.
  - `gestiones/`: laboratorio y vacunatorio.
  - `administracion/`: en la interfaz se llama "Herramientas".
  - `maestros/`, `bodega/`, `inventario/`, `general/` (soporte, ajustes, perfil) y `dashboard/`.
  - `privado/`: código antiguo de respaldo.
- `operaciones/shared/`: una sola implementación para Implantes y Hemodinamia, parametrizada por `modulo`. `modulosGestion.js` define las colecciones, etiquetas, rutas y nombres de Excel de cada uno. Para un cambio en uno de los dos, hacerlo aquí.
- `src/context/`: `UserContext`, `ToastContext` y `ModalContext` (`confirmAction`).
- `src/hooks/`: `useGranularPermission`, `useColumnasPermitidas`, `useVisibleSnapshot` (`onSnapshotVisible`), `useColumnResize`.
- `src/stores/`: cachés a nivel de módulo, compartidas entre pantallas (períodos, catálogos, módulos activos).
- `src/components/ui/`: componentes visuales comunes. Las tablas corporativas están en `maestros/codigosMaestrosV2/ui/`.
- `functions/`: Cloud Functions. Cada carpeta tiene un `index.js` (triggers y callables) y su lógica en `servicio.js` / `nucleo.mjs`. `functions/permisos/nucleo.mjs` también lo importa el frontend.
- `docs/`: notas técnicas. Leer `firestore-buenas-practicas.md` antes de agregar consultas.
- `tests/emulador/`: no se ejecuta (ver Reglas).

### Cloud Functions (`functions/index.js`)
- **Usuarios** (callables):
  - `iniciarSesion`: login con correo o nombre de usuario, con control de intentos.
  - `crearUsuario` y `desbloquearUsuario`.
- **Permisos** (callables):
  - `guardarPermisosUsuario` y `asignarCentroCostoMasivo`.
  - `asignarAdministradoresMasivo` y `guardarPlantillaCentroCosto`.
  - Reescriben el permiso efectivo de cada usuario en `usuarios/{uid}`.
- **Solicitudes de cambio de datos** (callables): `crearSolicitud`, `resolverSolicitud`, `cancelarSolicitud` y `sincronizarMiCorreo`. Generan las alertas.
- **`functions/alertas`** no es una Cloud Function propia: es un módulo que usan las de solicitudes para crear y resolver alertas.
  - Su aviso por correo (`correo.js`) está desactivado, pendiente de activar.
  - Hacen falta la cuenta remitente y la extensión "Trigger Email from Firestore" (colección `mail`).
  - Se activa con `ALERTAS_CORREO_HABILITADO=true` en `functions/.env.<proyecto>`.
- **Períodos:** `cerrarPeriodoImputacion` (callable) cierra el mes de un módulo.
- **Estadísticas:**
  - `estadisticasImputada{Implantes,Consignacion,Hemodinamia}`: triggers sobre las imputadas.
  - `estadisticasCierre`: trigger sobre `cierres_periodos`.
  - `estadisticasNocturno`: todos los días a las 03:00, hora de Chile.
  - `recalcularEstadisticasPeriodo`: callable.
- **Bodega:** callables `bodega*` (catálogo, productos, códigos, documentos, egresos, tránsito, inventarios, cajas, consignación) y el trigger `bodegaPeriodo` sobre los cierres. El navegador solo lee las colecciones `bodega_*`; todas las escrituras pasan por estas funciones.
- **Triggers sobre gestiones de Implantes:**
  - `zonasDiagnosticoGestionImplante`: mantiene el maestro de zonas por diagnóstico.
  - `admisionesGestionadasImplante`: marca las admisiones gestionadas.
- **Reporte Info:** triggers `descripcionesReporteFila` y `descripcionesReporteMaestro` (descripciones ocultas).
  - Estado de cada descripción en `maestros_descripciones_reporte`: `estadoDescripcion` / `esPendiente` de `functions/descripcionesReporte/nucleo.mjs`.
  - **Pendiente:** tiene `pendienteDesde` y no tiene `actualizadoEl`. El trigger de fila pone `pendienteDesde` solo al crear una descripción nueva, y cualquier cambio desde la app (switch, "Marcar como revisada" u "Ocultar esta descripción" de Reporte Info) escribe `actualizadoEl` y la deja revisada.
  - Si no es pendiente, es **oculta** (`ocultaImplantes` u `ocultaDocumentos` en true) o **visible**. Las anteriores a `pendienteDesde` cuentan como revisadas; no hubo migración.
  - Para notificaciones: una descripción pasó a pendiente cuando aparece `pendienteDesde` (creación del documento).
- **Otras:**
  - `extraerGuiaDespacho`: OCR de una guía de despacho.
  - `eliminarDocumentoAdmision`: mueve el PDF a la papelera y registra la auditoría.

### Modelo de datos (Firestore)
- **`usuarios/{uid}`**:
  - Campos: `rol`, `activo`, `permisos` ({modulo: [rutas de ítems]}), `permisosGranulares` ({ruta: {secciones/elementos}}), `centroCostoId`, `ordenModulos` y `ordenSubItems`.
  - Subcolección `logs`.
  - Plantillas por centro y rol en `plantillas_permisos/{centroId}__{rol}`.
  - Login: `nombres_usuario` e `intentos_login`.
- **Gestiones** (Implantes y Hemodinamia):
  - Ruta: `{mod}_gestiones/{anio}/mes/{mes}/dia/{dia}/admision/{adm}/empresa/{emp}/detalles/{id}`.
  - Se consultan con `collectionGroup('detalles')` y un rango de `documentId()` (`rangoGestiones`).
  - Ítems en `cotizaciones[0].items`; `solicitud` toma PENDIENTE, SOLICITAR o SOLICITADO.
  - `itemsSolicitados` y `modificacionPendiente` alimentan "Solicitudes de modificaciones".
  - Subcolección `logs` con `accion`, `usuario` y `timestamp`.
- **Imputadas:** `{mod}_imputadas/{anio}/meses/{mes}/documentos/{itemId}` (implantes, hemodinamia y consignación); el collectionGroup es `documentos`. Es lo que se muestra en "Imputados".
- **Períodos:**
  - `configuracion_periodos/{modulo}`: período abierto.
  - `cierres_periodos`: cierres.
  - `imputaciones_periodos`: snapshot mensual por módulo.
  - `estadisticas`: agregados.
- **Consignación:** `consignacion_guias`, `consignacion_registros` y `consignacion_imputadas`.
- **Maestros:** `maestros_*` (códigos, empresas, centros, convenios, recargos, previsiones, instituciones, zonas de diagnóstico…).
- **Documentos y OC:** `documentos_reportesInfo`, `documentos_sistema`, `ordenesOC` (registro de PDF), `ocImport`, `resumen_facturacion_mensual` y `documentos_archivo`.
- **Otras colecciones:**
  - `laboratorio_*`, `vacunatorio_*`, `bodega_*` e `inventario_*`.
  - `alertas`, `solicitudes`, `tickets` y `mail`.
  - `modificaciones_exportadas` (historial).
  - `configuracion_sistema` (por ejemplo `modulosActivos` y atajos).

### Flujos principales
- **Login:**
  1. `LoginForm` llama a la callable `iniciarSesion`.
  2. Con el token recibido hace `signInWithCustomToken`.
  3. `UserContext` escucha `usuarios/{uid}` en vivo: los cambios de permisos se aplican sin volver a entrar, y si el usuario queda inactivo se cierra la sesión.
- **Roles** (`functions/permisos/nucleo.mjs`):
  - `dev` (Desarrollador): único rol con acceso total.
  - `admin`: administra usuarios, pero solo ve lo asignado.
  - `encargado` y `operador`: reciben la plantilla de su centro.
- **Menú:** un ítem es visible si su ruta está en `permisos[modulo]`. Hay tres excepciones:
  - `automaticoAdministradores`: lo ven siempre admin y dev.
  - `soloDesarrollador`: solo lo ve dev.
  - `heredaDe`: lo ve también quien tiene otra ruta (por ejemplo, Solicitudes de modificaciones hereda de Solicitud).
- **Permisos granulares:**
  - Se consultan con `hasPermission(ruta, seccion, elemento)`.
  - Un usuario no dev sin configuración para la vista queda bloqueado.
  - Las columnas se filtran con `useColumnasPermitidas`.
- **Reglas de Firestore:** `tienePermiso(modulo)` exige tener algún ítem del módulo. Los permisos solo se cambian por callable, nunca escribiendo `usuarios/{uid}` desde el navegador.
- **Navegación:** `activeView` es la ruta del ítem, y `?modulo=<entrada>` abre la vista de acceso rápido. Para agregar una pantalla:
  1. Agregar el subItem en `MODULES` (con un color distinto al de sus vecinos).
  2. Agregarla en `VIEW_MAP`.
  3. Agregar su entrada en `componentMaps`.
- **Ciclo de una gestión** (Implantes y Hemodinamia):
  1. **Gestión:** se cargan los ítems.
  2. **Solicitud:** exporta el Excel, marca SOLICITADO, imputa en el período abierto y guarda la copia `itemsSolicitados`.
  3. **Edición posterior:** reimputa al guardar y marca `modificacionPendiente`.
  4. **Solicitudes de modificaciones:** exporta solo lo que cambió.
- **Cargas consolidadas** (Finanzas): exporta las tres fuentes juntas (Implantes, Consignación y Hemodinamia).
- **Totales de Finanzas** (`administracion/totalesFinanzas/`): Consumos, Facturas y Valorización de bodega, por mes (o el año completo, en los dos primeros). Usan las mismas celdas que Control Mensual (`obtenerCelda` de `resumenImputacionesStore`, con los grupos de `controlMensual/constants.js`):
  - Consumos: imputado de Implantes, Consignación y Hemodinamia (`{mod}_imputadas`).
  - Facturas: imputado de Laboratorio y Vacunatorio (desde la factura electrónica).
  - Valorización de bodega: saldo valorizado de Bodega (foto de `bodega_periodos` al cierre, o `sum()` de `bodega_movimientos` si el mes está abierto).
  - En las imputadas, un mes cerrado sale del snapshot de `imputaciones_periodos` y uno abierto de `count()`/`sum()`. Un mes sin cierre en `cierres_periodos` vale 0 y no se lee.
- **Comparativo mensual** (Finanzas, `totalesFinanzas/comparativoMes.js`): Consumos y Facturas de los mismos días (`desde`–`hasta`, sin pasar de hoy en Chile) del mes pasado y del actual, con la diferencia en monto y en %.
  - El snapshot mensual no sirve para un rango de días: suma `count()`/`sum('total')` con rango sobre la fecha del documento. En Consumos es `fecha` (gestión o cirugía) y en Facturas `fchEmis` (emisión de la factura).
  - Cada mes se busca en los períodos de imputación mes−1, mes y mes+1, sin pasar del actual.
  - Un día que no existe en el mes pasado se toma como su último día.
- **Períodos cerrados:** no se pueden editar.
- **Gestión de módulos** (solo dev): activa o desactiva módulos e ítems para todos. El módulo `administracion` no se puede desactivar.

### Comandos
- Build: `npm run build`. Lint: `npm run lint`.
- Tests: `npm test`, o un archivo: `npx vitest run <ruta> --testTimeout=30000`. Si fallan por timeout o los workers no arrancan, correrlos de a uno.
- Deploy (siempre con `--project workcraft-491b7` y después de `npm run build`):
  - Hosting: `npx firebase-tools deploy --only hosting`.
  - Firestore: `--only firestore:rules,firestore:indexes`.
  - Storage: `--only storage`.
  - Functions: por tandas (ver Reglas). Nunca `npm run deploy`.

### Convenciones
- **Idioma:** todo en español (identificadores, comentarios, textos de la interfaz y commits). Los commits van con el formato `feat(alcance): descripción`. Fechas y montos con formato `es-CL`, hora de Chile.
- **Comentarios:** explican el porqué y las decisiones; los archivos importantes llevan un comentario de cabecera. Hay que mantener esa densidad.
- **Lecturas de Firestore (crítico):**
  - Sin listeners ni consultas nuevas si no son estrictamente necesarios.
  - `collectionGroup` siempre con rango de `documentId()`.
  - Usar `onSnapshotVisible` (pausa los listeners con la pestaña oculta).
  - Escribir solo los campos que cambian, con `writeBatch`.
  - Cada cambio relevante se audita en la subcolección `logs`.
- **Estructura:** la lógica pura va en `.js` con su test; el acceso a datos va en hooks `use<Pantalla>Data`; la pantalla, en `.jsx`.
- **Tablas:**
  - Se arman con `TablaCodigos` o `ThRedimensionable` + `useColumnResize`.
  - Un `.jsx` con `<table>` literal debe usar `useColumnasPermitidas` o figurar en `TABLAS_PENDIENTES` (lo exige `coberturaPermisos.test.js`).
  - Las vistas reutilizadas con otra ruta van en `RUTAS_DINAMICAS`.
- **Cambios de nombre:** al renombrar algo visible, cambiar solo las etiquetas. Las rutas, las claves de permisos y las colecciones no se tocan, porque son las que guardan los usuarios y validan las reglas.
- **Finales de línea:** hay archivos con CRLF y otros con LF. Al editarlos con scripts, conservar el que tienen.
