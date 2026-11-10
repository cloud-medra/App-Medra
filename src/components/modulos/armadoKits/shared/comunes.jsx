import { estadoVencimiento } from '../../bodega/shared/vencimientos';
import { fechaCorta } from './lineasKit';

export const Insignia = ({ color = 'gris', children, title }) => {
  const colores = {
    gris: 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200',
    ambar: 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300',
    verde: 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
    rojo: 'bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300',
  };
  return <span title={title} className={`inline-block px-1 rounded text-pequeno ${colores[color]}`}>{children}</span>;
};

const COLOR_ESTADO = { ARMADO: 'gris', EN_TRANSITO: 'ambar', ENTREGADO: 'verde' };
export const InsigniaEstado = ({ estado, etiqueta }) => <Insignia color={COLOR_ESTADO[estado] || 'gris'}>{etiqueta}</Insignia>;

// Fecha de vencimiento con su estado (vencido, próximo o sin fecha).
export const CeldaVencimiento = ({ fecha, hoy }) => {
  if (!fecha) return <Insignia color="ambar">Sin vencimiento</Insignia>;
  const estado = estadoVencimiento(fecha, { hoy });
  return (
    <span className="inline-flex items-center gap-1">
      <span>{fechaCorta(fecha)}</span>
      {estado.nivel === 'vencido' && <Insignia color="rojo">Vencido</Insignia>}
      {estado.nivel === 'proximo' && <Insignia color="ambar">{estado.etiqueta}</Insignia>}
    </span>
  );
};
