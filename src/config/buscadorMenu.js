// Buscador del sidebar (estilo transacciones de SAP): busca módulos e ítems
// por nombre o por código (config/codigosModulos.js).
//
// SEGURIDAD: el índice se arma SOLO con lo que el sidebar le muestra al
// usuario (entradasDelSidebar / itemsDelSidebar de config/menuSidebar.js,
// que ya filtran permisos y módulos activos, y los ítems de Ajustes que ve).
// Lo que no está en su menú no está en el índice, así que no aparece ni
// escribiendo su código exacto.
import { codigoEntrada, codigoItem, ENTRADA_AJUSTES } from './codigosModulos';

export const ENTRADA_INICIO = 'dashboard';

// Sin mayúsculas ni tildes, espacios simples.
export const normalizarBusqueda = (texto) => String(texto ?? '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/\s+/g, ' ')
  .trim();

// Resultado: { id, tipo: 'modulo' | 'item', entrada, ruta?, codigo, nombre,
// modulo (nombre del módulo, en ítems) }.
// `entradas`: entradas del sidebar del usuario; `itemsDe(entrada)`: sus
// ítems visibles; `etiquetaDe(entrada)`: nombre visible; `ajustes`: ítems de
// Ajustes Sistema que ve (null = sin Ajustes).
export const indiceMenu = ({ entradas = [], itemsDe, etiquetaDe, ajustes = null, nombreAjustes = 'Ajustes Sistema', nombreInicio = 'Dashboard' }) => {
  const indice = [{ id: ENTRADA_INICIO, tipo: 'modulo', entrada: ENTRADA_INICIO, codigo: codigoEntrada(ENTRADA_INICIO), nombre: nombreInicio, modulo: null }];
  const agregarEntrada = (entrada, nombre, items) => {
    indice.push({ id: `m:${entrada}`, tipo: 'modulo', entrada, codigo: codigoEntrada(entrada), nombre, modulo: null });
    items.forEach((s) => indice.push({
      id: `i:${s.path}`, tipo: 'item', entrada, ruta: s.path, codigo: codigoItem(s.path), nombre: s.label, modulo: nombre,
    }));
  };
  entradas.forEach((e) => agregarEntrada(e, etiquetaDe(e), itemsDe(e)));
  if (ajustes) agregarEntrada(ENTRADA_AJUSTES, nombreAjustes, ajustes);
  return indice;
};

// Prioridad de un resultado para la búsqueda (menor = antes; null = no
// coincide): código exacto, código que empieza igual, nombre que empieza
// igual, nombre que contiene, código que contiene.
const prioridad = (r, q, qCodigo) => {
  const codigo = r.codigo || '';
  const nombre = normalizarBusqueda(r.nombre);
  if (qCodigo && codigo === qCodigo) return 0;
  if (qCodigo && codigo.startsWith(qCodigo)) return 1;
  if (nombre.startsWith(q)) return 2;
  if (nombre.includes(q)) return 3;
  if (qCodigo && codigo.includes(qCodigo)) return 4;
  return null;
};

// Resultados de `texto` en el índice. Un código de módulo exacto (ej. LAB)
// devuelve el módulo y todos sus ítems visibles; un código de ítem exacto
// queda primero (Enter lo abre).
export const buscarEnMenu = (indice, texto, limite = 50) => {
  const q = normalizarBusqueda(texto);
  if (!q) return [];
  const qCodigo = q.replace(/\s/g, '').toUpperCase();
  const modulo = indice.find((r) => r.tipo === 'modulo' && r.codigo === qCodigo);
  if (modulo) return [modulo, ...indice.filter((r) => r.tipo === 'item' && r.entrada === modulo.entrada)].slice(0, limite);
  return indice
    .map((r, i) => ({ r, i, p: prioridad(r, q, qCodigo) }))
    .filter((x) => x.p !== null)
    .sort((a, b) => a.p - b.p || (a.r.tipo === b.r.tipo ? 0 : a.r.tipo === 'modulo' ? -1 : 1) || a.i - b.i)
    .slice(0, limite)
    .map((x) => x.r);
};
