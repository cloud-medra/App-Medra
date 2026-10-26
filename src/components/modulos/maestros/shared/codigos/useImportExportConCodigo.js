import { useState } from 'react';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../../../../../firebaseConfig';

const DELIM = ';';
const FILAS_POR_LOTE = 200;

const escapeCSV = (valor) => {
  const str = String(valor ?? '');
  if (str.includes(DELIM) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
};

const parseCSVLine = (line, delim = DELIM) => {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++; 
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === delim) {
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }
  }
  result.push(current);
  return result.map((v) => v.trim());
};

const parseCSVContent = (text, delim = DELIM) => {
  const rows = [];
  let currentRow = '';
  let inQuotes = false;

  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

  for (let i = 0; i < clean.length; i++) {
    const char = clean[i];
    if (char === '"') inQuotes = !inQuotes;

    if (char === '\n' && !inQuotes) {
      if (currentRow.trim() !== '') rows.push(currentRow);
      currentRow = '';
    } else {
      currentRow += char;
    }
  }
  if (currentRow.trim() !== '') rows.push(currentRow);

  return rows.map((row) => parseCSVLine(row, delim));
};

const descargarCSV = (headers, rows, nombreArchivo) => {
  const contenido =
    [headers, ...rows]
      .map((fila) => fila.map(escapeCSV).join(DELIM))
      .join('\r\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + contenido], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', nombreArchivo);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const chunk = (arr, n) => {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
};

const PROGRESO_INICIAL = {
  activo: false,
  total: 0,
  procesadas: 0,
  invalidas: [],
  fallidas: [],
  finalizado: false
};

// `ver`: permiso por columna de la tabla (useColumnasPermitidas); la
// exportación omite las columnas que el usuario no puede ver.
export const useImportExportConCodigo = ({ registros, userData, showToast, colBase, ver = () => true }) => {
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);
  const [progreso, setProgreso] = useState(PROGRESO_INICIAL);

  const handleAbrirConfiguracion = () => {
    setShowConfigDrawer(true);
  };

  const handleExportarDatos = () => {
    if (!registros || registros.length === 0) {
      return showToast('No hay registros para exportar', 'warning');
    }

    try {
      const headers = [
        'CODIGO',
        'REFERENCIA',
        'DESCRIPTOR_EMPRESA',
        'EMPRESA',
        'TIPO',
        'SEGMENTO',
        'CLASE',
        'DESCRIPTOR_AUTO',
        'PRECIO_NETO',
        'CX',
        'OBSERVACION',
        'REGISTRADO_POR'
      ];

      const rows = registros.map((item) => [
        item.codigo || '',
        item.referencia || '',
        item.descriptorEmpresa || '',
        item.empresa || '',
        item.tipo || '',
        item.segmento || '',
        item.clase || '',
        item.descriptorAuto || '',
        item.precioNeto || 0,
        item.cx || '',
        item.observacion || '',
        item.registradoPor || ''
      ]);

      // Encabezado → columna de la tabla (CX y OBSERVACION no tienen columna
      // en pantalla: se exportan siempre).
      const columnaDe = {
        CODIGO: 'codigo', REFERENCIA: 'referencia', DESCRIPTOR_EMPRESA: 'descEmpresa', EMPRESA: 'empresa',
        TIPO: 'tipo', SEGMENTO: 'segmento', CLASE: 'clase', DESCRIPTOR_AUTO: 'descriptorMaestro',
        PRECIO_NETO: 'precioNeto', REGISTRADO_POR: 'registradoPor'
      };
      const indices = headers.map((h, i) => i).filter((i) => !columnaDe[headers[i]] || ver(columnaDe[headers[i]]));

      descargarCSV(
        indices.map((i) => headers[i]),
        rows.map((fila) => indices.map((i) => fila[i])),
        `registros_con_codigo_${new Date().toISOString().slice(0, 10)}.csv`
      );

      showToast('Exportación exitosa', 'success');
    } catch (error) {
      console.error('Error al exportar:', error);
      showToast('Error al exportar los datos', 'error');
    }
  };

  const handleDescargarPlantilla = () => {
    try {
      const headers = [
        'CODIGO',
        'REFERENCIA',
        'DESCRIPTOR_EMPRESA',
        'EMPRESA',
        'TIPO',
        'SEGMENTO',
        'CLASE',
        'DESCRIPTOR_AUTO',
        'PRECIO_NETO',
        'CX',
        'OBSERVACION'
      ];

      const ejemplo = [
        'COD001',
        'REF-EJEMPLO',
        'DESC EMPRESA',
        'EMPRESA EJEMPLO S.A.',
        'COTIZACION',
        'IMPLANTES',
        'IMPLANTE',
        'DESCRIPTOR MANUAL',
        '50000',
        'CX1',
        'Observación, con coma y punto y coma; de ejemplo'
      ];

      descargarCSV(headers, [ejemplo], 'plantilla_registros_con_codigo.csv');

      showToast('Plantilla descargada correctamente', 'success');
    } catch (error) {
      console.error('Error al descargar plantilla:', error);
      showToast('Error al generar la plantilla', 'error');
    }
  };

  const handleEjecutarImportacion = async () => {
    if (!importFile) {
      return showToast('Por favor selecciona un archivo primero', 'warning');
    }

    setImporting(true);
    setProgreso({ ...PROGRESO_INICIAL, activo: true });

    try {
      const text = await importFile.text();
      const filas = parseCSVContent(text);

      if (filas.length < 2) {
        showToast('El archivo está vacío o no tiene el formato correcto', 'error');
        setProgreso(PROGRESO_INICIAL);
        return;
      }

      const headers = filas[0].map((h) => h.toLowerCase().replace(/"/g, ''));
      const dataRows = filas.slice(1);

      const filasValidas = [];
      const invalidas = [];

      dataRows.forEach((values, idx) => {
        const numeroFila = idx + 2; 
        const rowData = {};
        headers.forEach((header, index) => {
          rowData[header] = values[index] || '';
        });

        const codigo = rowData['codigo'] || rowData['cod'];
        const referencia = rowData['referencia'] || rowData['ref'];
        const empresa = rowData['empresa'];

        if (!codigo || !referencia || !empresa) {
          invalidas.push({ fila: numeroFila, motivo: 'Falta código, referencia o empresa' });
          return;
        }

        filasValidas.push({
          numeroFila,
          data: {
            codigo: codigo.toUpperCase(),
            referencia: referencia.toUpperCase(),
            descriptorEmpresa: (rowData['descriptor_empresa'] || rowData['descriptorempresa'] || '').toUpperCase(),
            empresa: empresa.toUpperCase(),
            tipo: (rowData['tipo'] || '').toUpperCase(),
            segmento: (rowData['segmento'] || '').toUpperCase(),
            clase: (rowData['clase'] || '').toUpperCase(),
            descriptorAuto: (rowData['descriptor_auto'] || rowData['descriptorauto'] || '').toUpperCase(),
            precioNeto: parseFloat(rowData['precio_neto'] || rowData['precioneto'] || 0) || 0,
            cx: (rowData['cx'] || '').toUpperCase(),
            observacion: (rowData['observacion'] || '').toUpperCase(),
            fechaRegistro: serverTimestamp(),
            registradoPor: userData?.nombreCompleto || 'Usuario Importación'
          }
        });
      });

      setProgreso((prev) => ({ ...prev, total: filasValidas.length, invalidas }));

      const lotes = chunk(filasValidas, FILAS_POR_LOTE);
      const fallidas = [];
      let procesadas = 0;

      for (const lote of lotes) {
        const batch = writeBatch(db);

        lote.forEach(({ data }) => {
          const docRef = doc(collection(db, colBase));
          batch.set(docRef, data);

          const logRef = doc(collection(db, colBase, docRef.id, 'logs'));
          batch.set(logRef, {
            accion: 'CREACION_MASIVA',
            detalles: { ...data, metodoRegistro: 'IMPORTACION' },
            usuario: userData?.nombreCompleto || 'Usuario Desconocido',
            usuarioEmail: userData?.email || '',
            fecha: new Date(),
            timestamp: serverTimestamp()
          });
        });

        try {
          await batch.commit();
          procesadas += lote.length;
        } catch (err) {
          console.error('Error al escribir lote:', err);
          lote.forEach(({ numeroFila }) =>
            fallidas.push({ fila: numeroFila, motivo: err.message })
          );
        }

        setProgreso((prev) => ({ ...prev, procesadas, fallidas }));
      }

      setProgreso((prev) => ({ ...prev, activo: false, finalizado: true }));

      const resumen = `Se importaron ${procesadas} de ${filasValidas.length} filas válidas` +
        (invalidas.length ? ` · ${invalidas.length} filas omitidas por datos incompletos` : '') +
        (fallidas.length ? ` · ${fallidas.length} fallaron al guardar` : '');

      showToast(resumen, fallidas.length || invalidas.length ? 'warning' : 'success');
      setImportFile(null);
    } catch (error) {
      console.error('Error en importación masiva:', error);
      showToast('Error al procesar el archivo: ' + error.message, 'error');
      setProgreso(PROGRESO_INICIAL);
    } finally {
      setImporting(false);
    }
  };

  const resetProgreso = () => setProgreso(PROGRESO_INICIAL);

  return {
    showConfigDrawer,
    setShowConfigDrawer,
    importFile,
    setImportFile,
    importing,
    progreso,
    resetProgreso,
    handleAbrirConfiguracion,
    handleExportarDatos,
    handleDescargarPlantilla,
    handleEjecutarImportacion
  };
};