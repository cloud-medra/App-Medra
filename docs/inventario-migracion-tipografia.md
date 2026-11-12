# Inventario para migrar a los tokens de tipografía

Foto del 06-11-2026, con las pantallas nuevas agregadas el 12-11-2026: las cifras cambian a medida que se editan las pantallas. Cada módulo se migra solo cuando el usuario lo indica, siguiendo [procedimiento-migracion-tipografia.md](procedimiento-migracion-tipografia.md).

**Fuente:** desde el 12-11-2026 toda la app usa Inter (`--font-sans` en `tipografia.css`); no queda nada por migrar en la fuente. Ese día se quitaron los `font-sans` sueltos y los 13 `font-mono` (pasaron a `tabular-nums`), y `font-num` dejó de forzar la fuente del sistema. Lo pendiente de cada archivo listado abajo son tamaños, grosores y colores.

## Migrado (tamaños, grosores y colores con tokens)

| Parte | Archivos | Fecha |
|---|---|---|
| **Header** | `pages/Dashboard.jsx` (zona `<header>`), `layout/SelectorInstitucion.jsx`, `layout/NotificacionesCampana.jsx`, `recordatorios/RecordatoriosAlarma.jsx` | 06-11-2026 |
| **Sidebar** | `pages/Dashboard.jsx` (zona `<aside>`), `layout/BuscadorMenu.jsx`, `layout/PeriodoAbiertoBloque.jsx` | 06-11-2026 |
| **Dashboard: Generales** | `dashboard/ResumenGeneral.jsx`, `generales/` (`AgendaCalendar`, `AgendaCarrusel`, `AtajosCard`, `BienvenidaCard`, `BrandingCard`, `InformacionDelDia`, `NuevoModuloCard`) | 06-11-2026 |
| **Dashboard: Panel de inicio** | `panelInicio/` (`PanelInicioCard`, `PendientesSeccion`, `ResumenFinanzasSeccion`) | 06-11-2026 |
| **Finanzas: Historial de imputaciones** (nacida con tokens) | `administracion/historialImputaciones/HistorialImputaciones.jsx` | 09-11-2026 |
| **Maestros: Códigos de barra** (nacida con tokens) | `maestros/codigosBarra/` (`CodigosBarra`, `AccionCodigoModal`, `CorregirCodigoModal`) | 09-11-2026 |
| **Bodega: aviso de ítem del maestro** (nacido con tokens) | `bodega/shared/AvisoMaestroConProducto.jsx` | 09-11-2026 |
| **Armado de Kits** (nacido con tokens) | `armadoKits/shared/` (`PantallaKits`, `PantallaConfiguracionKits`, `DetalleKit`, `FormKitModal`, `KitsEnTransito`, `DespachoKitModal`, `CompletarVencimientoModal`, `ReposicionKitModal`, `RevisarDevolucionKitModal`) | 09 y 10-11-2026 |
| **Portal Proveedores: Órdenes de compra** | `portalProveedores/ordenesCompra/OrdenesCompra.jsx` | 12-11-2026 |
| **Piezas sueltas: acceso y páginas** | `components/LoginForm.jsx`, `pages/auth/CambiarPassword.jsx`, `pages/PlataformaExterna.jsx`, `pages/TestPage.jsx`, `pages/Dashboard.jsx` (texto de carga de `<main>`) | 12-11-2026 |
| **Componentes comunes** | `components/ui/` (`ModalConfirm`, `Toast`, `BotonRestablecerAnchos`, `PaginacionSimple`, `BuscadorConLimpiar`, `CentroSelect`, `MultiSelectFiltro`, `TablaRedimensionable`, `bodymap/DetalleZona`, `bodymap/CuerpoCompleto`). Se ven con tokens también dentro de pantallas sin migrar | 12-11-2026 |
| **General** | `general/` (20 archivos: Ajustes, Perfil, foto de perfil, Soporte y tickets, textos legales, acceso rápido de módulos). Excepción: la inicial del avatar grande de Perfil (`text-5xl`), que es gráfica | 12-11-2026 |

Login y cambio de contraseña usan además los tokens `text-acceso-*` (portada de 30, título de 24 y cuerpo de 16 px; solo para pantallas de acceso). Conservan sus grises (`text-gray-*`) y no usan `text-tinta-*`: tienen fondo blanco fijo y la clase `.dark` se aplica a toda la página, así que con el tema oscuro guardado el texto quedaría claro sobre blanco. Los textos legales que abre el cambio de contraseña (`general/legales/`) van con el módulo General.

`generales/AvanceInventario.jsx` no se migró porque está fuera de circulación (comentado en `ResumenGeneral.jsx`). Migrarlo solo si vuelve a usarse.

## Riesgos de espacio con Inter

Medido en Edge contra Segoe UI, la fuente del sistema en Windows.

| Grosor | Más ancha que Segoe UI, en promedio |
|---|---:|
| 400 | 8,4% |
| 500 | 7,4% |
| 600 | 8,7% |
| 700 | 5,1% |

Las fechas y los montos crecen más, porque los números tabulares de Inter son anchos:

| Texto | Inter | Segoe UI |
|---|---:|---:|
| `05-11-2026`, 15 px / 600 | 97 px | 79 px |
| `05-11-2026`, 12 px / 500 | 78 px | 63 px |
| `$ 123.456.789`, 13 px / 700 | 95 px | 85 px |
| `$ 123.456.789`, 11 px / 500 | 80 px | 69 px |

