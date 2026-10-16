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
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';
import DetalleConsignacion from './DetalleConsignacion';
import FormConsignacionModal from './FormConsignacionModal';

const PATH_VISTA = '/bodega/consignacionesBodega';
// Columnas del listado de empresas (permiso col_<key> en la sección "empresas").
const COLUMNAS = [
  { key: 'empresa', label: 'Empresa', fija: true, ancho: 260, min: 110 },
  { key: 'lineas', label: 'Líneas', alinear: 'text-right', ancho: 70, min: 50 },
  { key: 'consignada', label: 'Debo tener', alinear: 'text-right', ancho: 95, min: 60 },
  { key: 'actual', label: 'En bodega', alinear: 'text-right', ancho: 95, min: 60 },
  { key: 'transito', label: 'En tránsito', alinear: 'text-right', ancho: 95, min: 60 },
  { key: 'enCentro', label: 'En otro centro', alinear: 'text-right', ancho: 105, min: 60 },
  { key: 'faltante', label: 'Faltante', alinear: 'text-right', ancho: 90, min: 60 },
  { key: 'porVencer', label: 'Por vencer', alinear: 'text-right', ancho: 85, min: 60 },
];

// Stock consignado: por cada empresa consignante, lo que dejó (debo tener)
// contra lo que tengo en el Kardex (lotes con esa empresa como dueña: en
// bodega, en tránsito y dejado en otro centro). Lee las consignaciones y
// los lotes consignados una vez; el detalle trabaja sobre esa lectura.
const ConsignacionesBodega = () => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'empresas', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, 'bodega.consignaciones');
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
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
            <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
              <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
                {resumen.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>No hay stock consignado. Registra una consignación o ingresa stock marcado &quot;En consignación&quot;.</FilaAnchoCompleto>}
                {resumen.map((e) => (
                  <FilaBodega key={e.empresaId} columnas={columnasVisibles} className="cursor-pointer" onClick={() => setAbiertaId(e.empresaId)} celdas={{
                    empresa: (
                      <td className={`${TD} font-semibold text-[#2383C2] underline-offset-2 group-hover:underline`} title={e.empresaNombre}>
                        {e.empresaNombre}
                        {!e.consignacion && <span className="ml-1 px-1 rounded text-[9px] font-bold bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300">SIN REGISTRAR</span>}
                      </td>
                    ),
                    lineas: <td className={`${TD} text-right font-num`}>{e.lineas}</td>,
                    consignada: <td className={`${TD} text-right font-num font-bold`}>{formatoCantidad(e.consignada)}</td>,
                    actual: <td className={`${TD} text-right font-num text-emerald-700 dark:text-emerald-400`}>{formatoCantidad(e.actual)}</td>,
                    transito: <td className={`${TD} text-right font-num text-amber-600 dark:text-amber-400`}>{formatoCantidad(e.transito)}</td>,
                    enCentro: <td className={`${TD} text-right font-num text-violet-600 dark:text-violet-400`}>{formatoCantidad(e.enCentro)}</td>,
                    faltante: <td className={`${TD} text-right font-num ${e.faltante ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>{formatoCantidad(e.faltante)}</td>,
                    porVencer: <td className={`${TD} text-right font-num ${e.porVencer ? 'font-bold text-amber-600 dark:text-amber-400' : ''}`}>{e.porVencer || '—'}</td>,
                  }} />
                ))}
              </TablaBodega>
            </div>
          </div>
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
