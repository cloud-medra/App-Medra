import { useState } from 'react';
import {
  collection,
  doc,
  writeBatch,
  serverTimestamp
} from 'firebase/firestore';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { db } from '../../../../../firebaseConfig';
import { filtrarFilasExport } from '../../../../../hooks/useColumnasPermitidas';

// Encabezado del Excel → columna de la tabla de Pendientes (CX y OBSERVACION
// no tienen columna en pantalla: se exportan siempre).
const COLUMNA_DE_EXPORT = {
  REFERENCIA: 'referencia',
  DESCRIPTOR_EMPRESA: 'descEmpresa',
  EMPRESA: 'empresa',
  TIPO: 'tipo',
  SEGMENTO: 'segmento',
  CLASE: 'clase',
  DESCRIPTOR_AUTO: 'descAuto',
  PRECIO_NETO: 'precioNeto',
};

/**
 * Hook que encapsula toda la lógica de importación / exportación masiva
 * de "códigos pendientes": exportar a xlsx, descargar plantilla csv,
 * parsear archivos (csv/xlsx), validar filas y guardar en batch en Firestore
 * (incluyendo el log de auditoría CREACION_MASIVA por cada registro).
 *
 * @param {Object} params
 * @param {Array} params.registros - Registros pendientes actualmente cargados (para exportar).
 * @param {Object} params.userData - Usuario actual (para registradoPor / logs).
 * @param {Function} params.showToast - Función para mostrar notificaciones.
 * @param {string} params.colBase - Nombre de la colección base en Firestore.
 * @param {Function} [params.ver] - Permiso por columna de la tabla (useColumnasPermitidas):
 *   la exportación omite las columnas que el usuario no puede ver.
 */