Por revisar: desde el 12-11-2026 estas pantallas ya muestran Inter con sus tamaños actuales, así que el riesgo de cortes existe aunque no se hayan migrado.

- **Tarjetas de indicadores:** `codigosMaestrosV2/HistorialUso.jsx` no cabe tal como está: "Último uso" a 15 px / 600 mide 97 px y la tarjeta tiene unos 92 px útiles; usar `text-numero-indicador` (13 px). También `estadisticas/components/TarjetaIndicador.jsx` (Herramientas → Estadísticas).
- **Tablas angostas:** `shared/gestion/GestionesTable.jsx` (columnas con mínimos de 60 px), `cargasConsignacion/components/CargasTab.jsx` (60 cortes de texto), `ResumenConsignacion`, `SolicitudesUnificadasTable`, `SolicitudGestiones`, `DetalleVinculacionOC`.
- **Controles bajos, de 20 a 28 px:** `Cargastab.jsx`, `EditorDocumentos.jsx`, `Informaciontab.jsx`.
- **Textos de menos de 10 px:** suben a 10 px. Los que más tienen: `PadMaestros.jsx`, `Cargastab.jsx`, `CotizacionCard.jsx`.
- **`font-num`:** Bodega concentra la mayor parte.

Cuenta en cada `.jsx`, sin tests ni `privado/`: **clases** = tamaños, grosores y familias escritos a mano; **<10 px** = textos de 8 a 9,5 px, que al migrar suben a `text-pequeno` (10 px); **`font-num`** = clase que se reemplaza por `text-numero-tabla` (desde el 12-11-2026 solo aplica `tabular-nums`; antes forzaba la fuente del sistema); **cortes** = `truncate` o `whitespace-nowrap`, donde un texto más ancho se corta en vez de pasar a otra línea.

## operaciones

85 archivos, 2195 clases.

### implantes/gestionImplantes (10 archivos, 460 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `components/Cargastab/Cargastab.jsx` | 153 | 44 | 3 | 5 |
| `components/Cargastab/CotizacionCard.jsx` | 99 | 35 | 2 | 5 |
| `implantes/gestionImplantes/GestionesImplanteDrawers.jsx` | 69 | 12 | 5 | 5 |
| `components/Informaciontab/Informaciontab.jsx` | 67 | 6 | 1 | 0 |
| `components/Cargastab/PadContenidoRow.jsx` | 23 | 6 | 1 | 3 |
| `components/Cargastab/ContenidoPadRegistrado.jsx` | 11 | 3 | 0 | 1 |
| `components/Cargastab/NotasAdmision.jsx` | 11 | 4 | 0 | 1 |
| `components/Bodymaptab/BodymapTab.jsx` | 10 | 0 | 0 | 0 |
| `gestionImplantes/components/GestionesImplantesDetalleView.jsx` | 10 | 0 | 0 | 2 |
| `gestionImplantes/components/EmpresaSelect.jsx` | 7 | 1 | 0 | 3 |

### hemodinamia/gestionHemodinamia (6 archivos, 328 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `components/Cargastab/Cargastab.jsx` | 145 | 41 | 2 | 5 |
| `components/Cargastab/CotizacionCard.jsx` | 78 | 28 | 1 | 5 |
| `components/Informaciontab/Informaciontab.jsx` | 65 | 5 | 1 | 0 |
| `components/Cargastab/PadContenidoRow.jsx` | 23 | 6 | 1 | 3 |
| `gestionHemodinamia/components/GestionesHemodinamiaDetalleView.jsx` | 10 | 0 | 0 | 2 |
| `gestionHemodinamia/components/EmpresaSelect.jsx` | 7 | 1 | 0 | 3 |

### consignacion/cargasConsignacion (10 archivos, 264 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `cargasConsignacion/components/CargasTab.jsx` | 103 | 31 | 6 | 60 |
| `cargasConsignacion/components/DeliveryTab.jsx` | 40 | 10 | 3 | 0 |
| `cargasConsignacion/components/DetalleTab.jsx` | 31 | 10 | 1 | 0 |
| `cargasConsignacion/components/InformacionTab.jsx` | 25 | 1 | 0 | 0 |
| `cargasConsignacion/components/CargasConsignacionDetalleView.jsx` | 23 | 2 | 0 | 1 |
| `cargasConsignacion/components/CargasConsignacionTable.jsx` | 15 | 2 | 1 | 3 |
| `consignacion/cargasConsignacion/CargasConsignacion.jsx` | 12 | 0 | 0 | 0 |
| `cargasConsignacion/components/CargasConsignacionFiltros.jsx` | 8 | 0 | 0 | 0 |
| `cargasConsignacion/components/EstadoFilterDropdown.jsx` | 6 | 0 | 0 | 0 |
| `cargasConsignacion/components/HistorialTab.jsx` | 1 | 0 | 0 | 0 |

### shared/gestion (8 archivos, 188 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/gestion/GestionesForm.jsx` | 61 | 7 | 0 | 1 |
| `shared/gestion/DetallesTab.jsx` | 50 | 15 | 2 | 0 |
| `shared/gestion/GestionGestiones.jsx` | 29 | 0 | 0 | 0 |
| `shared/gestion/GestionesTable.jsx` | 26 | 6 | 1 | 5 |
| `shared/gestion/EmpresasFechasPanel.jsx` | 9 | 2 | 2 | 1 |
| `shared/gestion/DiaFilterDropdown.jsx` | 6 | 0 | 0 | 0 |
| `shared/gestion/EstadoFilterDropdown.jsx` | 6 | 0 | 0 | 0 |
| `shared/gestion/MensajeDuplicado.jsx` | 1 | 0 | 0 | 0 |

