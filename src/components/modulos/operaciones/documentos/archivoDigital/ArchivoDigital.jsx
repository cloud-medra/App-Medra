import { useEffect, useMemo, useRef, useState } from 'react';
import {
  FolderOpen, Folder, FolderPlus, Upload, Search, Eye, Download, Pencil, FolderInput, Trash2, RotateCcw,
  Loader2, Trash, Home, ChevronRight, FileText, Image as ImageIcon, X, AlertCircle, CheckCircle2,
} from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import { obtenerBlobDocumento } from '../../shared/documentosAdmision/documentosStorage';
import { VisorDocumentoModal } from '../../shared/documentosAdmision/VisorDocumentoModal';
import DialogoNombre from './DialogoNombre';
import DialogoMover from './DialogoMover';
import {
  ACEPTA_INPUT, FORMATOS_TEXTO, TAMANO_MAXIMO_MB, construirIndice, hijosDe, rutaHasta, descendientes, nombreUnico,
  buscarNodos, elementosPapelera, formatearTamano, validarArchivo,
} from './arbolArchivo';
import {
  escucharNodos, crearCarpeta, subirArchivo, renombrarNodo, moverNodo, enviarAPapelera, restaurarGrupo, eliminarGrupoDefinitivo,
} from './archivoService';

// Documentos → Archivo digital: explorador de carpetas (sin límite de niveles)
// con archivos PDF/JPG/PNG/WEBP, ruta de navegación, búsqueda en todo el
// árbol y papelera.

const PATH_VISTA = '/documentos/archivoDigital'; // = RUTA_VISTA_ARCHIVO

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'tamano', label: 'Tamaño' },
  { key: 'subidoEl', label: 'Fecha' },
  { key: 'subidoPor', label: 'Subido por' },
  { key: 'acciones', label: 'Acciones' }
];

const fechaHora = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
};
const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
const mensajeError = (err) => {
  if (err?.code === 'permission-denied' || err?.code === 'storage/unauthorized') return 'No tienes permiso para esta acción.';
  if (err?.code === 'storage/object-not-found') return 'El archivo ya no existe en el servidor.';
  if (err?.code === 'storage/retry-limit-exceeded' || err?.code === 'storage/network-request-failed') return 'Se perdió la conexión con el servidor. Intenta nuevamente.';
  return 'No se pudo completar la acción.';
};

const IconoNodo = ({ nodo, size = 16 }) => {
  if (nodo.tipo === 'carpeta') return <Folder size={size} className="text-amber-500 shrink-0" />;
  if (nodo.contentType?.startsWith('image/')) return <ImageIcon size={size} className="text-emerald-600 shrink-0" />;
  return <FileText size={size} className="text-red-500 shrink-0" />;
};

const BTN_ICONO = 'p-1 rounded text-gray-500 hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-40';

