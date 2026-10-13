import { useState, useMemo, useRef } from 'react';
import { FolderUp, UploadCloud, Loader2, X, AlertTriangle, CheckCircle2, XCircle, HelpCircle, RefreshCw, Trash2, Archive } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import FormularioRespaldo from '../../implantes/respaldoDocumentos/FormularioRespaldo';
import { TIPOS_DOCUMENTO, ordenarDocumentos } from '../documentosAdmision/documentosHelpers';
import { listarDocumentosAdmision, subirTandaAdmision } from '../documentosAdmision/documentosStorage';
import { ZonaSubidaPdf } from '../documentosAdmision/ZonaSubidaPdf';
import { buscarAdmisiones } from './utils/buscarAdmisiones';
import { moduloGestion } from '../modulosGestion';
import {
  ESTADOS,
  esSubible,
  claveArchivo,
  idsPorVerificar,
  construirVistaPrevia,
  agruparPorAdmision,
  rechazoDeFila
} from './utils/vistaPreviaCarga';

// Carga masiva de documentos: PDF de muchas admisiones a la vez; cada uno va
// a la carpeta de su admisión con exactamente las mismas reglas que la
// pestaña Documentos de Gestión (shared/documentosAdmision). La usan
// Implantes y Hemodinamia (`modulo`, ver modulosGestion.js): cada módulo
// verifica sus admisiones y sube a su carpeta.
//
// Lecturas: al agregar archivos se verifica cada admisión NUEVA una sola vez
// (1 lectura de Firestore por id, ver buscarAdmisiones) y se lista
// su carpeta de Storage una sola vez (para marcar duplicados). Ambos quedan
// en memoria mientras la pantalla esté abierta: volver a arrastrar archivos
// de la misma admisión no vuelve a consultar, y después de subir el listado
// se actualiza en memoria. Sin listeners ni useEffect.

const LISTAS_EN_PARALELO = 10;

const CLASE_ESTADO = {
  LISTO: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  DUPLICADO: 'bg-sky-100 text-sky-800 border-sky-300 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800',
  VERIFICANDO: 'bg-slate-100 text-slate-600 border-slate-300 dark:bg-gray-700 dark:text-gray-300 dark:border-gray-600',
  ERROR_VERIFICACION: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
};
const CLASE_RECHAZO = 'bg-red-100 text-red-800 border-red-300 dark:bg-red-950/60 dark:text-red-300 dark:border-red-800';

const listarEnLotes = async (modulo, ids) => {
  const listados = new Map();
  const fallidos = [];
  for (let i = 0; i < ids.length; i += LISTAS_EN_PARALELO) {
    const lote = ids.slice(i, i + LISTAS_EN_PARALELO);
    const resultados = await Promise.allSettled(lote.map((id) => listarDocumentosAdmision(modulo, id)));
    resultados.forEach((r, idx) => {
      if (r.status === 'fulfilled') listados.set(lote[idx], r.value);
      else {
        console.error(`Error al listar documentos de la admisión ${lote[idx]}:`, r.reason);
        fallidos.push(lote[idx]);
      }
    });
  }
  return { listados, fallidos };
};

