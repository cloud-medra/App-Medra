// PDF de Cajas (contenido, inventario y reposición) con un mismo diseño:
// encabezado con el logo de Medra, el tipo de documento, la fecha de
// generación y el nombre de la caja; tarjetas de resumen; tablas con
// encabezado azul (repetido en cada página), filas alternadas, números a la
// derecha y los productos con faltante resaltados en rojo; pie con
// "Página X de Y". Se abre en una pestaña nueva (abrirVisorPdf).
//
// construirPdfCaja es puro (recibe jsPDF y autoTable) para poder generarlo
// fuera del navegador; generarPdfCaja carga las librerías y el logo.
import logoMedra from '../../../../assets/logo/png/medra-logo-claro-512.png';
import { abrirVisorPdf } from '../shared/abrirPdf';
import { nombreArchivo } from '../shared/exportar';

const AZUL = [35, 131, 194];
const TEXTO = [31, 41, 55];
const GRIS = [107, 114, 128];
const LINEA = [226, 232, 240];
const ALTERNA = [245, 248, 252];
const ROJO = [185, 28, 28];
const FONDO_ROJO = [254, 238, 238];
const MARGEN = 14;
const LOGO_PROPORCION = 169 / 512; // alto / ancho del PNG

// Helvetica (fuente estándar del PDF) no tiene el signo menos tipográfico.
const limpio = (texto) => String(texto ?? '').replace(/−/g, '-');
export const textoCelda = (valor) => (typeof valor === 'number' ? valor.toLocaleString('es-CL') : limpio(valor));

// Líneas guardadas (inventario, reposición) en el orden de la caja: el
// servidor las guarda por nombre. Las de productos que ya no están en la
// caja van al final, en su orden original.
export const enOrdenDeCaja = (lineas = [], idsCaja = []) => {
  const posicion = new Map(idsCaja.map((id, i) => [id, i]));
  return lineas
    .map((l, i) => ({ l, i, p: posicion.has(l.productoId) ? posicion.get(l.productoId) : idsCaja.length + i }))
    .sort((a, b) => a.p - b.p)
    .map(({ l }) => l);
};