const ArchivoDigital = () => {
  const { hasPermission } = useGranularPermission();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla', COLUMNAS_TABLA);
  const puede = {
    crearCarpeta: hasPermission(PATH_VISTA, 'carpetas', 'btn_crear'),
    renombrarCarpeta: hasPermission(PATH_VISTA, 'carpetas', 'btn_renombrar'),
    moverCarpeta: hasPermission(PATH_VISTA, 'carpetas', 'btn_mover'),
    eliminarCarpeta: hasPermission(PATH_VISTA, 'carpetas', 'btn_eliminar'),
    subir: hasPermission(PATH_VISTA, 'archivos', 'btn_subir'),
    ver: hasPermission(PATH_VISTA, 'archivos', 'btn_ver'),
    descargar: hasPermission(PATH_VISTA, 'archivos', 'btn_descargar'),
    renombrarArchivo: hasPermission(PATH_VISTA, 'archivos', 'btn_renombrar'),
    moverArchivo: hasPermission(PATH_VISTA, 'archivos', 'btn_mover'),
    eliminarArchivo: hasPermission(PATH_VISTA, 'archivos', 'btn_eliminar'),
    buscar: hasPermission(PATH_VISTA, 'buscador', 'input_busqueda'),
    verTabla: hasPermission(PATH_VISTA, 'tabla'),
    papelera: hasPermission(PATH_VISTA, 'papelera'),
    restaurar: hasPermission(PATH_VISTA, 'papelera', 'btn_restaurar'),
    eliminarDefinitivo: hasPermission(PATH_VISTA, 'papelera', 'btn_eliminar_definitivo'),
  };
  const puedeSobre = (n, accion) => ({
    renombrar: n.tipo === 'carpeta' ? puede.renombrarCarpeta : puede.renombrarArchivo,
    mover: n.tipo === 'carpeta' ? puede.moverCarpeta : puede.moverArchivo,
    eliminar: n.tipo === 'carpeta' ? puede.eliminarCarpeta : puede.eliminarArchivo,
  })[accion];
  const usuarioNombre = userData?.nombreCompleto;

  const [nodos, setNodos] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState('archivos');
  const [carpetaId, setCarpetaId] = useState(null);
  const [busqueda, setBusqueda] = useState('');
  const [dialogo, setDialogo] = useState(null); // { tipo: 'carpeta'|'renombrar'|'mover', nodo? }
  const [visor, setVisor] = useState(null); // índice en `archivosVisibles`
  const [ocupado, setOcupado] = useState(null);
  const [subidas, setSubidas] = useState([]); // [{ id, nombre, progreso, error, listo }]
  const [arrastrando, setArrastrando] = useState(false);
  const inputRef = useRef(null);
  const contadorArrastre = useRef(0);

  useEffect(() => escucharNodos(
    (lista) => { setNodos(lista); setCargando(false); setError(null); },
    (err) => { console.error('Error al cargar el archivo digital:', err); setError('No se pudo cargar el archivo digital.'); setCargando(false); }
  ), []);

  const indice = useMemo(() => construirIndice(nodos), [nodos]);
  const papelera = useMemo(() => elementosPapelera(nodos), [nodos]);

  // Si la carpeta abierta desaparece (eliminada o movida por otro usuario a la
  // papelera), volver a Inicio.
  const carpetaActual = carpetaId && indice.porId.has(carpetaId) ? carpetaId : null;
  const ruta = rutaHasta(indice, carpetaActual);
  const buscando = puede.buscar && busqueda.trim() !== '';
  const enPapelera = vista === 'papelera';
  const lista = enPapelera ? papelera : buscando ? buscarNodos(indice, busqueda) : hijosDe(indice, carpetaActual);
  const archivosVisibles = lista.filter((n) => n.tipo === 'archivo');

  const abrir = (n) => {
    if (n.tipo === 'carpeta') { setCarpetaId(n.id); setBusqueda(''); return; }
    if (puede.ver) setVisor(archivosVisibles.findIndex((a) => a.id === n.id));
  };

  const ejecutar = async (id, accion, exito) => {
    setOcupado(id);
    try {
      await accion();
      if (exito) showToast(exito, 'success');
      return true;
    } catch (err) {
      console.error(err);
      showToast(mensajeError(err), 'error');
      return false;
    } finally {
      setOcupado(null);
    }
  };

  // ── Subida ──
  const subir = async (files) => {
    if (!puede.subir || enPapelera) return;
    const destino = carpetaActual;
    const hermanos = [...hijosDe(indice, destino)];
    const tareas = Array.from(files).map((file, i) => {
      const err = validarArchivo(file);
      const nombre = err ? file.name : nombreUnico(file.name, hermanos);
      if (!err) hermanos.push({ id: `nuevo-${i}`, nombre });
      return { id: `${Date.now()}-${i}`, file, nombre, progreso: 0, error: err, listo: false };
    });
    if (!tareas.length) return;
    setSubidas((prev) => [...prev.filter((s) => !s.listo && !s.error), ...tareas]);
    const actualizar = (id, cambios) => setSubidas((prev) => prev.map((s) => (s.id === id ? { ...s, ...cambios } : s)));
    let ok = 0;
    for (const t of tareas.filter((x) => !x.error)) {
      try {
        await subirArchivo({ file: t.file, nombre: t.nombre, padreId: destino, usuarioNombre, onProgreso: (p) => actualizar(t.id, { progreso: p }) });
        actualizar(t.id, { progreso: 100, listo: true });
        ok += 1;
      } catch (err) {
        console.error(err);
        actualizar(t.id, { error: mensajeError(err) });
      }
    }
    if (ok) showToast(`${plural(ok, 'archivo subido', 'archivos subidos')}.`, 'success');
  };

  const alSoltar = (e) => {
    e.preventDefault();
    contadorArrastre.current = 0;
    setArrastrando(false);
    if (e.dataTransfer?.files?.length) subir(e.dataTransfer.files);
  };
  const permiteArrastre = puede.subir && !enPapelera && !buscando;
  const eventosArrastre = permiteArrastre ? {
    onDragEnter: (e) => { if (e.dataTransfer?.types?.includes('Files')) { e.preventDefault(); contadorArrastre.current += 1; setArrastrando(true); } },
    onDragOver: (e) => { if (e.dataTransfer?.types?.includes('Files')) e.preventDefault(); },
    onDragLeave: () => { contadorArrastre.current -= 1; if (contadorArrastre.current <= 0) { contadorArrastre.current = 0; setArrastrando(false); } },
    onDrop: alSoltar,
  } : {};

  // ── Acciones ──
  const descargar = (n) => ejecutar(n.id, async () => {
    const url = URL.createObjectURL(await obtenerBlobDocumento(n.ruta));
    const a = document.createElement('a');
    a.href = url;
    a.download = n.nombre;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });

  const alCrearCarpeta = async (nombre) => {
    const final = nombreUnico(nombre, hijosDe(indice, carpetaActual));
    if (await ejecutar('nueva', () => crearCarpeta({ nombre: final, padreId: carpetaActual, usuarioNombre }), `Carpeta "${final}" creada.`)) setDialogo(null);
  };

  const alRenombrar = async (n, nombre) => {
    const final = nombreUnico(nombre, hijosDe(indice, n.padreId), n.id);
    if (final === n.nombre) { setDialogo(null); return; }
    if (await ejecutar(n.id, () => renombrarNodo(n.id, final), 'Nombre actualizado.')) setDialogo(null);
  };

  const alMover = async (n, destino) => {
    // Si en el destino ya hay algo con el mismo nombre, se agrega " (2)".
    const final = nombreUnico(n.nombre, hijosDe(indice, destino), n.id);
    const mover = () => moverNodo(n.id, destino, final !== n.nombre ? final : undefined);
    const nombreDestino = destino ? indice.porId.get(destino)?.nombre : 'Inicio';
    if (await ejecutar(n.id, mover, `"${n.nombre}" movido a ${nombreDestino}.`)) setDialogo(null);
  };

  const eliminar = (n) => {
    const contenido = n.tipo === 'carpeta' ? descendientes(indice, n.id) : { nodos: [], carpetas: 0, archivos: 0 };
    const detalle = n.tipo === 'carpeta' && contenido.nodos.length
      ? ` Contiene ${plural(contenido.archivos, 'archivo', 'archivos')} y ${plural(contenido.carpetas, 'subcarpeta', 'subcarpetas')}, que también se moverán a la papelera.`
      : '';
    confirmAction(
      n.tipo === 'carpeta' ? 'Eliminar carpeta' : 'Eliminar archivo',
      `"${n.nombre}" se moverá a la papelera.${detalle} Podrás restaurarlo desde allí.`,
      () => ejecutar(n.id, () => enviarAPapelera(n, contenido.nodos, usuarioNombre), 'Enviado a la papelera.'),
      { confirmText: 'Enviar a la papelera', type: 'warning' }
    );
  };

  const restaurar = (el) => {
    const padreDisponible = !el.padreId || indice.porId.has(el.padreId);
    const ubicacion = padreDisponible ? '' : ' La carpeta donde estaba ya no existe: quedará en Inicio.';
    ejecutar(el.id, () => restaurarGrupo(el, padreDisponible), `"${el.nombre}" restaurado.${ubicacion}`);
  };

  const eliminarDefinitivo = (el) => {
    const detalle = el.tipo === 'carpeta' && el.miembros.length > 1
      ? ` Incluye ${plural(el.archivos, 'archivo', 'archivos')} y ${plural(el.carpetas, 'subcarpeta', 'subcarpetas')}.`
      : '';
    confirmAction(
      'Eliminar definitivamente',
      `"${el.nombre}" se borrará para siempre y no se podrá recuperar.${detalle}`,
      () => ejecutar(el.id, () => eliminarGrupoDefinitivo(el), 'Eliminado definitivamente.'),
      { confirmText: 'Eliminar para siempre', type: 'danger' }
    );
  };

  const celda = 'px-3 py-2 border-b border-gray-100 dark:border-gray-700/60 text-gray-700 dark:text-gray-200 truncate';
  const subidasVisibles = subidas.length > 0;

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
        <FolderOpen size={18} className="text-[#2383C2]" />
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-gray-800 dark:text-gray-100">Archivo digital</h2>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400">Carpetas y documentos ({FORMATOS_TEXTO}, hasta {TAMANO_MAXIMO_MB} MB por archivo).</p>
        </div>
        {!enPapelera && puede.crearCarpeta && (
          <button type="button" onClick={() => setDialogo({ tipo: 'carpeta' })}
            className="h-8 px-3.5 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-[12px] font-semibold text-gray-700 dark:text-gray-200 hover:border-[#2383C2] hover:text-[#2383C2] inline-flex items-center gap-1.5">
            <FolderPlus size={14} /> Nueva carpeta
          </button>
        )}
        {!enPapelera && puede.subir && (
          <>
            <button type="button" onClick={() => inputRef.current?.click()}
              className="h-8 px-3.5 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[12px] font-semibold inline-flex items-center gap-1.5">
              <Upload size={14} /> Subir archivos
            </button>
            <input ref={inputRef} type="file" multiple accept={ACEPTA_INPUT} className="hidden" data-testid="input-archivos"
              onChange={(e) => { subir(e.target.files); e.target.value = ''; }} />
          </>
        )}
      </div>

      <div className="px-4 pt-2 flex gap-1 border-b border-gray-200 dark:border-gray-700" role="tablist">
        {[
          { id: 'archivos', label: 'Archivos', icon: Folder },
          ...(puede.papelera ? [{ id: 'papelera', label: `Papelera${papelera.length ? ` (${papelera.length})` : ''}`, icon: Trash }] : []),
        ].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={vista === t.id} onClick={() => setVista(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px ${vista === t.id ? 'border-[#2383C2] text-[#2383C2]' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      {!enPapelera && (
        <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
          <nav aria-label="Ruta" className="flex-1 min-w-0 flex items-center flex-wrap gap-0.5 text-[12px]">
            {buscando ? (
              <span className="text-gray-600 dark:text-gray-300 font-semibold">Resultados de búsqueda en todo el archivo</span>
            ) : ruta.map((r, i) => (
              <span key={r.id || 'inicio'} className="inline-flex items-center gap-0.5 min-w-0">
                {i > 0 && <ChevronRight size={13} className="text-gray-400 shrink-0" />}
                {i === ruta.length - 1 ? (
                  <span className="px-1.5 py-0.5 font-semibold text-gray-800 dark:text-gray-100 truncate max-w-[200px] inline-flex items-center gap-1" aria-current="page">
                    {i === 0 && <Home size={13} />} {r.nombre}
                  </span>
                ) : (
                  <button type="button" onClick={() => setCarpetaId(r.id)}
                    className="px-1.5 py-0.5 rounded text-[#2383C2] hover:bg-[#2383C2]/10 truncate max-w-[200px] inline-flex items-center gap-1">
                    {i === 0 && <Home size={13} />} {r.nombre}
                  </button>
                )}
              </span>
            ))}
          </nav>
          {puede.buscar && (
            <div className="relative w-72 max-w-full">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar en todo el archivo…" aria-label="Buscar en todo el archivo"
                className="w-full h-8 pl-8 pr-7 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[12px] focus:outline-none focus:border-[#2383C2]" />
              {busqueda && (
                <button type="button" onClick={() => setBusqueda('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"><X size={13} /></button>
              )}
            </div>
          )}
        </div>
      )}

      {subidasVisibles && (
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-700 space-y-1 max-h-40 overflow-y-auto">
          <div className="flex items-center text-[11px] font-semibold text-gray-500 dark:text-gray-400">
            <span className="flex-1">Subidas</span>
            <button type="button" onClick={() => setSubidas((prev) => prev.filter((s) => !s.listo && !s.error))} className="text-[#2383C2] hover:underline">Limpiar</button>
          </div>
          {subidas.map((s) => (
            <div key={s.id} className="flex items-start gap-2 text-[11.5px]">
              {s.error ? <AlertCircle size={14} className="text-red-500 shrink-0 mt-px" />
                : s.listo ? <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-px" />
                  : <Loader2 size={14} className="animate-spin text-[#2383C2] shrink-0 mt-px" />}
              <div className="flex-1 min-w-0">
                <div className="flex gap-2">
                  <span className="truncate text-gray-700 dark:text-gray-200">{s.nombre}</span>
                  {!s.error && !s.listo && <span className="ml-auto text-gray-400">{s.progreso}%</span>}
                </div>
                {s.error && <p className="text-red-600">{s.error}</p>}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-auto relative" {...eventosArrastre}>
        {arrastrando && (
          <div className="absolute inset-2 z-20 rounded-lg border-2 border-dashed border-[#2383C2] bg-[#2383C2]/5 flex flex-col items-center justify-center pointer-events-none">
            <Upload size={28} className="text-[#2383C2] mb-2" />
            <p className="text-[13px] font-semibold text-[#2383C2]">Suelta los archivos para subirlos a “{ruta[ruta.length - 1].nombre}”</p>
            <p className="text-[11.5px] text-gray-500">{FORMATOS_TEXTO} · hasta {TAMANO_MAXIMO_MB} MB</p>
          </div>
        )}
        {!puede.verTabla ? (
          <p className="text-center text-[12px] text-gray-400 py-10">No tienes permiso para ver el contenido del archivo.</p>
        ) : (
          <table className="w-full text-left text-[12px] border-collapse table-fixed">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
              <tr className="text-[10.5px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {verColumna('nombre') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold">Nombre</th>
                )}
                {verColumna('tamano') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-24">{enPapelera ? 'Contenido' : 'Tamaño'}</th>
                )}
                {verColumna('subidoEl') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-36">{enPapelera ? 'Eliminado el' : 'Fecha'}</th>
                )}
                {verColumna('subidoPor') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-44">{enPapelera ? 'Eliminado por' : 'Subido por'}</th>
                )}
                {verColumna('acciones') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-40 text-center">Acciones</th>
                )}
              </tr>
            </thead>
            <tbody>
              {cargando && (
                <tr><td colSpan={columnasTabla.length} className="py-10 text-center text-gray-400"><Loader2 size={16} className="inline animate-spin mr-1" /> Cargando…</td></tr>
              )}
              {!cargando && error && (
                <tr><td colSpan={columnasTabla.length} className="py-10 text-center text-red-600">{error}</td></tr>
              )}
              {!cargando && !error && lista.length === 0 && (
                <tr><td colSpan={columnasTabla.length} className="py-10 text-center text-gray-400">
                  {enPapelera ? 'La papelera está vacía.'
                    : buscando ? 'Ningún archivo o carpeta coincide con la búsqueda.'
                      : puede.subir ? 'Esta carpeta está vacía. Arrastra archivos aquí o usa “Subir archivos”.' : 'Esta carpeta está vacía.'}
                </td></tr>
              )}
              {!cargando && !error && lista.map((n) => (
                <tr key={n.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30">
                  {verColumna('nombre') && (
                    <td className={celda} title={n.nombre}>
                      {enPapelera ? (
                        <span className="inline-flex items-center gap-2 min-w-0 max-w-full"><IconoNodo nodo={n} /><span className="truncate">{n.nombre}</span></span>
                      ) : (
                        <button type="button" onClick={() => abrir(n)} disabled={n.tipo === 'archivo' && !puede.ver}
                          className="inline-flex items-center gap-2 min-w-0 max-w-full text-left hover:text-[#2383C2] disabled:hover:text-inherit disabled:cursor-default">
                          <IconoNodo nodo={n} />
                          <span className="min-w-0">
                            <span className={`block truncate ${n.tipo === 'carpeta' ? 'font-semibold' : ''}`}>{n.nombre}</span>
                            {buscando && <span className="block truncate text-[10.5px] text-gray-400">{n.ubicacion}</span>}
                          </span>
                        </button>
                      )}
                    </td>
                  )}
                  {verColumna('tamano') && (
                    <td className={`${celda} text-gray-500`}>
                      {enPapelera
                        ? (n.tipo === 'carpeta' ? `${plural(n.archivos, 'archivo', 'archivos')}${n.carpetas ? `, ${plural(n.carpetas, 'carpeta', 'carpetas')}` : ''}` : formatearTamano(n.tamano))
                        : n.tipo === 'carpeta' ? '—' : formatearTamano(n.tamano)}
                    </td>
                  )}
                  {verColumna('subidoEl') && (
                    <td className={celda}>{fechaHora(enPapelera ? n.eliminadoEl : n.subidoEl)}</td>
                  )}
                  {verColumna('subidoPor') && (
                    <td className={celda} title={enPapelera ? n.eliminadoPor : n.subidoPorNombre}>{enPapelera ? n.eliminadoPor : n.subidoPorNombre}</td>
                  )}
                  {verColumna('acciones') && (
                    <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700/60 text-center whitespace-nowrap">
                      {ocupado === n.id ? <Loader2 size={14} className="inline animate-spin text-gray-400" /> : enPapelera ? (
                        <>
                          {puede.restaurar && <button type="button" onClick={() => restaurar(n)} className={BTN_ICONO} title="Restaurar" aria-label={`Restaurar ${n.nombre}`}><RotateCcw size={14} /></button>}
                          {puede.eliminarDefinitivo && <button type="button" onClick={() => eliminarDefinitivo(n)} className={`${BTN_ICONO} hover:!text-red-600`} title="Eliminar definitivamente" aria-label={`Eliminar definitivamente ${n.nombre}`}><Trash2 size={14} /></button>}
                        </>
                      ) : (
                        <>
                          {n.tipo === 'archivo' && puede.ver && <button type="button" onClick={() => abrir(n)} className={BTN_ICONO} title="Ver" aria-label={`Ver ${n.nombre}`}><Eye size={14} /></button>}
                          {n.tipo === 'archivo' && puede.descargar && <button type="button" onClick={() => descargar(n)} className={BTN_ICONO} title="Descargar" aria-label={`Descargar ${n.nombre}`}><Download size={14} /></button>}
                          {puedeSobre(n, 'renombrar') && <button type="button" onClick={() => setDialogo({ tipo: 'renombrar', nodo: n })} className={BTN_ICONO} title="Renombrar" aria-label={`Renombrar ${n.nombre}`}><Pencil size={14} /></button>}
                          {puedeSobre(n, 'mover') && <button type="button" onClick={() => setDialogo({ tipo: 'mover', nodo: n })} className={BTN_ICONO} title="Mover" aria-label={`Mover ${n.nombre}`}><FolderInput size={14} /></button>}
                          {puedeSobre(n, 'eliminar') && <button type="button" onClick={() => eliminar(n)} className={`${BTN_ICONO} hover:!text-red-600`} title="Enviar a la papelera" aria-label={`Eliminar ${n.nombre}`}><Trash2 size={14} /></button>}
                        </>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {dialogo?.tipo === 'carpeta' && (
        <DialogoNombre titulo={`Nueva carpeta en “${ruta[ruta.length - 1].nombre}”`} textoAceptar="Crear" onAceptar={alCrearCarpeta} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'renombrar' && (
        <DialogoNombre titulo={dialogo.nodo.tipo === 'carpeta' ? 'Renombrar carpeta' : 'Renombrar archivo'} inicial={dialogo.nodo.nombre}
          onAceptar={(nombre) => alRenombrar(dialogo.nodo, nombre)} onCerrar={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'mover' && (
        <DialogoMover indice={indice} nodo={dialogo.nodo} onMover={(destino) => alMover(dialogo.nodo, destino)} onCerrar={() => setDialogo(null)} />
      )}
      {visor !== null && archivosVisibles[visor] && (
        <VisorDocumentoModal
          documentos={archivosVisibles.map((a) => ({ ruta: a.ruta, nombre: a.nombre, tamano: a.tamano, subidoEl: a.subidoEl }))}
          indiceInicial={visor}
          describir={(d) => `${formatearTamano(d.tamano)} · ${fechaHora(d.subidoEl)}`}
          puedeDescargar={puede.descargar}
          onCerrar={() => setVisor(null)}
        />
      )}
    </div>
  );
};

export default ArchivoDigital;
