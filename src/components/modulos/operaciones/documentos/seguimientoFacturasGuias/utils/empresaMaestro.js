// Busca en Maestros → Empresas la empresa de un `proveedor` de
// documentos_sistema. Las filas importadas solo traen el nombre (ni RUT ni
// id de empresa), así que se cruza por nombre en dos pasos:
//   1. Nombre normalizado (sin mayúsculas ni tildes) idéntico.
//   2. Si no hay, una clave más flexible: además sin puntuación, espacios
//      repetidos ni sufijo societario (S.A., SpA, Ltda., Limitada, E.I.R.L.).
//      Solo vale si da UNA empresa: "Comercial X SpA" y "Comercial X Ltda"
//      pueden ser empresas distintas, y ante la duda no se muestra ninguna.
import { normalizarTexto } from '../../../../../../utils/normalizarTexto';

// Sufijos como secuencias de palabras ya sin puntos: "S.A." queda "sa" y
// "S. A." queda "s a".
const SUFIJOS = [['sa'], ['s', 'a'], ['spa'], ['ltda'], ['limitada'], ['eirl'], ['e', 'i', 'r', 'l']];

export const claveFlexibleEmpresa = (nombre) => {
  const palabras = normalizarTexto(nombre)
    .replace(/\./g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
  // Se quita un solo sufijo final, y nunca si es todo el nombre.
  const sufijo = SUFIJOS.find((s) => palabras.length > s.length && s.every((p, i) => palabras[palabras.length - s.length + i] === p));
  return (sufijo ? palabras.slice(0, -sufijo.length) : palabras).join(' ');
};

// Devuelve la empresa del maestro, o null si no hay coincidencia (o si el
// paso flexible da más de una).
export const buscarEmpresaMaestro = (nombre, empresas = []) => {
  const exacto = normalizarTexto(nombre);
  if (!exacto) return null;
  const directa = empresas.find((e) => normalizarTexto(e.nombre) === exacto);
  if (directa) return directa;

  const clave = claveFlexibleEmpresa(nombre);
  if (!clave) return null;
  const candidatas = empresas.filter((e) => claveFlexibleEmpresa(e.nombre) === clave);
  return candidatas.length === 1 ? candidatas[0] : null;
};
