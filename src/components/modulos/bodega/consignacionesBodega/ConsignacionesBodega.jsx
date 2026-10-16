import { useEffect, useMemo, useState } from 'react';
import { Handshake, RefreshCw, Plus, X } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { leerConsignaciones, leerLotesConsignados, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import SelectorProveedor from '../shared/documentos/SelectorProveedor';
import { resumenEmpresas } from './consignaciones';
import DetalleConsignacion from './DetalleConsignacion';
import FormConsignacionModal from './FormConsignacionModal';

const PATH_VISTA = '/bodega/consignacionesBodega';
// Columnas del listado de empresas (permiso col_<key> en la sección "empresas").
const COLUMNAS = [
  { key: 'empresa', label: 'Empresa', fija: true },
  { key: 'lineas', label: 'Líneas', alinear: 'text-right' },
  { key: 'consignada', label: 'Debo tener', alinear: 'text-right' },
  { key: 'actual', label: 'En bodega', alinear: 'text-right' },
  { key: 'transito', label: 'En tránsito', alinear: 'text-right' },
  { key: 'enCentro', label: 'En otro centro', alinear: 'text-right' },
  { key: 'faltante', label: 'Faltante', alinear: 'text-right' },
  { key: 'porVencer', label: 'Por vencer', alinear: 'text-right' },
];

// Stock consignado: por cada empresa consignante, lo que dejó (debo tener)
// contra lo que tengo en el Kardex (lotes con esa empresa como dueña: en
// bodega, en tránsito y dejado en otro centro). Lee las consignaciones y
// los lotes consignados una vez; el detalle trabaja sobre esa lectura.
const ConsignacionesBodega = () => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles, ver } = useColumnasPermitidas(PATH_VISTA, 'empresas', COLUMNAS);
  const { datos: empresas } = useCatalogo('empresas');
  const [datos, setDatos] = useState(null); // { consignaciones, lotes, completo }
  const [version, setVersion] = useState(0);
  const [abiertaId, setAbiertaId] = useState(null);
  const [nueva, setNueva] = useState(null); // null | { empresaId: '' } | { empresa }

  useEffect(() => {
    let vigente = true;
    Promise.all([leerConsignaciones(), leerLotesConsignados()])
      .then(([consignaciones, { lotes, completo }]) => { if (vigente) setDatos({ consignaciones, lotes, completo }); })
      .catch((e) => { if (vigente) { setDatos({ consignaciones: [], lotes: [], completo: true }); showToast(mensajeError(e, 'No se pudo leer el stock consignado.'), 'error'); } });
    return () => { vigente = false; };
  }, [version, showToast]);
  const recargar = () => { setDatos(null); setVersion((v) => v + 1); };

  const resumen = useMemo(() => (datos ? resumenEmpresas(datos.consignaciones, datos.lotes) : []), [datos]);
  const abierta = resumen.find((e) => e.empresaId === abiertaId) || null;
  const nombreEmpresa = (id) => empresas.find((e) => e.id === id)?.nombre || resumen.find((e) => e.empresaId === id)?.empresaNombre || id;

  // Tras guardar se aplica lo que devolvió la función (sin releer todo).
  const alGuardar = (r) => {
    setDatos((d) => ({ ...d, consignaciones: [...d.consignaciones.filter((c) => c.id !== r.id), { ...(d.consignaciones.find((c) => c.id === r.id) || {}), ...r, actualizadoEn: new Date() }] }));
    setAbiertaId(r.id);
    showToast(`Consignación de ${r.empresaNombre} guardada: ${r.cantidadLineas} línea(s), ${formatoCantidad(r.totalConsignado)} u.`, 'success');
  };

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><Handshake size={14} className="text-[#2383C2]" /> Stock consignado</h2>
        {!abierta && (
          <div className="flex items-center gap-1.5">
            {hasPermission(PATH_VISTA, 'empresas', 'btn_actualizar') && (
              <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><RefreshCw size={12} /> Actualizar</button>
            )}
            {hasPermission(PATH_VISTA, 'consignacion', 'btn_guardar') && (
              <button type="button" onClick={() => setNueva({ empresaId: '' })} className="h-7 px-2 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><Plus size={12} /> Nueva consignación</button>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-auto p-3 flex flex-col gap-2">
        {datos && !datos.completo && <p className="text-amber-700 dark:text-amber-300">Hay demasiados lotes consignados: se muestran los primeros. Avisa a soporte.</p>}
        {nueva && !nueva.empresa && (
          <div className="flex flex-wrap items-end gap-2 p-2 rounded border border-[#2383C2]/50 bg-blue-50/50 dark:bg-sky-950/20">
            <div className="w-80">
              <span className="block text-[10px] font-bold uppercase text-gray-500 mb-0.5">Empresa consignante</span>
              <SelectorProveedor valor={nueva.empresaId} onCambiar={(id) => {
                if (!id) { setNueva({ empresaId: '' }); return; }
                if (resumen.some((e) => e.empresaId === id && e.consignacion)) { setNueva(null); setAbiertaId(id); return; } // ya tiene: se abre
                setNueva({ empresa: { id, nombre: nombreEmpresa(id) } });
              }} placeholder="Busca la empresa por nombre o RUT…" />
            </div>
            <button type="button" onClick={() => setNueva(null)} className="h-9 px-2 rounded text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 flex items-center gap-1"><X size={13} /> Cancelar</button>
          </div>
        )}

        {datos === null ? (
          <p className="text-gray-400 italic">Cargando…</p>
        ) : abierta ? (
          <DetalleConsignacion
            key={abierta.empresaId}
            empresa={{ id: abierta.empresaId, nombre: abierta.empresaNombre }}
            consignacion={abierta.consignacion}
            lotes={datos.lotes.filter((l) => l.propietarioId === abierta.empresaId)}
            onVolver={() => setAbiertaId(null)}
            onGuardada={alGuardar}
          />
        ) : (
          <table className="w-full text-left text-[12px] border border-gray-200 dark:border-gray-700">
            <thead className="bg-gray-100 dark:bg-gray-900 text-[10px] uppercase text-gray-600 dark:text-gray-400">
              <tr>{columnasVisibles.map((c) => <th key={c.key} className={`px-2 py-1.5 ${c.alinear || ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
              {resumen.length === 0 && <tr><td colSpan={columnasVisibles.length} className="px-2 py-6 text-center text-gray-400 italic">No hay stock consignado. Registra una consignación o ingresa stock marcado &quot;En consignación&quot;.</td></tr>}
              {resumen.map((e) => (
                <tr key={e.empresaId} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 cursor-pointer" onClick={() => setAbiertaId(e.empresaId)}>
                  <td className="px-2 py-1.5 font-semibold text-[#2383C2] underline-offset-2 hover:underline">
                    {e.empresaNombre}
                    {!e.consignacion && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">SIN REGISTRAR</span>}
                  </td>
                  {ver('lineas') && <td className="px-2 py-1.5 text-right font-num">{e.lineas}</td>}
                  {ver('consignada') && <td className="px-2 py-1.5 text-right font-num font-bold">{formatoCantidad(e.consignada)}</td>}
                  {ver('actual') && <td className="px-2 py-1.5 text-right font-num text-emerald-700 dark:text-emerald-400">{formatoCantidad(e.actual)}</td>}
                  {ver('transito') && <td className="px-2 py-1.5 text-right font-num text-amber-600 dark:text-amber-400">{formatoCantidad(e.transito)}</td>}
                  {ver('enCentro') && <td className="px-2 py-1.5 text-right font-num text-violet-600 dark:text-violet-400">{formatoCantidad(e.enCentro)}</td>}
                  {ver('faltante') && <td className={`px-2 py-1.5 text-right font-num ${e.faltante ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>{formatoCantidad(e.faltante)}</td>}
                  {ver('porVencer') && <td className={`px-2 py-1.5 text-right font-num ${e.porVencer ? 'font-bold text-amber-600 dark:text-amber-400' : ''}`}>{e.porVencer || '—'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {nueva?.empresa && (
        <FormConsignacionModal empresa={nueva.empresa} consignacion={null} lotesEmpresa={(datos?.lotes || []).filter((l) => l.propietarioId === nueva.empresa.id)}
          onCerrar={() => setNueva(null)} onGuardada={(r) => { setNueva(null); alGuardar(r); }} />
      )}
    </div>
  );
};

export default ConsignacionesBodega;
