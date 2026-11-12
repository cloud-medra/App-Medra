import { Plus, Minus, Link2 } from 'lucide-react';

// Origen de una casilla del árbol de permisos de un usuario con centro de
// costo: heredada de la plantilla, agregada o quitada manualmente (una
// excepción). Con `compacta`, solo el ícono (grillas de acciones/columnas).
const ESTILOS = {
  heredado: { texto: 'Plantilla', titulo: 'Heredado de la plantilla del centro de costo', icono: Link2, clase: 'bg-gray-100 dark:bg-gray-700 text-tinta-secundaria' },
  agregado: { texto: 'Agregado', titulo: 'Agregado manualmente a este usuario (no está en la plantilla)', icono: Plus, clase: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' },
  quitado: { texto: 'Quitado', titulo: 'Quitado manualmente a este usuario (la plantilla lo incluye)', icono: Minus, clase: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400' },
};

const MarcaOrigen = ({ origen, compacta = false }) => {
  const e = ESTILOS[origen];
  if (!e) return null;
  const Icono = e.icono;
  return (
    <span title={e.titulo} aria-label={e.titulo} data-origen={origen}
      className={`inline-flex items-center gap-0.5 shrink-0 rounded-full ${compacta ? 'p-0.5' : 'text-pequeno px-1.5 py-0.5'} ${e.clase}`}>
      <Icono size={compacta ? 9 : 10} aria-hidden="true" />
      {!compacta && e.texto}
    </span>
  );
};

export default MarcaOrigen;
