# CLAUDE.md

**Responder siempre en español**, en todas las sesiones.

## Reglas

- **No usar los emuladores de Firebase:** ni `npm run emuladores`, `npm run dev:emuladores`, `firebase emulators:*`, `npm run test:emulador` ni los tests de `tests/emulador/`. Verificar con `npm run build`, revisión de código y vitest (`npm test` o `npx vitest run <ruta>`). En la suite completa algunos tests fallan por timeout de 5 s en este equipo: correrlos aparte (`--testTimeout=30000`) antes de darlos por rotos.
- **Desplegar las Cloud Functions de a 2 o 3 por vez**, esperando que termine cada tanda. La cuota de CPU de Cloud Run en `us-central1` ("Total CPU allocation, per project per region") está al límite y no se pudo aumentar: un deploy completo falla con `Quota exceeded for total allowable CPU per project per region`. Nunca `npm run deploy` (despliega todas juntas).

  ```bash
  FUNCTIONS_DISCOVERY_TIMEOUT=90 npx firebase-tools deploy --only functions:funcionA,functions:funcionB,functions:funcionC --project workcraft-491b7
  ```

  - Si una tanda falla por cuota: esperar unos minutos y reintentar una vez; si vuelve a fallar, detenerse. De preferencia en horario de poco uso.
  - `FUNCTIONS_DISCOVERY_TIMEOUT=90` va siempre: firebase-tools carga `functions/index.js` antes de desplegar y espera 10 s por defecto, pero aquí tarda unos 25 s. Sin la variable falla con `User code failed to load. Cannot determine backend specification. Timeout after 10000`, que es por el tiempo de carga del código, **no por la cuota de CPU**: no se espera ni cuenta como reintento; basta con usar la variable.
- **Verificar una Function desplegada leyendo Firestore, en modo solo lectura.** Aquí `firebase functions:log` falla (`Failed to retrieve log entries from Google Cloud`) y `gcloud` no funciona (falta Python).
  - Usar un script de Node temporal con `firebase-admin` de `functions/node_modules` y las credenciales de `%APPDATA%/gcloud/application_default_credentials.json`, que solo haga `get`/`getAll`/consultas sobre lo que la Function debió escribir (ej. `alertas/pendientes_*`). Correrlo con `NODE_PATH=functions/node_modules` e `initializeApp({ projectId: 'workcraft-491b7' })`.
  - Guardarlo fuera del repo (`$TEMP`) y borrarlo al terminar. Sin escrituras: si hay que corregir datos, avisar antes.
- **No escribir datos en Firestore de producción** (cargas iniciales, migraciones, correcciones) sin mostrar antes una simulación y esperar aprobación explícita del usuario.

## Flujo de trabajo

- Hacer las tareas directo, sin pedir confirmación, salvo para cambiar reglas o índices de Firestore (mostrar antes el cambio) y para escribir datos en producción (simulación y aprobación).
- Al terminar: `npm run build` y los tests unitarios que correspondan, commit y push a `main`, y desplegar solo lo que cambió (hosting y/o Functions por tandas, nunca `npm run deploy`).
- Respuesta final breve: qué cambió, qué se desplegó y qué no se probó.

## Arquitectura

Medra: SPA interna de una clínica para implantes, hemodinamia, consignación, documentos, laboratorio, vacunatorio, bodega e inventario, con imputación mensual por períodos. Proyecto Firebase `workcraft-491b7`.

### Stack
- **Frontend:** React 19 + Vite 8, Tailwind 4, `lucide-react`. `react-router-dom` solo separa el login (`/`) de `/plataforma/*`; adentro se navega por estado (ver Flujos).
- **Backend:** Firebase Auth (custom token), Firestore, Storage y Hosting (SPA, todo a `index.html`). Cloud Functions v2 en `us-central1`, Node 24, CommonJS; lógica compartida en `.mjs`.
- **Librerías:** Excel `xlsx` (SheetJS) y `exceljs`; PDF `jspdf` + `jspdf-autotable` (generar), `pdfjs-dist` + `tesseract.js` (leer guías); `papaparse` (CSV), `@zxing` (códigos de barra), `react-hook-form` + `zod`.
- **Tests:** vitest + jsdom + Testing Library, cada test junto a su archivo (`*.test.js[x]`).

