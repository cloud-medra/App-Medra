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
| **Bodega** | `bodega/` (38 archivos). Incluye compartidos que se ven también en Armado de Kits, Códigos de barra, Fibras (`TablaBodega`) e Inventario → Tránsito (`GestionTransitoModal`). Alertas numéricas: `text-numero-tabla` pasa a `text-etiqueta tabular-nums` | 12-11-2026 |
| **Maestros** | `maestros/` (34 archivos, además de Códigos de barra ya migrado). Incluye `codigosMaestrosV2/ui/TablaCodigos` y `PanelLateral`, que se ven también en Soporte, Estadísticas y Solicitudes de modificaciones. Títulos que estaban escritos en mayúsculas pasaron a tipo oración | 12-11-2026 |
| **Herramientas** | `administracion/` (46 archivos, además de Historial de imputaciones ya migrado). Valores de tarjetas de indicadores (Estadísticas, Resumen del período, Totales de Finanzas, ficha de usuario) con `text-numero-indicador` | 12-11-2026 |
| **Gestiones** | `gestiones/` (Laboratorio y Vacunatorio: procesos, registros, importaciones y visualizador, más `shared/`). Títulos escritos en mayúsculas pasaron a tipo oración | 12-11-2026 |
| **Operaciones** | `operaciones/` (Implantes, Hemodinamia, Consignación, Documentos y `shared/`). Las pantallas de detalle se ven también desde Cargas consolidadas. Tamaños responsivos con prefijo `md:` (`text-subtitulo md:text-pequeno`). `tituloGestion` y `tituloResumen` de `modulosGestion.js` en tipo oración | 12-11-2026 |

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
