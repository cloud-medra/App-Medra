import React, { useState, useEffect, useCallback } from 'react';
import { useLaboratorioData } from '../../../LaboratorioDataContext';
import {
    ListOrdered,
    X,
    Search,
    RefreshCw,
    Tag,
    Loader2
} from 'lucide-react';
import { compararMeses } from '../../../../../../../utils/ordenarMeses';

const COL_ORDENES = "laboratorio_ordenes";

const NOMBRES_MESES = {
    '01': 'Enero', '1': 'Enero',
    '02': 'Febrero', '2': 'Febrero',
    '03': 'Marzo', '3': 'Marzo',
    '04': 'Abril', '4': 'Abril',
    '05': 'Mayo', '5': 'Mayo',
    '06': 'Junio', '6': 'Junio',
    '07': 'Julio', '7': 'Julio',
    '08': 'Agosto', '8': 'Agosto',
    '09': 'Septiembre', '9': 'Septiembre',
    '10': 'Octubre',
    '11': 'Noviembre',
    '12': 'Diciembre'
};

const parseMontoToFloat = (valor) => {
    if (valor === undefined || valor === null || valor === '') return 0;
    if (typeof valor === 'number') return valor;
    const strVal = String(valor).replace(/[^0-9,-]/g, '').replace(',', '.');
    return parseFloat(strVal) || 0;
};

const parseFecha = (fechaStr) => {
    if (!fechaStr || fechaStr === 'N/A') return new Date(0);
    if (typeof fechaStr?.toDate === 'function') return fechaStr.toDate();
    if (typeof fechaStr === 'string' && fechaStr.includes('/')) {
        const [d, m, y] = fechaStr.split('/');
        return new Date(Number(y), Number(m) - 1, Number(d));
    }
    return new Date(fechaStr);
};

