// Versión visible de la app (pie del sidebar, ventana "Novedades" y contexto
// técnico de los tickets de soporte).
//
// Cada deploy de hosting agrega una entrada AL INICIO de HISTORIAL_VERSIONES,
// subiendo en 1 el último número (1.0.1 → 1.0.2) y anotando en `cambios` lo
// que verá el usuario, en lenguaje simple. VERSION_APP sale de la primera
// entrada: no se escribe a mano en otro lado. versionApp.test.js exige el
// formato y que cada versión sea la anterior + 1.
//   { version: 'X.Y.Z', fecha: 'AAAA-MM-DD', cambios: ['…'] }

export const HISTORIAL_VERSIONES = [
  {
    version: '1.0.1',
    fecha: '2026-11-26',
    cambios: [
      'Laboratorio → Documentos listos: al finalizar el acta, el documento deja de aparecer en la tabla.',
      'Número de versión en el menú lateral, con un ícono de información que muestra los cambios de la última versión.',
    ],
  },
  {
    version: '1.0.0',
    fecha: '2026-06-01',
    cambios: ['Versión inicial.'],
  },
];

export const VERSION_APP = HISTORIAL_VERSIONES[0].version;
export const ULTIMA_VERSION = HISTORIAL_VERSIONES[0];
