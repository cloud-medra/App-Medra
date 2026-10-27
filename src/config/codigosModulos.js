// Códigos cortos de los módulos, al estilo de las transacciones de SAP
// (ej. LAB = Laboratorio). Es la ÚNICA definición: la usan el sidebar y la
// usarán los códigos de cada ítem y el buscador del sidebar.
//
// Reglas (las verifica codigosModulos.test.js):
//   - 3 letras mayúsculas, únicos y PERMANENTES: no se cambian ni se
//     reutilizan aunque el módulo se renombre o se elimine (los usuarios los
//     aprenden y se usarán en búsquedas y atajos). No son editables desde la app.
//   - La clave es la de la entrada del sidebar (clave interna del módulo en
//     modulesConfig.jsx o del grupo en gruposMenu.jsx), no su nombre visible.
//   - Todo módulo y grupo del menú debe tener el suyo; uno nuevo sin código
//     hace fallar el test.
//   - `dashboard` y `ajustes` (modo Ajustes Sistema, sin módulo propio) no
//     salen en la lista de módulos, pero tienen código para el buscador.

export const ENTRADA_AJUSTES = 'ajustes';

export const CODIGOS_MODULOS = Object.freeze({
  implantes: 'IMP',
  hemodinamia: 'HEM',
  consignacion: 'CON',
  documentos: 'DOC',
  laboratorio: 'LAB',
  vacunatorio: 'VAC',
  bodega: 'BOD',
  inventario: 'INV',
  maestros: 'MAE',
  finanzas: 'FIN',
  usuarios: 'USR',
  administracion: 'HER',
  dashboard: 'DSH',
  [ENTRADA_AJUSTES]: 'AJU',
});

// Código de una entrada del sidebar (módulo o grupo), o null si no tiene.
export const codigoEntrada = (entrada) => CODIGOS_MODULOS[entrada] ?? null;