const DrawerSeleccionOC = ({
    panelAbierto,
    setPanelAbierto,
    ocSeleccionada,
    setOcSeleccionada,
    onConfirmar
}) => {
    const [aniosDisponibles, setAniosDisponibles] = useState([]);
    const [mesesDisponibles, setMesesDisponibles] = useState([]);
    const [loadingMeses, setLoadingMeses] = useState(false);

    const [anioOC, setAnioOC] = useState('');
    const [mesOC, setMesOC] = useState('');
    const [ordenes, setOrdenes] = useState([]);
    const [loadingOC, setLoadingOC] = useState(false);
    const [busquedaOC, setBusquedaOC] = useState('');

    const [cargandoItemsId, setCargandoItemsId] = useState(null);
    const { getAnios, getMeses, getOrdenes, getLineasOrden } = useLaboratorioData();

    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.key === 'Escape' && panelAbierto) {
                setPanelAbierto(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [panelAbierto, setPanelAbierto]);

    useEffect(() => {
        if (!panelAbierto) {
            setBusquedaOC('');
            setAnioOC('');
            setMesOC('');
            setOrdenes([]);
            setMesesDisponibles([]);
        }
    }, [panelAbierto]);

    useEffect(() => {
        let isCancelled = false;

        const cargarAniosOC = async () => {
            try {
                const idsAnios = await getAnios(COL_ORDENES);
                if (isCancelled) return;

                const anios = [...idsAnios].sort((a, b) => Number(b) - Number(a));
                setAniosDisponibles(anios);
            } catch (error) {
                if (!isCancelled) console.error("Error al cargar años de OC:", error);
            }
        };

        if (panelAbierto) {
            cargarAniosOC();
        }

        return () => { isCancelled = true; };
    }, [panelAbierto, getAnios]);

    useEffect(() => {
        let isCancelled = false;

        const cargarMesesOC = async () => {
            if (!anioOC) {
                setMesesDisponibles([]);
                setMesOC('');
                setOrdenes([]);
                return;
            }

            setLoadingMeses(true);
            setBusquedaOC('');
            setMesOC('');
            setOrdenes([]);

            try {
                const idsMeses = await getMeses(COL_ORDENES, anioOC);
                if (isCancelled) return;

                const meses = idsMeses
                    .map(rawId => {
                        const padId = rawId.length === 1 ? `0${rawId}` : rawId;
                        return {
                            id: rawId,
                            nombre: NOMBRES_MESES[padId] || NOMBRES_MESES[rawId] || `Mes ${rawId}`
                        };
                    })
                    .sort((a, b) => compararMeses(a.id, b.id));

                setMesesDisponibles(meses);
            } catch (error) {
                if (!isCancelled) {
                    console.error("Error al cargar meses de OC:", error);
                    setMesesDisponibles([]);
                    setMesOC('');
                }
            } finally {
                if (!isCancelled) setLoadingMeses(false);
            }
        };

        if (panelAbierto && anioOC) {
            cargarMesesOC();
        }

        return () => { isCancelled = true; };
    }, [anioOC, panelAbierto, getMeses]);

    const cargarOrdenes = useCallback(async (isCancelledRef) => {
        if (!anioOC || !mesOC) {
            setOrdenes([]);
            return;
        }

        setLoadingOC(true);
        try {
            const docsOrdenes = await getOrdenes(COL_ORDENES, anioOC, mesOC);

            if (isCancelledRef && isCancelledRef.current) return;

            const lista = docsOrdenes.map(data => {
                return {
                    ...data,
                    folioCalculado: data["Nro.Orden"] || data.numero_oc || data.id,
                    proveedorCalculado: data["Proveedor"] || data.proveedor || 'Sin Razón Social',
                    montoCalculado: parseMontoToFloat(data.totalOrden || data.montoTotal || 0),
                    fechaCalculada: data["F.Orden"] || data.fecha || 'N/A'
                };
            });

            lista.sort((a, b) => parseFecha(b.fechaCalculada) - parseFecha(a.fechaCalculada));
            setOrdenes(lista);
        } catch (error) {
            if (!isCancelledRef || !isCancelledRef.current) {
                console.error("Error al cargar Órdenes de Compra:", error);
                setOrdenes([]);
            }
        } finally {
            if (!isCancelledRef || !isCancelledRef.current) {
                setLoadingOC(false);
            }
        }
    }, [anioOC, mesOC, getOrdenes]);

    useEffect(() => {
        const isCancelledRef = { current: false };

        if (panelAbierto && anioOC && mesOC) {
            cargarOrdenes(isCancelledRef);
        }

        return () => {
            isCancelledRef.current = true;
        };
    }, [anioOC, mesOC, panelAbierto, cargarOrdenes]);

    const handleSeleccionarOrden = useCallback(async (oc) => {
        setCargandoItemsId(oc.id);
        try {
            const lineas = await getLineasOrden(COL_ORDENES, anioOC, mesOC, oc.id);

            const articulosOC = lineas.map(item => {

                const rawCodigo = item["Cod.Artículo"] ??
                    item["Cod.Articulo"] ??
                    item["Cod. Artículo"] ??
                    item["Cod. Articulo"] ??
                    item["Codigo"] ??
                    item["Código"] ??
                    item.codigo ??
                    item.codigo_producto ??
                    item.cod_articulo ??
                    item.id;

                const rawPrecio = item["P.Unitario"] ??
                    item["Precio Net. Unitario"] ??
                    item["P. Unitario"] ??
                    item.precio_unitario ??
                    item.precioOC ??
                    item.precio ?? 0;

                const rawCantidad = item["Cant."] ??
                    item["Cantidad Pedida"] ??
                    item["Cantidad"] ??
                    item.cantidad_oc ??
                    item.cantidad ?? 0;

                const rawArticulo = item["Artículo"] ??
                    item["Articulo"] ??
                    item["Descripción"] ??
                    item["Descripcion"] ??
                    item.articulo_oc ??
                    item.articulo ??
                    item.descripcion ??
                    item.nombre ?? '';

                const precio_oc = parseMontoToFloat(rawPrecio);
                const cantidad_oc = parseMontoToFloat(rawCantidad);
                const articulo_oc = String(rawArticulo).trim();

                return {
                    ...item,
                    codigo_oc: String(rawCodigo).trim(),
                    precio_oc,
                    cantidad_oc,
                    articulo_oc,
                    precio: precio_oc,
                    cantidad: cantidad_oc,
                    articulo: articulo_oc
                };
            });

            setOcSeleccionada({
                ...oc,
                articulosOC,
                montoTotal: oc.montoCalculado
            });
        } catch (error) {
            console.error("Error al cargar ítems de la OC:", error);
            setOcSeleccionada({ ...oc, articulosOC: [] });
        } finally {
            setCargandoItemsId(null);
        }
    }, [anioOC, mesOC, setOcSeleccionada, getLineasOrden]);

    const ordenesFiltradas = ordenes.filter(oc => {
        const termino = busquedaOC.toLowerCase().trim();
        if (!termino) return true;
        const folioStr = String(oc.folioCalculado ?? '').toLowerCase();
        const proveedorStr = String(oc.proveedorCalculado ?? '').toLowerCase();
        return folioStr.includes(termino) || proveedorStr.includes(termino);
    });

    return (
        <>
            {panelAbierto && (
                <div
                    className="absolute inset-0 bg-slate-900/40 dark:bg-black/60 z-20 transition-opacity"
                    onClick={() => setPanelAbierto(false)}
                />
            )}

            <div className={`absolute top-0 right-0 h-full w-full max-w-md bg-white dark:bg-gray-800 border-l border-slate-200 dark:border-gray-700 shadow-2xl z-30 transform transition-transform duration-300 flex flex-col ${panelAbierto ? 'translate-x-0' : 'translate-x-full'}`}>

                <div className="bg-slate-100 dark:bg-gray-900 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-1.5 text-tinta-principal text-etiqueta uppercase">
                        <ListOrdered size={15} className="text-[#2383C2]" />
                        <span>Seleccionar Orden de Compra</span>
                    </div>
                    <button onClick={() => setPanelAbierto(false)} className="p-1 text-tinta-atenuada hover:text-tinta-secundaria rounded-full">
                        <X size={16} />
                    </button>
                </div>

                <div className="p-3 bg-slate-50 dark:bg-gray-800/60 border-b border-slate-200 dark:border-gray-700 flex flex-col gap-2 shrink-0">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Año</label>
                            <select
                                value={anioOC}
                                onChange={(e) => setAnioOC(e.target.value)}
                                className="w-full h-7 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-tinta-principal rounded text-secundario px-1.5 outline-none focus:border-[#2383C2]"
                            >
                                <option value="">Seleccionar Año</option>
                                {aniosDisponibles.map((a) => (
                                    <option key={`oc-anio-${a}`} value={a}>{a}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Mes</label>
                            <select
                                value={mesOC}
                                onChange={(e) => setMesOC(e.target.value)}
                                disabled={loadingMeses || !anioOC || mesesDisponibles.length === 0}
                                className="w-full h-7 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-tinta-principal rounded text-secundario px-1.5 outline-none focus:border-[#2383C2] disabled:opacity-50"
                            >
                                {loadingMeses ? (
                                    <option value="">Cargando meses...</option>
                                ) : !anioOC ? (
                                    <option value="">Seleccione un año</option>
                                ) : mesesDisponibles.length === 0 ? (
                                    <option value="">Sin meses registrados</option>
                                ) : (
                                    <>
                                        <option value="">Seleccionar Mes</option>
                                        {mesesDisponibles.map((m) => (
                                            <option key={`oc-mes-${m.id}`} value={m.id}>{m.nombre}</option>
                                        ))}
                                    </>
                                )}
                            </select>
                        </div>
                    </div>

                    <div className="relative mt-1">
                        <Search className="absolute left-2 top-2 text-slate-400" size={13} />
                        <input
                            type="text"
                            value={busquedaOC}
                            onChange={(e) => setBusquedaOC(e.target.value)}
                            placeholder="Buscar por Folio u Orden..."
                            className="w-full h-7 pl-7 pr-2 border border-slate-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]"
                        />
                    </div>
                </div>

                <div className="flex-grow overflow-auto p-2">
                    {loadingOC ? (
                        <div className="h-40 flex items-center justify-center gap-2 text-normal text-tinta-secundaria">
                            <RefreshCw size={14} className="animate-spin text-[#2383C2]" />
                            <span>Cargando Órdenes...</span>
                        </div>
                    ) : !anioOC || !mesOC ? (
                        <div className="h-40 flex items-center justify-center text-normal text-tinta-atenuada text-center px-4">
                            {!anioOC
                                ? 'Seleccione un Año para comenzar.'
                                : 'Seleccione un Mes para consultar órdenes.'}
                        </div>
                    ) : ordenesFiltradas.length === 0 ? (
                        <div className="h-40 flex items-center justify-center text-normal text-tinta-atenuada text-center px-4">
                            No se encontraron Órdenes de Compra registradas en {NOMBRES_MESES[mesOC] || mesOC} de {anioOC}.
                        </div>
                    ) : (
                        <div className="flex flex-col gap-1.5">
                            {ordenesFiltradas.map((oc) => {
                                const esSeleccionado = ocSeleccionada?.id === oc.id;
                                const estaCargando = cargandoItemsId === oc.id;

                                return (
                                    <div
                                        key={oc.id}
                                        onClick={() => handleSeleccionarOrden(oc)}
                                        className={`relative p-2.5 rounded border text-left cursor-pointer transition-all flex flex-col gap-1 ${esSeleccionado
                                                ? 'border-[#2383C2] bg-blue-50/50 dark:bg-blue-950/40'
                                                : 'border-slate-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-slate-300'
                                            } ${estaCargando ? 'opacity-60 pointer-events-none' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-tinta-principal text-etiqueta flex items-center gap-1">
                                                <Tag size={12} className="text-[#2383C2]" />
                                                OC {oc.folioCalculado}
                                            </span>
                                            <span className="text-[#2383C2] text-etiqueta flex items-center gap-1">
                                                {estaCargando && <Loader2 size={11} className="animate-spin" />}
                                                ${Math.round(oc.montoCalculado).toLocaleString('es-CL')}
                                            </span>
                                        </div>

                                        <div className="text-pequeno text-tinta-secundaria truncate">
                                            {oc.proveedorCalculado}
                                        </div>

                                        <div className="flex items-center justify-between text-pequeno text-tinta-atenuada mt-1 pt-1 border-t border-slate-100 dark:border-gray-800">
                                            <span>Emisión: {oc.fechaCalculada}</span>
                                            <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-gray-800 text-tinta-secundaria">
                                                {oc.estado || 'Pendiente'}
                                            </span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="p-2.5 bg-slate-100 dark:bg-gray-900 border-t border-slate-200 dark:border-gray-700 flex items-center justify-end gap-2 shrink-0">
                    <button
                        onClick={() => setPanelAbierto(false)}
                        className="px-3 py-1.5 bg-slate-200 dark:bg-gray-700 hover:bg-slate-300 text-tinta-principal rounded text-etiqueta transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        onClick={() => onConfirmar(ocSeleccionada)}
                        disabled={!ocSeleccionada || cargandoItemsId !== null}
                        className="px-3 py-1.5 bg-[#2383C2] hover:bg-[#1d6fa5] disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-etiqueta transition-colors flex items-center gap-1"
                    >
                        Confirmar Vinculación
                    </button>
                </div>
            </div>
        </>
    );
};

export default DrawerSeleccionOC;