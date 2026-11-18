'use strict';

// Pruebas del flujo completo con la hoja simulada: preparar, generar links,
// sacar con links personales, doble clic, anular, reiniciar y privacidad.

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { setupGame, loadScript, createSheet } = require('./harness');

const PEOPLE = [
  { name: 'Ana María Gómez', phone: '3001234567' },
  { name: 'Tomás' },
  { name: 'Lucía', phone: '50660001111' },
  { name: 'Andrés', phone: 3009876543 },
  ...Array.from({ length: 22 }, (_, i) => ({ name: `Familiar ${i + 1}`, phone: `31000000${String(i).padStart(2, '0')}` })),
];

const rows = (g) => g.sheet()._cells.slice(1).filter((r) => r[1]);
const codes = (g) => rows(g).map((r) => r[3]);

test('preparar hoja: encabezados y columna de resultados oculta', () => {
  const g = loadScript();
  g.ctx.prepararHoja();
  const sh = g.sheet();
  assert.ok(sh, 'la Hoja1 vacía se renombra a "Participantes"');
  assert.deepEqual(sh._cells[0].slice(0, 9), ['ID', 'Nombre', 'Teléfono', 'Código', 'Link personal', 'WhatsApp', 'Ya sacó', 'Fecha', 'Resultado (oculto)']);
  assert.ok(sh._hidden().has(9));
});

test('si la primera hoja tiene datos, crea una hoja nueva sin tocarla', () => {
  const g = loadScript({ sheets: [createSheet('Hoja1', [['algo importante']])] });
  g.ctx.prepararHoja();
  assert.equal(g.ss.getSheets().length, 2);
  assert.equal(g.ss.getSheetByName('Hoja1')._cells[0][0], 'algo importante');
});

test('generar links: un código único por persona, link y botón de WhatsApp', () => {
  const g = setupGame(PEOPLE);
  const r = rows(g);
  assert.equal(r.length, 26);
  assert.equal(new Set(codes(g)).size, 26, 'códigos únicos');
  assert.deepEqual(r.slice(0, 3).map((x) => x[0]), ['P01', 'P02', 'P03']);
  for (const row of r) {
    assert.match(row[3], /^[A-Z][A-Z0-9]{7}$/);
    assert.equal(row[4], `https://jhonjpineda.github.io/secret-friend/?c=${row[3]}`);
    // Texto con link, sin fórmula (las fórmulas fallan según el idioma de la hoja).
    assert.equal(typeof row[5], 'object');
    assert.ok(!String(row[5].text).startsWith('='), 'no es fórmula');
    // api.whatsapp.com (no wa.me: su redirección rompe los emojis)
    assert.match(row[5].url, /^https:\/\/api\.whatsapp\.com\/send\?(phone=\d+&)?text=/);
  }
  assert.match(r[0][5].url, /send\?phone=573001234567&text=/, 'Colombia con 57');
  assert.equal(r[0][5].text, '📲 Enviar');
  assert.match(r[2][5].url, /send\?phone=50660001111&text=/, 'Costa Rica tal cual');
  assert.match(r[1][5].url, /send\?text=/, 'sin teléfono: elegir contacto');
  assert.equal(r[1][5].text, '📲 Elegir a quién');
  const msg = decodeURIComponent(r[0][5].url.split('text=')[1]);
  assert.match(msg, /¡Hola, Ana!/);
  assert.match(msg, /Amigo Secreto en Familia “Los Melvos”/);
  assert.ok(msg.includes('🎄') && msg.includes('🎁') && msg.includes('🤫'), 'emojis intactos');
  assert.ok(!msg.includes('�'), 'sin caracteres rotos');
  assert.ok(msg.includes(r[0][4]), 'el mensaje lleva SU link');
  assert.match(g.alerts.at(-1).title, /Links listos/);
});

test('volver a generar no cambia los links ya enviados y da código a los nuevos', () => {
  const g = setupGame(PEOPLE.slice(0, 5));
  const before = codes(g);
  g.byHand(() => g.sheet().getRange(7, 2, 1, 2).setValues([['Persona nueva', '']]));
  g.ctx.generarLinks();
  const after = codes(g);
  assert.deepEqual(after.slice(0, 5), before);
  assert.equal(after.length, 6);
  assert.ok(after[5] && !before.includes(after[5]));
  assert.equal(rows(g)[5][0], 'P06');
});

test('nombres repetidos: avisa y no genera nada', () => {
  const g = setupGame([{ name: 'Ana' }, { name: 'Luis' }, { name: 'ana ' }]);
  assert.match(g.alerts.at(-1).msg, /repetidos: ana/);
  assert.equal(codes(g).filter(Boolean).length, 0);
});

