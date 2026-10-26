import { useMemo, useRef, useState, useEffect } from 'react';
import { db } from '../../../../../firebaseConfig';
import { Sheet, Plus, Trash2, Eraser, Search, Save, Loader2, AlertCircle, CheckCircle2, AlertTriangle, History } from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useModal } from '../../../../../context/ModalContext';
import { useUser } from '../../../../../context/UserContext';
import Spinner from '../../../../ui/Spinner';
import { obtenerCodigosCacheados, buscarReporteInfoReintentandoNoEncontradas } from '../registroConsignacion/utils/cacheMaestros';
import { TIPOS_CONSIGNACION, guardarRegistrosConsignacionEnLote } from '../utils/registroConsignacionService';
import {
  COLUMNAS_INGRESO,
  crearFilasVacias,
  crearFilaVacia,
  filaEstaVacia,
  parsearTextoPortapapeles,
  pegarMatrizEnFilas
} from './utils/grillaPortapapeles';
import {
  ESTADOS_FILA,
  ETIQUETAS_ESTADO,
  esEstadoGuardable,
  resolverFilas,
  resumirFilas,
  mensajeConfirmacionGuardado
} from './utils/validacionesCargaMasiva';
import { leerBorrador, guardarBorrador, borrarBorrador, filasDesdeBorrador } from './utils/borradorCargaMasiva';
import { useCatalogo } from '../../../../../hooks/useCatalogo';
import { errorPrecio, precioANumero, buscarReglaRecargo, calcularVentaItem, aplicarPrecioEditado } from '../utils/precioEspecial';
import BadgePrecioEspecial from '../utils/BadgePrecioEspecial';

const FILAS_INICIALES = 20;

const COLUMNAS_LECTURA = [
  { key: 'referencia', label: 'Referencia', ancho: 'min-w-[120px]' },
  { key: 'empresa', label: 'Proveedor (maestro)', ancho: 'min-w-[120px]' },
  { key: 'costo', label: 'Precio', ancho: 'min-w-[80px]', formato: (v) => (v === '' || v === undefined || v === null ? '' : `$${Number(v).toLocaleString('es-CL')}`) },
  { key: 'atributo', label: 'Atributo', ancho: 'min-w-[90px]' },
  { key: 'prevision', label: 'Previsión', ancho: 'min-w-[100px]' },
  { key: 'convenio', label: 'Convenio', ancho: 'min-w-[100px]' },
  { key: 'descripcionPabellon', label: 'Desc. Pabellón', ancho: 'min-w-[180px]' }
];

const ESTILO_ESTADO = {
  [ESTADOS_FILA.OK]: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  [ESTADOS_FILA.ADMISION_NO_ENCONTRADA]: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  [ESTADOS_FILA.CODIGO_NO_ENCONTRADO]: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
  [ESTADOS_FILA.DATO_INVALIDO]: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
};

const formatearFechaHora = (ms) => new Date(ms).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