### Carpetas
- `src/pages/Dashboard.jsx`: armazón tras el login (sidebar, header, vista de acceso rápido); `VIEW_MAP` asocia cada ruta de ítem a su pantalla.
- `src/config/`: menú y permisos (si una pantalla no aparece en el menú, revisar acá primero): `modulesConfig.jsx` (`MODULES`: ítems con ruta, ícono, color de `PALETA_MENU` y flags), `gruposMenu.jsx` (grupos Finanzas y Usuarios y accesos dentro de `administracion`), `accesoMenu.js` (qué ítems ve cada usuario), `componentMaps/` (secciones y botones por vista, para permisos granulares), `modulosActivos.js`.
- `src/components/modulos/<área>/<pantalla>/`: `operaciones/` (implantes, hemodinamia, consignación, documentos, `shared`), `gestiones/` (laboratorio, vacunatorio), `administracion/` (en la interfaz "Herramientas"), `maestros/`, `bodega/`, `inventario/`, `general/` (soporte, ajustes, perfil), `dashboard/`, `privado/` (código antiguo de respaldo).
- `operaciones/shared/`: una sola implementación para Implantes y Hemodinamia, parametrizada por `modulo` (`modulosGestion.js`: colecciones, etiquetas, rutas, nombres de Excel). Los cambios de uno de los dos van aquí.
- `src/context/`: `UserContext`, `ToastContext`, `ModalContext` (`confirmAction`). `src/hooks/`: `useGranularPermission`, `useColumnasPermitidas`, `useVisibleSnapshot` (`onSnapshotVisible`), `useColumnResize`. `src/stores/`: cachés de módulo compartidas (períodos, catálogos, módulos activos). `src/components/ui/`: componentes comunes; tablas corporativas en `maestros/codigosMaestrosV2/ui/`.
- `functions/`: cada carpeta con `index.js` (triggers y callables) y su lógica en `servicio.js` / `nucleo.mjs`. El frontend también importa `functions/permisos/nucleo.mjs`.
- `docs/`: notas técnicas; leer `firestore-buenas-practicas.md` antes de agregar consultas. `tests/emulador/`: no se ejecuta.

### Cloud Functions (`functions/index.js`)
- **Usuarios** (callables): `iniciarSesion` (correo o nombre de usuario, con control de intentos), `crearUsuario`, `desbloquearUsuario`.
- **Permisos** (callables): `guardarPermisosUsuario`, `asignarCentroCostoMasivo`, `asignarAdministradoresMasivo`, `guardarPlantillaCentroCosto`; reescriben el permiso efectivo en `usuarios/{uid}`.
- **Solicitudes de cambio de datos** (callables): `crearSolicitud`, `resolverSolicitud`, `cancelarSolicitud`, `sincronizarMiCorreo`; generan alertas.
- **`functions/alertas`**: módulo (no Function) para crear y resolver alertas. Su aviso por correo (`correo.js`) está desactivado: requiere cuenta remitente y la extensión "Trigger Email from Firestore" (colección `mail`), y se activa con `ALERTAS_CORREO_HABILITADO=true` en `functions/.env.<proyecto>`.
- **Notificaciones** (`functions/notificaciones`): la campana del header (`layout/useNotificaciones.js`) muestra las alertas pendientes del usuario en `alertas`; el clic la marca leída y abre su pantalla.
  - `notificacionesPendientes` (cada 10 min): una alerta agregada por fuente con la cantidad (id `pendientes_<fuente>`): zonas por diagnóstico sin confirmar, gestiones `SOLICITAR` de Implantes y Hemodinamia, ítems `CARGADO` de Consignación y descripciones pendientes. Vuelve a "no leída" si la cantidad sube y se resuelve al llegar a 0.
  - `notificacionesTicket` (trigger): una alerta por ticket nuevo, resuelta cuando deja de estar NUEVO. Las solicitudes de cambio de datos ya creaban la suya.
  - Destinatarios: quien tiene la ruta de destino en sus permisos, más los desarrolladores; en tickets, quien gestiona tickets y los administradores guardados en el ticket.