test('26 personas sacan con su link, cada una DOS veces (doble clic o volver a abrir)', () => {
  const g = setupGame(PEOPLE);
  const byCode = Object.fromEntries(rows(g).map((r) => [r[3], r[1]]));
  const results = {};
  for (const code of crypto.randomInt(2) ? codes(g) : codes(g).reverse()) {
    const info = g.get({ action: 'info', c: code });
    assert.equal(info.ok, true);
    assert.equal(info.name, byCode[code]);
    assert.equal(info.drawn, false);
    assert.equal(info.recipient, null);

    const first = g.post({ action: 'draw', c: code });
    const second = g.post({ action: 'draw', c: code });
    assert.equal(first.ok, true);
    assert.equal(first.already, false);
    assert.equal(second.already, true, 'el segundo intento no sortea de nuevo');
    assert.equal(second.recipient, first.recipient, 'devuelve el MISMO resultado');
    assert.equal(g.isLocked(), false, 'el candado siempre se libera');
    results[byCode[code]] = first.recipient;

    const again = g.get({ action: 'info', c: code.toLowerCase() });
    assert.equal(again.drawn, true);
    assert.equal(again.recipient, first.recipient);
  }
  const giver = Object.keys(results);
  const recipients = Object.values(results);
  assert.equal(giver.length, 26);
  assert.equal(new Set(recipients).size, 26, 'nadie sale dos veces');
  giver.forEach((name) => assert.notEqual(results[name], name, 'nadie se saca a sí mismo'));

  for (const r of rows(g)) {
    assert.equal(r[6], '✓');
    assert.equal(Object.prototype.toString.call(r[7]), '[object Date]');
    assert.match(r[8], /^P\d\d$/, 'en la hoja el resultado queda como ID, no como nombre');
  }
});

test('privacidad: un link solo devuelve datos de su dueño', () => {
  const g = setupGame(PEOPLE);
  const all = codes(g);
  for (const code of all.slice(0, 10)) g.post({ action: 'draw', c: code });
  for (const code of all) {
    const info = g.get({ action: 'info', c: code });
    const text = JSON.stringify(info);
    for (const other of all) if (other !== code) assert.ok(!text.includes(other), 'no expone códigos de otros');
    assert.ok(!/P\d\d/.test(text), 'no expone IDs internos');
    assert.ok(!/3001234567|50660001111/.test(text), 'no expone teléfonos');
    assert.deepEqual(Object.keys(info).sort(), ['drawn', 'drawnCount', 'name', 'names', 'ok', 'recipient', 'title', 'total']);
  }
});

test('links inválidos o incompletos', () => {
  const g = setupGame(PEOPLE.slice(0, 4));
  assert.equal(g.get({ action: 'info', c: 'ZZZZZZZZ' }).code, 'INVALID_CODE');
  assert.equal(g.get({ action: 'info' }).code, 'NO_CODE');
  assert.equal(g.post({ action: 'draw', c: '' }).code, 'NO_CODE');
  assert.equal(g.post({ action: 'draw', c: 'ZZZZZZZZ' }).code, 'INVALID_CODE');
  assert.equal(g.get({}).service, 'amigo-secreto');
  const raw = g.ctx.doPost({ postData: { contents: 'no es json' } }).getContent();
  assert.equal(JSON.parse(raw).ok, true);
});

test('antes de preparar la hoja, la página lo indica', () => {
  const g = loadScript();
  assert.equal(g.get({ action: 'info', c: 'ABCDEFGH' }).code, 'NOT_READY');
});

