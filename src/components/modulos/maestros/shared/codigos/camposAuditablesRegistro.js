// Lista única de campos auditables del registro de Código Maestro. La usan
// accionesCodigos.js (para construir el diff "Anterior/Nuevo" que se guarda en
// el log de una modificación) y PanelHistorial.jsx (para las etiquetas al
// mostrarlo).
//
// "observacion" queda afuera a propósito: el "motivo del cambio" de una
// modificación se loguea aparte como nota libre
// (`detalles.observacionModificacion`).
export const CAMPOS_AUDITABLES_REGISTRO = [
  { key: 'codigo', label: 'Código' },
  { key: 'referencia', label: 'Referencia' },
  { key: 'descriptorEmpresa', label: 'Descriptor Maestro (Empresa)' },
  { key: 'empresa', label: 'Empresa' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'segmento', label: 'Segmento' },
  { key: 'clase', label: 'Clase' },
  { key: 'descriptorAuto', label: 'Descriptor Maestro' },
  { key: 'cx', label: 'CX' },
  { key: 'precioNeto', label: 'Precio Neto', tipoValor: 'moneda' },
  { key: 'estado', label: 'Estado', tipoValor: 'estado' }
];

const normalizarValor = (valor, tipoValor) => {
  if (tipoValor === 'moneda') return Number(valor || 0);
  if (tipoValor === 'estado') return valor || 'ACTIVO';
  return valor ?? '';
};

// Compara registroAnterior vs registroNuevo campo por campo y devuelve un
// objeto con `{campoAnterior, campoNuevo}` solo para los campos que
// realmente cambiaron (mismo estilo que ya usaba precioNetoAnterior /
// precioNetoNuevo, generalizado a todos los campos auditables).
export const construirCambiosRegistro = (registroAnterior, registroNuevo) => {
  const cambios = {};

  CAMPOS_AUDITABLES_REGISTRO.forEach(({ key, tipoValor }) => {
    const valorAnterior = normalizarValor(registroAnterior?.[key], tipoValor);
    const valorNuevo = normalizarValor(registroNuevo?.[key], tipoValor);
    const huboCambio = tipoValor === 'moneda'
      ? valorAnterior !== valorNuevo
      : String(valorAnterior) !== String(valorNuevo);

    if (huboCambio) {
      cambios[`${key}Anterior`] = valorAnterior;
      cambios[`${key}Nuevo`] = valorNuevo;
    }
  });

  return cambios;
};
