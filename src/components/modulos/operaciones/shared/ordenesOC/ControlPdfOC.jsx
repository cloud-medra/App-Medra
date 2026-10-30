import { useDropzone } from 'react-dropzone';
import { FileText, Eye, Upload, Loader2, CheckCircle2 } from 'lucide-react';

// Estado + Ver + Subir/Reemplazar del PDF de una OC. Se puede soltar el PDF
// encima del control o elegirlo con el botón. Lo rechazado por tipo se
// entrega igual a onArchivos para que lo valide useSubirPdfOC.
// soloLectura: solo estado + Ver (sin soltar ni subir/reemplazar).
export const ControlPdfOC = ({ oc, tienePdf, subiendo = null, abriendo = false, deshabilitado = false, soloLectura = false, onVer, onArchivos }) => {
  const ocupado = deshabilitado || soloLectura || Boolean(subiendo);
  const { getRootProps, getInputProps, isDragActive, open } = useDropzone({
    onDrop: (aceptados, rechazados) => onArchivos([...aceptados, ...rechazados.map(r => r.file)]),
    accept: { 'application/pdf': ['.pdf'] },
    multiple: false,
    noClick: true,
    noKeyboard: true,
    disabled: ocupado
  });

  // relative: contiene el <input type="file"> de react-dropzone, que va con
  // position:absolute; sin esto se ubica respecto del body y estira la página.
  return (
    <span
      {...getRootProps()}
      title={soloLectura ? undefined : `Suelta aquí el PDF de la OC ${oc}`}
      className={`relative inline-flex items-center gap-1 px-1 py-1 md:py-0.5 rounded border transition ${
        isDragActive ? 'border-[#2383C2] bg-[#2383C2]/10' : 'border-transparent'
      }`}
    >
      <input {...getInputProps()} />
      {subiendo ? (
        <span className="flex items-center gap-1 text-[#2383C2] font-sans text-[10px]">
          <Loader2 size={11} className="animate-spin" /> {subiendo.porcentaje}%
        </span>
      ) : tienePdf ? (
        <span className="flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-sans text-[10px]" title="Tiene PDF">
          <CheckCircle2 size={11} /> PDF
        </span>
      ) : (
        <span className="flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-sans text-[10px]" title="Sin PDF">
          <FileText size={11} /> Sin PDF
        </span>
      )}
      {tienePdf && (
        <button
          type="button"
          onClick={onVer}
          disabled={abriendo}
          title="Ver PDF"
          className="p-0.5 rounded text-slate-500 dark:text-gray-400 hover:text-[#2383C2] hover:bg-slate-100 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          {abriendo ? <Loader2 size={11} className="animate-spin" /> : <Eye size={11} />}
        </button>
      )}
      {!soloLectura && (
      <button
        type="button"
        onClick={open}
        disabled={ocupado}
        title={tienePdf ? 'Reemplazar PDF (elegir o arrastrar)' : 'Subir PDF (elegir o arrastrar)'}
        className="p-0.5 rounded text-slate-500 dark:text-gray-400 hover:text-[#2383C2] hover:bg-slate-100 dark:hover:bg-gray-700 disabled:opacity-40"
      >
        <Upload size={11} />
      </button>
      )}
    </span>
  );
};

export default ControlPdfOC;
