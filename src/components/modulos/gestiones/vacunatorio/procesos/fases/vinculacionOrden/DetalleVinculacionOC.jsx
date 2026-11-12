import React, { useState, useEffect } from 'react';
import {
    ArrowLeft,
    FileText,
    Calendar,
    Hash,
    Building2,
    Tag,
    DollarSign,
    Activity,
    ShoppingCart,
    CalendarDays
} from 'lucide-react';
import DrawerSeleccionOC from './DrawerSeleccionOC';
import EstadoProcesoBadge from '../../../../shared/EstadoProcesoBadge';
import { useColumnasPermitidas } from '../../../../../../../hooks/useColumnasPermitidas';

const PATH_VISTA = '/vacunatorio/archivosControlVacunatorio/vinculacionOrdenes';

// Columnas de la tabla (granularidad por columna: `col_<key>` en la sección
// 'tabla_detalle' del mapa de permisos; ver useColumnasPermitidas).
const COLUMNAS_TABLA = [
  { key: 'linea', label: '#' },
  { key: 'codigoDoc', label: 'Cód. Documento' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'cantidad', label: 'Cant.' },
  { key: 'unidad', label: 'Unidad' },
  { key: 'precioUnitario', label: 'P. Unitario' },
  { key: 'totalLinea', label: 'Total Línea' },
  { key: 'codigoMaestro', label: 'Cód. Maestro' },
  { key: 'descripcionMaestro', label: 'Descripción Maestro' },
  { key: 'precioMaestro', label: 'Precio Maestro' },
  { key: 'articuloOC', label: 'Artículo OC' },
  { key: 'precioOC', label: 'Precio OC' },
  { key: 'cantidadOC', label: 'Cantidad OC' },
  { key: 'vinculoOC', label: 'Vínculo OC' },
  { key: 'estadoItem', label: 'Estado Ítem' }
];