### consignacion/registroConsignacion (5 archivos, 127 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `registroConsignacion/components/RegistroConsignacionForm.jsx` | 84 | 12 | 2 | 6 |
| `registroConsignacion/components/ConsignacionTable.jsx` | 20 | 3 | 1 | 2 |
| `consignacion/registroConsignacion/RegistroConsignacion.jsx` | 12 | 0 | 0 | 0 |
| `registroConsignacion/components/ConsignacionFiltros.jsx` | 7 | 0 | 0 | 0 |
| `registroConsignacion/components/CeldaOrdenConsignacion.jsx` | 4 | 0 | 1 | 1 |

### documentos/reportesInfo (3 archivos, 77 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `documentos/reportesInfo/ReportesInfo.jsx` | 54 | 1 | 0 | 9 |
| `documentos/reportesInfo/DetalleGestionReporte.jsx` | 21 | 3 | 0 | 2 |
| `documentos/reportesInfo/BadgeGestionImplante.jsx` | 2 | 0 | 0 | 1 |

### implantes/fibras (5 archivos, 68 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `implantes/fibras/FibrasReutilizables.jsx` | 30 | 1 | 7 | 2 |
| `implantes/fibras/DialogosFibra.jsx` | 14 | 0 | 0 | 0 |
| `implantes/fibras/SelectorFibra.jsx` | 11 | 1 | 0 | 0 |
| `implantes/fibras/DetalleFibra.jsx` | 10 | 0 | 1 | 1 |
| `implantes/fibras/NombreFibra.jsx` | 3 | 0 | 0 | 0 |

### documentos/importarDetallesOC (3 archivos, 65 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `documentos/importarDetallesOC/ImportarDetallesOC.jsx` | 42 | 0 | 2 | 1 |
| `importarDetallesOC/components/ResumenImportacion.jsx` | 15 | 0 | 2 | 0 |
| `importarDetallesOC/components/ModalEliminarFilas.jsx` | 8 | 0 | 2 | 1 |

### documentos/ingresoOrdenes (4 archivos, 52 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `ingresoOrdenes/components/OCSinPdf.jsx` | 18 | 1 | 2 | 1 |
| `ingresoOrdenes/components/IngresoOrdenesDetalleView.jsx` | 15 | 1 | 2 | 2 |
| `ingresoOrdenes/components/RegistrosOrdenes.jsx` | 14 | 0 | 0 | 1 |
| `documentos/ingresoOrdenes/IngresoOrdenes.jsx` | 5 | 0 | 0 | 0 |

### documentos/seguimientoFacturasGuias (3 archivos, 49 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `documentos/seguimientoFacturasGuias/SeguimientoFacturasGuias.jsx` | 34 | 2 | 3 | 1 |
| `documentos/seguimientoFacturasGuias/ResumenMensual.jsx` | 11 | 0 | 1 | 0 |
| `documentos/seguimientoFacturasGuias/RutEmpresa.jsx` | 4 | 0 | 1 | 0 |

### documentos/archivoDigital (3 archivos, 48 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `documentos/archivoDigital/ArchivoDigital.jsx` | 29 | 0 | 0 | 8 |
| `documentos/archivoDigital/DialogoNombre.jsx` | 10 | 0 | 0 | 0 |
| `documentos/archivoDigital/DialogoMover.jsx` | 9 | 0 | 0 | 2 |

### shared/respaldoDocumentos (2 archivos, 48 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/respaldoDocumentos/FormularioRespaldo.jsx` | 25 | 0 | 0 | 1 |
| `shared/respaldoDocumentos/RespaldoDocumentos.jsx` | 23 | 0 | 0 | 2 |

### shared/documentosAdmision (4 archivos, 44 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/documentosAdmision/DocumentosTab.jsx` | 26 | 2 | 0 | 5 |
| `shared/documentosAdmision/ConfirmarEliminarDocumento.jsx` | 8 | 0 | 0 | 0 |
| `shared/documentosAdmision/VisorDocumentoModal.jsx` | 7 | 0 | 0 | 2 |
| `shared/documentosAdmision/ZonaSubidaPdf.jsx` | 3 | 1 | 0 | 0 |

### shared/sincronizacionImputadas (1 archivos, 42 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/sincronizacionImputadas/SincronizacionImputadas.jsx` | 42 | 13 | 0 | 1 |

### shared (3 archivos, 40 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `operaciones/shared/DetalleGestionConHeader.jsx` | 16 | 0 | 0 | 0 |
| `operaciones/shared/AgregarEmpresaFechaForm.jsx` | 12 | 3 | 0 | 0 |
| `operaciones/shared/ModalConfirmarCarga.jsx` | 12 | 0 | 1 | 1 |

### consignacion/ingresarGuiaDespacho (1 archivos, 39 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `consignacion/ingresarGuiaDespacho/IngresarGuiaDespacho.jsx` | 39 | 2 | 0 | 4 |

