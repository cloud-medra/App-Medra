// Cálculos de presentación de "Historial de uso" (sin lecturas ni escrituras).

// Más filas que esto se esconden tras "Ver todos (N)".
export const FILAS_VISIBLES = 10;
// Más caracteres que esto se recortan con "Ver más".
export const MAX_CARACTERES_DESCRIPCION = 120;

// La fecha viene como 'AAAA-MM-DD' (la de la gestión, sin hora): se convierte sin
// pasar por Date para que la zona horaria no la corra un día.
export const fechaCorta = (fecha) => (fecha ? fecha.split('-').reverse().join('-') : '—');

// Indicadores del resumen. El total son las gestiones distintas de todo el
// documento: sumar los usos de cada lista contaría dos veces una misma gestión
// (aparece en el médico y en la descripción).
export const indicadoresUso = (uso) => {
  const gestiones = new Map();
  [uso?.medicos, uso?.descripciones].forEach((seccion) => {
    Object.values(seccion || {}).forEach((entrada) => {
      Object.entries(entrada.gestiones || {}).forEach(([id, fecha]) => gestiones.set(id, fecha));
    });
  });
  return {
    totalUsos: gestiones.size,
    medicos: Object.keys(uso?.medicos || {}).length,
    descripciones: Object.keys(uso?.descripciones || {}).length,
    ultimoUso: [...gestiones.values()].reduce((max, f) => (f > max ? f : max), ''),
  };
};
