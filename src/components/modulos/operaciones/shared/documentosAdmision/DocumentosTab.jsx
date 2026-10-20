import { useState, useMemo } from 'react';
import { FileText, UploadCloud, Eye, Download, Loader2, AlertCircle, RefreshCw, FolderOpen, CheckCircle2, XCircle, HelpCircle, Copy, ChevronUp, Archive, Trash2 } from 'lucide-react';
import { doc } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';
import { useToast } from '../../../../../context/ToastContext';
import { useUser } from '../../../../../context/UserContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import FormularioRespaldo from '../respaldoDocumentos/FormularioRespaldo';
import {
  TIPOS_DOCUMENTO,
  TAMANO_MAXIMO_MB,
  clasificarArchivos,
  superaTamanoMaximo,
  mensajeErrorStorage,
  mensajeErrorEliminar,
  ordenarDocumentos
} from './documentosHelpers';
import { subirTandaAdmision, obtenerBlobDocumento, eliminarDocumentoAdmision } from './documentosStorage';
import { ZonaSubidaPdf } from './ZonaSubidaPdf';
import { construirTextoAdmisionNombre } from '../../implantes/gestionImplantes/utils/gestionesImportExport';
import { VisorDocumentoModal } from './VisorDocumentoModal';
import { IconoArchivo } from './IconoArchivo';
import { ConfirmarEliminarDocumento } from './ConfirmarEliminarDocumento';
import { moduloGestion } from '../modulosGestion';
import { registrarLogImplantes } from '../../implantes/gestionImplantes/utils/registrarLogImplantes';
import { registrarLogHemodinamia } from '../../hemodinamia/gestionHemodinamia/utils/registrarLogHemodinamia';

const SIN_TIPO = 'SIN_TIPO';

// Log "Documento eliminado" en la pestaña Logs del bloque activo.
const REGISTRAR_LOG = { implantes: registrarLogImplantes, hemodinamia: registrarLogHemodinamia };


