import { BarChart3 } from 'lucide-react';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useModulosActivos } from '../../../../stores/modulosActivosStore';
import { fijarFiltroInicial } from '../../../../stores/filtroInicialStore';
import ResumenFinanzasSeccion from './ResumenFinanzasSeccion';
import PendientesSeccion from './PendientesSeccion';
import { totalesVisibles } from './resumenFinanzas';
import { bloquesPendientes, hayBloques } from './pendientesInicio';

// Panel del Inicio, debajo de Accesos rápidos: una lista de secciones que
// se muestran según los permisos del usuario. Para sumar una sección,
// agregarla a SECCIONES con su `props(ctx)`: devuelve las props del
// componente o null si el usuario no la ve. Sin secciones visibles no se
// muestra el panel. `ctx.onAbrir(modulo, ruta, filtro?)` abre la pantalla
// como el menú y, con `filtro`, la deja filtrada (filtroInicialStore).
const SECCIONES = [
  {
    id: 'finanzas',
    Componente: ResumenFinanzasSeccion,
    props: ({ userData, modulosActivos, hasPermission }) => {
      const totales = totalesVisibles(userData, modulosActivos, hasPermission);
      return totales.length ? { totales } : null;
    },
  },
  {
    id: 'pendientes',
    Componente: PendientesSeccion,
    props: ({ userData, modulosActivos, onAbrir }) => {
      const bloques = bloquesPendientes(userData, modulosActivos);
      return hayBloques(bloques) ? { bloques, onAbrir } : null;
    },
  },
];

const PanelInicioCard = ({ userData, onAbrir }) => {
  const modulosActivos = useModulosActivos();
  const { hasPermission } = useGranularPermission();
  // Hasta saber qué módulos están activos no se sabe qué se puede mostrar.
  if (!modulosActivos) return null;

  const abrir = (modulo, ruta, filtro = null) => {
    fijarFiltroInicial(ruta, filtro);
    onAbrir?.(modulo, ruta);
  };
  const ctx = { userData, modulosActivos, hasPermission, onAbrir: abrir };
  const visibles = SECCIONES
    .map((s) => ({ ...s, propsSeccion: s.props(ctx) }))
    .filter((s) => s.propsSeccion);
  if (visibles.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-2.5 shadow-sm flex flex-col gap-2 flex-shrink-0">
      <span className="text-[11px] font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1.5 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700 pb-1.5">
        <BarChart3 size={13} className="text-[#2383C2]" /> Resumen del mes
      </span>
      {visibles.map(({ id, Componente, propsSeccion }) => (
        <Componente key={id} {...propsSeccion} />
      ))}
    </div>
  );
};

export default PanelInicioCard;
