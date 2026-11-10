import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, History, Plus, RefreshCw, Save, Settings2, Trash2, X } from 'lucide-react';
import { useToast } from '../../../../context/ToastContext';
import { useCatalogo } from '../../../../hooks/useCatalogo';
import { useGranularPermission } from '../../../../hooks/useGranularPermission';
import { FAMILIAS_KIT } from '../../../../../functions/armadoKits/nucleo.mjs';
import { referenciaDeProducto } from '../../../../../functions/bodega/nucleo.mjs';
import { GENEROS, VAINAS, VARIANTES, etiquetaVariante, faltantesDelModelo, normalizarReferencia } from '../../../../../functions/armadoKits/receta.mjs';
import { detalleError, mensajeError } from '../../bodega/shared/bodegaApi';
import { fechaHora } from '../../bodega/shared/transito/transitos';
import { guardarConfiguracionKits, leerHistorialConfiguracion } from './kitsApi';
import { useConfiguracionKits } from './useConfiguracionKits';
import { Insignia } from './comunes';

const refsTexto = (lista) => (lista || []).map((r) => (typeof r === 'string' ? r : r.referencia));
const aBorrador = (config) => ({
  componentes: (config?.componentes || []).slice().sort((a, b) => a.orden - b.orden).map((c) => ({
    id: c.id, nombre: c.nombre, cantidad: c.cantidad, porVariante: Boolean(c.porVariante),
    referencias: refsTexto(c.referencias),
    referenciasPorVariante: Object.fromEntries(VARIANTES.map((v) => [v, refsTexto(c.referenciasPorVariante?.[v])])),
  })),
  modelos: (config?.modelos || []).map((m) => ({ ...m, activo: m.activo !== false })),
});
// Para saber si un modelo queda completo, con el borrador (aún sin guardar).
const comoConfig = (b) => ({ componentes: b.componentes.map((c, i) => ({ ...c, orden: i + 1 })), modelos: b.modelos });
const CLASE_CAMPO = 'h-8 px-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-900 outline-none focus:border-[#2383C2] disabled:opacity-60';

