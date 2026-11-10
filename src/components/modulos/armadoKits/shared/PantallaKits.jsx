import { useEffect, useState } from 'react';
import { Layers, Plus, RefreshCw, Search, ListFilter } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import {
  FAMILIAS_KIT, ETIQUETAS_ESTADO_KIT, ESTADOS_KIT_POR_DEFECTO, ORDEN_ESTADOS_KIT, estadoKit,
} from '../../../../../functions/armadoKits/nucleo.mjs';
import { textoFiltroEstado, avisosKit } from './listadoKits';
import { mensajeError } from '../../bodega/shared/bodegaApi';
import { fechaHora } from '../../bodega/shared/transito/transitos';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../bodega/shared/anchosTablaBodega';
import { leerKit, leerKits } from './kitsApi';
import { useConfiguracionKits } from './useConfiguracionKits';
import { claveVariante, etiquetaModeloKit, modelosDisponibles, modeloDeReferencia } from '../../../../../functions/armadoKits/receta.mjs';
import { unirPagina } from './lineasKit';
import { Insignia, InsigniaEstado } from './comunes';
import DetalleKit from './DetalleKit';
import FormKitModal from './FormKitModal';

const COLUMNAS = [
  { key: 'codigo', label: 'ID', fija: true, ancho: 110, min: 70 },
  { key: 'referencia', label: 'Referencia', ancho: 210, min: 90 },
  { key: 'insumos', label: 'Insumos', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'unidades', label: 'Unidades', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'fecha', label: 'Fecha de creación', ancho: 140, min: 90 },
  { key: 'estado', label: 'Estado', ancho: 110, min: 70 },
  { key: 'avisos', label: 'Avisos', ancho: 190, min: 90 },
];

const ESPERA_BUSQUEDA_MS = 350;

