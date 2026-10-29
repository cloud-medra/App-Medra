// Abre un PDF generado en el navegador en una pestaña nueva (para verlo,
// imprimirlo o descargarlo) en vez de descargarlo directo.
//
//   const visor = abrirVisorPdf('Contenido · Caja de tutores'); // DENTRO del clic, antes de cualquier await
//   const doc = await generar();                                 // jsPDF
//   visor.mostrar(doc, 'caja_Caja_de_tutores_2026-10-29.pdf');
//
// - La pestaña se abre en el mismo gesto del clic (si se abre después de
//   un await, el bloqueador de ventanas emergentes la frena) y muestra
//   "Generando…" hasta que llega el PDF.
// - La página de la pestaña tiene el título del documento (no el id del
//   blob) y un botón "Descargar" con un nombre de archivo legible.
// - La URL del blob se crea con el Blob/URL de la pestaña nueva: vive lo
//   mismo que ella (no hay que liberarla ni se pierde si se cierra Medra).
// - Si el navegador bloquea la pestaña, `mostrar` descarga el archivo.

const ESTILOS = `
  html, body { margin: 0; height: 100%; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; background: #525659; }
  body { display: flex; flex-direction: column; }
  .barra { display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: #2383C2; color: #fff; font-size: 13px; }
  .barra strong { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .barra a { color: #2383C2; background: #fff; border-radius: 4px; padding: 5px 12px; font-weight: 700; text-decoration: none; white-space: nowrap; }
  iframe { flex: 1; width: 100%; border: 0; }
  .estado { margin: auto; color: #f3f4f6; font-size: 14px; text-align: center; padding: 16px; }
`;

const escapar = (texto) => String(texto ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const pagina = (titulo, cuerpo) => `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapar(titulo)}</title><style>${ESTILOS}</style></head><body>${cuerpo}</body></html>`;

export const abrirVisorPdf = (titulo) => {
  const ventana = window.open('', '_blank');
  if (ventana) {
    ventana.document.write(pagina(titulo, '<p class="estado">Generando PDF…</p>'));
    ventana.document.close();
  }
  return {
    mostrar: (doc, nombre) => {
      if (!ventana || ventana.closed) { doc.save(nombre); return; }
      const url = ventana.URL.createObjectURL(new ventana.Blob([doc.output('arraybuffer')], { type: 'application/pdf' }));
      ventana.document.open();
      ventana.document.write(pagina(titulo, `
        <div class="barra"><strong>${escapar(titulo)}</strong><a href="${url}" download="${escapar(nombre)}">Descargar</a></div>
        <iframe src="${url}" title="${escapar(titulo)}"></iframe>`));
      ventana.document.close();
    },
    // Si la generación falla: se cierra la pestaña (el error lo avisa quien llama).
    cerrar: () => { if (ventana && !ventana.closed) ventana.close(); },
  };
};
