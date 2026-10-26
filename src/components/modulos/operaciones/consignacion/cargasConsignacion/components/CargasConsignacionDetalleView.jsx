import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { collectionGroup, query, where, onSnapshot, updateDoc } from 'firebase/firestore';
import { db } from '../../../../../../firebaseConfig';
import { ArrowLeft, ListFilter, Info, Truck, UploadCloud, Save, AlertTriangle, X, Loader2, ShieldAlert, History, ClipboardList } from 'lucide-react';
import { useToast } from '../../../../../../context/ToastContext';
import { useGranularPermission } from '../../../../../../hooks/useGranularPermission';
import { useUser } from '../../../../../../context/UserContext';
import { registrarLogConsignacion } from '../../utils/registrarLogConsignacion';
import { camposPrecio, costoMaestroDe } from '../../utils/precioEspecial';
import { periodoEstaAbierto } from './verificacionPeriodoConsignacion';

import DetalleTab from './DetalleTab';
import InformacionTab from './InformacionTab';
import DeliveryTab from './DeliveryTab';
import CargasTab from './CargasTab';
import HistorialTab from './HistorialTab';
import { OrdenTab } from '../../../shared/ordenesOC/OrdenTab';
import { leerRegistroPdfOC } from '../../../shared/ordenesOC/registroPdfOC';
import { bloquesOCConsignacion } from '../../../shared/ocIndex/indiceOC';

const COL_BASE = 'consignacion_registros';
const NOMBRE_SUBCOL_DETALLES = 'detalles';

// Cada pestaña es un `proceso` propio (path independiente) del
// componentMap de la pantalla contenedora (ver
// src/config/componentMaps/consignacion.js) — su visibilidad se decide por
// existencia con hasAccesoProceso(path), no por un checkbox maestro de
// sección compartido entre las 4 (ver nota de useGranularPermission.js).
const ALL_TABS = [
  { id: 'detalle', label: 'Detalle', Icon: ListFilter, path: '/consignacion/cargasConsignacion/detalle' },
  { id: 'informacion', label: 'Información', Icon: Info, path: '/consignacion/cargasConsignacion/informacion' },
  { id: 'delivery', label: 'Delivery', Icon: Truck, path: '/consignacion/cargasConsignacion/delivery' },
  { id: 'cargas', label: 'Cargas', Icon: UploadCloud, path: '/consignacion/cargasConsignacion/cargas' },
  { id: 'orden', label: 'Orden', Icon: ClipboardList, path: '/consignacion/cargasConsignacion/orden' },
  { id: 'logs', label: 'Logs', Icon: History, path: '/consignacion/cargasConsignacion/logs' },
];

const construirEstadoInicial = (registro) => ({
  nombre: registro?.nombre || '',
  medico: registro?.medico || '',
  fecha: registro?.fecha || '',
  empresa: registro?.empresa || '',
  centro: registro?.centro || '',
  atributo: registro?.atributo || '',
  costo: registro?.costo ?? '',
  convenio: registro?.convenio || '',
  prevision: registro?.prevision || '',
  descripcionPabellon: registro?.descripcionPabellon || '',

  delivery: registro?.delivery || '',

  numeroGuiaVinculada: registro?.numeroGuiaVinculada || '',
  fechaEmisionGuiaVinculada: registro?.fechaEmisionGuiaVinculada || '',
  loteGuiaVinculado: registro?.loteGuiaVinculado || '',
  vencimientoGuiaVinculado: registro?.vencimientoGuiaVinculado || '',
  codigoMaestroVinculado: registro?.codigoMaestroVinculado || '',
  descripcionMaestroVinculado: registro?.descripcionMaestroVinculado || '',
  tipoMaestroVinculado: registro?.tipoMaestroVinculado || '',
  deliveryVinculado: registro?.deliveryVinculado || false,
  vinculoIncompleto: registro?.vinculoIncompleto || false,
  fechaVinculacionDelivery: registro?.fechaVinculacionDelivery || null
});

