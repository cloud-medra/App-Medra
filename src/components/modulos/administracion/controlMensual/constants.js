export const COLECCIONES = {
  CIERRES: 'cierres_periodos',
  IMPUTACIONES: 'imputaciones_periodos',
  CONFIGURACION: 'configuracion_periodos'
};

export const MODULOS = [
  { id: 'laboratorio', nombre: 'Laboratorio' },
  { id: 'implantes', nombre: 'Implantes' },
  { id: 'consignacion', nombre: 'Consignación' },
  { id: 'vacunatorio', nombre: 'Vacunatorio' },
  { id: 'hemodinamia', nombre: 'Hemodinamia' },
  // Bodega no imputa: su "monto" es el saldo valorizado de la bodega
  // (bodega_periodos y bodegaPeriodoStore.js).
  { id: 'bodega', nombre: 'Bodega' },
];
export const MODULO_BODEGA = 'bodega';

// Agrupación del consolidado según el origen de los datos:
// Consumos = módulos alimentados por cargas manuales.
// Facturación = módulos alimentados por ingreso de factura electrónica.
// Inventario = Bodega (saldo valorizado, no se suma a los montos imputados).
// El orden del arreglo es el orden en pantalla (Control Mensual y Período
// Actual): Consumos primero.
export const GRUPOS = [
  { id: 'consumos', nombre: 'Consumos', moduloIds: ['implantes', 'consignacion', 'hemodinamia'] },
  { id: 'facturacion', nombre: 'Facturación', moduloIds: ['laboratorio', 'vacunatorio'] },
  { id: 'inventario', nombre: 'Inventario', moduloIds: ['bodega'] },
];
// Grupos de montos imputados (Período Actual los suma y compara con el mes anterior).
export const GRUPOS_IMPUTACION = GRUPOS.filter((g) => g.id !== 'inventario');

export const MESES = [
  { id: 'enero', nombre: 'Enero', num: 1 },
  { id: 'febrero', nombre: 'Febrero', num: 2 },
  { id: 'marzo', nombre: 'Marzo', num: 3 },
  { id: 'abril', nombre: 'Abril', num: 4 },
  { id: 'mayo', nombre: 'Mayo', num: 5 },
  { id: 'junio', nombre: 'Junio', num: 6 },
  { id: 'julio', nombre: 'Julio', num: 7 },
  { id: 'agosto', nombre: 'Agosto', num: 8 },
  { id: 'septiembre', nombre: 'Septiembre', num: 9 },
  { id: 'octubre', nombre: 'Octubre', num: 10 },
  { id: 'noviembre', nombre: 'Noviembre', num: 11 },
  { id: 'diciembre', nombre: 'Diciembre', num: 12 }
];
// Etiqueta visible de un mes en selectores: "Enero (01)". Solo para mostrar;
// lo que se guarda sigue siendo `mes.id`.
export const etiquetaMes = (mes) => `${mes.nombre} (${String(mes.num).padStart(2, '0')})`;