- **Períodos:** `cerrarPeriodoImputacion` (callable) cierra el mes de un módulo.
- **Estadísticas:** triggers `estadisticasImputada{Implantes,Consignacion,Hemodinamia}` (imputadas) y `estadisticasCierre` (`cierres_periodos`); `estadisticasNocturno` (diario 03:00, hora de Chile); callable `recalcularEstadisticasPeriodo`.
- **Bodega:** callables `bodega*` (catálogo, productos, códigos, documentos, egresos, tránsito, inventarios, cajas, consignación) y trigger `bodegaPeriodo` sobre los cierres. El navegador solo lee `bodega_*`; toda escritura pasa por estas funciones.
- **Triggers sobre gestiones de Implantes:** `zonasDiagnosticoGestionImplante` (maestro de zonas por diagnóstico) y `admisionesGestionadasImplante` (marca admisiones gestionadas). `admisionesGestionadasConsignacion` hace lo mismo con los registros de Consignación (`admisiones_gestionadas_consignacion`, columna "Gestión consignación" de Reporte Info).
- **Reporte Info:** triggers `descripcionesReporteFila` y `descripcionesReporteMaestro` (descripciones ocultas). Estado de cada una en `maestros_descripciones_reporte` con `estadoDescripcion` / `esPendiente` (`functions/descripcionesReporte/nucleo.mjs`):
  - **Pendiente:** tiene `pendienteDesde` y no tiene `actualizadoEl`. El trigger de fila pone `pendienteDesde` solo al crear una descripción nueva; cualquier cambio desde la app (switch, "Marcar como revisada" u "Ocultar esta descripción" de Reporte Info) escribe `actualizadoEl` y la deja revisada.
  - Si no, **oculta** (`ocultaImplantes` u `ocultaDocumentos` en true) o **visible**. Las anteriores a `pendienteDesde` cuentan como revisadas (sin migración).
  - Para notificaciones: pasa a pendiente cuando aparece `pendienteDesde` (creación del documento). Cada corrida de `notificacionesPendientes` quita `pendienteDesde` de las que ya tienen `actualizadoEl`, para que su consulta traiga solo las pendientes.
- **Otras:** `extraerGuiaDespacho` (OCR de guía de despacho), `eliminarDocumentoAdmision` (mueve el PDF a la papelera y audita).

### Modelo de datos (Firestore)
- **`usuarios/{uid}`:** `rol`, `activo`, `permisos` ({modulo: [rutas de ítems]}), `permisosGranulares` ({ruta: {secciones/elementos}}), `centroCostoId`, `ordenModulos`, `ordenSubItems`; subcolección `logs`. Plantillas por centro y rol en `plantillas_permisos/{centroId}__{rol}`. Login: `nombres_usuario` e `intentos_login`.
- **Gestiones** (Implantes y Hemodinamia): `{mod}_gestiones/{anio}/mes/{mes}/dia/{dia}/admision/{adm}/empresa/{emp}/detalles/{id}`, consultadas con `collectionGroup('detalles')` y rango de `documentId()` (`rangoGestiones`). Ítems en `cotizaciones[0].items`; `solicitud`: PENDIENTE, SOLICITAR o SOLICITADO; `itemsSolicitados` y `modificacionPendiente` alimentan "Solicitudes de modificaciones"; subcolección `logs` (`accion`, `usuario`, `timestamp`).
- **Imputadas:** `{mod}_imputadas/{anio}/meses/{mes}/documentos/{itemId}` (implantes, hemodinamia, consignación; collectionGroup `documentos`). Es lo que muestra "Imputados".
- **Períodos:** `configuracion_periodos/{modulo}` (período abierto), `cierres_periodos`, `imputaciones_periodos` (snapshot mensual por módulo), `estadisticas` (agregados).
- **Consignación:** `consignacion_guias`, `consignacion_registros`, `consignacion_imputadas`. **Maestros:** `maestros_*` (códigos, empresas, centros, convenios, recargos, previsiones, instituciones, zonas de diagnóstico…).
- **Documentos y OC:** `documentos_reportesInfo`, `documentos_sistema`, `ordenesOC` (registro de PDF), `ocImport`, `resumen_facturacion_mensual`, `documentos_archivo`.
- **Fibras reutilizables** (Implantes → Fibras, `operaciones/implantes/fibras/`): `implantes_fibras/{FIB-0001}` (una por fibra física; `usosTotales` 5 o 10, `usosPrevios`, `numerosOcupados`, `usosConsumidos`, `estado` ACTIVA/AGOTADA; VENCIDA se calcula) con subcolecciones `usos` (USO o PERDIDA, VIGENTE o ANULADO; nunca se borran) y `logs`; correlativo en `implantes_fibras_control/contador`. El código maestro se marca con `fibraReutilizable` (check en Códigos Maestros).
  - En Cargas, una referencia fibra exige elegir la fibra (cantidad 1, lote y vencimiento de la fibra). El uso se registra al "Guardar Todo" en la MISMA transacción que la gestión (`confirmarConFibras`); borrar la línea o la gestión lo anula. No toca stock, imputación ni montos.
  - Números fijos: cada uso conserva su número (`item.fibra.numeroUso` = el del Detalle); al anular uno, su número lo toma el siguiente uso. Las reglas validan el contador con `ultimoCambio` + get/getAfter del uso. "Anular pérdida" está denegada por defecto.