const CargasConsignacionDetalleView = ({ registro, onVolver, setCargando }) => {
  const { showToast } = useToast();
  const { userData } = useUser();
  const { hasAccesoProceso } = useGranularPermission();
  const tabsPermitidas = useMemo(
    () => ALL_TABS.filter(t => hasAccesoProceso(t.path)),
    [hasAccesoProceso]
  );

  const [activeTab, setActiveTab] = useState(() => tabsPermitidas[0]?.id || null);

  // Fuente de verdad de qué pestaña se muestra: si `activeTab` quedó en un
  // id sin permiso, cae al primer tab permitido — todo el render de abajo
  // usa `tabActual`, nunca el `activeTab` crudo.
  const tabActual = useMemo(
    () => tabsPermitidas.find(t => t.id === activeTab) || tabsPermitidas[0] || null,
    [tabsPermitidas, activeTab]
  );

  const [formData, setFormData] = useState(() => construirEstadoInicial(registro));
  const snapshotInicialRef = useRef(JSON.stringify(construirEstadoInicial(registro)));

  const informacionTabRef = useRef(null);
  const [guardando, setGuardando] = useState(false);
  const [showConfirmSalir, setShowConfirmSalir] = useState(false);

  const hayCambios = JSON.stringify(formData) !== snapshotInicialRef.current;

  const [itemsDeEstaAdmision, setItemsDeEstaAdmision] = useState(registro ? [registro] : []);
  // Copias para leer al volver (siempre lo último, aunque el render no se
  // haya actualizado aún): filas de la admisión y lo guardado en Información.
  const itemsRef = useRef(itemsDeEstaAdmision);
  const cambiosGuardadosRef = useRef({});
  useEffect(() => { itemsRef.current = itemsDeEstaAdmision; }, [itemsDeEstaAdmision]);
  const [cargandoItems, setCargandoItems] = useState(false);

  useEffect(() => {
    if (!registro?.gestionId) {
      setItemsDeEstaAdmision(registro ? [registro] : []);
      setCargandoItems(false);
      return;
    }

    setCargandoItems(true);
    const q = query(
      collectionGroup(db, NOMBRE_SUBCOL_DETALLES),
      where('gestionId', '==', registro.gestionId)
    );

    // onSnapshot (en vez de un getDocs de una sola vez) para que cambios como
    // el checkbox "Cargado" (que escribe directo a Firestore desde CargasTab)
    // se reflejen de inmediato: el caché local de Firestore dispara este
    // listener apenas se hace el updateDoc, sin esperar la confirmación del
    // servidor.
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const items = snap.docs
          .filter((d) => d.ref.path.startsWith(`${COL_BASE}/`))
          .map((d) => ({ id: d.id, ref: d.ref, ...d.data() }));
        setItemsDeEstaAdmision(items.length > 0 ? items : [registro]);
        setCargandoItems(false);
      },
      (err) => {
        console.error('Error al escuchar los ítems de la admisión:', err);
        setItemsDeEstaAdmision([registro]);
        setCargandoItems(false);
      }
    );

    return () => unsubscribe();
  }, [registro]);

  const registroParaDelivery = useMemo(() => {
    if (!registro) return registro;
    if ((registro.delivery || '').trim()) return registro;
    const conDelivery = itemsDeEstaAdmision.find(it => (it.delivery || '').trim());
    if (!conDelivery) return registro;
    return { ...registro, delivery: conDelivery.delivery };
  }, [registro, itemsDeEstaAdmision]);

  // Pestaña Orden: OC (campo `orden`, ver Sincronizar OC) por empresa + fecha
  // de la admisión, desde los ítems ya escuchados (sin lecturas propias).
  const ordenAdmision = useMemo(() => bloquesOCConsignacion(itemsDeEstaAdmision), [itemsDeEstaAdmision]);

  // Registro de PDF de OC: 1 lectura, la primera vez que se abre Orden.
  const [registroPdfOC, setRegistroPdfOC] = useState(null); // { pdfs, error }
  const registroPdfSolicitadoRef = useRef(false);
  const cargarRegistroPdfOC = useCallback(() => {
    registroPdfSolicitadoRef.current = true;
    leerRegistroPdfOC()
      .then(pdfs => setRegistroPdfOC({ pdfs, error: null }))
      .catch(err => {
        console.error('Error al leer el registro de PDF de OC:', err);
        setRegistroPdfOC({ pdfs: {}, error: 'No se pudo cargar qué OC tienen PDF.' });
      });
  }, []);
  useEffect(() => {
    if (tabActual?.id !== 'orden' || registroPdfSolicitadoRef.current) return;
    cargarRegistroPdfOC();
  }, [tabActual?.id, cargarRegistroPdfOC]);

  const handleCopiarTexto = (texto) => {
    navigator.clipboard?.writeText(texto)
      .then(() => showToast(`Copiado: ${texto}`, 'success'))
      .catch(() => showToast('No se pudo copiar', 'error'));
  };

  const deliveryEsHeredado = Boolean(
    registro && !(registro.delivery || '').trim() && (registroParaDelivery?.delivery || '').trim()
  );

  useEffect(() => {
    const handleBeforeUnload = (e) => {
      if (hayCambios) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hayCambios]);

  const handleFieldChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleVincularDelivery = (datosVinculo) => {
    setFormData(prev => ({ ...prev, ...datosVinculo }));
    showToast('Vínculo preparado. Presiona "Guardar Cambios" para guardarlo.', 'info');
  };

  const handleGuardarCambios = async () => {
    if (!registro?.ref) {
      showToast('No se encontró la referencia del registro', 'error');
      return false;
    }
    // Candado de Información (ítem SOLICITADO/imputado, desbloqueado a
    // propósito): re-verificar que su período siga abierto antes de guardar.
    const itemDesbloqueado = informacionTabRef.current?.itemDesbloqueado?.();
    if (itemDesbloqueado) {
      const abierto = await periodoEstaAbierto(itemDesbloqueado.periodoAnio, itemDesbloqueado.periodoMes);
      if (!abierto) {
        showToast('No se guardó: el período de este ítem ya fue cerrado mientras lo editabas.', 'error');
        return false;
      }
    }
    setGuardando(true);
    try {
      const costoNum = formData.costo !== '' ? Number(formData.costo) : 0;
      // Si se cambió el precio a mano, queda como precio especial (con el
      // precio del maestro), igual que al editarlo en la pestaña Cargas.
      const precio = costoNum !== Number(registro.costo) && costoNum > 0
        ? camposPrecio(costoNum, costoMaestroDe(registro))
        : {};
      const datosGuardados = {
        ...formData,
        costo: costoNum,
        ...precio
      };
      await updateDoc(registro.ref, datosGuardados);
      cambiosGuardadosRef.current = { ...cambiosGuardadosRef.current, ...datosGuardados };
      await registrarLogConsignacion(registro.ref, 'EDICION', datosGuardados, userData);
      snapshotInicialRef.current = JSON.stringify(formData);
      showToast('Cambios guardados correctamente', 'success');
      return true;
    } catch (error) {
      console.error('Error al guardar cambios:', error);
      showToast('Error al guardar los cambios', 'error');
      return false;
    } finally {
      setGuardando(false);
    }
  };

  // Filas que se devuelven a la tabla al volver: las de la admisión (en
  // vivo) con lo guardado en Información aplicado al registro abierto (el
  // listener puede no haberlo entregado aún, o no existir si no hay Admisión).
  const volver = () => {
    const cambios = cambiosGuardadosRef.current;
    const items = itemsRef.current;
    const ruta = registro?.ref?.path;
    const conCambios = items.map((it) => (it.ref?.path === ruta ? { ...it, ...cambios } : it));
    if (registro && !items.some((it) => it.ref?.path === ruta)) conCambios.push({ ...registro, ...cambios });
    onVolver(conCambios);
  };

  const handleIntentarVolver = () => {
    if (hayCambios) {
      setShowConfirmSalir(true);
    } else {
      volver();
    }
  };

  const handleGuardarYSalir = async () => {
    const ok = await handleGuardarCambios();
    setShowConfirmSalir(false);
    if (ok) volver();
  };

  const handleSalirSinGuardar = () => {
    setShowConfirmSalir(false);
    volver();
  };

  return (
    <div className="flex-grow flex flex-col bg-slate-50/50 dark:bg-gray-900 overflow-hidden text-[10px] relative">

      {showConfirmSalir && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px]">
          <div className="bg-white dark:bg-gray-800 w-full max-w-sm rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex items-center gap-2 bg-amber-50/60 dark:bg-amber-950/20">
              <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
              <h3 className="text-[12px] font-bold text-gray-800 dark:text-gray-100">Cambios sin guardar</h3>
              <button
                onClick={() => setShowConfirmSalir(false)}
                className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition"
              >
                <X size={15} />
              </button>
            </div>

            <div className="px-4 py-3">
              <p className="text-[11px] text-gray-600 dark:text-gray-300">
                Tienes modificaciones en Información y/o Delivery que no se han guardado. ¿Qué deseas hacer antes de salir?
              </p>
            </div>

            <div className="px-4 py-3 bg-gray-50/60 dark:bg-gray-900/40 border-t border-gray-100 dark:border-gray-700 flex flex-col gap-2">
              <button
                onClick={handleGuardarYSalir}
                disabled={guardando}
                className="w-full h-8 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center justify-center gap-1.5 transition text-[11px] disabled:opacity-60"
              >
                {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Guardar y salir
              </button>
              <button
                onClick={handleSalirSinGuardar}
                className="w-full h-8 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/50 text-red-600 dark:text-red-400 rounded font-semibold transition text-[11px]"
              >
                Salir sin guardar
              </button>
              <button
                onClick={() => setShowConfirmSalir(false)}
                className="w-full h-8 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 font-medium transition text-[11px]"
              >
                Seguir editando
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="shrink-0 flex items-center gap-2 px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <button
          onClick={handleIntentarVolver}
          className="p-1 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition shadow-xs"
          title="Volver al listado"
        >
          <ArrowLeft size={13} />
        </button>
        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-gray-400">
          Gestión de Consignación
        </span>
        <span className="text-slate-300 dark:text-gray-600">/</span>
        <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[9px] bg-blue-50 dark:bg-blue-950/50 text-[#2383C2] dark:text-blue-400 border border-blue-200/60 dark:border-blue-800/40 font-bold">
          #{registro?.gestionId || 'N/A'}
        </span>

        {cargandoItems && (
          <span className="flex items-center gap-1 text-[9px] text-slate-400 dark:text-gray-500">
            <Loader2 size={11} className="animate-spin" /> Cargando ítems...
          </span>
        )}

        {hayCambios && (
          <button
            onClick={handleGuardarCambios}
            disabled={guardando}
            className="ml-auto h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded font-semibold flex items-center gap-1.5 transition text-[11px] shadow-xs active:scale-[0.98] disabled:opacity-60"
          >
            {guardando ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
            {guardando ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        )}
      </div>

      <div className="flex-grow flex overflow-hidden">
        <div className="w-36 shrink-0 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 flex flex-col">
          <div className="p-2 border-b border-slate-200 dark:border-gray-700">
            <h2 className="text-[10px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
              Menú de Opción
            </h2>
          </div>

          {tabsPermitidas.length === 0 ? (
            <div className="p-2.5 text-[10px] text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
              <ShieldAlert size={13} className="shrink-0 mt-0.5" />
              Sin pestañas habilitadas para su perfil.
            </div>
          ) : (
            <div className="p-1.5 space-y-1">
              {tabsPermitidas.map((tab) => {
                const TabIcon = tab.Icon;
                const isActive = tabActual?.id === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md font-medium transition text-left ${isActive
                      ? 'bg-[#2383C2]/10 text-[#2383C2] dark:bg-blue-950/50 dark:text-blue-400 font-semibold'
                      : 'text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700/50'
                      }`}
                  >
                    <TabIcon size={13} />
                    <span className="truncate">{tab.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex-grow flex flex-col overflow-auto">
          {!tabActual && (
            <div className="flex-grow flex flex-col items-center justify-center text-center p-6 text-slate-500 dark:text-gray-400 text-[10px] gap-1.5">
              <ShieldAlert size={22} className="text-amber-500" />
              Su perfil no tiene acceso a ninguna pestaña de esta vista de detalle.
            </div>
          )}

          {tabActual?.id === 'detalle' && <DetalleTab registro={registro} items={itemsDeEstaAdmision} />}

          {tabActual?.id === 'informacion' && (
            <InformacionTab ref={informacionTabRef} registro={registro} items={itemsDeEstaAdmision} formData={formData} onChange={handleFieldChange} />
          )}

          {tabActual?.id === 'delivery' && (
            <DeliveryTab
              registro={registroParaDelivery}
              vinculoData={formData}
              onVincular={handleVincularDelivery}
              deliveryEsHeredado={deliveryEsHeredado}
            />
          )}

          {tabActual?.id === 'cargas' && (
            <CargasTab
              registro={registro}
              items={itemsDeEstaAdmision}
              formData={formData}
              onChange={handleFieldChange}
              setCargando={setCargando}
            />
          )}

          {/* Solo ver/descargar el PDF: subirlo es de Documentos/Implantes
              (storage.rules), así que aquí no se ofrece. */}
          {tabActual?.id === 'orden' && (
            <OrdenTab
              bloques={ordenAdmision.bloques}
              ocsPorBloque={ordenAdmision.ocsPorBloque}
              handleCopiarTexto={handleCopiarTexto}
              registroPdf={registroPdfOC}
              onRecargarRegistroPdf={() => { setRegistroPdfOC(null); cargarRegistroPdfOC(); }}
              puedeSubirPdf={false}
              textoPendiente='Pendiente — aún no hay OC asignadas a esta admisión (usa "Sincronizar OC" en la barra de Cargas de Consignación).'
            />
          )}

          {tabActual?.id === 'logs' && <HistorialTab registro={registro} />}
        </div>
      </div>
    </div>
  );
};

export default CargasConsignacionDetalleView;