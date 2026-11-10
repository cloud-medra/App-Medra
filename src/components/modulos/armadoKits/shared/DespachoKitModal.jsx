import { useEffect, useMemo, useState } from 'react';
import { Truck, X } from 'lucide-react';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import {
  ACCIONES_TRANSITO_KIT, ESTADOS_KIT, ETIQUETAS_ESTADO_KIT, FAMILIAS_KIT, advertenciasKit, estadoKit, hoyChile, idKit, versionKit,
} from '../../../../../functions/armadoKits/nucleo.mjs';
import { detalleError, mensajeError } from '../../bodega/shared/bodegaApi';
import { TablaBodega, FilaBodega } from '../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../bodega/shared/anchosTablaBodega';
import { gestionarTransitoKit, leerKit } from './kitsApi';
import { etiquetaLote } from './lineasKit';
import { CeldaVencimiento } from './comunes';

const COLUMNAS = [
  { key: 'referencia', label: 'Referencia', ancho: 110, min: 60 },
  { key: 'nombre', label: 'Nombre', ancho: 260, min: 100 },
  { key: 'lote', label: 'Lote', ancho: 100, min: 60 },
  { key: 'vencimiento', label: 'Vencimiento', ancho: 150, min: 90 },
  { key: 'cantidad', label: 'Cantidad', alinear: 'text-right', ancho: 70, min: 55 },
];
const [, RUTA_EGRESO, SECCION_EGRESO, BOTON_DESPACHAR] = ACCIONES_TRANSITO_KIT.DESPACHAR;

const referenciaDeKit = (kit) => Object.values(FAMILIAS_KIT).map((f) => f.referencias[kit.referencia]).find(Boolean)?.etiqueta || kit.referencia || '—';

