import React, { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
import {
    collection,
    doc,
    query,
    documentId,
    where,
    getDocs,
    writeBatch,
    updateDoc,
    serverTimestamp,
    getCountFromServer
} from 'firebase/firestore';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { db, auth } from '../../../../../firebaseConfig';
import {
    ClipboardList,
    Search,
    Upload,
    X,
    FileSpreadsheet,
    Calendar,
    Hash,
    User,
    Activity,
    Stethoscope,
    Building2,
    Loader2,
    Tag,
    Download,
    EyeOff,
    AlertTriangle
} from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import Spinner from '../../../../ui/Spinner';
import PaginacionSimple from '../../../../ui/PaginacionSimple';
import MultiSelectFiltro from '../../../../ui/MultiSelectFiltro';
import { ThRedimensionable, ColgroupRedimensionable } from '../../../../ui/ThRedimensionable';
import { useColumnResize } from '../../../../../hooks/useColumnResize';
import { useColumnasPermitidas } from '../../../../../hooks/useColumnasPermitidas';
import { useDebouncedValue } from '../../../../../hooks/useDebouncedValue';
import { incluyeTexto } from '../../../../../utils/normalizarTexto';
import { ordenarMeses } from '../../../../../utils/ordenarMeses';
import { useUser } from '../../../../../context/UserContext';
import { subItemsVisibles } from '../../../../../config/accesoMenu';
import BadgeGestionImplante from './BadgeGestionImplante';
import DetalleGestionReporte from './DetalleGestionReporte';
import { leerURL, urlCon } from './urlDetalle';
import {
    cargarMarcas, claveAdmision, estadoDe, OPCIONES_GESTION, ETIQUETAS_ESTADO, CLASE_GESTION,
    COLECCION_ADMISIONES_CONSIGNACION, tooltipMarcaConsignacion,
} from './gestionImplante';
import {
    CAMPO_OCULTA, NOMBRE_MODULO, moduloDeVista, normDeFila, cargarEntradas, conCampos, filasDeDescripcion, ocultarDescripcion,
} from './descripcionesOcultas';

// Estado de revisión de cada registro. Se guarda en el mismo documento del
// registro (campo `revisado`); si no existe se considera "Pendiente", así que
// los registros ya importados no necesitan migración. Reimportar no lo pisa:
// la importación omite los IDs que ya existen.
const REVISADO = {
    REVISADO: 'Revisado',
    PENDIENTE: 'Pendiente',
    NO_APLICA: 'No aplica'
};
const OPCIONES_REVISADO = [REVISADO.REVISADO, REVISADO.PENDIENTE, REVISADO.NO_APLICA];
const CLASE_REVISADO = {
    [REVISADO.REVISADO]: 'bg-emerald-100 text-emerald-800 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    [REVISADO.PENDIENTE]: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    [REVISADO.NO_APLICA]: 'bg-slate-200 text-slate-700 border-slate-300 dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
};
// La consulta filtra por ocultaX (sin orderBy, para no requerir un índice
// compuesto): el orden por fecha se hace en memoria.
const porFechaDesc = (a, b) => String(b["Fecha"] ?? '').localeCompare(String(a["Fecha"] ?? ''));
const getRevisado = (r) => (OPCIONES_REVISADO.includes(r.revisado) ? r.revisado : REVISADO.PENDIENTE);

// `Fecha` se guarda como texto 'YYYY-MM-DD' (ver formatearFecha), así que el
// día se lee del texto y no con new Date(): parsearlo lo interpreta en UTC y
// en Chile lo correría al día anterior.
const getDia = (r) => {
    const m = /^\d{4}-\d{2}-(\d{2})/.exec(String(r["Fecha"] ?? ''));
    return m ? m[1] : '';
};

const SIN_ARANCEL = '(Sin arancel)';
const getArancel = (r) => String(r["Arancel"] ?? '').trim() || SIN_ARANCEL;

// Granularidad por columna: `col_<key>` en la sección 'tabla_registros' de la
// vista (Documentos o Implantes, ver `pathVista`; useColumnasPermitidas).
const COLUMNAS = [
    { key: 'fecha', label: 'Fecha', ancho: 90, min: 70 },
    { key: 'admision', label: 'Admisión', ancho: 90, min: 60 },
    { key: 'paciente', label: 'Paciente', ancho: 180, min: 80 },
    { key: 'edad', label: 'Edad', align: 'text-center', ancho: 55, min: 40 },
    { key: 'codArt', label: 'Cod.Art.', ancho: 90, min: 60 },
    { key: 'descripcion', label: 'Descripción', ancho: 220, min: 90 },
    { key: 'arancel', label: 'Arancel', ancho: 200, min: 90 },
    { key: 'prevision', label: 'Previsión / Isapre', ancho: 150, min: 80 },
    { key: 'cirujano', label: 'Cirujano', ancho: 170, min: 80 },
    { key: 'cantidad', label: 'Cant.', align: 'text-center', ancho: 60, min: 45 },
    { key: 'revisado', label: 'Revisado', align: 'text-center', ancho: 115, min: 95 },
    { key: 'gestionImplante', label: 'Gestión implante', align: 'text-center', ancho: 125, min: 100 },
    { key: 'gestionConsignacion', label: 'Gestión consignación', align: 'text-center', ancho: 135, min: 100 },
];

// `pathVista`: la misma pantalla se monta en Documentos y en Implantes; cada
// ruta del menú tiene su propia entrada de permisos.
// Columna "Gestión implante": el ícono abre el detalle de la gestión DENTRO
// de Reporte Info (DetalleGestionReporte); la tabla queda montada y oculta,
// así al volver (botón, Escape o "atrás") sigue igual y sin releer. El
// detalle va en la URL (?detalle=, ver urlDetalle.js) para "atrás" y recarga.
// `onAbrirGestionImplante({ admision, refPath? })` (del Dashboard): enlace
// secundario "Abrir en Gestiones" del detalle.
// Descripciones ocultas (Maestros → Descripciones ocultas): se leen solo las
// filas visibles del módulo (ocultaImplantes / ocultaDocumentos == false);
// las ocultas se cuentan con un count() y se leen solo con "Mostrar ocultas".
// No cuentan en los contadores ni requieren "Revisado".
const ReportesInfo = ({ pathVista = '/documentos/reportesInfo', onAbrirGestionImplante }) => {
    // Detalle en la URL al montar (recarga con ?vista=<esta ruta>&detalle=…).
    const [urlInicial] = useState(() => {
        const u = leerURL();
        return u.vista === pathVista && u.detalle ? u : null;
    });
    const [reportes, setReportes] = useState([]);
    // IDs del mes que está descargado COMPLETO en `reportes` ({ clave: 'anio/mes', ids: Set }).
    // Lo usa idsExistentesDelMes() para no volver a consultar Firestore al
    // importar un Excel del mismo mes. Si la lista pasa a paginarse en el
    // servidor, solo debe asignarse cuando se tengan todos los IDs del mes
    // (si queda en null, la importación consulta por lotes como antes).
    const idsMesCargadoRef = useRef(null);
    const [aniosDisponibles, setAniosDisponibles] = useState([]);
    const [mesesDisponibles, setMesesDisponibles] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [filtroAnio, setFiltroAnio] = useState(urlInicial?.anio || '');
    const [filtroMes, setFiltroMes] = useState(urlInicial?.mes || '');
    const [filtroDia, setFiltroDia] = useState('');
    const [cargando, setCargando] = useState(false);
    const [cargandoLista, setCargandoLista] = useState(false);
    const [filtroRevisado, setFiltroRevisado] = useState('');
    const [filtroAranceles, setFiltroAranceles] = useState([]);
    // "Gestión implante": marca por admisión (functions/admisiones) de las
    // admisiones del mes en pantalla; '' = todas.
    const [marcas, setMarcas] = useState({});
    const [filtroGestion, setFiltroGestion] = useState('');
    // "Gestión consignación": lo mismo con la marca de Consignación.
    const [marcasConsignacion, setMarcasConsignacion] = useState({});
    const [filtroGestionConsignacion, setFiltroGestionConsignacion] = useState('');
    const [pagina, setPagina] = useState(1);
    const [tamanoPagina, setTamanoPagina] = useState(25);
    // Filas con descripción oculta en este módulo: cantidad del mes, filas
    // ({ clave: 'anio/mes', filas }) leídas solo con "Mostrar ocultas".
    const [nOcultas, setNOcultas] = useState(0);
    const [ocultas, setOcultas] = useState(null);
    const [mostrarOcultas, setMostrarOcultas] = useState(false);
    const [confirmarOcultar, setConfirmarOcultar] = useState(null);

    const busquedaDebounced = useDebouncedValue(busqueda);

    const { showToast } = useToast();
    const { hasPermission } = useGranularPermission();
    const { userData } = useUser();
    const puedeVerGestiones = subItemsVisibles(userData, 'implantes').some(s => s.path === '/implantes/gestionImplantes');

    // --- Detalle de la gestión (dentro de Reporte Info) ---
    // { admision, fila }: fila = la de Reporte Info de donde se abrió (null
    // si vino de la URL). filaOrigenId: la fila resaltada al volver.
    const [detalle, setDetalle] = useState(() => (urlInicial && puedeVerGestiones ? { admision: urlInicial.detalle, fila: null } : null));
    const [filaOrigenId, setFilaOrigenId] = useState(null);
    const tablaScrollRef = useRef(null);
    const scrollGuardadoRef = useRef(0);
    // true si el detalle se abrió con pushState en esta carga: volver = "atrás".
    const empujadoRef = useRef(false);

    const PATH_VISTA = pathVista;
    const modulo = moduloDeVista(pathVista);
    const campoOculta = CAMPO_OCULTA[modulo];
    const puedeMostrarOcultas = hasPermission(PATH_VISTA, "filas_ocultas", "switch_mostrarOcultas");
    const puedeOcultar = hasPermission(PATH_VISTA, "filas_ocultas", "action_ocultarDescripcion");
    const { columnasVisibles, ver } = useColumnasPermitidas(pathVista, 'tabla_registros', COLUMNAS);
    const { anchos, handleResize, anchoTotalTabla } = useColumnResize(columnasVisibles);
    const COL_BASE = "documentos_reportesInfo";

    const getMesNombre = (index) => [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"
    ][index];

    // Cargar Años disponibles
    useEffect(() => {
        const cargarAnios = async () => {
            try {
                const snap = await getDocs(collection(db, COL_BASE));
                const anios = snap.docs.map(d => d.id).sort((a, b) => b - a);
                setAniosDisponibles(anios);
            } catch (error) {
                console.error("Error al cargar años:", error);
            }
        };
        cargarAnios();
    }, []);

    // Cargar Meses disponibles según año
    useEffect(() => {
        if (!filtroAnio) {
            setMesesDisponibles([]);
            return;
        }
        const cargarMeses = async () => {
            try {
                const snap = await getDocs(collection(db, COL_BASE, filtroAnio, "meses"));
                const meses = ordenarMeses(snap.docs.map(d => d.id));
                setMesesDisponibles(meses);
            } catch (error) {
                console.error("Error al cargar meses:", error);
            }
        };
        cargarMeses();
    }, [filtroAnio]);

    // Se trae el mes completo con un getDocs (sin listener en vivo): los
    // filtros (Revisado, Arancel, búsqueda) y la lista de aranceles deben
    // considerar TODOS los registros del mes antes de paginar, y la
    // paginación se hace en memoria.
    const cargarPrimeraPagina = useCallback(async (anioOverride, mesOverride) => {
        const anio = anioOverride ?? filtroAnio;
        const mes = mesOverride ?? filtroMes;

        if (!anio || !mes) {
            setReportes([]);
            return;
        }

        setCargandoLista(true);
        idsMesCargadoRef.current = null;
        try {
            const col = collection(db, `${COL_BASE}/${anio}/meses/${mes}/registros`);
            const [snap, cuentaOcultas] = await Promise.all([
                getDocs(query(col, where(campoOculta, "==", false))),
                getCountFromServer(query(col, where(campoOculta, "==", true))),
            ]);
            const n = cuentaOcultas.data().count;
            setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort(porFechaDesc));
            setNOcultas(n);
            setOcultas(null);
            // Solo si se tienen TODOS los IDs del mes (sin ocultas): si no, la
            // importación consulta por lotes y no duplica las ocultas.
            idsMesCargadoRef.current = n === 0 ? { clave: `${anio}/${mes}`, ids: new Set(snap.docs.map(d => d.id)) } : null;
            setPagina(1);
        } catch (err) {
            console.error("Error al cargar reportes:", err);
            showToast("Error al cargar los reportes", "error");
        } finally {
            setCargandoLista(false);
        }
    }, [filtroAnio, filtroMes, campoOculta, showToast]);

    useEffect(() => {
        cargarPrimeraPagina();
    }, [cargarPrimeraPagina]);

    // "Mostrar ocultas": las filas ocultas del mes se leen solo al activarlo.
    const claveMes = `${filtroAnio}/${filtroMes}`;
    const necesitaOcultas = mostrarOcultas && nOcultas > 0 && Boolean(filtroAnio && filtroMes) && ocultas?.clave !== claveMes;
    useEffect(() => {
        if (!necesitaOcultas) return undefined;
        let activo = true;
        const col = collection(db, `${COL_BASE}/${filtroAnio}/meses/${filtroMes}/registros`);
        getDocs(query(col, where(campoOculta, "==", true)))
            .then(snap => { if (activo) setOcultas({ clave: `${filtroAnio}/${filtroMes}`, filas: snap.docs.map(d => ({ id: d.id, ...d.data(), _oculta: true })) }); })
            .catch(err => { console.error("Error al cargar las filas ocultas:", err); showToast("No se pudieron cargar las filas ocultas", "error"); });
        return () => { activo = false; };
    }, [necesitaOcultas, filtroAnio, filtroMes, campoOculta, showToast]);
    const filasPantalla = useMemo(() => {
        if (!mostrarOcultas || ocultas?.clave !== claveMes) return reportes;
        return [...reportes, ...ocultas.filas].sort(porFechaDesc);
    }, [reportes, ocultas, mostrarOcultas, claveMes]);

    // Marcas "Gestión implante" de las admisiones en pantalla (lotes de 30,
    // sin listener: se refrescan al recargar el mes). Depende solo del
    // conjunto de admisiones: marcar "Revisado" cambia `reportes` pero no relee.
    const admisionesMes = useMemo(
        () => [...new Set(filasPantalla.map(r => claveAdmision(r["Admisión"])).filter(Boolean))].sort().join(','),
        [filasPantalla]
    );
    useEffect(() => {
        let activo = true;
        // Sin admisiones, cargarMarcas resuelve {} sin leer.
        cargarMarcas(admisionesMes ? admisionesMes.split(',') : [])
            .then(m => { if (activo) setMarcas(m); })
            .catch(err => { console.error("Error al cargar la gestión de implantes:", err); if (activo) setMarcas({}); });
        return () => { activo = false; };
    }, [admisionesMes]);
    const marcaDe = useCallback((r) => marcas[claveAdmision(r["Admisión"])] || null, [marcas]);
    // Consignación: solo si el usuario ve su columna (si no, 0 lecturas).
    const verGestionConsignacion = ver('gestionConsignacion');
    useEffect(() => {
        let activo = true;
        cargarMarcas(verGestionConsignacion && admisionesMes ? admisionesMes.split(',') : [], COLECCION_ADMISIONES_CONSIGNACION)
            .then(m => { if (activo) setMarcasConsignacion(m); })
            .catch(err => { console.error("Error al cargar la gestión de consignación:", err); if (activo) setMarcasConsignacion({}); });
        return () => { activo = false; };
    }, [admisionesMes, verGestionConsignacion]);
    const marcaConsignacionDe = useCallback((r) => marcasConsignacion[claveAdmision(r["Admisión"])] || null, [marcasConsignacion]);

    const abrirDetalle = useCallback((item) => {
        const admision = claveAdmision(item["Admisión"]);
        scrollGuardadoRef.current = tablaScrollRef.current?.scrollTop || 0;
        setFilaOrigenId(item.id);
        setDetalle({ admision, fila: item });
        window.history.pushState({ reporteInfoDetalle: admision }, '', urlCon({ vista: pathVista, detalle: admision, anio: filtroAnio, mes: filtroMes }));
        empujadoRef.current = true;
    }, [pathVista, filtroAnio, filtroMes]);
    const cerrarDetalle = useCallback(() => {
        if (empujadoRef.current) { window.history.back(); return; } // popstate cierra
        window.history.replaceState(null, '', urlCon());
        setDetalle(null);
    }, []);
    // "Atrás" / "adelante" del navegador: el detalle sigue a la URL.
    useEffect(() => {
        const alNavegar = () => {
            const u = leerURL();
            if (u.vista === pathVista && u.detalle && puedeVerGestiones) {
                setDetalle(d => (d?.admision === u.detalle ? d : { admision: u.detalle, fila: null }));
            } else {
                empujadoRef.current = false;
                setDetalle(null);
            }
        };
        window.addEventListener('popstate', alNavegar);
        return () => window.removeEventListener('popstate', alNavegar);
    }, [pathVista, puedeVerGestiones]);
    // Escape vuelve a la tabla.
    useEffect(() => {
        if (!detalle) return undefined;
        const alTeclear = (e) => { if (e.key === 'Escape' && !e.defaultPrevented) cerrarDetalle(); };
        window.addEventListener('keydown', alTeclear);
        return () => window.removeEventListener('keydown', alTeclear);
    }, [detalle, cerrarDetalle]);
    // Al salir de Reporte Info (otra vista del menú) se limpia la URL.
    useEffect(() => () => {
        if (leerURL().vista === pathVista) window.history.replaceState(null, '', urlCon());
    }, [pathVista]);
    // Al volver: la tabla en la misma posición de scroll.
    useLayoutEffect(() => {
        if (!detalle && tablaScrollRef.current) tablaScrollRef.current.scrollTop = scrollGuardadoRef.current;
    }, [detalle]);

    // Función para formatear fechas de Excel (Date objects, texto YYYY-MM-DD o seriales)
    const formatearFecha = (valorFecha) => {
        if (!valorFecha) return '';
        if (valorFecha instanceof Date) {
            return valorFecha.toISOString().split('T')[0];
        }
        if (typeof valorFecha === 'number') {
            const dateObj = XLSX.SSF.parse_date_code(valorFecha);
            const y = dateObj.y;
            const m = String(dateObj.m).padStart(2, '0');
            const d = String(dateObj.d).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
        const str = String(valorFecha).trim();
        if (str.includes('/')) {
            const parts = str.split('/');
            if (parts.length === 3) {
                const [d, m, y] = parts;
                return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
            }
        }
        return str.split('T')[0];
    };

    // Qué IDs de `ids` ya existen en registros de anio/mes. Si ese mes está
    // descargado completo en pantalla se responde en memoria (0 lecturas);
    // si no, se consulta por documentId() 'in' en lotes de 30 (límite de
    // Firestore) solo para los IDs a importar.
    const idsExistentesDelMes = useCallback(async (anio, mes, ids) => {
        const cargado = idsMesCargadoRef.current;
        if (cargado && cargado.clave === `${anio}/${mes}`) {
            return new Set(ids.filter(id => cargado.ids.has(id)));
        }
        const existentes = new Set();
        const regsCol = collection(db, COL_BASE, anio, "meses", mes, "registros");
        for (let i = 0; i < ids.length; i += 30) {
            const loteIds = ids.slice(i, i + 30);
            const snapLote = await getDocs(query(regsCol, where(documentId(), "in", loteIds)));
            snapLote.docs.forEach(d => existentes.add(d.id));
        }
        return existentes;
    }, []);

    const onDrop = useCallback(async (acceptedFiles) => {
        setCargando(true);
        try {
            let fechaResult = { y: "", m: "" };
            let totalNuevos = 0;
            let totalOmitidos = 0;

            for (const file of acceptedFiles) {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

                // Agrupar filas por año y mes
                const gruposPorAnoMes = {};

                jsonData.forEach((row) => {
                    const rawFecha = row["Fecha"];
                    const fechaFormatted = formatearFecha(rawFecha);

                    if (!fechaFormatted) return;

                    const dateParts = fechaFormatted.split('-');
                    const y = dateParts[0];
                    const mIndex = parseInt(dateParts[1], 10) - 1;
                    const nombreMes = getMesNombre(mIndex);

                    if (!y || !nombreMes) return;

                    const keyGroup = `${y}___${nombreMes}`;
                    if (!gruposPorAnoMes[keyGroup]) {
                        gruposPorAnoMes[keyGroup] = { y, m: nombreMes, items: [] };
                    }

                    // Eliminar la columna 'Rut'
                    const { Rut, ...restoFila } = row;

                    const admision = String(row["Admisión"] || '').trim();
                    const codArt = String(row["Cod.Artículo"] || '').trim();
                    
                    // ID Único compuesto por Admisión + Cod.Artículo + Fecha
                    const docId = `${admision}_${codArt}_${fechaFormatted}`;

                    gruposPorAnoMes[keyGroup].items.push({
                        docId,
                        data: {
                            ...restoFila,
                            Fecha: fechaFormatted,
                            fechaActualizacion: new Date()
                        }
                    });
                });

                // Procesar cada grupo de Año / Mes
                for (const keyGroup in gruposPorAnoMes) {
                    const { y, m, items } = gruposPorAnoMes[keyGroup];
                    fechaResult = { y, m };

                    // 1. Verificar duplicados SOLO para los IDs que se van a
                    // importar (el ID de cada registro es determinístico).
                    const idsUnicos = [...new Set(items.map(item => item.docId))];
                    const idsExistentes = await idsExistentesDelMes(y, m, idsUnicos);

                    // 2. Filtrar solo los registros que NO existen
                    const sinCampos = items.filter(item => !idsExistentes.has(item.docId));
                    totalOmitidos += (items.length - sinCampos.length);

                    if (sinCampos.length === 0) continue;

                    // Campos de "Descripciones ocultas" (descripcionNorm,
                    // admisionClave, ocultaImplantes, ocultaDocumentos): la
                    // pantalla consulta por ellos. Si faltaran, los completa
                    // el trigger de fila.
                    const [entradas, marcasImport] = await Promise.all([
                        cargarEntradas(sinCampos.map(item => item.data["Descripción"])),
                        cargarMarcas(sinCampos.map(item => item.data["Admisión"])),
                    ]);
                    const itemsNuevos = sinCampos.map(item => ({ ...item, data: conCampos(item.data, entradas, marcasImport) }));

                    // 3. Insertar nuevos registros en batches (máximo 500 operaciones por batch)
                    const CHUNK_SIZE = 450;
                    for (let i = 0; i < itemsNuevos.length; i += CHUNK_SIZE) {
                        const batch = writeBatch(db);
                        
                        // Asegurar la metadata de carpetas padre
                        batch.set(doc(db, COL_BASE, y), { active: "true" }, { merge: true });
                        batch.set(doc(db, COL_BASE, y, "meses", m), { active: "true" }, { merge: true });

                        const chunk = itemsNuevos.slice(i, i + CHUNK_SIZE);
                        chunk.forEach(({ docId, data }) => {
                            const regRef = doc(db, COL_BASE, y, "meses", m, "registros", docId);
                            batch.set(regRef, data, { merge: true });
                        });

                        await batch.commit();
                        totalNuevos += chunk.length;

                        // Si se importan varios archivos del mismo mes, los
                        // siguientes deben ver estos registros como existentes.
                        if (idsMesCargadoRef.current?.clave === `${y}/${m}`) {
                            chunk.forEach(({ docId }) => idsMesCargadoRef.current.ids.add(docId));
                        }
                    }
                }
            }

            if (fechaResult.y) setFiltroAnio(fechaResult.y);
            if (fechaResult.m) setFiltroMes(fechaResult.m);
            if (fechaResult.y || fechaResult.m) setFiltroDia('');

            // Ya no hay listener en vivo: se refresca explícitamente la
            // primera página con los valores recién importados (por si
            // año/mes no cambiaron y el efecto no se vuelve a disparar solo).
            if (fechaResult.y && fechaResult.m) {
                cargarPrimeraPagina(fechaResult.y, fechaResult.m);
            }

            showToast(`Importación realizada: ${totalNuevos} agregados, ${totalOmitidos} omitidos por duplicado`, "success");
            setShowModal(false);
        } catch (e) {
            console.error(e);
            showToast("Error en importación: " + e.message, "error");
        } finally {
            setCargando(false);
        }
    }, [showToast, cargarPrimeraPagina, idsExistentesDelMes]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
    });

    const opcionesArancel = useMemo(
        () => [...new Set(filasPantalla.map(getArancel))].sort((a, b) => a.localeCompare(b, 'es')),
        [filasPantalla]
    );

    // Solo los días con al menos un registro. Se calculan sobre el mes que ya
    // está descargado completo en `reportes` (0 lecturas extra; Firestore no
    // tiene DISTINCT, así que una consulta aparte leería el mes igual).
    const diasDisponibles = useMemo(
        () => [...new Set(filasPantalla.map(getDia).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
        [filasPantalla]
    );

    const reportesFiltrados = useMemo(() => {
        const aranceles = new Set(filtroAranceles);
        return filasPantalla.filter(r => {
            if (filtroDia && getDia(r) !== filtroDia) return false;
            if (filtroRevisado && (r._oculta || getRevisado(r) !== filtroRevisado)) return false;
            if (aranceles.size > 0 && !aranceles.has(getArancel(r))) return false;
            if (filtroGestion && estadoDe(marcaDe(r)) !== filtroGestion) return false;
            if (filtroGestionConsignacion && estadoDe(marcaConsignacionDe(r)) !== filtroGestionConsignacion) return false;
            return (
                incluyeTexto(r["Admisión"], busquedaDebounced) ||
                incluyeTexto(r["Paciente"], busquedaDebounced) ||
                incluyeTexto(r["Descripción"], busquedaDebounced) ||
                incluyeTexto(r["1° Cirujano"], busquedaDebounced) ||
                incluyeTexto(r["Cod.Artículo"], busquedaDebounced) ||
                incluyeTexto(r["Arancel"], busquedaDebounced)
            );
        });
    }, [filasPantalla, filtroDia, filtroRevisado, filtroAranceles, filtroGestion, marcaDe, filtroGestionConsignacion, marcaConsignacionDe, busquedaDebounced]);

    // Admisiones distintas del mes por estado de gestión (contador del
    // filtro). Solo filas visibles: las ocultas no cuentan.
    const conteoGestion = useMemo(() => {
        const porAdmision = new Map();
        reportes.forEach(r => {
            const clave = claveAdmision(r["Admisión"]);
            if (clave) porAdmision.set(clave, estadoDe(marcas[clave]));
        });
        return [...porAdmision.values()].reduce((acc, e) => ({ ...acc, [e]: (acc[e] || 0) + 1 }), {});
    }, [reportes, marcas]);
    const conteoGestionConsignacion = useMemo(() => {
        const porAdmision = new Map();
        reportes.forEach(r => {
            const clave = claveAdmision(r["Admisión"]);
            if (clave) porAdmision.set(clave, estadoDe(marcasConsignacion[clave]));
        });
        return [...porAdmision.values()].reduce((acc, e) => ({ ...acc, [e]: (acc[e] || 0) + 1 }), {});
    }, [reportes, marcasConsignacion]);

    // Excel: lo filtrado (todas las páginas), con las columnas que el usuario ve.
    const exportarExcel = () => {
        const filas = reportesFiltrados.map(r => {
            const marca = marcaDe(r);
            const fila = {};
            if (ver('fecha')) fila['Fecha'] = r["Fecha"] ?? '';
            if (ver('admision')) fila['Admisión'] = r["Admisión"] ?? '';
            if (ver('paciente')) fila['Paciente'] = r["Paciente"] ?? '';
            if (ver('edad')) fila['Edad'] = r["Edad"] ?? '';
            if (ver('codArt')) fila['Cod.Artículo'] = r["Cod.Artículo"] ?? '';
            if (ver('descripcion')) fila['Descripción'] = r["Descripción"] ?? '';
            if (ver('arancel')) { fila['Cód.Arancel'] = r["Cód.Arancel"] ?? ''; fila['Arancel'] = r["Arancel"] ?? ''; }
            if (ver('prevision')) { fila['Previsión'] = r["Previsión"] ?? ''; fila['Isapre'] = r["Isapre"] ?? ''; }
            if (ver('cirujano')) fila['1° Cirujano'] = r["1° Cirujano"] ?? '';
            if (ver('cantidad')) fila['Cant.Art.'] = r["Cant.Art."] ?? '';
            if (ver('revisado')) fila['Revisado'] = r._oculta ? 'No requiere' : getRevisado(r);
            if (ver('gestionImplante')) {
                fila['Gestión implante'] = ETIQUETAS_ESTADO[estadoDe(marca)];
                fila['Gestiones'] = marca?.cantidad ?? 0;
                fila['Ítems pendientes'] = marca ? marca.itemsPendientes : '';
            }
            if (ver('gestionConsignacion')) {
                const marcaCons = marcaConsignacionDe(r);
                fila['Gestión consignación'] = ETIQUETAS_ESTADO[estadoDe(marcaCons)];
                fila['Cargas consignación'] = marcaCons?.cantidad ?? 0;
                fila['Cargas pendientes'] = marcaCons ? marcaCons.itemsPendientes : '';
            }
            // Las ocultas solo se exportan con "Mostrar ocultas" activo.
            if (mostrarOcultas) fila['Oculta'] = r._oculta ? 'Sí' : '';
            return fila;
        });
        const hoja = XLSX.utils.json_to_sheet(filas);
        const libro = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(libro, hoja, 'Reportes Info');
        XLSX.writeFile(libro, `reportes_info_${filtroAnio}_${filtroMes}.xlsx`);
    };

    const conteoRevisado = useMemo(() => reportes.reduce((acc, r) => {
        const estado = getRevisado(r);
        acc[estado] = (acc[estado] || 0) + 1;
        return acc;
    }, {}), [reportes]);

    // Los filtros se aplican antes de paginar; cualquier cambio de filtro
    // vuelve a la página 1.
    const totalFilas = reportesFiltrados.length;
    const totalPaginas = Math.max(1, Math.ceil(totalFilas / tamanoPagina));
    const paginaActual = Math.min(pagina, totalPaginas);
    const reportesPagina = reportesFiltrados.slice((paginaActual - 1) * tamanoPagina, paginaActual * tamanoPagina);

    const conResetPagina = (setter) => (valor) => { setter(valor); setPagina(1); };

    // "Ocultar esta descripción" (solo en este módulo). En Implantes, las
    // filas cuya admisión tiene gestión siguen visibles, con aviso.
    const seQuedaVisible = (r) => modulo === 'implantes' && Boolean(marcaDe(r));
    const pedirOcultar = async (item) => {
        const norm = normDeFila(item);
        const delMes = reportes.filter(r => normDeFila(r) === norm);
        setConfirmarOcultar({ norm, texto: item["Descripción"] || norm, mes: delMes.length, conGestion: delMes.filter(seQuedaVisible).length, total: undefined });
        try {
            const total = await filasDeDescripcion(norm);
            setConfirmarOcultar(c => (c?.norm === norm ? { ...c, total } : c));
        } catch (err) {
            console.error("Error al leer la descripción:", err);
            setConfirmarOcultar(c => (c?.norm === norm ? { ...c, total: null } : c));
        }
    };
    const confirmarOcultacion = async () => {
        const { norm } = confirmarOcultar;
        setConfirmarOcultar(c => ({ ...c, guardando: true }));
        try {
            await ocultarDescripcion(norm, modulo, userData);
            // Mientras el backend recalcula las filas, se reflejan acá.
            const pasan = reportes.filter(r => normDeFila(r) === norm && !seQuedaVisible(r));
            const ids = new Set(pasan.map(r => r.id));
            setReportes(prev => prev
                .filter(r => !ids.has(r.id))
                .map(r => (normDeFila(r) === norm && modulo === 'implantes' ? { ...r, descripcionOcultaImplantes: true } : r)));
            setNOcultas(n => n + pasan.length);
            setOcultas(prev => (prev ? { ...prev, filas: [...prev.filas, ...pasan.map(r => ({ ...r, [campoOculta]: true, _oculta: true }))] } : prev));
            idsMesCargadoRef.current = null;
            showToast(`Descripción oculta en ${NOMBRE_MODULO[modulo]}: ${pasan.length} fila(s) de este mes.`, "success");
            setConfirmarOcultar(null);
        } catch (err) {
            console.error("Error al ocultar la descripción:", err);
            showToast("No se pudo ocultar la descripción", "error");
            setConfirmarOcultar(c => ({ ...c, guardando: false }));
        }
    };
    // El día solo tiene sentido dentro del año/mes elegido: al cambiar
    // cualquiera de los dos vuelve a "Todos".
    const conResetDia = (setter) => (valor) => { setter(valor); setFiltroDia(''); setPagina(1); };

    const cambiarRevisado = async (registro, nuevoEstado) => {
        const anterior = registro.revisado;
        setReportes(prev => prev.map(r => r.id === registro.id ? { ...r, revisado: nuevoEstado } : r));
        try {
            await updateDoc(doc(db, COL_BASE, filtroAnio, "meses", filtroMes, "registros", registro.id), {
                revisado: nuevoEstado,
                revisadoPor: auth.currentUser?.email || '',
                revisadoFecha: serverTimestamp()
            });
        } catch (err) {
            console.error("Error al guardar estado de revisión:", err);
            setReportes(prev => prev.map(r => r.id === registro.id ? { ...r, revisado: anterior } : r));
            showToast("No se pudo guardar el estado de revisión", "error");
        }
    };


    return (
        <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden p-0 relative font-sans">
            {cargando && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/30 dark:bg-black/50 backdrop-blur-[2px]">
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-xl flex flex-col items-center gap-2 border border-slate-100 dark:border-gray-700">
                        <Spinner size="md" color="#2383C2" />
                        <h3 className="text-[#2383C2] font-normal text-[12px]">Procesando y omitiendo duplicados...</h3>
                    </div>
                </div>
            )}

            {detalle && (
                <DetalleGestionReporte
                    key={detalle.admision}
                    admision={detalle.admision}
                    fila={detalle.fila}
                    onVolver={cerrarDetalle}
                    onAbrirEnGestiones={onAbrirGestionImplante ? (refPath) => onAbrirGestionImplante({ admision: detalle.admision, refPath }) : undefined}
                />
            )}
            {/* La tabla queda montada (oculta) mientras se ve el detalle:
                filtros, página, "Mostrar ocultas" y datos se conservan. */}
            <div className={detalle ? 'hidden' : 'contents'}>
            <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <ClipboardList size={16} className="text-[#2383C2]" />
                    <span className="text-[12px] font-normal text-slate-800 dark:text-gray-100 tracking-wide uppercase">
                        Reportes de Cirugías / Información
                    </span>
                </div>

                <div className="flex items-center gap-1.5">
                {hasPermission(PATH_VISTA, "cabecera_acciones", "btn_exportar") && (
                    <button
                        onClick={exportarExcel}
                        disabled={reportesFiltrados.length === 0}
                        className="border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 hover:border-[#2383C2] hover:text-[#2383C2] text-slate-700 dark:text-gray-200 px-2.5 py-1 rounded text-[10px] font-normal flex items-center gap-1.5 transition disabled:opacity-40"
                    >
                        <Download size={11} /> Exportar Excel
                    </button>
                )}
                {hasPermission(PATH_VISTA, "cabecera_acciones", "btn_importar") && (
                    <button
                        onClick={() => setShowModal(true)}
                        className="bg-[#2383C2] hover:bg-[#1c6fa6] text-white px-2.5 py-1 rounded text-[10px] font-normal flex items-center gap-1.5 transition shadow-sm"
                    >
                        <Upload size={11} /> Importar Excel
                    </button>
                )}
                </div>
            </header>

            {/* Filtros */}
            <div className="bg-slate-100/70 dark:bg-gray-800/40 p-1.5 flex flex-wrap gap-1.5 items-center border-b border-slate-200 dark:border-gray-700">
                <select value={filtroAnio} onChange={(e) => conResetDia(setFiltroAnio)(e.target.value)} className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 rounded text-[11px] px-1.5 outline-none focus:border-[#2383C2]">
                    <option value="">Año</option>
                    {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                </select>

                <select value={filtroMes} onChange={(e) => conResetDia(setFiltroMes)(e.target.value)} className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 rounded text-[11px] px-1.5 outline-none capitalize focus:border-[#2383C2]">
                    <option value="">Mes</option>
                    {mesesDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
                </select>

                <select
                    value={filtroDia}
                    onChange={(e) => conResetPagina(setFiltroDia)(e.target.value)}
                    disabled={!filtroAnio || !filtroMes || cargandoLista}
                    className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 rounded text-[11px] px-1.5 outline-none focus:border-[#2383C2] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <option value="">Día (Todos)</option>
                    {diasDisponibles.map(d => <option key={d} value={d}>{d}</option>)}
                </select>

                <div className="relative flex-grow max-w-xs">
                    <Search className="absolute left-2 top-1.5 text-slate-400 dark:text-gray-500" size={12} />
                    <input
                        value={busqueda}
                        onChange={e => conResetPagina(setBusqueda)(e.target.value)}
                        className="w-full h-6 pl-7 pr-2 border border-slate-300 dark:border-gray-600 rounded text-[11px] outline-none bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100 focus:border-[#2383C2]"
                        placeholder="Buscar por Admisión, Paciente, Descripción, Cirujano, Arancel..."
                    />
                </div>

                <select
                    value={filtroRevisado}
                    onChange={(e) => conResetPagina(setFiltroRevisado)(e.target.value)}
                    className={`h-6 border rounded text-[11px] px-1.5 outline-none focus:border-[#2383C2] ${filtroRevisado ? 'border-[#2383C2] text-[#2383C2] bg-blue-50 dark:bg-blue-950/30 font-semibold' : 'border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100'}`}
                >
                    <option value="">Revisado (Todos)</option>
                    {OPCIONES_REVISADO.map(o => <option key={o} value={o}>{o}</option>)}
                </select>

                {ver('gestionImplante') && (
                    <select
                        value={filtroGestion}
                        onChange={(e) => conResetPagina(setFiltroGestion)(e.target.value)}
                        aria-label="Filtrar por gestión implante"
                        className={`h-6 border rounded text-[11px] px-1.5 outline-none focus:border-[#2383C2] ${filtroGestion ? 'border-[#2383C2] text-[#2383C2] bg-blue-50 dark:bg-blue-950/30 font-semibold' : 'border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100'}`}
                    >
                        <option value="">Gestión implante (Todas)</option>
                        {OPCIONES_GESTION.map(o => <option key={o} value={o}>{ETIQUETAS_ESTADO[o]} ({conteoGestion[o] || 0} adm.)</option>)}
                    </select>
                )}

                {ver('gestionConsignacion') && (
                    <select
                        value={filtroGestionConsignacion}
                        onChange={(e) => conResetPagina(setFiltroGestionConsignacion)(e.target.value)}
                        aria-label="Filtrar por gestión consignación"
                        className={`h-6 border rounded text-[11px] px-1.5 outline-none focus:border-[#2383C2] ${filtroGestionConsignacion ? 'border-[#2383C2] text-[#2383C2] bg-blue-50 dark:bg-blue-950/30 font-semibold' : 'border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-800 dark:text-gray-100'}`}
                    >
                        <option value="">Gestión consignación (Todas)</option>
                        {OPCIONES_GESTION.map(o => <option key={o} value={o}>{ETIQUETAS_ESTADO[o]} ({conteoGestionConsignacion[o] || 0} adm.)</option>)}
                    </select>
                )}

                <MultiSelectFiltro
                    opciones={opcionesArancel}
                    seleccionados={filtroAranceles}
                    onChange={conResetPagina(setFiltroAranceles)}
                    etiqueta="Aranceles"
                    icono={<Tag size={12} className="shrink-0" />}
                    anchoMenu="w-80"
                />

                {puedeMostrarOcultas && (
                    <label className={`h-6 ml-auto inline-flex items-center gap-1.5 px-2 rounded border text-[11px] cursor-pointer select-none ${mostrarOcultas ? 'border-[#2383C2] text-[#2383C2] bg-blue-50 dark:bg-blue-950/30 font-semibold' : 'border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-slate-700 dark:text-gray-200'}`}
                        title={`Filas con descripción oculta en ${NOMBRE_MODULO[modulo]} (Maestros → Descripciones ocultas). No cuentan en los contadores.`}>
                        <input type="checkbox" role="switch" checked={mostrarOcultas} onChange={(e) => conResetPagina(setMostrarOcultas)(e.target.checked)} className="accent-[#2383C2]" />
                        <EyeOff size={11} /> Mostrar ocultas ({nOcultas})
                    </label>
                )}
            </div>

            {/* Tabla Principal */}
            {cargandoLista ? (
                <div className="flex-grow flex items-center justify-center gap-2 text-slate-400 dark:text-gray-500 text-[11px]">
                    <Loader2 size={14} className="animate-spin" /> Cargando registros...
                </div>
            ) : (
            <div ref={tablaScrollRef} className="flex-grow overflow-auto">
                <table
                    className="text-left text-[11px] border-collapse"
                    style={{ tableLayout: 'fixed', width: anchoTotalTabla, minWidth: '100%' }}
                >
                    <ColgroupRedimensionable columnas={columnasVisibles} anchos={anchos} />
                    <thead className="bg-slate-100 dark:bg-gray-900/80 sticky top-0 z-10">
                        <tr className="text-slate-600 dark:text-gray-400 uppercase font-normal text-[10px] tracking-wider">
                            {columnasVisibles.map(col => (
                                <ThRedimensionable key={col.key} col={col} anchos={anchos} onResize={handleResize} className={`px-2 py-1.5 border-b border-r border-slate-200 dark:border-gray-700 ${col.align || ''}`}>
                                    {col.label}
                                </ThRedimensionable>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/60 dark:divide-gray-700/50 bg-white dark:bg-gray-800">
                        {reportesPagina.length === 0 ? (
                            <tr>
                                <td colSpan={columnasVisibles.length} className="px-4 py-6 text-center text-slate-400 dark:text-gray-500 text-xs">
                                    No hay registros disponibles para el período o filtros seleccionados.
                                </td>
                            </tr>
                        ) : (
                            reportesPagina.map((item) => {
                                const revisado = getRevisado(item);
                                const avisoGestion = modulo === 'implantes' && item.descripcionOcultaImplantes === true && !item._oculta;
                                return (
                                    <tr
                                        key={item.id}
                                        data-oculta={item._oculta || undefined}
                                        data-origen={item.id === filaOrigenId || undefined}
                                        className={`group hover:bg-slate-50 dark:hover:bg-gray-700/40 transition-all duration-150 border-l-2 hover:border-l-[#2383C2] ${item.id === filaOrigenId ? 'bg-blue-50/80 dark:bg-blue-950/30 border-l-[#2383C2]' : 'border-l-transparent'} ${item._oculta ? 'opacity-55 bg-slate-50/70 dark:bg-gray-900/40' : ''}`}
                                    >
                                        {ver('fecha') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 truncate text-slate-600 dark:text-gray-400">
                                              {item["Fecha"]}
                                          </td>
                                        )}
                                        {ver('admision') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-200 font-normal truncate">
                                              {item["Admisión"]}
                                          </td>
                                        )}
                                        {ver('paciente') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-800 dark:text-gray-100 font-normal truncate" title={item["Paciente"]}>
                                              {item["Paciente"]}
                                          </td>
                                        )}
                                        {ver('edad') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400 text-center truncate">
                                              {item["Edad"]}
                                          </td>
                                        )}
                                        {ver('codArt') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400 truncate">
                                              {item["Cod.Artículo"]}
                                          </td>
                                        )}
                                        {ver('descripcion') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300" title={item["Descripción"]}>
                                              <span className="flex items-center gap-1 min-w-0">
                                                  {item._oculta && <span className="shrink-0 px-1 rounded border border-slate-300 dark:border-gray-600 text-[9px] font-semibold uppercase text-slate-500 dark:text-gray-400">Oculta</span>}
                                                  {avisoGestion && (
                                                      <span className="shrink-0 inline-flex" data-aviso="gestion" title="Descripción oculta en Implantes, pero la admisión tiene gestión: se muestra igual.">
                                                          <AlertTriangle size={11} className="text-amber-600" aria-label="Descripción oculta con gestión" />
                                                      </span>
                                                  )}
                                                  <span className="truncate">{item["Descripción"]}</span>
                                                  {puedeOcultar && !item._oculta && !avisoGestion && (
                                                      <button type="button" onClick={() => pedirOcultar(item)}
                                                          title={`Ocultar esta descripción en ${NOMBRE_MODULO[modulo]}`} aria-label="Ocultar esta descripción"
                                                          className="ml-auto shrink-0 p-0.5 rounded text-slate-400 hover:text-[#2383C2] opacity-0 group-hover:opacity-100 focus:opacity-100 transition">
                                                          <EyeOff size={11} />
                                                      </button>
                                                  )}
                                              </span>
                                          </td>
                                        )}
                                        {ver('arancel') && (
                                          <td
                                              className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300 truncate"
                                              title={[item["Cód.Arancel"], item["Arancel"]].filter(Boolean).join(' — ')}
                                          >
                                              {item["Arancel"] || <span className="text-slate-400 dark:text-gray-500">-</span>}
                                          </td>
                                        )}
                                        {ver('prevision') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-600 dark:text-gray-400 truncate" title={`${item["Previsión"] || ''} - ${item["Isapre"] || ''}`}>
                                              {item["Previsión"]} {item["Isapre"] ? `(${item["Isapre"]})` : ''}
                                          </td>
                                        )}
                                        {ver('cirujano') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-700 dark:text-gray-300 truncate" title={item["1° Cirujano"]}>
                                              {item["1° Cirujano"]}
                                          </td>
                                        )}
                                        {ver('cantidad') && (
                                          <td className="px-2 py-1 border-b border-r border-slate-200/60 dark:border-gray-700/70 text-slate-800 dark:text-gray-100 text-center font-normal">
                                              {item["Cant.Art."]}
                                          </td>
                                        )}
                                        {ver('revisado') && (
                                          <td className="px-1.5 py-0.5 border-b border-slate-200/60 dark:border-gray-700/70 text-center">
                                              {item._oculta ? (
                                                  <span className="text-[10px] text-slate-400 dark:text-gray-500">No requiere</span>
                                              ) : (
                                              <select
                                                  value={revisado}
                                                  onChange={(e) => cambiarRevisado(item, e.target.value)}
                                                  title={item.revisadoPor ? `Última modificación: ${item.revisadoPor}` : undefined}
                                                  className={`w-full h-5 px-1 rounded-full border text-[10px] font-semibold outline-none cursor-pointer focus:ring-1 focus:ring-[#2383C2] ${CLASE_REVISADO[revisado]}`}
                                              >
                                                  {OPCIONES_REVISADO.map(o => <option key={o} value={o}>{o}</option>)}
                                              </select>
                                              )}
                                          </td>
                                        )}
                                        {ver('gestionImplante') && (
                                          <td className="px-1.5 py-0.5 border-b border-slate-200/60 dark:border-gray-700/70 text-center">
                                              <BadgeGestionImplante marca={marcaDe(item)} onAbrir={puedeVerGestiones ? () => abrirDetalle(item) : undefined} />
                                          </td>
                                        )}
                                        {ver('gestionConsignacion') && (
                                          <td className="px-1.5 py-0.5 border-b border-slate-200/60 dark:border-gray-700/70 text-center">
                                              <BadgeGestionImplante marca={marcaConsignacionDe(item)} tooltip={tooltipMarcaConsignacion} />
                                          </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
            )}

            <PaginacionSimple
                pagina={paginaActual}
                totalPaginas={totalPaginas}
                totalFilas={totalFilas}
                setPagina={setPagina}
                tamanoPagina={tamanoPagina}
                setTamanoPagina={setTamanoPagina}
            />

            {/* Totalizador Footer */}
            <div className="bg-slate-100 dark:bg-gray-900 border-t border-slate-200 dark:border-gray-700 p-2 flex items-center justify-between">
                <div className="text-[10px] text-slate-500 dark:text-gray-400">
                    Registros del mes: <strong className="text-slate-800 dark:text-gray-200 font-normal">{reportes.length}</strong>
                    {nOcultas > 0 && <> · Ocultas: <strong className="text-slate-800 dark:text-gray-200 font-normal">{nOcultas}</strong></>}
                    {totalFilas !== filasPantalla.length && <> · Filtrados: <strong className="text-slate-800 dark:text-gray-200 font-normal">{totalFilas}</strong></>}
                </div>
                <div className="flex items-center gap-1.5 text-[10px] flex-wrap justify-end">
                    {ver('gestionImplante') && OPCIONES_GESTION.map(o => (
                        <span key={o} className={`px-1.5 py-0.5 rounded-full border ${CLASE_GESTION[o]}`} title="Admisiones distintas del mes">
                            {ETIQUETAS_ESTADO[o]}: {conteoGestion[o] || 0}
                        </span>
                    ))}
                    {OPCIONES_REVISADO.map(o => (
                        <span key={o} className={`px-1.5 py-0.5 rounded-full border ${CLASE_REVISADO[o]}`}>
                            {o}: {conteoRevisado[o] || 0}
                        </span>
                    ))}
                </div>
            </div>

            </div>

            {/* Confirmar "Ocultar esta descripción" */}
            {confirmarOcultar && (
                <div className="fixed inset-0 bg-black/50 backdrop-blur-[1px] z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Ocultar descripción">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-gray-700">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-700 flex items-center gap-2 bg-slate-50/60 dark:bg-gray-900/40">
                            <EyeOff size={15} className="text-[#2383C2] shrink-0" />
                            <h3 className="text-[12px] font-bold text-slate-800 dark:text-gray-100">Ocultar descripción en {NOMBRE_MODULO[modulo]}</h3>
                        </div>
                        <div className="px-4 py-3 text-[11px] text-slate-600 dark:text-gray-300 flex flex-col gap-2">
                            <p className="font-semibold text-slate-800 dark:text-gray-100 break-words">{confirmarOcultar.texto}</p>
                            <p>
                                Afecta <b>{confirmarOcultar.total === undefined ? '…' : (confirmarOcultar.total ?? confirmarOcultar.mes)}</b> fila(s) en total
                                {' '}(<b>{confirmarOcultar.mes}</b> en este mes). Las filas se siguen guardando y se pueden ver con "Mostrar ocultas".
                            </p>
                            {confirmarOcultar.conGestion > 0 && (
                                <p className="flex items-start gap-1.5 text-amber-700 dark:text-amber-400">
                                    <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                                    {confirmarOcultar.conGestion} fila(s) de este mes tienen gestión en Implantes: seguirán visibles, con aviso.
                                </p>
                            )}
                            <p className="text-slate-400 dark:text-gray-500">Se vuelve a mostrar en Maestros → Descripciones ocultas.</p>
                        </div>
                        <div className="px-4 py-3 bg-slate-50 dark:bg-gray-900/40 border-t border-slate-100 dark:border-gray-700 flex justify-end gap-2">
                            <button type="button" onClick={() => setConfirmarOcultar(null)} className="h-7 px-3 text-[11px] text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200">Cancelar</button>
                            <button type="button" onClick={confirmarOcultacion} disabled={confirmarOcultar.guardando}
                                className="h-7 px-3 bg-[#2383C2] hover:bg-[#1d6fa5] text-white rounded text-[11px] font-semibold inline-flex items-center gap-1.5 disabled:opacity-50">
                                {confirmarOcultar.guardando ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />} Ocultar
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal Importar */}
            {showModal && (
                <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 font-sans">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-gray-700">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-700 flex justify-between items-center bg-slate-50/50 dark:bg-gray-900/40">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-[#2383C2]/10 rounded-lg">
                                    <Upload size={16} className="text-[#2383C2]" />
                                </div>
                                <h3 className="font-normal text-xs text-slate-800 dark:text-gray-100">Importar Reporte de Cirugías</h3>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 dark:hover:text-gray-300 transition p-1">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-6">
                            <div {...getRootProps()} className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer flex flex-col items-center justify-center gap-3 transition ${isDragActive ? "border-[#2383C2] bg-[#2383C2]/5" : "border-slate-200 dark:border-gray-700 hover:border-[#2383C2]/50 hover:bg-slate-50 dark:hover:bg-gray-700/30"}`}>
                                <input {...getInputProps()} />
                                <div className="bg-slate-100 dark:bg-gray-900 p-3 rounded-full">
                                    <FileSpreadsheet size={24} className="text-slate-400 dark:text-gray-500" />
                                </div>
                                <div>
                                    <p className="text-xs font-normal text-slate-700 dark:text-gray-200">Arrastra tu archivo Excel aquí</p>
                                    <p className="text-[10px] text-slate-400 dark:text-gray-400 mt-0.5">La columna 'Rut' será omitida automáticamente y se evitarán registros duplicados.</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-4 py-3 bg-slate-50 dark:bg-gray-900/40 border-t border-slate-100 dark:border-gray-700 flex justify-end">
                            <button onClick={() => setShowModal(false)} className="text-[11px] font-normal text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-gray-200 px-3 py-1 rounded-lg transition">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ReportesInfo;