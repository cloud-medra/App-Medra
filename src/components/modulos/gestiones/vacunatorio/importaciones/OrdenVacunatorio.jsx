import React, { useState, useEffect, useCallback } from 'react';
import {
    collection,
    onSnapshot,
    doc,
    query,
    getDocs,
    writeBatch
} from 'firebase/firestore';
import { useDropzone } from 'react-dropzone';
import * as XLSX from 'xlsx';
import { db } from '../../../../../firebaseConfig';
import { 
    ClipboardList, 
    Search, 
    Upload, 
    X, 
    ArrowLeft, 
    FileSpreadsheet,
    Calendar,
    Building2,
    Hash,
    Receipt,
    PackageCheck
} from 'lucide-react';
import { useToast } from '../../../../../context/ToastContext';
import { useGranularPermission } from '../../../../../hooks/useGranularPermission';
import Spinner from '../../../../ui/Spinner';
import { incluyeTexto } from '../../../../../utils/normalizarTexto';
import { useFacturacionOrden } from '../../shared/useFacturacionOrden';
import TablaOrdenes from '../../shared/TablaOrdenes';
import DetalleOrdenTabla from '../../shared/DetalleOrdenTabla';
import { ordenarMeses } from '../../../../../utils/ordenarMeses';

const OrdenVacunatorio = () => {
    const [ordenes, setOrdenes] = useState([]);
    const [detalle, setDetalle] = useState([]);
    const [aniosDisponibles, setAniosDisponibles] = useState([]);
    const [mesesDisponibles, setMesesDisponibles] = useState([]);
    const [busqueda, setBusqueda] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [ordenSeleccionada, setOrdenSeleccionada] = useState(null);
    const [filtroAnio, setFiltroAnio] = useState("");
    const [filtroMes, setFiltroMes] = useState("");
    const [cargando, setCargando] = useState(false);

    const { showToast } = useToast();
    const { hasPermission } = useGranularPermission();

    const PATH_VISTA = "/vacunatorio/ordenVacunatorio";
    const COL_BASE = "vacunatorio_ordenes";
    const { porCodigo: facturacion, error: errorFacturacion } = useFacturacionOrden(ordenSeleccionada?.id, "vacunatorio_documentos");

    const getMesNombre = (index) => ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][index];

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

    useEffect(() => {
        if (!filtroAnio) { setMesesDisponibles([]); return; }
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

    useEffect(() => {
        if (!filtroAnio || !filtroMes) {
            setOrdenes([]);
            return;
        }
        const path = `${COL_BASE}/${filtroAnio}/meses/${filtroMes}/ordenes`;
        const q = query(collection(db, path));

        return onSnapshot(q, (snapshot) => {
            setOrdenes(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
        }, (err) => {
            console.error("ERROR EN SNAPSHOT ORDENES:", err);
        });
    }, [filtroAnio, filtroMes]);

    useEffect(() => {
        if (!ordenSeleccionada || !filtroAnio || !filtroMes) { setDetalle([]); return; }
        const path = `${COL_BASE}/${filtroAnio}/meses/${filtroMes}/ordenes/${ordenSeleccionada.id}/documentos`;
        return onSnapshot(collection(db, path), (snap) => {
            setDetalle(snap.docs.map(d => d.data()));
        });
    }, [ordenSeleccionada, filtroAnio, filtroMes]);

    const onDrop = useCallback(async (acceptedFiles) => {
        setCargando(true);
        try {
            const batch = writeBatch(db);
            let fechaResult = { y: "", m: "" };

            for (const file of acceptedFiles) {
                const data = await file.arrayBuffer();
                const workbook = XLSX.read(data, { type: 'array' });
                const jsonData = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

                const grupos = jsonData.reduce((acc, row) => {
                    const nro = String(row["Nro.Orden"]);
                    if (!acc[nro]) acc[nro] = { cabecera: row, items: [] };
                    acc[nro].items.push(row);
                    return acc;
                }, {});

                for (const nro in grupos) {
                    const { cabecera, items } = grupos[nro];
                    const [d, m, y] = cabecera["F.Orden"].split('/');
                    const nombreMes = getMesNombre(parseInt(m) - 1);
                    fechaResult = { y, m: nombreMes };

                    const totalItems = items.length;
                    const totalOrden = items.reduce((acc, item) => acc + ((parseFloat(item["Cant."]) || 0) * (parseFloat(item["P.Unitario"]) || 0)), 0);

                    const ordenRef = doc(db, COL_BASE, y, "meses", nombreMes, "ordenes", nro);

                    batch.set(doc(db, COL_BASE, y), { active: "true" }, { merge: true });
                    batch.set(doc(db, COL_BASE, y, "meses", nombreMes), { active: "true" }, { merge: true });
                    batch.set(ordenRef, {
                        "Nro.Orden": nro,
                        "F.Orden": cabecera["F.Orden"],
                        "Proveedor": cabecera["Proveedor"],
                        "Rut proveedor": cabecera["Rut proveedor"],
                        totalItems,
                        totalOrden,
                        fechaActualizacion: new Date()
                    }, { merge: true });

                    for (const item of items) {
                        if (item["Cod.Artículo"]) {
                            batch.set(doc(ordenRef, "documentos", String(item["Cod.Artículo"])), item, { merge: true });
                        }
                    }
                }
            }
            await batch.commit();

            if (fechaResult.y) setFiltroAnio(fechaResult.y);
            if (fechaResult.m) setFiltroMes(fechaResult.m);

            showToast("Importación exitosa", "success");
            setShowModal(false);
        } catch (e) {
            console.error(e);
            showToast("Error: " + e.message, "error");
        } finally {
            setCargando(false);
        }
    }, [showToast]);

    const { getRootProps, getInputProps, isDragActive } = useDropzone({
        onDrop,
        accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
    });

    const ordenesFiltradas = ordenes.filter(o =>
        incluyeTexto(o["Nro.Orden"], busqueda) ||
        incluyeTexto(o["Proveedor"], busqueda) ||
        incluyeTexto(o["Rut proveedor"], busqueda)
    );

    return (
        <div className="w-full h-full flex flex-col bg-slate-50 dark:bg-gray-900 border border-slate-200 dark:border-gray-800 rounded-lg shadow-sm overflow-hidden p-0 relative">
            {cargando && (
                <div className="absolute inset-0 z-[100] flex items-center justify-center bg-slate-900/30 dark:bg-black/50 backdrop-blur-[2px]">
                    <div className="bg-white dark:bg-gray-800 p-5 rounded-xl shadow-xl flex flex-col items-center gap-2 border border-slate-100 dark:border-gray-700">
                        <Spinner size="md" color="#2383C2" />
                        <h3 className="text-[#2383C2] text-normal">Procesando datos...</h3>
                    </div>
                </div>
            )}

            <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between">
                {ordenSeleccionada ? (
                    <div className="flex items-center gap-3 w-full">
                        <button 
                            onClick={() => setOrdenSeleccionada(null)} 
                            className="p-1 rounded-md text-tinta-secundaria hover:text-[#2383C2] hover:bg-slate-100 dark:hover:bg-gray-700 transition"
                            title="Volver al listado"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        <div className="flex items-center gap-2 border-l border-slate-200 dark:border-gray-700 pl-3">
                            <Receipt size={16} className="text-[#2383C2]" />
                            <span className="text-normal text-tinta-principal tracking-tight">
                                DETALLE DE ORDEN
                            </span>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2">
                        <ClipboardList size={16} className="text-[#2383C2]" />
                        <span className="text-normal text-tinta-principal tracking-wide uppercase">
                            Órdenes de Vacunatorio
                        </span>
                    </div>
                )}

                {!ordenSeleccionada && hasPermission(PATH_VISTA, "cabecera_acciones", "btn_importar") && (
                    <button 
                        onClick={() => setShowModal(true)} 
                        className="bg-[#2383C2] hover:bg-[#1c6fa6] text-white px-2.5 py-1 rounded text-pequeno flex items-center gap-1.5 transition shadow-sm"
                    >
                        <Upload size={11} /> Importar Excel
                    </button>
                )}
            </header>

            {ordenSeleccionada && (
                <div className="bg-white dark:bg-gray-800/90 border-b border-slate-200 dark:border-gray-700/80 px-3 py-2">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                        
                        <div className="bg-slate-50 dark:bg-gray-900/60 p-1.5 rounded border border-slate-200/80 dark:border-gray-700/50 flex items-center gap-2">
                            <div className="p-1 bg-[#2383C2]/10 rounded text-[#2383C2]">
                                <Hash size={13} />
                            </div>
                            <div>
                                <span className="block text-pequeno uppercase text-tinta-atenuada">N° Orden</span>
                                <span className="text-secundario text-tinta-principal">{ordenSeleccionada.id}</span>
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-gray-900/60 p-1.5 rounded border border-slate-200/80 dark:border-gray-700/50 flex items-center gap-2">
                            <div className="p-1 bg-slate-200/60 dark:bg-gray-700 text-tinta-secundaria rounded">
                                <Calendar size={13} />
                            </div>
                            <div>
                                <span className="block text-pequeno uppercase text-tinta-atenuada">Fecha Orden</span>
                                <span className="text-secundario text-tinta-principal">{ordenSeleccionada["F.Orden"]}</span>
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-gray-900/60 p-1.5 rounded border border-slate-200/80 dark:border-gray-700/50 flex items-center gap-2">
                            <div className="p-1 bg-slate-200/60 dark:bg-gray-700 text-tinta-secundaria rounded">
                                <Building2 size={13} />
                            </div>
                            <div>
                                <span className="block text-pequeno uppercase text-tinta-atenuada">RUT Proveedor</span>
                                <span className="text-secundario text-tinta-principal">{ordenSeleccionada["Rut proveedor"]}</span>
                            </div>
                        </div>

                        <div className="bg-slate-50 dark:bg-gray-900/60 p-1.5 rounded border border-slate-200/80 dark:border-gray-700/50 flex items-center gap-2">
                            <div className="p-1 bg-slate-200/60 dark:bg-gray-700 text-tinta-secundaria rounded">
                                <PackageCheck size={13} />
                            </div>
                            <div className="overflow-hidden">
                                <span className="block text-pequeno uppercase text-tinta-atenuada">Proveedor</span>
                                <span className="text-secundario text-tinta-principal truncate block" title={ordenSeleccionada["Proveedor"]}>
                                    {ordenSeleccionada["Proveedor"]}
                                </span>
                            </div>
                        </div>

                    </div>
                </div>
            )}

            {!ordenSeleccionada && (
                <div className="bg-slate-100/70 dark:bg-gray-800/40 p-1.5 flex flex-wrap gap-1.5 items-center border-b border-slate-200 dark:border-gray-700">
                    {hasPermission(PATH_VISTA, "listado", "select_anio") && (
                    <select value={filtroAnio} onChange={(e) => setFiltroAnio(e.target.value)} className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-tinta-principal rounded text-secundario px-1.5 outline-none focus:border-[#2383C2]">
                        <option value="">Año</option>
                        {aniosDisponibles.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                    )}

                    {hasPermission(PATH_VISTA, "listado", "select_mes") && (
                    <select value={filtroMes} onChange={(e) => setFiltroMes(e.target.value)} className="h-6 border border-slate-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-tinta-principal rounded text-secundario px-1.5 outline-none capitalize focus:border-[#2383C2]">
                        <option value="">Mes</option>
                        {mesesDisponibles.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                    )}

                    {hasPermission(PATH_VISTA, "listado", "input_buscar") && (
                    <div className="relative flex-grow max-w-xs">
                        <Search className="absolute left-2 top-1.5 text-slate-400 dark:text-gray-500" size={12} />
                        <input value={busqueda} onChange={e => setBusqueda(e.target.value)} className="w-full h-6 pl-7 pr-2 border border-slate-300 dark:border-gray-600 rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal focus:border-[#2383C2]" placeholder="Buscar por N°, RUT o Proveedor..." />
                    </div>
                    )}
                </div>
            )}

            <div className={`flex-grow min-h-0 ${ordenSeleccionada ? 'flex flex-col' : 'overflow-auto'}`}>
                {!ordenSeleccionada ? (
                    <TablaOrdenes
                        pathVista={PATH_VISTA}
                        ordenes={ordenesFiltradas}
                        onSeleccionar={hasPermission(PATH_VISTA, "listado", "action_ver_detalle") ? setOrdenSeleccionada : undefined}
                    />
                ) : (
                    <DetalleOrdenTabla
                        pathVista={PATH_VISTA}
                        detalle={detalle}
                        facturacion={facturacion}
                        errorFacturacion={errorFacturacion}
                        totalOrden={ordenSeleccionada.totalOrden}
                    />
                )}
            </div>

            {showModal && (
                <div className="fixed inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white dark:bg-gray-800 w-full max-w-md rounded-xl shadow-2xl overflow-hidden border border-slate-200 dark:border-gray-700">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-gray-700 flex justify-between items-center bg-slate-50/50 dark:bg-gray-900/40">
                            <div className="flex items-center gap-2">
                                <div className="p-1.5 bg-[#2383C2]/10 rounded-lg">
                                    <Upload size={16} className="text-[#2383C2]" />
                                </div>
                                <h3 className="text-subtitulo text-tinta-principal">Importar orden Excel</h3>
                            </div>
                            <button onClick={() => setShowModal(false)} className="text-tinta-atenuada hover:text-tinta-secundaria transition p-1">
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
                                    <p className="text-normal text-tinta-principal">Arrastra tu archivo Excel aquí</p>
                                    <p className="text-pequeno text-tinta-atenuada mt-0.5">o haz clic para seleccionar desde tu carpeta</p>
                                </div>
                            </div>
                        </div>
                        <div className="px-4 py-3 bg-slate-50 dark:bg-gray-900/40 border-t border-slate-100 dark:border-gray-700 flex justify-end">
                            <button onClick={() => setShowModal(false)} className="text-secundario text-tinta-secundaria hover:text-tinta-principal px-3 py-1 rounded-lg transition">
                                Cancelar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default OrdenVacunatorio;