### consignacion/cargaMasivaConsignacion (1 archivos, 36 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `consignacion/cargaMasivaConsignacion/CargaMasivaConsignacion.jsx` | 36 | 4 | 0 | 4 |

### consignacion/listadoguiasconsignacion (1 archivos, 29 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `consignacion/listadoguiasconsignacion/Listadoguiasconsignacion.jsx` | 29 | 2 | 1 | 2 |

### shared/cargaMasivaDocumentos (1 archivos, 27 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/cargaMasivaDocumentos/CargaMasivaDocumentos.jsx` | 27 | 2 | 0 | 0 |

### consignacion/resumenConsignacion (1 archivos, 24 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `consignacion/resumenConsignacion/ResumenConsignacion.jsx` | 24 | 2 | 1 | 18 |

### shared/resumen (1 archivos, 24 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/resumen/ResumenGestiones.jsx` | 24 | 2 | 1 | 15 |

### shared/solicitud (1 archivos, 24 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/solicitud/SolicitudGestiones.jsx` | 24 | 3 | 1 | 17 |

### consignacion/solicitudConsignacion (1 archivos, 22 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `consignacion/solicitudConsignacion/SolicitudConsignacion.jsx` | 22 | 2 | 1 | 16 |

### shared/solicitudModificaciones (1 archivos, 22 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/solicitudModificaciones/SolicitudModificaciones.jsx` | 22 | 0 | 0 | 0 |

### shared/ordenesOC (2 archivos, 21 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/ordenesOC/OrdenTab.jsx` | 15 | 2 | 2 | 0 |
| `shared/ordenesOC/ControlPdfOC.jsx` | 6 | 0 | 0 | 0 |

### shared/ocIndex (1 archivos, 16 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/ocIndex/SincronizarOCResumenModal.jsx` | 16 | 1 | 2 | 0 |

### documentos (1 archivos, 7 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `operaciones/documentos/PlaceholderModulo.jsx` | 7 | 0 | 0 | 0 |

### consignacion/utils (1 archivos, 2 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `consignacion/utils/BadgePrecioEspecial.jsx` | 2 | 1 | 0 | 1 |

### shared/estadoGestion (1 archivos, 2 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/estadoGestion/EstadoBadge.jsx` | 2 | 0 | 0 | 2 |

## gestiones

56 archivos, 1750 clases.

### laboratorio/procesos (19 archivos, 648 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `fases/documentosListasIngreso/DetalleListasIngreso.jsx` | 83 | 9 | 8 | 9 |
| `fases/documentosEditor/EdicionComponent.jsx` | 60 | 2 | 0 | 1 |
| `fases/solicitudDiferencias/DetalleSolicitudDif.jsx` | 58 | 10 | 0 | 12 |
| `fases/vinculacionOrden/DetalleVinculacionOC.jsx` | 54 | 9 | 0 | 9 |
| `fases/vinculacionCodigos/DetalleDocu.jsx` | 51 | 8 | 0 | 9 |
| `fases/documentosRecibidos/EditorDocumentos.jsx` | 42 | 10 | 1 | 1 |
| `fases/documentosImputados/EditarDocumentoImputado.jsx` | 39 | 0 | 0 | 1 |
| `fases/documentosEditor/VizualizadorDetallesImputados.jsx` | 37 | 0 | 0 | 1 |
| `fases/documentosImputados/VizualizadorDetallesImputados.jsx` | 37 | 0 | 0 | 1 |
| `fases/documentosRecibidos/HistorialDocumentos.jsx` | 28 | 8 | 2 | 3 |
| `fases/iniciarProceso/IniciarProceso.jsx` | 24 | 0 | 0 | 6 |
| `fases/vinculacionOrden/DrawerSeleccionOC.jsx` | 23 | 1 | 0 | 1 |
| `fases/solicitudDiferencias/SolicitudDiferencias.jsx` | 21 | 0 | 0 | 8 |
| `fases/documentosListasIngreso/DocListasIngreso.jsx` | 19 | 0 | 0 | 8 |
| `fases/vinculacionCodigos/VinculacionCodigos.jsx` | 15 | 0 | 0 | 8 |
| `fases/vinculacionOrden/VinculacionOrden.jsx` | 15 | 0 | 0 | 8 |
| `fases/documentosEditor/DocumentosEditor.jsx` | 14 | 0 | 0 | 10 |
| `fases/documentosImputados/DocumentosImputados.jsx` | 14 | 0 | 0 | 10 |
| `fases/documentosRecibidos/DocRecibidos.jsx` | 14 | 0 | 0 | 6 |

