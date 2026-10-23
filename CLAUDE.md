# CLAUDE.md

## Reglas

- **No usar los emuladores de Firebase.** No iniciar `npm run emuladores`, `npm run dev:emuladores` ni `firebase emulators:*`, y no ejecutar `npm run test:emulador` ni los tests de `tests/emulador/`. Para verificar, usar `npm run build` y la revisión del código.
- **Desplegar las Cloud Functions de a 2 o 3 por vez.** La cuota de CPU de Cloud Run en `us-central1` ("Total CPU allocation, per project per region") está al límite y no se pudo aumentar: un `firebase deploy --only functions` completo falla con `Quota exceeded for total allowable CPU per project per region`. Desplegar por tandas, esperando a que termine cada una antes de lanzar la siguiente:

  ```bash
  npx firebase-tools deploy --only functions:funcionA,functions:funcionB,functions:funcionC --project workcraft-491b7
  ```

  Si una tanda falla por cuota, esperar unos minutos y reintentarla una vez; si vuelve a fallar, detenerse. Hacerlo de preferencia en horario de poco uso de la app.