- **Otras:** `laboratorio_*`, `vacunatorio_*`, `bodega_*`, `inventario_*`; `alertas`, `solicitudes`, `tickets`, `mail`; `modificaciones_exportadas` (historial); `configuracion_sistema` (ej. `modulosActivos`, atajos).

### Flujos principales
- **Login:** `LoginForm` llama a `iniciarSesion` → `signInWithCustomToken` con el token → `UserContext` escucha `usuarios/{uid}` en vivo (los cambios de permisos se aplican sin reingresar; si queda inactivo se cierra la sesión).
- **Roles** (`functions/permisos/nucleo.mjs`): `dev` (Desarrollador, único con acceso total); `admin` (administra usuarios, pero solo ve lo asignado); `encargado` y `operador` (reciben la plantilla de su centro).
- **Menú:** un ítem es visible si su ruta está en `permisos[modulo]`, salvo: `automaticoAdministradores` (siempre admin y dev), `soloDesarrollador` (solo dev), `heredaDe` (también quien tiene otra ruta; ej. Solicitudes de modificaciones hereda de Solicitud) y `pestanaDe` (ex pestañas de Control Procesos de Laboratorio/Vacunatorio: con el contenedor en permisos y su ruta en `permisosGranulares`; ver `config/pestanasControlProcesos.js`).
- **Permisos granulares:** `hasPermission(ruta, seccion, elemento)`; un no dev sin configuración para la vista queda bloqueado; columnas con `useColumnasPermitidas`.
- **Reglas de Firestore:** `tienePermiso(modulo)` exige algún ítem del módulo. Los permisos solo se cambian por callable, nunca escribiendo `usuarios/{uid}` desde el navegador.
- **Códigos de módulos** (`config/codigosModulos.js`, única definición): 3 letras mayúsculas por entrada del sidebar, al estilo de las transacciones de SAP. IMP Implantes, HEM Hemodinamia, CON Consignación, DOC Documentos, LAB Laboratorio, VAC Vacunatorio, BOD Bodega, INV Inventario, MAE Maestros, FIN Finanzas, USR Usuarios y accesos, HER Herramientas (`administracion`), DSH Dashboard, AJU Ajustes. La clave es la interna (módulo o grupo), no el nombre visible. Son únicos y permanentes: no se cambian ni se reutilizan, ni son editables desde la app; un módulo o grupo nuevo necesita el suyo (lo exige `codigosModulos.test.js`). Solo se muestran en los resultados del buscador del sidebar (que también busca por ellos); no van en el menú ni en las vistas de acceso rápido.
- **Códigos de ítems** (mismo archivo, `CODIGOS_ITEMS`): código del módulo de la entrada donde aparece el ítem + 3 letras del nombre (ej. LABFOL Ingreso de Folios, FINCSM Consumos, AJUDAT Datos Personales), sin números. La clave es la ruta del ítem. Las 3 letras nunca son un código de módulo (Imputados = IPT) y una misma pantalla en varios módulos usa las mismas letras (DOCREP / IMPREP). Incluye todos los ítems de `MODULES` y de `AJUSTES_ITEMS`, con o sin permiso del usuario (en el buscador cada uno ve solo los de sus ítems). Igual que los de módulos, solo se muestran en el buscador. Únicos y permanentes: si un ítem cambia de nombre o de grupo conserva su código. Un ítem nuevo necesita el suyo, agregado también a la lista de publicados del test.
- **Buscador del sidebar** (`config/buscadorMenu.js` + `layout/BuscadorMenu.jsx`): por nombre o código, sin mayúsculas ni tildes; un código de módulo lista sus ítems y un código exacto + Enter abre el ítem. Ctrl+K enfoca el campo o, si no está a la vista (sidebar colapsado, módulo abierto, Ajustes), abre el buscador flotante. Su índice se arma solo con lo que el sidebar le muestra al usuario (`entradasDelSidebar`/`itemsDelSidebar` y los Ajustes visibles): nunca revela ítems sin acceso, ni por código.
- **Navegación:** `activeView` es la ruta del ítem; `?modulo=<entrada>` abre la vista de acceso rápido. Para agregar una pantalla: subItem en `MODULES` (color distinto al de sus vecinos), entrada en `VIEW_MAP` y en `componentMaps`.
- **Ciclo de una gestión** (Implantes y Hemodinamia): 1) Gestión: se cargan los ítems. 2) Solicitud: exporta el Excel, marca SOLICITADO, imputa en el período abierto y guarda la copia `itemsSolicitados`. 3) Edición posterior: reimputa al guardar y marca `modificacionPendiente`. 4) Solicitudes de modificaciones: exporta solo lo que cambió.
- **Cargas consolidadas** (Finanzas): exporta juntas Implantes, Consignación y Hemodinamia.
- **Totales de Finanzas** (`administracion/totalesFinanzas/`): Consumos, Facturas y Valorización de bodega por mes (o año completo en los dos primeros), con las mismas celdas que Control Mensual (`obtenerCelda` de `resumenImputacionesStore`, grupos de `controlMensual/constants.js`):
  - Consumos: imputado de Implantes, Consignación y Hemodinamia (`{mod}_imputadas`). Facturas: imputado de Laboratorio y Vacunatorio (factura electrónica). Valorización de bodega: saldo valorizado (foto de `bodega_periodos` al cierre, o `sum()` de `bodega_movimientos` con el mes abierto).
  - En las imputadas, mes cerrado = snapshot de `imputaciones_periodos`; abierto = `count()`/`sum()`. Un mes sin cierre en `cierres_periodos` vale 0 y no se lee.
