// Exportaciones de Bodega (Excel, CSV y PDF). Las librerías se cargan solo
// al exportar. `columnas`: [{ titulo, valor: (fila) => texto|número }].

const hoy = () => new Date().toISOString().slice(0, 10);
// Sin tildes ni caracteres raros: 'tránsito PABELLÓN' -> 'transito_PABELLON'.
export const nombreArchivo = (base, extension) => `${base.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\w-]+/g, '_')}_${hoy()}.${extension}`;

// [{ titulo, valor }] + filas -> [{ [titulo]: valor }]
export const aTabla = (columnas, filas) => filas.map((f) => Object.fromEntries(columnas.map((c) => [c.titulo, c.valor(f) ?? ''])));

// hojas: [{ nombre, columnas, filas }]
export const exportarExcel = async (base, hojas) => {
  const XLSX = await import('xlsx');
  const libro = XLSX.utils.book_new();
  hojas.forEach(({ nombre, columnas, filas }) => {
    const hoja = XLSX.utils.json_to_sheet(aTabla(columnas, filas), { header: columnas.map((c) => c.titulo) });
    XLSX.utils.book_append_sheet(libro, hoja, nombre.slice(0, 31));
  });
  XLSX.writeFile(libro, nombreArchivo(base, 'xlsx'));
};

export const exportarCsv = async (base, columnas, filas) => {
  const XLSX = await import('xlsx');
  const hoja = XLSX.utils.json_to_sheet(aTabla(columnas, filas), { header: columnas.map((c) => c.titulo) });
  const csv = XLSX.utils.sheet_to_csv(hoja, { FS: ';' });
  const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nombreArchivo(base, 'csv');
  a.click();
  URL.revokeObjectURL(url);
};

// PDF horizontal con título, subtítulo y tabla.
export const exportarPdf = async (base, { titulo, subtitulo = '', columnas, filas }) => {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([import('jspdf'), import('jspdf-autotable')]);
  const doc = new jsPDF({ orientation: 'landscape' });
  doc.setFontSize(13);
  doc.text(titulo, 14, 15);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(`${subtitulo}${subtitulo ? ' · ' : ''}Generado el ${new Date().toLocaleString('es-CL')}`, 14, 21);
  autoTable(doc, {
    startY: 26,
    head: [columnas.map((c) => c.titulo)],
    body: filas.map((f) => columnas.map((c) => String(c.valor(f) ?? ''))),
    headStyles: { fillColor: [35, 131, 194], textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fontSize: 8 },
    alternateRowStyles: { fillColor: [245, 245, 245] },
    margin: { left: 14, right: 14 },
  });
  doc.save(nombreArchivo(base, 'pdf'));
};
