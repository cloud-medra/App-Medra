import { useState } from 'react';
import { ScanBarcode, ArrowDownToLine, ArrowUpFromLine, FileText, ClipboardList, ArrowLeft } from 'lucide-react';
import IngresoDirecto from './ingreso/IngresoDirecto';
import EgresoPorEscaneo from './egreso/EgresoPorEscaneo';
import IngresoPorDocumento from './ingresoDocumento/IngresoPorDocumento';
import { useUser } from '../../../../context/UserContext';

// Operaciones de Escaneo. `disponible: false` se muestra como "Próximamente".
// `requiere`: ruta de menú que además debe tener el usuario (mismos permisos
// que esa vista).
const GRUPOS = [
  {
    id: 'ingresar',
    titulo: 'Ingresar',
    Icon: ArrowDownToLine,
    operaciones: [
      { id: 'ingresoDocumento', label: 'Con guía o factura', descripcion: 'Igual que Ingresos, escaneando los productos', Icon: FileText, disponible: true, requiere: '/inventario/ingresosInventario' },
      { id: 'ingresoDirecto', label: 'Ingreso directo', descripcion: 'Cargar stock sin guía ni factura', Icon: ClipboardList, disponible: true }
    ]
  },
  {
    id: 'egresar',
    titulo: 'Egresar / Traspaso a tránsito',
    Icon: ArrowUpFromLine,
    operaciones: [
      { id: 'egresoTransito', label: 'Egreso / traspaso a tránsito', descripcion: 'Descontar stock y dejarlo en tránsito', Icon: ArrowUpFromLine, disponible: true }
    ]
  }
];

const OPERACIONES = Object.fromEntries(GRUPOS.flatMap((g) => g.operaciones).map((o) => [o.id, o]));
const VISTAS = { ingresoDocumento: IngresoPorDocumento, ingresoDirecto: IngresoDirecto, egresoTransito: EgresoPorEscaneo };

const tieneAcceso = (userData, ruta) => !ruta
  || userData?.rol === 'dev'
  || (userData?.permisos?.inventario || []).includes(ruta);

const SelectorOperacion = ({ onElegir, permitido }) => (
  <div className="flex-grow flex flex-col items-center justify-center gap-6 p-6">
    <span className="text-[11px] font-medium text-slate-500 dark:text-gray-400 uppercase tracking-wide">¿Qué vas a hacer?</span>
    <div className="flex flex-wrap items-start justify-center gap-6">
      {GRUPOS.map(({ id, titulo, Icon, operaciones }) => (
        <div key={id} className="flex flex-col items-center gap-2">
          <span className="flex items-center gap-1.5 text-[12px] font-bold text-slate-700 dark:text-gray-200 uppercase">
            <Icon size={14} className="text-[#2383C2]" /> {titulo}
          </span>
          <div className="flex flex-wrap justify-center gap-3">
            {operaciones.map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => op.disponible && permitido(op) && onElegir(op.id)}
                disabled={!op.disponible || !permitido(op)}
                title={op.disponible && !permitido(op) ? 'Requiere permiso de Ingresos' : undefined}
                className="relative w-52 flex flex-col items-center gap-2 px-5 py-6 bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg shadow-sm hover:border-[#2383C2] hover:shadow-md transition disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:shadow-sm"
              >
                {(!op.disponible || !permitido(op)) && (
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">{op.disponible ? 'Sin permiso' : 'Próximamente'}</span>
                )}
                <op.Icon size={24} className="text-[#2383C2]" />
                <span className="text-[12px] font-semibold text-slate-700 dark:text-gray-100">{op.label}</span>
                {op.descripcion && <span className="text-[10px] text-slate-400 dark:text-gray-500">{op.descripcion}</span>}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const EscaneoInventario = () => {
  const { userData } = useUser();
  const permitido = (op) => tieneAcceso(userData, op.requiere);
  const [operacionId, setOperacionId] = useState(null);
  const operacion = operacionId ? OPERACIONES[operacionId] : null;
  const Vista = operacionId ? VISTAS[operacionId] : null;

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden font-sans text-[11px]">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2">
        {operacion && (
          <button
            onClick={() => setOperacionId(null)}
            className="p-1 rounded-md border border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-slate-600 dark:text-gray-300 hover:bg-slate-50 dark:hover:bg-gray-700/50 transition"
            title="Volver"
          >
            <ArrowLeft size={13} />
          </button>
        )}
        <ScanBarcode size={16} className="text-[#2383C2]" />
        <span className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">
          {operacion ? `Escaneo · ${operacion.label}` : 'Escaneo'}
        </span>
      </header>
      {Vista ? <Vista key={operacionId} onIrA={setOperacionId} /> : <SelectorOperacion onElegir={setOperacionId} permitido={permitido} />}
    </div>
  );
};

export default EscaneoInventario;
