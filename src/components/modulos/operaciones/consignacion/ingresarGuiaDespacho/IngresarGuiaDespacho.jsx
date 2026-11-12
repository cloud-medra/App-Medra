import React, { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { writeBatch, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db, functions } from '../../../../../firebaseConfig';
import { useToast } from '../../../../../context/ToastContext';
import Spinner from '../../../../ui/Spinner';

import {
  Layers,
  Camera,
  ImageUp,
  Sparkles,
  Trash2,
  Plus,
  Save,
  RotateCcw,
  Calendar,
  Hash,
  FileText,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Loader2,
} from 'lucide-react';

const NOMBRES_MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

const COLECCION_RAIZ = 'consignacion_guias';

const TIPOS_ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

const generarId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const FILA_VACIA = () => ({
  id: generarId(),
  codigo: '',
  descripcion: '',
  lote: '',
  vencimiento: '',
  cantidad: '',
  incluir: true,
});

const normalizarFechaParaInput = (valor) => {
  if (!valor || typeof valor !== 'string') return '';
  const limpio = valor.trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(limpio)) return limpio;

  const match = limpio.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (match) {
    const [, dia, mes, anio] = match;
    return `${anio}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`;
  }

  return '';
};

const leerArchivoComoDocumento = (archivo) =>
  new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onload = () => {
      const dataUrl = lector.result;
      resolve({
        id: generarId(),
        archivoNombre: archivo.name,
        mediaType: archivo.type,
        base64: dataUrl.split(',')[1],
        preview: archivo.type.startsWith('image/') ? dataUrl : null,
        estado: 'pendiente',
        errorMsg: '',
        filas: [],
        fechaEmision: '',
        numeroGuia: '',
        numeroDocumento: '',
        camposAutocompletados: { fechaEmision: false, numeroGuia: false, numeroDocumento: false },
      });
    };
    lector.onerror = () => reject(new Error(`No se pudo leer ${archivo.name}`));
    lector.readAsDataURL(archivo);
  });

const BadgeEstado = ({ estado, errorMsg }) => {
  const base = 'inline-flex items-center gap-1 text-pequeno px-1.5 py-0.5 rounded-full uppercase whitespace-nowrap';
  if (estado === 'pendiente') {
    return <span className={`${base} bg-gray-100 dark:bg-gray-700 text-tinta-secundaria`}>Pendiente</span>;
  }
  if (estado === 'extrayendo') {
    return (
      <span className={`${base} bg-blue-100 dark:bg-blue-950/40 text-blue-700 dark:text-blue-400`}>
        <Loader2 size={10} className="animate-spin" /> Leyendo
      </span>
    );
  }
  if (estado === 'listo') {
    return <span className={`${base} bg-green-100 dark:bg-green-950/40 text-green-700 dark:text-green-400`}>Listo</span>;
  }
  if (estado === 'guardado') {
    return <span className={`${base} bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-300`}>Guardado</span>;
  }
  return (
    <span title={errorMsg || 'Error al procesar'} className={`${base} bg-red-100 dark:bg-red-950/40 text-red-700 dark:text-red-400`}>
      Error
    </span>
  );
};

