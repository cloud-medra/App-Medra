// Quita los comentarios de un módulo VBA (decisión del 24-11-2026: el
// libro no lleva comentarios en sus macros; el código comentado queda solo
// en el repo, en ModContingencia.bas).
//
// Un comentario empieza con ' fuera de un texto entre comillas ("" dentro
// de un texto es una comilla escapada) o con Rem al inicio de la sentencia.
// Las líneas que quedan vacías por ser solo comentario se quitan, y las
// líneas en blanco seguidas se reducen a una. Las líneas "Attribute …" y el
// código no cambian.
const finDeCodigo = (linea) => {
  let enTexto = false;
  for (let i = 0; i < linea.length; i += 1) {
    const ch = linea[i];
    if (ch === '"') enTexto = !enTexto;
    else if (ch === "'" && !enTexto) return i;
  }
  return linea.length;
};

export const quitarComentariosVba = (codigo) => {
  const salto = codigo.includes('\r\n') ? '\r\n' : '\n';
  const salida = [];
  for (const linea of codigo.split(/\r?\n/)) {
    if (/^\s*Rem(\s|$)/i.test(linea)) continue;
    const sinComentario = linea.slice(0, finDeCodigo(linea)).replace(/\s+$/, '');
    const eraComentario = sinComentario.trim() === '' && linea.trim() !== '';
    if (eraComentario) continue;
    if (sinComentario === '' && salida[salida.length - 1] === '') continue;
    salida.push(sinComentario);
  }
  while (salida.length && salida[salida.length - 1] === '') salida.pop();
  return salida.join(salto) + salto;
};