// Pestaña Documentos: PDF de la admisión en Storage. Los archivos se suben
// con su nombre original; id y tipo se leen del nombre, con las mismas reglas
// que Carga masiva de documentos (shared/documentosAdmision).
// Pestaña compartida por Implantes y Hemodinamia (`modulo`, ver
// modulosGestion.js): cada uno en su carpeta de Storage.
// El listado vive en el padre (el detalle de la gestión, ver
// useDocumentosAdmision) para que
// cambiar de pestaña no lo vuelva a pedir; acá solo se muestra y, al terminar
// una tanda de subida, se le entrega el listado actualizado en memoria.
// Eliminar (acción btn_eliminar_documento) va por la Cloud Function
// eliminarDocumentoAdmision, que también valida el permiso; `refPathBloque`
// es el bloque activo, donde queda el log.
export const DocumentosTab = ({
  modulo = 'implantes',
  idAdmision,
  gestionId,
  nombre,
  handleCopiarTexto,
  documentos,
  onRecargar,
  onDocumentosSubidos,
  onDocumentoEliminado,
  refPathBloque
}) => {
  const { showToast } = useToast();
  const { userData } = useUser();
  const [progreso, setProgreso] = useState(null); // { actual, total, porcentaje }
  const [resumen, setResumen] = useState(null);   // { subidos: [], rechazados: [] }
  const [abriendoRuta, setAbriendoRuta] = useState(null);
  const [mostrarSubida, setMostrarSubida] = useState(false);
  const [visorIndice, setVisorIndice] = useState(null);  // índice en `ordenados`

  // PDF rechazados por id distinto o ilegible: se pueden enviar al Respaldo
  // de documentos (con ID, nombre y tipo leídos del nombre del archivo).
  const { hasPermission } = useGranularPermission();
  const config = moduloGestion(modulo);
  // Solo si el módulo tiene Respaldo de documentos.
  const puedeRespaldar = Boolean(config.rutas.respaldo) && hasPermission(config.rutas.respaldo, 'acciones', 'btn_subir');
  const puedeEliminar = Boolean(onDocumentoEliminado) && hasPermission(config.rutas.documentos, 'contenido', 'btn_eliminar_documento');
  const [porEliminar, setPorEliminar] = useState(null); // documento a confirmar
  const [eliminando, setEliminando] = useState(false);
  const [respaldoAbierto, setRespaldoAbierto] = useState(false);
  const respaldables = (resumen?.rechazados || []).filter((r) => r.respaldable && r.file);
  const alEnviarARespaldo = (files) => setResumen((prev) => prev && ({
    ...prev,
    rechazados: prev.rechazados.map((r) => (files.includes(r.file)
      ? { ...r, respaldable: false, motivo: `${r.motivo} Se envió al Respaldo de documentos.` }
      : r)),
  }));

  const sinAdmision = !idAdmision;
  const { lista = [], cargando, error: errorListado } = documentos || {};

  const grupos = useMemo(() => {
    const porTipo = new Map();
    ordenarDocumentos(lista).forEach(d => {
      const clave = d.tipo || SIN_TIPO;
      if (!porTipo.has(clave)) porTipo.set(clave, []);
      porTipo.get(clave).push(d);
    });
    return [...porTipo.entries()];
  }, [lista]);

  // Mismo orden que se ve en pantalla (por grupo): lo recorre el visor.
  const ordenados = useMemo(() => grupos.flatMap(([, docs]) => docs), [grupos]);

  // Clic (selector múltiple) y arrastrar/soltar entran por aquí. Lo que
  // react-dropzone rechaza por tipo (`accept`) se suma a lo aceptado para que
  // pase por la misma validación y quede en el resumen con su motivo.
  const handleSubir = async (archivos) => {
    if (archivos.length === 0 || cargando || errorListado) return;
    setResumen(null);

    // 1) Validación en el navegador, sin Firebase: PDF + id del nombre.
    const { validos, rechazados: rechazadosIniciales } = clasificarArchivos(archivos, idAdmision);
    const rechazados = [...rechazadosIniciales];
    const aSubir = validos.filter(file => {
      if (!superaTamanoMaximo(file)) return true;
      rechazados.push({ nombre: file.name, motivo: `Supera el máximo de ${TAMANO_MAXIMO_MB} MB. No se subió.` });
      return false;
    });

    // 2) Subida de a uno (sufijos "(2)" considerando también esta tanda); el
    // listado se arma en memoria.
    const { lista: listaTrabajo, subidos, fallidos } = await subirTandaAdmision({
      modulo,
      idAdmision,
      archivos: aSubir,
      listaInicial: lista,
      onProgreso: (indice, porcentaje) => setProgreso({ actual: indice + 1, total: aSubir.length, porcentaje })
    });
    rechazados.push(...fallidos);
    setProgreso(null);

    // 3) Una sola actualización del listado en memoria (sin volver a listar).
    if (subidos.length > 0) onDocumentosSubidos(listaTrabajo);

    setResumen({ subidos, rechazados });

    const sinTipo = subidos.filter(d => !d.tipo);
    if (subidos.length > 0) showToast(`${subidos.length} documento(s) subido(s).`, 'success');
    if (rechazados.length > 0) {
      showToast(rechazados.length === 1 ? rechazados[0].motivo : `${rechazados.length} archivo(s) no se subieron. Revisa el resumen.`, 'error');
    }
    if (sinTipo.length > 0) {
      showToast(`${sinTipo.length} archivo(s) subido(s) sin tipo reconocido (DP, RP, INF o COT). Revisa el resumen.`, 'warning');
    }
  };

  const conBlob = async (docObj, accion) => {
    setAbriendoRuta(docObj.ruta);
    try {
      const blob = await obtenerBlobDocumento(docObj.ruta);
      const url = URL.createObjectURL(blob);
      accion(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      console.error(`Error al abrir documento de ${modulo}:`, err);
      showToast(mensajeErrorStorage(err), 'error');
    } finally {
      setAbriendoRuta(null);
    }
  };

  const handleDescargar = (docObj) => conBlob(docObj, (url) => {
    const a = document.createElement('a');
    a.href = url;
    a.download = docObj.nombre;
    a.click();
  });

  // La función mueve el PDF a la papelera y deja auditoría; si ya no
  // existía, igual se quita del listado (con aviso). Ante un error no cambia
  // nada: la función revierte lo que alcanzó a hacer.
  const handleEliminar = async () => {
    const docObj = porEliminar;
    setEliminando(true);
    try {
      const { resultado, rutaPapelera } = await eliminarDocumentoAdmision({ modulo, idAdmision, ruta: docObj.ruta });
      onDocumentoEliminado(docObj.ruta);
      if (refPathBloque) {
        REGISTRAR_LOG[modulo]?.(doc(db, refPathBloque), 'DOCUMENTO_ELIMINADO', {
          nombre: docObj.nombre,
          idAdmision,
          rutaPapelera: rutaPapelera || null,
          archivoInexistente: resultado === 'inexistente',
        }, userData);
      }
      if (resultado === 'inexistente') {
        showToast(`"${docObj.nombre}" ya no existía en el almacenamiento; se quitó del listado.`, 'warning');
      } else {
        showToast('Documento eliminado.', 'success');
      }
    } catch (err) {
      console.error(`Error al eliminar documento de ${modulo}:`, err);
      showToast(mensajeErrorEliminar(err), 'error');
    } finally {
      setEliminando(false);
      setPorEliminar(null);
    }
  };

  const sinTipoSubidos = resumen?.subidos.filter(d => !d.tipo) || [];
  const listadoListo = !sinAdmision && !cargando && !errorListado;
  const subidaDeshabilitada = sinAdmision || cargando || Boolean(errorListado);
  // La zona de subida se despliega con el botón del encabezado; queda
  // abierta mientras sube y cuando la admisión aún no tiene documentos.
  const zonaSubidaVisible = !subidaDeshabilitada && (mostrarSubida || Boolean(progreso) || lista.length === 0);

  return (
    <div className="flex-grow overflow-y-auto p-3">
      <div className="bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700/80 rounded-lg shadow-xs overflow-hidden">

        {/* ENCABEZADO */}
        <div className="px-3 py-2 bg-slate-50/80 dark:bg-gray-800/80 border-b border-slate-200 dark:border-gray-700 flex items-center gap-2 flex-wrap">
          <FolderOpen size={14} className="text-[#2383C2] shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h3 className="text-[11px] font-bold text-slate-700 dark:text-gray-200 uppercase tracking-wide">
                Documentos de la Admisión
              </h3>
              {listadoListo && (
                <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-slate-200/80 dark:bg-gray-700 text-slate-600 dark:text-gray-300">
                  {lista.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1 text-[10px] text-slate-500 dark:text-gray-400 min-w-0">
              <span className="truncate">Admisión #{gestionId || 'N/A'} - {nombre || 'P'}</span>
              {handleCopiarTexto && (
                <button
                  type="button"
                  onClick={() => handleCopiarTexto(construirTextoAdmisionNombre(gestionId, nombre))}
                  title="Copiar Admisión - Nombre"
                  className="p-0.5 rounded text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition shrink-0"
                >
                  <Copy size={11} />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {!sinAdmision && (
              <button
                type="button"
                onClick={onRecargar}
                disabled={cargando}
                title="Actualizar listado"
                className="h-7 w-7 inline-flex items-center justify-center rounded border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-slate-500 dark:text-gray-400 hover:border-[#2383C2] hover:text-[#2383C2] disabled:opacity-40 transition"
              >
                <RefreshCw size={12} className={cargando ? 'animate-spin' : ''} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setMostrarSubida(v => !v)}
              disabled={subidaDeshabilitada}
              className="h-7 px-2.5 inline-flex items-center gap-1.5 rounded bg-[#2383C2] hover:bg-[#1d6fa5] text-white text-[10.5px] font-semibold disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {zonaSubidaVisible && lista.length > 0 && !progreso ? <ChevronUp size={13} /> : <UploadCloud size={13} />}
              Subir documentos
            </button>
          </div>
        </div>

        {sinAdmision && (
          <div className="m-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-[11px] text-amber-700 dark:text-amber-400">
            <AlertCircle size={14} className="shrink-0" />
            Guarda primero el ID de admisión en Información para ver y subir documentos.
          </div>
        )}

        {/* SUBIDA (misma lógica de siempre; solo se despliega desde el encabezado) */}
        {zonaSubidaVisible && (
          <div className="p-3 flex flex-col gap-2 border-b border-slate-200 dark:border-gray-700 bg-slate-50/40 dark:bg-gray-900/20">
            <p className="text-[10px] text-slate-500 dark:text-gray-400">
              PDF ya nombrados, por ejemplo{' '}
              <strong className="text-slate-700 dark:text-gray-200">{idAdmision || '102030'} - JOSE PEREZ - DP.pdf</strong> o{' '}
              <strong className="text-slate-700 dark:text-gray-200">{idAdmision || '102030'} - JOSE PEREZ - COT 12345678 - EMPRESA.pdf</strong>.
              Solo se suben los que comienzan con el id de esta admisión.
            </p>
            <ZonaSubidaPdf
              onArchivos={handleSubir}
              deshabilitada={subidaDeshabilitada}
              progreso={progreso}
            />
          </div>
        )}

        {resumen && (resumen.subidos.length > 0 || resumen.rechazados.length > 0) && (
          <div className="m-3 space-y-2 text-[10px]">
            {resumen.subidos.length > 0 && (
              <div className="px-3 py-2 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-800 dark:text-emerald-300">
                <div className="flex items-center gap-1.5 font-semibold mb-1">
                  <CheckCircle2 size={13} className="shrink-0" /> Subidos ({resumen.subidos.length})
                </div>
                <ul className="space-y-0.5 pl-5 list-disc">
                  {resumen.subidos.map(d => (
                    <li key={d.ruta} className="break-all">
                      {d.nombre}
                      {d.nombre !== d.nombreOriginal && <span className="text-emerald-700/80 dark:text-emerald-400/80"> (original: {d.nombreOriginal})</span>}
                      {!d.tipo && <span className="font-semibold text-amber-700 dark:text-amber-400"> — Sin tipo</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {sinTipoSubidos.length > 0 && (
              <div className="flex items-start gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-400">
                <HelpCircle size={13} className="shrink-0 mt-0.5" />
                <span>
                  No se reconoció el tipo (DP, RP, INF o COT) de {sinTipoSubidos.length} archivo(s): se subieron igual y quedan en "Sin tipo".
                  Revisa que el nombre siga el formato "{idAdmision} - PACIENTE - TIPO".
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
                      title="Guárdalos en Respaldo de documentos con su propio ID"
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

        {/* LISTADO */}
        {sinAdmision ? null : cargando ? (
          <div className="p-3 space-y-2" aria-busy="true" aria-label="Cargando documentos">
            {[0, 1, 2].map(i => (
              <div key={i} className="flex items-center gap-2 animate-pulse">
                <div className="w-7 h-7 rounded bg-slate-100 dark:bg-gray-700" />
                <div className="h-3 flex-1 max-w-[60%] rounded bg-slate-100 dark:bg-gray-700" />
                <div className="h-3 w-16 rounded bg-slate-100 dark:bg-gray-700 ml-auto" />
              </div>
            ))}
            <p className="flex items-center gap-1.5 pt-1 text-[10px] text-slate-400 dark:text-gray-500">
              <Loader2 size={12} className="animate-spin" /> Cargando documentos...
            </p>
          </div>
        ) : errorListado ? (
          <div className="flex flex-col items-center gap-2 py-8 text-[10.5px] text-red-600 dark:text-red-400">
            <span className="flex items-center gap-1.5"><AlertCircle size={13} /> {errorListado}</span>
            <button
              type="button"
              onClick={onRecargar}
              className="flex items-center gap-1 px-2 py-1 rounded border border-slate-300 dark:border-gray-600 text-slate-600 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700/50"
            >
              <RefreshCw size={11} /> Reintentar
            </button>
          </div>
        ) : lista.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-center gap-1.5 py-10 px-4">
            <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-gray-700/60 flex items-center justify-center mb-1">
              <FileText size={18} className="text-slate-400 dark:text-gray-500" />
            </div>
            <p className="text-[11px] font-semibold text-slate-600 dark:text-gray-300">Esta admisión aún no tiene documentos</p>
            <p className="text-[10px] text-slate-400 dark:text-gray-500">Sube los PDF arrastrándolos a la zona de arriba o con "Subir documentos".</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {/* Ancho según contenido: solo el nombre se estira (hasta un máximo, con "..."). */}
            <table className="w-auto max-w-full text-left text-[10.5px] border-collapse">
              <thead className="bg-slate-50 dark:bg-gray-900/60">
                <tr className="text-slate-500 dark:text-gray-400 uppercase font-bold text-[9px] whitespace-nowrap">
                  <th className="px-3 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Categoría</th>
                  <th className="pl-3 pr-1 py-1.5 border-b border-r border-slate-200 dark:border-gray-700"><span className="sr-only">Ícono</span></th>
                  <th className="pl-1 pr-3 py-1.5 border-b border-r border-slate-200 dark:border-gray-700">Nombre del documento</th>
                  <th className="px-3 py-1.5 border-b border-slate-200 dark:border-gray-700 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {grupos.map(([clave, docs]) => {
                  const tipoInfo = TIPOS_DOCUMENTO.find(t => t.id === clave);
                  return (
                    <GrupoDocumentos
                      key={clave}
                      titulo={tipoInfo ? `${tipoInfo.id} — ${tipoInfo.label}` : 'Sin tipo'}
                      docs={docs}
                      abriendoRuta={abriendoRuta}
                      onVer={(d) => setVisorIndice(ordenados.indexOf(d))}
                      onDescargar={handleDescargar}
                      onEliminar={puedeEliminar ? setPorEliminar : null}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {respaldoAbierto && (
        <FormularioRespaldo
          modulo={modulo}
          iniciales={respaldables.map((r) => ({ file: r.file }))}
          onCerrar={() => setRespaldoAbierto(false)}
          onSubidos={alEnviarARespaldo}
        />
      )}
      {porEliminar && (
        <ConfirmarEliminarDocumento
          documento={porEliminar}
          eliminando={eliminando}
          onConfirmar={handleEliminar}
          onCancelar={() => setPorEliminar(null)}
        />
      )}
      {visorIndice !== null && ordenados[visorIndice] && (
        <VisorDocumentoModal
          documentos={ordenados}
          indiceInicial={visorIndice}
          onCerrar={() => setVisorIndice(null)}
        />
      )}
    </div>
  );
};

const BOTON_ACCION = 'h-6 w-6 inline-flex items-center justify-center rounded text-slate-500 dark:text-gray-400 hover:text-[#2383C2] hover:bg-slate-100 dark:hover:bg-gray-700 disabled:opacity-40 transition';

// Filas de una categoría: la celda "Categoría" (tipo + cantidad) va solo en
// la primera fila y abarca todas las del grupo (rowSpan).
const CELDA = 'py-1.5 border-b border-slate-100 dark:border-gray-700/60';

const GrupoDocumentos = ({ titulo, docs, abriendoRuta, onVer, onDescargar, onEliminar }) => (
  <>
    {docs.map((d, i) => {
      const abriendo = abriendoRuta === d.ruta;
      return (
        <tr key={d.ruta} className="hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-colors">
          {i === 0 && (
            <td
              rowSpan={docs.length}
              className="px-3 py-1.5 align-top whitespace-nowrap border-b border-r border-slate-200 dark:border-gray-700 bg-slate-50/60 dark:bg-gray-900/30"
            >
              <span className="text-[10px] font-semibold text-slate-700 dark:text-gray-200">{titulo}</span>
              <span className="ml-1 text-[10px] text-slate-400 dark:text-gray-500">· {docs.length}</span>
            </td>
          )}
          <td className={`${CELDA} border-r pl-3 pr-1 w-px`}>
            <IconoArchivo nombre={d.nombre} />
          </td>
          <td className={`${CELDA} border-r pl-1 pr-3 max-w-[min(520px,55vw)]`}>
            <button
              type="button"
              onClick={() => onVer(d)}
              className="block max-w-full truncate text-left text-slate-700 dark:text-gray-200 hover:text-[#2383C2]"
              title={d.nombre}
            >
              {d.nombre}
            </button>
          </td>
          <td className={`${CELDA} px-3 w-px whitespace-nowrap`}>
            <div className="flex items-center justify-end gap-0.5">
              <button type="button" onClick={() => onVer(d)} title="Ver" className={BOTON_ACCION}>
                <Eye size={13} />
              </button>
              <button type="button" onClick={() => onDescargar(d)} disabled={abriendo} title="Descargar" className={BOTON_ACCION}>
                {abriendo ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              </button>
              {onEliminar && (
                <button type="button" onClick={() => onEliminar(d)} title="Eliminar" aria-label={`Eliminar ${d.nombre}`} className={`${BOTON_ACCION} hover:!text-red-600`}>
                  <Trash2 size={13} />
                </button>
              )}
            </div>
          </td>
        </tr>
      );
    })}
  </>
);

export default DocumentosTab;
