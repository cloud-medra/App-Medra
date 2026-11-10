// Hoja del kit (PDF): ID, referencia, tipo y código de barras Code 128;
// campos en blanco (Admisión, Nombre, Fecha) para completar a mano; el
// contenido con componente, lote, vencimiento y cantidad; y la tabla "Fibras
// láser" con su uso en blanco. Sin logo ni nombre del sistema en ninguna
// parte (encabezado, pie, metadatos ni nombre del archivo).
//
// El código de barras lo codifica JsBarcode y se dibuja con rectángulos (vector):
// queda nítido a cualquier escala de impresión. Módulo de 0,33 mm, alto de
// 16 mm y zona de silencio de 10 módulos a cada lado, como pide Code 128.
//
// construirPdfKit es puro (recibe las librerías) para probarlo fuera del navegador.
import { abrirVisorPdf } from '../../bodega/shared/abrirPdf';
import { nombreArchivo } from '../../bodega/shared/exportar';
import { codigoBarrasKit } from '../../../../../functions/armadoKits/codigoKit.mjs';
import { advertenciasKit, versionKit } from '../../../../../functions/armadoKits/nucleo.mjs';
import { etiquetaModeloKit, etiquetaTipoKit } from '../../../../../functions/armadoKits/receta.mjs';
import { fechaCorta, etiquetaLote } from './lineasKit';

const AZUL = [35, 131, 194];
const TEXTO = [31, 41, 55];
const GRIS = [107, 114, 128];
const ROJO = [185, 28, 28];
const AMBAR = [146, 64, 14];
const MARGEN = 14;
const MODULO_MM = 0.33;
const ALTO_BARRAS_MM = 16;
const SILENCIO_MODULOS = 10;

// Módulos del Code 128 ('1' barra, '0' espacio), sin zona de silencio.
export const modulosCodigoBarras = (JsBarcode, valor) => {
  const datos = {};
  JsBarcode(datos, valor, { format: 'CODE128' });
  return datos.encodings.map((e) => e.data).join('');
};

export const textoVencimiento = (vencimiento, hoy) => {
  if (!vencimiento) return 'Sin vencimiento';
  return vencimiento < hoy ? `${fechaCorta(vencimiento)} · Vencido` : fechaCorta(vencimiento);
};

export const nombreArchivoKit = (kit) => nombreArchivo(`Kit_${kit.codigo}`, 'pdf');

// Columnas de la tabla principal: cada línea en una sola fila, con su componente.
export const COLUMNAS_PDF = Object.freeze(['Componente', 'Referencia', 'Nombre', 'Lote', 'Vencimiento', 'Cantidad']);

// Filas en el orden de la receta (componenteOrden); dentro de un componente,
// en el orden guardado. Un kit sin componentes los deja en blanco.
export const filasContenido = (lineas = [], hoy) => [...lineas]
  .map((l, i) => ({ l, i }))
  .sort((a, b) => (a.l.componenteOrden ?? 999) - (b.l.componenteOrden ?? 999) || a.i - b.i)
  .map(({ l }) => [l.componenteNombre || '', l.referencia || '—', l.productoNombre || '', etiquetaLote(l.lote), textoVencimiento(l.vencimiento, hoy), String(l.cantidad)]);

// Fibras láser: medidas fijas, con el uso en blanco para completar a mano.
export const FIBRAS_LASER = Object.freeze(['272 µm', '365 µm', '550 µm', '1000 µm']);
export const CAMPOS_A_MANO = Object.freeze(['Admisión', 'Nombre', 'Fecha']);

const ALTO_FILA_ESCRITURA = 9;