// Lista de referencias permitidas: se agregan escribiendo o escaneando la
// referencia y se valida contra el maestro de Bodega en memoria (sin lecturas).
const EditorReferencias = ({ lista, onCambiar, deshabilitado, buscar }) => {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const agregar = () => {
    const ref = normalizarReferencia(texto);
    if (!ref) return;
    if (lista.includes(ref)) { setError(`${ref} ya está en la lista.`); return; }
    if (!buscar(ref)) { setError(`${ref} no existe en el maestro de Bodega.`); return; }
    onCambiar([...lista, ref]);
    setTexto('');
    setError('');
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {lista.length === 0 && <span className="text-tinta-atenuada">Sin referencias</span>}
        {lista.map((r) => {
          const p = buscar(r);
          return (
            <span key={r} className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${p ? 'border-gray-300 dark:border-gray-600' : 'border-red-400 text-red-700'}`} title={p ? p.nombre : 'No existe en el maestro de Bodega'}>
              <span className="text-numero-tabla">{r}</span>
              {!deshabilitado && <button type="button" onClick={() => onCambiar(lista.filter((x) => x !== r))} aria-label={`Quitar ${r}`} className="text-gray-400 hover:text-red-600"><X size={11} /></button>}
            </span>
          );
        })}
      </div>
      {!deshabilitado && (
        <div className="flex gap-1">
          <input value={texto} onChange={(e) => { setTexto(e.target.value); setError(''); }} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); agregar(); } }} placeholder="Agregar referencia…" className={`${CLASE_CAMPO} w-48 h-7`} />
          <button type="button" onClick={agregar} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1"><Plus size={11} /> Agregar</button>
        </div>
      )}
      {error && <span className="text-red-600">{error}</span>}
    </div>
  );
};

// Configuración de una familia de kits: receta (componentes, cantidades,
// orden y referencias permitidas) y modelos. Se guarda completa con
// kitsConfiguracion, que valida contra el maestro de Bodega y audita. No
// cambia los kits armados.
const PantallaConfiguracionKits = ({ familia }) => {
  const familiaConfig = FAMILIAS_KIT[familia];
  const ruta = familiaConfig.rutaConfiguracion;
  const { showToast } = useToast();
  const { hasPermission } = useGranularPermission();
  const puedeGuardar = hasPermission(ruta, 'configuracion', 'btn_guardar');
  const { config, cargando, recargar } = useConfiguracionKits(familia);
  const { datos: productos } = useCatalogo('bodegaProductos');
  const [borrador, setBorrador] = useState(() => aBorrador(config));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');
  const [historial, setHistorial] = useState(null);

  // Al leer otra versión (al abrir, guardar o actualizar) el borrador parte de ella.
  const [base, setBase] = useState(config);
  if (base !== config) {
    setBase(config);
    setBorrador(aBorrador(config));
  }

  const porReferencia = useMemo(() => {
    const mapa = new Map();
    productos.filter((p) => p.activo !== false).forEach((p) => {
      const r = normalizarReferencia(referenciaDeProducto(p));
      if (r) mapa.set(r, p);
    });
    return mapa;
  }, [productos]);
  const buscar = (ref) => porReferencia.get(ref) || null;
  const deshabilitado = !puedeGuardar || guardando;

  const cambiarComponente = (i, cambios) => setBorrador((b) => ({ ...b, componentes: b.componentes.map((c, j) => (j === i ? { ...c, ...cambios } : c)) }));
  const moverComponente = (i, d) => setBorrador((b) => {
    const lista = [...b.componentes];
    [lista[i], lista[i + d]] = [lista[i + d], lista[i]];
    return { ...b, componentes: lista };
  });
  const cambiarModelo = (i, cambios) => setBorrador((b) => ({ ...b, modelos: b.modelos.map((m, j) => (j === i ? { ...m, ...cambios } : m)) }));

  const guardar = async () => {
    setGuardando(true);
    setError('');
    try {
      const r = await guardarConfiguracionKits({ familia, versionEsperada: Number(config?.version) || 0, ...borrador });
      showToast(r.sinCambios ? 'La configuración no tuvo cambios.' : `Configuración guardada (${r.cambios.length} cambio(s)).`, 'success');
      setHistorial(null);
      await recargar();
    } catch (e) {
      setError(mensajeError(e, 'No se pudo guardar la configuración.'));
      if (detalleError(e)?.motivo === 'cambio-concurrente') await recargar();
    } finally {
      setGuardando(false);
    }
  };

  const verHistorial = async () => {
    try { setHistorial(await leerHistorialConfiguracion(familia)); } catch (e) { showToast(mensajeError(e), 'error'); }
  };

  const borradorConfig = comoConfig(borrador);
  return (
    <div className="font-app text-tinta-principal w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden text-secundario">
      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion flex items-center gap-1.5"><Settings2 size={14} className="text-[#2383C2]" /> Configuración {familiaConfig.etiqueta}</h2>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={verHistorial} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1 text-tinta-secundaria"><History size={12} /> Historial</button>
          <button type="button" onClick={recargar} disabled={guardando} className="h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1 text-tinta-secundaria"><RefreshCw size={12} /> Actualizar</button>
          {puedeGuardar && <button type="button" onClick={guardar} disabled={guardando || cargando} className="h-7 px-2 rounded bg-[#2383C2] text-white text-etiqueta flex items-center gap-1 disabled:opacity-50"><Save size={12} /> {guardando ? 'Guardando…' : 'Guardar'}</button>}
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3 flex flex-col gap-4">
        {cargando && <p className="text-tinta-atenuada">Cargando…</p>}
        {config && <p className="text-tinta-secundaria">Versión {config.version} · última modificación {fechaHora(config.actualizadoEn)} por {config.actualizadoPor?.nombre || '—'}. Los cambios no modifican los kits ya armados.</p>}
        {!cargando && !config && <p className="text-tinta-secundaria">Aún no hay configuración: agrega los componentes y los modelos, y guarda.</p>}
        {error && <p className="p-2 rounded bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300">{error}</p>}

        <section className="flex flex-col gap-2">
          <h3 className="text-titulo-seccion">Componentes</h3>
          {borrador.componentes.map((c, i) => (
            <div key={c.id || i} className="p-2 rounded border border-gray-200 dark:border-gray-700 flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <span className="text-etiqueta w-6">{i + 1}.</span>
                <label className="flex flex-col gap-1"><span className="text-etiqueta">Nombre</span>
                  <input value={c.nombre} disabled={deshabilitado} onChange={(e) => cambiarComponente(i, { nombre: e.target.value })} className={`${CLASE_CAMPO} w-48`} />
                </label>
                <label className="flex flex-col gap-1"><span className="text-etiqueta">Cantidad</span>
                  <input type="number" min="1" step="1" value={c.cantidad} disabled={deshabilitado} onChange={(e) => cambiarComponente(i, { cantidad: Number(e.target.value) })} className={`${CLASE_CAMPO} w-20 text-right text-numero-tabla`} />
                </label>
                <label className="flex items-center gap-1.5 h-8"><input type="checkbox" checked={c.porVariante} disabled={deshabilitado} onChange={(e) => cambiarComponente(i, { porVariante: e.target.checked })} /> Depende del género y la vaina</label>
                {!deshabilitado && (
                  <span className="ml-auto flex gap-1">
                    <button type="button" onClick={() => moverComponente(i, -1)} disabled={i === 0} aria-label="Subir" className="p-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"><ArrowUp size={12} /></button>
                    <button type="button" onClick={() => moverComponente(i, 1)} disabled={i === borrador.componentes.length - 1} aria-label="Bajar" className="p-1 rounded border border-gray-300 dark:border-gray-600 disabled:opacity-40"><ArrowDown size={12} /></button>
                    <button type="button" onClick={() => setBorrador((b) => ({ ...b, componentes: b.componentes.filter((_, j) => j !== i) }))} aria-label={`Quitar ${c.nombre}`} className="p-1 rounded border border-gray-300 dark:border-gray-600 text-red-600"><Trash2 size={12} /></button>
                  </span>
                )}
              </div>
              {c.porVariante ? (
                <div className="grid sm:grid-cols-2 gap-2">
                  {VARIANTES.map((v) => (
                    <div key={v} className="flex flex-col gap-1">
                      <span className="text-etiqueta">{etiquetaVariante(v)}</span>
                      <EditorReferencias lista={c.referenciasPorVariante[v] || []} deshabilitado={deshabilitado} buscar={buscar} onCambiar={(lista) => cambiarComponente(i, { referenciasPorVariante: { ...c.referenciasPorVariante, [v]: lista } })} />
                    </div>
                  ))}
                </div>
              ) : (
                <EditorReferencias lista={c.referencias} deshabilitado={deshabilitado} buscar={buscar} onCambiar={(lista) => cambiarComponente(i, { referencias: lista })} />
              )}
            </div>
          ))}
          {!deshabilitado && (
            <button type="button" onClick={() => setBorrador((b) => ({ ...b, componentes: [...b.componentes, { id: '', nombre: '', cantidad: 1, porVariante: false, referencias: [], referenciasPorVariante: Object.fromEntries(VARIANTES.map((v) => [v, []])) }] }))} className="self-start h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1"><Plus size={12} /> Agregar componente</button>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-titulo-seccion">Modelos de kit</h3>
          <p className="text-tinta-secundaria">Cada combinación de género y tipo de vaina es una referencia de kit. Solo los modelos activos y completos se ofrecen al crear un kit.</p>
          {borrador.modelos.map((m, i) => {
            const faltan = m.genero && m.vaina ? faltantesDelModelo(borradorConfig, m) : ['género y vaina'];
            return (
              <div key={i} className="flex flex-wrap items-end gap-2 p-2 rounded border border-gray-200 dark:border-gray-700">
                <label className="flex flex-col gap-1"><span className="text-etiqueta">Referencia</span>
                  <input value={m.referencia} disabled={deshabilitado} onChange={(e) => cambiarModelo(i, { referencia: e.target.value.toUpperCase() })} className={`${CLASE_CAMPO} w-28`} />
                </label>
                <label className="flex flex-col gap-1"><span className="text-etiqueta">Nombre</span>
                  <input value={m.nombre} disabled={deshabilitado} onChange={(e) => cambiarModelo(i, { nombre: e.target.value })} className={`${CLASE_CAMPO} w-52`} />
                </label>
                <label className="flex flex-col gap-1"><span className="text-etiqueta">Género</span>
                  <select value={m.genero || ''} disabled={deshabilitado} onChange={(e) => cambiarModelo(i, { genero: e.target.value })} className={CLASE_CAMPO}>
                    <option value="">—</option>{Object.entries(GENEROS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1"><span className="text-etiqueta">Vaina</span>
                  <select value={m.vaina || ''} disabled={deshabilitado} onChange={(e) => cambiarModelo(i, { vaina: e.target.value })} className={CLASE_CAMPO}>
                    <option value="">—</option>{Object.entries(VAINAS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="flex items-center gap-1.5 h-8"><input type="checkbox" checked={m.activo} disabled={deshabilitado} onChange={(e) => cambiarModelo(i, { activo: e.target.checked })} /> Activo</label>
                <span className="h-8 flex items-center">{faltan.length ? <Insignia color="ambar">Incompleto: falta {faltan.join(', ')}</Insignia> : <Insignia color="verde">Completo</Insignia>}</span>
                {!deshabilitado && <button type="button" onClick={() => setBorrador((b) => ({ ...b, modelos: b.modelos.filter((_, j) => j !== i) }))} aria-label={`Quitar ${m.referencia}`} className="ml-auto p-1 rounded border border-gray-300 dark:border-gray-600 text-red-600"><Trash2 size={12} /></button>}
              </div>
            );
          })}
          {!deshabilitado && (
            <button type="button" onClick={() => setBorrador((b) => ({ ...b, modelos: [...b.modelos, { referencia: '', nombre: '', genero: '', vaina: '', activo: true }] }))} className="self-start h-7 px-2 rounded border border-gray-300 dark:border-gray-600 text-etiqueta flex items-center gap-1"><Plus size={12} /> Agregar modelo</button>
          )}
        </section>

        {historial && (
          <section className="flex flex-col gap-1">
            <h3 className="text-titulo-seccion">Historial</h3>
            {historial.length === 0 && <p className="text-tinta-atenuada">Sin cambios registrados.</p>}
            {historial.map((h) => (
              <div key={h.id} className="p-2 rounded border border-gray-200 dark:border-gray-700">
                <p className="text-etiqueta">{fechaHora(h.fecha)} · {h.usuario} · versión {h.detalle?.version}</p>
                <ul className="list-disc pl-5">{(h.detalle?.cambios || []).map((c) => <li key={c}>{c}</li>)}</ul>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
};

export default PantallaConfiguracionKits;