### vacunatorio/procesos (19 archivos, 648 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `fases/documentosListasIngreso/DetalleListasIngreso.jsx` | 83 | 9 | 8 | 9 |
| `fases/documentosEditor/EdicionComponent.jsx` | 60 | 2 | 0 | 1 |
| `fases/solicitudDiferencias/DetalleSolicitudDif.jsx` | 58 | 10 | 0 | 12 |
| `fases/vinculacionOrden/DetalleVinculacionOC.jsx` | 54 | 9 | 0 | 9 |
| `fases/vinculacionCodigos/DetalleDocu.jsx` | 51 | 8 | 0 | 9 |
| `fases/documentosRecibidos/EditorDocumentos.jsx` | 42 | 10 | 1 | 1 |
| `fases/documentosImputados/EditarDocumentoImputado.jsx` | 39 | 0 | 0 | 1 |
| `fases/documentosEditor/VizualizadorDetallesImputados.jsx` | 37 | 0 | 0 | 1 |
| `fases/documentosImputados/VizualizadorDetallesImputados.jsx` | 37 | 0 | 0 | 1 |
| `fases/documentosRecibidos/HistorialDocumentos.jsx` | 28 | 8 | 2 | 3 |
| `fases/iniciarProceso/IniciarProceso.jsx` | 24 | 0 | 0 | 6 |
| `fases/vinculacionOrden/DrawerSeleccionOC.jsx` | 23 | 1 | 0 | 1 |
| `fases/solicitudDiferencias/SolicitudDiferencias.jsx` | 21 | 0 | 0 | 8 |
| `fases/documentosListasIngreso/DocListasIngreso.jsx` | 19 | 0 | 0 | 8 |
| `fases/vinculacionCodigos/VinculacionCodigos.jsx` | 15 | 0 | 0 | 8 |
| `fases/vinculacionOrden/VinculacionOrden.jsx` | 15 | 0 | 0 | 8 |
| `fases/documentosEditor/DocumentosEditor.jsx` | 14 | 0 | 0 | 10 |
| `fases/documentosImputados/DocumentosImputados.jsx` | 14 | 0 | 0 | 10 |
| `fases/documentosRecibidos/DocRecibidos.jsx` | 14 | 0 | 0 | 6 |

### laboratorio/registros (4 archivos, 130 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `laboratorio/registros/EmpresasLaboratorioDrawers.jsx` | 50 | 6 | 1 | 5 |
| `laboratorio/registros/CodigoLaboratorioDrawers.jsx` | 37 | 3 | 1 | 5 |
| `laboratorio/registros/EmpresasLaboratorio.jsx` | 26 | 4 | 0 | 0 |
| `laboratorio/registros/CodigoLaboratorio.jsx` | 17 | 1 | 0 | 5 |

### vacunatorio/registros (3 archivos, 111 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `vacunatorio/registros/EmpresasVacunatorio.jsx` | 57 | 9 | 1 | 3 |
| `vacunatorio/registros/CodigoVacunatorioDrawers.jsx` | 37 | 3 | 1 | 5 |
| `vacunatorio/registros/CodigoVacunatorio.jsx` | 17 | 1 | 0 | 5 |

### laboratorio/importaciones (2 archivos, 55 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `laboratorio/importaciones/OrdenLaboratorio.jsx` | 36 | 4 | 0 | 1 |
| `laboratorio/importaciones/XmlDocLaboratorio.jsx` | 19 | 0 | 0 | 0 |

### vacunatorio/importaciones (2 archivos, 55 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `vacunatorio/importaciones/OrdenVacunatorio.jsx` | 36 | 4 | 0 | 1 |
| `vacunatorio/importaciones/XmlDocVacunatorio.jsx` | 19 | 0 | 0 | 0 |

### shared (5 archivos, 53 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `gestiones/shared/DetalleOrdenTabla.jsx` | 23 | 0 | 0 | 5 |
| `gestiones/shared/FaseControlProcesos.jsx` | 15 | 0 | 1 | 0 |
| `gestiones/shared/TablaOrdenes.jsx` | 6 | 0 | 0 | 5 |
| `gestiones/shared/TablaXmlDocumentos.jsx` | 6 | 0 | 0 | 6 |
| `gestiones/shared/EstadoProcesoBadge.jsx` | 3 | 1 | 0 | 1 |

### laboratorio/vizualizador (1 archivos, 25 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `laboratorio/vizualizador/XmlDetallesDoc.jsx` | 25 | 3 | 0 | 4 |

### vacunatorio/vizualizador (1 archivos, 25 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `vacunatorio/vizualizador/XmlDetallesDoc.jsx` | 25 | 3 | 0 | 4 |

## maestros

33 archivos, 908 clases.

### padMaestros (1 archivos, 124 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/padMaestros/PadMaestros.jsx` | 124 | 56 | 7 | 1 |

### codigosMaestrosV2 (12 archivos, 123 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/codigosMaestrosV2/HistorialUso.jsx` | 18 | 0 | 0 | 0 |
| `maestros/codigosMaestrosV2/PanelEdicionCodigo.jsx` | 16 | 0 | 0 | 2 |
| `maestros/codigosMaestrosV2/PanelHistorial.jsx` | 15 | 0 | 0 | 2 |
| `codigosMaestrosV2/ui/TablaCodigos.jsx` | 15 | 0 | 0 | 2 |
| `codigosMaestrosV2/ui/Campos.jsx` | 13 | 0 | 0 | 2 |
| `maestros/codigosMaestrosV2/CodigosMaestrosV2.jsx` | 12 | 0 | 0 | 1 |
| `maestros/codigosMaestrosV2/PanelImportarExportar.jsx` | 10 | 0 | 0 | 1 |
| `codigosMaestrosV2/tabs/TabVistaGeneralV2.jsx` | 7 | 1 | 0 | 0 |
| `codigosMaestrosV2/tabs/TabSolicitudPreciosV2.jsx` | 6 | 0 | 0 | 0 |
| `codigosMaestrosV2/tabs/TabConCodigoV2.jsx` | 5 | 1 | 0 | 0 |
| `codigosMaestrosV2/tabs/TabPendientesV2.jsx` | 4 | 1 | 0 | 0 |
| `codigosMaestrosV2/ui/BarraFiltros.jsx` | 2 | 0 | 0 | 0 |

