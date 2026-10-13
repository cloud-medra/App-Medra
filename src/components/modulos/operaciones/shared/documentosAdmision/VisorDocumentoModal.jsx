import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Download, ExternalLink, X, Loader2, AlertCircle, FileText } from 'lucide-react';
import { obtenerBlobDocumento } from './documentosStorage';
import { mensajeErrorStorage, TIPOS_DOCUMENTO } from './documentosHelpers';

const BOTON = 'h-7 px-2 inline-flex items-center gap-1.5 rounded border border-slate-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-[10.5px] font-medium text-slate-600 dark:text-gray-300 hover:border-[#2383C2] hover:text-[#2383C2] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:text-slate-600 transition';

const etiquetaTipo = (tipo) => {
  const info = TIPOS_DOCUMENTO.find((t) => t.id === tipo);
  return info ? `${info.id} — ${info.label}` : 'Sin tipo';
};

// Visor de un PDF de la admisión a la vez, con navegación anterior/siguiente
// (flechas ← → del teclado) y Esc para cerrar. Cada PDF se descarga de
// Storage una sola vez mientras el visor está abierto (blob URL) y se libera
// al cerrarlo.
// Lo usan también Respaldo de documentos (Implantes) y Archivo digital
// (Documentos): `describir(documento)` cambia el texto bajo el título (por
// defecto, el tipo DP/RP/INF/COT) y `puedeDescargar` oculta Descargar y
// Pestaña nueva cuando el usuario no tiene ese permiso. Muestra PDF e
// imágenes (el iframe abre cualquiera de los dos desde el blob).
export const VisorDocumentoModal = ({ documentos, indiceInicial = 0, onCerrar, describir = (d) => etiquetaTipo(d.tipo), puedeDescargar = true }) => {
  const [indice, setIndice] = useState(indiceInicial);
  const [urls, setUrls] = useState({});
  const [errores, setErrores] = useState({});
  const urlsRef = useRef({});

  const total = documentos.length;
  const actual = documentos[indice];
  const url = actual ? urls[actual.ruta] : null;
  const error = actual ? errores[actual.ruta] : null;
  const cargando = Boolean(actual) && !url && !error;

  useEffect(() => {
    if (!actual || urlsRef.current[actual.ruta]) return undefined;
    let activo = true;
    obtenerBlobDocumento(actual.ruta)
      .then((blob) => {
        const nueva = URL.createObjectURL(blob);
        urlsRef.current[actual.ruta] = nueva;
        if (activo) setUrls((prev) => ({ ...prev, [actual.ruta]: nueva }));
      })
      .catch((err) => {
        console.error('Error al abrir documento de implantes:', err);
        if (activo) setErrores((prev) => ({ ...prev, [actual.ruta]: mensajeErrorStorage(err) }));
      });
    return () => { activo = false; };
  }, [actual]);

  // Libera los blob URL al cerrar el visor.
  useEffect(() => () => {
    Object.values(urlsRef.current).forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const irA = useCallback((nuevo) => {
    if (nuevo < 0 || nuevo >= total) return;
    setIndice(nuevo);
  }, [total]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onCerrar();
      else if (e.key === 'ArrowLeft') irA(indice - 1);
      else if (e.key === 'ArrowRight') irA(indice + 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [indice, irA, onCerrar]);

  const descargar = () => {
    if (!url) return;
    const a = document.createElement('a');
    a.href = url;
    a.download = actual.nombre;
    a.click();
  };

  if (!actual) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-[1px] sm:p-4"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onCerrar(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Documento ${actual.nombre}`}
    >
      <div className="bg-white dark:bg-gray-800 w-full h-full sm:max-w-6xl sm:h-[92vh] sm:rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col">

        <div className="px-3 py-2 border-b border-slate-200 dark:border-gray-700 bg-slate-50/80 dark:bg-gray-900/40 flex items-center gap-2 flex-wrap">
          <FileText size={15} className="text-slate-500 dark:text-gray-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <h3 className="text-[12px] font-bold text-slate-800 dark:text-gray-100 truncate" title={actual.nombre}>{actual.nombre}</h3>
            <p className="text-[10px] text-slate-500 dark:text-gray-400 truncate">
              {describir(actual)} · {indice + 1} de {total}
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button type="button" onClick={() => irA(indice - 1)} disabled={indice === 0} className={BOTON} title="Documento anterior (←)">
              <ChevronLeft size={13} /> <span className="hidden md:inline">Anterior</span>
            </button>
            <button type="button" onClick={() => irA(indice + 1)} disabled={indice === total - 1} className={BOTON} title="Documento siguiente (→)">
              <span className="hidden md:inline">Siguiente</span> <ChevronRight size={13} />
            </button>
            {puedeDescargar && (
              <>
                <span className="w-px h-5 bg-slate-200 dark:bg-gray-700 mx-0.5" />
                <button type="button" onClick={descargar} disabled={!url} className={BOTON} title="Descargar">
                  <Download size={13} /> <span className="hidden md:inline">Descargar</span>
                </button>
                <button type="button" onClick={() => url && window.open(url, '_blank')} disabled={!url} className={BOTON} title="Abrir en pestaña nueva">
                  <ExternalLink size={13} /> <span className="hidden md:inline">Pestaña nueva</span>
                </button>
              </>
            )}
            <button
              type="button"
              onClick={onCerrar}
              className="h-7 w-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 dark:hover:text-gray-200 dark:hover:bg-gray-700 transition"
              title="Cerrar (Esc)"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 bg-slate-100 dark:bg-gray-900">
          {cargando && (
            <div className="h-full flex items-center justify-center gap-2 text-[11px] text-slate-500 dark:text-gray-400">
              <Loader2 size={15} className="animate-spin" /> Cargando documento...
            </div>
          )}
          {error && (
            <div className="h-full flex flex-col items-center justify-center gap-2 text-[11px] text-red-600 dark:text-red-400 px-4 text-center">
              <AlertCircle size={18} /> {error}
            </div>
          )}
          {url && (
            <iframe key={actual.ruta} src={url} title={actual.nombre} className="w-full h-full border-0" />
          )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default VisorDocumentoModal;
