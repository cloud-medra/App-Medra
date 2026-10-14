// Resumen Mensual de facturación: un año (select, por defecto el actual) y
// una tabla de 12 meses con Total / Facturado / Pendiente y sus % + fila de
// totales del año. Lee solo resumen_facturacion_mensual (ver
// resumenFacturacionService.js), nunca las filas de Detalles OC — salvo
// "Recalcular" (solo administradores), que rearma el año leyendo todas sus
// filas.
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { useUser } from '../../../../../context/UserContext';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { esAdministrador } from '../../../../../config/accesoMenu';
import { useResumenFacturacion } from './hooks/useResumenFacturacion';
import { filasResumenMensual, formatearPorcentaje } from './utils/filasResumenMensual';
import { formatearMonedaCLP } from './utils/columnasSeguimiento';

const TH = 'px-3 py-1.5 border-b border-r border-slate-200 dark:border-gray-700';
const TD = 'px-3 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70';
const NUM = 'text-right font-num';

const formatearFechaHora = (valor) => {
  const fecha = valor?.toDate ? valor.toDate() : valor;
  return fecha instanceof Date && !isNaN(fecha.getTime())
    ? fecha.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
    : null;
};

const ResumenMensual = () => {
  const { userData } = useUser() || {};
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { anio, setAnio, anios, resumen, cargando, error, recalcular, recalculando } = useResumenFacturacion();
  const { filas, totales } = filasResumenMensual(resumen?.meses);
  const actualizado = formatearFechaHora(resumen?.actualizadoEn);

  const handleRecalcular = () => {
    confirmAction(
      'Recalcular resumen',
      `Se leerán todas las filas de Detalles OC de ${anio} (1 lectura por fila) para rearmar el resumen del año. ¿Continuar?`,
      async () => {
        try {
          const r = await recalcular();
          showToast(`Resumen ${anio} recalculado: ${r.filas.toLocaleString('es-CL')} fila(s), ${r.lecturas.toLocaleString('es-CL')} lectura(s).`, 'success');
          if (r.sinNumeroFactura > 0) {
            showToast(`${r.sinNumeroFactura.toLocaleString('es-CL')} fila(s) de ${anio} no tienen el campo N° Factura: cuentan como pendientes pero no aparecen en Seguimiento de Facturas.`, 'error');
          }
        } catch (err) {
          console.error('Error al recalcular el resumen de facturación:', err);
          showToast('No se pudo recalcular el resumen: ' + err.message, 'error');
        }
      },
      { confirmText: 'Recalcular', type: 'warning' }
    );
  };

  const filaTabla = (f, clase = '') => (
    <tr key={f.mes || 'total'} className={clase}>
      <td className={TD}>{f.etiqueta}</td>
      <td className={`${TD} ${NUM}`}>{formatearMonedaCLP(f.total)}</td>
      <td className={`${TD} ${NUM}`}>{formatearMonedaCLP(f.facturado)}</td>
      <td className={`${TD} ${NUM}`} title={`${f.cantidadPendiente.toLocaleString('es-CL')} de ${f.cantidad.toLocaleString('es-CL')} fila(s) pendientes`}>
        {formatearMonedaCLP(f.pendiente)}
      </td>
      <td className={`${TD} ${NUM}`}>{formatearPorcentaje(f.pctFacturado)}</td>
      <td className={`${TD} ${NUM}`}>{formatearPorcentaje(f.pctPendiente)}</td>
    </tr>
  );

  return (
    <>
      <div className="bg-gray-50 dark:bg-gray-800/50 px-3 py-1.5 flex flex-wrap items-center gap-2 border-b border-gray-200 dark:border-gray-700">
        <select
          value={anio}
          onChange={(e) => setAnio(e.target.value)}
          disabled={cargando || recalculando}
          aria-label="Año"
          className="h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-[11px] bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 outline-none focus:border-[#2383C2] cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {anios.map((yyyy) => (
            <option key={yyyy} value={yyyy}>{yyyy}</option>
          ))}
        </select>

        {actualizado && (
          <span className="text-[10.5px] text-slate-400 dark:text-gray-500">Actualizado: {actualizado}</span>
        )}

        {esAdministrador(userData) && (
          <button
            type="button"
            onClick={handleRecalcular}
            disabled={cargando || recalculando}
            title="Rearma el resumen del año leyendo todas sus filas (por si algo quedó descuadrado)"
            className="ml-auto h-7 px-2.5 flex items-center gap-1.5 rounded border border-gray-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 bg-white dark:bg-gray-900 hover:bg-slate-50 dark:hover:bg-gray-700/50 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {recalculando ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Recalcular
          </button>
        )}
      </div>

      {cargando ? (
        <div className="flex-grow flex items-center justify-center gap-2 text-slate-400 dark:text-gray-500 text-[11px]">
          <Loader2 size={14} className="animate-spin" /> Cargando resumen...
        </div>
      ) : error ? (
        <div className="flex-grow flex items-center justify-center gap-1.5 text-red-600 dark:text-red-400 text-[11px]">
          <AlertTriangle size={13} /> {error}
        </div>
      ) : (
        <div className="flex-grow min-h-0 overflow-auto">
          {!resumen && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800 px-3 py-1 text-[10.5px] text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle size={11} /> {anio} todavía no tiene resumen guardado. Se arma solo al importar o eliminar filas de ese año, o con &quot;Recalcular&quot;.
            </div>
          )}
          <table className="w-full text-left text-[11px] border-collapse">
            <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
              <tr className="text-slate-600 dark:text-gray-400 uppercase font-normal text-[10px] tracking-wider">
                <th className={TH}>Mes</th>
                <th className={`${TH} text-right`}>Total</th>
                <th className={`${TH} text-right`}>Facturado</th>
                <th className={`${TH} text-right`}>Pendiente por facturar</th>
                <th className={`${TH} text-right`}>% Facturado</th>
                <th className={`${TH} text-right`}>% Pendiente</th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 text-slate-700 dark:text-gray-200">
              {filas.map((f) => filaTabla(f, 'hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-all duration-150'))}
              {filaTabla(totales, 'font-bold bg-slate-50 dark:bg-gray-900/60 text-slate-800 dark:text-gray-100')}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
};

export default ResumenMensual;