### recargosMaestros (2 archivos, 86 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/recargosMaestros/RecargosMaestrosDrawers.jsx` | 52 | 7 | 1 | 5 |
| `maestros/recargosMaestros/RecargosMaestros.jsx` | 34 | 6 | 0 | 0 |

### centrosMaestros (2 archivos, 82 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/centrosMaestros/CentrosMaestrosDrawers.jsx` | 52 | 7 | 1 | 5 |
| `maestros/centrosMaestros/CentrosMaestros.jsx` | 30 | 5 | 0 | 0 |

### prestadoresMaestro (2 archivos, 82 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/prestadoresMaestro/PrestadoresMaestrosDrawers.jsx` | 53 | 7 | 1 | 5 |
| `maestros/prestadoresMaestro/PrestadoresMaestros.jsx` | 29 | 5 | 0 | 0 |

### actualizacionPreciosMaestros (4 archivos, 75 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `actualizacionPreciosMaestros/components/DetalleImportacion.jsx` | 29 | 13 | 3 | 1 |
| `maestros/actualizacionPreciosMaestros/ActualizacionPreciosMaestros.jsx` | 21 | 8 | 1 | 0 |
| `actualizacionPreciosMaestros/components/HistorialImportaciones.jsx` | 13 | 5 | 2 | 2 |
| `actualizacionPreciosMaestros/components/SelectorEmpresa.jsx` | 12 | 6 | 2 | 2 |

### empresasMaestros (2 archivos, 75 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/empresasMaestros/EmpresasMaestrosDrawers.jsx` | 49 | 6 | 1 | 5 |
| `maestros/empresasMaestros/EmpresasMaestros.jsx` | 26 | 4 | 0 | 0 |

### conveniosMaestros (2 archivos, 74 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/conveniosMaestros/ConveniosMaestrosDrawers.jsx` | 48 | 6 | 1 | 5 |
| `maestros/conveniosMaestros/ConveniosMaestros.jsx` | 26 | 4 | 0 | 0 |

### previsionesMaestros (2 archivos, 74 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/previsionesMaestros/PrevisionesMaestrosDrawers.jsx` | 48 | 6 | 1 | 5 |
| `maestros/previsionesMaestros/PrevisionesMaestros.jsx` | 26 | 4 | 0 | 0 |

### zonasDiagnostico (1 archivos, 43 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/zonasDiagnostico/ZonasDiagnostico.jsx` | 43 | 0 | 0 | 3 |

### institucionesMaestros (1 archivos, 26 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/institucionesMaestros/InstitucionesMaestros.jsx` | 26 | 3 | 0 | 0 |

### calculadorMaestros (1 archivos, 25 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/calculadorMaestros/CalculadorMaestros.jsx` | 25 | 0 | 0 | 0 |

### descripcionesOcultas (1 archivos, 19 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `maestros/descripcionesOcultas/DescripcionesOcultas.jsx` | 19 | 1 | 0 | 1 |

## administracion

45 archivos, 759 clases.

### usuarios (13 archivos, 177 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/usuarios/ListadoUsuario.jsx` | 47 | 8 | 0 | 1 |
| `administracion/usuarios/MarcoEdicionUsuario.jsx` | 25 | 0 | 0 | 2 |
| `administracion/usuarios/EditorPermisos.jsx` | 24 | 1 | 0 | 3 |
| `administracion/usuarios/CamposFormulario.jsx` | 13 | 0 | 0 | 0 |
| `administracion/usuarios/PanelPermisosVista.jsx` | 13 | 0 | 0 | 0 |
| `administracion/usuarios/EditarUsuario.jsx` | 12 | 0 | 0 | 0 |
| `administracion/usuarios/AsignacionAdministradores.jsx` | 10 | 0 | 0 | 0 |
| `administracion/usuarios/CrearUsuario.jsx` | 10 | 0 | 0 | 0 |
| `administracion/usuarios/BarraCentroCosto.jsx` | 8 | 0 | 0 | 0 |
| `administracion/usuarios/SelectorInstitucionesUsuario.jsx` | 8 | 0 | 0 | 1 |
| `administracion/usuarios/MarcarTodaLaVista.jsx` | 3 | 0 | 0 | 0 |
| `administracion/usuarios/AvisoCentroSinConfigurar.jsx` | 2 | 0 | 0 | 0 |
| `administracion/usuarios/MarcaOrigen.jsx` | 2 | 1 | 0 | 0 |

### controlMensual (5 archivos, 133 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/controlMensual/ControlMensual.jsx` | 42 | 7 | 0 | 0 |
| `administracion/controlMensual/MonthRow.jsx` | 31 | 1 | 5 | 0 |
| `administracion/controlMensual/PanelAperturaPeriodo.jsx` | 22 | 2 | 0 | 0 |
| `administracion/controlMensual/ModalCierreMes.jsx` | 21 | 0 | 1 | 0 |
| `administracion/controlMensual/ModalesControlMensual.jsx` | 17 | 0 | 1 | 0 |

### resumenPeriodoAbierto (2 archivos, 89 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/resumenPeriodoAbierto/ResumenPeriodoAbierto.jsx` | 68 | 11 | 0 | 0 |
| `administracion/resumenPeriodoAbierto/BodegaPeriodoCard.jsx` | 21 | 0 | 2 | 0 |

