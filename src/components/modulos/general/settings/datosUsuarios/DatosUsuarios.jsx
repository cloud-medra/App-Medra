import { useEffect, useRef, useState } from 'react';
import { verifyBeforeUpdateEmail } from 'firebase/auth';
import { auth } from '../../../../../firebaseConfig';
import { useToast } from '../../../../../context/ToastContext';
import { useUser } from '../../../../../context/UserContext';
import Spinner from '../../../../ui/Spinner';
import { UserCircle, User, AtSign, Mail, Send, X, Clock, CheckCircle2, XCircle, Ban, MailCheck } from 'lucide-react';
import {
  useMisSolicitudes, crearSolicitud, cancelarSolicitud, sincronizarMiCorreo, validarSolicitud, validarMotivo,
  ESTADOS_ABIERTOS, ESTADOS_SOLICITUD, etiquetaTipo, formatoFecha, mensajeErrorSolicitud,
} from '../../../administracion/alertas/solicitudesServicio';

// Ajustes → Datos personales. Nombre completo, nombre de usuario y correo no
// se editan aquí: se pide el cambio y lo aprueba (o rechaza) el
// administrador del usuario desde Administración → Alertas
// (functions/solicitudes). El correo aprobado se aplica recién cuando el
// usuario lo confirma desde la nueva dirección (verifyBeforeUpdateEmail,
// solo con el correo aprobado).
const CAMPOS = [
  { tipo: 'nombreCompleto', icon: User, label: 'Nombre completo', placeholder: 'Ej: Juana Pérez Soto' },
  { tipo: 'nombreUsuario', icon: AtSign, label: 'Nombre de usuario', placeholder: 'Ej: jperez' },
  { tipo: 'email', icon: Mail, label: 'Correo', placeholder: 'ejemplo@medra.cl', inputType: 'email' },
];

const ICONO_ESTADO = { pendiente: Clock, aprobada: MailCheck, aplicada: CheckCircle2, rechazada: XCircle, cancelada: Ban };
const TONO_ESTADO = {
  pendiente: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300',
  aprobada: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  aplicada: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  rechazada: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  cancelada: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300',
};

const ERRORES_CORREO = {
  'auth/requires-recent-login': 'Por seguridad, vuelve a iniciar sesión y pulsa de nuevo "Enviar correo de confirmación".',
  'auth/email-already-in-use': 'Ese correo ya está en uso por otra cuenta.',
  'auth/invalid-email': 'El correo no es válido.',
};

