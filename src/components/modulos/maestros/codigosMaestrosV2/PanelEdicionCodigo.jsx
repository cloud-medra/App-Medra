import React, { useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clock, Save, Tag, Pencil, Plus, CircleSlash } from 'lucide-react';
import PanelLateral from './ui/PanelLateral';
import { Seccion, Campo, Entrada, Selector, SoloLectura, EntradaEmpresa } from './ui/Campos';
import { Boton, Insignia } from './ui/TablaCodigos';
import Spinner from '../../../ui/Spinner';
import { useModal } from '../../../../context/ModalContext';
import { useToast } from '../../../../context/ToastContext';
import { CLASES_CODIGO } from '../shared/codigos/clasesCodigo';
import { normalizarDescriptorEmpresa } from '../shared/codigos/normalizarDescriptorEmpresa';
import {
  MODOS_PANEL, TIPOS_CODIGO, SEGMENTOS_CODIGO, ESTADOS_CODIGO,
  formDesdeRegistro, camposModificados, validarFormulario, avisosFormulario,
  descriptorAutoDe, formatearMiles, formatearPrecio, formatearFecha, tieneCodigo
} from './camposCodigo';
import { guardarRegistroCodigo } from './accionesCodigos';

const ICONO_MODO = {
  nuevoPendiente: Plus,
  asignarCodigo: Tag,
  nuevoConCodigo: Plus,
  editarConCodigo: Pencil,
  modificarRegistro: Pencil
};

const insigniaEstado = (registro, modo) => {
  if (!registro) return <Insignia tono="acento" icono={Plus}>Nuevo</Insignia>;
  if (modo === 'modificarRegistro' && registro.estado === 'INACTIVO') return <Insignia tono="peligro" icono={CircleSlash}>Inactivo</Insignia>;
  return tieneCodigo(registro)
    ? <Insignia tono="exito" icono={CheckCircle2}>Con código</Insignia>
    : <Insignia tono="aviso" icono={Clock}>Sin código</Insignia>;
};

/**
 * Panel lateral de alta / edición de un código. Usa el registro que ya está
 * en la tabla (no relee el documento) y al guardar escribe solo los campos
 * que cambiaron (ver accionesCodigos.js).
 *
 * `registros`: lista ya cargada, para avisar de códigos repetidos.
 */
