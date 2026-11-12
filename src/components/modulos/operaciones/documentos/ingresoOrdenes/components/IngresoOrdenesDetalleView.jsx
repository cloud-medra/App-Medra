import { useState } from 'react';
import { Info, ListFilter, FileText, ClipboardList } from 'lucide-react';
import PlaceholderModulo from '../../PlaceholderModulo';

const formatearFechaCelda = (valor) => {
  if (!valor) return '-';
  const fecha = valor.toDate ? valor.toDate() : new Date(valor);
  if (isNaN(fecha.getTime())) return '-';
  const dd = String(fecha.getDate()).padStart(2, '0');
  const mm = String(fecha.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${fecha.getFullYear()}`;
};

// Mismo patrón visual/estructural que GestionesImplantesDetalleView.jsx
// (sidebar "Menú de Opción" + contenido a la derecha), simplificado porque
// acá es de solo lectura (no hay formulario ni guardado) — el grupo viene
// completo desde la tabla principal (agruparPorAdmisionEmpresaFecha.js), no
// hace falta releerlo de Firestore.
const TABS = [
  { id: 'informacion', label: 'Información', Icon: Info },
  { id: 'consumo', label: 'Consumo', Icon: ListFilter },
  { id: 'informe', label: 'Informe', Icon: FileText },
  { id: 'ordenes', label: 'Órdenes', Icon: ClipboardList }
];

const FilaDato = ({ label, valor }) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-pequeno uppercase tracking-wide text-tinta-atenuada">{label}</span>
    <span className="text-normal text-tinta-principal">{valor || '-'}</span>
  </div>
);

// OC es un dato del ítem, no del grupo — pero para una misma orden
// (admisión+empresa+fecha) el número de OC es el mismo en todas sus líneas,
// así que se toma el primer valor no vacío entre los ítems del grupo.
const obtenerOCGrupo = (grupo) => {
  const conOC = (grupo.items || []).find((item) => (item.oc || '').toString().trim());
  return conOC ? conOC.oc.toString().trim() : '';
};

const IngresoOrdenesDetalleView = ({ grupo }) => {
  const [tabActiva, setTabActiva] = useState('informacion');
  const ocGrupo = obtenerOCGrupo(grupo);

  return (
    <div className="flex-grow flex overflow-hidden text-secundario">
      <div className="w-36 shrink-0 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 flex flex-col">
        <div className="p-2 border-b border-slate-200 dark:border-gray-700">
          <h2 className="text-pequeno text-tinta-principal uppercase tracking-wide">
            Menú de Opción
          </h2>
        </div>
        <div className="p-1.5 space-y-1">
          {TABS.map((tab) => {
            const TabIcon = tab.Icon;
            const isActive = tabActiva === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setTabActiva(tab.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md transition text-left ${isActive
                  ? 'bg-[#2383C2]/10 text-[#2383C2] dark:bg-blue-950/50 dark:text-blue-400 text-etiqueta'
                  : 'text-tinta-secundaria hover:bg-slate-100 dark:hover:bg-gray-700/50'
                  }`}
              >
                <TabIcon size={13} />
                <span className="truncate">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-grow flex flex-col overflow-auto bg-slate-50/50 dark:bg-gray-900">
        {tabActiva === 'informacion' && (
          <div className="p-4 max-w-2xl w-full">
            <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
              <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
                <Info size={13} className="text-[#2383C2]" />
                <h3 className="text-etiqueta text-tinta-principal uppercase tracking-wide">
                  Detalle de Orden
                </h3>
              </div>
              <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <FilaDato label="Admisión" valor={grupo.admision} />
                <FilaDato label="Paciente" valor={grupo.paciente} />
                <FilaDato label="Médico" valor={grupo.medico} />
                <FilaDato label="Empresa" valor={grupo.proveedor} />
                <FilaDato label="Fecha Cx" valor={formatearFechaCelda(grupo.fecha_cx)} />
                <FilaDato label="N° Ítems" valor={String(grupo.totalItems)} />
                {ocGrupo && <FilaDato label="OC" valor={ocGrupo} />}
              </div>
            </div>
          </div>
        )}

        {tabActiva === 'consumo' && (
          <div className="flex-grow overflow-auto">
            <table className="w-full text-left text-secundario border-collapse min-w-[900px]">
              <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
                <tr className="text-tinta-secundaria uppercase text-pequeno tracking-wider">
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">ID</th>
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Código</th>
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Descripción</th>
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 text-center">Cant.</th>
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 text-right">Precio U.</th>
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">OC</th>
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Estado</th>
                  <th className="px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">N° Guía</th>
                  <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">N° Factura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
                {grupo.items.map((item) => (
                  <tr key={item.refPath} className="hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-all duration-150">
                    <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-numero-tabla text-tinta-secundaria">{item.id}</td>
                    <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-numero-tabla text-emerald-600 dark:text-emerald-400">{item.codigo || '-'}</td>
                    <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 truncate max-w-[220px]" title={item.descripcion}>{item.descripcion || '-'}</td>
                    <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-center">{item.cantidad ?? '-'}</td>
                    <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-right">{item.precio_u ?? '-'}</td>
                    <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70">{item.oc || '-'}</td>
                    <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70">{item.estado || '-'}</td>
                    <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70">{item.numero_guia || '-'}</td>
                    <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700/70">{item.numero_factura || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tabActiva === 'informe' && (
          <PlaceholderModulo titulo="Informe" descripcion="Carga de PDF de informes para esta admisión." Icon={FileText} />
        )}

        {tabActiva === 'ordenes' && (
          <PlaceholderModulo titulo="Órdenes" descripcion="Carga de PDF de la orden de compra para este grupo." Icon={ClipboardList} />
        )}
      </div>
    </div>
  );
};

export default IngresoOrdenesDetalleView;
