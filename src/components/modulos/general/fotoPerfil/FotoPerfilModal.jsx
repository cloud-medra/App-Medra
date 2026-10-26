import React, { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, Loader2, Trash2, X, ZoomIn } from 'lucide-react';
import AvatarUsuario from '../../../ui/AvatarUsuario';
import { useToast } from '../../../../context/ToastContext';
import {
  TIPOS_FOTO, validarArchivoFoto, calcularRecorte, cargarImagen, procesarFoto, guardarFotoPerfil, quitarFotoPerfil
} from './fotoPerfil';

const LADO_VISOR = 240;

// Dibuja el recorte actual en un canvas cuadrado (visor y vistas previas).
const dibujar = (canvas, img, recorte) => {
  if (!canvas || !img) return;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, recorte.x, recorte.y, recorte.lado, recorte.lado, 0, 0, canvas.width, canvas.height);
};

// Foto de perfil (menú del usuario): subir, cambiar o quitar. La imagen se
// recorta en cuadrado (arrastrar para encuadrar, zoom con el control), se
// ve cómo queda en el círculo y se redimensiona/comprime antes de subirla.
const FotoPerfilModal = ({ abierto, onCerrar, userData }) => {
  const { showToast } = useToast();
  const inputRef = useRef(null);
  const visorRef = useRef(null);
  const previaGrandeRef = useRef(null);
  const previaChicaRef = useRef(null);
  const arrastre = useRef(null);

  const [imagen, setImagen] = useState(null); // { img, url, ancho, alto }
  const [zoom, setZoom] = useState(1);
  const [desplazamiento, setDesplazamiento] = useState({ x: 0, y: 0 });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const tieneFoto = Boolean(userData?.fotoPerfilUrl);
  const recorte = imagen ? calcularRecorte({ ancho: imagen.ancho, alto: imagen.alto }, zoom, desplazamiento) : null;

  useEffect(() => {
    if (!imagen || !recorte) return;
    dibujar(visorRef.current, imagen.img, recorte);
    dibujar(previaGrandeRef.current, imagen.img, recorte);
    dibujar(previaChicaRef.current, imagen.img, recorte);
  });

  // Libera la URL temporal de la imagen al cambiarla o cerrar.
  useEffect(() => () => { if (imagen?.url) URL.revokeObjectURL(imagen.url); }, [imagen]);

  useEffect(() => {
    if (!abierto) {
      setImagen(null);
      setZoom(1);
      setDesplazamiento({ x: 0, y: 0 });
      setError(null);
      return undefined;
    }
    const alTeclear = (e) => { if (e.key === 'Escape' && !guardando) onCerrar(); };
    document.addEventListener('keydown', alTeclear);
    return () => document.removeEventListener('keydown', alTeclear);
  }, [abierto, guardando, onCerrar]);

  if (!abierto) return null;

  const elegirArchivo = async (archivo) => {
    const problema = validarArchivoFoto(archivo);
    if (problema) {
      setError(problema);
      return;
    }
    try {
      const { img, url } = await cargarImagen(archivo);
      setImagen({ img, url, ancho: img.naturalWidth, alto: img.naturalHeight });
      setZoom(1);
      setDesplazamiento({ x: 0, y: 0 });
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  };

  // Arrastrar: la imagen sigue al puntero (el recorte se mueve al revés).
  const alBajar = (e) => {
    if (!recorte) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    arrastre.current = { x: e.clientX, y: e.clientY, inicio: desplazamiento };
  };
  const alMover = (e) => {
    if (!arrastre.current || !imagen) return;
    const escala = recorte.lado / LADO_VISOR;
    const margenX = (imagen.ancho - recorte.lado) / 2;
    const margenY = (imagen.alto - recorte.lado) / 2;
    const dx = (e.clientX - arrastre.current.x) * escala;
    const dy = (e.clientY - arrastre.current.y) * escala;
    setDesplazamiento({
      x: margenX > 0 ? Math.max(-1, Math.min(1, arrastre.current.inicio.x - dx / margenX)) : 0,
      y: margenY > 0 ? Math.max(-1, Math.min(1, arrastre.current.inicio.y - dy / margenY)) : 0
    });
  };
  const alSoltar = () => { arrastre.current = null; };

  const guardar = async () => {
    if (!imagen || !userData?.uid) return;
    setGuardando(true);
    try {
      const blob = await procesarFoto(imagen.img, recorte);
      await guardarFotoPerfil(userData.uid, blob, userData.fotoPerfilPath);
      showToast('Foto de perfil actualizada', 'success');
      onCerrar();
    } catch (e) {
      console.error('Error al guardar la foto de perfil:', e);
      showToast('No se pudo guardar la foto: ' + e.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async () => {
    if (!userData?.uid) return;
    setGuardando(true);
    try {
      await quitarFotoPerfil(userData.uid, userData.fotoPerfilPath);
      showToast('Foto de perfil quitada', 'info');
      onCerrar();
    } catch (e) {
      console.error('Error al quitar la foto de perfil:', e);
      showToast('No se pudo quitar la foto: ' + e.message, 'error');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Foto de perfil">
      <div className="absolute inset-0 bg-slate-900/40" onClick={() => !guardando && onCerrar()} />
      <div className="relative w-full max-w-md bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-slate-200 dark:border-gray-700 overflow-hidden">
        <header className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-gray-700">
          <h2 className="flex items-center gap-2 text-[14px] font-semibold text-slate-900 dark:text-gray-50">
            <Camera size={16} className="text-[#2383C2]" /> Foto de perfil
          </h2>
          <button type="button" onClick={onCerrar} disabled={guardando} title="Cerrar" className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-gray-800">
            <X size={16} />
          </button>
        </header>

        <div className="p-5 space-y-4">
          <input
            ref={inputRef}
            type="file"
            accept={TIPOS_FOTO.join(',')}
            className="hidden"
            onChange={(e) => { elegirArchivo(e.target.files?.[0]); e.target.value = ''; }}
          />

          {imagen ? (
            <>
              <div className="flex items-start gap-4">
                <div
                  className="relative shrink-0 rounded-lg overflow-hidden bg-slate-100 dark:bg-gray-800 cursor-move touch-none"
                  style={{ width: LADO_VISOR, height: LADO_VISOR }}
                  onPointerDown={alBajar}
                  onPointerMove={alMover}
                  onPointerUp={alSoltar}
                  onPointerCancel={alSoltar}
                  title="Arrastra para encuadrar"
                >
                  <canvas ref={visorRef} width={LADO_VISOR} height={LADO_VISOR} className="block" />
                  {/* Máscara: fuera del círculo se oscurece (lo que no se verá en el avatar). */}
                  <div className="pointer-events-none absolute inset-0 rounded-full shadow-[0_0_0_999px_rgba(15,23,42,0.45)]" />
                </div>
                <div className="flex flex-col items-center gap-3 pt-2">
                  <span className="text-[11px] text-slate-500 dark:text-gray-400">Vista previa</span>
                  <canvas ref={previaGrandeRef} width={96} height={96} className="w-24 h-24 rounded-full ring-2 ring-slate-200 dark:ring-gray-700" />
                  <canvas ref={previaChicaRef} width={36} height={36} className="w-9 h-9 rounded-full shadow-md" title="Así se verá en el encabezado" />
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] text-slate-600 dark:text-gray-300">
                <ZoomIn size={14} />
                <input type="range" min="1" max="3" step="0.01" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="flex-1 accent-[#2383C2]" aria-label="Zoom" />
              </label>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <AvatarUsuario nombre={userData?.nombreCompleto} fotoUrl={userData?.fotoPerfilUrl} className="w-24 h-24 text-3xl font-bold bg-[#2383C2] text-white" porDefecto="U" />
              <div className="text-[12px] text-slate-500 dark:text-gray-400 space-y-1">
                <p>{tieneFoto ? 'Tienes una foto de perfil.' : 'Sin foto: se muestran tus iniciales.'}</p>
                <p>JPG, PNG o WebP, hasta 10 MB. Se recorta en cuadrado y se reduce a 256 × 256 px antes de subirla.</p>
              </div>
            </div>
          )}

          {error && <p className="text-[12px] text-red-600 dark:text-red-400" role="alert">{error}</p>}
        </div>

        <footer className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-gray-700 bg-slate-50 dark:bg-gray-900/80">
          {tieneFoto && !imagen ? (
            <button type="button" onClick={quitar} disabled={guardando} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 dark:border-gray-700 text-[12px] font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 disabled:opacity-50">
              <Trash2 size={14} /> Quitar foto
            </button>
          ) : <span />}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => inputRef.current?.click()} disabled={guardando} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-slate-300 dark:border-gray-700 text-[12px] font-medium text-slate-700 dark:text-gray-200 hover:bg-white dark:hover:bg-gray-800 disabled:opacity-50">
              <ImagePlus size={14} /> {imagen ? 'Elegir otra' : tieneFoto ? 'Cambiar foto' : 'Subir foto'}
            </button>
            {imagen && (
              <button type="button" onClick={guardar} disabled={guardando} className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#2383C2] hover:bg-[#1d6fa6] text-white text-[12px] font-medium disabled:opacity-50">
                {guardando && <Loader2 size={14} className="animate-spin" />} Guardar foto
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};

export default FotoPerfilModal;
