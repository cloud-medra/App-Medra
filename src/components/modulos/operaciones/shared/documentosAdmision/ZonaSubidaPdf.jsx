import { useDropzone } from 'react-dropzone';
import { UploadCloud, Loader2 } from 'lucide-react';
import { TAMANO_MAXIMO_MB } from './documentosHelpers';

// Zona de arrastrar/soltar + clic para seleccionar PDF, compartida por la
// pestaña Documentos y Carga masiva de documentos. Lo que react-dropzone
// rechaza por tipo (`accept`) se entrega igual en `onArchivos`, para que pase
// por la misma validación de la pantalla y quede en su resumen con el motivo.
// preventDropOnDocument (activo por defecto) evita que el navegador abra el
// PDF si se suelta fuera de la zona.
export const ZonaSubidaPdf = ({
  onArchivos,
  deshabilitada = false,
  progreso = null, // { actual, total, porcentaje } mientras se sube
  textoSoltar = 'Suelta los PDF para subirlos',
  tamanoMaximoMb = TAMANO_MAXIMO_MB,
  textoAyuda = 'Arrastra aquí los PDF o haz clic para seleccionarlos'
}) => {
  const subiendo = progreso !== null;
  const { getRootProps, getInputProps, isDragActive, isDragReject } = useDropzone({
    onDrop: (aceptados, rechazadosPorTipo) => onArchivos([...aceptados, ...rechazadosPorTipo.map(r => r.file)]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: true,
    disabled: deshabilitada || subiendo
  });

  return (
    <>
      <div
        {...getRootProps()}
        className={`relative border-2 border-dashed rounded-lg px-4 py-5 text-center flex flex-col items-center justify-center gap-1.5 transition ${
          deshabilitada || subiendo
            ? 'border-slate-200 dark:border-gray-700 opacity-50 cursor-not-allowed'
            : isDragReject
              ? 'border-red-400 bg-red-50 dark:bg-red-950/20 cursor-copy'
              : isDragActive
                ? 'border-[#2383C2] bg-[#2383C2]/5 cursor-copy'
                : 'border-slate-300 dark:border-gray-600 hover:border-[#2383C2]/60 hover:bg-slate-50 dark:hover:bg-gray-700/30 cursor-pointer'
        }`}
      >
        <input {...getInputProps()} />
        {subiendo
          ? <Loader2 size={20} className="animate-spin text-[#2383C2]" />
          : <UploadCloud size={20} className={isDragReject ? 'text-red-500' : isDragActive ? 'text-[#2383C2]' : 'text-slate-400 dark:text-gray-500'} />}
        <p className="text-[11px] font-medium text-slate-700 dark:text-gray-200">
          {subiendo
            ? `Subiendo ${progreso.actual} de ${progreso.total} — ${progreso.porcentaje}%`
            : isDragReject
              ? 'Solo se aceptan archivos PDF'
              : isDragActive
                ? textoSoltar
                : textoAyuda}
        </p>
        {!subiendo && <p className="text-[9px] text-slate-400 dark:text-gray-500">Uno o varios, hasta {tamanoMaximoMb} MB cada uno.</p>}
      </div>

      {subiendo && (
        <div className="h-1.5 w-full bg-slate-100 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#2383C2] transition-all"
            style={{ width: `${((progreso.actual - 1) * 100 + progreso.porcentaje) / progreso.total}%` }}
          />
        </div>
      )}
    </>
  );
};

export default ZonaSubidaPdf;
