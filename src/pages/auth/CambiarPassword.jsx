import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { updatePassword, verifyBeforeUpdateEmail } from 'firebase/auth';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../firebaseConfig';
import { useToast } from '../../context/ToastContext';
import { useUser } from '../../context/UserContext';
import Spinner from '../../components/ui/Spinner';
import PoliticasPrivacidad from '../../components/modulos/general/legales/PoliticasPrivacidad';
import TerminosServicio from '../../components/modulos/general/legales/TerminosServicio';
import {
  CheckCircle2,
  XCircle,
  User,
  AtSign,
  Mail,
  Lock,
  ShieldCheck,
  FileText,
  PartyPopper,
  ArrowRight,
  Pencil,
  X,
} from 'lucide-react';

const CambiarPassword = () => {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { setUserData } = useUser();

  // 'form' -> configurar acceso (contraseña + datos personales)
  // 'bienvenida' -> pantalla final con políticas y botón de salida
  const [paso, setPaso] = useState('form');

  const [cargandoPerfil, setCargandoPerfil] = useState(true);
  const [perfil, setPerfil] = useState({ nombreCompleto: '', nombreUsuario: '', email: '' });
  const [emailOriginal, setEmailOriginal] = useState('');
  const [passwords, setPasswords] = useState({ new: '', confirm: '' });
  const [aceptaPoliticas, setAceptaPoliticas] = useState(false);
  const [loading, setLoading] = useState(false);
  // null | 'privacidad' | 'terminos' -> controla el modal emergente
  const [modalAbierto, setModalAbierto] = useState(null);

  // Controla, por campo, si se está mostrando como texto fijo o como input
  // editable. Por defecto todo empieza en "false" (solo lectura) — el
  // usuario decide si quiere cambiar algo, no se le obliga a re-ingresarlo.
  const [editando, setEditando] = useState({
    nombreCompleto: false,
    nombreUsuario: false,
    email: false,
  });

  const toggleEditar = (campo) => {
    setEditando((prev) => ({ ...prev, [campo]: !prev[campo] }));
  };

  useEffect(() => {
    const cargarPerfil = async () => {
      const user = auth.currentUser;
      if (!user) {
        setCargandoPerfil(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'usuarios', user.uid));
        if (snap.exists()) {
          const data = snap.data();
          setPerfil({
            nombreCompleto: data.nombreCompleto || '',
            nombreUsuario: data.nombreUsuario || '',
            email: data.email || user.email || '',
          });
          setEmailOriginal(data.email || user.email || '');
        }
      } catch (error) {
        console.error('Error al cargar perfil:', error);
      } finally {
        setCargandoPerfil(false);
      }
    };
    cargarPerfil();
  }, []);

  const validations = {
    length: passwords.new.length >= 8,
    upper: /[A-Z]/.test(passwords.new),
    lower: /[a-z]/.test(passwords.new),
    number: /\d/.test(passwords.new),
  };

  const isFormValid =
    Object.values(validations).every(Boolean) &&
    passwords.new === passwords.confirm &&
    passwords.new !== '' &&
    perfil.nombreCompleto.trim() !== '' &&
    perfil.email.trim() !== '';

  const handleUpdate = async () => {
    if (!isFormValid) {
      showToast('Por favor, completa tus datos y cumple con todos los requisitos de seguridad.', 'error');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      showToast('Tu sesión expiró, vuelve a iniciar sesión.', 'error');
      navigate('/', { replace: true });
      return;
    }

    setLoading(true);
    try {
      const emailCambio = perfil.email.trim() !== emailOriginal;

      // El correo cambia recién cuando el usuario confirma el enlace que le
      // llega a la dirección nueva; usuarios/{uid}.email se actualiza al
      // entrar con el correo ya cambiado (función iniciarSesion), no antes.
      if (emailCambio) {
        await verifyBeforeUpdateEmail(user, perfil.email.trim());
      }

      await updatePassword(user, passwords.new);

      await updateDoc(doc(db, 'usuarios', user.uid), {
        nombreCompleto: perfil.nombreCompleto.trim(),
        passwordChanged: true,
      });

      // Firestore ya quedó actualizado, pero UserContext guarda userData en
      // memoria y solo se refresca en login/logout (onAuthStateChanged). Si
      // no lo actualizamos acá también, ProtectedRoute sigue viendo el
      // passwordChanged viejo y te devuelve a esta misma pantalla.
      setUserData((prev) => ({
        ...prev,
        nombreCompleto: perfil.nombreCompleto.trim(),
        passwordChanged: true,
      }));

      showToast(emailCambio
        ? 'Tu contraseña se actualizó. Te enviamos un correo de confirmación a la nueva dirección.'
        : 'Tus datos y contraseña se actualizaron correctamente', 'success');
      setPaso('bienvenida');
    } catch (error) {
      console.error('Error al actualizar acceso:', error);
      if (error.code === 'auth/requires-recent-login') {
        showToast('Tu sesión expiró, vuelve a iniciar sesión para continuar.', 'error');
        setTimeout(() => navigate('/', { replace: true }), 1500);
      } else if (error.code === 'auth/email-already-in-use') {
        showToast('Ese correo ya está en uso por otra cuenta.', 'error');
      } else if (error.code === 'auth/invalid-email') {
        showToast('El correo ingresado no es válido.', 'error');
      } else if (error.code === 'auth/weak-password') {
        showToast('La contraseña es demasiado débil.', 'error');
      } else {
        showToast('Error: ' + error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizar = () => {
    if (!aceptaPoliticas) {
      showToast('Debes leer y aceptar la Política de Privacidad para continuar.', 'error');
      return;
    }

    // Deja registro de auditoría de la aceptación (útil de cara a protección de datos).
    const user = auth.currentUser;
    if (user) {
      updateDoc(doc(db, 'usuarios', user.uid), {
        politicasAceptadasEl: serverTimestamp(),
      }).catch((err) => console.error('No se pudo registrar la aceptación de políticas:', err));
    }

    navigate('/plataforma', { replace: true });
  };

  const RequirementItem = ({ valid, text }) => (
    <div className={`flex items-center gap-2 text-xs ${valid ? 'text-green-600' : 'text-red-500'}`}>
      {valid ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      <span>{text}</span>
    </div>
  );

  // Campo que por defecto muestra el valor actual como texto fijo, con un
  // lápiz para activar edición. Solo se convierte en <input> si el usuario
  // lo pide — nunca aparece vacío invitando a llenarlo.
  const CampoPerfil = ({ campo, icon: Icon, label, tipo = 'text', placeholder, soloLectura = false }) => {
    const estaEditando = editando[campo];

    return (
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
        {estaEditando ? (
          <div className="relative flex items-center">
            <Icon className="absolute ml-3 text-gray-400" size={16} />
            <input
              type={tipo}
              autoFocus
              value={perfil[campo]}
              onChange={(e) => setPerfil({ ...perfil, [campo]: e.target.value })}
              onBlur={() => {
                // Si lo dejó vacío, no lo dejamos guardado en blanco: volvemos a modo lectura sin perder el valor.
                if (!perfil[campo].trim()) toggleEditar(campo);
              }}
              placeholder={placeholder}
              className="w-full p-2.5 pl-9 pr-14 text-sm border border-[#2383C2] rounded-lg focus:outline-none focus:ring-1 focus:ring-[#2383C2]"
            />
            <button
              type="button"
              onClick={() => toggleEditar(campo)}
              className="absolute right-2 text-[10px] font-bold text-[#2383C2] hover:underline"
            >
              Listo
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-2 p-2.5 pl-3 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-700">
            <span className="flex items-center gap-2 truncate">
              <Icon className="text-gray-400 shrink-0" size={16} />
              <span className="truncate">{perfil[campo] || '—'}</span>
            </span>
            {!soloLectura && (
              <button
                type="button"
                onClick={() => toggleEditar(campo)}
                title={`Cambiar ${label.toLowerCase()}`}
                className="text-gray-400 hover:text-[#2383C2] shrink-0 p-1"
              >
                <Pencil size={13} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  if (cargandoPerfil) {
    return (
      <div className="flex justify-center items-center h-screen bg-pattern">
        <Spinner size="md" color="#2383C2" />
      </div>
    );
  }

  return (
    <div className="flex justify-center items-center min-h-screen bg-pattern p-4">
      {paso === 'form' ? (
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100">
          <h2 className="text-xl font-bold mb-2 text-[#2383C2]">Configura tu acceso</h2>
          <p className="text-sm text-gray-600 mb-6">
            Es tu primer ingreso. Estos son tus datos — cámbialos solo si quieres, y define una nueva contraseña segura.
          </p>

          <div className="space-y-3 mb-5">
            <CampoPerfil campo="nombreCompleto" icon={User} label="Nombre completo" placeholder="Ej: Juana Pérez Soto" />
            {/* Solo lectura: es único y lo asigna un administrador (Administración → Usuarios). */}
            <CampoPerfil campo="nombreUsuario" icon={AtSign} label="Nombre de usuario" soloLectura />
            <CampoPerfil campo="email" icon={Mail} label="Correo" tipo="email" placeholder="ejemplo@medra.cl" />
          </div>

          <div className="border-t border-gray-100 pt-4">
            <div className="relative flex items-center mb-3">
              <Lock className="absolute ml-3 text-gray-400" size={16} />
              <input
                type="password"
                placeholder="Nueva contraseña"
                value={passwords.new}
                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                className="w-full p-2.5 pl-9 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-[#2383C2] focus:ring-1 focus:ring-[#2383C2]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <RequirementItem valid={validations.length} text="Mínimo 8 caracteres" />
              <RequirementItem valid={validations.upper} text="Una mayúscula" />
              <RequirementItem valid={validations.lower} text="Una minúscula" />
              <RequirementItem valid={validations.number} text="Un número" />
            </div>

            <div className="relative flex items-center mb-5">
              <Lock className="absolute ml-3 text-gray-400" size={16} />
              <input
                type="password"
                placeholder="Confirmar contraseña"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                className={`w-full p-2.5 pl-9 text-sm border rounded-lg focus:outline-none focus:ring-1 ${
                  passwords.confirm && passwords.new !== passwords.confirm
                    ? 'border-red-400 focus:border-red-400 focus:ring-red-400'
                    : 'border-gray-200 focus:border-[#2383C2] focus:ring-[#2383C2]'
                }`}
              />
            </div>
          </div>

          <button
            onClick={handleUpdate}
            disabled={loading || !isFormValid}
            className="w-full bg-[#2383C2] text-white p-3 rounded-lg font-bold hover:bg-[#369BCE] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Spinner size="sm" color="#ffffff" />
                Guardando...
              </>
            ) : (
              'Guardar Contraseña'
            )}
          </button>
        </div>
      ) : (
        <div className="bg-white p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-100 text-center">
          <div className="w-14 h-14 rounded-full bg-[#2383C2]/10 flex items-center justify-center mx-auto mb-4">
            <PartyPopper className="text-[#2383C2]" size={26} />
          </div>

          <h2 className="text-xl font-bold text-gray-800 mb-1">
            ¡Bienvenido{perfil.nombreCompleto ? `, ${perfil.nombreCompleto.split(' ')[0]}` : ''}!
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Tu cuenta ya está lista. Antes de continuar, revisa lo siguiente.
          </p>

          <div className="flex flex-col gap-2 mb-5 text-left">
            <button
              type="button"
              onClick={() => setModalAbierto('privacidad')}
              className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200 rounded-lg p-2.5 hover:border-[#2383C2] hover:text-[#2383C2] transition"
            >
              <ShieldCheck size={16} />
              Política de Privacidad
            </button>
            <button
              type="button"
              onClick={() => setModalAbierto('terminos')}
              className="flex items-center gap-2 text-sm text-gray-700 border border-gray-200 rounded-lg p-2.5 hover:border-[#2383C2] hover:text-[#2383C2] transition"
            >
              <FileText size={16} />
              Términos de Servicio
            </button>
          </div>

          <label className="flex items-start gap-2 text-left text-xs text-gray-600 mb-5 cursor-pointer">
            <input
              type="checkbox"
              checked={aceptaPoliticas}
              onChange={(e) => setAceptaPoliticas(e.target.checked)}
              className="mt-0.5 accent-[#2383C2]"
            />
            <span>
              He leído y acepto la Política de Privacidad y los Términos de Servicio
              del Sistema Integral Medra.
            </span>
          </label>

          <button
            onClick={handleFinalizar}
            disabled={!aceptaPoliticas}
            className="w-full bg-[#2383C2] text-white p-3 rounded-lg font-bold hover:bg-[#369BCE] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            Finalizar
            <ArrowRight size={16} />
          </button>
        </div>
      )}

      {/* --- MODAL: Política de Privacidad / Términos de Servicio --- */}
      {modalAbierto && (
        <div
          className="fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] flex items-center justify-center p-4"
          onClick={() => setModalAbierto(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                {modalAbierto === 'privacidad' ? (
                  <>
                    <ShieldCheck size={16} className="text-[#2383C2]" />
                    Política de Privacidad
                  </>
                ) : (
                  <>
                    <FileText size={16} className="text-[#2383C2]" />
                    Términos de Servicio
                  </>
                )}
              </h3>
              <button
                onClick={() => setModalAbierto(null)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="overflow-y-auto p-5">
              {modalAbierto === 'privacidad' ? <PoliticasPrivacidad /> : <TerminosServicio />}
            </div>

            <div className="px-5 py-3 border-t border-gray-100 flex justify-end shrink-0">
              <button
                onClick={() => setModalAbierto(null)}
                className="px-4 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-lg text-xs font-bold transition"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CambiarPassword;