const PanelEdicionCodigo = ({ abierto, modo, registro, empresas, registros, userData, onCerrar }) => {
  const config = MODOS_PANEL[modo] || MODOS_PANEL.editarConCodigo;
  const { confirmAction } = useModal();
  const { showToast } = useToast();

  const [inicial, setInicial] = useState(() => formDesdeRegistro(registro));
  const [form, setForm] = useState(inicial);
  const [tocados, setTocados] = useState({});
  const [intentoGuardar, setIntentoGuardar] = useState(false);
  const [guardando, setGuardando] = useState(false);

  // Se reinicia cada vez que se abre (con el registro de la tabla).
  useEffect(() => {
    if (!abierto) return;
    const valores = formDesdeRegistro(registro);
    setInicial(valores);
    setForm(valores);
    setTocados({});
    setIntentoGuardar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, registro?.id, modo]);

  const formEfectivo = useMemo(
    () => (config.descriptorAutomatico ? { ...form, descriptorAuto: descriptorAutoDe(form.referencia, form.descriptorEmpresa) } : form),
    [form, config.descriptorAutomatico]
  );

  const cambios = useMemo(
    () => (config.crear ? {} : camposModificados(inicial, formEfectivo, registro)),
    [config.crear, inicial, formEfectivo, registro]
  );
  const modificado = (campo) => !config.crear && campo in cambios;
  const numCambios = config.crear
    ? Object.keys(form).filter((k) => form[k] !== inicial[k]).length
    : Object.keys(cambios).length + (form.motivo.trim() ? 1 : 0);
  const sucio = numCambios > 0;

  const errores = useMemo(() => validarFormulario(formEfectivo, modo), [formEfectivo, modo]);
  const avisos = useMemo(() => avisosFormulario(formEfectivo, registro, registros), [formEfectivo, registro, registros]);
  const errorDe = (campo) => ((tocados[campo] || intentoGuardar) ? errores[campo] : undefined);

  const set = (campo) => (valor) => setForm((prev) => ({ ...prev, [campo]: valor }));
  const tocar = (campo) => () => setTocados((prev) => ({ ...prev, [campo]: true }));
  const entrada = (campo, extra = {}) => ({
    id: `cod-${campo}`,
    value: form[campo],
    onChange: (e) => set(campo)(e.target.value),
    onBlur: tocar(campo),
    error: errorDe(campo),
    ...extra
  });

  const guardar = async () => {
    if (guardando) return;
    setIntentoGuardar(true);
    if (Object.keys(errores).length > 0) {
      showToast('Revisa los campos marcados', 'error');
      return;
    }
    if (!config.crear && modo !== 'asignarCodigo' && !sucio) {
      showToast('No hay cambios para guardar', 'info');
      return;
    }
    setGuardando(true);
    try {
      const { sinCambios } = await guardarRegistroCodigo({ modo, registro, inicial, form: formEfectivo, userData });
      if (sinCambios) {
        showToast('No hay cambios para guardar', 'info');
      } else {
        showToast(config.crear ? 'Registro creado correctamente' : modo === 'asignarCodigo' ? 'Código asignado correctamente' : 'Cambios guardados correctamente', 'success');
        onCerrar();
      }
    } catch (error) {
      console.error('Error al guardar el código:', error);
      showToast('Error al guardar: ' + error.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const solicitarCierre = () => {
    if (guardando) return;
    if (!sucio) return onCerrar();
    confirmAction(
      'Descartar cambios',
      'Hay cambios sin guardar en este registro. ¿Cerrar el panel y descartarlos?',
      onCerrar,
      { confirmText: 'Descartar cambios', cancelText: 'Seguir editando', type: 'warning' }
    );
  };

  // Atajos: Esc cierra, Ctrl/Cmd+S guarda. Ref para usar siempre la última versión.
  const atajos = useRef({});
  atajos.current = { guardar, solicitarCierre };
  useEffect(() => {
    if (!abierto) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); atajos.current.solicitarCierre(); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); atajos.current.guardar(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [abierto]);

  const visible = (campo) => config.campos.includes(campo);
  const IconoModo = ICONO_MODO[modo] || Pencil;

  const encabezado = (
    <div>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-slate-400 dark:text-gray-500">
        <IconoModo size={12} /> {config.titulo}
      </div>
      <div className="mt-1.5 flex items-center gap-2 min-w-0">
        <h3 className="text-[17px] font-semibold text-slate-900 dark:text-gray-50 font-mono truncate">
          {registro ? (registro.codigo || 'Sin código') : (form.codigo || 'Nuevo registro')}
        </h3>
        {insigniaEstado(registro, modo)}
      </div>
      <p className="mt-0.5 text-[13px] text-slate-500 dark:text-gray-400 truncate" title={formEfectivo.descriptorAuto}>
        {formEfectivo.descriptorAuto || formEfectivo.referencia || 'Complete los datos del registro'}
      </p>
    </div>
  );

  const pie = (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0 text-[12px]">
        {sucio ? (
          <span className="inline-flex items-center gap-1.5 font-medium text-amber-700 dark:text-amber-400">
            <span className="w-2 h-2 rounded-full bg-amber-500" />
            {config.crear ? 'Sin guardar' : `${numCambios} cambio${numCambios !== 1 ? 's' : ''} sin guardar`}
          </span>
        ) : (
          <span className="text-slate-400 dark:text-gray-500">Sin cambios</span>
        )}
        <span className="hidden sm:inline ml-3 text-[11px] text-slate-400 dark:text-gray-500">
          <kbd className="font-sans">Ctrl+S</kbd> guardar · <kbd className="font-sans">Esc</kbd> cerrar
        </span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Boton onClick={solicitarCierre} disabled={guardando}>Cancelar</Boton>
        <Boton variante="primario" onClick={guardar} disabled={guardando} icono={guardando ? undefined : Save}>
          {guardando && <Spinner size="sm" color="#ffffff" />}
          {config.textoGuardar}
        </Boton>
      </div>
    </div>
  );

  return (
    <PanelLateral abierto={abierto} onSolicitarCierre={solicitarCierre} encabezado={encabezado} pie={pie}>
      <form onSubmit={(e) => { e.preventDefault(); guardar(); }} noValidate>
        <Seccion titulo="Identificación">
          {visible('codigo') && (
            <Campo etiqueta={modo === 'asignarCodigo' ? 'Código definitivo' : 'Código'} requerido={config.requeridos.includes('codigo')} error={errorDe('codigo')} aviso={avisos.codigo} modificado={modificado('codigo')} htmlFor="cod-codigo" ancho="col-span-1">
              <Entrada {...entrada('codigo')} onChange={(e) => set('codigo')(e.target.value.toUpperCase())} autoFocus={modo === 'asignarCodigo' || modo === 'nuevoConCodigo'} className="font-mono font-semibold" placeholder="Ej: 120345" />
            </Campo>
          )}
          <Campo etiqueta="Referencia" requerido error={errorDe('referencia')} modificado={modificado('referencia')} htmlFor="cod-referencia" ancho={visible('codigo') ? 'col-span-1' : 'col-span-2'}>
            <Entrada {...entrada('referencia')} autoFocus={modo === 'nuevoPendiente'} placeholder="Referencia del fabricante" />
          </Campo>
          <Campo etiqueta="Empresa" requerido error={errorDe('empresa')} modificado={modificado('empresa')} htmlFor="cod-empresa">
            <EntradaEmpresa id="cod-empresa" value={form.empresa} onChange={(v) => { set('empresa')(v); tocar('empresa')(); }} empresas={empresas} error={errorDe('empresa')} />
          </Campo>
          <Campo etiqueta="Descriptor empresa" modificado={modificado('descriptorEmpresa')} htmlFor="cod-descriptorEmpresa">
            <Entrada
              {...entrada('descriptorEmpresa')}
              onBlur={config.descriptorAutomatico ? (e) => set('descriptorEmpresa')(normalizarDescriptorEmpresa(e.target.value)) : undefined}
              placeholder="Descripción del producto según la empresa"
            />
          </Campo>
        </Seccion>

        <Seccion titulo="Clasificación">
          <Campo etiqueta="Tipo" modificado={modificado('tipo')} htmlFor="cod-tipo" ancho="col-span-1">
            <Selector {...entrada('tipo')} opciones={TIPOS_CODIGO} />
          </Campo>
          <Campo etiqueta="Segmento" modificado={modificado('segmento')} htmlFor="cod-segmento" ancho="col-span-1">
            <Selector {...entrada('segmento')} opciones={SEGMENTOS_CODIGO} />
          </Campo>
          <Campo etiqueta="Clase" modificado={modificado('clase')} htmlFor="cod-clase" ancho="col-span-1">
            <Selector {...entrada('clase')} opciones={CLASES_CODIGO} />
          </Campo>
          {visible('estado') && (
            <Campo etiqueta="Estado" modificado={modificado('estado')} htmlFor="cod-estado" ancho="col-span-1">
              <Selector {...entrada('estado')} opciones={ESTADOS_CODIGO} vacio={null} />
            </Campo>
          )}
          <Campo
            etiqueta={modo === 'modificarRegistro' || modo === 'editarConCodigo' ? 'Descriptor maestro' : 'Descriptor auto'}
            modificado={modificado('descriptorAuto')}
            htmlFor="cod-descriptorAuto"
            ayuda={config.descriptorAutomatico ? 'Se genera con Referencia + Descriptor empresa.' : undefined}
          >
            {config.descriptorAutomatico
              ? <SoloLectura valor={formEfectivo.descriptorAuto} />
              : <Entrada {...entrada('descriptorAuto')} />}
          </Campo>
        </Seccion>

        <Seccion titulo="Precios">
          <Campo
            etiqueta="Precio neto"
            requerido={config.requeridos.includes('precioNeto')}
            error={errorDe('precioNeto')}
            modificado={modificado('precioNeto')}
            htmlFor="cod-precioNeto"
            ayuda={registro ? `Valor actual: ${formatearPrecio(registro.precioNeto)}` : 'Sin separadores; se formatea al escribir.'}
            ancho="col-span-1"
          >
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-slate-400">$</span>
              <Entrada
                {...entrada('precioNeto')}
                onChange={(e) => set('precioNeto')(formatearMiles(e.target.value.replace(/\D/g, '')))}
                inputMode="numeric"
                placeholder="0"
                className="pl-6 text-right tabular-nums font-medium"
                autoFocus={modo === 'modificarRegistro'}
              />
            </div>
          </Campo>
          <Campo etiqueta="CX" modificado={modificado('cx')} htmlFor="cod-cx" ancho="col-span-1">
            <Entrada {...entrada('cx')} />
          </Campo>
        </Seccion>

        <Seccion titulo="Notas">
          <Campo etiqueta="Observación" modificado={modificado('observacion')} htmlFor="cod-observacion">
            <Entrada {...entrada('observacion')} />
          </Campo>
          {config.conMotivo && (
            <Campo etiqueta="Motivo del cambio" htmlFor="cod-motivo" ayuda="Queda solo en el historial del registro.">
              <Entrada {...entrada('motivo')} placeholder="Ej: actualización de tarifas anuales" />
            </Campo>
          )}
        </Seccion>

        {registro && (
          <Seccion titulo="Información del registro">
            <Campo etiqueta="Registrado por" ancho="col-span-1"><SoloLectura valor={registro.registradoPor} /></Campo>
            <Campo etiqueta="Fecha de registro" ancho="col-span-1"><SoloLectura valor={formatearFecha(registro.fechaRegistro)} /></Campo>
            {registro.asignadoPor && <Campo etiqueta="Código asignado por" ancho="col-span-1"><SoloLectura valor={registro.asignadoPor} /></Campo>}
            {registro.modificadoPor && <Campo etiqueta="Última modificación" ancho="col-span-1"><SoloLectura valor={registro.modificadoPor} /></Campo>}
            <Campo etiqueta="ID interno"><SoloLectura valor={registro.id} mono /></Campo>
          </Seccion>
        )}
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </PanelLateral>
  );
};

export default PanelEdicionCodigo;
