// Revisión de firestore.rules sin emulador: todo corte de lista `[0:n]`
// tiene que ir protegido por `n == 0 ||`. En las reglas, `lista[0:0]` no da
// una lista vacía sino "Index out of bound error. Index: [-1]", y un error
// es un rechazo. Así fallaban bajar los usos previos de una fibra a 0 y el
// primer mensaje del creador de un ticket. Los casos completos están en
// tests/emulador/reglasCortesLista.test.js (necesitan el emulador).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const reglas = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8').split(/\r?\n/);

// Cada `[0:x]` fuera de comentarios, con las 2 líneas anteriores como contexto
// (la protección puede ir en la línea de arriba, como en esCorreccion).
const cortes = reglas.flatMap((linea, i) => {
  const codigo = linea.replace(/\/\/.*$/, '');
  return [...codigo.matchAll(/\[0:([^\]]+)\]/g)].map((m) => ({
    linea: i + 1,
    limite: m[1].trim(),
    contexto: reglas.slice(Math.max(0, i - 2), i + 1).map((l) => l.replace(/\/\/.*$/, '')).join(' '),
  }));
});

const escapar = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

describe('firestore.rules: cortes [0:n] protegidos para n = 0', () => {
  it('encuentra los cortes conocidos (si cambian, revisar este test)', () => {
    expect(cortes.map((c) => c.limite)).toEqual(expect.arrayContaining(['n', 'd.usosPrevios']));
  });

  it.each(cortes.map((c) => [c.linea, c.limite, c.limite, c.contexto]))('línea %i: [0:%s] va con "%s == 0 ||"', (_linea, limite, _repetido, contexto) => {
    expect(contexto).toMatch(new RegExp(`${escapar(limite)}\\s*==\\s*0\\s*\\|\\|`));
  });
});