### estadisticas (8 archivos, 78 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/estadisticas/Estadisticas.jsx` | 30 | 0 | 0 | 2 |
| `estadisticas/components/PanelDetalle.jsx` | 19 | 0 | 0 | 2 |
| `estadisticas/components/BarrasTop.jsx` | 8 | 0 | 0 | 2 |
| `estadisticas/components/TablaCodigos.jsx` | 6 | 0 | 0 | 4 |
| `estadisticas/components/TarjetaIndicador.jsx` | 5 | 0 | 0 | 1 |
| `estadisticas/components/TablaComun.jsx` | 4 | 0 | 0 | 1 |
| `estadisticas/components/TablaDimension.jsx` | 4 | 0 | 0 | 3 |
| `estadisticas/components/Variacion.jsx` | 2 | 0 | 0 | 0 |

### cargasConsolidado (8 archivos, 58 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/cargasConsolidado/CargasConsolidado.jsx` | 14 | 0 | 0 | 0 |
| `cargasConsolidado/components/SolicitudesUnificadasTable.jsx` | 14 | 3 | 1 | 17 |
| `cargasConsolidado/components/ImputadasUnificadasTable.jsx` | 11 | 2 | 1 | 7 |
| `cargasConsolidado/components/GestionUnificadaTable.jsx` | 9 | 3 | 0 | 7 |
| `cargasConsolidado/components/OrigenFilterDropdown.jsx` | 5 | 0 | 0 | 0 |
| `cargasConsolidado/components/FiltroAnioMes.jsx` | 3 | 0 | 0 | 0 |
| `cargasConsolidado/components/FiltrosBusquedaOrigen.jsx` | 1 | 0 | 0 | 0 |
| `cargasConsolidado/components/PaginacionSimple.jsx` | 1 | 0 | 0 | 0 |

### notasAdmin (2 archivos, 58 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/notasAdmin/NotasAdmin.jsx` | 43 | 3 | 0 | 0 |
| `administracion/notasAdmin/SelectorEstiloNota.jsx` | 15 | 1 | 0 | 1 |

### totalesFinanzas (2 archivos, 45 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/totalesFinanzas/ComparativoMes.jsx` | 24 | 0 | 4 | 0 |
| `administracion/totalesFinanzas/TotalFinanzas.jsx` | 21 | 0 | 3 | 0 |

### alertas (1 archivos, 37 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/alertas/Alertas.jsx` | 37 | 0 | 0 | 2 |

### permisosCentro (2 archivos, 36 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/permisosCentro/ConfigurarCentro.jsx` | 19 | 0 | 0 | 0 |
| `administracion/permisosCentro/PermisosPorCentro.jsx` | 17 | 1 | 0 | 4 |

### recordatorios (1 archivos, 36 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/recordatorios/Recordatorios.jsx` | 36 | 2 | 1 | 0 |

### gestionModulos (1 archivos, 12 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `administracion/gestionModulos/GestionModulos.jsx` | 12 | 0 | 0 | 2 |

## bodega

35 archivos, 670 clases.

### shared (11 archivos, 202 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/documentos/EditorLineasStock.jsx` | 50 | 3 | 14 | 0 |
| `shared/transito/GestionTransitoModal.jsx` | 29 | 0 | 4 | 0 |
| `shared/documentos/PantallaDocumento.jsx` | 23 | 0 | 3 | 1 |
| `bodega/shared/ModalVincularCodigo.jsx` | 23 | 0 | 8 | 1 |
| `bodega/shared/FormProducto.jsx` | 22 | 0 | 5 | 0 |
| `shared/transito/TablaTransitos.jsx` | 17 | 2 | 7 | 0 |
| `shared/transito/HistorialTransitoModal.jsx` | 14 | 0 | 2 | 0 |
| `shared/documentos/SelectorProveedor.jsx` | 8 | 0 | 2 | 1 |
| `shared/escaneo/CampoEscaneoBodega.jsx` | 8 | 0 | 1 | 0 |
| `bodega/shared/BuscadorProducto.jsx` | 5 | 0 | 1 | 0 |
| `bodega/shared/TablaBodega.jsx` | 3 | 0 | 0 | 0 |

### maestroBodega (3 archivos, 114 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/maestroBodega/MaestroBodega.jsx` | 48 | 3 | 13 | 0 |
| `bodega/maestroBodega/ProductoDrawer.jsx` | 43 | 2 | 10 | 1 |
| `bodega/maestroBodega/KardexProducto.jsx` | 23 | 0 | 6 | 0 |

### cajasBodega (10 archivos, 104 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/cajasBodega/DetalleCaja.jsx` | 16 | 0 | 4 | 1 |
| `bodega/cajasBodega/FormCajaModal.jsx` | 16 | 0 | 3 | 0 |
| `bodega/cajasBodega/ReponerCajaModal.jsx` | 14 | 0 | 4 | 0 |
| `bodega/cajasBodega/CajasBodega.jsx` | 12 | 1 | 3 | 0 |
| `bodega/cajasBodega/InventarioCajaModal.jsx` | 11 | 0 | 4 | 0 |
| `bodega/cajasBodega/DetalleReposicion.jsx` | 8 | 0 | 5 | 0 |
| `bodega/cajasBodega/DuplicarCajaModal.jsx` | 8 | 0 | 0 | 0 |
| `bodega/cajasBodega/ResultadoInventario.jsx` | 8 | 0 | 2 | 0 |
| `bodega/cajasBodega/HistorialCaja.jsx` | 7 | 0 | 1 | 0 |
| `bodega/cajasBodega/comunes.jsx` | 4 | 0 | 1 | 0 |

