// Lógica pura del panel de edición de Códigos (vista nueva): modos del panel,
// valores del formulario, validación y cálculo de los campos que cambiaron.
// No toca Firestore (ver accionesCodigos.js).

export const COL_CODIGOS = 'maestros_codigos';

export const TIPOS_CODIGO = ['COTIZACION', 'CONSIGNACION'];
export const SEGMENTOS_CODIGO = ['IMPLANTES', 'CONSIGNACION', 'HEMODINAMIA'];
export const ESTADOS_CODIGO = ['ACTIVO', 'INACTIVO'];

// Campos que se guardan en el documento (el "motivo" de Vista General solo
// va al log, nunca al documento).
export const CAMPOS_REGISTRO = [
  'codigo', 'referencia', 'descriptorEmpresa', 'empresa', 'tipo', 'segmento',
  'clase', 'descriptorAuto', 'precioNeto', 'cx', 'estado', 'observacion'
];

// Qué muestra y exige cada modo del panel. `campos` son los editables;
// `descriptorAutomatico` arma Desc. Auto con Referencia + Desc. Empresa
// (como el formulario de Sin Código / Pendientes).
export const MODOS_PANEL = {
  nuevoPendiente: {
    titulo: 'Nuevo registro sin código',
    crear: true,
    campos: ['referencia', 'descriptorEmpresa', 'empresa', 'tipo', 'segmento', 'clase', 'precioNeto', 'cx', 'observacion'],
    requeridos: ['referencia', 'empresa'],
    descriptorAutomatico: true,
    textoGuardar: 'Registrar'
  },
  asignarCodigo: {
    titulo: 'Asignar código definitivo',
    campos: ['codigo', 'referencia', 'descriptorEmpresa', 'empresa', 'tipo', 'segmento', 'clase', 'descriptorAuto', 'precioNeto', 'cx', 'observacion'],
    requeridos: ['codigo', 'referencia', 'empresa'],
    textoGuardar: 'Asignar código'
  },
  nuevoConCodigo: {
    titulo: 'Nuevo registro con código',
    crear: true,
    campos: ['codigo', 'referencia', 'descriptorEmpresa', 'empresa', 'tipo', 'segmento', 'clase', 'descriptorAuto', 'precioNeto', 'cx', 'observacion'],
    requeridos: ['codigo', 'referencia', 'empresa'],
    textoGuardar: 'Registrar'
  },
  editarConCodigo: {
    titulo: 'Editar registro',
    campos: ['codigo', 'referencia', 'descriptorEmpresa', 'empresa', 'tipo', 'segmento', 'clase', 'descriptorAuto', 'precioNeto', 'cx', 'observacion'],
    requeridos: ['codigo', 'referencia', 'empresa'],
    textoGuardar: 'Guardar'
  },
  modificarRegistro: {
    titulo: 'Modificar registro y precio',
    campos: ['codigo', 'referencia', 'descriptorEmpresa', 'empresa', 'tipo', 'segmento', 'clase', 'descriptorAuto', 'precioNeto', 'cx', 'estado', 'observacion'],
    requeridos: ['referencia', 'empresa', 'precioNeto'],
    conMotivo: true,
    textoGuardar: 'Guardar'
  }
};

export const formatearMiles = (valor) => {
  if (valor === null || valor === undefined || valor === '') return '';
  const num = valor.toString().replace(/\D/g, '');
  if (num === '') return '';
  return new Intl.NumberFormat('es-ES').format(num);
};

export const formatearPrecio = (valor) => `$${new Intl.NumberFormat('es-ES').format(Number(valor) || 0)}`;

export const precioANumero = (texto) => Number(String(texto ?? '').replace(/\D/g, '')) || 0;

export const formatearFecha = (fecha) => {
  if (!fecha) return '—';
  const date = fecha.toDate ? fecha.toDate() : new Date(fecha);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export const descriptorAutoDe = (referencia, descriptorEmpresa) =>
  [referencia, descriptorEmpresa].filter(Boolean).join(' ').toUpperCase();

export const tieneCodigo = (item) => Boolean(item?.codigo && String(item.codigo).trim() !== '');

// Valores iniciales del formulario (todo texto; el precio con separador de miles).
export const formDesdeRegistro = (item) => ({
  codigo: item?.codigo || '',
  referencia: item?.referencia || '',
  descriptorEmpresa: item?.descriptorEmpresa || '',
  empresa: item?.empresa || '',
  tipo: item?.tipo || '',
  segmento: item?.segmento || '',
  clase: item?.clase || '',
  descriptorAuto: item?.descriptorAuto || '',
  precioNeto: item?.precioNeto ? formatearMiles(item.precioNeto) : '',
  cx: item?.cx || '',
  estado: item?.estado || 'ACTIVO',
  observacion: item?.observacion || '',
  motivo: ''
});

const normalizarCampo = (campo, valor) =>
  campo === 'precioNeto' ? precioANumero(valor) : String(valor ?? '').trim().toUpperCase();

const valorGuardado = (campo, registro) => {
  if (campo === 'precioNeto') return Number(registro?.precioNeto) || 0;
  if (campo === 'estado') return registro?.estado || 'ACTIVO';
  return registro?.[campo] ?? '';
};

// Campos del documento que el usuario cambió, ya normalizados para guardar.
// Solo se miran los campos que el usuario tocó (distintos del valor inicial
// del formulario), así un valor guardado en minúsculas que nadie editó no
// se reescribe en mayúsculas.
export const camposModificados = (inicial, actual, registro) => {
  const cambios = {};
  CAMPOS_REGISTRO.forEach((campo) => {
    if (actual[campo] === inicial[campo]) return;
    const nuevo = normalizarCampo(campo, actual[campo]);
    const anterior = valorGuardado(campo, registro);
    const distinto = campo === 'precioNeto' ? nuevo !== anterior : String(nuevo) !== String(anterior);
    if (distinto) cambios[campo] = nuevo;
  });
  return cambios;
};

// Valores completos (normalizados) para crear un documento nuevo.
export const valoresParaCrear = (form, modo) => {
  const config = MODOS_PANEL[modo];
  const valores = {};
  CAMPOS_REGISTRO.forEach((campo) => {
    if (campo === 'estado') return;
    if (campo === 'codigo' && !config.campos.includes('codigo')) return;
    valores[campo] = normalizarCampo(campo, form[campo]);
  });
  if (config.descriptorAutomatico) valores.descriptorAuto = descriptorAutoDe(valores.referencia, valores.descriptorEmpresa);
  return valores;
};

// Errores por campo ({ campo: mensaje }). `registros` (ya cargados) permite
// avisar de un código repetido sin leer Firestore.
export const validarFormulario = (form, modo) => {
  const errores = {};
  MODOS_PANEL[modo].requeridos.forEach((campo) => {
    const vacio = campo === 'precioNeto' ? String(form.precioNeto ?? '').replace(/\D/g, '') === '' : !String(form[campo] ?? '').trim();
    if (vacio) errores[campo] = 'Campo obligatorio';
  });
  if (form.codigo && /\s/.test(form.codigo.trim())) errores.codigo = 'El código no puede tener espacios';
  return errores;
};

export const avisosFormulario = (form, registro, registros = []) => {
  const avisos = {};
  const codigo = String(form.codigo || '').trim().toUpperCase();
  if (codigo) {
    const otro = registros.find((r) => r.id !== registro?.id && String(r.codigo || '').trim().toUpperCase() === codigo);
    if (otro) avisos.codigo = `Ya lo usa otro registro (Ref. ${otro.referencia || 'sin referencia'})`;
  }
  return avisos;
};
