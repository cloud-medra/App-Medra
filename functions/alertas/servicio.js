// Buzón genérico de alertas (Administración → Alertas). Cada alerta:
//   alertas/{id} = { tipo, titulo, resumen, datos, destinatarios: [uid],
//                    noLeidas: [uid], estado: 'pendiente' | 'resuelta',
//                    resultado, creadoEl, resueltaEl }
// Solo la escriben las Cloud Functions; desde el navegador cada
// destinatario solo se quita de noLeidas (reglas de Firestore). Hoy el único
// tipo es 'solicitud' (functions/solicitudes); otro tipo nuevo solo necesita
// crear su alerta con crearAlerta y, si se resuelve, resolverAlerta.

const { FieldValue } = require('firebase-admin/firestore');

const refAlertas = (db) => db.collection('alertas');

// Prepara la alerta en la transacción (o lote) `t`; devuelve su referencia.
const crearAlerta = (t, db, { tipo, titulo, resumen = '', datos = {}, destinatarios }) => {
  const ref = refAlertas(db).doc();
  t.set(ref, {
    tipo, titulo, resumen, datos,
    destinatarios, noLeidas: destinatarios,
    estado: 'pendiente', resultado: null,
    creadoEl: FieldValue.serverTimestamp(), resueltaEl: null,
  });
  return ref;
};

// Resuelta: sale de "pendientes" y deja de contar como no leída para todos.
const resolverAlerta = (t, ref, resultado) => t.update(ref, {
  estado: 'resuelta', resultado, noLeidas: [], resueltaEl: FieldValue.serverTimestamp(),
});

module.exports = { refAlertas, crearAlerta, resolverAlerta };
