import { useEffect, useMemo, useState } from 'react';
import { Boxes, Play, History, Flag, Loader2, CheckCircle2, Clock, Circle } from 'lucide-react';
import { useInventarioGeneral } from '../../../../hooks/useInventarioGeneral';
import { cargarCatalogo } from '../../../../stores/catalogosStore';
import { useToast } from '../../../../context/ToastContext';
import { useModal } from '../../../../context/ModalContext';
import { useUser } from '../../../../context/UserContext';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { etiquetaCaja } from '../shared/escaneo/itemsCaja';
import { ESTADOS_CAJA, ESTADOS_INVENTARIO, estadoDeCaja, avanceInventario } from './utils/inventarioFisico';
import {
  escucharInventarioEnCurso, escucharInventario, escucharCajasInventario, iniciarInventario, iniciarOTomarCaja
} from './services/inventarioFisicoService';
import ConteoCaja from './components/ConteoCaja';
import FinalizarInventario from './components/FinalizarInventario';
import HistorialInventarios from './components/HistorialInventarios';
import { TotalesCategorias } from './components/ResumenComparacion';

// Sección del mapa de permisos de Inventario por cajas que habilita
// "Finalizar inventario" (ajusta el stock). Admin y dev siempre pueden.
const PATH_VISTA = '/inventario/inventarioCajas';
const SECCION_FINALIZAR = 'finalizar_inventario';

const INPUT = 'h-8 px-2 border border-gray-300 dark:border-gray-600 rounded text-[12px] outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100';
const hoyISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const nuevaSesion = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `${Date.now()}-${Math.random()}`);

const ESTILO_ESTADO = {
  [ESTADOS_CAJA.PENDIENTE]: { Icon: Circle, clase: 'text-gray-500 bg-gray-100 dark:bg-gray-700 dark:text-gray-300', texto: 'Pendiente' },
  [ESTADOS_CAJA.EN_CONTEO]: { Icon: Clock, clase: 'text-amber-800 bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300', texto: 'En conteo' },
  [ESTADOS_CAJA.FINALIZADA]: { Icon: CheckCircle2, clase: 'text-emerald-800 bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300', texto: 'Finalizada' }
};

