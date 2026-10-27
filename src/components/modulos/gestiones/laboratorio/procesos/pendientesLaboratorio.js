// Contadores del menú de Laboratorio: cuántos documentos esperan en cada
// fase de Control Procesos. Los estados de cada fase son los mismos con los
// que su pantalla arma la tabla (las pantallas importan estas listas), así el
// número del menú coincide con las filas que se ven al abrirla, sumando
// todos los años (cada pantalla muestra un año a la vez).
//
// Diferencias con la pantalla, revisadas en producción (sin casos hoy):
//   - Ingreso de Folios trata un documento SIN `estado` como "Iniciar
//     Ingreso"; un conteo no puede buscar un campo ausente, así que cuenta
//     "Iniciar Ingreso" y '' (la importación siempre escribe el estado).
//   - Solicitud Diferencias también muestra `tieneDiferencias === true`,
//     campo que ningún código escribe: el contador lo omite.

// Aquí y no en ArchivosControlLaboratorio.jsx: las pantallas de las fases
// importan este archivo y ese importa las pantallas (import circular).
export const RUTA_CONTROL_LABORATORIO = '/laboratorio/archivosControlLaboratorio';
export const COL_DOCUMENTOS_LABORATORIO = 'laboratorio_documentos';

export const ESTADOS_INICIAR_INGRESO = ['Iniciar Ingreso', ''];
export const ESTADOS_VINCULACION_CODIGOS = ['Proceso Iniciado', 'Falta Vinculación', 'Diferencia Precios'];
export const ESTADOS_VINCULACION_ORDENES = ['Procesar OC', 'Solicitud Enviada'];
export const ESTADOS_SOLICITUD_DIFERENCIAS = [
  'Diferencia Reportada',
  'DiferenciasReportadas',
  'Aceptado con Diferencias',
  'Vinculación Parcial',
  'Vinculacion Parcial',
];
export const ESTADOS_DOCUMENTOS_LISTOS = ['Listo para Ingreso', 'Listos para Ingreso', 'Listo Para Ingreso'];

// { ruta del ítem: estados que cuenta }. Máximo 30 estados por consulta `in`.
export const PENDIENTES_LABORATORIO = Object.freeze({
  [`${RUTA_CONTROL_LABORATORIO}/iniciarProcesos`]: ESTADOS_INICIAR_INGRESO,
  [`${RUTA_CONTROL_LABORATORIO}/vinculacionCodigos`]: ESTADOS_VINCULACION_CODIGOS,
  [`${RUTA_CONTROL_LABORATORIO}/vinculacionOrdenes`]: ESTADOS_VINCULACION_ORDENES,
  [`${RUTA_CONTROL_LABORATORIO}/solicitudDiferencias`]: ESTADOS_SOLICITUD_DIFERENCIAS,
  [`${RUTA_CONTROL_LABORATORIO}/documentosListos`]: ESTADOS_DOCUMENTOS_LISTOS,
});

// De las rutas que el usuario ve en el menú (ya filtradas por permisos y
// módulos activos), las que llevan contador, sin repetir y en orden estable.
export const rutasConContador = (rutasVisibles = []) => (
  Object.keys(PENDIENTES_LABORATORIO).filter((ruta) => rutasVisibles.includes(ruta))
);

// Rango de documentId para el collectionGroup('documentos'): solo los de
// laboratorio_documentos/{anio}/meses/{mes}/documentos (el grupo lo
// comparten otras colecciones). Mismo formato que rangoGestiones.
export const RANGO_DOCUMENTOS_LABORATORIO = Object.freeze({
  min: `${COL_DOCUMENTOS_LABORATORIO}/0000`,
  max: `${COL_DOCUMENTOS_LABORATORIO}/9999`,
});