// Kit escaneado en Egreso: muestra ID, referencia y contenido actual y pide
// confirmar el despacho del kit completo. Se bloquea si la hoja escaneada es
// de una versión anterior del contenido. El servidor vuelve a validar todo.
//   lectura: { codigo, version } (leerCodigoKit)
const DespachoKitModal = ({ lectura, centroInicial = null, onCerrar, onDespachado }) => {
  const { hasPermission } = useGranularPermission();
  const { datos: centros } = useCatalogo('centros');
  const { anchos, handleResize } = useAnchosTablaBodega(COLUMNAS, 'kits.despacho');
  const [kit, setKit] = useState(undefined);
  const [centroId, setCentroId] = useState(centroInicial?.id || '');
  const [observacion, setObservacion] = useState('');
  const [aceptaAdvertencias, setAceptaAdvertencias] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const hoy = hoyChile();
  const puede = hasPermission(RUTA_EGRESO, SECCION_EGRESO, BOTON_DESPACHAR);

  useEffect(() => {
    let vigente = true;
    leerKit(idKit(lectura.codigo))
      .then((k) => { if (vigente) setKit(k); })
      .catch((e) => { if (vigente) { setKit(null); setError(mensajeError(e, 'No se pudo leer el kit.')); } });
    return () => { vigente = false; };
  }, [lectura.codigo]);

  const opcionesCentro = useMemo(() => centros.filter((c) => c.nombre && c.estado !== 'INACTIVO').sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')), [centros]);
  const adv = kit ? advertenciasKit(kit.lineas, hoy) : { vencidas: [], sinVencimiento: [] };
  const conAdvertencias = adv.vencidas.length + adv.sinVencimiento.length > 0;
  const version = kit ? versionKit(kit) : null;
  const desactualizada = kit && lectura.version !== version;
  const estado = kit ? estadoKit(kit) : null;
  const bloqueo = !puede ? 'No tienes permiso para despachar kits.'
    : kit === null ? `No existe un kit con el ID ${lectura.codigo}.`
      : desactualizada ? `La hoja escaneada es la versión ${lectura.version} del kit ${kit.codigo}, pero su contenido actual es la versión ${version}. Reimprime el PDF desde Armado de Kits y escanea la hoja nueva.`
        : estado && estado !== ESTADOS_KIT.ARMADO ? `El kit ${kit.codigo} está ${ETIQUETAS_ESTADO_KIT[estado].toLowerCase()}: no se puede despachar.`
          : '';
  const listo = kit && !bloqueo && centroId && (!conAdvertencias || aceptaAdvertencias);

  const despachar = async () => {
    setGuardando(true);
    setError('');
    try {
      const r = await gestionarTransitoKit({ accion: 'DESPACHAR', kitId: kit.id, versionImpresa: lectura.version, centroId, observacion, confirmarAdvertencias: aceptaAdvertencias });
      onDespachado(r);
    } catch (e) {
      const motivo = detalleError(e)?.motivo;
      setError(mensajeError(e, 'No se pudo despachar el kit.'));
      // El kit cambió desde que se leyó: se muestra como está ahora.
      if (motivo === 'estado' || motivo === 'version') leerKit(kit.id).then(setKit).catch(() => {});
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="font-app text-tinta-principal fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] flex items-center justify-center p-3" role="dialog" aria-modal="true" aria-label="Despachar kit">
      <div className="w-full max-w-3xl max-h-[92vh] flex flex-col bg-white dark:bg-gray-800 rounded-lg shadow-2xl border border-gray-200 dark:border-gray-700 text-secundario">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-start justify-between">
          <h3 className="text-subtitulo flex items-center gap-1.5"><Truck size={15} /> Despachar kit {kit ? kit.codigo : lectura.codigo}</h3>
          <button type="button" onClick={onCerrar} disabled={guardando} aria-label="Cerrar" className="p-1 rounded-full text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"><X size={16} /></button>
        </div>
        <div className="p-4 overflow-auto flex flex-col gap-3">
          {kit === undefined && !error && <p className="text-tinta-atenuada">Cargando kit…</p>}
          {kit && (
            <p>
              <strong>{kit.codigo}</strong> · {referenciaDeKit(kit)} · {kit.cantidadLineas} insumos · {kit.totalUnidades} unidades · versión {version} · {ETIQUETAS_ESTADO_KIT[estado]}
            </p>
          )}
          {bloqueo && <p className="p-2 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">{bloqueo}</p>}
          {kit && !bloqueo && (
            <>
              <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto max-h-64">
                <TablaBodega columnas={COLUMNAS} anchos={anchos} onResize={handleResize}>
                  {kit.lineas.map((l) => (
                    <FilaBodega key={l.loteId} columnas={COLUMNAS} celdas={{
                      referencia: <td className={`${TD} text-numero-tabla`}>{l.referencia || '—'}</td>,
                      nombre: <td className={`${TD} text-secundario`} title={l.productoNombre}>{l.productoNombre}</td>,
                      lote: <td className={`${TD} text-numero-tabla`}>{etiquetaLote(l.lote)}</td>,
                      vencimiento: <td className={`${TD} text-numero-tabla`}><CeldaVencimiento fecha={l.vencimiento} hoy={hoy} /></td>,
                      cantidad: <td className={`${TD} text-right text-numero-tabla`}>{l.cantidad}</td>,
                    }} />
                  ))}
                </TablaBodega>
              </div>
              {conAdvertencias && (
                <div className="p-2 rounded bg-amber-50 dark:bg-amber-950/30 flex flex-col gap-1">
                  <p>Este kit tiene {adv.vencidas.length} línea(s) vencida(s) y {adv.sinVencimiento.length} sin vencimiento.</p>
                  <label className="flex items-center gap-1.5"><input type="checkbox" checked={aceptaAdvertencias} onChange={(e) => setAceptaAdvertencias(e.target.checked)} /> Revisé las advertencias y quiero despacharlo igual.</label>
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <label className="flex flex-col gap-1">
                  <span className="text-etiqueta">Centro de destino *</span>
                  <select value={centroId} onChange={(e) => setCentroId(e.target.value)} className="h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 w-64">
                    <option value="">Seleccionar…</option>
                    {opcionesCentro.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 flex-1 min-w-48">
                  <span className="text-etiqueta">Observación (opcional)</span>
                  <input value={observacion} onChange={(e) => setObservacion(e.target.value)} maxLength={500} className="h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900" />
                </label>
              </div>
              <p className="text-tinta-secundaria">El kit sale completo. Su stock ya se descontó al armarlo: el despacho no vuelve a descontarlo.</p>
            </>
          )}
          {error && <p className="text-red-600">{error}</p>}
        </div>
        <div className="px-4 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
          <button type="button" onClick={onCerrar} disabled={guardando} className="h-9 px-3 rounded bg-gray-200 dark:bg-gray-700 text-etiqueta">Cancelar</button>
          {kit && !bloqueo && <button type="button" onClick={despachar} disabled={guardando || !listo} className="h-9 px-4 rounded bg-[#2383C2] text-white text-etiqueta disabled:opacity-50">{guardando ? 'Despachando…' : 'Confirmar despacho'}</button>}
        </div>
      </div>
    </div>
  );
};

export default DespachoKitModal;