- **Comparativo mensual** (Finanzas, `totalesFinanzas/comparativoMes.js`): Consumos y Facturas de los mismos días (`desde`–`hasta`, sin pasar de hoy en Chile) del mes pasado y del actual, con diferencia en monto y %.
  - El snapshot mensual no sirve para días: suma `count()`/`sum('total')` con rango sobre la fecha del documento (`fecha` de gestión o cirugía en Consumos; `fchEmis`, emisión de la factura, en Facturas), buscando en los períodos mes−1, mes y mes+1 sin pasar del actual. Un día inexistente en el mes pasado se toma como su último día.
- **Períodos cerrados:** no se editan. **Gestión de módulos** (solo dev): activa o desactiva módulos e ítems para todos; `administracion` no se puede desactivar.

### Comandos
- Build `npm run build`; lint `npm run lint`; tests `npm test` o `npx vitest run <ruta> --testTimeout=30000` (si fallan por timeout o no arrancan los workers, de a uno).
- Deploy (siempre `--project workcraft-491b7`, tras `npm run build`): hosting `npx firebase-tools deploy --only hosting`; Firestore `--only firestore:rules,firestore:indexes`; Storage `--only storage`; Functions por tandas (ver Reglas), nunca `npm run deploy`.

### Convenciones
- **Idioma:** todo en español (identificadores, comentarios, interfaz y commits, con formato `feat(alcance): descripción`). Fechas y montos en `es-CL`, hora de Chile.
- **Comentarios:** explican el porqué y las decisiones; los archivos importantes llevan cabecera. Mantener esa densidad.
- **Lecturas de Firestore (crítico):** sin listeners ni consultas nuevas si no son estrictamente necesarios; `collectionGroup` siempre con rango de `documentId()`; usar `onSnapshotVisible` (pausa con la pestaña oculta); escribir solo los campos que cambian, con `writeBatch`; auditar cada cambio relevante en la subcolección `logs`.
- **Estructura:** lógica pura en `.js` con su test; acceso a datos en hooks `use<Pantalla>Data`; pantalla en `.jsx`.
- **Tablas:** con `TablaCodigos` o `ThRedimensionable` + `useColumnResize`. Un `.jsx` con `<table>` literal debe usar `useColumnasPermitidas` o estar en `TABLAS_PENDIENTES` (lo exige `coberturaPermisos.test.js`); las vistas reutilizadas con otra ruta van en `RUTAS_DINAMICAS`.
- **Cambios de nombre:** al renombrar algo visible, cambiar solo etiquetas; rutas, claves de permisos y colecciones no se tocan (las guardan los usuarios y las validan las reglas).
- **Finales de línea:** hay archivos con CRLF y otros con LF; al editarlos con scripts, conservar el que tienen.
