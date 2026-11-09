import { useEffect, useState } from 'react';
import { Layers, Plus, RefreshCw, Search } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useColumnasPermitidas } from '../../../../hooks/useColumnasPermitidas';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { FAMILIAS_KIT } from '../../../../../functions/armadoKits/nucleo.mjs';
import { mensajeError } from '../../bodega/shared/bodegaApi';
import { fechaHora } from '../../bodega/shared/transito/transitos';
import { BotonRestablecerAnchos } from '../../../ui/BotonRestablecerAnchos';
import { TablaBodega, FilaBodega, FilaAnchoCompleto } from '../../bodega/shared/TablaBodega';
import { TD_BODEGA as TD, useAnchosTablaBodega } from '../../bodega/shared/anchosTablaBodega';
import { leerKit, leerKits } from './kitsApi';
import { unirPagina } from './lineasKit';
import { Insignia } from './comunes';
import DetalleKit from './DetalleKit';
import FormKitModal from './FormKitModal';

const COLUMNAS = [
  { key: 'codigo', label: 'ID', fija: true, ancho: 110, min: 70 },
  { key: 'referencia', label: 'Referencia', ancho: 210, min: 90 },
  { key: 'insumos', label: 'Insumos', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'unidades', label: 'Unidades', alinear: 'text-right', ancho: 80, min: 55 },
  { key: 'fecha', label: 'Fecha de creación', ancho: 140, min: 90 },
  { key: 'avisos', label: 'Avisos', ancho: 190, min: 90 },
];

const ESPERA_BUSQUEDA_MS = 350;

// Listado de kits de una familia: filtro por referencia, búsqueda por ID y
// detalle. Lee de a una página; cada tipo de kit monta esta misma pantalla.
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
  // Cada referencia equivale a un tipo: el filtro usa el índice de tipo.
  const tipo = config.referencias[referencia]?.tipo || '';
  const [creando, setCreando] = useState(false);

  // Espera a que se termine de escribir: cada búsqueda es una consulta.
  useEffect(() => {
    const id = setTimeout(() => setCodigo(texto.trim()), ESPERA_BUSQUEDA_MS);
    return () => clearTimeout(id);
  }, [texto]);

  useEffect(() => {
    let vigente = true;
    leerKits({ familia, tipo, codigo })
      .then((r) => { if (vigente) { setKits(r.kits); setPagina({ cursor: r.cursor, hayMas: r.hayMas }); } })
      .catch((e) => { if (vigente) { setKits([]); showToast(mensajeError(e, 'No se pudieron leer los kits.'), 'error'); } });
    return () => { vigente = false; };
  }, [familia, tipo, codigo, version, showToast]);

  const recargar = () => { setKits(null); setVersion((v) => v + 1); };

  const cargarMas = async () => {
    setCargandoMas(true);
    try {
      const r = await leerKits({ familia, tipo, codigo, cursor: pagina.cursor });
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
              {Object.entries(config.referencias).map(([k, r]) => <option key={k} value={k}>{r.etiqueta}</option>)}
            </select>
            <button type="button" onClick={recargar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1 text-tinta-secundaria"><RefreshCw size={12} /> Actualizar</button>
            {hasPermission(ruta, 'kits', 'btn_crear') && (
              <button type="button" onClick={() => setCreando(true)} className="h-7 px-2 rounded bg-[#2383C2] text-white text-etiqueta flex items-center gap-1"><Plus size={12} /> Nuevo kit</button>
            )}
          </div>
        )}
      </div>
      <div className="flex-1 overflow-auto p-3">
        {abierto ? (
          <DetalleKit
            key={abierto.id} kit={abierto} familia={familia}
            onVolver={() => setAbierto(null)} onCambio={() => refrescarAbierto()}
            onEliminado={() => { setAbierto(null); recargar(); }}
          />
        ) : kits === null ? (
          <p className="text-tinta-atenuada">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex justify-end"><BotonRestablecerAnchos onClick={restablecerAnchos} personalizados={personalizados} /></div>
            <div className="border border-gray-200 dark:border-gray-700 rounded overflow-auto">
              <TablaBodega columnas={columnasVisibles} anchos={anchos} onResize={handleResize}>
                {kits.length === 0 && <FilaAnchoCompleto columnas={columnasVisibles}>No hay kits.</FilaAnchoCompleto>}
                {kits.map((k) => (
                  <FilaBodega key={k.id} columnas={columnasVisibles} className="cursor-pointer" onClick={() => setAbierto(k)} celdas={{
                    codigo: <td className={`${TD} text-etiqueta text-[#2383C2] underline-offset-2 group-hover:underline`} title={k.codigo}>{k.codigo}</td>,
                    referencia: <td className={`${TD} text-secundario`}>{config.referencias[k.referencia]?.etiqueta || k.referencia}</td>,
                    insumos: <td className={`${TD} text-right text-numero-tabla`}>{k.cantidadLineas || 0}</td>,
                    unidades: <td className={`${TD} text-right text-numero-tabla`}>{k.totalUnidades || 0}</td>,
                    fecha: <td className={`${TD} text-numero-tabla`}>{fechaHora(k.creadoEn)}</td>,
                    avisos: <td className={TD}>{k.lineasSinVencimiento > 0 && <Insignia color="ambar">Con insumos sin vencimiento ({k.lineasSinVencimiento})</Insignia>}</td>,
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
      {creando && <FormKitModal familia={familia} onCerrar={() => setCreando(false)} onGuardado={(id) => { setCreando(false); recargar(); refrescarAbierto(id); }} />}
    </div>
  );
};

export default PantallaKits;
