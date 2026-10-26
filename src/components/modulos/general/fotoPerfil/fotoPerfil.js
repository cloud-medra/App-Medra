import { doc, updateDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '../../../../firebaseConfig';

// Foto de perfil opcional del usuario.
// - Storage: fotos_perfil/{uid}/foto_<marca>.<ext> (una por usuario; al
//   cambiarla o quitarla se borra la anterior). storage.rules: solo el dueño
//   sube, reemplaza o borra, solo imágenes y con tope de tamaño.
// - Firestore: fotoPerfilUrl y fotoPerfilPath en usuarios/{uid}, el
//   documento que UserContext ya escucha al iniciar sesión: mostrar la foto
//   no cuesta lecturas.

export const TIPOS_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
export const TAMANO_MAXIMO_ORIGINAL_MB = 10;
export const LADO_FOTO_PX = 256;
// Tope de la imagen ya procesada (también en storage.rules).
export const TAMANO_MAXIMO_SUBIDA_BYTES = 1024 * 1024;

// Mensaje si el archivo elegido no sirve, o null.
export const validarArchivoFoto = (archivo) => {
  if (!archivo) return 'No se eligió ninguna imagen.';
  if (!TIPOS_FOTO.includes(archivo.type)) return 'Formato no permitido. Usa una imagen JPG, PNG o WebP.';
  if (archivo.size > TAMANO_MAXIMO_ORIGINAL_MB * 1024 * 1024) {
    return `La imagen pesa más de ${TAMANO_MAXIMO_ORIGINAL_MB} MB. Elige una más liviana.`;
  }
  return null;
};

// Recorte cuadrado: dado el tamaño de la imagen, el zoom (1 = el lado menor
// llena el cuadro) y el desplazamiento (-1..1 en cada eje, 0 = centrado),
// devuelve la zona de la imagen original a recortar { x, y, lado }.
export const calcularRecorte = ({ ancho, alto }, zoom = 1, desplazamiento = { x: 0, y: 0 }) => {
  const lado = Math.min(ancho, alto) / Math.max(1, zoom);
  const margenX = (ancho - lado) / 2;
  const margenY = (alto - lado) / 2;
  const limitar = (v) => Math.max(-1, Math.min(1, v || 0));
  return {
    x: margenX + limitar(desplazamiento.x) * margenX,
    y: margenY + limitar(desplazamiento.y) * margenY,
    lado
  };
};

const cargarImagen = (archivo) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(archivo);
  const img = new Image();
  img.onload = () => resolve({ img, url });
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No se pudo leer la imagen.')); };
  img.src = url;
});
export { cargarImagen };

// Recorta, redimensiona a LADO_FOTO_PX y comprime en el navegador. WebP si
// el navegador lo soporta; si no, JPEG. Devuelve un Blob.
export const procesarFoto = async (img, recorte, lado = LADO_FOTO_PX) => {
  const canvas = document.createElement('canvas');
  canvas.width = lado;
  canvas.height = lado;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, recorte.x, recorte.y, recorte.lado, recorte.lado, 0, 0, lado, lado);
  const aBlob = (tipo, calidad) => new Promise((resolve) => canvas.toBlob(resolve, tipo, calidad));
  let blob = await aBlob('image/webp', 0.85);
  if (!blob || blob.type !== 'image/webp') blob = await aBlob('image/jpeg', 0.85);
  if (!blob) throw new Error('No se pudo procesar la imagen.');
  return blob;
};

const borrarSiExiste = async (ruta) => {
  if (!ruta) return;
  try {
    await deleteObject(ref(storage, ruta));
  } catch (error) {
    // Ya no existe: no hay nada que limpiar.
    if (error?.code !== 'storage/object-not-found') console.error('No se pudo borrar la foto anterior:', error);
  }
};

// Sube la foto nueva, la guarda en el usuario y borra la anterior.
export const guardarFotoPerfil = async (uid, blob, rutaAnterior) => {
  if (blob.size > TAMANO_MAXIMO_SUBIDA_BYTES) throw new Error('La imagen procesada sigue siendo muy pesada.');
  const extension = blob.type === 'image/webp' ? 'webp' : 'jpg';
  const ruta = `fotos_perfil/${uid}/foto_${Date.now()}.${extension}`;
  const archivoRef = ref(storage, ruta);
  await uploadBytes(archivoRef, blob, { contentType: blob.type, cacheControl: 'public, max-age=31536000' });
  const url = await getDownloadURL(archivoRef);
  await updateDoc(doc(db, 'usuarios', uid), { fotoPerfilUrl: url, fotoPerfilPath: ruta });
  if (rutaAnterior && rutaAnterior !== ruta) await borrarSiExiste(rutaAnterior);
  return { url, ruta };
};

// Quita la foto: vuelven las iniciales.
export const quitarFotoPerfil = async (uid, rutaAnterior) => {
  await updateDoc(doc(db, 'usuarios', uid), { fotoPerfilUrl: null, fotoPerfilPath: null });
  await borrarSiExiste(rutaAnterior);
};
