# Procedimiento para migrar una pantalla a los tokens de tipografía

Desde el 12-11-2026 toda la app usa Inter (definida solo en `--font-sans`), así que la fuente ya no se migra. Lo que se migra por módulo, solo cuando el usuario lo indica, son tamaños, grosores, interlineados y colores de texto. Tokens en `src/styles/tipografia.css`; fuente (Inter, subconjunto latin) en `src/styles/fuenteApp.css`. Pendientes y riesgos de espacio en [inventario-migracion-tipografia.md](inventario-migracion-tipografia.md).

## Antes de modificar

1. Listar los archivos a tocar, con los componentes hijos que se muestran dentro de la zona.
2. Por cada archivo, buscar quién más lo importa. Si es compartido con otros módulos y tiene tipografía propia, avisar qué otras pantallas cambiarían y **esperar confirmación**. Si no tiene tipografía propia, no se toca.
3. No migrar archivos fuera de circulación (por ejemplo, `AvanceInventario.jsx`, comentado en `ResumenGeneral.jsx`).

## Reglas (solo tipografía)

Se reemplazan tamaños, grosores, interlineados y colores de texto escritos a mano. No se cambian distribución, espaciados, íconos, colores de fondo ni comportamiento.

### Fuente

No se agrega ninguna clase de fuente: Inter llega a todo desde `--font-sans` (`tipografia.css`). `font-app` es solo un sinónimo que conservan las pantallas migradas antes del 12-11-2026; no hace falta ponerlo ni quitarlo. Si aparece una familia escrita a mano (`font-sans`, `font-mono`, `font-serif`, `fontFamily`), se quita; en códigos se deja `tabular-nums`.

### Tamaño y grosor

Cada clase trae tamaño, grosor e interlineado: no se le agrega `font-*` ni `leading-*`.

| Uso | Token | Tamaño / interlineado / grosor |
|---|---|---|
| Título de cada página | `text-titulo-pagina` | 18 / 26 / 700 |
| Títulos de tarjetas y secciones, también en desplegables | `text-titulo-seccion` | 14 / 20 / 600 |
| Nombres destacados, opciones de menú, saludo | `text-subtitulo` | 13 / 18 / 500 |
| Párrafos e ítems del sidebar | `text-normal` | 12 / 18 / 400 |
| Etiquetas de apoyo | `text-secundario` | 11 / 16 / 400 |
| Etiquetas cortas con énfasis, subtítulos dentro de una tarjeta | `text-etiqueta` | 11 / 16 / 600 |
| Todo lo que hoy mide menos de 10 px, y lo de 10 px | `text-pequeno` | 10 / 14 / 500 |
| Números en tablas y calendarios | `text-numero-tabla` | 11 / 16 / 500, tabular |
| Valores destacados de tarjetas de indicadores | `text-numero-indicador` | 13 / 18 / 700, tabular |

### Números y `font-num`

- `font-num` → `text-numero-tabla`. `font-num` ya solo aplica `tabular-nums` (no cambia la fuente), pero el token además fija tamaño y grosor.
- Si el texto mide menos de 10 px → `text-pequeno tabular-nums`, porque manda la regla de los 10 px.
- Los códigos que antes iban en `font-mono` ya están en `tabular-nums` (12-11-2026): se les agrega el token que corresponda.

### Énfasis sin grosor a mano

- Dentro de un párrafo: `<strong>`.
- Un estado (por ejemplo, notificación no leída): cambiar el token (`text-secundario` → `text-etiqueta`).
- Ítem activo o elemento actual: se distingue por fondo, barra y color; no lleva grosor propio.

### Color de texto

| Clase actual | Token |
|---|---|
| `gray-700/800`, `slate-800` (claro) con `gray-100/200` (oscuro) | `text-tinta-principal` |
| `gray-500`, `slate-500` con `gray-400` | `text-tinta-secundaria` |
| `gray-400`, `slate-400` con `gray-500` | `text-tinta-atenuada` |
| `gray-600`, `slate-600` con `gray-300` | `text-tinta-principal` en datos; `text-tinta-secundaria` en texto de apoyo |

- `hover:`, `disabled:hover:` y `placeholder:` usan el mismo token.
- **No se tocan:** colores con significado (`red`, `amber`, `emerald`), de marca (`#2383C2`, `sky`), blanco sobre fondo de color, ni los colores que ya define el dato (por ejemplo, notas con color propio).
- **Íconos:** su color queda igual, aunque sea gris. Incluye los botones de solo ícono.

### Títulos en tipo oración

- Los títulos de página y de tarjetas (`text-titulo-pagina`, `text-titulo-seccion`), también los de desplegables, van en tipo oración: solo la primera letra en mayúscula, además de nombres propios y siglas. Ejemplo: "Panel de control general", no "PANEL DE CONTROL GENERAL" ni "Panel de Control General".
- Se quita `uppercase` junto con su `tracking-*`, y se corrige el texto si venía con mayúscula en cada palabra.
- Si un test busca ese texto, se actualiza.

### Mayúsculas en etiquetas pequeñas

Una etiqueta pequeña (`text-pequeno`, `text-etiqueta`) que ya estaba en mayúsculas puede quedarse así, con su `uppercase` y su `tracking-*`, si se ve bien.

### Casos fuera de la escala

No se escriben a mano: se propone un token nuevo en `tipografia.css`, explicando por qué, y se agrega a la tabla de arriba.

## Espacio

- Inter es 5% a 9% más ancha que Segoe UI, y más en fechas y montos con números tabulares (ver el inventario).
- Si un **dato** de una tarjeta queda cortado con "…": quitar `truncate` para que pase a otra línea (`break-words`). En un monto, `[overflow-wrap:anywhere]`, que evita tanto el corte como el desborde.
- Un `truncate` que ya existía para nombres largos, con el nombre disponible en `title`, se puede mantener; informar los casos que empeoran.
- Al cambiar el interlineado, revisar placeholders de carga con alto fijo, para que no salten al cargar.

## Al terminar

1. Buscar restos en los archivos migrados; solo pueden quedar íconos:

   ```bash
   grep -nE "text-(xs|sm|base|lg|xl|[0-9]xl|\[[0-9.]+px\]|gray-[0-9]+|slate-[0-9]+)|font-(thin|light|normal|medium|semibold|bold|extrabold|black|num|mono|sans)|leading-" <archivos>
   ```

2. Build y tests de los archivos tocados, más sus padres. Si un test comprueba una clase, actualizarlo.
3. Comprobar en Edge lo que se pueda medir. La revisión visual la hace el usuario: claro y oscuro, ventana angosta y sidebar abierto y colapsado.
4. Commit y push; desplegar solo el hosting.
5. Marcar lo migrado en el inventario y actualizar su lista de riesgos.
6. Informar archivos cambiados, tokens nuevos y qué revisar en pantalla.