test('si alguien daña la hoja a mano, no se sortea nada hasta corregirla', () => {
  const g = setupGame(PEOPLE.slice(0, 5));
  const [c1, c2, c3] = codes(g);
  g.post({ action: 'draw', c: c1 });
  const sh = g.sheet();
  const firstResult = sh._cells[1][8];
  g.byHand(() => sh.getRange(3, 9).setValue(firstResult)); // misma persona a dos
  const r = g.post({ action: 'draw', c: c3 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'SHEET_INVALID');
  assert.equal(sh._cells[3][8] ?? '', '', 'no escribió nada');
  g.ctx.verEstado();
  assert.match(g.alerts.at(-1).title, /problemas/);
  g.byHand(() => sh.getRange(3, 9).setValue(''));
  assert.equal(g.post({ action: 'draw', c: c2 }).ok, true);
});

test('anular: la persona vuelve a sacar con el mismo link y le sale la única libre', () => {
  const g = setupGame(PEOPLE);
  codes(g).forEach((c) => g.post({ action: 'draw', c }));
  const target = rows(g)[6];
  const freed = target[8];
  g.selectRow(8); // fila de P07
  g.ctx.anularSeleccionado();
  assert.equal(g.sheet()._cells[7][8] ?? '', '');
  const info = g.get({ action: 'info', c: target[3] });
  assert.equal(info.drawn, false);
  const again = g.post({ action: 'draw', c: target[3] });
  const freedName = rows(g).find((r) => r[0] === freed)[1];
  assert.equal(again.recipient, freedName);
});

test('ver resultado de la fila seleccionada (con aviso de spoiler)', () => {
  const g = setupGame(PEOPLE.slice(0, 4));
  const r = g.post({ action: 'draw', c: codes(g)[0] });
  g.selectRow(2);
  g.ctx.verResultadoSeleccionado();
  assert.match(g.alerts.at(-2).msg, /spoiler/);
  assert.equal(g.alerts.at(-1).title, `🎁 A Ana María Gómez le salió: ${r.recipient}`);
});

test('reiniciar: borra resultados y conserva los links', () => {
  const g = setupGame(PEOPLE);
  const before = codes(g);
  before.forEach((c) => g.post({ action: 'draw', c }));
  g.ctx.reiniciarSorteo();
  assert.deepEqual(codes(g), before);
  assert.ok(rows(g).every((r) => r[6] === '' && r[7] === '' && r[8] === ''));
  assert.equal(g.get({ action: 'info', c: before[0] }).drawnCount, 0);
});

test('si el organizador dice "No", no se anula ni se reinicia nada', () => {
  const g = setupGame(PEOPLE.slice(0, 4), { answers: [] });
  codes(g).forEach((c) => g.post({ action: 'draw', c }));
  const snapshot = JSON.stringify(rows(g));
  g.selectRow(2);
  g.ui.alert = ((orig) => (t, m, b) => (g.alerts.push({ t, m, b }), b === 'YES_NO' ? 'NO' : 'OK'))(g.ui.alert);
  g.ctx.anularSeleccionado();
  g.ctx.reiniciarSorteo();
  assert.equal(JSON.stringify(rows(g)), snapshot);
});

test('200 sorteos completos de 26 personas por el flujo real de la hoja', () => {
  for (let round = 0; round < 200; round++) {
    const g = setupGame(PEOPLE);
    const order = codes(g).sort(() => Math.random() - 0.5);
    const got = order.map((c) => g.post({ action: 'draw', c }));
    assert.ok(got.every((r) => r.ok && !r.already));
    assert.equal(new Set(got.map((r) => r.recipient)).size, 26);
    g.ctx.validar_(g.ctx.leerParticipantes_(g.sheet()));
  }
});

test('caso real: nombres pegados en Hoja1 desde B2 y "Generar" sin "Preparar" antes', () => {
  const data = [['', '', ''], ['', 'Ana', 3001112233], ['', 'Beto', ''], ['', 'Carla', 50660001111]];
  const g = loadScript({ sheets: [createSheet('Hoja 1', data)] });
  g.ctx.generarLinks();
  assert.equal(g.ss.getSheets().length, 1, 'no crea otra hoja');
  const sh = g.sheet();
  assert.ok(sh, 'adopta la Hoja 1 como "Participantes"');
  assert.equal(sh._cells[0][1], 'Nombre');
  assert.deepEqual(rows(g).map((r) => r[1]), ['Ana', 'Beto', 'Carla'], 'conserva los nombres');
  assert.equal(new Set(codes(g)).size, 3);
  assert.match(g.alerts.at(-1).title, /Links listos/);
  assert.equal(g.post({ action: 'draw', c: codes(g)[0] }).ok, true);
});

test('arreglo rápido: renombrar la pestaña a "Participantes" y luego Preparar + Generar', () => {
  const data = [['', '', ''], ['', 'Ana', 3001112233], ['', 'Beto', ''], ['', 'Carla', '']];
  const g = loadScript({ sheets: [createSheet('Participantes', data)] });
  g.ctx.prepararHoja();
  g.ctx.generarLinks();
  assert.deepEqual(rows(g).map((r) => r[1]), ['Ana', 'Beto', 'Carla']);
  assert.equal(new Set(codes(g)).size, 3);
});

test('caso real: la columna WhatsApp tenía fórmulas con #ERROR! y se vuelve a generar', () => {
  const g = setupGame(PEOPLE.slice(0, 4));
  const before = codes(g);
  g.byHand(() => g.sheet().getRange(2, 6, 4, 1).setValues([['=HYPERLINK(x)'], ['=HYPERLINK(x)'], ['=HYPERLINK(x)'], ['=HYPERLINK(x)']]));
  g.ctx.generarLinks();
  assert.deepEqual(codes(g), before, 'los códigos y links no cambian');
  assert.ok(rows(g).every((r) => typeof r[5] === 'object' && /^https:\/\/api\.whatsapp\.com\/send\?/.test(r[5].url)));
});
