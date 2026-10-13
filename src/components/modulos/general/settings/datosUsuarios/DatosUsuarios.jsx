import React, { useState } from 'react';
import { verifyBeforeUpdateEmail } from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { db, auth } from '../../../../../firebaseConfig';
import { useToast } from '../../../../../context/ToastContext';
import { useUser } from '../../../../../context/UserContext';
import Spinner from '../../../../ui/Spinner';
import { UserCircle, User, AtSign, Mail, Pencil, Save } from 'lucide-react';

const DatosUsuarios = () => {
  const { showToast } = useToast();
  const { userData, setUserData } = useUser();

  const valoresIniciales = {
    nombreCompleto: userData?.nombreCompleto || '',
    nombreUsuario: userData?.nombreUsuario || '',
    email: userData?.email || auth.currentUser?.email || '',
  };

  const [perfil, setPerfil] = useState(valoresIniciales);
  const [original, setOriginal] = useState(valoresIniciales);
  const [loading, setLoading] = useState(false);
  // Correo nuevo a la espera de que el usuario lo confirme desde su bandeja.
  const [emailPendiente, setEmailPendiente] = useState(null);

  // Igual que en CambiarPassword: cada campo empieza en solo lectura, mostrando
  // el dato real. Solo se vuelve input si el usuario hace clic en el lápiz.
  const [editando, setEditando] = useState({
    nombreCompleto: false,
    nombreUsuario: false,
    email: false,
  });

  const toggleEditar = (campo) => {
    setEditando((prev) => ({ ...prev, [campo]: !prev[campo] }));
  };

  const hayCambios =
    perfil.nombreCompleto.trim() !== original.nombreCompleto ||
    perfil.email.trim() !== original.email;

  const isFormValid =
    perfil.nombreCompleto.trim() !== '' &&
    perfil.email.trim() !== '';

  const handleGuardar = async () => {
    if (!isFormValid) {
      showToast('Ningún campo puede quedar vacío.', 'error');
      return;
    }
    if (!hayCambios) {
      showToast('No hay cambios que guardar.', 'info');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      showToast('Tu sesión expiró. Vuelve a iniciar sesión.', 'error');
      return;
    }

    setLoading(true);
    try {
      const emailNuevo = perfil.email.trim();
      const emailCambio = emailNuevo !== original.email;

      // El correo cambia recién cuando el usuario confirma el enlace que le
      // llega a la dirección nueva (requisito con la protección contra
      // enumeración de correos). usuarios/{uid}.email se actualiza al entrar
      // con el correo ya cambiado (función iniciarSesion), no antes.
      if (emailCambio) {
        await verifyBeforeUpdateEmail(user, emailNuevo);
      }

      const nombreCompleto = perfil.nombreCompleto.trim();
      if (nombreCompleto !== original.nombreCompleto) {
        await updateDoc(doc(db, 'usuarios', user.uid), { nombreCompleto });
        // Mismo detalle que en CambiarPassword: hay que sincronizar el
        // UserContext en memoria, si no el resto de la app (ej. el saludo del
        // header, el avatar) sigue mostrando los datos viejos hasta el próximo
        // login.
        setUserData((prev) => ({ ...prev, nombreCompleto }));
      }

      setOriginal((prev) => ({ ...prev, nombreCompleto }));
      setPerfil((prev) => ({ ...prev, nombreCompleto, email: original.email }));
      setEditando({ nombreCompleto: false, nombreUsuario: false, email: false });

      if (emailCambio) {
        setEmailPendiente(emailNuevo);
        showToast('Te enviamos un correo de confirmación a la nueva dirección.', 'success');
      } else {
        showToast('Tus datos se actualizaron correctamente', 'success');
      }
    } catch (error) {
      console.error('Error al actualizar datos:', error);
      if (error.code === 'auth/requires-recent-login') {
        showToast('Por seguridad, debes volver a iniciar sesión para cambiar tu correo.', 'error');
      } else if (error.code === 'auth/email-already-in-use') {
        showToast('Ese correo ya está en uso por otra cuenta.', 'error');
      } else if (error.code === 'auth/invalid-email') {
        showToast('El correo ingresado no es válido.', 'error');
      } else {
        showToast('Error: ' + error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const CampoPerfil = ({ campo, icon: Icon, label, tipo = 'text', placeholder, soloLectura = false }) => {
    const estaEditando = editando[campo];

    return (
      <div>
        <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-300 mb-1">
          {label}
        </label>
        {estaEditando ? (
          <div className="relative flex items-center">
            <Icon className="absolute ml-2 text-gray-400" size={14} />
            <input
              type={tipo}
              autoFocus
              value={perfil[campo]}
              onChange={(e) => setPerfil({ ...perfil, [campo]: e.target.value })}
              onBlur={() => {
                if (!perfil[campo].trim()) {
                  setPerfil((prev) => ({ ...prev, [campo]: original[campo] }));
                  toggleEditar(campo);
                }
              }}
              placeholder={placeholder}
              className="w-full text-xs p-2 pl-7 pr-12 rounded border border-[#2383C2] bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200 focus:outline-none focus:ring-1 focus:ring-[#2383C2]"
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
          <div className="flex items-center justify-between gap-2 text-xs p-2 pl-2.5 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-200">
            <span className="flex items-center gap-2 truncate">
              <Icon className="text-gray-400 shrink-0" size={14} />
              <span className="truncate">{perfil[campo] || '—'}</span>
            </span>
            {!soloLectura && (
              <button
                type="button"
                onClick={() => toggleEditar(campo)}
                title={`Cambiar ${label.toLowerCase()}`}
                className="text-gray-400 hover:text-[#2383C2] shrink-0 p-1"
              >
                <Pencil size={12} />
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="w-full max-w-lg">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col gap-4">
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-100 uppercase tracking-wide flex items-center gap-2">
            <UserCircle size={16} className="text-[#2383C2]" />
            Datos Personales
          </h3>
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Estos son tus datos. Haz clic en el lápiz de un campo si quieres cambiarlo.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <CampoPerfil campo="nombreCompleto" icon={User} label="Nombre completo" placeholder="Ej: Juana Pérez Soto" />
          {/* Solo lectura: es único y lo asigna un administrador (Administración → Usuarios). */}
          <CampoPerfil campo="nombreUsuario" icon={AtSign} label="Nombre de usuario" soloLectura />
          <CampoPerfil campo="email" icon={Mail} label="Correo" tipo="email" placeholder="ejemplo@medra.cl" />
          {emailPendiente && (
            <p role="status" className="text-[11px] text-amber-700 dark:text-amber-400">
              Te enviamos un correo de confirmación a la nueva dirección. El cambio a <strong>{emailPendiente}</strong> se aplicará cuando lo confirmes.
            </p>
          )}
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleGuardar}
            disabled={loading || !hayCambios || !isFormValid}
            className="bg-[#2383C2] hover:bg-[#1b6aa0] text-white text-xs font-bold px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[140px] justify-center"
          >
            {loading ? (
              <>
                <Spinner size="sm" color="#ffffff" />
                <span>Guardando...</span>
              </>
            ) : (
              <>
                <Save size={13} />
                <span>Guardar cambios</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DatosUsuarios;