const CargaMasivaConsignacion = () => {
  const [filas, setFilas] = useState(() => crearFilasVacias(FILAS_INICIALES));
  const [tipo, setTipo] = useState('CONSIGNACION');
  const [cargando, setCargando] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cargado, setCargado] = useState(false);
  const [foco, setFoco] = useState(null); // { fila, col } a enfocar tras navegar

  const celdasRef = useRef(new Map());

  const { showToast } = useToast();
  const { confirmAction } = useModal();
  const { userData } = useUser();
  const uid = userData?.uid || null;

  // Borrador en el navegador (ver borradorCargaMasiva.js): se crea al
  // presionar "Cargar" y, mientras exista, se actualiza con cada cambio.
  const [borradorActivo, setBorradorActivo] = useState(false);
  // Fecha del borrador restaurado al entrar (muestra el aviso), o null.
  const [borradorRestaurado, setBorradorRestaurado] = useState(null);
  // Se revisa una vez por usuario, apenas se conoce su uid (estado ajustado
  // durante el render, sin efecto).
  const [uidRevisado, setUidRevisado] = useState(null);
  if (uid && uidRevisado !== uid) {
    setUidRevisado(uid);
    const borrador = leerBorrador(uid);
    if (borrador) {
      setFilas(filasDesdeBorrador(borrador.valores, FILAS_INICIALES, borrador.precios));
      if (TIPOS_CONSIGNACION.includes(borrador.tipo)) setTipo(borrador.tipo);
      setCargado(false);
      setBorradorActivo(true);
      setBorradorRestaurado(borrador.guardadoEn);
    }
  }

  useEffect(() => {
    if (borradorActivo && uid) guardarBorrador(uid, { tipo, filas });
  }, [borradorActivo, uid, tipo, filas]);

  const resumen = useMemo(() => resumirFilas(filas), [filas]);

  useEffect(() => {
    if (!foco) return;
    const input = celdasRef.current.get(`${foco.fila}-${foco.col}`);
    if (input) {
      input.focus();
      input.select();
    }
  }, [foco, filas.length]);

  const registrarCelda = (fila, col) => (el) => {
    const clave = `${fila}-${col}`;
    if (el) celdasRef.current.set(clave, el);
    else celdasRef.current.delete(clave);
  };

  const moverFoco = (fila, col) => {
    const totalCols = COLUMNAS_INGRESO.length;
    if (col < 0) {
      if (fila === 0) return;
      fila -= 1;
      col = totalCols - 1;
    } else if (col >= totalCols) {
      fila += 1;
      col = 0;
    }
    if (fila < 0) return;
    if (fila >= filas.length) setFilas((prev) => [...prev, crearFilaVacia()]);
    setFoco({ fila, col });
  };

  const handleCambio = (indiceFila, key, valor) => {
    setFilas((prev) => prev.map((f, i) => {
      if (i !== indiceFila) return f;
      const fila = { ...f, valores: { ...f.valores, [key]: valor }, resultado: null };
      // Otro código = otro producto: el precio especial editado ya no aplica.
      if (key === 'codigo') delete fila.precioEditado;
      return fila;
    }));
  };

  // Precio especial de una fila, editado en la vista previa (después de
  // "Cargar"). Se guarda solo en la carga creada, nunca en maestros_codigos.
  // No invalida el resultado de "Cargar" (no cambia lo validado).
  const handleCambioPrecio = (indiceFila, valor) => {
    setFilas((prev) => prev.map((f, i) => (i === indiceFila ? { ...f, precioEditado: valor } : f)));
  };

  // Reglas de recargo para la venta en vivo: el mismo catálogo en memoria
  // que usa Cargas (lectura única por sesión). Solo se pide si se edita
  // algún precio; si ya se leyó en la sesión, no cuesta nada.
  const hayPrecioEditado = filas.some((f) => f.precioEditado);
  const { datos: recargos, cargado: recargosCargados } = useCatalogo('recargos', { habilitado: hayPrecioEditado });
  const ventaFila = (costo, cantidad) => calcularVentaItem(costo, cantidad, (c) => buscarReglaRecargo(recargos, c));

  const handleKeyDown = (e, fila, col) => {
    const input = e.currentTarget;
    switch (e.key) {
      case 'Enter':
        e.preventDefault();
        moverFoco(e.shiftKey ? fila - 1 : fila + 1, col);
        break;
      case 'Tab':
        e.preventDefault();
        moverFoco(fila, e.shiftKey ? col - 1 : col + 1);
        break;
      case 'ArrowDown':
        e.preventDefault();
        if (fila < filas.length - 1) moverFoco(fila + 1, col);
        break;
      case 'ArrowUp':
        e.preventDefault();
        moverFoco(fila - 1, col);
        break;
      case 'ArrowLeft':
        if (input.selectionStart === 0 && input.selectionEnd === 0 && col > 0) {
          e.preventDefault();
          moverFoco(fila, col - 1);
        }
        break;
      case 'ArrowRight':
        if (input.selectionStart === input.value.length && input.selectionEnd === input.value.length && col < COLUMNAS_INGRESO.length - 1) {
          e.preventDefault();
          moverFoco(fila, col + 1);
        }
        break;
      default:
        break;
    }
  };

  // Texto con tabulación o salto de línea = copiado de Excel: se reparte
  // desde la celda hacia la derecha y hacia abajo. Un valor suelto se pega
  // normal dentro del input.
  const handlePaste = (e, fila, col) => {
    const texto = e.clipboardData?.getData('text/plain') ?? '';
    if (!/[\t\r\n]/.test(texto)) return;
    e.preventDefault();
    const matriz = parsearTextoPortapapeles(texto);
    if (matriz.length === 0) return;
    setFilas((prev) => pegarMatrizEnFilas(prev, fila, col, matriz));
  };

  const handleAgregarFilas = (cantidad) => {
    setFilas((prev) => [...prev, ...crearFilasVacias(cantidad)]);
  };

  const handleEliminarFila = (indiceFila) => {
    setFilas((prev) => {
      const restantes = prev.filter((_, i) => i !== indiceFila);
      return restantes.length > 0 ? restantes : crearFilasVacias(1);
    });
  };

  const reiniciarGrilla = () => {
    setFilas(crearFilasVacias(FILAS_INICIALES));
    setCargado(false);
    setFoco(null);
    setBorradorActivo(false);
    setBorradorRestaurado(null);
    borrarBorrador(uid);
  };

  const handleLimpiarTodo = () => {
    confirmAction(
      'Limpiar todo',
      'Se borrarán todas las filas de la grilla. ¿Continuar?',
      reiniciarGrilla,
      { confirmText: 'Limpiar', type: 'danger' }
    );
  };

  const handleDescartarBorrador = () => {
    confirmAction(
      'Descartar borrador',
      'Se borrarán los datos de la grilla y el borrador guardado en este navegador. ¿Continuar?',
      reiniciarGrilla,
      { confirmText: 'Descartar', type: 'danger' }
    );
  };

  const handleCambiarTipo = (nuevoTipo) => {
    if (nuevoTipo === tipo) return;
    setTipo(nuevoTipo);
    // El tipo define dónde se busca el código y el atributo: hay que volver a cargar.
    setFilas((prev) => prev.map((f) => (f.resultado ? { ...f, resultado: null } : f)));
    setCargado(false);
  };

  const handleCargar = async () => {
    if (resumen.ok + resumen.advertencias + resumen.errores + resumen.sinCargar === 0) {
      showToast('No hay filas con datos para cargar', 'info');
      return;
    }
    const snapshot = filas;
    guardarBorrador(uid, { tipo, filas: snapshot });
    setBorradorActivo(true);
    setBorradorRestaurado(null);
    setCargando(true);
    try {
      // Revalidar: las Admisiones ya encontradas salen de la caché; solo las
      // que antes no se encontraron se vuelven a consultar.
      const resultados = await resolverFilas(snapshot, {
        tipo,
        obtenerCodigos: (t) => obtenerCodigosCacheados(db, t),
        buscarReporte: (admision) => buscarReporteInfoReintentandoNoEncontradas(db, admision)
      });
      const valoresEvaluados = new Map(snapshot.map((f) => [f.id, f.valores]));
      // Solo se aplica el resultado si la fila no se editó mientras se cargaba.
      setFilas((prev) => prev.map((f) => (
        resultados.has(f.id) && valoresEvaluados.get(f.id) === f.valores
          ? { ...f, resultado: resultados.get(f.id) }
          : f
      )));
      setCargado(true);
    } catch (error) {
      console.error('Error al cargar datos de la grilla:', error);
      showToast('Error al consultar los datos: ' + error.message, 'error');
    } finally {
      setCargando(false);
    }
  };

  const guardar = async () => {
    const aGuardar = filas.filter((f) => f.resultado && esEstadoGuardable(f.resultado.estado) && f.resultado.payload);
    if (aGuardar.length === 0) return;

    setGuardando(true);
    try {
      // Con precio especial editado, el payload lleva el precio, el del
      // maestro y la marca (aplicarPrecioEditado).
      const resultados = await guardarRegistrosConsignacionEnLote(
        db,
        aGuardar.map((f) => aplicarPrecioEditado(f.resultado.payload, f.precioEditado)),
        userData
      );
      const guardadas = new Set();
      const fallidas = new Map();
      resultados.forEach((r, i) => {
        if (r?.ok) guardadas.add(aGuardar[i].id);
        else fallidas.set(aGuardar[i].id, r?.error || 'Error al guardar');
      });

      setFilas((prev) => {
        const restantes = prev
          .filter((f) => !guardadas.has(f.id))
          .map((f) => (fallidas.has(f.id)
            ? { ...f, resultado: { ...f.resultado, observacion: `Error al guardar: ${fallidas.get(f.id)}` } }
            : f));
        return restantes.length > 0 ? restantes : crearFilasVacias(FILAS_INICIALES);
      });
      setFoco(null);
      // Sin filas con datos pendientes (todo guardado) se borra el borrador;
      // si quedan (con error o sin cargar), el borrador queda solo con esas.
      if (!filas.some((f) => !guardadas.has(f.id) && !filaEstaVacia(f))) {
        setBorradorActivo(false);
        setBorradorRestaurado(null);
        borrarBorrador(uid);
      }

      if (fallidas.size === 0) {
        showToast(`${guardadas.size} registro${guardadas.size === 1 ? '' : 's'} guardado${guardadas.size === 1 ? '' : 's'} correctamente`, 'success');
      } else {
        showToast(`${guardadas.size} guardados, ${fallidas.size} con error al guardar`, 'error');
      }
    } catch (error) {
      console.error('Error al guardar carga masiva:', error);
      showToast('Error al guardar: ' + error.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const handleGuardar = () => {
    if (resumen.guardables === 0) {
      showToast('No hay filas OK para guardar', 'info');
      return;
    }
    // Precio especial inválido (vacío se ignora: queda el del maestro).
    const conPrecioInvalido = filas.findIndex((f) => f.resultado?.payload && f.precioEditado && errorPrecio(f.precioEditado));
    if (conPrecioInvalido >= 0) {
      showToast(`Fila ${conPrecioInvalido + 1}: ${errorPrecio(filas[conPrecioInvalido].precioEditado)}`, 'error');
      return;
    }
    const especiales = filas.filter((f) => f.resultado?.payload && esEstadoGuardable(f.resultado.estado)
      && aplicarPrecioEditado(f.resultado.payload, f.precioEditado)?.precioEspecial).length;
    const mensaje = mensajeConfirmacionGuardado(resumen)
      + (especiales > 0 ? ` ${especiales} con precio especial (solo en la carga; el maestro no cambia).` : '');
    confirmAction('Guardar registros', mensaje, guardar, { confirmText: 'Guardar' });
  };

  const claseCelda = (fila, key) => {
    const r = fila.resultado;
    if (r?.celdasError?.[key]) return 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-200 ring-1 ring-inset ring-red-400';
    if (r?.celdasAdvertencia?.[key]) return 'bg-amber-50 dark:bg-amber-900/30 ring-1 ring-inset ring-amber-300';
    return 'bg-white dark:bg-gray-900';
  };

  const tituloCelda = (fila, key) => fila.resultado?.celdasError?.[key] || fila.resultado?.celdasAdvertencia?.[key] || undefined;

  const ocupado = cargando || guardando;
  const puedeGuardar = cargado && resumen.guardables > 0 && !ocupado;

  return (
    <div className="w-full h-full flex flex-col bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-sm overflow-hidden p-0 relative text-[11px]">
      {ocupado && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-gray-500/20 dark:bg-black/40 backdrop-blur-[2px]">
          <div className="bg-white/90 dark:bg-gray-800/90 p-4 rounded-xl shadow-xl flex flex-col items-center gap-3">
            <Spinner size="md" color="#2383C2" />
            <h3 className="text-[#2383C2] font-bold text-[13px]">{guardando ? 'Guardando...' : 'Consultando datos...'}</h3>
          </div>
        </div>
      )}

      <div className="px-3 py-2 flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/80">
        <h2 className="text-[12px] font-bold text-gray-700 dark:text-gray-100 flex items-center gap-1.5">
          <Sheet size={15} className="text-[#2383C2]" />
          CARGA MASIVA DE CONSIGNACIÓN
        </h2>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center rounded overflow-hidden border border-gray-300 dark:border-gray-600 text-[9px] font-bold uppercase" title="Tipo de código en el maestro (define el atributo)">
            {TIPOS_CONSIGNACION.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => handleCambiarTipo(t)}
                disabled={ocupado}
                className={`px-2 py-1 transition ${tipo === t
                  ? 'bg-[#2383C2] text-white'
                  : 'bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
              >
                {t === 'CONSIGNACION' ? 'CONSIG.' : 'COTIZ.'}
              </button>
            ))}
          </span>

          <button
            type="button"
            onClick={() => handleAgregarFilas(1)}
            disabled={ocupado}
            className="h-7 px-2.5 rounded font-bold text-[11px] flex items-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50"
          >
            <Plus size={13} /> Fila
          </button>
          <button
            type="button"
            onClick={() => handleAgregarFilas(10)}
            disabled={ocupado}
            className="h-7 px-2.5 rounded font-bold text-[11px] flex items-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50"
          >
            <Plus size={13} /> 10 filas
          </button>
          <button
            type="button"
            onClick={handleLimpiarTodo}
            disabled={ocupado}
            className="h-7 px-2.5 rounded font-bold text-[11px] flex items-center gap-1 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 transition disabled:opacity-50"
          >
            <Eraser size={13} /> Limpiar todo
          </button>
          <button
            type="button"
            onClick={handleCargar}
            disabled={ocupado}
            className="h-7 px-3 rounded font-bold text-[11px] flex items-center gap-1.5 text-white bg-[#2383C2] hover:bg-[#369BCE] transition disabled:opacity-50"
          >
            {cargando ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />} Cargar
          </button>
          <button
            type="button"
            onClick={handleGuardar}
            disabled={!puedeGuardar}
            title={!cargado ? 'Primero presiona "Cargar"' : undefined}
            className="h-7 px-3 rounded font-bold text-[11px] flex items-center gap-1.5 text-white bg-emerald-600 hover:bg-emerald-700 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save size={13} /> Guardar
          </button>
        </div>
      </div>

      {borradorActivo && (
        <div
          role={borradorRestaurado ? 'alert' : undefined}
          className={`px-3 py-1.5 flex flex-wrap items-center gap-2 border-b text-[10.5px] ${borradorRestaurado
            ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-400'
            : 'bg-gray-50 dark:bg-gray-800/60 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'}`}
        >
          <History size={12} className="shrink-0" />
          {borradorRestaurado ? (
            <span className="font-semibold">
              Tienes datos sin guardar de una carga anterior ({formatearFechaHora(borradorRestaurado)}). Presiona "Cargar" para revalidarlos.
            </span>
          ) : (
            <span>Borrador guardado en este navegador hasta que guardes o lo descartes (vence en 2 días).</span>
          )}
          <button
            type="button"
            onClick={handleDescartarBorrador}
            disabled={ocupado}
            className="ml-auto h-6 px-2 rounded border border-current font-bold hover:bg-white/60 dark:hover:bg-black/20 transition disabled:opacity-50"
          >
            Descartar borrador
          </button>
        </div>
      )}

      <div className="px-3 py-1.5 flex flex-wrap items-center gap-3 border-b border-gray-200 dark:border-gray-700 text-[10.5px]">
        {cargado ? (
          <>
            <span className="font-bold text-gray-700 dark:text-gray-200">
              {resumen.ok} fila{resumen.ok === 1 ? '' : 's'} OK, {resumen.errores} con errores
            </span>
            {resumen.advertencias > 0 && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
                <AlertTriangle size={11} /> {resumen.advertencias} con Admisión no encontrada (se guardan con Datos Vinculados pendientes)
              </span>
            )}
            {resumen.sinCargar > 0 && (
              <span className="flex items-center gap-1 text-gray-500 dark:text-gray-400 font-semibold">
                <AlertCircle size={11} /> {resumen.sinCargar} sin cargar (editadas): presiona "Cargar" de nuevo
              </span>
            )}
          </>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">
            Copia desde Excel y pega en la primera celda (una columna o un bloque). Luego presiona "Cargar" para validar y traer los datos.
          </span>
        )}
      </div>

      <div className="flex-grow overflow-auto">
        <table className="border-collapse text-[11px] min-w-max">
          <thead className="sticky top-0 z-10 bg-gray-100 dark:bg-gray-900 text-[9.5px] uppercase text-gray-500 dark:text-gray-400">
            <tr>
              <th className="px-1.5 py-1 border border-gray-200 dark:border-gray-700 w-[32px]">#</th>
              {COLUMNAS_INGRESO.map((c) => (
                <th key={c.key} className={`px-1.5 py-1 border border-gray-200 dark:border-gray-700 font-bold text-left ${c.ancho}`}>
                  {c.label}
                </th>
              ))}
              <th className="px-1.5 py-1 border border-gray-200 dark:border-gray-700 w-[28px]" />
              <th className="px-1.5 py-1 border border-gray-200 dark:border-gray-700 font-bold text-left min-w-[130px] bg-gray-200/60 dark:bg-gray-800">Estado</th>
              <th className="px-1.5 py-1 border border-gray-200 dark:border-gray-700 font-bold text-left min-w-[220px] bg-gray-200/60 dark:bg-gray-800">Detalle</th>
              <th className="px-1.5 py-1 border border-gray-200 dark:border-gray-700 font-bold text-left min-w-[220px] bg-gray-200/60 dark:bg-gray-800">Observación</th>
              {COLUMNAS_LECTURA.map((c) => (
                <th key={c.key} className={`px-1.5 py-1 border border-gray-200 dark:border-gray-700 font-bold text-left bg-gray-200/60 dark:bg-gray-800 ${c.ancho}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filas.map((fila, i) => {
              const r = fila.resultado;
              return (
                <tr key={fila.id} className="hover:bg-gray-50/60 dark:hover:bg-gray-700/20">
                  <td className="px-1.5 border border-gray-200 dark:border-gray-700 text-center text-gray-400 text-[10px]">{i + 1}</td>
                  {COLUMNAS_INGRESO.map((c, j) => (
                    <td key={c.key} className={`p-0 border border-gray-200 dark:border-gray-700 ${c.ancho}`}>
                      <input
                        ref={registrarCelda(i, j)}
                        value={fila.valores[c.key]}
                        onChange={(e) => handleCambio(i, c.key, e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, i, j)}
                        onPaste={(e) => handlePaste(e, i, j)}
                        onFocus={() => setFoco(null)}
                        title={tituloCelda(fila, c.key)}
                        placeholder={
                          c.key === 'paciente' ? r?.vinculados?.pacienteReporte || ''
                            : c.key === 'medico' ? r?.vinculados?.cirujanoReporte || ''
                              : ''
                        }
                        disabled={ocupado}
                        inputMode={c.key === 'admision' || c.key === 'cantidad' ? 'numeric' : undefined}
                        className={`w-full h-6 px-1.5 outline-none focus:ring-2 focus:ring-inset focus:ring-[#2383C2] text-gray-800 dark:text-gray-100 placeholder:text-gray-400 placeholder:italic ${c.key === 'paciente' ? 'uppercase' : ''} ${claseCelda(fila, c.key)}`}
                      />
                    </td>
                  ))}
                  <td className="px-1 border border-gray-200 dark:border-gray-700 text-center">
                    <button
                      type="button"
                      onClick={() => handleEliminarFila(i)}
                      disabled={ocupado}
                      title="Eliminar fila"
                      className="p-0.5 text-gray-400 hover:text-red-500 transition disabled:opacity-40"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                  <td className="px-1.5 border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60">
                    {r && (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-bold ${ESTILO_ESTADO[r.estado]}`}>
                        {r.estado === ESTADOS_FILA.OK ? <CheckCircle2 size={10} /> : r.estado === ESTADOS_FILA.ADMISION_NO_ENCONTRADA ? <AlertTriangle size={10} /> : <AlertCircle size={10} />}
                        {ETIQUETAS_ESTADO[r.estado]}
                      </span>
                    )}
                  </td>
                  <td className="px-1.5 border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 max-w-[260px] truncate" title={r?.vinculados?.descripcion || ''}>
                    {r?.vinculados?.descripcion || ''}
                  </td>
                  <td className="px-1.5 border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 text-[10px] text-gray-600 dark:text-gray-300 max-w-[320px] truncate" title={r?.observacion || ''}>
                    {r?.observacion || ''}
                  </td>
                  {COLUMNAS_LECTURA.map((c) => {
                    const valor = r?.vinculados?.[c.key];
                    // Precio editable en la vista previa (filas que se pueden guardar).
                    if (c.key === 'costo' && r?.payload && esEstadoGuardable(r.estado)) {
                      const maestro = Number(r.payload.costo) || 0;
                      const editado = fila.precioEditado ?? '';
                      const error = editado !== '' ? errorPrecio(editado) : null;
                      const precio = editado !== '' && !error ? precioANumero(editado) : maestro;
                      const especial = precio !== maestro;
                      const v = especial ? ventaFila(precio, r.payload.cantidad) : null;
                      return (
                        <td key={c.key} className={`p-0 border border-gray-200 dark:border-gray-700 align-top ${especial ? 'bg-violet-50/60 dark:bg-violet-950/20' : 'bg-gray-50/60 dark:bg-gray-800/60'}`}>
                          <input
                            type="number"
                            min="0"
                            step="any"
                            value={editado}
                            onChange={(e) => handleCambioPrecio(i, e.target.value)}
                            placeholder={`$${maestro.toLocaleString('es-CL')}`}
                            disabled={ocupado}
                            aria-label={`Precio fila ${i + 1}`}
                            title={error || 'Precio especial solo para esta carga (vacío = precio del maestro)'}
                            className={`w-full h-6 px-1.5 outline-none text-right bg-transparent text-gray-800 dark:text-gray-100 placeholder:text-gray-500 focus:ring-2 focus:ring-inset focus:ring-[#2383C2] ${error ? 'ring-1 ring-inset ring-red-400 bg-red-50 dark:bg-red-900/30' : ''}`}
                          />
                          {especial && (
                            <div className="px-1.5 pb-0.5 text-[9px] text-gray-600 dark:text-gray-300 whitespace-nowrap" title="Venta = precio × veces costo × cantidad">
                              <BadgePrecioEspecial costoMaestro={maestro} />
                              {!recargosCargados ? ' Calculando venta…' : v?.venta != null ? ` Venta $${v.venta.toLocaleString('es-CL')} · ${v.vecesCosto} x` : ' Sin regla de recargo'}
                            </div>
                          )}
                        </td>
                      );
                    }
                    return (
                      <td key={c.key} className="px-1.5 border border-gray-200 dark:border-gray-700 bg-gray-50/60 dark:bg-gray-800/60 text-gray-700 dark:text-gray-200 max-w-[260px] truncate" title={valor ? String(valor) : ''}>
                        {c.formato ? c.formato(valor) : (valor ?? '')}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default CargaMasivaConsignacion;
