// Copia texto al portapapeles. navigator.clipboard solo existe en contextos
// seguros (https o localhost) y puede rechazar por permisos: en ese caso se
// usa el método antiguo (textarea oculto + execCommand('copy')).
// Devuelve true si se copió.
export const copiarAlPortapapeles = async (texto) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // Sigue con el método antiguo.
  }
  try {
    const area = document.createElement('textarea');
    area.value = texto;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(area);
    return ok;
  } catch {
    return false;
  }
};