const DatosUsuarios = () => {
  const { showToast } = useToast();
  const { userData, setUserData } = useUser();
  const { datos: solicitudes, cargando } = useMisSolicitudes(userData?.uid);
  // { tipo, valor, motivo, errores } del formulario abierto.
  const [formulario, setFormulario] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [ocupadoId, setOcupadoId] = useState(null);

  const valorActual = (tipo) => userData?.[tipo] || (tipo === 'email' ? auth.currentUser?.email : '') || '';
  const abiertaDe = (tipo) => solicitudes.find((s) => s.tipo === tipo && ESTADOS_ABIERTOS.includes(s.estado));

  // Correo aprobado y ya confirmado desde la nueva dirección: se aplica al
  // perfil (si no, lo hace iniciarSesion la próxima vez que entre).
  const revisado = useRef(new Set());
  useEffect(() => {
    const aprobada = solicitudes.find((s) => s.tipo === 'email' && s.estado === 'aprobada');
    const user = auth.currentUser;
    if (!aprobada || !user || revisado.current.has(aprobada.id)) return;
    revisado.current.add(aprobada.id);
    user.reload()
      .then(async () => {
        if ((auth.currentUser?.email || '').toLowerCase() !== aprobada.valorSolicitado) return;
        const { resultado } = await sincronizarMiCorreo();
        if (resultado === 'aplicada') {
          setUserData((prev) => ({ ...prev, email: aprobada.valorSolicitado }));
          showToast('Tu correo se actualizó.', 'success');
        }
      })
      .catch((err) => console.warn('No se pudo revisar el cambio de correo:', err));
  }, [solicitudes, setUserData, showToast]);

  const abrir = (tipo) => setFormulario({ tipo, valor: '', motivo: '', errores: {} });

  const enviar = async (e) => {
    e.preventDefault();
    const { tipo, valor, motivo } = formulario;
    const v = validarSolicitud(tipo, valor, valorActual(tipo));
    const m = validarMotivo(motivo);
    const errores = { ...(v.error ? { valor: v.error } : {}), ...(m.error ? { motivo: m.error } : {}) };
    if (Object.keys(errores).length) {
      setFormulario((f) => ({ ...f, errores }));
      return;
    }
    setEnviando(true);
    try {
      await crearSolicitud({ tipo, valorSolicitado: v.valor, motivo: m.motivo });
      setFormulario(null);
      showToast('Solicitud enviada. La revisará tu administrador.', 'success');
    } catch (error) {
      console.error('Error al enviar la solicitud:', error);
      if (error?.code === 'functions/already-exists') setFormulario((f) => ({ ...f, errores: { valor: error.message } }));
      showToast(mensajeErrorSolicitud(error, 'No se pudo enviar la solicitud.'), 'error');
    } finally {
      setEnviando(false);
    }
  };

  const cancelar = async (s) => {
    setOcupadoId(s.id);
    try {
      await cancelarSolicitud({ id: s.id });
      showToast('Solicitud cancelada.', 'success');
    } catch (error) {
      showToast(mensajeErrorSolicitud(error, 'No se pudo cancelar la solicitud.'), 'error');
    } finally {
      setOcupadoId(null);
    }
  };

  // Solo con el correo APROBADO (el de la solicitud), nunca con otro.
  const enviarConfirmacion = async (s) => {
    const user = auth.currentUser;
    if (!user) return;
    setOcupadoId(s.id);
    try {
      await verifyBeforeUpdateEmail(user, s.valorSolicitado);
      showToast('Te enviamos un correo de confirmación a la nueva dirección.', 'success');
    } catch (error) {
      console.error('Error al enviar la confirmación de correo:', error);
      showToast(ERRORES_CORREO[error?.code] || 'No se pudo enviar el correo de confirmación.', 'error');
    } finally {
      setOcupadoId(null);
    }
  };

  const ESTILO_INPUT = 'w-full text-xs p-2 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2]';

  return (
    <div className="w-full max-w-lg flex flex-col gap-4">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col gap-4">
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-100 uppercase tracking-wide flex items-center gap-2">
            <UserCircle size={16} className="text-[#2383C2]" />
            Datos Personales
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Para cambiar un dato, envía una solicitud: la revisa tu administrador.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          {CAMPOS.map(({ tipo, icon: Icon, label, placeholder, inputType }) => {
            const abierta = abiertaDe(tipo);
            const editando = formulario?.tipo === tipo;
            return (
              <div key={tipo}>
                <span className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">{label}</span>
                <div className="flex items-center justify-between gap-2 text-xs p-2 pl-2.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200">
                  <span className="flex items-center gap-2 truncate" data-testid={`valor-${tipo}`}>
                    <Icon className="text-gray-400 shrink-0" size={14} />
                    <span className="truncate">{valorActual(tipo) || '—'}</span>
                  </span>
                  {abierta ? (
                    <span className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 shrink-0">Solicitud en curso</span>
                  ) : !editando && (
                    <button type="button" onClick={() => abrir(tipo)} disabled={cargando}
                      className="text-[10.5px] font-bold text-[#2383C2] hover:underline shrink-0 disabled:opacity-50">
                      Solicitar cambio
                    </button>
                  )}
                </div>
                {editando && (
                  <form onSubmit={enviar} aria-label={`Solicitar cambio de ${label.toLowerCase()}`}
                    className="mt-2 flex flex-col gap-2 rounded border border-[#2383C2]/40 bg-[#2383C2]/5 dark:bg-blue-950/20 p-2.5">
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300" htmlFor={`nuevo-${tipo}`}>Nuevo valor</label>
                    <input id={`nuevo-${tipo}`} type={inputType || 'text'} autoFocus value={formulario.valor} placeholder={placeholder}
                      onChange={(e) => setFormulario((f) => ({ ...f, valor: e.target.value, errores: { ...f.errores, valor: undefined } }))}
                      className={ESTILO_INPUT} />
                    {formulario.errores.valor && <p className="text-[11px] text-red-600">{formulario.errores.valor}</p>}
                    <label className="text-[11px] font-semibold text-gray-600 dark:text-gray-300" htmlFor={`motivo-${tipo}`}>Motivo</label>
                    <textarea id={`motivo-${tipo}`} rows={2} value={formulario.motivo} placeholder="Por qué necesitas el cambio"
                      onChange={(e) => setFormulario((f) => ({ ...f, motivo: e.target.value, errores: { ...f.errores, motivo: undefined } }))}
                      className={ESTILO_INPUT} />
                    {formulario.errores.motivo && <p className="text-[11px] text-red-600">{formulario.errores.motivo}</p>}
                    {tipo === 'email' && (
                      <p className="text-[10.5px] text-gray-500 dark:text-gray-400">Si la aprueban, deberás confirmarlo desde la nueva dirección.</p>
                    )}
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setFormulario(null)} className="text-[11px] font-semibold px-3 py-1.5 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300">
                        Cancelar
                      </button>
                      <button type="submit" disabled={enviando}
                        className="bg-[#2383C2] hover:bg-[#1b6aa0] text-white text-[11px] font-bold px-3 py-1.5 rounded inline-flex items-center gap-1.5 disabled:opacity-50">
                        {enviando ? <Spinner size="sm" color="#ffffff" /> : <Send size={12} />} Enviar solicitud
                      </button>
                    </div>
                  </form>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm">
        <h4 className="text-[11px] font-bold uppercase tracking-wide text-gray-600 dark:text-gray-300 mb-2">Mis solicitudes</h4>
        {cargando ? (
          <div className="flex justify-center py-3"><Spinner size="sm" /></div>
        ) : solicitudes.length === 0 ? (
          <p className="text-[11px] text-gray-400">No has enviado solicitudes.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {solicitudes.map((s) => {
              const Icono = ICONO_ESTADO[s.estado] || Clock;
              return (
                <li key={s.id} className="rounded border border-gray-200 dark:border-gray-700 p-2.5 text-[11px] text-gray-700 dark:text-gray-200 flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{etiquetaTipo(s.tipo)}</span>
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${TONO_ESTADO[s.estado] || ''}`}>
                      <Icono size={10} /> {ESTADOS_SOLICITUD[s.estado] || s.estado}
                    </span>
                  </div>
                  <span className="text-gray-500 dark:text-gray-400 break-all">"{s.valorActual || '—'}" → <strong className="text-gray-700 dark:text-gray-200">"{s.valorSolicitado}"</strong></span>
                  <span className="text-[10px] text-gray-400">{formatoFecha(s.creadoEl)}{s.resueltoPor ? ` · ${s.estado === 'cancelada' ? 'Cerrada' : 'Revisada'} por ${s.resueltoPor}` : ''}</span>
                  {s.motivoRechazo && <span className="text-[10.5px] text-red-700 dark:text-red-400">Motivo: {s.motivoRechazo}</span>}
                  {s.tipo === 'email' && s.estado === 'aprobada' && (
                    <p className="text-[10.5px] text-blue-800 dark:text-blue-300">
                      Aprobada. Pulsa "Enviar correo de confirmación" y abre el enlace que llegará a <strong>{s.valorSolicitado}</strong>; luego vuelve a iniciar sesión.
                    </p>
                  )}
                  {ESTADOS_ABIERTOS.includes(s.estado) && (
                    <div className="flex justify-end gap-2 mt-1">
                      {s.tipo === 'email' && s.estado === 'aprobada' && (
                        <button type="button" onClick={() => enviarConfirmacion(s)} disabled={ocupadoId === s.id}
                          className="text-[10.5px] font-bold px-2.5 py-1 rounded bg-[#2383C2] text-white inline-flex items-center gap-1 disabled:opacity-50">
                          <MailCheck size={11} /> Enviar correo de confirmación
                        </button>
                      )}
                      <button type="button" onClick={() => cancelar(s)} disabled={ocupadoId === s.id}
                        className="text-[10.5px] font-semibold px-2.5 py-1 rounded border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 inline-flex items-center gap-1 disabled:opacity-50">
                        <X size={11} /> Cancelar solicitud
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
};

export default DatosUsuarios;