// Inventario por cajas: conteo físico caja por caja, guardado en
// inventarios_fisicos a medida que se avanza. El stock solo se ajusta al
// finalizar el inventario completo.
const InventarioPorCajas = () => {
  const { cajas } = useInventarioGeneral();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { hasPermission } = useGranularPermission();
  const puedeFinalizar = hasPermission(PATH_VISTA, SECCION_FINALIZAR);

  const [sesion] = useState(nuevaSesion);
  const [catalogo, setCatalogo] = useState([]);
  const [idEnCurso, setIdEnCurso] = useState(undefined); // undefined = cargando
  const [inventario, setInventario] = useState(null);
  const [docsCajas, setDocsCajas] = useState([]);
  const [vista, setVista] = useState({ tipo: 'panel' }); // panel | caja(cajaId) | finalizar | historial
  const [form, setForm] = useState({ nombre: '', fecha: hoyISO(), conteoCiego: true });
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    cargarCatalogo('codigos').then(setCatalogo).catch((err) => console.error('Error al cargar el maestro:', err));
    return escucharInventarioEnCurso(setIdEnCurso, (err) => {
      console.error('Error al leer el inventario en curso:', err);
      setIdEnCurso(null);
    });
  }, []);

  useEffect(() => {
    if (!idEnCurso) return undefined;
    const quitar1 = escucharInventario(idEnCurso, setInventario, (err) => console.error(err));
    const quitar2 = escucharCajasInventario(idEnCurso, setDocsCajas, (err) => console.error(err));
    return () => { quitar1(); quitar2(); };
  }, [idEnCurso]);

  const inventarioActivo = idEnCurso && inventario?.id === idEnCurso && inventario.estado === ESTADOS_INVENTARIO.EN_CURSO ? inventario : null;
  const cajasOrdenadas = useMemo(
    () => [...cajas].sort((a, b) => etiquetaCaja(a).localeCompare(etiquetaCaja(b), 'es', { numeric: true })),
    [cajas]
  );
  const porId = useMemo(() => new Map((inventarioActivo ? docsCajas : []).map((d) => [d.cajaId || d.id, d])), [docsCajas, inventarioActivo]);
  const avance = avanceInventario(cajasOrdenadas, inventarioActivo ? docsCajas : []);

  const handleIniciar = async () => {
    setOcupado(true);
    try {
      await iniciarInventario({ ...form, usuario: userData });
      showToast('Inventario iniciado', 'success');
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setOcupado(false);
    }
  };

  const abrirCaja = async (caja) => {
    const d = porId.get(caja.id);
    const tomar = async () => {
      setOcupado(true);
      try {
        await iniciarOTomarCaja({ inventarioId: inventarioActivo.id, cajaId: caja.id, usuario: userData, sesion });
        setVista({ tipo: 'caja', cajaId: caja.id });
      } catch (err) {
        showToast(err.message, 'error');
      } finally {
        setOcupado(false);
      }
    };
    if (d?.estado === ESTADOS_CAJA.FINALIZADA || (d?.estado === ESTADOS_CAJA.EN_CONTEO && d.contandoPorSesion === sesion)) {
      setVista({ tipo: 'caja', cajaId: caja.id });
      return;
    }
    if (d?.estado === ESTADOS_CAJA.EN_CONTEO && d.contandoPorSesion) {
      confirmAction(
        'Caja en conteo en otro equipo',
        `${caja.nombreCaja} está en conteo por ${d.contandoPor?.nombre || 'otro usuario'}. Si la retomas aquí, el otro equipo deja de poder guardar su conteo (lo ya guardado se mantiene). ¿Retomarla?`,
        tomar,
        { confirmText: 'Retomar aquí', type: 'warning' }
      );
      return;
    }
    await tomar();
  };

  const contenedor = (contenido) => (
    <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden text-[11px]">
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center gap-2">
        <Boxes size={16} className="text-[#2383C2]" />
        <span className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">Inventario por cajas</span>
      </header>
      <div className="flex-grow min-h-0 flex flex-col">{contenido}</div>
    </div>
  );

  if (idEnCurso === undefined) {
    return contenedor(<div className="flex-grow flex items-center justify-center gap-2 text-gray-400"><Loader2 size={14} className="animate-spin" /> Cargando...</div>);
  }

  if (vista.tipo === 'historial') return contenedor(<HistorialInventarios onVolver={() => setVista({ tipo: 'panel' })} />);

  if (!inventarioActivo) {
    if (idEnCurso && !inventario) {
      return contenedor(<div className="flex-grow flex items-center justify-center gap-2 text-gray-400"><Loader2 size={14} className="animate-spin" /> Cargando inventario...</div>);
    }
    return contenedor(
      <div className="flex-grow min-h-0 overflow-auto p-4 flex flex-col items-center gap-4">
        <div className="w-full max-w-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 flex flex-col gap-3">
          <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100 flex items-center gap-1.5"><Boxes size={16} className="text-[#2383C2]" /> Iniciar inventario por cajas</span>
          <span className="text-[11px] text-gray-500">No hay un inventario en curso. Se contarán las {cajas.length} cajas de Stock General.</span>
          <input className={INPUT} placeholder="Nombre o descripción (ej: Inventario octubre bodega)" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          <input className={INPUT} type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          <label className="flex items-center gap-1.5 text-[11.5px] text-gray-700 dark:text-gray-200 cursor-pointer">
            <input type="checkbox" checked={form.conteoCiego} onChange={(e) => setForm({ ...form, conteoCiego: e.target.checked })} />
            Conteo a ciegas (no mostrar la cantidad esperada mientras se cuenta)
          </label>
          <button type="button" onClick={handleIniciar} disabled={ocupado} className="h-8 rounded font-bold text-[12px] flex items-center justify-center gap-1.5 text-white bg-[#2383C2] hover:bg-[#369BCE] disabled:opacity-50">
            {ocupado ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />} Iniciar inventario
          </button>
        </div>
        <button type="button" onClick={() => setVista({ tipo: 'historial' })} className="text-[11.5px] font-semibold text-[#2383C2] hover:underline flex items-center gap-1"><History size={13} /> Ver historial de inventarios</button>
      </div>
    );
  }

  if (vista.tipo === 'caja') {
    const docCaja = porId.get(vista.cajaId);
    if (!docCaja) return contenedor(<div className="flex-grow flex items-center justify-center gap-2 text-gray-400"><Loader2 size={14} className="animate-spin" /> Abriendo caja...</div>);
    return contenedor(
      <ConteoCaja
        key={`${vista.cajaId}-${docCaja.estado}`}
        inventario={inventarioActivo}
        docCaja={docCaja}
        catalogo={catalogo}
        usuario={userData}
        sesion={sesion}
        onVolver={() => setVista({ tipo: 'panel' })}
      />
    );
  }

  if (vista.tipo === 'finalizar' && puedeFinalizar) {
    return contenedor(
      <FinalizarInventario
        inventario={inventarioActivo}
        cajasStock={cajasOrdenadas}
        docsCajas={docsCajas}
        usuario={userData}
        onVolver={() => setVista({ tipo: 'panel' })}
        onTerminado={() => setVista({ tipo: 'panel' })}
      />
    );
  }

  return contenedor(
    <div className="flex-grow min-h-0 overflow-auto p-3 flex flex-col gap-3">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col">
          <span className="text-[13px] font-bold text-gray-800 dark:text-gray-100">{inventarioActivo.nombre}</span>
          <span className="text-[11px] text-gray-500">
            {inventarioActivo.fecha} · Iniciado por {inventarioActivo.iniciadoPor?.nombre || '-'} · {inventarioActivo.conteoCiego !== false ? 'Conteo a ciegas' : 'Esperado visible'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[12px] font-bold text-[#2383C2]">{avance.texto}</span>
          <button type="button" onClick={() => setVista({ tipo: 'historial' })} className="h-7 px-2.5 rounded font-bold text-[11px] flex items-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200"><History size={12} /> Historial</button>
          {puedeFinalizar && (
            <button type="button" onClick={() => setVista({ tipo: 'finalizar' })} className="h-7 px-2.5 rounded font-bold text-[11px] flex items-center gap-1 text-white bg-red-600 hover:bg-red-700"><Flag size={12} /> Finalizar inventario</button>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
        {cajasOrdenadas.length === 0 ? (
          <div className="px-3 py-4 text-center text-gray-400 italic text-[11px]">No hay cajas en Stock General.</div>
        ) : cajasOrdenadas.map((caja) => {
          const d = porId.get(caja.id);
          const estado = estadoDeCaja(d);
          const { Icon, clase, texto } = ESTILO_ESTADO[estado];
          return (
            <button
              key={caja.id}
              type="button"
              onClick={() => abrirCaja(caja)}
              disabled={ocupado}
              className="w-full px-3 py-2 border-b border-gray-100 dark:border-gray-700/60 flex flex-wrap items-center justify-between gap-2 text-left hover:bg-blue-50/60 dark:hover:bg-gray-700/40 disabled:opacity-60"
            >
              <span className="flex flex-col">
                <span className="text-[12px] font-semibold text-gray-800 dark:text-gray-100">{caja.nombreCaja || 'Sin nombre'}</span>
                <span className="text-[10.5px] text-gray-500">{caja.ubicacion || 'Sin ubicación'}</span>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                {estado === ESTADOS_CAJA.FINALIZADA && d.resultado && <TotalesCategorias totales={d.resultado.totales} />}
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-semibold ${clase}`}>
                  <Icon size={11} /> {texto}{estado === ESTADOS_CAJA.EN_CONTEO && d.contandoPor?.nombre ? ` por ${d.contandoPor.nombre}${d.contandoPorSesion === sesion ? ' (este equipo)' : ''}` : ''}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default InventarioPorCajas;
