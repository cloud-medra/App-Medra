import React, { useState } from 'react';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import { doc, updateDoc } from 'firebase/firestore';
import { auth, db } from '../../../../../firebaseConfig';
import { useToast } from '../../../../../context/ToastContext';
import Spinner from '../../../../ui/Spinner';
import { Shield, Lock, CheckCircle2, XCircle, KeyRound } from 'lucide-react';
import { camposCambioPassword } from './fechaCambioPassword';

const CambiarPasswordAjustes = () => {
  const { showToast } = useToast();

  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });
  const [loading, setLoading] = useState(false);

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
    passwords.current !== '' &&
    passwords.new !== passwords.current;

  const resetForm = () => setPasswords({ current: '', new: '', confirm: '' });

  const handleUpdate = async () => {
    if (!passwords.current) {
      showToast('Ingresa tu contraseña actual.', 'error');
      return;
    }
    if (passwords.new === passwords.current) {
      showToast('La nueva contraseña debe ser distinta a la actual.', 'error');
      return;
    }
    if (!isFormValid) {
      showToast('Por favor, cumple con todos los requisitos de seguridad.', 'error');
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      showToast('Tu sesión expiró, vuelve a iniciar sesión.', 'error');
      return;
    }

    setLoading(true);
    try {
      // Reautenticamos con la contraseña actual antes de cambiarla: es una
      // operación sensible y Firebase puede exigir sesión "reciente"
      // (auth/requires-recent-login) si ya llevas rato logueado.
      const credential = EmailAuthProvider.credential(user.email, passwords.current);
      await reauthenticateWithCredential(user, credential);

      await updatePassword(user, passwords.new);

      // La contraseña ya cambió: si falla guardar la fecha, se avisa solo de eso.
      try {
        await updateDoc(doc(db, 'usuarios', user.uid), camposCambioPassword());
        showToast('Contraseña actualizada correctamente', 'success');
      } catch (errorFecha) {
        console.error('No se pudo guardar la fecha del cambio de contraseña:', errorFecha);
        showToast('Contraseña actualizada, pero no se pudo guardar la fecha del cambio.', 'warning');
      }
      resetForm();
    } catch (error) {
      console.error('Error al cambiar contraseña:', error);
      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        showToast('La contraseña actual ingresada es incorrecta.', 'error');
      } else if (error.code === 'auth/weak-password') {
        showToast('La nueva contraseña es demasiado débil.', 'error');
      } else if (error.code === 'auth/too-many-requests') {
        showToast('Demasiados intentos. Espera un momento e inténtalo de nuevo.', 'error');
      } else if (error.code === 'auth/requires-recent-login') {
        showToast('Por seguridad, vuelve a iniciar sesión e inténtalo de nuevo.', 'error');
      } else {
        showToast('Error: ' + error.message, 'error');
      }
    } finally {
      setLoading(false);
    }
  };

  const RequirementItem = ({ valid, text }) => (
    <div className={`flex items-center gap-2 text-normal ${valid ? 'text-green-600' : 'text-red-500'}`}>
      {valid ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
      <span>{text}</span>
    </div>
  );

  return (
    <div className="w-full max-w-lg">
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 shadow-sm flex flex-col gap-4">
        <div className="border-b border-gray-100 dark:border-gray-700 pb-2">
          <h3 className="text-titulo-seccion text-tinta-principal flex items-center gap-2">
            <Shield size={16} className="text-[#2383C2]" />
            Cambiar contraseña
          </h3>
          <p className="text-secundario text-tinta-secundaria">
            Por tu seguridad, confirma tu contraseña actual antes de definir una nueva.
          </p>
        </div>

        <div className="flex flex-col gap-3">
          <div>
            <label className="block text-etiqueta text-tinta-secundaria mb-1">
              Contraseña actual
            </label>
            <div className="relative flex items-center">
              <Lock className="absolute ml-2 text-gray-400" size={14} />
              <input
                type="password"
                value={passwords.current}
                onChange={(e) => setPasswords({ ...passwords, current: e.target.value })}
                placeholder="********"
                className="w-full text-normal p-2 pl-7 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-tinta-principal focus:outline-none focus:border-[#2383C2]"
              />
            </div>
          </div>

          <div className="border-t border-gray-100 dark:border-gray-700 pt-3">
            <label className="block text-etiqueta text-tinta-secundaria mb-1">
              Nueva contraseña
            </label>
            <div className="relative flex items-center mb-2">
              <KeyRound className="absolute ml-2 text-gray-400" size={14} />
              <input
                type="password"
                value={passwords.new}
                onChange={(e) => setPasswords({ ...passwords, new: e.target.value })}
                placeholder="Mínimo 8 caracteres"
                className="w-full text-normal p-2 pl-7 rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-tinta-principal focus:outline-none focus:border-[#2383C2]"
              />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <RequirementItem valid={validations.length} text="Mínimo 8 caracteres" />
              <RequirementItem valid={validations.upper} text="Una mayúscula" />
              <RequirementItem valid={validations.lower} text="Una minúscula" />
              <RequirementItem valid={validations.number} text="Un número" />
            </div>

            <label className="block text-etiqueta text-tinta-secundaria mb-1">
              Confirmar nueva contraseña
            </label>
            <div className="relative flex items-center">
              <KeyRound className="absolute ml-2 text-gray-400" size={14} />
              <input
                type="password"
                value={passwords.confirm}
                onChange={(e) => setPasswords({ ...passwords, confirm: e.target.value })}
                placeholder="********"
                className={`w-full text-normal p-2 pl-7 rounded border focus:outline-none ${
                  passwords.confirm && passwords.new !== passwords.confirm
                    ? 'border-red-400 focus:border-red-400'
                    : 'border-gray-200 dark:border-gray-700 focus:border-[#2383C2]'
                } bg-gray-50 dark:bg-gray-900 text-tinta-principal`}
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            onClick={handleUpdate}
            disabled={loading || !isFormValid}
            className="bg-[#2383C2] hover:bg-[#1b6aa0] text-white text-etiqueta px-4 py-2 rounded flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed min-w-[160px] justify-center"
          >
            {loading ? (
              <>
                <Spinner size="sm" color="#ffffff" />
                <span>Actualizando...</span>
              </>
            ) : (
              <>
                <Shield size={13} />
                <span>Guardar Contraseña</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default CambiarPasswordAjustes;