// Listado de kits de una familia: filtros por estado (por defecto Armado y En
// tránsito; los cerrados quedan como historial), "Con reposición pendiente",
// referencia y búsqueda por ID, y detalle. Lee de a una página (sin listener):
// se relee al volver a la pestaña, y el detalle relee su kit al abrirse.
// Cada tipo de kit monta esta misma pantalla.
const PantallaKits = ({ familia }) => {
  const config = FAMILIAS_KIT[familia];
  const ruta = config.ruta;
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const { columnasVisibles } = useColumnasPermitidas(ruta, 'kits', COLUMNAS);
  const { anchos, handleResize, restablecerAnchos, personalizados } = useAnchosTablaBodega(columnasVisibles, `kits.${familia}`);
  const [kits, setKits] = useState(null);
  const [pagina, setPagina] = useState({ cursor: null, hayMas: false });
  const [cargandoMas, setCargandoMas] = useState(false);
  const [referencia, setReferencia] = useState('');
  const [texto, setTexto] = useState('');
  const [codigo, setCodigo] = useState('');
  const [version, setVersion] = useState(0);
  const [abierto, setAbierto] = useState(null);
  // Cada referencia de kit es un modelo con su propio tipo (género + vaina): el filtro usa el índice de tipo.
  const { config: receta } = useConfiguracionKits(familia);
  const modeloFiltro = modeloDeReferencia(receta, referencia);
  const tipo = modeloFiltro ? claveVariante(modeloFiltro.genero, modeloFiltro.vaina) : '';
  const hayModelos = modelosDisponibles(receta).length > 0;
  const [creando, setCreando] = useState(false);
  // Kit cerrado que se rearma (abre "Nuevo kit" con su modelo).
  const [rearmando, setRearmando] = useState(null);
  const [estados, setEstados] = useState(() => [...ESTADOS_KIT_POR_DEFECTO]);
  const [pendiente, setPendiente] = useState(false);
  const sinEstados = !pendiente && estados.length === 0;
  // Kit recién creado: su detalle ofrece la hoja con el código de barras.
  const [pdfAlAbrir, setPdfAlAbrir] = useState(null);
  const alternarEstado = (e) => { setPendiente(false); setEstados((lista) => (lista.includes(e) ? lista.filter((x) => x !== e) : [...lista, e])); };

  // Espera a que se termine de escribir: cada búsqueda es una consulta.
  useEffect(() => {
    const id = setTimeout(() => setCodigo(texto.trim()), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(id);
  }, [texto]);

  const claveEstados = [...estados].sort().join(',');
  useEffect(() => {
    let vigente = true;
    if (sinEstados) return () => { vigente = false; };
    leerKits({ familia, tipo, codigo, estados: claveEstados ? claveEstados.split(',') : [], pendiente })
      .then((r) => { if (vigente) { setKits(r.kits); setPagina({ cursor: r.cursor, hayMas: r.hayMas }); } })
      .catch((e) => { if (vigente) { setKits([]); showToast(mensajeError(e, 'No se pudieron leer los kits.'), 'error'); } });
    return () => { vigente = false; };
  }, [familia, tipo, codigo, claveEstados, pendiente, sinEstados, version, showToast]);

  const recargar = () => { setKits(null); setVersion((v) => v + 1); };

  // Al volver a la pestaña (otro usuario o Bodega pudo cambiar un kit): relee
  // el listado o, con un detalle abierto, ese kit. Sin listener de Firestore.
  const abiertoId = abierto?.id || null;
  useEffect(() => {
    const alVolver = () => {
      if (document.visibilityState !== 'visible') return;
      if (!abiertoId) { setVersion((v) => v + 1); return; }
      leerKit(abiertoId)
        .then((k) => { setAbierto(k); if (k) setKits((lista) => (lista || []).map((x) => (x.id === k.id ? k : x))); })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => document.removeEventListener('visibilitychange', alVolver);
  }, [abiertoId]);

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const r = await leerKits({ familia, tipo, codigo, estados, pendiente, cursor: pagina.cursor });
      setKits((actuales) => unirPagina(actuales || [], r.kits));
      setPagina({ cursor: r.cursor, hayMas: r.hayMas });
    } catch (e) {
      showToast(mensajeError(e, 'No se pudieron leer los kits.'), 'error');
    } finally {
      setCargandoMas(false);
    }
  };

  // Tras un cambio: relee solo ese kit (1 lectura).
  const refrescarAbierto = async (id = abierto?.id) => {
    try {
      const kit = await leerKit(id);
      setAbierto(kit);
      if (kit) setKits((lista) => (lista || []).map((k) => (k.id === kit.id ? kit : k)));
    } catch (e) {
      showToast(mensajeError(e), 'error');
    }
  };
  // Abrir el detalle: se muestra lo del listado y se relee el kit (1 lectura),
  // así nunca queda el estado de una lectura anterior.
  const abrir = (k) => { setAbierto(k); refrescarAbierto(k.id); };

  return (
    <div className="font-app text-tinta-principal w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-secundario">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion flex items-center gap-1.5"><Layers size={14} className="text-[#2383C2]" /> {config.etiqueta}</h2>
        {!abierto && (
          <div className="flex flex-wrap items-center gap-1.5">
            <div className="relative">
              <Search className="absolute left-1.5 top-1.5 text-gray-400" size={13} />
              <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Buscar por ID…" aria-label="Buscar por ID" className="h-7 pl-6 pr-2 w-44 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2]" />
            </div>
            <select value={referencia} onChange={(e) => setReferencia(e.target.value)} aria-label="Filtrar por referencia" className="h-7 px-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900">
              <option value="">Todas las referencias</option>
              {(receta?.modelos || []).map((m) => <option key={m.referencia} value={m.referencia}>{m.referencia} - {m.nombre}</option>)}
            </select>
            <details className="relative">
              <summary aria-label="Filtrar por estado" className="h-7 px-2 list-none cursor-pointer border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 flex items-center gap-1 text-etiqueta">
                <ListFilter size={12} /> {textoFiltroEstado(estados, pendiente)}
              </summary>
              <div className="absolute right-0 z-20 mt-1 w-56 p-2 flex flex-col gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg">
                {ORDEN_ESTADOS_KIT.map((e) => (
                  <label key={e} className="flex items-center gap-1.5 text-secundario">
                    <input type="checkbox" checked={!pendiente && estados.includes(e)} onChange={() => alternarEstado(e)} /> {ETIQUETAS_ESTADO_KIT[e]}
                  </label>
                ))}
                <label className="flex items-center gap-1.5 text-secundario border-t border-gray-200 dark:border-gray-700 pt-1">
                  <input type="checkbox" checked={pendiente} onChange={(ev) => setPendiente(ev.target.checked)} /> Con reposición pendiente
                </label>
                <button type="button" onClick={() => { setPendiente(false); setEstados([...ESTADOS_KIT_POR_DEFECTO]); }} className="text-etiqueta text-[#2383C2] text-left">Volver a Armado y En tránsito</button>
              </div>
            </details>
            <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1 text-tinta-secundaria"><RefreshCw size={12} /> Actualizar</button>
            {hasPermission(ruta, 'kits', 'btn_crear') && (
              <button type="button" onClick={() => setCreando(true)} disabled={!hayModelos} title={hayModelos ? '' : 'No hay modelos activos y completos: revisa Configuración Flexibles'} className="disabled:opacity-50 h-7 px-2 rounded bg-[#2383C2] text-white text-etiqueta flex items-center gap-1"><Plus size={12} /> Nuevo kit</button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {abierto ? (
          <DetalleKit
            key={abierto.id} kit={abierto} familia={familia} ofrecerPdf={pdfAlAbrir === abierto.id} onPdfOfrecido={() => setPdfAlAbrir(null)}
            onVolver={() => setAbierto(null)} onCambio={() => refrescarAbierto()}
            onEliminado={() => { setAbierto(null); recargar(); }}
            onRearmar={(k) => setRearmando(k)}
          />
        ) : sinEstados ? (
          <p className="text-tinta-atenuada">Elige al menos un estado en el filtro.</p>
        ) : kits === null ? (
          <p className="text-tinta-atenuada">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
            <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
              <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
                {kits.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>No hay kits con estos filtros.</FilaAnchoCompleto>}
                {kits.map((k) => (
                  <FilaBodega key={k.id} columnas={columnasVisibles} className="cursor-pointer" onClick={() => abrir(k)} celdas={{
                    codigo: <td className={`${TD} text-etiqueta text-[#2383C2] underline-offset-2 group-hover:underline`} title={k.codigo}>{k.codigo}</td>,
                    referencia: <td className={`${TD} text-secundario`}>{etiquetaModeloKit(k)}</td>,
                    insumos: <td className={`${TD} text-right text-numero-tabla`}>{k.cantidadLineas || 0}</td>,
                    unidades: <td className={`${TD} text-right text-numero-tabla`}>{k.totalUnidades || 0}</td>,
                    fecha: <td className={`${TD} text-numero-tabla`}>{fechaHora(k.creadoEn)}</td>,
                    estado: <td className={TD}><InsigniaEstado estado={estadoKit(k)} etiqueta={ETIQUETAS_ESTADO_KIT[estadoKit(k)]} /></td>,
                    avisos: <td className={TD}><span className="inline-flex flex-wrap gap-1">{avisosKit(k).map((a) => <Insignia key={a.texto} color={a.color}>{a.texto}</Insignia>)}</span></td>,
                  }} />
                ))}
              </TablaBodega>
            </div>
            {pagina.hayMas && (
              <div className="flex justify-center">
                <button type="button" onClick={cargarMas} disabled={cargandoMas} className="h-7 px-3 rounded border border-gray-300 dark:border-gray-600 text-etiqueta text-tinta-secundaria disabled:opacity-50">{cargandoMas ? 'Cargando…' : 'Cargar más'}</button>
              </div>
            )}
          </div>
        )}
      </div>
      {creando && <FormKitModal familia={familia} onCerrar={() => setCreando(false)} onGuardado={(id) => { setCreando(false); setPdfAlAbrir(id); recargar(); refrescarAbierto(id); }} />}
      {rearmando && <FormKitModal familia={familia} rearmarDe={rearmando} onCerrar={() => setRearmando(null)} onGuardado={(id) => { setRearmando(null); setPdfAlAbrir(id); recargar(); refrescarAbierto(id); }} />}
    </div>
  );
};

export default PantallaKits;
