import { normalizarClave } from '../../../../../functions/bodega/nucleo.mjs';

// Utilidades de pantalla sobre los catálogos de Bodega (en memoria).

export const formatoCantidad = (n) => (Number(n) || 0).toLocaleString('es-CL');

// { [id]: nombre } de categorías o unidades.
export const nombresPorId = (catalogos, tipo) => Object.fromEntries(
  catalogos.filter((c) => c.tipo === tipo).map((c) => [c.id, c.nombre])
);

// Opciones activas de un tipo (más la actual, aunque esté inactiva), por nombre.
export const opcionesCatalogo = (catalogos, tipo, actualId = null) => catalogos
  .filter((c) => c.tipo === tipo && (c.activo !== false || c.id === actualId))
  .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

// Búsqueda en el maestro clínico (maestros_codigos) por código, referencia,
// descriptor o empresa. Devuelve hasta `max` resultados.
export const buscarEnMaestroClinico = (codigos, texto, max = 20) => {
  const q = normalizarClave(texto);
  if (q.length < 2) return [];
  const palabras = q.split(' ');
  const resultados = [];
  for (const c of codigos) {
    const base = normalizarClave([c.codigo, c.referencia, c.descriptorAuto, c.descriptorEmpresa, c.empresa].filter(Boolean).join(' '));
    if (palabras.every((p) => base.includes(p))) resultados.push(c);
    if (resultados.length >= max) break;
  }
  return resultados;
};

export const descriptorMaestroClinico = (c) => c?.descriptorAuto || c?.descriptorEmpresa || c?.tipo || c?.referencia || '';
