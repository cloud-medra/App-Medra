import { ClipboardList, Building2, Calendar as CalendarIcon, Copy, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { formatearFechaTabla } from '../../implantes/gestionImplantes/components/Cargastab/cargasHelpers';
import { ControlPdfOC } from './ControlPdfOC';
import { useSubirPdfOC } from './useSubirPdfOC';
import { claveOC } from './ordenesOCHelpers';

// OC de la admisión (sin duplicados) y su detalle por empresa/fecha. Sale de
// los datos ya en memoria del detalle (ocsPorBloque). El estado del PDF de
// cada OC sale de `registroPdf` (ordenesOC/registroPdf, leído por el padre
// una vez por detalle); el PDF es uno por OC, compartido entre admisiones.
// La usan Gestión de Implantes y Cargas de Consignación: `puedeSubirPdf`
// (false en Consignación, que solo tiene permiso de lectura de los PDF)
// oculta subir/reemplazar; `textoPendiente` dice dónde se sincroniza.
export const OrdenTab = ({
  bloques = [], ocsPorBloque = [], bloqueActivoIndex, handleCopiarTexto,
  registroPdf = null, onRecargarRegistroPdf, onPdfRegistrado, puedeSubirPdf = true,
  textoPendiente = 'Pendiente — aún no hay OC asignadas a esta admisión (usa "Sincronizar OC" en la barra de Gestión de Implantes).'
}) => {
  const ocsAdmision = [...new Set(ocsPorBloque.flat())];
  const pdfs = registroPdf?.pdfs || {};
  const cargandoRegistro = registroPdf === null;
  const { subirParaOC, verPdfOC, subiendo, abriendo } = useSubirPdfOC({ registro: pdfs, onRegistrado: onPdfRegistrado });

  const controlPdf = (oc) => {
    const clave = claveOC(oc);
    if (cargandoRegistro) return <Loader2 size={11} className="animate-spin text-slate-400" />;
    return (
      <ControlPdfOC
        oc={clave}
        tienePdf={Boolean(pdfs[clave])}
        subiendo={subiendo?.oc === clave ? subiendo : null}
        abriendo={abriendo === clave}
        deshabilitado={Boolean(subiendo) || Boolean(registroPdf?.error)}
        soloLectura={!puedeSubirPdf}
        onVer={() => verPdfOC(clave)}
        onArchivos={(archivos) => subirParaOC(clave, archivos)}
      />
    );
  };

  return (
    <div className="p-3 md:p-4 max-w-5xl mx-auto w-full space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-1.5">
          <ClipboardList size={13} className="text-[#2383C2]" />
          <h3 className="text-etiqueta text-tinta-principal uppercase tracking-wide">
            Órdenes de compra ({ocsAdmision.length})
          </h3>
        </div>
        <div className="p-3 flex flex-wrap gap-1.5">
          {ocsAdmision.length === 0 ? (
            <span className="text-pequeno text-tinta-atenuada">
              {textoPendiente}
            </span>
          ) : ocsAdmision.map(oc => (
            <span key={oc} className="flex items-center gap-1 pr-1 rounded border border-[#2383C2]/30 bg-[#2383C2]/5">
              <button
                type="button"
                onClick={() => handleCopiarTexto?.(oc)}
                title="Copiar OC"
                className="flex items-center gap-1 px-2 py-1.5 md:py-0.5 text-[#2383C2] dark:text-blue-400 text-numero-tabla hover:bg-[#2383C2]/10 transition rounded-l"
              >
                {oc} <Copy size={10} className="opacity-60" />
              </button>
              {controlPdf(oc)}
            </span>
          ))}
        </div>
        {registroPdf?.error && (
          <div className="mx-3 mb-3 flex items-center gap-2 text-pequeno text-red-600 dark:text-red-400">
            <AlertCircle size={12} /> {registroPdf.error}
            <button
              type="button"
              onClick={onRecargarRegistroPdf}
              className="flex items-center gap-1 px-2 py-1.5 md:py-0.5 rounded border border-slate-300 dark:border-gray-600 text-tinta-secundaria hover:bg-slate-100 dark:hover:bg-gray-700/50"
            >
              <RefreshCw size={10} /> Reintentar
            </button>
          </div>
        )}
        {puedeSubirPdf && ocsAdmision.length > 0 && !registroPdf?.error && (
          <p className="px-3 pb-2 text-pequeno text-tinta-atenuada">
            Un PDF por OC, nombrado OC_número.pdf. Arrástralo sobre la OC o usa el botón de subir.
          </p>
        )}
      </div>

      {bloques.length > 0 && (
        <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-x-auto">
          <table className="w-full text-left text-pequeno border-collapse">
            <thead className="bg-slate-50 dark:bg-gray-900/60">
              <tr className="text-tinta-secundaria uppercase text-pequeno">
                <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Empresa</th>
                <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Fecha</th>
                <th className="px-2.5 py-1.5 border-b border-slate-200 dark:border-gray-700">OC</th>
              </tr>
            </thead>
            <tbody>
              {bloques.map((bloque, idx) => {
                const ocs = ocsPorBloque[idx] || [];
                return (
                  <tr
                    key={bloque.uniqueKey || idx}
                    className={idx === bloqueActivoIndex ? 'bg-[#2383C2]/5 dark:bg-blue-950/30' : 'hover:bg-gray-50/80 dark:hover:bg-gray-700/40'}
                  >
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-principal">
                      <span className="flex items-center gap-1.5"><Building2 size={11} className="text-[#2383C2]" />{bloque.empresa || 'SIN EMPRESA'}</span>
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-r border-slate-100 dark:border-gray-700/60 text-tinta-secundaria">
                      <span className="flex items-center gap-1.5"><CalendarIcon size={11} className="text-[#2383C2]" />{formatearFechaTabla(bloque.fecha)}</span>
                    </td>
                    <td className="px-2.5 py-1.5 border-b border-slate-100 dark:border-gray-700/60 text-numero-tabla">
                      {ocs.length
                        ? (
                          <span className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                            {ocs.map(oc => (
                              <span key={oc} className="flex items-center gap-1">
                                <span className="text-tinta-principal text-etiqueta">{oc}</span>
                                {controlPdf(oc)}
                              </span>
                            ))}
                          </span>
                        )
                        : <span className="text-tinta-atenuada">Pendiente</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
