import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, Link } from 'react-router-dom';
import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema } from '../schemas/loginSchema';
import { signInWithCustomToken, signOut } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebaseConfig';
import { useUser } from '../context/UserContext';
import { ShieldCheck, User, Lock, Loader2, AlertCircle } from 'lucide-react';
import loginIllustration from '../assets/login.svg';
import logoMedra from '../assets/logo/medra-logo-sistema-integral-claro.svg';
import { motion } from 'framer-motion';
import PuntosAnimados from './PuntosAnimados';
import { MENSAJE_LOGIN_INCORRECTO } from '../../functions/usuarios/nombreUsuario.mjs';

// El login pasa por la Cloud Function iniciarSesion (functions/usuarios):
// acepta correo o nombre de usuario, verifica la contraseña y que el usuario
// esté activo, y devuelve un custom token del usuario. Cualquier fallo de
// credenciales llega con el mismo mensaje (no revela si el usuario existe).
const iniciarSesion = httpsCallable(functions, 'iniciarSesion');

// Mensaje según el código del error: solo los errores de credenciales se
// informan como tales (no cualquier fallo, por ejemplo uno de Firestore).
const mensajeErrorLogin = (error) => {
  switch (error?.code) {
    case 'functions/unauthenticated':
    case 'auth/user-disabled':
      return MENSAJE_LOGIN_INCORRECTO;
    case 'functions/resource-exhausted':
    case 'auth/too-many-requests':
      return "Demasiados intentos fallidos. Espera unos minutos e inténtalo de nuevo.";
    case 'functions/unavailable':
    case 'auth/network-request-failed':
      return "Sin conexión con el servidor. Revisa tu conexión a internet.";
    default:
      return "No se pudo iniciar sesión. Inténtalo nuevamente.";
  }
};

