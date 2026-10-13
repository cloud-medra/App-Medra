// Tipo de archivo por extensión (etiqueta y color típico), para IconoArchivo.
const TIPOS_ARCHIVO = [
  { exts: ['pdf'], etiqueta: 'PDF', color: '#D93025' },
  { exts: ['doc', 'docx', 'odt', 'rtf'], etiqueta: 'DOC', color: '#2B579A' },
  { exts: ['xls', 'xlsx', 'xlsm', 'ods', 'csv'], etiqueta: 'XLS', color: '#217346' },
  { exts: ['ppt', 'pptx', 'odp'], etiqueta: 'PPT', color: '#C43E1C' },
  { exts: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'heic'], etiqueta: 'IMG', color: '#7B4FB8' },
  { exts: ['zip', 'rar', '7z'], etiqueta: 'ZIP', color: '#B7791F' },
  { exts: ['txt', 'xml', 'json'], etiqueta: 'TXT', color: '#64748B' }
];
const GENERICO = { etiqueta: 'FILE', color: '#64748B' };

export const tipoArchivoDesdeNombre = (nombre) => {
  const ext = String(nombre || '').split('.').pop().toLowerCase();
  return TIPOS_ARCHIVO.find((t) => t.exts.includes(ext)) || GENERICO;
};
