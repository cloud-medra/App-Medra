import { useEffect, useMemo, useState } from 'react';
import { Package, RefreshCw, Plus } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { leerCajas, leerCaja, mensajeError } from '../shared/bodegaApi';
import { formatoCantidad } from '../shared/catalogosBodega';
import { fechaHora } from '../shared/transito/transitos';
import DetalleCaja from './DetalleCaja';
import FormCajaModal from './FormCajaModal';
import { BarraCompletitud } from './comunes';
import { idUnico } from '../../../../../functions/bodega/nucleo.mjs';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../shared/anchosTablaBodega';

const PATH_VISTA = '/bodega/cajasBodega';

const COLUMNAS = [
  { key: 'nombre', label: 'Caja', fija: true, ancho: 260, min: 110 },
  { key: 'productos', label: 'Productos', alinear: 'text-right', ancho: 90, min: 60 },
  { key: 'completitud', label: '% completitud', ancho: 170, min: 110 },
  { key: 'faltante', label: 'Unidades faltantes', alinear: 'text-right', ancho: 125, min: 70 },
  { key: 'ultimoInventario', label: 'Último inventario', ancho: 140, min: 90 },
];

// Cajas (kits): listado con cantidad de productos y % de completitud
// (stock actual vs. objetivo), y el detalle de cada caja. El listado lee
// solo los documentos de las cajas, nunca su historial.
const CajasBodega = () => {
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(PATH_VISTA, 'cajas', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, 'bodega.cajas');
  const [cajas, setCajas] = useState(null);
  const [abierta, setAbierta] = useState(null);
  const [creando, setCreando] = useState(false);
  const [version, setVersion] = useState(0);
  const [verInactivas, setVerInactivas] = useState(false);

  useEffect(() => {
    let vigente = true;
    leerCajas()
      .then((lista) => { if (vigente) setCajas(lista); })
      .catch((e) => { if (vigente) { setCajas([]); showToast(mensajeError(e, 'No se pudieron leer las cajas.'), 'error'); } });
    return () => { vigente = false; };
  }, [version, showToast]);
  const recargar = () => { setCajas(null); setVersion((v) => v + 1); };

  // Tras guardar, inventariar o reponer: relee solo la caja abierta (1 lectura).
  const refrescarAbierta = async (id = abierta?.id) => {
    try {
      const caja = await leerCaja(id);
      setAbierta(caja);
      if (caja) setCajas((lista) => (lista || []).map((c) => (c.id === caja.id ? caja : c)));
    } catch (e) {
      showToast(mensajeError(e), 'error');
    }
  };

  const visibles = (cajas || []).filter((c) => verInactivas || c.activa !== false);
  // Nombres en uso (activas e inactivas), con la misma clave del candado del servidor.
  const nombresOcupados = useMemo(() => new Set((cajas || []).map((c) => idUnico.caja(c.nombre))), [cajas]);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5 uppercase"><Package size={14} className="text-[#2383C2]" /> Cajas</h2>
        {!abierta && (
          <div className="flex items-center gap-1.5">
            <label className="flex items-center gap-1 text-gray-600 dark:text-gray-300"><input type="checkbox" checked={verInactivas} onChange={(e) => setVerInactivas(e.target.checked)} /> Ver inactivas</label>
            <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 font-semibold flex items-center gap-1 text-gray-600 dark:text-gray-300"><RefreshCw size={12} /> Actualizar</button>
            {hasPermission(PATH_VISTA, 'cajas', 'btn_guardar') && (
              <button type="button" onClick={() => setCreando(true)} className="h-7 px-2 rounded bg-[#2383C2] text-white font-bold flex items-center gap-1"><Plus size={12} /> Nueva caja</button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {abierta ? (
          <DetalleCaja
            key={abierta.id} // al pasar a otra caja (p. ej. la duplicada) no arrastra historial ni modales
            caja={abierta} onVolver={() => setAbierta(null)} onCambio={() => refrescarAbierta()}
            nombresOcupados={nombresOcupados}
            // Igual que al crear: relee el listado y abre la caja nueva.
            onDuplicada={(id) => { recargar(); refrescarAbierta(id); }}
          />
        ) : cajas === null ? (
          <p className="text-gray-400 italic">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
            <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
              <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
                {visibles.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>No hay cajas.</FilaAnchoCompleto>}
                {visibles.map((c) => (
                  <FilaBodega key={c.id} columnas={columnasVisibles} className="cursor-pointer" onClick={() => setAbierta(c)} celdas={{
                    nombre: (
                      <td className={`${TD} font-semibold text-[#2383C2] underline-offset-2 group-hover:underline`} title={c.nombre}>
                        {c.nombre} {c.activa === false && <span className="ml-1 px-1 rounded bg-gray-200 dark:bg-gray-700 text-[9px] font-bold text-gray-600">INACTIVA</span>}
                      </td>
                    ),
                    productos: <td className={`${TD} text-right font-num`}>{c.cantidadProductos || 0}</td>,
                    completitud: <td className={TD}><BarraCompletitud valor={c.completitud} /></td>,
                    faltante: <td className={`${TD} text-right font-num ${c.totalFaltante ? 'font-bold text-red-600 dark:text-red-400' : ''}`}>{formatoCantidad(c.totalFaltante)}</td>,
                    ultimoInventario: <td className={`${TD} font-num`}>{c.ultimoInventario?.fecha ? fechaHora(c.ultimoInventario.fecha) : '—'}</td>,
                  }} />
                ))}
              </TablaBodega>
            </div>
          </div>
        )}
      </div>
      {creando && <FormCajaModal onCerrar={() => setCreando(false)} onGuardada={(id) => { setCreando(false); recargar(); refrescarAbierta(id); }} />}
    </div>
  );
};

export default CajasBodega;
