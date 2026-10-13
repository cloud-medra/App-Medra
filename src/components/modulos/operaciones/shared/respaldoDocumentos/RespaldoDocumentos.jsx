import { useEffect, useMemo, useState } from 'react';
import { Archive, Upload, Search, Eye, Download, Trash2, RotateCcw, Loader2, Trash, FileText } from 'lucide-react';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import { obtenerBlobDocumento } from '../documentosAdmision/documentosStorage';
import { mensajeErrorStorage } from '../documentosAdmision/documentosHelpers';
import { VisorDocumentoModal } from '../documentosAdmision/VisorDocumentoModal';
import { moduloGestion } from '../modulosGestion';
import FormularioRespaldo from './FormularioRespaldo';
import { TIPOS_DOCUMENTO, filtrarRespaldos, ordenarRespaldos } from './respaldoHelpers';
import { escucharRespaldos, enviarRespaldoAPapelera, restaurarRespaldo, eliminarRespaldoDefinitivo } from './respaldoService';

// Respaldo de documentos (Implantes y Hemodinamia): PDF cuyo ID / N° de Admisión no
// coincide con ninguna gestión. Tabla ordenada por fecha (más reciente
// primero), búsqueda por ID o nombre, filtro por tipo, y papelera.


// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_documentos' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'idAdmision', label: 'ID / N° Admisión' },
  { key: 'nombre', label: 'Nombre' },
  { key: 'tipo', label: 'Tipo' },
  { key: 'fecha', label: 'Fecha' },
  { key: 'subidoPor', label: 'Subido por' },
  { key: 'subidoEl', label: 'Fecha de subida' },
  { key: 'acciones', label: 'Acciones' }
];

const ddmmaaaa = (iso) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split('-').reverse().join('-') : iso || '—');
const fechaHora = (ts) => {
  const d = ts?.toDate ? ts.toDate() : null;
  return d ? d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : '—';
};
const etiquetaTipo = (id) => TIPOS_DOCUMENTO.find((t) => t.id === id)?.label || id;

const BTN_ICONO = 'p-1 rounded text-gray-500 hover:text-[#2383C2] hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-40';