const LoginForm = () => {
  const navigate = useNavigate();
  const { userData, loading: cargandoUsuario, perfilError } = useUser();
  const [capsLockOn, setCapsLockOn] = useState(false);
  // true desde que se envía el formulario hasta que se navega o falla.
  const [loading, setLoading] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [shakeError, setShakeError] = useState(false);

  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(loginSchema)
  });

  const triggerShake = (message) => {
    setLoginError(message);
    setShakeError(false);
    requestAnimationFrame(() => setShakeError(true));
    setTimeout(() => setShakeError(false), 600);
  };

  // La sesión y el perfil los resuelve UserContext (prepara la caché de
  // Firestore y recién después lee usuarios/{uid}). Este formulario no lee
  // Firestore por su cuenta: antes lo hacía en paralelo a esa preparación y,
  // cuando la caché se reinicializaba (primer login tras cerrar sesión o
  // con otro usuario), su getDoc caía sobre la instancia terminada y fallaba.
  useEffect(() => {
    if (cargandoUsuario || !userData) return;
    navigate(userData.passwordChanged === false ? '/cambiar-password' : '/plataforma', { replace: true });
  }, [cargandoUsuario, userData, navigate]);

  // Autenticado pero sin perfil utilizable: se cierra la sesión para que el
  // próximo intento parta limpio.
  useEffect(() => {
    if (!perfilError || !auth.currentUser) return;
    const mensaje = perfilError === 'sin-perfil'
      ? "Tu usuario no tiene un perfil configurado en la base de datos."
      : "No se pudo cargar tu perfil. Inténtalo nuevamente.";
    signOut(auth)
      .catch((error) => console.error('Error al cerrar sesión:', error))
      .finally(() => {
        triggerShake(mensaje);
        setLoading(false);
      });
  }, [perfilError]);

  const onSubmit = async (data) => {
    setLoading(true);
    setLoginError('');
    try {
      const { data: { token } } = await iniciarSesion({ identificador: data.identificador, password: data.password });
      await signInWithCustomToken(auth, token);
      // Éxito: `loading` sigue en true; los efectos de arriba navegan (o
      // informan el error de perfil) cuando UserContext termina de cargar.
    } catch (error) {
      console.error('Error al iniciar sesión:', error?.code || error);
      triggerShake(mensajeErrorLogin(error));
      setLoading(false);
    }
  };

  // El autocompletado del navegador no siempre dispara onChange, y
  // react-hook-form valida con los valores que recibió por eventos. Se
  // copian los valores reales de los inputs antes de validar.
  const enviar = (e) => {
    const campos = e.currentTarget.elements;
    setValue('identificador', campos.identificador.value);
    setValue('password', campos.password.value);
    return handleSubmit(onSubmit)(e);
  };

  // Verificando una sesión existente (o redirigiendo): no hay formulario que
  // mostrar. Durante un envío se mantiene el formulario con "Validando...".
  if ((cargandoUsuario || userData) && !loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-gray-100">
        <Loader2 className="animate-spin text-[#008080]" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center fondo-puntos-login p-4">
      <div className={`bg-white rounded-3xl shadow-2xl flex w-full max-w-4xl overflow-hidden min-h-[500px] ${shakeError ? 'shake-error' : ''}`}>

        <div className="w-full md:w-1/2 p-10 flex flex-col justify-center">

          <div className="flex justify-center mb-6">
            <motion.img
              src={logoMedra}
              alt="Medra Sistema Integral"
              className="h-20 max-w-full w-auto object-contain"
              initial={{ opacity: 0, y: -16, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{
                duration: 0.6,
                ease: [0.16, 1, 0.3, 1],
              }}
            />
          </div>

          <h2 className="text-2xl font-bold mb-2">Iniciar Sesión</h2>
          <p className="text-gray-500 mb-8">Ingresa tus credenciales para acceder al sistema.</p>

          <form onSubmit={enviar} className="space-y-4" noValidate>
            <div className="relative">
              <label htmlFor="identificador" className="block text-sm font-medium mb-1">Usuario o correo</label>
              <div className="flex items-center">
                <User className="absolute ml-3 text-gray-400" size={20} />
                <input
                  {...register("identificador")}
                  id="identificador"
                  type="text"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="w-full p-3 pl-10 border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#2383C2] focus:border-[#2383C2] outline-none transition-all"
                  placeholder="Usuario o correo"
                />
              </div>
              {errors.identificador && <p className="text-red-500 text-xs mt-1">{errors.identificador.message}</p>}
            </div>

            <div className="relative">
              <label htmlFor="password" className="block text-sm font-medium mb-1">Contraseña</label>
              <div className="flex items-center">
                <Lock className="absolute ml-3 text-gray-400" size={20} />
                <input
                  {...register("password")}
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="w-full p-3 pl-10 border border-gray-200 rounded-xl focus:ring-1 focus:ring-[#2383C2] focus:border-[#2383C2] outline-none transition-all"
                  placeholder="********"
                  onKeyUp={(e) => setCapsLockOn(e.getModifierState('CapsLock'))}
                />
              </div>
              {capsLockOn && (
                <p className="text-amber-600 text-xs mt-2 flex items-center gap-1 font-semibold">
                  ⚠️ ¡La tecla Bloq Mayús está activada!
                </p>
              )}
            </div>

            {loginError && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                <AlertCircle size={16} className="shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-[#2383C2] text-white p-3 rounded-xl font-bold hover:bg-[#369BCE] transition-all duration-200 mt-4 flex items-center justify-center gap-2 disabled:opacity-70"
            >
              {loading ? (
                <>
                  <Loader2 className="animate-spin" size={20} />
                  Validando...
                </>
              ) : (
                "Ingresar →"
              )}
            </button>

            <div className="mt-6 text-center space-y-2">
              <div className="relative flex items-center justify-center">
                <div className="border-t border-gray-200 w-full absolute"></div>
                <span className="bg-white px-3 text-xs text-gray-400 relative z-10">
                  ¿Olvidaste tu contraseña?
                </span>
              </div>
              <div>
                <Link
                  to="/recuperar-password"
                  className="text-sm font-semibold text-[#2383C2] hover:underline"
                >
                  Recuperar acceso
                </Link>
              </div>
            </div>

          </form>
        </div>

        <div className="hidden md:flex w-1/2 bg-[#208DD0] p-12 text-white flex-col justify-between relative overflow-hidden">
          {/* Cuadrícula decorativa: detrás del contenido (que va en z-10) y sin recibir clics. */}
          <div aria-hidden="true" className="cuadricula-sutil cuadricula-sutil-clara absolute inset-0 z-0" />
          <div className="absolute top-0 right-0 w-64 h-64 z-0 pointer-events-none">
            <div className="absolute -top-10 -right-10 w-full h-full bg-white/5 rounded-bl-full"></div>
            <PuntosAnimados className="absolute top-6 right-6" />
          </div>

          <div className="relative z-10">
            <h2 className="text-3xl font-bold mb-4 leading-tight whitespace-nowrap">
              Gestiona tu operación
            </h2>
            <p className="text-lg opacity-90">
              Accede a las herramientas del Sistema Integral Medra desde un solo lugar.
            </p>
          </div>

          <div className="relative z-10 flex justify-center my-8">
            <img src={loginIllustration} alt="Gestión" className="w-full max-w-xs object-contain" />
          </div>

          <div className="relative z-10 bg-white/10 backdrop-blur-sm border border-white/20 p-4 rounded-2xl flex items-center gap-4">
            <div className="text-white"><ShieldCheck size={32} /></div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider">SISTEMA INTEGRAL MEDRA</p>
              <p className="font-bold">Productividad garantizada</p>
            </div>
          </div>
        </div>

      </div>

      {/* Pie de página, fuera de la tarjeta. El año se toma de la fecha actual. */}
      <footer className="mt-6 text-center text-xs leading-relaxed text-gray-500">
        <p>© {new Date().getFullYear()} Medra Sistema Integral. Todos los derechos reservados.</p>
        <p>Desarrollado por Medra.</p>
      </footer>
    </div>
  );
};

export default LoginForm;