export function useImportExportPendientes({ registros, userData, showToast, colBase, ver = () => true }) {
  const [showConfigDrawer, setShowConfigDrawer] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importing, setImporting] = useState(false);

  const handleAbrirConfiguracion = () => { setShowConfigDrawer(true); };

  const handleExportarDatos = () => {
    if (registros.length === 0) {
      return showToast("No hay datos para exportar", "error");
    }

    const dataExportar = registros.map(r => ({
      REFERENCIA: r.referencia || '',
      DESCRIPTOR_EMPRESA: r.descriptorEmpresa || '',
      EMPRESA: r.empresa || '',
      TIPO: r.tipo || '',
      SEGMENTO: r.segmento || '',
      CLASE: r.clase || '',
      DESCRIPTOR_AUTO: r.descriptorAuto || '',
      PRECIO_NETO: r.precioNeto || 0,
      CX: r.cx || '',
      OBSERVACION: r.observacion || ''
    }));

    const worksheet = XLSX.utils.json_to_sheet(filtrarFilasExport(dataExportar, COLUMNA_DE_EXPORT, ver));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pendientes");
    XLSX.writeFile(workbook, `codigos_pendientes_${new Date().toISOString().slice(0, 10)}.xlsx`);

    showToast("Archivo exportado correctamente", "success");
  };

  const handleDescargarPlantilla = () => {
    const headers = ["REFERENCIA", "DESCRIPTOR_EMPRESA", "EMPRESA", "TIPO", "SEGMENTO", "CLASE", "PRECIO_NETO", "CX", "OBSERVACION"];
    const ejemplo = ["REF001", "DESCRIPTOR EJEMPLO", "EMPRESA EJEMPLO", "COTIZACION", "IMPLANTES", "IMPLANTE", "15000", "CX01", "OBSERVACION DE EJEMPLO"];

    const csvContent = "\uFEFF" + [headers.join(";"), ejemplo.join(";")].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", "plantilla_importacion_pendientes.csv");
    document.body.appendChild(link);
    link.click();

    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showToast("Plantilla descargada correctamente", "success");
  };

  const normalizarYValidarDatos = (rows) => {
    const mapeados = [];

    for (const row of rows) {
      const keys = Object.keys(row);
      const getVal = (colName) => {
        const keyMatch = keys.find(k => k.trim().toUpperCase().replace(/\s+/g, '_') === colName);
        return keyMatch ? row[keyMatch] : null;
      };

      const referencia = String(getVal('REFERENCIA') || '').trim().toUpperCase();
      const descriptorEmpresa = String(getVal('DESCRIPTOR_EMPRESA') || '').trim().toUpperCase();
      const empresa = String(getVal('EMPRESA') || '').trim().toUpperCase();
      const tipo = String(getVal('TIPO') || '').trim().toUpperCase();
      const segmento = String(getVal('SEGMENTO') || '').trim().toUpperCase();
      const clase = String(getVal('CLASE') || '').trim().toUpperCase();
      const rawPrecio = getVal('PRECIO_NETO');
      const cx = String(getVal('CX') || '').trim().toUpperCase();
      const observacion = String(getVal('OBSERVACION') || '').trim().toUpperCase();

      const precioNeto = Number(String(rawPrecio || '0').replace(/[^0-9.]/g, ''));

      const descriptorAuto = [referencia, descriptorEmpresa].filter(Boolean).join(' ').toUpperCase();

      if (referencia && empresa && !isNaN(precioNeto) && precioNeto >= 0) {
        mapeados.push({
          referencia,
          descriptorEmpresa,
          empresa,
          tipo,
          segmento,
          clase,
          descriptorAuto,
          precioNeto,
          cx,
          observacion
        });
      }
    }

    return mapeados;
  };

  const parsearCSV = (file) => {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
        complete: (results) => {
          const procesados = normalizarYValidarDatos(results.data);
          resolve(procesados);
        },
        error: (err) => reject(err)
      });
    });
  };

  const parsearExcel = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const firstSheet = workbook.SheetNames[0];
          const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet]);
          const procesados = normalizarYValidarDatos(rawData);
          resolve(procesados);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  };

  const guardarRegistrosMasivos = async (registrosImportados) => {
    const BATCH_SIZE = 250;
    let index = 0;

    while (index < registrosImportados.length) {
      const chunk = registrosImportados.slice(index, index + BATCH_SIZE);
      const batch = writeBatch(db);

      for (const item of chunk) {
        const pendienteRef = doc(collection(db, colBase));
        batch.set(pendienteRef, {
          referencia: item.referencia,
          descriptorEmpresa: item.descriptorEmpresa,
          empresa: item.empresa,
          tipo: item.tipo,
          segmento: item.segmento,
          clase: item.clase,
          descriptorAuto: item.descriptorAuto,
          precioNeto: item.precioNeto,
          cx: item.cx,
          observacion: item.observacion,
          codigo: '',
          registradoPor: userData?.nombreCompleto || 'Importación Masiva',
          fechaRegistro: new Date()
        });

        const logRef = doc(collection(db, colBase, pendienteRef.id, "logs"));
        batch.set(logRef, {
          accion: 'CREACION_MASIVA',
          detalles: {
            referencia: item.referencia,
            descriptorEmpresa: item.descriptorEmpresa,
            empresa: item.empresa,
            tipo: item.tipo,
            segmento: item.segmento,
            clase: item.clase,
            precioNeto: item.precioNeto,
            cx: item.cx,
            observacion: item.observacion,
            metodoRegistro: 'IMPORTACION'
          },
          usuario: userData?.nombreCompleto || 'Importación Masiva',
          usuarioEmail: userData?.email || '',
          fecha: new Date(),
          timestamp: serverTimestamp()
        });
      }

      await batch.commit();
      index += BATCH_SIZE;
    }
  };

  const handleEjecutarImportacion = async () => {
    if (!importFile) {
      return showToast("Por favor selecciona un archivo para importar", "error");
    }

    setImporting(true);
    const fileName = importFile.name.toLowerCase();

    try {
      let registrosImportados = [];

      if (fileName.endsWith('.csv')) {
        registrosImportados = await parsearCSV(importFile);
      } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
        registrosImportados = await parsearExcel(importFile);
      } else {
        throw new Error("Formato de archivo no soportado. Usa .csv o .xlsx");
      }

      if (registrosImportados.length === 0) {
        throw new Error("El archivo no contiene registros válidos para importar");
      }

      await guardarRegistrosMasivos(registrosImportados);

      showToast(`Se importaron ${registrosImportados.length} registros con éxito`, "success");
      setImportFile(null);
      setShowConfigDrawer(false);
    } catch (error) {
      console.error("Error durante la importación:", error);
      showToast("Error al importar: " + error.message, "error");
    } finally {
      setImporting(false);
    }
  };

  return {
    showConfigDrawer,
    setShowConfigDrawer,
    importFile,
    setImportFile,
    importing,
    handleAbrirConfiguracion,
    handleExportarDatos,
    handleDescargarPlantilla,
    handleEjecutarImportacion
  };
}