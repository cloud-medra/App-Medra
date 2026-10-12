import { defineConfig } from 'vitest/config';

// Pruebas contra el emulador: reglas de Firestore y lógica de las Cloud
// Functions de permisos (npm run test:emulador, que levanta los emuladores
// de Firestore, Auth y Storage con un proyecto "demo-"). Fuera de `npm test` porque
// necesitan el emulador (Java). Un archivo a la vez: comparten la base.
export default defineConfig({
  test: {
    include: ['tests/emulador/**/*.test.js'],
    environment: 'node',
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
});