const IngresarGuiaDespacho = () => {
  const { showToast } = useToast();
  const inputArchivosRef = useRef(null);
  const inputCamaraRef = useRef(null);

  const [documentos, setDocumentos] = useState([]);
  const [filaExpandidaId, setFilaExpandidaId] = useState(null);
  const [arrastrando, setArrastrando] = useState(false);

  const [procesandoCola, setProcesandoCola] = useState(false);
  const [progreso, setProgreso] = useState({ actual: 0, total: 0, nombre: '' });
  const [guardandoTodo, setGuardandoTodo] = useState(false);
  const [guardandoId, setGuardandoId] = useState(null);

  const extraerDatos = httpsCallable(functions, 'extraerGuiaDespacho');

  const agregarArchivos = async (fileList) => {
    const archivos = Array.from(fileList || []);
    if (archivos.length === 0) return;

    const validos = archivos.filter((a) => TIPOS_ACEPTADOS.includes(a.type));
    const invalidos = archivos.length - validos.length;

    if (invalidos > 0) {
      showToast(`Se ignoraron ${invalidos} archivo(s) con formato no soportado`, 'error');
    }
    if (validos.length === 0) return;

    try {
      const nuevos = await Promise.all(validos.map(leerArchivoComoDocumento));
      setDocumentos((prev) => [...prev, ...nuevos]);
      showToast(`${nuevos.length} guía(s) agregada(s)`, 'success');
    } catch (err) {
      console.error('Error al leer archivos:', err);
      showToast('No se pudieron leer algunos archivos', 'error');
    }
  };

  const manejarInputArchivos = (e) => {
    agregarArchivos(e.target.files);
    e.target.value = '';
  };

  const manejarDragOver = (e) => {
    e.preventDefault();
    setArrastrando(true);
  };

  const manejarDragLeave = (e) => {
    e.preventDefault();
    setArrastrando(false);
  };

  const manejarDrop = (e) => {
    e.preventDefault();
    setArrastrando(false);
    agregarArchivos(e.dataTransfer.files);
  };

  const quitarDocumento = (docId) => {
    setDocumentos((prev) => prev.filter((d) => d.id !== docId));
    setFilaExpandidaId((prev) => (prev === docId ? null : prev));
  };

  const reiniciarTodo = () => {
    setDocumentos([]);
    setFilaExpandidaId(null);
  };

  const extraerTodo = async () => {
    const mapaInicial = new Map(documentos.map((d) => [d.id, d]));
    const idsAProcesar = documentos
      .filter((d) => d.estado === 'pendiente' || d.estado === 'error')
      .map((d) => d.id);

    if (idsAProcesar.length === 0) {
      showToast('No hay guías pendientes por extraer', 'error');
      return;
    }

    setProcesandoCola(true);
    let exitosos = 0;
    let fallidos = 0;

    for (let i = 0; i < idsAProcesar.length; i += 1) {
      const id = idsAProcesar[i];
      const docOriginal = mapaInicial.get(id);
      if (!docOriginal) continue;

      setProgreso({ actual: i + 1, total: idsAProcesar.length, nombre: docOriginal.archivoNombre });
      setDocumentos((prev) => prev.map((d) => (d.id === id ? { ...d, estado: 'extrayendo', errorMsg: '' } : d)));

      try {
        const { data } = await extraerDatos({
          imagenBase64: docOriginal.base64,
          mediaType: docOriginal.mediaType,
        });
        const items = Array.isArray(data?.items) ? data.items : [];
        const cabecera = data?.cabecera || {};

        if (items.length === 0) {
          setDocumentos((prev) =>
            prev.map((d) =>
              d.id === id
                ? { ...d, estado: 'error', errorMsg: 'No se detectaron productos. Prueba con otra foto más nítida.' }
                : d
            )
          );
          fallidos += 1;
          continue;
        }

        const fechaNormalizada = normalizarFechaParaInput(cabecera.fechaEmision);
        const guiaDetectada = (cabecera.numeroGuia || '').trim();
        const documentoDetectado = (cabecera.numeroDocumento || '').trim();

        setDocumentos((prev) =>
          prev.map((d) =>
            d.id === id
              ? {
                  ...d,
                  estado: 'listo',
                  errorMsg: '',
                  filas: items.map((item) => ({
                    id: generarId(),
                    codigo: item.codigo ?? '',
                    descripcion: item.descripcion ?? '',
                    lote: item.lote ?? '',
                    vencimiento: item.vencimiento ?? '',
                    cantidad: item.cantidad ?? '',
                    incluir: true,
                  })),
                  fechaEmision: fechaNormalizada,
                  numeroGuia: guiaDetectada,
                  numeroDocumento: documentoDetectado,
                  camposAutocompletados: {
                    fechaEmision: Boolean(fechaNormalizada),
                    numeroGuia: Boolean(guiaDetectada),
                    numeroDocumento: Boolean(documentoDetectado),
                  },
                }
              : d
          )
        );
        exitosos += 1;
      } catch (err) {
        console.error('Error al extraer una guía:', docOriginal.archivoNombre, err);
        setDocumentos((prev) =>
          prev.map((d) =>
            d.id === id ? { ...d, estado: 'error', errorMsg: 'No se pudo leer esta guía. Intenta de nuevo.' } : d
          )
        );
        fallidos += 1;
      }
    }

    setProcesandoCola(false);
    setProgreso({ actual: 0, total: 0, nombre: '' });

    if (fallidos === 0) {
      showToast(`Se extrajeron ${exitosos} guía(s) correctamente`, 'success');
    } else {
      showToast(`${exitosos} guía(s) lista(s), ${fallidos} con error. Revisa las marcadas en rojo.`, 'error');
    }
  };

  const actualizarCampoCabecera = (docId, campo, valor) => {
    setDocumentos((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, [campo]: valor, camposAutocompletados: { ...d.camposAutocompletados, [campo]: false } }
          : d
      )
    );
  };

  const actualizarFila = (docId, filaId, campo, valor) => {
    setDocumentos((prev) =>
      prev.map((d) =>
        d.id === docId ? { ...d, filas: d.filas.map((f) => (f.id === filaId ? { ...f, [campo]: valor } : f)) } : d
      )
    );
  };

  const toggleIncluirFila = (docId, filaId) => {
    setDocumentos((prev) =>
      prev.map((d) =>
        d.id === docId
          ? { ...d, filas: d.filas.map((f) => (f.id === filaId ? { ...f, incluir: !f.incluir } : f)) }
          : d
      )
    );
  };

  const eliminarFila = (docId, filaId) => {
    setDocumentos((prev) =>
      prev.map((d) => (d.id === docId ? { ...d, filas: d.filas.filter((f) => f.id !== filaId) } : d))
    );
  };

  const agregarFilaManual = (docId) => {
    setDocumentos((prev) => prev.map((d) => (d.id === docId ? { ...d, filas: [...d.filas, FILA_VACIA()] } : d)));
  };

  const guardarDocumento = async (docId) => {
    const documento = documentos.find((d) => d.id === docId);
    if (!documento) return false;

    const filasSeleccionadas = documento.filas.filter((f) => f.incluir);

    if (filasSeleccionadas.length === 0) {
      showToast(`No hay filas seleccionadas en "${documento.archivoNombre}"`, 'error');
      return false;
    }
    const incompletas = filasSeleccionadas.filter((f) => !f.codigo.trim());
    if (incompletas.length > 0) {
      showToast(`Hay filas sin código en "${documento.archivoNombre}", complétalas antes de guardar`, 'error');
      return false;
    }
    if (!documento.fechaEmision || !documento.numeroGuia.trim() || !documento.numeroDocumento.trim()) {
      showToast(`Completa fecha de emisión, N° de guía y N° de documento en "${documento.archivoNombre}"`, 'error');
      return false;
    }

    setGuardandoId(docId);

    try {
      const fechaObj = new Date(`${documento.fechaEmision}T00:00:00`);
      const año = String(fechaObj.getFullYear());
      const mesNumero = fechaObj.getMonth() + 1;
      const nombreDelMes = NOMBRES_MESES[mesNumero - 1];
      const numDocLimpio = documento.numeroDocumento.trim().replace(/\//g, '-');

      const lote = writeBatch(db);

      const refAño = doc(db, COLECCION_RAIZ, año);
      lote.set(refAño, { año: Number(año), actualizadoEl: serverTimestamp() }, { merge: true });

      const refMes = doc(db, COLECCION_RAIZ, año, 'mes', nombreDelMes);
      lote.set(refMes, { mes: mesNumero, nombreMes: nombreDelMes, actualizadoEl: serverTimestamp() }, { merge: true });

      const refDocumento = doc(db, COLECCION_RAIZ, año, 'mes', nombreDelMes, 'documento', numDocLimpio);
      lote.set(
        refDocumento,
        {
          numeroGuia: documento.numeroGuia.trim(),
          numeroDocumento: documento.numeroDocumento.trim(),
          fechaEmision: documento.fechaEmision,
          descripcionPrimerItem: (documento.filas[0]?.descripcion || '').trim(),
          actualizadoEl: serverTimestamp(),
        },
        { merge: true }
      );

      const refDetalles = collection(
        db, COLECCION_RAIZ, año, 'mes', nombreDelMes, 'documento', numDocLimpio, 'detalles'
      );
      const descripcionPrimerItem = (documento.filas[0]?.descripcion || '').trim();
      filasSeleccionadas.forEach((fila) => {
        const refItem = doc(refDetalles);
        lote.set(refItem, {
          codigo: fila.codigo.trim(),
          descripcion: fila.descripcion.trim(),
          lote: fila.lote.trim(),
          vencimiento: fila.vencimiento.trim(),
          cantidad: fila.cantidad === '' ? null : Number(fila.cantidad) || fila.cantidad,
          numeroGuia: documento.numeroGuia.trim(),
          numeroDocumento: documento.numeroDocumento.trim(),
          fechaEmision: documento.fechaEmision,
          descripcionPrimerItem,
          origen: 'guia_despacho_ocr',
          creadoEl: serverTimestamp(),
        });
      });

      await lote.commit();

      setDocumentos((prev) => prev.map((d) => (d.id === docId ? { ...d, estado: 'guardado' } : d)));
      return true;
    } catch (err) {
      console.error('Error al guardar la guía:', documento.archivoNombre, err);
      showToast(`No se pudo guardar "${documento.archivoNombre}"`, 'error');
      return false;
    } finally {
      setGuardandoId(null);
    }
  };

  const guardarTodasLasListas = async () => {
    const listas = documentos.filter((d) => d.estado === 'listo');
    if (listas.length === 0) {
      showToast('No hay guías listas para guardar', 'error');
      return;
    }

    setGuardandoTodo(true);
    let exitosas = 0;
    let fallidas = 0;

    for (const documento of listas) {
      const ok = await guardarDocumento(documento.id);
      if (ok) exitosas += 1;
      else fallidas += 1;
    }

    setGuardandoTodo(false);

    if (fallidas === 0) {
      showToast(`${exitosas} guía(s) guardada(s) correctamente`, 'success');
    } else {
      showToast(`${exitosas} guardada(s), ${fallidas} con error. Revísalas.`, 'error');
    }
  };

  const totalPendientes = documentos.filter((d) => d.estado === 'pendiente').length;
  const totalErrores = documentos.filter((d) => d.estado === 'error').length;
  const totalListas = documentos.filter((d) => d.estado === 'listo').length;
  const hayPendientesOErrores = totalPendientes + totalErrores > 0;

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-secundario">
      {/* --- OVERLAY DE PROCESO (mismo patrón que el "Procesando..." de Empresas) --- */}
      {(procesandoCola || guardandoTodo) && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-2">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] text-subtitulo">
              {procesandoCola ? `Extrayendo guía ${progreso.actual} de ${progreso.total}...` : 'Guardando guías...'}
            </h3>
            {procesandoCola && progreso.nombre && (
              <p className="text-tinta-secundaria text-pequeno max-w-[220px] truncate">{progreso.nombre}</p>
            )}
          </div>
        </div>
      )}

      <div className="px-3 py-2 flex items-center justify-between border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-titulo-seccion text-tinta-principal flex items-center gap-1.5">
          <Layers size={14} className="text-[#2383C2]" />
          Ingresar guías de despacho
        </h2>
        <div className="flex items-center gap-2">
          {documentos.length > 0 && (
            <span className="text-pequeno text-tinta-atenuada">
              {documentos.length} cargada(s)
              {totalListas > 0 ? ` · ${totalListas} lista(s)` : ''}
              {totalErrores > 0 ? ` · ${totalErrores} error` : ''}
            </span>
          )}
          {documentos.length > 0 && (
            <button
              onClick={reiniciarTodo}
              disabled={procesandoCola || guardandoTodo}
              title="Limpiar todo"
              className="p-1 rounded-md text-tinta-secundaria hover:text-red-500 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition disabled:opacity-40"
            >
              <RotateCcw size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="px-3 py-2 flex flex-wrap items-center gap-2.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20">
        <label
          onDragOver={manejarDragOver}
          onDragLeave={manejarDragLeave}
          onDrop={manejarDrop}
          className={`flex-1 min-w-[220px] h-7 flex items-center justify-center gap-1.5 border border-dashed rounded text-pequeno cursor-pointer transition-colors ${
            arrastrando
              ? 'border-[#2383C2] text-[#2383C2] bg-[#2383C2]/10'
              : 'border-gray-300 dark:border-gray-600 text-tinta-secundaria hover:border-[#2383C2] hover:text-[#2383C2]'
          }`}
        >
          <ImageUp size={13} />
          {arrastrando ? 'Suelta los archivos aquí' : 'Arrastra o toca para elegir guías (PDF/foto)'}
          <input
            ref={inputArchivosRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            multiple
            onChange={manejarInputArchivos}
            className="hidden"
          />
        </label>

        <button
          type="button"
          onClick={() => inputCamaraRef.current?.click()}
          className="h-7 px-2.5 flex items-center gap-1 border border-gray-300 dark:border-gray-600 rounded text-pequeno text-tinta-secundaria hover:border-[#2383C2] hover:text-[#2383C2] transition"
        >
          <Camera size={13} />
          Foto
        </button>
        <input
          ref={inputCamaraRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={manejarInputArchivos}
          className="hidden"
        />

        <button
          type="button"
          onClick={extraerTodo}
          disabled={procesandoCola || guardandoTodo || !hayPendientesOErrores}
          className="h-7 px-3 rounded text-etiqueta flex items-center gap-1.5 bg-[#2383C2] hover:bg-[#369BCE] text-white transition disabled:opacity-50"
        >
          <Sparkles size={13} />
          Extraer todo ({totalPendientes + totalErrores})
        </button>

        {totalListas > 0 && (
          <button
            type="button"
            onClick={guardarTodasLasListas}
            disabled={procesandoCola || guardandoTodo}
            className="h-7 px-3 rounded text-etiqueta flex items-center gap-1.5 bg-green-600 hover:bg-green-700 text-white transition disabled:opacity-50"
          >
            <Save size={13} />
            Guardar todas ({totalListas})
          </button>
        )}
      </div>

      <div className="flex-grow overflow-auto">
        <table className="w-full text-left text-secundario border-collapse">
          <thead className="bg-gray-100 dark:bg-gray-900 sticky top-0 z-10">
            <tr className="text-tinta-secundaria uppercase text-pequeno">
              <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-8 text-center">#</th>
              <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Nombre</th>
              <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Descripción</th>
              <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700">Estado</th>
              <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-24">N° Guía</th>
              <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-28">N° Documento</th>
              <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-32">Fecha Emisión</th>
              <th className="py-1.5 px-2 border-b border-r border-gray-200 dark:border-gray-700 w-14 text-center">Items</th>
              <th className="py-1.5 px-2 border-b border-gray-200 dark:border-gray-700 w-24 text-center">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {documentos.length === 0 && (
              <tr>
                <td colSpan={9} className="py-6 text-center text-tinta-atenuada">
                  Aún no has cargado guías. Arrástralas arriba para comenzar.
                </td>
              </tr>
            )}

            {documentos.map((documento, index) => {
              const puedeExpandir = documento.estado === 'listo' || documento.estado === 'guardado';
              const expandida = filaExpandidaId === documento.id;
              const soloLectura = documento.estado === 'guardado';
              const filasSeleccionadas = documento.filas.filter((f) => f.incluir);
              const bloqueado = procesandoCola || guardandoTodo || guardandoId === documento.id;
              const primerItemDescripcion = documento.filas[0]?.descripcion?.trim() || '';

              return (
                <React.Fragment key={documento.id}>
                  <tr className="border-l-2 border-transparent hover:border-[#2383C2] hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors">
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria text-etiqueta text-center">
                      {index + 1}
                    </td>
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-principal max-w-[160px]">
                      <span className="block truncate" title={documento.archivoNombre}>
                        {documento.archivoNombre}
                      </span>
                    </td>
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-tinta-secundaria max-w-[200px]">
                      <span className="block truncate" title={primerItemDescripcion}>
                        {primerItemDescripcion || (puedeExpandir ? '(sin descripción)' : '-')}
                      </span>
                    </td>
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                      <BadgeEstado estado={documento.estado} errorMsg={documento.errorMsg} />
                    </td>
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                      <input
                        value={documento.numeroGuia}
                        disabled={!puedeExpandir || soloLectura}
                        placeholder="-"
                        onChange={(e) => actualizarCampoCabecera(documento.id, 'numeroGuia', e.target.value)}
                        className="w-full h-6 px-1.5 rounded border border-gray-300 dark:border-gray-600 text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal disabled:opacity-50 disabled:bg-transparent disabled:border-transparent"
                      />
                    </td>
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                      <input
                        value={documento.numeroDocumento}
                        disabled={!puedeExpandir || soloLectura}
                        placeholder="-"
                        onChange={(e) => actualizarCampoCabecera(documento.id, 'numeroDocumento', e.target.value)}
                        className="w-full h-6 px-1.5 rounded border border-gray-300 dark:border-gray-600 text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal disabled:opacity-50 disabled:bg-transparent disabled:border-transparent"
                      />
                    </td>
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70">
                      <input
                        type="date"
                        value={documento.fechaEmision}
                        disabled={!puedeExpandir || soloLectura}
                        onChange={(e) => actualizarCampoCabecera(documento.id, 'fechaEmision', e.target.value)}
                        className="w-full h-6 px-1.5 rounded border border-gray-300 dark:border-gray-600 text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal disabled:opacity-50 disabled:bg-transparent disabled:border-transparent"
                      />
                    </td>
                    <td className="py-1 px-2 border-b border-r border-gray-200 dark:border-gray-700/70 text-center text-tinta-secundaria text-etiqueta">
                      {puedeExpandir ? `${filasSeleccionadas.length}/${documento.filas.length}` : '-'}
                    </td>
                    <td className="py-1 px-2 border-b border-gray-200 dark:border-gray-700/70">
                      <div className="flex justify-center items-center gap-2">
                        {documento.estado === 'error' && (
                          <button
                            onClick={extraerTodo}
                            disabled={procesandoCola}
                            title="Reintentar extracción"
                            className="text-[#2383C2] hover:text-[#1b6aa0] transition disabled:opacity-40"
                          >
                            <RefreshCw size={13} />
                          </button>
                        )}
                        <button
                          onClick={() => setFilaExpandidaId((prev) => (prev === documento.id ? null : documento.id))}
                          disabled={!puedeExpandir}
                          title={puedeExpandir ? 'Ver items' : 'Aún no se ha extraído'}
                          className="text-tinta-secundaria hover:text-[#2383C2] dark:hover:text-[#2383C2] transition disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                          {expandida ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                        {documento.estado !== 'guardado' && (
                          <button
                            onClick={() => quitarDocumento(documento.id)}
                            disabled={bloqueado}
                            title="Quitar"
                            className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 transition disabled:opacity-40"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>

                  {expandida && (
                    <tr>
                      <td colSpan={9} className="bg-gray-50 dark:bg-gray-900/40 px-3 py-3 border-b border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-pequeno text-tinta-secundaria">
                            {soloLectura
                              ? 'Esta guía ya fue guardada.'
                              : 'Revisa y corrige si algo no se leyó bien antes de guardar.'}
                          </p>
                          {!soloLectura && (
                            <button
                              type="button"
                              onClick={() => agregarFilaManual(documento.id)}
                              className="flex items-center gap-1 text-pequeno text-[#2383C2] hover:underline shrink-0"
                            >
                              <Plus size={12} />
                              Agregar fila
                            </button>
                          )}
                        </div>

                        <div className="overflow-x-auto -mx-1">
                          <table className="w-full text-secundario border-collapse min-w-[620px]">
                            <thead>
                              <tr className="text-pequeno text-tinta-secundaria uppercase text-left">
                                <th className="px-1 py-1 w-7"></th>
                                <th className="px-1 py-1">Código</th>
                                <th className="px-1 py-1">Descripción</th>
                                <th className="px-1 py-1">Lote</th>
                                <th className="px-1 py-1">Vencimiento</th>
                                <th className="px-1 py-1 w-16">Cantidad</th>
                                <th className="px-1 py-1 w-7"></th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                              {documento.filas.map((fila) => (
                                <tr key={fila.id} className={fila.incluir ? '' : 'opacity-40'}>
                                  <td className="px-1 py-0.5">
                                    <input
                                      type="checkbox"
                                      checked={fila.incluir}
                                      disabled={soloLectura}
                                      onChange={() => toggleIncluirFila(documento.id, fila.id)}
                                      className="accent-[#2383C2]"
                                    />
                                  </td>
                                  <td className="px-1 py-0.5">
                                    <input
                                      value={fila.codigo}
                                      disabled={soloLectura}
                                      onChange={(e) => actualizarFila(documento.id, fila.id, 'codigo', e.target.value)}
                                      className="w-20 text-secundario p-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-tinta-principal focus:outline-none focus:border-[#2383C2] disabled:opacity-60"
                                    />
                                  </td>
                                  <td className="px-1 py-0.5">
                                    <input
                                      value={fila.descripcion}
                                      disabled={soloLectura}
                                      onChange={(e) => actualizarFila(documento.id, fila.id, 'descripcion', e.target.value)}
                                      className="w-full min-w-[150px] text-secundario p-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-tinta-principal focus:outline-none focus:border-[#2383C2] disabled:opacity-60"
                                    />
                                  </td>
                                  <td className="px-1 py-0.5">
                                    <input
                                      value={fila.lote}
                                      disabled={soloLectura}
                                      onChange={(e) => actualizarFila(documento.id, fila.id, 'lote', e.target.value)}
                                      className="w-20 text-secundario p-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-tinta-principal focus:outline-none focus:border-[#2383C2] disabled:opacity-60"
                                    />
                                  </td>
                                  <td className="px-1 py-0.5">
                                    <input
                                      value={fila.vencimiento}
                                      disabled={soloLectura}
                                      placeholder="DD-MM-AAAA"
                                      onChange={(e) => actualizarFila(documento.id, fila.id, 'vencimiento', e.target.value)}
                                      className="w-20 text-secundario p-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-tinta-principal focus:outline-none focus:border-[#2383C2] disabled:opacity-60"
                                    />
                                  </td>
                                  <td className="px-1 py-0.5">
                                    <input
                                      value={fila.cantidad}
                                      disabled={soloLectura}
                                      onChange={(e) => actualizarFila(documento.id, fila.id, 'cantidad', e.target.value)}
                                      className="w-14 text-secundario p-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-tinta-principal focus:outline-none focus:border-[#2383C2] disabled:opacity-60"
                                    />
                                  </td>
                                  <td className="px-1 py-0.5">
                                    {!soloLectura && (
                                      <button
                                        type="button"
                                        onClick={() => eliminarFila(documento.id, fila.id)}
                                        className="p-1 text-tinta-atenuada hover:text-red-500 rounded"
                                      >
                                        <Trash2 size={12} />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {!soloLectura && (
                          <div className="flex items-center justify-end pt-2 mt-1 border-t border-gray-200 dark:border-gray-700">
                            <button
                              type="button"
                              onClick={() => guardarDocumento(documento.id)}
                              disabled={guardandoId === documento.id || guardandoTodo || filasSeleccionadas.length === 0}
                              className="h-7 px-3 rounded text-etiqueta flex items-center gap-1.5 bg-[#2383C2] hover:bg-[#369BCE] text-white transition disabled:opacity-50 min-w-[150px] justify-center"
                            >
                              {guardandoId === documento.id ? (
                                <>
                                  <Loader2 size={13} className="animate-spin" />
                                  <span>Guardando...</span>
                                </>
                              ) : (
                                <>
                                  <Save size={13} />
                                  <span>Guardar {filasSeleccionadas.length} productos</span>
                                </>
                              )}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default IngresarGuiaDespacho;