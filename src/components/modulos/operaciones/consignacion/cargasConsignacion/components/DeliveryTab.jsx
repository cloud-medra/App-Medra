import React, { useEffect, useMemo, useState } from 'react';
import { updateDoc } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig'; 
import { Truck, AlertCircle, CheckCircle2, Package, Loader2, Link2, Save, RefreshCw } from 'lucide-react';
import { resolverGuiaCacheada, resolverMaestrosCacheados } from './cacheDelivery';

const formatearFecha = (fechaISO) => {
  if (!fechaISO) return 'N/A';
  const partes = fechaISO.split('-');
  if (partes.length !== 3) return fechaISO;
  const [y, m, d] = partes;
  return `${d}-${m}-${y}`;
};

const DeliveryTab = ({ registro, vinculoData, onVincular, deliveryEsHeredado = false }) => {
  const deliveryValor = (registro?.delivery || '').trim();
  const referenciaRegistro = (registro?.referencia || '').trim();

  const [cargandoGuia, setCargandoGuia] = useState(false);
  const [guiaEncontrada, setGuiaEncontrada] = useState(null);
  const [error, setError] = useState('');

  const [vinculosCodigos, setVinculosCodigos] = useState({});
  const [cargandoVinculos, setCargandoVinculos] = useState(false);

  const [guardando, setGuardando] = useState(false);
  const [errorGuardado, setErrorGuardado] = useState('');

  const cargarGuia = async (forzar = false) => {
    if (!deliveryValor) {
      setGuiaEncontrada(null);
      setError('');
      return;
    }
    setCargandoGuia(true);
    setError('');
    try {
      const guia = await resolverGuiaCacheada(db, deliveryValor, forzar);
      setGuiaEncontrada(guia);
      if (!guia) setError('');
    } catch (err) {
      console.error('Error al buscar guía por N° Documento:', err);
      setError('No se pudo buscar la guía. Intenta nuevamente.');
    } finally {
      setCargandoGuia(false);
    }
  };

  useEffect(() => {
    cargarGuia(false);
  }, [deliveryValor]);

  const productosVisibles = guiaEncontrada?.productos || [];

  useEffect(() => {
    const referenciasUnicas = [...new Set(productosVisibles.map(p => (p.codigo || '').trim()).filter(Boolean))];

    if (referenciasUnicas.length === 0) {
      setVinculosCodigos({});
      return;
    }

    let cancelado = false;
    (async () => {
      setCargandoVinculos(true);
      try {
        const mapa = await resolverMaestrosCacheados(db, referenciasUnicas);
        if (!cancelado) setVinculosCodigos(mapa);
      } catch (err) {
        console.error('Error al vincular códigos desde maestros_codigos:', err);
      } finally {
        if (!cancelado) setCargandoVinculos(false);
      }
    })();

    return () => { cancelado = true; };
  }, [guiaEncontrada]);

  const productoCoincidente = productosVisibles.find(
    p => (p.codigo || '').trim() === referenciaRegistro
  );
  const vinculoMaestroCoincidente = productoCoincidente
    ? vinculosCodigos[(productoCoincidente.codigo || '').trim()]
    : null;

  const yaVinculado = Boolean(vinculoData?.deliveryVinculado);
  const vinculoIncompletoGuardado = Boolean(vinculoData?.vinculoIncompleto);
  const puedeVincular = Boolean(guiaEncontrada) && Boolean(registro?.ref) && !guardando;

  const construirPayload = () => {
    const productosGuiaVinculados = productosVisibles.map(p => {
      const v = vinculosCodigos[(p.codigo || '').trim()];
      return {
        codigo: p.codigo || '',
        descripcion: v?.descripcion || '',
        empresa: v?.empresa || '',
        tipo: v?.tipo || '',
        lote: p.lote || '',
        vencimiento: p.vencimiento || '',
        cantidad: p.cantidad ?? null
      };
    });

    const baseDatos = {
      delivery: deliveryValor,
      productosGuiaVinculados
    };

    if (productoCoincidente) {
      return {
        ...baseDatos,
        numeroGuiaVinculada: guiaEncontrada.numeroGuia || '',
        fechaEmisionGuiaVinculada: guiaEncontrada.fechaEmision || '',
        loteGuiaVinculado: productoCoincidente.lote || '',
        vencimientoGuiaVinculado: productoCoincidente.vencimiento || '',
        codigoMaestroVinculado: vinculoMaestroCoincidente?.codigo || '',
        descripcionMaestroVinculado: vinculoMaestroCoincidente?.descripcion || '',
        tipoMaestroVinculado: vinculoMaestroCoincidente?.tipo || '',
        empresaMaestroVinculada: vinculoMaestroCoincidente?.empresa || '',
        deliveryVinculado: true,
        vinculoIncompleto: false,
        fechaVinculacionDelivery: new Date()
      };
    }

    return {
      ...baseDatos,
      numeroGuiaVinculada: guiaEncontrada.numeroGuia || '',
      fechaEmisionGuiaVinculada: guiaEncontrada.fechaEmision || '',
      loteGuiaVinculado: '',
      vencimientoGuiaVinculado: '',
      codigoMaestroVinculado: '',
      descripcionMaestroVinculado: '',
      tipoMaestroVinculado: '',
      empresaMaestroVinculada: '',
      deliveryVinculado: true,
      vinculoIncompleto: true,
      fechaVinculacionDelivery: new Date()
    };
  };

  const handleVincular = async () => {
    if (!guiaEncontrada) return;

    const payload = construirPayload();

    if (!registro?.ref) {
      onVincular && onVincular(payload);
      return;
    }

    setGuardando(true);
    setErrorGuardado('');
    try {
      await updateDoc(registro.ref, payload);
      onVincular && onVincular(payload);
    } catch (err) {
      console.error('Error al guardar el vínculo de Delivery:', err);
      setErrorGuardado('No se pudo guardar el vínculo. Intenta nuevamente.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="px-4 lg:px-6 py-4 w-full max-w-[2200px] mx-auto space-y-4">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
        <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between gap-1.5">
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
            <Truck size={13} className="text-[#2383C2]" />
            Delivery — Admisión #{registro?.gestionId || 'N/A'}
          </span>

          <div className="flex items-center gap-1.5 text-[9px]">
            <span className="font-bold text-slate-400 dark:text-gray-500 uppercase">N° Delivery / Documento:</span>
            <span className="font-num font-semibold text-slate-700 dark:text-gray-200 bg-slate-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
              {deliveryValor || 'Sin asignar'}
            </span>
            {deliveryEsHeredado && deliveryValor && (
              <span className="text-[8px] italic text-slate-400 dark:text-gray-500">
                (tomado de otro ítem de esta admisión)
              </span>
            )}
            {deliveryValor && (
              <button
                type="button"
                onClick={() => cargarGuia(true)}
                disabled={cargandoGuia}
                title="Volver a buscar esta guía (ignora la caché, útil si se acaba de despachar)"
                className="p-0.5 text-slate-400 hover:text-[#2383C2] dark:hover:text-[#2383C2] transition disabled:opacity-40"
              >
                <RefreshCw size={11} className={cargandoGuia ? 'animate-spin' : ''} />
              </button>
            )}
          </div>
        </div>

        <div className="p-3">
          {!deliveryValor && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-gray-400 bg-slate-50 dark:bg-gray-900/40 border border-dashed border-slate-200 dark:border-gray-700 rounded p-3">
              <AlertCircle size={13} className="shrink-0" />
              Este ítem no tiene un N° de Delivery/Documento asignado. Complétalo en Información para poder vincularlo con una guía.
            </div>
          )}

          {deliveryValor && cargandoGuia && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-gray-400 p-3">
              <Loader2 size={13} className="animate-spin" /> Buscando guía con N° Documento {deliveryValor}...
            </div>
          )}

          {deliveryValor && !cargandoGuia && error && (
            <div className="flex items-center gap-2 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded p-3">
              <AlertCircle size={13} className="shrink-0" /> {error}
            </div>
          )}

          {deliveryValor && !cargandoGuia && !error && !guiaEncontrada && (
            <div className="flex items-center gap-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-100 dark:border-amber-900/40 rounded p-3">
              <AlertCircle size={13} className="shrink-0" />
              No se encontró ninguna guía con N° Documento{' '}<strong>{deliveryValor}</strong>. Aún no ha sido despachada o el número no coincide. Si acabas de ingresarla, presiona el ícono de actualizar de arriba.
            </div>
          )}

          {guiaEncontrada && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[10px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-900/40 rounded p-2.5 flex-grow">
                  <CheckCircle2 size={13} className="shrink-0" />
                  Guía encontrada.
                  {yaVinculado && !vinculoIncompletoGuardado && (
                    <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">
                      Vinculado
                    </span>
                  )}
                  {yaVinculado && vinculoIncompletoGuardado && (
                    <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
                      Vinculado (parcial)
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleVincular}
                  disabled={!puedeVincular}
                  title="Vincular esta guía con el registro y guardar de inmediato"
                  className="h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center gap-1.5 transition text-[10px] disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                >
                  {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                  {yaVinculado ? 'Actualizar y guardar vínculo' : 'Vincular y guardar'}
                </button>
              </div>

              {errorGuardado && (
                <div className="flex items-center gap-2 text-[10px] text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded p-2.5">
                  <AlertCircle size={13} className="shrink-0" /> {errorGuardado}
                </div>
              )}

              {yaVinculado && !errorGuardado && (
                <div className="text-[9px] text-slate-500 dark:text-gray-400 italic">
                  Este vínculo ya quedó guardado en la base de datos.
                </div>
              )}

              {!productoCoincidente && (
                <div className="flex items-center gap-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-dashed border-amber-200 dark:border-amber-900/40 rounded p-2.5">
                  <AlertCircle size={13} className="shrink-0" />
                  Ningún producto de esta guía tiene un código que coincida con la referencia de este ítem (<strong>{referenciaRegistro || 'sin referencia'}</strong>). Puedes vincular igual con los datos generales de la guía, pero revisa manualmente el lote/vencimiento/código.
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 text-[10px]">
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">N° Guía</span>
                  <span className="text-slate-700 dark:text-gray-200 font-semibold">{guiaEncontrada.numeroGuia || 'N/A'}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">N° Documento</span>
                  <span className="text-slate-700 dark:text-gray-200">{guiaEncontrada.numeroDocumento || 'N/A'}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">Fecha Emisión</span>
                  <span className="text-slate-700 dark:text-gray-200">{formatearFecha(guiaEncontrada.fechaEmision)}</span>
                </div>
                <div className="flex flex-col gap-0.5">
                  <span className="font-bold text-slate-400 dark:text-gray-500 text-[9px] uppercase">N° Productos</span>
                  <span className="inline-flex items-center gap-1 text-slate-700 dark:text-gray-200 font-semibold">
                    <Package size={11} /> {productosVisibles.length}
                  </span>
                </div>
              </div>

              <div className="border border-slate-200 dark:border-gray-700/80 rounded-lg overflow-hidden">
                <table className="w-full text-left text-[10px] border-collapse">
                  <thead className="bg-slate-50 dark:bg-gray-900/60">
                    <tr className="text-slate-500 dark:text-gray-400 uppercase font-bold text-[9px]">
                      <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Código (Delivery)</th>
                      <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Descripción (Guía)</th>
                      <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Lote</th>
                      <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Vencimiento</th>
                      <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 w-16">Cant.</th>
                      <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-950/20">
                        <span className="flex items-center gap-1"><Link2 size={10} /> Código (Maestro)</span>
                      </th>
                      <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-950/20">Descripción (Maestro)</th>
                      <th className="px-2.5 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-950/20">Empresa</th>
                      <th className="px-2.5 py-1.5 border-b border-slate-200 dark:border-gray-700 bg-blue-50/60 dark:bg-blue-950/20">Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {productosVisibles.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="px-3 py-4 text-center text-slate-400 dark:text-gray-500">
                          Sin productos visibles en esta guía.
                        </td>
                      </tr>
                    ) : (
                      productosVisibles.map((p) => {
                        const esElDeEsteRegistro = productoCoincidente && p.id === productoCoincidente.id;
                        const vinculo = vinculosCodigos[(p.codigo || '').trim()];
                        return (
                          <tr
                            key={p.id}
                            className={`border-t border-slate-100 dark:border-gray-800 ${esElDeEsteRegistro ? 'bg-blue-50/50 dark:bg-blue-950/20' : ''}`}
                            title={esElDeEsteRegistro ? 'Este es el producto que corresponde a este registro' : ''}
                          >
                            <td className="px-2.5 py-1.5 border-r border-slate-100 dark:border-gray-700/60 font-num text-emerald-600 dark:text-emerald-400">
                              <span className="flex items-center gap-1">
                                {esElDeEsteRegistro && <CheckCircle2 size={11} className="text-blue-600 dark:text-blue-400 shrink-0" />}
                                {p.codigo || 'N/A'}
                              </span>
                            </td>
                            <td className="px-2.5 py-1.5 border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300">
                              {p.descripcion || 'N/A'}
                            </td>
                            <td className="px-2.5 py-1.5 border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300">
                              {p.lote || 'N/A'}
                            </td>
                            <td className="px-2.5 py-1.5 border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300">
                              {p.vencimiento || 'N/A'}
                            </td>
                            <td className="px-2.5 py-1.5 border-r border-slate-100 dark:border-gray-700/60 text-slate-600 dark:text-gray-300">
                              {p.cantidad ?? 'N/A'}
                            </td>

                            <td className="px-2.5 py-1.5 border-r border-slate-100 dark:border-gray-700/60 bg-blue-50/30 dark:bg-blue-950/10 font-num text-blue-700 dark:text-blue-400 font-semibold">
                              {cargandoVinculos ? '...' : (vinculo?.codigo || (
                                <span className="text-amber-600 dark:text-amber-400 font-sans font-normal">Sin vincular</span>
                              ))}
                            </td>
                            <td className="px-2.5 py-1.5 border-r border-slate-100 dark:border-gray-700/60 bg-blue-50/30 dark:bg-blue-950/10 text-slate-700 dark:text-gray-200">
                              {cargandoVinculos ? '...' : (vinculo?.descripcion || '-')}
                            </td>
                            <td className="px-2.5 py-1.5 border-r border-slate-100 dark:border-gray-700/60 bg-blue-50/30 dark:bg-blue-950/10 text-slate-700 dark:text-gray-200">
                              {cargandoVinculos ? '...' : (vinculo?.empresa || '-')}
                            </td>
                            <td className="px-2.5 py-1.5 bg-blue-50/30 dark:bg-blue-950/10 text-slate-700 dark:text-gray-200">
                              {cargandoVinculos ? '...' : (vinculo?.tipo || '-')}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeliveryTab;