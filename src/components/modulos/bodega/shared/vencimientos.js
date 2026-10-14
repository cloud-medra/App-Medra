// Estado de vencimiento de un lote para resaltarlo en pantalla.
//   vencido: la fecha ya pasó (vence hoy cuenta como vigente).
//   proximo: vence dentro de `diasAviso` días.
export const DIAS_AVISO_VENCIMIENTO = 90;

const MS_DIA = 24 * 60 * 60 * 1000;
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Días desde `hoy` hasta `fecha` (ambas 'AAAA-MM-DD'); null si falta.
export const diasHasta = (fecha, hoy = hoyISO()) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) return null;
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / MS_DIA);
};

const ESTADOS = {
  vencido: {
    etiqueta: 'VENCIDO',
    fila: 'bg-red-50/70 dark:bg-red-950/30',
    badge: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300',
  },
  proximo: {
    etiqueta: 'PRÓXIMO',
    fila: 'bg-amber-50/70 dark:bg-amber-950/20',
    badge: 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
  },
};
const SIN_ESTADO = Object.freeze({ nivel: null, dias: null, etiqueta: '', fila: '', badge: '' });

export const estadoVencimiento = (fecha, { hoy, diasAviso = DIAS_AVISO_VENCIMIENTO } = {}) => {
  const dias = diasHasta(fecha, hoy);
  if (dias === null) return SIN_ESTADO;
  if (dias < 0) return { nivel: 'vencido', dias, ...ESTADOS.vencido };
  if (dias <= diasAviso) return { nivel: 'proximo', dias, ...ESTADOS.proximo, etiqueta: `${dias} D` };
  return { ...SIN_ESTADO, dias };
};