### inventarioBodega (3 archivos, 76 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/inventarioBodega/InventarioBodega.jsx` | 38 | 1 | 0 | 0 |
| `bodega/inventarioBodega/ComparacionInventario.jsx` | 25 | 2 | 9 | 0 |
| `bodega/inventarioBodega/CierreInventarioModal.jsx` | 13 | 0 | 1 | 0 |

### consignacionesBodega (3 archivos, 65 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/consignacionesBodega/DetalleConsignacion.jsx` | 27 | 3 | 9 | 0 |
| `bodega/consignacionesBodega/ConsignacionesBodega.jsx` | 20 | 1 | 7 | 0 |
| `bodega/consignacionesBodega/FormConsignacionModal.jsx` | 18 | 0 | 4 | 0 |

### egresoBodega (1 archivos, 42 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/egresoBodega/EgresoBodega.jsx` | 42 | 4 | 8 | 0 |

### consumoBodega (1 archivos, 23 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/consumoBodega/ConsumoBodega.jsx` | 23 | 0 | 5 | 1 |

### centrosBodega (1 archivos, 20 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/centrosBodega/CentrosBodega.jsx` | 20 | 1 | 5 | 0 |

### catalogosBodega (1 archivos, 17 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/catalogosBodega/CatalogosBodega.jsx` | 17 | 1 | 0 | 0 |

### transitoBodega (1 archivos, 7 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `bodega/transitoBodega/TransitoBodega.jsx` | 7 | 0 | 0 | 0 |

## inventario

26 archivos, 556 clases.

### inventarioCajas (5 archivos, 110 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `inventarioCajas/components/ConteoCaja.jsx` | 36 | 0 | 0 | 0 |
| `inventario/inventarioCajas/InventarioPorCajas.jsx` | 28 | 0 | 0 | 0 |
| `inventarioCajas/components/FinalizarInventario.jsx` | 21 | 0 | 0 | 0 |
| `inventarioCajas/components/HistorialInventarios.jsx` | 13 | 0 | 0 | 0 |
| `inventarioCajas/components/ResumenComparacion.jsx` | 12 | 2 | 0 | 0 |

### escaneoInventario (5 archivos, 105 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `escaneoInventario/egreso/EgresoPorEscaneo.jsx` | 34 | 3 | 0 | 0 |
| `escaneoInventario/ingresoDocumento/IngresoPorDocumento.jsx` | 31 | 2 | 1 | 0 |
| `escaneoInventario/ingreso/IngresoDirecto.jsx` | 23 | 3 | 1 | 0 |
| `inventario/escaneoInventario/EscaneoInventario.jsx` | 13 | 1 | 0 | 0 |
| `escaneoInventario/components/SelectorCaja.jsx` | 4 | 1 | 0 | 0 |

### generalInventario (4 archivos, 98 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `inventario/generalInventario/GeneralInventarioDrawers.jsx` | 48 | 6 | 1 | 5 |
| `inventario/generalInventario/InventarioForm.jsx` | 25 | 2 | 0 | 0 |
| `inventario/generalInventario/InventarioTable.jsx` | 20 | 1 | 0 | 7 |
| `inventario/generalInventario/GeneralInventario.jsx` | 5 | 0 | 0 | 0 |

### transitoInventario (2 archivos, 63 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `inventario/transitoInventario/GestionTransitoModal.jsx` | 38 | 9 | 0 | 0 |
| `inventario/transitoInventario/TransitoInventario.jsx` | 25 | 2 | 0 | 0 |

### existenciasInventario (2 archivos, 54 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `inventario/existenciasInventario/ExistenciasInventario.jsx` | 34 | 4 | 5 | 0 |
| `inventario/existenciasInventario/DetalleLotesDrawer.jsx` | 20 | 1 | 2 | 0 |

### egresosInventario (1 archivos, 35 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `inventario/egresosInventario/EgresosInventario.jsx` | 35 | 2 | 0 | 0 |

### shared (3 archivos, 31 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `shared/ingreso/CabeceraIngreso.jsx` | 12 | 0 | 0 | 8 |
| `shared/escaneo/BuscadorProductoMaestro.jsx` | 11 | 0 | 0 | 0 |
| `shared/escaneo/CampoEscaneo.jsx` | 8 | 0 | 1 | 0 |

### unidadInventario (1 archivos, 27 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `inventario/unidadInventario/UnidadInventario.jsx` | 27 | 4 | 0 | 0 |

### historialInventario (1 archivos, 26 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `inventario/historialInventario/HistorialInventario.jsx` | 26 | 4 | 0 | 0 |

### ingresosInventario (2 archivos, 7 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `inventario/ingresosInventario/IngresosInventario.jsx` | 6 | 0 | 0 | 0 |
| `inventario/ingresosInventario/TablaItemsIngreso.jsx` | 1 | 0 | 0 | 0 |

## dashboard

1 archivos, 13 clases.

### generales (1 archivos, 13 clases)

| Archivo | Clases | <10 px | `font-num` | Cortes |
|---|---:|---:|---:|---:|
| `dashboard/generales/AvanceInventario.jsx` | 13 | 3 | 1 | 1 |