// opciones: {
//   tipo: 'Contenido de la caja', titulo: nombre de la caja, detalle: texto bajo el título,
//   generado: 'dd-mm-aaaa hh:mm', resumen: [{ etiqueta, valor, alerta? }],
//   secciones: [{ titulo?, columnas: [{ titulo, valor, numero?, ancho? }], filas,
//                 resaltar?: (fila) => bool, alerta?: titulo de la columna en rojo, vacio? }],
//   logo?: { datos: Uint8Array | dataURL, formato: 'PNG' } }
export const construirPdfCaja = ({ jsPDF, autoTable }, { tipo, titulo, detalle = '', generado, resumen = [], secciones = [], logo = null }) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const derecha = ancho - MARGEN;
  const nombreDocumento = `${tipo} · ${titulo}`;
  doc.setProperties({ title: limpio(nombreDocumento), subject: tipo, author: 'Medra', creator: 'Medra · Bodega' });
  doc.viewerPreferences({ DisplayDocTitle: true });
  doc.setFont('helvetica', 'normal');

  // Encabezado de la primera página.
  if (logo) {
    try { doc.addImage(logo.datos, logo.formato || 'PNG', MARGEN, 10, 36, 36 * LOGO_PROPORCION); } catch { /* sin logo */ }
  }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...AZUL);
  doc.text(tipo.toUpperCase(), derecha, 15, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(...GRIS);
  doc.text(`Generado el ${generado}`, derecha, 20, { align: 'right' });
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.line(MARGEN, 26, derecha, 26);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...TEXTO);
  const lineasTitulo = doc.splitTextToSize(limpio(titulo), derecha - MARGEN);
  doc.text(lineasTitulo, MARGEN, 35);
  let y = 35 + (lineasTitulo.length - 1) * 6.5;
  if (detalle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(...GRIS);
    const lineasDetalle = doc.splitTextToSize(limpio(detalle), derecha - MARGEN);
    doc.text(lineasDetalle, MARGEN, y + 6);
    y += 6 + (lineasDetalle.length - 1) * 4;
  }
  y += 5;

  // Tarjetas de resumen.
  if (resumen.length) {
    const separacion = 3;
    const anchoTarjeta = (derecha - MARGEN - separacion * (resumen.length - 1)) / resumen.length;
    resumen.forEach((r, i) => {
      const x = MARGEN + i * (anchoTarjeta + separacion);
      doc.setFillColor(...(r.alerta ? FONDO_ROJO : ALTERNA));
      doc.setDrawColor(...(r.alerta ? [252, 202, 202] : LINEA));
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, anchoTarjeta, 15, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(...GRIS);
      doc.text(limpio(r.etiqueta).toUpperCase(), x + 3, y + 5.5);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      doc.setTextColor(...(r.alerta ? ROJO : TEXTO));
      doc.text(textoCelda(r.valor), x + 3, y + 12);
    });
    y += 15 + 8;
  }

  // Tablas. El margen superior deja lugar al encabezado corto de las
  // páginas siguientes.
  const margen = { top: 22, bottom: 18, left: MARGEN, right: MARGEN };
  secciones.forEach((sec) => {
    if (sec.titulo) {
      if (y > alto - 45) { doc.addPage(); y = margen.top; }
      doc.setFillColor(...AZUL);
      doc.rect(MARGEN, y - 3.2, 1.2, 4.4, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10.5);
      doc.setTextColor(...TEXTO);
      doc.text(limpio(sec.titulo), MARGEN + 3.5, y);
      y += 4;
    }
    const columnas = sec.columnas;
    const resaltadas = new Set(sec.filas.map((f, i) => (sec.resaltar?.(f) ? i : -1)).filter((i) => i >= 0));
    const indiceAlerta = columnas.findIndex((c) => c.titulo === sec.alerta);
    const body = sec.filas.length
      ? sec.filas.map((f) => columnas.map((c) => textoCelda(c.valor(f))))
      : [[{ content: sec.vacio || 'Sin productos.', colSpan: columnas.length, styles: { halign: 'center', textColor: GRIS, fontStyle: 'italic' } }]];
    autoTable(doc, {
      startY: y,
      margin: margen,
      head: [columnas.map((c) => limpio(c.titulo))],
      body,
      showHead: 'everyPage',
      rowPageBreak: 'avoid', // una fila de dos líneas no se corta entre páginas
      theme: 'plain',
      styles: { font: 'helvetica', fontSize: 8.5, textColor: TEXTO, cellPadding: { top: 2.3, bottom: 2.3, left: 2.5, right: 2.5 }, valign: 'middle', overflow: 'linebreak', lineColor: LINEA, lineWidth: { bottom: 0.15 } },
      headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', fontSize: 8, lineWidth: 0 },
      alternateRowStyles: { fillColor: ALTERNA },
      columnStyles: Object.fromEntries(columnas.map((c, i) => [i, { halign: c.numero ? 'right' : 'left', ...(c.ancho ? { cellWidth: c.ancho } : {}) }])),
      didParseCell: (data) => {
        const col = columnas[data.column.index];
        if (data.section === 'head' && col?.numero) data.cell.styles.halign = 'right';
        if (data.section !== 'body') return;
        // En la columna de alerta, el 0 va en gris para que resalte el resto.
        if (data.column.index === indiceAlerta && data.cell.raw === '0') data.cell.styles.textColor = GRIS;
        if (!resaltadas.has(data.row.index)) return;
        data.cell.styles.fillColor = FONDO_ROJO;
        if (data.column.index === indiceAlerta) { data.cell.styles.textColor = ROJO; data.cell.styles.fontStyle = 'bold'; }
      },
      // Marca roja al borde izquierdo de las filas con faltante (se nota
      // también impreso en blanco y negro).
      didDrawCell: (data) => {
        if (data.section === 'body' && data.column.index === 0 && resaltadas.has(data.row.index)) {
          doc.setFillColor(...ROJO);
          doc.rect(data.cell.x, data.cell.y, 0.9, data.cell.height, 'F');
        }
      },
    });
    y = doc.lastAutoTable.finalY + 10;
  });

  // Encabezado corto (páginas 2+) y pie con número de página.
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    if (p > 1) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(...TEXTO);
      doc.text(doc.splitTextToSize(limpio(titulo), 120)[0], MARGEN, 13);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(...GRIS);
      doc.text(tipo, derecha, 13, { align: 'right' });
      doc.setDrawColor(...LINEA);
      doc.setLineWidth(0.3);
      doc.line(MARGEN, 16, derecha, 16);
    }
    doc.setDrawColor(...LINEA);
    doc.setLineWidth(0.3);
    doc.line(MARGEN, alto - 12, derecha, alto - 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(limpio(`Medra · Bodega · ${nombreDocumento}`), MARGEN, alto - 7.5, { maxWidth: 140 });
    doc.text(`Página ${p} de ${paginas}`, derecha, alto - 7.5, { align: 'right' });
  }
  return doc;
};

const leerLogo = async () => {
  try {
    const respuesta = await fetch(logoMedra);
    if (!respuesta.ok) return null;
    return { datos: new Uint8Array(await respuesta.arrayBuffer()), formato: 'PNG' };
  } catch {
    return null;
  }
};

// Abre la pestaña de inmediato (mismo clic), genera y la carga. Si algo
// falla se cierra la pestaña y el error sigue hacia quien llamó (toast).
export const generarPdfCaja = async (base, opciones) => {
  const visor = abrirVisorPdf(`${opciones.tipo} · ${opciones.titulo}`);
  try {
    const [{ jsPDF }, { default: autoTable }, logo] = await Promise.all([import('jspdf'), import('jspdf-autotable'), leerLogo()]);
    const doc = construirPdfCaja({ jsPDF, autoTable }, { ...opciones, logo });
    visor.mostrar(doc, nombreArchivo(base, 'pdf'));
  } catch (e) {
    visor.cerrar();
    throw e;
  }
};
