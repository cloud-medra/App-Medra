import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { ocsDeGestion, textoOCs } from '../../../shared/ocIndex/indiceOC';

// Mismo formato usado por la columna "Admisión - Nombre" de la tabla
// principal de gestión y por los botones de copiado de CargasTab y
// DocumentosTab, para que los tres copien exactamente el mismo texto:
// "102030 - JUAN PEREZ - ". El espacio final es intencional (se pega y se
// sigue escribiendo el tipo del documento): no aplicarle trim.
export const construirTextoAdmisionNombre = (idMostrado, nombre) => `${idMostrado || 'P'} - ${nombre || 'P'} - `;

// "Hoy" en formato "YYYY-MM-DD", igual convención que el campo `fecha` de
// cada registro (string ISO, sin hora/timezone) — comparable con `<=`/`>=`
// directamente como string, sin parsear a Date.
export const obtenerFechaHoyISO = () => {
  const hoy = new Date();
  const yyyy = hoy.getFullYear();
  const mm = String(hoy.getMonth() + 1).padStart(2, '0');
  const dd = String(hoy.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const exportarGestionesAExcel = (implantes, showToast) => {
  if (!implantes || implantes.length === 0) {
    if (showToast) showToast("No hay datos para exportar", "error");
    return;
  }

  const dataExportar = implantes.map(i => ({
    "ID GESTIÓN": i.gestionId || i.agendaId || '',
    "NOMBRE": i.nombre || '',
    "FECHA": i.fecha || '',
    "EMPRESA": i.empresa || '',
    "ORDEN": textoOCs(ocsDeGestion(i)),
    "INFORME": i.informe || 'PENDIENTE',
    "CONVENIO": i.convenio || '',
    "PREVISIÓN": i.prevision || '',
    "MÉDICO": i.medico || '',
    "DESCRIPCIÓN": i.descripcion || '',
    "CENTRO": i.centro || '',
    "ATRIBUTO": i.atributo || '',
    "ESTADO": i.estado || '',
    "COSTO": i.costo || 0
  }));

  const worksheet = XLSX.utils.json_to_sheet(dataExportar);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Gestiones");

  const fechaHoy = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `gestiones_implantes_${fechaHoy}.xlsx`);

  if (showToast) showToast("Archivo exportado correctamente", "success");
};

export const descargarPlantillaCSV = (showToast) => {
  const headers = ["ID", "NOMBRE", "FECHA", "EMPRESA", "INFORME", "CENTRO", "ATRIBUTO", "ESTADO", "COSTO"];
  const ejemplo = ["123456", "Juan Pérez", "2026-09-15", "STRYKER", "PENDIENTE", "PABELLON", "IMPLANTES", "AGENDANDO", "1500000"];

  const csvContent = "\uFEFF" + [headers.join(";"), ejemplo.join(";")].join("\r\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "plantilla_gestiones_implantes.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);

  if (showToast) showToast("Plantilla descargada correctamente", "success");
};

export const parsearArchivoImportacion = (file) => {
  const fileName = file.name.toLowerCase();
  if (fileName.endsWith('.csv')) {
    return new Promise((resolve, reject) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(normalizarYValidarDatos(results.data)),
        error: (err) => reject(err)
      });
    });
  } else if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = new Uint8Array(e.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const rawData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);
          resolve(normalizarYValidarDatos(rawData));
        } catch (err) { reject(err); }
      };
      reader.onerror = (err) => reject(err);
      reader.readAsArrayBuffer(file);
    });
  }
  throw new Error("Formato de archivo no soportado. Usa .csv o .xlsx");
};

const normalizarYValidarDatos = (rows) => {
  return rows.map(row => {
    const getVal = (...possibleKeys) => {
      const rowKeys = Object.keys(row);
      for (const pk of possibleKeys) {
        const found = rowKeys.find(k => k.trim().toUpperCase() === pk.toUpperCase());
        if (found && row[found] !== undefined && row[found] !== null) {
          return String(row[found]).trim();
        }
      }
      return '';
    };

    const idCapturado = getVal('ID GESTIÓN', 'ID GESTION', 'GESTIONID', 'GESTION ID', 'GESTION', 'ID AGENDA', 'AGENDAID', 'AGENDA ID', 'ID') || 'P';

    return {
      gestionId: idCapturado,
      agendaId: idCapturado,
      nombre: getVal('NOMBRE', 'PACIENTE') || 'P',
      fecha: getVal('FECHA', 'FECHA (AAAA-MM-DD)') || 'P',
      empresa: getVal('EMPRESA') || 'P',
      informe: (getVal('INFORME') || 'PENDIENTE').toUpperCase(),
      convenio: getVal('CONVENIO') || 'P',
      prevision: getVal('PREVISIÓN', 'PREVISION') || 'P',
      medico: getVal('MÉDICO', 'MEDICO') || 'P',
      descripcion: getVal('DESCRIPCIÓN', 'DESCRIPCION') || 'P',
      centro: (getVal('CENTRO') || 'PABELLON').toUpperCase(),
      atributo: (getVal('ATRIBUTO') || 'IMPLANTES').toUpperCase(),
      estado: (getVal('ESTADO') || 'AGENDANDO').toUpperCase(),
      costo: Number(getVal('COSTO')) || 0
    };
  }).filter(r => r.fecha && r.fecha !== 'P');
};

export const formatearFecha = (fecha) => {
  if (!fecha) return 'N/A';
  const date = fecha.toDate ? fecha.toDate() : new Date(fecha);
  if (isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};