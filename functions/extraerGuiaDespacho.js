const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { initializeApp, getApps } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { exigirInterno } = require('./permisos/interno');

if (!getApps().length) initializeApp();

const GEMINI_API_KEY = defineSecret('GEMINI_API_KEY');
const MODELO_GEMINI = 'gemini-3.1-flash-lite';

const PROMPT_EXTRACCION = `Eres un sistema de extracción de datos para inventario médico/farmacéutico.

Te voy a mostrar una guía de despacho (documento chileno tipo "Guía de Despacho Electrónica"), ya sea como foto o como PDF escaneado.

Debes extraer DOS cosas:

1) LOS DATOS DE CABECERA de la guía (objeto "cabecera"):
   - "fechaEmision": la fecha que aparece junto a la etiqueta "Emisión:" o "Emision:" (fecha de emisión del documento, NO la de vencimiento). Normalízala SIEMPRE al formato AAAA-MM-DD (año-mes-día). Ejemplo: si en el documento dice "Emision: 27/08/2026", debes devolver "2026-08-27".
   - "numeroGuia": el número que aparece en el recuadro que dice "GUIA DE DESPACHO ELECTRONICA" junto a la etiqueta "Folio:" (es el folio de la guía, normalmente un número de varios dígitos, ej. "814761"). NO lo confundas con "Folio Referencia".
   - "numeroDocumento": el número que aparece junto a la etiqueta "Folio Referencia" (suele ser un número más largo, ej. "1479810199"). Si no existe "Folio Referencia" en el documento, usa el mismo valor de "numeroGuia".
   Si algún dato de cabecera no se alcanza a leer con claridad, deja ese campo como cadena vacía.

2) TODAS LAS FILAS de la tabla de productos (arreglo "items"). Ignora encabezados de la empresa, datos del cliente, totales, firmas y textos legales al pie. Para cada fila devuelve estos campos:
   - "codigo": el código o SKU del producto tal como aparece.
   - "descripcion": la descripción/nombre del producto.
   - "lote": el número de lote (puede aparecer como "LOTE", "LOT", "L:").
   - "vencimiento": la fecha de vencimiento tal como aparece (puede decir "VENCTO", "VTO", "FECHA VCTO", "EXP"). Si puedes normalizarla a formato DD-MM-AAAA hazlo, si no, transcríbela tal cual.
   - "cantidad": la cantidad despachada de ese ítem, si aparece una columna de cantidad. Si no hay columna de cantidad visible, deja el campo como cadena vacía.

Si algún campo de una fila no se alcanza a leer con claridad, deja ese campo como cadena vacía, pero igual incluye la fila completa (no la omitas).

Si no logras identificar ninguna tabla de productos en la imagen, responde con una lista vacía en "items", pero igual intenta rellenar "cabecera" si esos datos son visibles.`;

// Esquema de salida: Gemini respeta esta forma exacta en su respuesta JSON.
const ESQUEMA_RESPUESTA = {
  type: 'object',
  properties: {
    cabecera: {
      type: 'object',
      properties: {
        fechaEmision: { type: 'string' },
        numeroGuia: { type: 'string' },
        numeroDocumento: { type: 'string' },
      },
      required: ['fechaEmision', 'numeroGuia', 'numeroDocumento'],
    },
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          codigo: { type: 'string' },
          descripcion: { type: 'string' },
          lote: { type: 'string' },
          vencimiento: { type: 'string' },
          cantidad: { type: 'string' },
        },
        required: ['codigo', 'descripcion', 'lote', 'vencimiento', 'cantidad'],
      },
    },
  },
  required: ['cabecera', 'items'],
};

exports.extraerGuiaDespacho = onCall(
  {
    secrets: [GEMINI_API_KEY],
    timeoutSeconds: 60,
    memory: '512MiB',
    region: 'us-central1', // ajusta si tu proyecto usa otra región
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError('unauthenticated', 'Debes iniciar sesión para usar esta función.');
    }
    // Solo exigía sesión: un externo no debe usarla (consume la API de Gemini).
    exigirInterno((await getFirestore().collection('usuarios').doc(request.auth.uid).get()).data());

    const { imagenBase64, mediaType } = request.data || {};

    if (!imagenBase64 || typeof imagenBase64 !== 'string') {
      throw new HttpsError('invalid-argument', 'Falta la imagen (imagenBase64).');
    }

    // --- Diagnóstico temporal: confirmar qué está llegando realmente ---
    console.log('DIAGNÓSTICO - mediaType recibido:', mediaType);
    console.log('DIAGNÓSTICO - longitud de imagenBase64:', imagenBase64.length);
    console.log('DIAGNÓSTICO - primeros 60 caracteres:', imagenBase64.slice(0, 60));
    console.log('DIAGNÓSTICO - últimos 30 caracteres:', imagenBase64.slice(-30));

    const tipoMedia = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(mediaType)
      ? mediaType
      : 'image/jpeg';

    // Limpieza defensiva: un base64 con saltos de línea o espacios hace que Gemini
    // devuelva "Unable to process input image" aunque los datos sean válidos.
    const base64Limpio = imagenBase64.replace(/\s/g, '');

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODELO_GEMINI}:generateContent`;

    let respuesta;
    try {
      respuesta = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY.value(),
        },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: tipoMedia, data: base64Limpio } },
                { text: PROMPT_EXTRACCION },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: ESQUEMA_RESPUESTA,
          },
        }),
      });
    } catch (err) {
      console.error('Error de red al llamar a Gemini:', err);
      throw new HttpsError('unavailable', 'No se pudo contactar al servicio de extracción.');
    }

    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      console.error('Gemini respondió con error:', respuesta.status, detalle);
      if (respuesta.status === 429) {
        throw new HttpsError(
          'resource-exhausted',
          'Se alcanzó el límite gratuito de solicitudes por minuto/día. Intenta de nuevo en un momento.'
        );
      }
      throw new HttpsError('internal', 'El servicio de extracción devolvió un error.');
    }

    const datos = await respuesta.json();
    const texto = datos?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!texto) {
      console.error('Respuesta de Gemini sin contenido de texto:', JSON.stringify(datos));
      throw new HttpsError('internal', 'El modelo no devolvió contenido.');
    }

    let json;
    try {
      json = JSON.parse(texto);
    } catch (err) {
      console.error('No se pudo parsear la respuesta como JSON:', texto);
      throw new HttpsError('internal', 'No se pudo interpretar la respuesta del modelo.');
    }

    if (!Array.isArray(json.items)) {
      throw new HttpsError('internal', 'La respuesta no tiene el formato esperado.');
    }

    const cabecera = json.cabecera && typeof json.cabecera === 'object' ? json.cabecera : {};

    // --- Diagnóstico temporal: confirmar qué cabecera detectó Gemini ---
    console.log('DIAGNÓSTICO - cabecera cruda devuelta por Gemini:', JSON.stringify(cabecera));

    const resultado = {
      items: json.items,
      cabecera: {
        fechaEmision: cabecera.fechaEmision ?? '',
        numeroGuia: cabecera.numeroGuia ?? '',
        numeroDocumento: cabecera.numeroDocumento ?? '',
      },
    };

    console.log('DIAGNÓSTICO - respuesta final enviada al frontend:', JSON.stringify({
      itemsCount: resultado.items.length,
      cabecera: resultado.cabecera,
    }));

    return resultado;
  }
);