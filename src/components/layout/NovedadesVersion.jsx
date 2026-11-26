import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info, X, Sparkles } from 'lucide-react';
import { ULTIMA_VERSION, VERSION_APP } from '../../config/versionApp';

// Versión del pie del sidebar con el ícono de información: al presionarlo
// abre una ventana con los cambios de la última versión (src/config/versionApp.js).
// La ventana va en un portal a <body> porque el pie del sidebar tiene
// overflow-hidden y la recortaría. Sin lecturas de Firestore.

const formatearFecha = (fecha) => {
  const [anio, mes, dia] = fecha.split('-');
  return `${dia}-${mes}-${anio}`;
};

export const VentanaNovedades = ({ onCerrar }) => {
  useEffect(() => {
    const alTeclear = (e) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [onCerrar]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={onCerrar}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-novedades"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-700 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#2383C2]/10 text-[#2383C2] dark:text-sky-300">
              <Sparkles size={16} aria-hidden="true" />
            </div>
            <div>
              <h2 id="titulo-novedades" className="text-titulo-seccion text-tinta-principal">
                Novedades de la versión {VERSION_APP}
              </h2>
              <p className="text-secundario text-tinta-secundaria tabular-nums">
                Publicada el {formatearFecha(ULTIMA_VERSION.fecha)}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCerrar}
            aria-label="Cerrar"
            className="p-1 rounded text-tinta-secundaria hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <X size={16} />
          </button>
        </div>
        <ul className="px-4 py-3 flex flex-col gap-2 max-h-[60vh] overflow-y-auto">
          {ULTIMA_VERSION.cambios.map((cambio) => (
            <li key={cambio} className="flex gap-2 text-normal text-tinta-principal">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#2383C2]" aria-hidden="true" />
              <span>{cambio}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>,
    document.body
  );
};

// `colapsado`: sidebar angosto, solo "vX.Y.Z" (también abre la ventana).
const NovedadesVersion = ({ colapsado = false }) => {
  const [abierta, setAbierta] = useState(false);
  const cerrar = () => setAbierta(false);

  return (
    <>
      {colapsado ? (
        <button
          type="button"
          onClick={() => setAbierta(true)}
          title={`Versión ${VERSION_APP} — ver novedades`}
          className="w-full flex justify-center items-center text-pequeno tabular-nums text-tinta-secundaria py-1 hover:text-[#2383C2] dark:hover:text-sky-300 transition-colors"
        >
          <span>v{VERSION_APP}</span>
        </button>
      ) : (
        <div className="flex justify-between items-center text-pequeno tabular-nums text-tinta-secundaria px-0.5">
          <span>Versión</span>
          <span className="flex items-center gap-1">
            <span>v{VERSION_APP}</span>
            <button
              type="button"
              onClick={() => setAbierta(true)}
              title="Ver cambios de esta versión"
              aria-label={`Ver cambios de la versión ${VERSION_APP}`}
              className="p-0.5 rounded hover:text-[#2383C2] dark:hover:text-sky-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              <Info size={12} />
            </button>
          </span>
        </div>
      )}
      {abierta && <VentanaNovedades onCerrar={cerrar} />}
    </>
  );
};

export default NovedadesVersion;
