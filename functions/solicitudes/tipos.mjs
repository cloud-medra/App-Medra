// Solicitudes de cambio de datos del propio usuario (Ajustes → Datos), que
// aprueba o rechaza su administrador desde Administración → Alertas.
//
// Cada solicitud es genérica: { tipo, valorActual, valorSolicitado, motivo }.
// Para sumar un tipo nuevo basta con agregarlo a TIPOS_SOLICITUD (cómo se
// normaliza y valida el valor) y a APLICAR en functions/solicitudes/servicio.js
// (qué hace al aprobarse). Lo usan las Cloud Functions y la pantalla (mismas
// validaciones). Sin dependencias salvo el formato del nombre de usuario.

import { errorNombreUsuario } from '../usuarios/nombreUsuario.mjs';

export const MAX_NOMBRE_COMPLETO = 120;
export const MAX_MOTIVO = 500;
const PATRON_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const TIPOS_SOLICITUD = Object.freeze({
  nombreUsuario: {
    etiqueta: 'Nombre de usuario',
    normalizar: (v) => String(v ?? '').trim(),
    validar: (v) => errorNombreUsuario(v),
  },
  nombreCompleto: {
    etiqueta: 'Nombre completo',
    normalizar: (v) => String(v ?? '').trim().replace(/\s+/g, ' '),
    validar: (v) => {
      if (!v) return 'El nombre completo es obligatorio.';
      if (v.length > MAX_NOMBRE_COMPLETO) return `El nombre completo no puede superar ${MAX_NOMBRE_COMPLETO} caracteres.`;
      return null;
    },
  },
  // Al aprobarse no cambia de inmediato: el usuario confirma desde la nueva
  // dirección (verifyBeforeUpdateEmail) y recién ahí se aplica.
  email: {
    etiqueta: 'Correo',
    normalizar: (v) => String(v ?? '').trim().toLowerCase(),
    validar: (v) => (PATRON_CORREO.test(v) ? null : 'El correo ingresado no es válido.'),
    requiereConfirmacion: true,
  },
});

export const esTipoSolicitud = (tipo) => Object.prototype.hasOwnProperty.call(TIPOS_SOLICITUD, tipo);
export const etiquetaTipo = (tipo) => TIPOS_SOLICITUD[tipo]?.etiqueta || tipo;

// Estados: pendiente → aplicada (o, el correo, aprobada → aplicada al
// confirmar) | rechazada | cancelada (por el usuario, o porque un
// administrador cambió el dato directamente).
export const ESTADOS_SOLICITUD = Object.freeze({
  pendiente: 'Pendiente',
  aprobada: 'Aprobada, confirma desde tu nuevo correo',
  aplicada: 'Aplicada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
});
// Una abierta por usuario y tipo.
export const ESTADOS_ABIERTOS = Object.freeze(['pendiente', 'aprobada']);

// { valor, error } del valor solicitado (normalizado) frente al actual.
export const validarSolicitud = (tipo, valorSolicitado, valorActual) => {
  if (!esTipoSolicitud(tipo)) return { valor: null, error: 'Tipo de solicitud inválido.' };
  const t = TIPOS_SOLICITUD[tipo];
  const valor = t.normalizar(valorSolicitado);
  const error = t.validar(valor);
  if (error) return { valor, error };
  if (valor === t.normalizar(valorActual)) return { valor, error: 'Es igual al valor actual.' };
  return { valor, error: null };
};

export const validarMotivo = (motivo) => {
  const m = String(motivo ?? '').trim();
  if (!m) return { motivo: m, error: 'Indica el motivo del cambio.' };
  if (m.length > MAX_MOTIVO) return { motivo: m, error: `El motivo no puede superar ${MAX_MOTIVO} caracteres.` };
  return { motivo: m, error: null };
};