// opciones: { kit, hoy: 'AAAA-MM-DD' }
export const construirPdfKit = ({ jsPDF, autoTable, JsBarcode }, { kit, hoy }) => {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const alto = doc.internal.pageSize.getHeight();
  const derecha = ancho - MARGEN;
  const version = versionKit(kit);
  const valorCodigo = codigoBarrasKit({ codigo: kit.codigo, version });
  const titulo = `Kit ${kit.codigo}`;
  // Sin autor ni creador: el PDF no lleva marca.
  doc.setProperties({ title: titulo, subject: 'Hoja de kit', author: '', creator: '', keywords: '' });
  doc.viewerPreferences({ DisplayDocTitle: true });

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...AZUL);
  doc.text('HOJA DE KIT', MARGEN, 15);
  doc.setDrawColor(...AZUL);
  doc.setLineWidth(0.6);
  doc.line(MARGEN, 19, derecha, 19);

  // Código de barras arriba a la derecha.
  const modulos = modulosCodigoBarras(JsBarcode, valorCodigo);
  const anchoBarras = modulos.length * MODULO_MM;
  const xBarras = derecha - SILENCIO_MODULOS * MODULO_MM - anchoBarras;
  const yBarras = 23;
  doc.setFillColor(0, 0, 0);
  let i = 0;
  while (i < modulos.length) {
    if (modulos[i] === '1') {
      let fin = i;
      while (fin < modulos.length && modulos[fin] === '1') fin += 1;
      doc.rect(xBarras + i * MODULO_MM, yBarras, (fin - i) * MODULO_MM, ALTO_BARRAS_MM, 'F');
      i = fin;
    } else i += 1;
  }
  doc.setFont('courier', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...TEXTO);
  doc.text(valorCodigo, xBarras + anchoBarras / 2, yBarras + ALTO_BARRAS_MM + 4, { align: 'center' });

  // Identificación del kit.
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text(titulo, MARGEN, 30);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(`Referencia: ${etiquetaModeloKit(kit)}`, MARGEN, 37);
  doc.text(`Tipo: ${etiquetaTipoKit(kit)}`, MARGEN, 42);
  doc.setTextColor(...GRIS);
  doc.setFontSize(8.5);
  doc.text(`Contenido versión ${version}`, MARGEN, 47);

  // Campos para completar a mano (siempre en la primera página).
  let y = 58;
  const anchosCampos = [52, 82, 38];
  const separacion = (derecha - MARGEN - anchosCampos.reduce((n, a) => n + a, 0)) / (anchosCampos.length - 1);
  let x = MARGEN;
  doc.setFontSize(10);
  doc.setTextColor(...TEXTO);
  doc.setDrawColor(...TEXTO);
  doc.setLineWidth(0.3);
  CAMPOS_A_MANO.forEach((campo, k) => {
    doc.setFont('helvetica', 'bold');
    const etiqueta = `${campo}:`;
    doc.text(etiqueta, x, y);
    const inicioLinea = x + doc.getTextWidth(etiqueta) + 2;
    doc.line(inicioLinea, y + 0.8, x + anchosCampos[k], y + 0.8);
    x += anchosCampos[k] + separacion;
  });
  y += 9;

  // Contenido.
  const { vencidas, sinVencimiento } = advertenciasKit(kit.lineas, hoy);
  if (vencidas.length || sinVencimiento.length) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(...(vencidas.length ? ROJO : AMBAR));
    const partes = [vencidas.length && `${vencidas.length} línea(s) vencida(s)`, sinVencimiento.length && `${sinVencimiento.length} sin vencimiento`].filter(Boolean);
    doc.text(`Atención: ${partes.join(' y ')}.`, MARGEN, y);
    y += 5;
  }
  autoTable(doc, {
    startY: y,
    margin: { top: 22, bottom: 18, left: MARGEN, right: MARGEN },
    head: [[...COLUMNAS_PDF]],
    body: filasContenido(kit.lineas, hoy),
    foot: [[{ content: 'Total de unidades', colSpan: 5, styles: { halign: 'right' } }, String(kit.totalUnidades)]],
    theme: 'grid',
    // Anchos fijos (182 mm) salvo Nombre, que toma el resto; un texto que no
    // cabe pasa a otra línea dentro de su celda en vez de cortarse.
    styles: { font: 'helvetica', fontSize: 8, cellPadding: 1.6, overflow: 'linebreak', valign: 'middle', textColor: TEXTO, lineColor: [226, 232, 240], lineWidth: 0.2 },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold' },
    footStyles: { fillColor: [245, 248, 252], textColor: TEXTO, fontStyle: 'bold' },
    columnStyles: { 0: { cellWidth: 27 }, 1: { cellWidth: 31 }, 2: { cellWidth: 'auto' }, 3: { cellWidth: 24 }, 4: { cellWidth: 31 }, 5: { cellWidth: 15, halign: 'right' } },
    rowPageBreak: 'avoid',
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 4) return;
      const texto = String(data.cell.raw);
      if (texto.includes('Vencido')) data.cell.styles.textColor = ROJO;
      else if (texto === 'Sin vencimiento') data.cell.styles.textColor = AMBAR;
    },
  });

  // Fibras láser: título y tabla juntos; si no caben en lo que queda de la
  // página, pasan completos a la siguiente.
  const altoFibras = 8 + 7 + FIBRAS_LASER.length * ALTO_FILA_ESCRITURA + 4;
  let yFibras = doc.lastAutoTable.finalY + 10;
  if (yFibras + altoFibras > alto - 18) { doc.addPage(); yFibras = 22; }
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10.5);
  doc.setTextColor(...TEXTO);
  doc.text('Fibras láser', MARGEN, yFibras);
  autoTable(doc, {
    startY: yFibras + 3,
    margin: { top: 22, bottom: 18, left: MARGEN, right: MARGEN },
    tableWidth: 110,
    head: [['Referencia', 'Uso']],
    body: FIBRAS_LASER.map((f) => [f, '']),
    theme: 'grid',
    pageBreak: 'avoid',
    styles: { font: 'helvetica', fontSize: 9, cellPadding: 1.8, valign: 'middle', textColor: TEXTO, lineColor: [180, 190, 200], lineWidth: 0.2, minCellHeight: ALTO_FILA_ESCRITURA },
    headStyles: { fillColor: AZUL, textColor: 255, fontStyle: 'bold', minCellHeight: 7 },
    columnStyles: { 0: { cellWidth: 35 } },
  });

  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p += 1) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(...GRIS);
    doc.text(`${titulo} · versión ${version}`, MARGEN, alto - 7.5);
    doc.text(`Página ${p} de ${paginas}`, derecha, alto - 7.5, { align: 'right' });
  }
  return doc;
};

// Abre la pestaña en el mismo clic (si no, el navegador la bloquea), genera y la carga.
export const generarPdfKit = async (opciones) => {
  const visor = abrirVisorPdf(`Kit ${opciones.kit.codigo}`);
  try {
    const [{ jsPDF }, { default: autoTable }, { default: JsBarcode }] = await Promise.all([import('jspdf'), import('jspdf-autotable'), import('jsbarcode')]);
    visor.mostrar(construirPdfKit({ jsPDF, autoTable, JsBarcode }, opciones), nombreArchivoKit(opciones.kit));
  } catch (e) {
    visor.cerrar();
    throw e;
  }
};