const DetalleVinculacionOC = ({
    documento,
    onVolver,
    onVincular,
    puedeVincular = true,
    formatearFechaEmision,
    renderBadgeEstadoGeneral
}) => {
    const { columnasVisibles: columnasTabla, ver: verColumna } = useColumnasPermitidas(PATH_VISTA, 'tabla_detalle', COLUMNAS_TABLA);
    const [detallesProcesados, setDetallesProcesados] = useState([]);
    const [ocVinculadaActiva, setOcVinculadaActiva] = useState(null);
    const [panelAbierto, setPanelAbierto] = useState(false);
    const [ocSeleccionada, setOcSeleccionada] = useState(null);

    useEffect(() => {
        if (documento) {
            setDetallesProcesados(documento.detalles || []);
            const oc = documento.ordenCompraVinculada || documento.ordenCompra || null;
            setOcVinculadaActiva(oc);
            setOcSeleccionada(oc);
        } else {
            setDetallesProcesados([]);
            setOcVinculadaActiva(null);
            setOcSeleccionada(null);
        }
    }, [documento]);

    if (!documento) return null;

    const parseMontoToFloat = (valor) => {
        if (valor === undefined || valor === null || valor === '') return 0;
        if (typeof valor === 'number') return valor;
        const strVal = String(valor).replace(/[^0-9,-]/g, '').replace(',', '.');
        return parseFloat(strVal) || 0;
    };

    const formatearMoneda = (valor) => {
        const monto = parseMontoToFloat(valor);
        return `$${Math.round(monto).toLocaleString('es-CL')}`;
    };

    const normalizarCodigo = (valor) => {
        if (valor === undefined || valor === null) return '';
        let str = String(valor).trim().toLowerCase();
        return str.replace(/\.0+$/, '').replace(/^0+/, '');
    };

    const handleConfirmarVinculacion = () => {
        if (!ocSeleccionada || !puedeVincular) return;

        const articulosOC = ocSeleccionada.articulosOC || ocSeleccionada.articulos || [];

        if (articulosOC.length === 0) {
            alert("La Orden de Compra seleccionada no contiene artículos cargados.");
            return;
        }

        const nuevosDetalles = (documento.detalles || []).map((item) => {
            const codMaestro = normalizarCodigo(item.codigoMaestro) || normalizarCodigo(item.codigo);

            if (!codMaestro) {
                return {
                    ...item,
                    articuloOC: '-',
                    precioOC: 0,
                    cantidadOC: 0,
                    vincuOC: false,
                    diferenciaCantidad: false,
                    diferenciaPrecio: false,
                    vincuOCTexto: "Sin coincidencia en OC",
                    estadoItem: "Sin Coincidencia"
                };
            }

            const coincidencia = articulosOC.find(art => {
                const codArticuloOC = normalizarCodigo(
                    art["Cod.Artículo"] ||
                    art["Cod.Articulo"] ||
                    art.codigo_articulo ||
                    art.codigoArticulo ||
                    art.codigo
                );
                return codArticuloOC === codMaestro;
            });

            if (coincidencia) {
                const codArticuloOC = coincidencia["Cod.Artículo"] ||
                    coincidencia["Cod.Articulo"] ||
                    coincidencia.codigo_articulo ||
                    coincidencia.codigoArticulo ||
                    coincidencia.codigo ||
                    '-';

                const precioUnitOC = coincidencia.precio_oc ?? parseMontoToFloat(
                    coincidencia["P.Unitario"] ||
                    coincidencia["Precio Net. Unitario"] ||
                    coincidencia["P. Unitario"] ||
                    coincidencia.precio
                );

                const cantOC = coincidencia.cantidad_oc ?? parseMontoToFloat(
                    coincidencia["Cant."] ||
                    coincidencia["Cantidad Pedida"] ||
                    coincidencia["Cantidad"] ||
                    coincidencia.cantidad
                );

                const descMaestro = coincidencia["Descripción"] ||
                    coincidencia["Descripcion"] ||
                    coincidencia.descripcion ||
                    coincidencia.nombre ||
                    item.descripcionMaestro ||
                    item.nombreMaestro ||
                    '';

                const cantDocumento = parseMontoToFloat(item.cantidad);
                const precioDocumento = parseMontoToFloat(item.precio);

                const precioDocumentoRedondeado = Math.round(precioDocumento);
                const precioOCRedondeado = Math.round(precioUnitOC);

                // Solo es "diferencia" cuando el documento/factura trae MÁS
                // cantidad que la orden de compra — si trae menos o igual,
                // no se marca (no es un error, puede ser un despacho
                // parcial legítimo).
                const hayDiferenciaCantidad = (cantDocumento - cantOC) > 0.001;
                const hayDiferenciaPrecio = Math.abs(precioDocumentoRedondeado - precioOCRedondeado) > 0;

                let vincuOCTexto = "Sin diferencias";
                if (hayDiferenciaCantidad && hayDiferenciaPrecio) {
                    vincuOCTexto = "Diferencia en cantidad y precio";
                } else if (hayDiferenciaCantidad) {
                    vincuOCTexto = "Diferencia en cantidad";
                } else if (hayDiferenciaPrecio) {
                    vincuOCTexto = "Diferencia en precio";
                }

                const tieneDiferencias = hayDiferenciaCantidad || hayDiferenciaPrecio;

                return {
                    ...item,
                    articuloOC: codArticuloOC,
                    descripcionMaestro: descMaestro || item.descripcionMaestro,
                    precioOC: precioUnitOC,
                    cantidadOC: cantOC,
                    vincuOC: true,
                    diferenciaCantidad: hayDiferenciaCantidad,
                    diferenciaPrecio: hayDiferenciaPrecio,
                    vincuOCTexto,
                    estadoItem: tieneDiferencias ? "Diferencia" : "Vinculado"
                };
            }

            return {
                ...item,
                articuloOC: '-',
                precioOC: 0,
                cantidadOC: 0,
                vincuOC: false,
                diferenciaCantidad: false,
                diferenciaPrecio: false,
                vincuOCTexto: "Sin coincidencia en OC",
                estadoItem: "Sin Coincidencia"
            };
        });

        const totalItems = nuevosDetalles.length;
        const itemsVinculados = nuevosDetalles.filter(d => d.vincuOC).length;
        const itemsConDiferencias = nuevosDetalles.filter(d => d.vincuOC && (d.diferenciaCantidad || d.diferenciaPrecio)).length;

        let estadoGeneral = "Pendiente";

        if (itemsVinculados === 0) {
            estadoGeneral = "Sin Coincidencia";
        } else if (itemsVinculados < totalItems) {
            estadoGeneral = "Vinculación Parcial";
        } else if (itemsConDiferencias > 0) {
            estadoGeneral = "Diferencia Reportada";
        } else {
            estadoGeneral = "Listo para Ingreso";
        }

        setDetallesProcesados(nuevosDetalles);
        setOcVinculadaActiva(ocSeleccionada);
        setPanelAbierto(false);

        if (onVincular) {
            onVincular({
                ordenCompra: ocSeleccionada,
                detallesActualizados: nuevosDetalles,
                estadoGeneral
            });
        }
    };

    return (
        <div className="relative flex flex-col h-full w-full bg-white dark:bg-gray-800 overflow-hidden">

            <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 px-3 py-2 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                    <button
                        onClick={onVolver}
                        className="p-1 hover:bg-slate-100 dark:hover:bg-gray-700 rounded text-tinta-secundaria flex items-center gap-1 text-secundario transition-colors cursor-pointer"
                        title="Volver a la lista"
                    >
                        <ArrowLeft size={15} className="text-[#2383C2]" />
                        <span>Volver</span>
                    </button>
                    <span className="text-tinta-atenuada">|</span>
                    <FileText className="text-[#2383C2]" size={15} />
                    <span className="text-etiqueta text-tinta-principal tracking-wide uppercase">
                        Vinculación OC — Folio {documento.folio}
                    </span>
                </div>
            </header>

            <div className="px-3 py-2 bg-slate-100/60 dark:bg-gray-900/40 border-b border-slate-200 dark:border-gray-700 grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 shrink-0">
                <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
                        <Hash size={11} className="text-[#2383C2]" /> Folio
                    </span>
                    <span className="text-etiqueta text-tinta-principal truncate mt-0.5">{documento.folio}</span>
                </div>

                <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
                        <Calendar size={11} className="text-[#2383C2]" /> Fecha Emisión
                    </span>
                    <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
                        {formatearFechaEmision ? formatearFechaEmision(documento.fchEmis) : (documento.fchEmis || '-')}
                    </span>
                </div>

                <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
                        <CalendarDays size={11} className="text-[#2383C2]" /> Mes Imputado
                    </span>
                    <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
                        {documento.mesImputado || documento.mes_imputado || '-'}
                    </span>
                </div>

                <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
                        <Tag size={11} className="text-[#2383C2]" /> Ref. (OC)
                    </span>
                    <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
                        {ocVinculadaActiva
                            ? `${ocVinculadaActiva.folioCalculado || ocVinculadaActiva.folio || ocVinculadaActiva.id || documento.folioRef || 'N/A'}`
                            : (documento.folioRef ? `${documento.folioRef}` : "N/A")}
                    </span>
                </div>

                <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
                        <DollarSign size={11} className="text-[#2383C2]" /> Total Neto
                    </span>
                    <span className="text-etiqueta text-tinta-principal truncate mt-0.5">
                        {formatearMoneda(documento.total)}
                    </span>
                </div>

                <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
                        <Activity size={11} className="text-[#2383C2]" /> Estado
                    </span>
                    <div className="mt-0.5">
                        {renderBadgeEstadoGeneral ? renderBadgeEstadoGeneral(documento.estado) : <EstadoProcesoBadge estado={documento.estado} fallback="-" />}
                    </div>
                </div>

                <div className="px-2.5 py-1.5 rounded bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 flex flex-col justify-between">
                    <span className="text-pequeno uppercase text-tinta-atenuada flex items-center gap-1">
                        <ShoppingCart size={11} className="text-[#2383C2]" /> Acción
                    </span>
                    <button
                        onClick={() => setPanelAbierto(true)}
                        disabled={!puedeVincular}
                        title={puedeVincular ? undefined : 'No tienes permiso para vincular OC'}
                        className="mt-0.5 w-full h-5 bg-[#2383C2] hover:bg-[#1d6fa5] active:bg-[#175b88] text-white rounded text-pequeno flex items-center justify-center gap-1 transition-colors shadow-xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ShoppingCart size={11} />
                        <span>Vincular OC</span>
                    </button>
                </div>
            </div>

            <div className="px-3 py-1.5 bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 truncate">
                    <Building2 size={13} className="text-[#2383C2] shrink-0" />
                    <span className="text-pequeno text-tinta-atenuada uppercase">Receptor:</span>
                    <span className="text-secundario text-tinta-principal truncate">{documento.rznSoc}</span>
                </div>
                <span className="text-pequeno text-tinta-atenuada shrink-0">
                    Total ítems: <strong className="text-tinta-principal">{detallesProcesados.length}</strong>
                </span>
            </div>

            <div className="flex-grow overflow-auto">
                <table className="w-full text-left text-secundario border-collapse min-w-[1550px]">
                    <thead className="bg-slate-100 dark:bg-gray-900 sticky top-0 z-10 shadow-xs">
                        <tr className="text-tinta-secundaria uppercase text-pequeno">
                            {verColumna('linea') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-10 text-center">#</th>
                            )}
                            {verColumna('codigoDoc') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-36">Cód. Documento</th>
                            )}
                            {verColumna('descripcion') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700">Descripción</th>
                            )}
                            {verColumna('cantidad') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-16 text-center">Cant.</th>
                            )}
                            {verColumna('unidad') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-16 text-center">Unidad</th>
                            )}
                            {verColumna('precioUnitario') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 text-right">P. Unitario</th>
                            )}
                            {verColumna('totalLinea') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 text-right">Total Línea</th>
                            )}
                            {verColumna('codigoMaestro') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 bg-slate-200/60 dark:bg-gray-800/80 text-tinta-principal">Cód. Maestro</th>
                            )}
                            {verColumna('descripcionMaestro') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-48 bg-slate-200/60 dark:bg-gray-800/80 text-tinta-principal">Descripción Maestro</th>
                            )}
                            {verColumna('precioMaestro') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 bg-slate-200/60 dark:bg-gray-800/80 text-right text-tinta-principal">Precio Maestro</th>
                            )}
                            {verColumna('articuloOC') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-28 bg-blue-100/70 dark:bg-blue-950/60 text-blue-900 dark:text-blue-200">ArticuloOC</th>
                            )}
                            {verColumna('precioOC') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-24 bg-blue-100/70 dark:bg-blue-950/60 text-right text-blue-900 dark:text-blue-200">Precio OC</th>
                            )}
                            {verColumna('cantidadOC') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-20 bg-blue-100/70 dark:bg-blue-950/60 text-center text-blue-900 dark:text-blue-200">Cantidad OC</th>
                            )}
                            {verColumna('vinculoOC') && (
                              <th className="py-1.5 px-2 border-b border-r border-slate-200 dark:border-gray-700 w-36 bg-blue-100/70 dark:bg-blue-950/60 text-center text-blue-900 dark:text-blue-200">Vincu OC</th>
                            )}
                            {verColumna('estadoItem') && (
                              <th className="py-1.5 px-2 border-b border-slate-200 dark:border-gray-700 w-28 bg-slate-200/60 dark:bg-gray-800/80 text-center text-tinta-principal">Estado Ítem</th>
                            )}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
                        {detallesProcesados.length === 0 ? (
                            <tr>
                                <td colSpan={columnasTabla.length} className="py-6 text-center text-tinta-atenuada text-normal">
                                    Este documento no posee ítems cargados.
                                </td>
                            </tr>
                        ) : (
                            detallesProcesados.map((item, idx) => {
                                const descMaestroText = item.descripcionMaestro || item.nombreMaestro || item.descripcion_maestro || '-';
                                return (
                                    <tr key={item.id || item.codigo || idx} className="hover:bg-slate-50 dark:hover:bg-gray-700/40">
                                        {verColumna('linea') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-secundaria text-center text-etiqueta">{idx + 1}</td>
                                        )}
                                        {verColumna('codigoDoc') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-secundaria">{item.codigo || '-'}</td>
                                        )}
                                        {verColumna('descripcion') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-tinta-principal">{item.nombre}</td>
                                        )}
                                        {verColumna('cantidad') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center">{item.cantidad}</td>
                                        )}
                                        {verColumna('unidad') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center text-pequeno uppercase">{item.unidad || '-'}</td>
                                        )}
                                        {verColumna('precioUnitario') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right">{formatearMoneda(item.precio)}</td>
                                        )}
                                        {verColumna('totalLinea') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right text-etiqueta">{formatearMoneda(item.monto)}</td>
                                        )}
                                        {verColumna('codigoMaestro') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-etiqueta bg-slate-50/50 dark:bg-gray-900/30">{item.codigoMaestro || '-'}</td>
                                        )}
                                        {verColumna('descripcionMaestro') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 bg-slate-50/50 dark:bg-gray-900/30 text-tinta-principal truncate max-w-[200px]" title={descMaestroText}>
                                              {descMaestroText}
                                          </td>
                                        )}
                                        {verColumna('precioMaestro') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right text-etiqueta bg-slate-50/50 dark:bg-gray-900/30">
                                              {item.precioMaestro !== undefined && item.precioMaestro !== null ? formatearMoneda(item.precioMaestro) : '-'}
                                          </td>
                                        )}
                                        {verColumna('articuloOC') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-etiqueta bg-blue-50/40 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300">
                                              {item.articuloOC || item.codArticuloOC || item.articulo_oc || '-'}
                                          </td>
                                        )}
                                        {verColumna('precioOC') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-right text-etiqueta bg-blue-50/40 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300">
                                              {item.precioOC !== null && item.precioOC !== undefined
                                                  ? formatearMoneda(item.precioOC)
                                                  : '-'
                                              }
                                          </td>
                                        )}
                                        {verColumna('cantidadOC') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center text-etiqueta bg-blue-50/40 dark:bg-blue-950/20 text-blue-900 dark:text-blue-300">
                                              {item.cantidadOC !== null && item.cantidadOC !== undefined ? item.cantidadOC : '-'}
                                          </td>
                                        )}
                                        {verColumna('vinculoOC') && (
                                          <td className="py-1 px-2 border-b border-r border-slate-200 dark:border-gray-700/70 text-center bg-blue-50/40 dark:bg-blue-950/20">
                                              <span className={`inline-block px-1.5 py-0.5 rounded text-pequeno whitespace-nowrap ${item.vincuOCTexto === "Sin diferencias"
                                                  ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                                                  : item.vincuOCTexto === "Sin coincidencia en OC"
                                                      ? "bg-slate-100 text-tinta-secundaria dark:bg-gray-700"
                                                      : "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                                                  }`}>
                                                  {item.vincuOCTexto || "-"}
                                              </span>
                                          </td>
                                        )}
                                        {verColumna('estadoItem') && (
                                          <td className="py-1 px-2 border-b border-slate-200 dark:border-gray-700 text-center bg-slate-50/50 dark:bg-gray-900/30">
                                              <span className={`inline-block px-2 py-0.5 rounded text-pequeno ${item.estadoItem === 'Vinculado'
                                                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-300'
                                                  : item.estadoItem === 'Diferencia'
                                                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-300'
                                                      : 'bg-slate-100 text-tinta-principal dark:bg-gray-700'
                                                  }`}>
                                                  {item.estadoItem || 'Pendiente'}
                                              </span>
                                          </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            <DrawerSeleccionOC
                panelAbierto={panelAbierto}
                setPanelAbierto={setPanelAbierto}
                ocSeleccionada={ocSeleccionada}
                setOcSeleccionada={setOcSeleccionada}
                onConfirmar={handleConfirmarVinculacion}
            />

        </div>
    );
};

export default DetalleVinculacionOC;