const CargaMasivaDocumentos = ({ modulo }) => {
  const config = moduloGestion(modulo);
  const { showToast } = useToast();
  const [items, setItems] = useState([]);               // [{ key, file }]
  const [admisiones, setAdmisiones] = useState(new Map()); // id -> { nombre } | null
  const [listados, setListados] = useState(new Map());     // id -> documentos en Storage
  const [idsConError, setIdsConError] = useState(new Set());
  const [verificando, setVerificando] = useState(0);
  const [progreso, setProgreso] = useState(null);         // { actual, total, porcentaje }
  const [resumen, setResumen] = useState(null);
  // Ids ya pedidos (o en curso) en esta sesión de la pantalla: evita volver a
  // consultar la misma admisión si se arrastran más archivos suyos.
  const solicitadosRef = useRef(new Set());

  const subiendo = progreso !== null;

  const filas = useMemo(
    () => construirVistaPrevia(items, { admisiones, listados, idsConError }),
    [items, admisiones, listados, idsConError]
  );
  const grupos = useMemo(
    () => agruparPorAdmision(filas).map(([id, filasGrupo]) => [id, ordenarDocumentos(filasGrupo)]),
    [filas]
  );
  const subibles = filas.filter(esSubible);
  const totalRechazados = filas.filter(f => !esSubible(f) && f.estado !== 'VERIFICANDO').length;
  const totalAdvertencias = filas.filter(f => f.advertencia).length;

  const verificar = async (ids) => {
    if (ids.length === 0) return;
    ids.forEach(id => solicitadosRef.current.add(id));
    setVerificando(v => v + 1);
    try {
      const { encontradas, fallidos } = await buscarAdmisiones(modulo, ids);
      const existentes = [...encontradas].filter(([, adm]) => adm).map(([id]) => id);
      const { listados: nuevosListados, fallidos: fallidosListado } = await listarEnLotes(modulo, existentes);
      const errores = new Set([...fallidos, ...fallidosListado]);

      // Lo que falló no se cachea: "Reintentar" lo vuelve a pedir.
      errores.forEach(id => solicitadosRef.current.delete(id));
      setAdmisiones(prev => {
        const m = new Map(prev);
        encontradas.forEach((adm, id) => { if (!errores.has(id)) m.set(id, adm); });
        return m;
      });
      setListados(prev => new Map([...prev, ...nuevosListados]));
      setIdsConError(prev => {
        const s = new Set(prev);
        ids.forEach(id => s.delete(id));
        errores.forEach(id => s.add(id));
        return s;
      });
      if (errores.size > 0) showToast(`No se pudo verificar ${errores.size} admisión(es). Usa "Reintentar verificación".`, 'error');
    } catch (err) {
      console.error('Error al verificar admisiones:', err);
      ids.forEach(id => solicitadosRef.current.delete(id));
      setIdsConError(prev => new Set([...prev, ...ids]));
      showToast('No se pudieron verificar las admisiones. Usa "Reintentar verificación".', 'error');
    } finally {
      setVerificando(v => v - 1);
    }
  };

  const agregarArchivos = (files) => {
    setResumen(null);
    const claves = new Set(items.map(i => i.key));
    const nuevos = [];
    let repetidos = 0;
    files.forEach(file => {
      const key = claveArchivo(file);
      if (claves.has(key)) { repetidos++; return; }
      claves.add(key);
      nuevos.push({ key, file });
    });
    if (repetidos > 0) showToast(`${repetidos} archivo(s) ya estaban en la lista.`, 'warning');
    if (nuevos.length === 0) return;
    setItems(prev => [...prev, ...nuevos]);
    verificar(idsPorVerificar(nuevos, solicitadosRef.current));
  };

  const quitarArchivo = (key) => setItems(prev => prev.filter(i => i.key !== key));

  const reintentarVerificacion = () => {
    const ids = [...idsConError];
    setIdsConError(new Set());
    verificar(ids);
  };

  const handleSubir = async () => {
    if (subibles.length === 0 || verificando > 0) return;

    const rechazados = filas.filter(f => !esSubible(f)).map((f) => rechazoDeFila(f, config.etiqueta));
    const porAdmision = agruparPorAdmision(subibles);
    const total = subibles.length;
    const resultados = [];
    const listadosActualizados = new Map();
    let hechos = 0;
    let motivoSinPermiso = null;

    for (const [idAdmision, filasAdmision] of porAdmision) {
      const archivos = filasAdmision.map(f => f.file);
      // Sin permiso, el resto de las admisiones fallaría igual: no se intenta.
      if (motivoSinPermiso) {
        archivos.forEach(f => rechazados.push({ nombre: f.name, motivo: motivoSinPermiso }));
        continue;
      }
      const base = hechos;
      const res = await subirTandaAdmision({
        modulo,
        idAdmision,
        archivos,
        listaInicial: listados.get(idAdmision) || [],
        onProgreso: (indice, porcentaje) => setProgreso({ actual: base + indice + 1, total, porcentaje })
      });
      hechos += archivos.length;
      listadosActualizados.set(idAdmision, res.lista);
      if (res.subidos.length > 0) {
        resultados.push({ idAdmision, paciente: admisiones.get(idAdmision)?.nombre || '', subidos: res.subidos });
      }
      rechazados.push(...res.fallidos);
      if (res.sinPermiso) motivoSinPermiso = res.fallidos[res.fallidos.length - 1]?.motivo;
    }

    setProgreso(null);
    setListados(prev => new Map([...prev, ...listadosActualizados]));
    setItems([]);

    const totalSubidos = resultados.reduce((acc, r) => acc + r.subidos.length, 0);
    const sinTipo = resultados.flatMap(r => r.subidos.filter(d => !d.tipo));
    setResumen({ porAdmision: resultados, rechazados, sinTipo });

    if (totalSubidos > 0) showToast(`${totalSubidos} documento(s) subido(s) en ${resultados.length} admisión(es).`, 'success');
    if (rechazados.length > 0) showToast(`${rechazados.length} archivo(s) no se subieron. Revisa el resumen.`, 'error');
    if (sinTipo.length > 0) showToast(`${sinTipo.length} archivo(s) subido(s) sin tipo reconocido. Revisa el resumen.`, 'warning');
  };

  // Archivos cuya admisión no existe: se pueden enviar al Respaldo de
  // documentos (con ID, nombre y tipo leídos del nombre del archivo).
  const { hasPermission } = useGranularPermission();
  // Solo si el módulo tiene Respaldo de documentos.
  const puedeRespaldar = Boolean(config.rutas.respaldo) && hasPermission(config.rutas.respaldo, 'acciones', 'btn_subir');
  const [respaldoAbierto, setRespaldoAbierto] = useState(false);
  const respaldables = (resumen?.rechazados || []).filter((r) => r.respaldable && r.file);
  const alEnviarARespaldo = (files) => setResumen((prev) => prev && ({
    ...prev,
    rechazados: prev.rechazados.map((r) => (files.includes(r.file)
      ? { ...r, respaldable: false, motivo: `${r.motivo} Se envió al Respaldo de documentos.` }
      : r)),
  }));

  const etiquetaTipo = (tipo) => (tipo ? TIPOS_DOCUMENTO.find(t => t.id === tipo)?.id : null);

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-[11px]">
      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <FolderUp size={15} className="text-[#2383C2]" />
          Carga masiva de documentos
        </h2>
      </div>

      <div className="flex-grow overflow-y-auto p-3 space-y-3">
        <p className="text-[10px] text-slate-500 dark:text-gray-400">
          Arrastra PDF de una o varias admisiones, nombrados como{' '}
          <strong className="text-slate-700 dark:text-gray-200">102030 - JOSE PEREZ - DP.pdf</strong> o{' '}
          <strong className="text-slate-700 dark:text-gray-200">102030 - JOSE PEREZ - COT 12345678 - EMPRESA.pdf</strong>.
          Cada archivo se guarda en la carpeta de su admisión. Revisa la vista previa y presiona <strong>Subir</strong>.
        </p>

        <ZonaSubidaPdf
          onArchivos={agregarArchivos}
          progreso={progreso}
          textoSoltar="Suelta los PDF para revisarlos"
        />

        {items.length > 0 && (
          <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">
            <div className="px-3 py-1.5 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex flex-wrap items-center gap-2">
              <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide mr-auto">
                Vista previa ({items.length})
              </h3>
              <span className="text-[10px] text-emerald-700 dark:text-emerald-400">Para subir: <strong>{subibles.length}</strong></span>
              {totalRechazados > 0 && <span className="text-[10px] text-red-700 dark:text-red-400">No se subirán: <strong>{totalRechazados}</strong></span>}
              {totalAdvertencias > 0 && <span className="text-[10px] text-amber-700 dark:text-amber-400">Advertencias: <strong>{totalAdvertencias}</strong></span>}
              {verificando > 0 && (
                <span className="text-[10px] text-slate-500 dark:text-gray-400 flex items-center gap-1">
                  <Loader2 size={11} className="animate-spin" /> Verificando admisiones...
                </span>
              )}
              {idsConError.size > 0 && verificando === 0 && (
                <button
                  type="button"
                  onClick={reintentarVerificacion}
                  disabled={subiendo}
                  className="flex items-center gap-1 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-800 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30 text-[10px] disabled:opacity-50"
                >
                  <RefreshCw size={11} /> Reintentar verificación
                </button>
              )}
              <button
                type="button"
                onClick={() => setItems([])}
                disabled={subiendo}
                className="flex items-center gap-1 px-2 py-0.5 rounded border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700/50 text-[10px] disabled:opacity-50"
              >
                <Trash2 size={11} /> Limpiar lista
              </button>
              <button
                type="button"
                onClick={handleSubir}
                disabled={subibles.length === 0 || verificando > 0 || subiendo}
                className="bg-[#2383C2] hover:bg-[#1c6fa6] text-white px-2.5 py-1 rounded text-[10px] font-medium flex items-center gap-1.5 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {subiendo ? <Loader2 size={11} className="animate-spin" /> : <UploadCloud size={11} />}
                {subiendo ? `Subiendo ${progreso.actual} de ${progreso.total}` : `Subir (${subibles.length})`}
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-[10px] border-collapse">
                <thead className="bg-slate-100 dark:bg-gray-900/80">
                  <tr className="text-slate-600 dark:text-gray-400 uppercase text-[9px] tracking-wider">
                    <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 w-24">Id admisión</th>
                    <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700">Archivo</th>
                    <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 w-20 text-center">Tipo</th>
                    <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 w-48 text-center">Estado</th>
                    <th className="px-2 py-1.5 border-b border-slate-200 dark:border-gray-700 w-8" />
                  </tr>
                </thead>
                <tbody>
                  {grupos.map(([idAdmision, filasGrupo]) => {
                    const admision = idAdmision ? admisiones.get(idAdmision) : null;
                    return [
                      <tr key={`grupo_${idAdmision}`} className="bg-slate-50 dark:bg-gray-900/40">
                        <td colSpan={5} className="px-2 py-1 border-b border-slate-200 dark:border-gray-700 font-semibold text-slate-700 dark:text-gray-200">
                          {idAdmision
                            ? <>Admisión {idAdmision}{admision?.nombre ? ` · ${admision.nombre}` : ''}</>
                            : 'Sin id de admisión legible'}
                          <span className="font-normal text-slate-500 dark:text-gray-400"> — {filasGrupo.length} archivo(s)</span>
                        </td>
                      </tr>,
                      ...filasGrupo.map(f => (
                        <tr key={f.key} className="hover:bg-slate-50 dark:hover:bg-gray-700/40">
                          <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400">
                            {f.idAdmision || '—'}
                          </td>
                          <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700/70 text-slate-800 dark:text-gray-100">
                            <div className="break-all">{f.nombre}</div>
                            {f.advertencia && (
                              <div className="flex items-center gap-1 text-amber-700 dark:text-amber-400 mt-0.5">
                                <AlertTriangle size={11} className="shrink-0" /> {f.advertencia}
                              </div>
                            )}
                          </td>
                          <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700/70 text-center">
                            {etiquetaTipo(f.tipo)
                              ? <span className="font-semibold text-slate-700 dark:text-gray-200">{etiquetaTipo(f.tipo)}</span>
                              : <span className="text-amber-700 dark:text-amber-400">Sin tipo</span>}
                          </td>
                          <td className="px-2 py-1 border-b border-slate-200/60 dark:border-gray-700/70 text-center">
                            <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full border text-[9px] font-semibold ${CLASE_ESTADO[f.estado] || CLASE_RECHAZO}`}>
                              {f.estado === 'VERIFICANDO' && <Loader2 size={9} className="animate-spin" />}
                              {ESTADOS[f.estado].label}
                            </span>
                          </td>
                          <td className="px-1 py-1 border-b border-slate-200/60 dark:border-gray-700/70 text-center">
                            <button
                              type="button"
                              onClick={() => quitarArchivo(f.key)}
                              disabled={subiendo}
                              title="Quitar de la lista"
                              className="p-0.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50"
                            >
                              <X size={12} />
                            </button>
                          </td>
                        </tr>
                      ))
                    ];
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {resumen && (
          <div className="space-y-2 text-[10px]">
            {resumen.porAdmision.length > 0 && (
              <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <CheckCircle2 size={13} className="shrink-0" />
                  Subidos: {resumen.porAdmision.reduce((acc, r) => acc + r.subidos.length, 0)} en {resumen.porAdmision.length} admisión(es)
                </div>
                <ul className="space-y-1 pl-5 list-disc">
                  {resumen.porAdmision.map(r => (
                    <li key={r.idAdmision}>
                      <strong>Admisión {r.idAdmision}{r.paciente ? ` · ${r.paciente}` : ''}</strong>: {r.subidos.length} archivo(s)
                      <ul className="pl-4 list-[circle]">
                        {r.subidos.map(d => (
                          <li key={d.ruta} className="break-all">
                            {d.nombre}
                            {d.nombre !== d.nombreOriginal && <span className="opacity-80"> (original: {d.nombreOriginal})</span>}
                            {!d.tipo && <span className="font-semibold text-amber-700 dark:text-amber-400"> — Sin tipo</span>}
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {resumen.sinTipo.length > 0 && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400">
                <HelpCircle size={13} className="shrink-0 mt-0.5" />
                <span>
                  No se reconoció el tipo (DP, RP, INF o COT) de {resumen.sinTipo.length} archivo(s): se subieron igual y quedan en "Sin tipo".
                </span>
              </div>
            )}

            {resumen.rechazados.length > 0 && (
              <div className="px-3 py-2 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-400">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <XCircle size={13} className="shrink-0" /> No subidos ({resumen.rechazados.length})
                  {puedeRespaldar && respaldables.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setRespaldoAbierto(true)}
                      className="ml-auto h-6 px-2 rounded border border-red-300 dark:border-red-800 bg-white dark:bg-gray-800 text-[10.5px] font-semibold text-red-700 dark:text-red-400 inline-flex items-center gap-1 hover:bg-red-100 dark:hover:bg-red-950/40"
                      title="Las admisiones de estos archivos no existen: guárdalos en Respaldo de documentos"
                    >
                      <Archive size={12} /> Enviar {respaldables.length} a respaldo
                    </button>
                  )}
                </div>
                <ul className="space-y-0.5 pl-5 list-disc">
                  {resumen.rechazados.map((r, idx) => (
                    <li key={`${r.nombre}_${idx}`} className="break-all">
                      <strong>{r.nombre}</strong>: {r.motivo}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
      {respaldoAbierto && (
        <FormularioRespaldo
          iniciales={respaldables.map((r) => ({ file: r.file }))}
          onCerrar={() => setRespaldoAbierto(false)}
          onSubidos={alEnviarARespaldo}
        />
      )}
    </div>
  );
};

export default CargaMasivaDocumentos;
