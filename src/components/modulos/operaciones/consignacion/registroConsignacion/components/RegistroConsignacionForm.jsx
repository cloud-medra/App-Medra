import React, { useState, useRef, useEffect } from 'react';
import { db } from '../../../../../../firebaseConfig'; 
import { Plus, Save, X, Eraser, Info, Loader2, AlertCircle, List, RefreshCw } from 'lucide-react';
import { obtenerMedicosCacheados, obtenerCodigosCacheados, buscarReporteInfoPorAdmisionCacheado } from '../utils/cacheMaestros';
import {
  TIPOS_CONSIGNACION as TIPOS,
  CENTRO_FIJO,
  ESTADO_FIJO,
  mapearDatosVinculados,
  mapearItemMaestro,
  descripcionDesdeMaestro,
  validarRegistroConsignacion
} from '../../utils/registroConsignacionService';

const ESTADO_INICIAL = {
  gestionId: '',
  nombre: '',
  medico: '',
  fecha: '',
  referencia: '',
  codigo: '',
  cantidad: '',
  delivery: '',
  empresa: '',

  costo: '',
  convenio: '',
  prevision: '',
  descripcion: '',
  descripcionPabellon: ''
};

const RegistroConsignacionForm = ({ onRegistrar, valoresIniciales = null, onCancelar }) => {
  const [formData, setFormData] = useState(ESTADO_INICIAL);
  const [errores, setErrores] = useState({});

  const editando = !!valoresIniciales;

  const setField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errores[field]) setErrores(prev => ({ ...prev, [field]: false }));
  };

  useEffect(() => {
    if (valoresIniciales) {
      setFormData({
        gestionId: valoresIniciales.gestionId || '',
        nombre: valoresIniciales.nombre || '',
        medico: valoresIniciales.medico || '',
        fecha: valoresIniciales.fecha || '',
        referencia: valoresIniciales.referencia || '',
        codigo: valoresIniciales.codigo || '',
        cantidad: valoresIniciales.cantidad !== undefined && valoresIniciales.cantidad !== null ? String(valoresIniciales.cantidad) : '',
        delivery: valoresIniciales.delivery || '',
        empresa: valoresIniciales.empresa || '',
        costo: valoresIniciales.costo !== undefined && valoresIniciales.costo !== null ? String(valoresIniciales.costo) : '',
        convenio: valoresIniciales.convenio || '',
        prevision: valoresIniciales.prevision || '',
        descripcion: valoresIniciales.descripcion || '',
        descripcionPabellon: valoresIniciales.descripcionPabellon || ''
      });
      setTipoFiltro(valoresIniciales.tipo || valoresIniciales.atributo || 'CONSIGNACION');
      setErrores({});
    } else {
      setFormData(ESTADO_INICIAL);
      setTipoFiltro('CONSIGNACION');
    }
  }, [valoresIniciales]);

  const [cargandoVinculacion, setCargandoVinculacion] = useState(false);
  const vinculacionDebounceRef = useRef(null);

  useEffect(() => {
    const idTexto = formData.gestionId.trim();

    clearTimeout(vinculacionDebounceRef.current);

    if (!idTexto) {
      setFormData(prev => ({ ...prev, convenio: '', prevision: '', descripcionPabellon: '' }));
      return;
    }

    vinculacionDebounceRef.current = setTimeout(async () => {
      setCargandoVinculacion(true);
      try {
        const datos = await buscarReporteInfoPorAdmisionCacheado(db, idTexto);
        setFormData(prev => ({ ...prev, ...mapearDatosVinculados(datos) }));
      } finally {
        setCargandoVinculacion(false);
      }
    }, 500);

    return () => clearTimeout(vinculacionDebounceRef.current);
  }, [formData.gestionId]);

  const [medicos, setMedicos] = useState([]);
  const [cargandoMedicos, setCargandoMedicos] = useState(false);
  const [abiertoMedico, setAbiertoMedico] = useState(false);
  const [verTodosMedicos, setVerTodosMedicos] = useState(false);
  const medicoRef = useRef(null);

  const cargarMedicos = async (forzar = false) => {
    setCargandoMedicos(true);
    try {
      const data = await obtenerMedicosCacheados(db, forzar);
      setMedicos(data);
    } catch (err) {
      console.error('Error al cargar médicos:', err);
    } finally {
      setCargandoMedicos(false);
    }
  };

  useEffect(() => {
    cargarMedicos(false);
  }, []);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (medicoRef.current && !medicoRef.current.contains(e.target)) setAbiertoMedico(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const medicosFiltrados = (verTodosMedicos || !formData.medico.trim())
    ? medicos
    : medicos.filter(m =>
        m.nombre.toLowerCase().includes(formData.medico.toLowerCase()) ||
        (m.especialidad || '').toLowerCase().includes(formData.medico.toLowerCase())
      );

  const handleAbrirListaMedicos = () => {
    setVerTodosMedicos(true);
    setAbiertoMedico(true);
  };

  const handleSeleccionarMedico = (m) => {
    setField('medico', m.nombre);
    setVerTodosMedicos(false);
    setAbiertoMedico(false);
  };

  const [tipoFiltro, setTipoFiltro] = useState('CONSIGNACION');
  const [codigosDisponibles, setCodigosDisponibles] = useState([]);
  const [cargandoCodigos, setCargandoCodigos] = useState(false);
  const [abiertoDescripcion, setAbiertoDescripcion] = useState(false);
  const [verTodosCodigos, setVerTodosCodigos] = useState(false);
  const descripcionRef = useRef(null);

  const cargarCodigos = async (tipo, forzar = false) => {
    setCargandoCodigos(true);
    try {
      const data = await obtenerCodigosCacheados(db, tipo, forzar);
      setCodigosDisponibles(data);
    } catch (err) {
      console.error('Error al cargar códigos maestros:', err);
    } finally {
      setCargandoCodigos(false);
    }
  };

  useEffect(() => {
    let cancelado = false;
    (async () => {
      setCargandoCodigos(true);
      try {
        const data = await obtenerCodigosCacheados(db, tipoFiltro);
        if (!cancelado) setCodigosDisponibles(data);
      } catch (err) {
        console.error('Error al cargar códigos maestros:', err);
      } finally {
        if (!cancelado) setCargandoCodigos(false);
      }
    })();
    return () => { cancelado = true; };
  }, [tipoFiltro]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (descripcionRef.current && !descripcionRef.current.contains(e.target)) setAbiertoDescripcion(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const sugerenciasDescripcion = (verTodosCodigos || !formData.referencia.trim())
    ? codigosDisponibles
    : codigosDisponibles.filter(item => {
        const t = formData.referencia.toLowerCase();
        return (
          (item.referencia || '').toLowerCase().includes(t) ||
          (item.descriptorAuto || '').toLowerCase().includes(t) ||
          (item.descriptorEmpresa || '').toLowerCase().includes(t) ||
          (item.codigo || '').toLowerCase().includes(t)
        );
      });

  const handleAbrirListaDescripcion = () => {
    setVerTodosCodigos(true);
    setAbiertoDescripcion(true);
  };

  const handleCambiarTipo = (nuevoTipo) => {
    if (nuevoTipo === tipoFiltro) return;
    setTipoFiltro(nuevoTipo);
  };

  const handleSeleccionarDescripcion = (item) => {
    setFormData(prev => ({
      ...prev,
      ...mapearItemMaestro(item),
      referencia: item.referencia || prev.referencia
    }));
    setVerTodosCodigos(false);
    setAbiertoDescripcion(false);
  };

  const renderValorVinculado = (valor) => (valor === '' || valor === undefined || valor === null ? 'P' : valor);

  const handleRegistrar = (e) => {
    e.preventDefault();

    const err = validarRegistroConsignacion(formData);

    if (Object.keys(err).length > 0) {
      setErrores(err);
      return;
    }
    setErrores({});

    onRegistrar && onRegistrar({
      ...formData,
      tipo: tipoFiltro,
      atributo: tipoFiltro,
      centro: CENTRO_FIJO,
      estado: ESTADO_FIJO
    });

    if (!editando) {
      setFormData(prev => ({
        ...prev,
        referencia: '',
        codigo: '',
        cantidad: '',
        delivery: '',
        costo: '',
        descripcion: '',
        empresa: ''
      }));
    }
  };

  const handleLimpiar = () => {
    if (editando) {
      onCancelar && onCancelar();
      return;
    }
    setFormData(ESTADO_INICIAL);
    setErrores({});
    setTipoFiltro('CONSIGNACION');
    setVerTodosMedicos(false);
    setVerTodosCodigos(false);
    setAbiertoMedico(false);
    setAbiertoDescripcion(false);
  };

  return (
    <form onSubmit={handleRegistrar} className="px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50/30 dark:bg-gray-800/20 flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2.5">

        <div className="w-[100px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">ID</label>
          <input
            type="text"
            inputMode="numeric"
            value={formData.gestionId}
            onChange={e => setField('gestionId', e.target.value.replace(/\D/g, ''))}
            className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-etiqueta outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal"
            placeholder="Ej: 102"
          />
        </div>

        <div className="w-[160px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Nombre</label>
          <input
            value={formData.nombre}
            onChange={e => setField('nombre', e.target.value.toUpperCase())}
            className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal uppercase"
            placeholder="Nombre del paciente"
          />
        </div>

        <div className="w-[170px] relative" ref={medicoRef}>
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Médico</label>
          <div className="relative">
            <input
              type="text"
              autoComplete="off"
              value={formData.medico}
              onChange={e => { setField('medico', e.target.value); setVerTodosMedicos(false); }}
              onFocus={() => setAbiertoMedico(true)}
              className="w-full h-7 pl-2 pr-12 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal uppercase"
              placeholder="Buscar médico..."
            />
            <button
              type="button"
              onClick={() => cargarMedicos(true)}
              title="Actualizar listado de médicos"
              className="absolute right-6 top-1 p-0.5 text-tinta-atenuada hover:text-[#2383C2] transition"
            >
              <RefreshCw size={12} className={cargandoMedicos ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={handleAbrirListaMedicos}
              title="Ver listado completo de médicos"
              className="absolute right-1 top-1 p-0.5 text-tinta-atenuada hover:text-[#2383C2] transition"
            >
              <List size={13} />
            </button>
          </div>

          {abiertoMedico && (
            <div className="absolute top-full left-0 mt-1 w-56 max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-30">
              {medicosFiltrados.length === 0 ? (
                <div className="px-2.5 py-2 text-pequeno text-tinta-atenuada">Sin coincidencias</div>
              ) : (
                medicosFiltrados.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => handleSeleccionarMedico(m)}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0"
                  >
                    <div className="text-pequeno text-tinta-principal truncate">{m.nombre}</div>
                    {m.especialidad && (
                      <div className="text-pequeno text-tinta-atenuada truncate">{m.especialidad}</div>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="w-[130px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5 flex justify-between">
            <span>Fecha</span>
            <span className="text-red-500 text-etiqueta">*</span>
          </label>
          <input
            type="date"
            value={formData.fecha}
            onChange={e => setField('fecha', e.target.value)}
            className={`w-full h-7 px-2 border rounded text-secundario outline-none transition bg-white dark:bg-gray-900 text-tinta-principal ${errores.fecha
              ? 'border-red-500 ring-1 ring-red-500/30 bg-red-50/20'
              : 'border-gray-300 dark:border-gray-600 focus:border-[#2383C2]'
              }`}
          />
        </div>

        <div className="w-[230px] relative" ref={descripcionRef}>
          <label className="mb-0.5 flex items-center justify-between gap-1">
            <span className="text-pequeno text-tinta-secundaria uppercase flex items-center gap-1">
              Descripción / Referencia <span className="text-red-500 text-etiqueta">*</span>
            </span>
            <span className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => cargarCodigos(tipoFiltro, true)}
                title="Actualizar catálogo de códigos"
                className="p-0.5 text-tinta-atenuada hover:text-[#2383C2] transition"
              >
                <RefreshCw size={11} className={cargandoCodigos ? 'animate-spin' : ''} />
              </button>
              <span className="flex items-center rounded overflow-hidden border border-gray-300 dark:border-gray-600 text-pequeno uppercase">
                {TIPOS.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => handleCambiarTipo(t)}
                    className={`px-1.5 py-0.5 transition ${tipoFiltro === t
                      ? 'bg-[#2383C2] text-white'
                      : 'bg-white dark:bg-gray-900 text-tinta-secundaria hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                  >
                    {t === 'CONSIGNACION' ? 'CONSIG.' : 'COTIZ.'}
                  </button>
                ))}
              </span>
            </span>
          </label>

          <div className="relative">
            <input
              type="text"
              autoComplete="off"
              value={formData.referencia}
              onChange={e => { setField('referencia', e.target.value); setVerTodosCodigos(false); }}
              onFocus={() => setAbiertoDescripcion(true)}
              className={`w-full h-7 pl-2 pr-6 border rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal ${errores.referencia
                ? 'border-red-500 ring-1 ring-red-500/30'
                : 'border-gray-300 dark:border-gray-600 focus:border-[#2383C2]'
                }`}
              placeholder="Buscar descripción / referencia..."
            />
            <button
              type="button"
              onClick={handleAbrirListaDescripcion}
              title="Ver listado completo"
              className="absolute right-1 top-1 p-0.5 text-tinta-atenuada hover:text-[#2383C2] transition"
            >
              <List size={13} />
            </button>
          </div>

          {abiertoDescripcion && (
            <div className="absolute top-full left-0 mt-1 w-full max-h-48 overflow-y-auto bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded shadow-lg z-30">
              {cargandoCodigos ? (
                <div className="px-2.5 py-2 text-pequeno text-tinta-atenuada flex items-center gap-1.5">
                  <Loader2 size={11} className="animate-spin" /> Buscando...
                </div>
              ) : sugerenciasDescripcion.length === 0 ? (
                <div className="px-2.5 py-2 text-pequeno text-tinta-atenuada">Sin coincidencias en {tipoFiltro}</div>
              ) : (
                sugerenciasDescripcion.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSeleccionarDescripcion(item)}
                    className="w-full text-left px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700/60 border-b border-gray-100 dark:border-gray-700/50 last:border-b-0"
                  >
                    <div className="text-pequeno text-tinta-principal truncate flex items-center gap-1.5">
                      {item.referencia}
                      <span className="text-pequeno tabular-nums text-emerald-600 dark:text-emerald-400">{item.codigo || 'S/C'}</span>
                    </div>
                    <div className="text-pequeno text-tinta-atenuada truncate">
                      {descripcionDesdeMaestro(item) || 'Sin descripción'} · {item.empresa || 'N/A'}
                    </div>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        <div className="w-[85px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5 flex justify-between">
            <span>Cant.</span>
            <span className="text-red-500 text-etiqueta">*</span>
          </label>
          <input
            type="number"
            value={formData.cantidad}
            onChange={e => setField('cantidad', e.target.value)}
            className={`w-full h-7 px-2 border rounded text-secundario outline-none bg-white dark:bg-gray-900 text-tinta-principal ${errores.cantidad
              ? 'border-red-500 ring-1 ring-red-500/30'
              : 'border-gray-300 dark:border-gray-600 focus:border-[#2383C2]'
              }`}
            placeholder="1"
          />
        </div>

        <div className="w-[130px]">
          <label className="block text-pequeno text-tinta-secundaria uppercase mb-0.5">Delivery</label>
          <input
            type="text"
            value={formData.delivery}
            onChange={e => setField('delivery', e.target.value)}
            className="w-full h-7 px-2 border border-gray-300 dark:border-gray-600 rounded text-secundario outline-none focus:border-[#2383C2] bg-white dark:bg-gray-900 text-tinta-principal"
            placeholder="Ej: 3 días hábiles"
          />
        </div>

        <div className="flex items-end gap-1.5">
          <button
            type="submit"
            className={`h-7 px-3 rounded text-etiqueta flex items-center gap-1.5 text-white transition shrink-0 ${editando ? 'bg-amber-600 hover:bg-amber-700' : 'bg-[#2383C2] hover:bg-[#369BCE]'}`}
          >
            {editando ? <><Save size={13} /> Actualizar</> : <><Plus size={13} /> Registrar</>}
          </button>

          <button
            type="button"
            onClick={handleLimpiar}
            className="h-7 px-3 bg-gray-200 dark:bg-gray-700 rounded text-etiqueta text-tinta-secundaria flex items-center gap-1.5 hover:bg-gray-300 dark:hover:bg-gray-600 transition shrink-0"
          >
            {editando ? <><X size={13} /> Cancelar</> : <><Eraser size={13} /> Limpiar</>}
          </button>
        </div>
      </div>

      {(errores.fecha || errores.referencia || errores.cantidad) && (
        <div className="text-pequeno text-red-500 flex items-center gap-1">
          <AlertCircle size={10} /> Fecha, Descripción/Referencia y Cantidad son obligatorios
        </div>
      )}

      <div className="flex flex-wrap items-center gap-6 pt-1 px-2 bg-gray-100/60 dark:bg-gray-900/40 rounded border border-dashed border-gray-200 dark:border-gray-700/60 py-1.5 text-secundario">
        <div className="flex items-center gap-1.5 text-tinta-secundaria">
          <Info size={13} className="text-[#2383C2]" />
          <span className="text-pequeno uppercase text-tinta-atenuada">Datos Vinculados:</span>
          {cargandoVinculacion && (
            <Loader2 size={11} className="animate-spin text-[#2383C2]" />
          )}
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Centro:</span>
          <span className="text-tinta-principal bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-pequeno">
            {CENTRO_FIJO}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Atributo:</span>
          <span className="text-tinta-principal bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-pequeno">
            {tipoFiltro}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Estado:</span>
          <span className="text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded text-pequeno">
            {ESTADO_FIJO}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Código:</span>
          <span className="text-numero-tabla text-tinta-principal bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded">
            {renderValorVinculado(formData.codigo)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Empresa:</span>
          <span className="text-tinta-principal bg-gray-200 dark:bg-gray-700 px-1.5 py-0.5 rounded text-pequeno">
            {renderValorVinculado(formData.empresa)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Costo:</span>
          <span className="text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-900/40 px-1.5 py-0.5 rounded text-pequeno">
            {formData.costo !== '' ? `$${Number(formData.costo).toLocaleString('es-CL')}` : 'P'}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Convenio:</span>
          <span className="text-tinta-principal">
            {renderValorVinculado(formData.convenio)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Previsión:</span>
          <span className="text-tinta-principal">
            {renderValorVinculado(formData.prevision)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Descripción:</span>
          <span className="text-tinta-principal truncate max-w-[250px]" title={renderValorVinculado(formData.descripcion)}>
            {renderValorVinculado(formData.descripcion)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-tinta-secundaria text-pequeno uppercase">Descripción Pabellón:</span>
          <span className="text-tinta-principal truncate max-w-[250px]" title={renderValorVinculado(formData.descripcionPabellon)}>
            {renderValorVinculado(formData.descripcionPabellon)}
          </span>
        </div>
      </div>
    </form>
  );
};

export default RegistroConsignacionForm;