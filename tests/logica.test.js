'use strict';

// Pruebas de la lógica del sorteo (funciones de apps-script/Codigo.gs).
// Simulan miles de sorteos y recorren TODAS las jugadas posibles en grupos
// pequeños: nunca hay repetidos, nadie se saca a sí mismo y nunca se traba.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { loadScript } = require('./harness');

const { ctx } = loadScript();

const makeList = (n) =>
  Array.from({ length: n }, (_, i) => ({ fila: i + 2, id: `P${i + 1}`, nombre: `Persona ${i + 1}`, codigo: `C${i + 1}`, resultado: '' }));

const withResult = (lista, id, amigo) => lista.map((p) => (p.id === id ? { ...p, resultado: amigo } : p));

function checkFinal(lista) {
  const salieron = new Set();
  for (const p of lista) {
    assert.ok(p.resultado, `${p.id} sacó`);
    assert.notEqual(p.resultado, p.id, 'nadie se saca a sí mismo');
    assert.ok(!salieron.has(p.resultado), 'nadie sale dos veces');
    salieron.add(p.resultado);
  }
  assert.equal(salieron.size, lista.length, 'todos salieron exactamente una vez');
  ctx.validar_(lista); // el validador del script también lo aprueba
}

const shuffle = (a) => {
  a = a.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

function playGame(n, random = Math.random) {
  let lista = makeList(n);
  for (const p of shuffle(lista)) lista = withResult(lista, p.id, ctx.elegirAmigo_(lista, p.id, random));
  return lista;
}

test('evita el callejón sin salida (que al último solo le quede él mismo)', () => {
  // P1→P2 ya ocurrió. Si P2 sacara a P1, a P3 solo le quedaría él mismo.
  const lista = withResult(makeList(3), 'P1', 'P2');
  assert.deepEqual([...ctx.candidatos_(lista, 'P2')], ['P3']);
  for (let i = 0; i < 100; i++) assert.equal(ctx.elegirAmigo_(lista, 'P2', Math.random), 'P3');
});

test('quien ya sacó no puede volver a sacar', () => {
  const lista = withResult(makeList(4), 'P1', 'P2');
  assert.throws(() => ctx.elegirAmigo_(lista, 'P1', Math.random), (e) => e.codigo === 'ALREADY_DRAWN');
});

test('recorre TODAS las jugadas posibles con 3 a 7 personas: nunca falla', () => {
  for (let n = 3; n <= 7; n++) {
    const seen = new Set();
    const finals = new Set();
    const explore = (lista) => {
      const key = lista.map((p) => p.resultado || '-').join(',');
      if (seen.has(key)) return;
      seen.add(key);
      const faltan = lista.filter((p) => !p.resultado);
      if (!faltan.length) {
        checkFinal(lista);
        finals.add(key);
        return;
      }
      for (const p of faltan) {
        const opciones = ctx.candidatos_(lista, p.id);
        assert.ok(opciones.length > 0, 'siempre hay al menos una opción');
        for (const c of opciones) explore(withResult(lista, p.id, c));
      }
    };
    explore(makeList(n));
    // Todas las asignaciones válidas posibles ("desarreglos"): 2, 9, 44, 265, 1854
    assert.equal(finals.size, { 3: 2, 4: 9, 5: 44, 6: 265, 7: 1854 }[n], `n=${n}`);
  }
});

test('el azar más "tramposo" (siempre el primero o el último) tampoco traba el sorteo', () => {
  for (const random of [() => 0, () => 0.999999]) {
    for (let n = 3; n <= 30; n++) for (let rep = 0; rep < 5; rep++) checkFinal(playGame(n, random));
  }
});

test('simula 3.000 sorteos completos de 3 a 30 personas en orden aleatorio', () => {
  for (let i = 0; i < 3000; i++) checkFinal(playGame(3 + (i % 28)));
});

test('el reparto es variado (no siempre sale lo mismo)', () => {
  const counts = {};
  for (let i = 0; i < 4000; i++) {
    const r = ctx.elegirAmigo_(makeList(5), 'P1', Math.random);
    counts[r] = (counts[r] || 0) + 1;
  }
  assert.deepEqual(Object.keys(counts).sort(), ['P2', 'P3', 'P4', 'P5']);
  for (const c of Object.values(counts)) assert.ok(c > 850 && c < 1150, `reparto parejo: ${c}`);
});

test('el validador detecta hojas editadas a mano con errores', () => {
  const bad = (lista, regex) => assert.throws(() => ctx.validar_(lista), (e) => e.codigo === 'SHEET_INVALID' && e.problemas.some((p) => regex.test(p)));
  let l = withResult(withResult(makeList(4), 'P1', 'P3'), 'P2', 'P3');
  bad(l, /misma persona/);
  bad(withResult(makeList(4), 'P1', 'P1'), /consigo mismo/);
  bad(withResult(makeList(4), 'P1', 'P9'), /no corresponde/);
  l = makeList(4);
  l[1] = { ...l[1], nombre: 'persona 1' };
  bad(l, /Nombre repetido/);
  l = makeList(4);
  l[2] = { ...l[2], codigo: '' };
  bad(l, /no tiene código/);
  // Estado sin salida: P1→P2, P2→P1 ... con 3 personas, P3 queda solo consigo mismo
  bad(withResult(withResult(makeList(3), 'P1', 'P2'), 'P2', 'P1'), /no se puede terminar/);
  bad(makeList(2), /al menos 3/);
});

test('los códigos son aleatorios, de 8 caracteres y sin letras confusas', () => {
  const codes = new Set();
  for (let i = 0; i < 20000; i++) {
    const c = ctx.nuevoCodigo_();
    assert.match(c, /^[A-HJ-NP-Z][A-HJ-NP-Z2-9]{7}$/);
    codes.add(c);
  }
  assert.equal(codes.size, 20000, 'sin repetidos');
});

test('números de WhatsApp: Colombia lleva 57, el resto se deja igual', () => {
  assert.equal(ctx.numeroWhatsApp_('3001234567'), '573001234567');
  assert.equal(ctx.numeroWhatsApp_(3001234567), '573001234567');
  assert.equal(ctx.numeroWhatsApp_('50660001111'), '50660001111');
  assert.equal(ctx.numeroWhatsApp_(''), '');
});
