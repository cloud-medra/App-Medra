import { Eye, Trash2 } from 'lucide-react';
import { useColumnResize } from '../../../../hooks/useColumnResize';
import { ThRedimensionable, ColgroupRedimensionable, ThRelleno, TdRelleno } from '../../../ui/ThRedimensionable';
import EstadoProcesoBadge from './EstadoProcesoBadge';
import CeldasDatosIngreso from './CeldasDatosIngreso';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';

// Tabla de XML Documentos (Laboratorio y Vacunatorio), con columnas
// redimensionables. Orden / Acta / Salida / Mes imputado se muestran igual
// que en Procesos > Documentos Recibidos (CeldasDatosIngreso).

// Granularidad por columna: `col_<key>` en la sección 'tabla_documentos' de
// la vista que monta la tabla (`pathVista`; ver useColumnasPermitidas).
// Orden/Acta/Salida/Mes imputado: mismas keys que CeldasDatosIngreso.
const COLUMNAS = [
  { key: 'n', label: '#', ancho: 36, min: 30, align: 'text-center' },
  { key: 'folio', label: 'Folio', ancho: 90, min: 60 },
  { key: 'emision', label: 'Emisión', ancho: 90, min: 65 },
  { key: 'ref', label: 'Ref.', ancho: 90, min: 60 },
  { key: 'razonSocial', label: 'Razón Social', ancho: 240, min: 100 },
  { key: 'total', label: 'Total (Neto)', ancho: 105, min: 70, align: 'text-right' },
  { key: 'estado', label: 'Estado', ancho: 140, min: 90, align: 'text-center' },
  { key: 'orden', label: 'Orden', ancho: 80, min: 50, align: 'text-center' },
  { key: 'acta', label: 'Acta', ancho: 80, min: 50, align: 'text-center' },
  { key: 'salida', label: 'Salida', ancho: 80, min: 50, align: 'text-center' },
  { key: 'mesImputado', label: 'Mes imputado', ancho: 100, min: 70, align: 'text-center' },
  { key: 'acciones', label: 'Acciones', ancho: 75, min: 60, align: 'text-center' },
];

const TH = 'px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700';
const TD = 'px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70';

const TablaXmlDocumentos = ({ pathVista, documentos, mensajeVacio, puedeVer, puedeEliminar, onVer, onEliminar }) => {
  const { columnasVisibles, ver } = useColumnasPermitidas(pathVista, 'tabla_documentos', COLUMNAS);
  const { anchos, handleResize, anchoTotalTabla } = useColumnResize(columnasVisibles);

  return (
    <table
      className="text-left text-secundario border-collapse"
      style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: '100%' }}
    >
      <ColgroupRedimensionable columnas={columnasVisibles} anchos={anchos} relleno />
      <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
        <tr className="text-tinta-secundaria uppercase text-pequeno">
          {columnasVisibles.map(col => (
            <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={handleResize} className={`${TH} ${col.align || ''}`}>{col.label}</ThRedimensionable>
          ))}
          <ThRelleno className="border-b border-slate-200 dark:border-gray-700" />
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
        {documentos.length === 0 ? (
          <tr>
            <td colSpan={columnasVisibles.length + 1} className="text-center py-6 text-tinta-atenuada">
              {mensajeVacio}
            </td>
          </tr>
        ) : documentos.map((docItem, index) => (
          <tr
            key={docItem.id}
            className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors"
          >
            {ver('n') && (
              <td className={`${TD} text-tinta-secundaria text-etiqueta text-center`}>
                {index + 1}
              </td>
            )}
            {ver('folio') && (
              <td className={`${TD} text-tinta-principal truncate`}>
                {docItem.folio}
              </td>
            )}
            {ver('emision') && (
              <td className={`${TD} text-tinta-secundaria truncate`}>
                {docItem.fchEmis}
              </td>
            )}
            {ver('ref') && (
              <td className={`${TD} text-tinta-secundaria truncate`}>
                {docItem.folioRef}
              </td>
            )}
            {ver('razonSocial') && (
              <td className={`${TD} text-tinta-principal truncate`} title={docItem.rznSoc}>
                {docItem.rznSoc}
              </td>
            )}
            {ver('total') && (
              <td className={`${TD} text-tinta-principal text-right truncate`}>
                ${parseInt(docItem.total || 0, 10).toLocaleString('es-CL')}
              </td>
            )}
            {ver('estado') && (
              <td className={`${TD} text-center truncate`}>
                <EstadoProcesoBadge estado={docItem.estado} fallback="Iniciar Ingreso" />
              </td>
            )}
            <CeldasDatosIngreso documento={docItem} ver={ver} />
            {ver('acciones') && (
              <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700 text-center">
                <div className="flex justify-center gap-2">
                  {puedeVer && (
                    <button
                      onClick={() => onVer(docItem)}
                      className="text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] transition"
                      title="Ver Detalle"
                    >
                      <Eye size={13} />
                    </button>
                  )}
                  {puedeEliminar && (
                    <button
                      onClick={() => onEliminar(docItem.id)}
                      className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition"
                      title="Eliminar"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </td>
            )}
            <TdRelleno className="border-b border-slate-200/60 dark:border-gray-700/70" />
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default TablaXmlDocumentos;