// `modulo`: Implantes o Hemodinamia (ver modulosGestion.js).
const RespaldoDocumentos = ({ modulo }) => {
  const config = moduloGestion(modulo);
  const PATH_VISTA = config.rutas.respaldo;
  const { hasPermission } = useGranularPermission();
  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_documentos', COLUMNAS_TABLA);
  const puede = {
    subir: hasPermission(PATH_VISTA, 'acciones', 'btn_subir'),
    buscar: hasPermission(PATH_VISTA, 'filtros', 'input_busqueda'),
    filtrarTipo: hasPermission(PATH_VISTA, 'filtros', 'select_tipo'),
    verTabla: hasPermission(PATH_VISTA, 'tabla_documentos'),
    ver: hasPermission(PATH_VISTA, 'tabla_documentos', 'btn_ver'),
    descargar: hasPermission(PATH_VISTA, 'tabla_documentos', 'btn_descargar'),
    eliminar: hasPermission(PATH_VISTA, 'tabla_documentos', 'btn_eliminar'),
    papelera: hasPermission(PATH_VISTA, 'papelera'),
    restaurar: hasPermission(PATH_VISTA, 'papelera', 'btn_restaurar'),
    eliminarDefinitivo: hasPermission(PATH_VISTA, 'papelera', 'btn_eliminar_definitivo'),
  };

  const [docs, setDocs] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [vista, setVista] = useState('documentos');
  const [busqueda, setBusqueda] = useState('');
  const [tipo, setTipo] = useState('');
  const [formAbierto, setFormAbierto] = useState(false);
  const [visor, setVisor] = useState(null); // índice en `lista`
  const [ocupado, setOcupado] = useState(null); // id en proceso

  useEffect(() => escucharRespaldos(
    modulo,
    (lista) => { setDocs(lista); setCargando(false); setError(null); },
    (err) => { console.error('Error al cargar el respaldo de documentos:', err); setError('No se pudo cargar el respaldo de documentos.'); setCargando(false); }
  ), [modulo]);

  const enPapelera = vista === 'papelera';
  const lista = useMemo(
    () => ordenarRespaldos(filtrarRespaldos(docs.filter((d) => Boolean(d.eliminado) === enPapelera), { busqueda, tipo })),
    [docs, enPapelera, busqueda, tipo]
  );
  const totalPapelera = docs.filter((d) => d.eliminado).length;

  const descargar = async (d) => {
    setOcupado(d.id);
    try {
      const url = URL.createObjectURL(await obtenerBlobDocumento(d.ruta));
      const a = document.createElement('a');
      a.href = url;
      a.download = d.nombreArchivo;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      showToast(mensajeErrorStorage(err), 'error');
    } finally {
      setOcupado(null);
    }
  };

  const ejecutar = async (d, accion, exito) => {
    setOcupado(d.id);
    try {
      await accion();
      showToast(exito, 'success');
    } catch (err) {
      console.error(err);
      showToast(err?.code === 'permission-denied' || err?.code === 'storage/unauthorized'
        ? 'No tienes permiso para esta acción.' : 'No se pudo completar la acción.', 'error');
    } finally {
      setOcupado(null);
    }
  };

  const eliminar = (d) => confirmAction(
    'Enviar a la papelera',
    `"${d.nombreArchivo}" se moverá a la papelera. Podrás restaurarlo desde allí.`,
    () => ejecutar(d, () => enviarRespaldoAPapelera(modulo, d.id, userData?.nombreCompleto), 'Documento enviado a la papelera.'),
    { confirmText: 'Enviar a la papelera', type: 'warning' }
  );
  const restaurar = (d) => ejecutar(d, () => restaurarRespaldo(modulo, d.id), 'Documento restaurado.');
  const eliminarDefinitivo = (d) => confirmAction(
    'Eliminar definitivamente',
    `"${d.nombreArchivo}" se borrará para siempre y no se podrá recuperar.`,
    () => ejecutar(d, () => eliminarRespaldoDefinitivo(modulo, d), 'Documento eliminado definitivamente.'),
    { confirmText: 'Eliminar para siempre', type: 'danger' }
  );

  const celda = 'px-3 py-2 border-b border-gray-100 dark:border-gray-700/60 text-gray-700 dark:text-gray-200 truncate';

  return (
    <div className="h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex flex-wrap items-center gap-3">
        <Archive size={18} className="text-[#2383C2]" />
        <div className="flex-1 min-w-0">
          <h2 className="text-[14px] font-semibold text-gray-800 dark:text-gray-100">Respaldo de documentos</h2>
          <p className="text-[11.5px] text-gray-500 dark:text-gray-400">PDF cuyo ID / N° de Admisión no coincide con ninguna gestión de {config.etiqueta}.</p>
        </div>
        {puede.subir && !enPapelera && (
          <button type="button" onClick={() => setFormAbierto(true)}
            className="h-8 px-3.5 rounded-md bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[12px] font-semibold inline-flex items-center gap-1.5">
            <Upload size={14} /> Subir documentos
          </button>
        )}
      </div>

      <div className="px-4 pt-2 flex gap-1 border-b border-gray-200 dark:border-gray-700" role="tablist">
        {[
          { id: 'documentos', label: 'Documentos', icon: FileText },
          ...(puede.papelera ? [{ id: 'papelera', label: `Papelera${totalPapelera ? ` (${totalPapelera})` : ''}`, icon: Trash }] : []),
        ].map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={vista === t.id} onClick={() => setVista(t.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-[12px] font-semibold border-b-2 -mb-px ${vista === t.id ? 'border-[#2383C2] text-[#2383C2]' : 'border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'}`}>
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>

      <div className="px-4 py-2.5 flex flex-wrap items-center gap-2 border-b border-gray-100 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-900/30">
        {puede.buscar && (
          <div className="relative w-72 max-w-full">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por ID o nombre…" aria-label="Buscar por ID o nombre"
              className="w-full h-8 pl-8 pr-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[12px] focus:outline-none focus:border-[#2383C2]" />
          </div>
        )}
        {puede.filtrarTipo && (
          <select value={tipo} onChange={(e) => setTipo(e.target.value)} aria-label="Filtrar por tipo"
            className="h-8 px-2 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-[12px] focus:outline-none focus:border-[#2383C2]">
            <option value="">Todos los tipos</option>
            {TIPOS_DOCUMENTO.map((t) => <option key={t.id} value={t.id}>{t.id} — {t.label}</option>)}
          </select>
        )}
        <span className="ml-auto text-[11.5px] text-gray-500 dark:text-gray-400">{lista.length} documento(s)</span>
      </div>

      <div className="flex-1 overflow-auto">
        {!puede.verTabla ? (
          <p className="text-center text-[12px] text-gray-400 py-10">No tienes permiso para ver la tabla de documentos.</p>
        ) : (
          <table className="w-full text-left text-[12px] border-collapse table-fixed">
            <thead className="bg-gray-50 dark:bg-gray-900 sticky top-0 z-10">
              <tr className="text-[10.5px] uppercase tracking-wide text-gray-500 dark:text-gray-400">
                {verColumna('idAdmision') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-32">ID / N° Admisión</th>
                )}
                {verColumna('nombre') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold">Nombre</th>
                )}
                {verColumna('tipo') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-48">Tipo</th>
                )}
                {verColumna('fecha') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-28">Fecha</th>
                )}
                {verColumna('subidoPor') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-44">{enPapelera ? 'Eliminado por' : 'Subido por'}</th>
                )}
                {verColumna('subidoEl') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-36">{enPapelera ? 'Eliminado el' : 'Fecha de subida'}</th>
                )}
                {verColumna('acciones') && (
                  <th className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 font-semibold w-28 text-center">Acciones</th>
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
                  {enPapelera ? 'La papelera está vacía.' : busqueda || tipo ? 'Ningún documento coincide con la búsqueda.' : 'Aún no hay documentos en el respaldo.'}
                </td></tr>
              )}
              {!cargando && !error && lista.map((d, i) => (
                <tr key={d.id} className="hover:bg-gray-50/80 dark:hover:bg-gray-700/30">
                  {verColumna('idAdmision') && (
                    <td className={`${celda} font-semibold`} title={d.idAdmision}>{d.idAdmision}</td>
                  )}
                  {verColumna('nombre') && (
                    <td className={celda} title={d.nombreArchivo}>{d.nombre}</td>
                  )}
                  {verColumna('tipo') && (
                    <td className={celda} title={etiquetaTipo(d.tipo)}>
                      <span className="inline-block text-[10.5px] font-bold px-1.5 py-0.5 rounded bg-[#2383C2]/10 text-[#2383C2] mr-1">{d.tipo}</span>
                      <span className="text-gray-500 dark:text-gray-400">{etiquetaTipo(d.tipo)}</span>
                    </td>
                  )}
                  {verColumna('fecha') && (
                    <td className={celda}>{ddmmaaaa(d.fecha)}</td>
                  )}
                  {verColumna('subidoPor') && (
                    <td className={celda} title={enPapelera ? d.eliminadoPor : d.subidoPorNombre}>{enPapelera ? d.eliminadoPor : d.subidoPorNombre}</td>
                  )}
                  {verColumna('subidoEl') && (
                    <td className={celda}>{fechaHora(enPapelera ? d.eliminadoEl : d.subidoEl)}</td>
                  )}
                  {verColumna('acciones') && (
                    <td className="px-3 py-1.5 border-b border-gray-100 dark:border-gray-700/60 text-center whitespace-nowrap">
                      {ocupado === d.id ? <Loader2 size={14} className="inline animate-spin text-gray-400" /> : enPapelera ? (
                        <>
                          {puede.restaurar && <button type="button" onClick={() => restaurar(d)} className={BTN_ICONO} title="Restaurar" aria-label={`Restaurar ${d.nombreArchivo}`}><RotateCcw size={14} /></button>}
                          {puede.eliminarDefinitivo && <button type="button" onClick={() => eliminarDefinitivo(d)} className={`${BTN_ICONO} hover:!text-red-600`} title="Eliminar definitivamente" aria-label={`Eliminar definitivamente ${d.nombreArchivo}`}><Trash2 size={14} /></button>}
                        </>
                      ) : (
                        <>
                          {puede.ver && <button type="button" onClick={() => setVisor(i)} className={BTN_ICONO} title="Ver" aria-label={`Ver ${d.nombreArchivo}`}><Eye size={14} /></button>}
                          {puede.descargar && <button type="button" onClick={() => descargar(d)} className={BTN_ICONO} title="Descargar" aria-label={`Descargar ${d.nombreArchivo}`}><Download size={14} /></button>}
                          {puede.eliminar && <button type="button" onClick={() => eliminar(d)} className={`${BTN_ICONO} hover:!text-red-600`} title="Enviar a la papelera" aria-label={`Eliminar ${d.nombreArchivo}`}><Trash2 size={14} /></button>}
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

      {formAbierto && <FormularioRespaldo modulo={modulo} onCerrar={() => setFormAbierto(false)} />}
      {visor !== null && lista[visor] && (
        <VisorDocumentoModal
          documentos={lista.map((d) => ({ ruta: d.ruta, nombre: d.nombreArchivo, tipo: d.tipo, fecha: d.fecha }))}
          indiceInicial={visor}
          describir={(d) => `${d.tipo} — ${etiquetaTipo(d.tipo)} · ${ddmmaaaa(d.fecha)}`}
          puedeDescargar={puede.descargar}
          onCerrar={() => setVisor(null)}
        />
      )}
    </div>
  );
};

export default RespaldoDocumentos;
