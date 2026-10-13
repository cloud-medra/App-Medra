# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Firebase Storage: CORS

El dominio principal de la app es **https://app.medra.cl** (también responde en `workcraft-491b7.web.app` y `workcraft-491b7.firebaseapp.com`; el dominio anterior `workcraft.medra.cl` se mantiene durante la transición). El código no tiene el dominio escrito: la configuración de Firebase sale de las variables `VITE_*` de `.env` y los enlaces se arman con `window.location.origin`.

Los archivos (Documentos de implantes, órdenes de compra, Respaldo de documentos y Archivo digital) se suben, se abren y se borran desde el navegador directo contra Storage (`uploadBytesResumable`, `getBlob`, `deleteObject`), así que el bucket debe permitir esos orígenes (`GET`, `HEAD`, `PUT`, `POST`, `DELETE`). La configuración aplicada está en [`cors.json`](cors.json): el dominio principal (y el anterior, mientras dure la transición), los dos de Hosting, el Codespace de desarrollo y `http://localhost:5173`. Si cambia la URL del Codespace, hay que actualizarla en `cors.json` y volver a aplicarlo.

Para aplicarla después de cambiar `cors.json`:

```bash
gcloud storage buckets update gs://workcraft-491b7.firebasestorage.app --cors-file=cors.json
```

Para revisar lo que está aplicado en el bucket:

```bash
gcloud storage buckets describe gs://workcraft-491b7.firebasestorage.app --format="default(cors_config)"
```

Requiere `gcloud` autenticado con una cuenta con permisos sobre el bucket (por ejemplo, desde Cloud Shell). No se aplica con `firebase deploy`.

## Permisos: acciones sensibles

Los permisos granulares (`permisosGranulares`, ver `src/config/componentMaps/`) siguen la regla "sección o acción sin configurar = permitida": así una vista que suma un botón nuevo no se lo quita a quien ya la tenía.

Las **acciones sensibles** (desbloquear, aprobar, rechazar…) son la excepción: **toda acción sensible nueva debe agregarse a `ACCIONES_DENEGADAS_POR_DEFECTO` en [`functions/permisos/nucleo.mjs`](functions/permisos/nucleo.mjs)**. Para no-admin, sin configurar quedan denegadas en `useGranularPermission`, en las Cloud Functions (`puedeAccion`), en plantillas y excepciones (`valorDe`) y en el editor de permisos (las completa desmarcadas; habilitar la vista o "marcar toda la vista" sí las marcan). Admin/dev las tienen siempre. Se validan en Cloud Functions, no en las reglas de Firestore/Storage (lo verifica `src/config/componentMaps/accionesDenegadas.test.js`).

## Probar a mano con emuladores

Proyecto `demo-workcraft` (no toca nada real). Solo en desarrollo: el build de producción no incluye la conexión a emuladores.

```bash
npm run emuladores            # terminal 1: Auth, Firestore, Storage y Functions
npm run emuladores:sembrar    # terminal 2: borra y crea usuarios de prueba (ver functions/scripts/sembrarEmulador.js)
npm run dev:emuladores        # terminal 3: la app contra los emuladores
```

- **VS Code de escritorio** (o local): los puertos se reenvían a `localhost`; abrir `http://localhost:5173`.
- **Codespace en el navegador**: la app detecta la URL `https://<codespace>-5173.app.github.dev` y usa los puertos reenviados por HTTPS. En la pestaña *Ports*, los puertos 9099, 8080, 9199 y 5001 deben estar reenviados y con visibilidad **Public** (los privados exigen la cookie de GitHub y el navegador los bloquea por CORS):

  ```bash
  gh codespace ports visibility 9099:public 8080:public 9199:public 5001:public -c "$CODESPACE_NAME"
  ```

  Mientras sean públicos, cualquiera con la URL llega a los emuladores (datos de prueba): al terminar, volver a `private` o detener los emuladores.

## Mejoras futuras

- **Administración de usuarios por centro** (pendiente, no implementado). Hoy un "Administrador del sistema" puede crear y editar a cualquier usuario, incluido su nombre de usuario, sin importar el centro; cada cambio queda en la auditoría del usuario (`usuarios/{uid}/logs`). Las solicitudes de cambio de nombre y las alertas sí se restringen por centro (solo los administradores asignados al operador, o los de su centro, más los desarrolladores). Posible mejora: restringir también Crear/Editar usuario para que un administrador solo gestione usuarios de los centros que administra (`centrosAdministrados`). Implica cambiar el modelo actual de "administrador = acceso total" en las reglas de Firestore y en las Cloud Functions de `functions/permisos`.
