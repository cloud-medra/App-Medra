// Roles destinatarios y estilo de las notas del panel (administracion_notas).
// Lo usan Notas Admin (formulario y listado) y el Dashboard (NuevoModuloCard).
//
// Visibilidad: cada nota guarda `rolesVisibles`, nunca vacío: uno o más de
// ROLES_NOTA, o solo ['dev'] (nota privada de desarrolladores; mismo valor
// que usuarios.rol). El Desarrollador ve todas igual, por eso 'dev' no se
// combina con los demás. El filtro lo imponen las reglas de Firestore; la
// consulta del cliente (consultaNotas) pide solo lo que las reglas dejan leer.
//
// Estilo: `estilo: { fondo, texto, negrita }` (colores '#rrggbb' o null).
// Sin estilo (o con colores null) se usa el aspecto de siempre (clases Tailwind,
// con modo oscuro).
import { where } from 'firebase/firestore';

export const ROLES_NOTA = Object.freeze([
  { value: 'admin', label: 'Administrador' },
  { value: 'operador', label: 'Operador' },
  { value: 'encargado', label: 'Encargado Centro' },
]);
export const VALORES_ROLES_NOTA = ROLES_NOTA.map((r) => r.value);
export const ROL_DEV = 'dev';
export const SOLO_DEV = Object.freeze([ROL_DEV]);
export const labelRolNota = (rol) => (rol === ROL_DEV ? 'Desarrollador' : ROLES_NOTA.find((r) => r.value === rol)?.label || rol);

// Mismo valor por defecto que las reglas (getUsuario().get('rol', 'operador')).
const rolDe = (userData) => userData?.rol || 'operador';
export const veTodasLasNotas = (userData) => rolDe(userData) === 'dev';

// Consulta de notas para el catalogosStore: el Desarrollador lee la colección
// entera; el resto, solo las dirigidas a su rol.
export const consultaNotas = (userData) => (veTodasLasNotas(userData)
  ? { clave: 'todas', restricciones: [] }
  : { clave: `rol:${rolDe(userData)}`, restricciones: [where('rolesVisibles', 'array-contains', rolDe(userData))] });

// Destinatarios de una nota, en orden fijo: ['dev'] si es solo para
// desarrolladores; 'dev' junto con otros roles se ignora (no cambia nada).
// Notas sin el campo o con la lista vacía (antes de la migración) = todos.
export const rolesDeNota = (nota) => {
  const lista = Array.isArray(nota?.rolesVisibles) ? nota.rolesVisibles : [];
  if (lista.length === 0) return VALORES_ROLES_NOTA;
  const roles = VALORES_ROLES_NOTA.filter((r) => lista.includes(r));
  return roles.length ? roles : (lista.includes(ROL_DEV) ? SOLO_DEV : VALORES_ROLES_NOTA);
};
export const esSoloDev = (roles) => roles.length === 1 && roles[0] === ROL_DEV;

// ---------- Estilo ----------

export const PALETA_FONDO = Object.freeze([
  '#FFFFFF', '#F3F4F6', '#FEF3C7', '#FDE68A', '#DCFCE7', '#DBEAFE',
  '#E0E7FF', '#FCE7F3', '#FEE2E2', '#1F2937', '#1E3A8A', '#B91C1C',
]);
export const PALETA_TEXTO = Object.freeze([
  '#111827', '#374151', '#FFFFFF', '#1D4ED8', '#047857', '#B45309', '#B91C1C', '#6D28D9',
]);

const HEX = /^#[0-9a-f]{6}$/i;
export const esColor = (v) => typeof v === 'string' && HEX.test(v);

export const normalizarEstilo = (estilo) => ({
  fondo: esColor(estilo?.fondo) ? estilo.fondo.toUpperCase() : null,
  texto: esColor(estilo?.texto) ? estilo.texto.toUpperCase() : null,
  negrita: estilo?.negrita === true,
});

// Luminancia relativa y contraste WCAG 2.x.
const luminancia = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const contraste = (a, b) => {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
// 4.5:1 = AA para texto normal (las notas usan texto chico).
export const CONTRASTE_MINIMO = 4.5;

// bg-gray-50 de Tailwind, el fondo de la nota en modo claro.
const FONDO_POR_DEFECTO = '#F9FAFB';

// Con fondo propio y sin color de texto, el texto por defecto (gris claro en
// modo oscuro) podría no leerse: se elige negro o blanco según el fondo.
const textoAutomatico = (fondo) => (contraste(fondo, '#111827') >= contraste(fondo, '#FFFFFF') ? '#111827' : '#FFFFFF');

/**
 * Estilos a aplicar a una nota. `contenedor` y `texto` son objetos `style`
 * (vacíos si la nota no tiene estilo: se quedan las clases de siempre);
 * `personalizado` indica si hay que dejar de lado las clases de color.
 */
export const estiloVisualNota = (nota) => {
  const { fondo: elegido, texto, negrita } = normalizarEstilo(nota?.estilo);
  // Solo color de texto: se fija el fondo claro de siempre, para que en modo
  // oscuro no quede ese texto sobre gris oscuro.
  const fondo = elegido || (texto ? FONDO_POR_DEFECTO : null);
  const colorTexto = texto || (fondo ? textoAutomatico(fondo) : null);
  return {
    fondoPropio: Boolean(fondo),
    textoPropio: Boolean(colorTexto),
    negrita,
    contenedor: fondo ? { backgroundColor: fondo, borderColor: elegido || undefined } : {},
    texto: { ...(colorTexto ? { color: colorTexto } : {}), ...(negrita ? { fontWeight: 700 } : {}) },
  };
};

// Contraste efectivo de un estilo (null si se usa el aspecto por defecto).
export const contrasteEstilo = (estilo) => {
  const { fondo, texto } = normalizarEstilo(estilo);
  if (!fondo && !texto) return null;
  const f = fondo || FONDO_POR_DEFECTO;
  const t = texto || textoAutomatico(f);
  return contraste(f, t);
};
