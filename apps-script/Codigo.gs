/**
 * 🎁 AMIGO SECRETO — script para Google Sheets
 *
 * Dónde va: en tu Google Sheet → Extensiones → Apps Script → pegar todo esto.
 * Paso a paso completo: README.md del repositorio.
 *
 * Reglas que garantiza:
 *   1. Nadie se saca a sí mismo.
 *   2. Cada persona saca UNA sola vez (con su link personal).
 *   3. Cada persona sale UNA sola vez (queda descartada).
 *   4. El juego nunca se traba (al último nunca le queda solo él mismo).
 *   5. Si dos personas sacan al mismo tiempo, se atienden de a una (candado).
 *   6. Cada link solo muestra el resultado de su dueño. La lista de quién le
 *      salió a quién nunca sale de esta hoja.
 */

// ========================= CONFIGURA AQUÍ =========================
var TITULO = 'Amigo Secreto en Familia';
var FAMILIA = 'Los Melvos'; // sale en el mensaje de WhatsApp ('' para quitarlo)
var URL_PAGINA = 'https://jhonjpineda.github.io/secret-friend/';
// ==================================================================

var HOJA = 'Participantes';
var C_ID = 1;
var C_NOMBRE = 2;
var C_TELEFONO = 3;
var C_CODIGO = 4;
var C_LINK = 5;
var C_WHATSAPP = 6;
var C_SACO = 7;
var C_FECHA = 8;
var C_RESULTADO = 9;
var NUM_COLUMNAS = 9;
var ENCABEZADOS = ['ID', 'Nombre', 'Teléfono', 'Código', 'Link personal', 'WhatsApp', 'Ya sacó', 'Fecha', 'Resultado (oculto)'];
var ALFABETO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sin 0/O ni 1/I para evitar confusiones
var LARGO_CODIGO = 8;
var ESPERA_CANDADO_MS = 30000;

// ================================================================
//  MENÚ DE LA HOJA (para el organizador)
// ================================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('🎁 Amigo Secreto')
    .addItem('1. Preparar hoja', 'prepararHoja')
    .addItem('2. Generar códigos y links', 'generarLinks')
    .addSeparator()
    .addItem('Ver estado del sorteo', 'verEstado')
    .addItem('Ver resultado de la fila seleccionada (spoiler)', 'verResultadoSeleccionado')
    .addItem('Anular sorteo de la fila seleccionada', 'anularSeleccionado')
    .addSeparator()
    .addItem('Reiniciar sorteo (borra todos los resultados)', 'reiniciarSorteo')
    .addToUi();
}

function prepararHoja() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();

  conCandado_(function () {
    asegurarHoja_(ss);
  });

  ui.alert(
    '✅ Hoja preparada',
    'Ahora pega los participantes empezando en la celda B2:\n' +
      '• Columna B: nombre\n' +
      '• Columna C: teléfono (opcional)\n\n' +
      'Después usa el menú 🎁 Amigo Secreto → 2. Generar códigos y links.',
    ui.ButtonSet.OK
  );
}

// Crea (o adopta) la hoja "Participantes" con sus títulos y formato.
// Si la primera hoja tiene la fila 1 libre (por ejemplo, ya pegaste los nombres
// en B2), la usa tal cual sin borrar nada; si no, crea una hoja nueva.
function asegurarHoja_(ss) {
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  var sh = ss.getSheetByName(HOJA);
  if (!sh) {
    var primera = ss.getSheets()[0];
    var fila1 = primera.getRange(1, 1, 1, NUM_COLUMNAS).getValues()[0];
    var libre = fila1.every(function (v, i) { return !limpiar_(v) || limpiar_(v) === ENCABEZADOS[i]; });
    sh = libre ? primera.setName(HOJA) : ss.insertSheet(HOJA, 0);
  }
  sh.getRange(1, 1, 1, NUM_COLUMNAS)
    .setValues([ENCABEZADOS])
    .setFontWeight('bold')
    .setBackground('#c8102e')
    .setFontColor('#ffffff');
  sh.setFrozenRows(1);
  var filas = Math.max(sh.getMaxRows() - 1, 1);
  sh.getRange(2, C_TELEFONO, filas, 1).setNumberFormat('@');
  sh.getRange(2, C_CODIGO, filas, 1).setNumberFormat('@');
  sh.getRange(2, C_FECHA, filas, 1).setNumberFormat('dd/mm/yyyy hh:mm');
  sh.setColumnWidth(C_ID, 50);
  sh.setColumnWidth(C_NOMBRE, 220);
  sh.setColumnWidth(C_TELEFONO, 130);
  sh.setColumnWidth(C_CODIGO, 100);
  sh.setColumnWidth(C_LINK, 330);
  sh.setColumnWidth(C_WHATSAPP, 130);
  sh.setColumnWidth(C_SACO, 70);
  sh.setColumnWidth(C_FECHA, 130);
  sh.hideColumns(C_RESULTADO);
  return sh;
}

function generarLinks() {
  var ui = SpreadsheetApp.getUi();
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var resumen = conCandado_(function () {
    var sh = ss.getSheetByName(HOJA) || asegurarHoja_(ss); // por si se saltó el paso 1
    var ultima = sh.getLastRow();
    if (ultima < 2) return { error: 'Primero pega los nombres en la columna B, desde la fila 2.' };
    var n = ultima - 1;
    var filas = sh.getRange(2, 1, n, NUM_COLUMNAS).getValues();

    var vistos = {};
    var repetidos = [];
    filas.forEach(function (f) {
      var nombre = limpiar_(f[C_NOMBRE - 1]);
      if (!nombre) return;
      var k = normalizarNombre_(nombre);
      if (vistos[k]) repetidos.push(nombre);
      vistos[k] = true;
    });
    if (repetidos.length) {
      return { error: 'Hay nombres repetidos: ' + repetidos.join(', ') + '.\nAgrega un apellido o apodo para diferenciarlos y vuelve a intentarlo.' };
    }

    var maxNum = 0;
    var usados = {};
    filas.forEach(function (f) {
      var m = /^P(\d+)$/.exec(limpiar_(f[C_ID - 1]));
      if (m) maxNum = Math.max(maxNum, Number(m[1]));
      var c = normalizarCodigo_(f[C_CODIGO - 1]);
      if (c) usados[c] = true;
    });

    var colId = [];
    var colCodigoLink = [];
    var colWhatsApp = [];
    var total = 0;
    filas.forEach(function (f) {
      var nombre = limpiar_(f[C_NOMBRE - 1]);
      if (!nombre) {
        colId.push(['']);
        colCodigoLink.push(['', '']);
        colWhatsApp.push(null);
        return;
      }
      total++;
      var id = limpiar_(f[C_ID - 1]) || 'P' + String(++maxNum).padStart(2, '0');
      var codigo = normalizarCodigo_(f[C_CODIGO - 1]); // los links ya enviados no cambian
      if (!codigo) {
        do { codigo = nuevoCodigo_(); } while (usados[codigo]);
        usados[codigo] = true;
      }
      var link = URL_PAGINA + '?c=' + codigo;
      colId.push([id]);
      colCodigoLink.push([codigo, link]);
      colWhatsApp.push(enlaceWhatsApp_(nombre, f[C_TELEFONO - 1], link));
    });

    sh.getRange(2, C_CODIGO, n, 1).setNumberFormat('@');
    sh.getRange(2, C_ID, n, 1).setValues(colId);
    sh.getRange(2, C_CODIGO, n, 2).setValues(colCodigoLink);
    // Botón de WhatsApp como texto con link (sin fórmulas: funciona en cualquier idioma).
    sh.getRange(2, C_WHATSAPP, n, 1).clearContent();
    colWhatsApp.forEach(function (w, i) {
      if (!w) return;
      sh.getRange(i + 2, C_WHATSAPP).setRichTextValue(
        SpreadsheetApp.newRichTextValue().setText(w.texto).setLinkUrl(w.url).build()
      );
    });
    SpreadsheetApp.flush();
    return { total: total };
  });

  if (resumen.error) {
    ui.alert('⚠️ Revisa la lista', resumen.error, ui.ButtonSet.OK);
    return;
  }
  ui.alert(
    '✅ Links listos',
    resumen.total + ' participantes tienen su link personal.\n\n' +
      'Usa la columna "WhatsApp" para enviarle a cada persona SU link (el mensaje ya va escrito). ' +
      'Para quien no tiene teléfono, el botón te deja elegir a quién enviárselo (por ejemplo, a su mamá o papá).\n\n' +
      'Los links ya generados no cambian aunque vuelvas a usar esta opción.',
    ui.ButtonSet.OK
  );
}

function verEstado() {
  var ui = SpreadsheetApp.getUi();
  var lista = leerParticipantes_(abrirHoja_());
  try {
    validar_(lista);
  } catch (e) {
    ui.alert('⚠️ Hay problemas en la hoja', (e.problemas || [e.message]).join('\n'), ui.ButtonSet.OK);
    return;
  }
  var sacaron = lista.filter(function (p) { return p.resultado; }).length;
  var faltan = lista.filter(function (p) { return !p.resultado; }).map(function (p) { return p.nombre; });
  ui.alert(
    '✅ Todo en orden',
    sacaron + ' de ' + lista.length + ' ya sacaron su amigo secreto.\n' +
      'Nadie está repetido y nadie se sacó a sí mismo.\n\n' +
      (faltan.length ? 'Faltan: ' + faltan.join(', ') : '¡Ya sacaron todos! 🎉'),
    ui.ButtonSet.OK
  );
}

function verResultadoSeleccionado() {
  var ui = SpreadsheetApp.getUi();
  var lista = leerParticipantes_(abrirHoja_());
  var p = personaSeleccionada_(lista);
  if (!p) return ui.alert('Selecciona una celda en la fila de la persona y vuelve a intentarlo.');
  if (!p.resultado) return ui.alert(p.nombre + ' todavía no ha sacado su amigo secreto.');
  var ok = ui.alert('¿Ver el resultado de ' + p.nombre + '?', 'Si tú también juegas, esto es un spoiler.', ui.ButtonSet.YES_NO);
  if (ok !== ui.Button.YES) return;
  ui.alert('🎁 A ' + p.nombre + ' le salió: ' + nombrePorId_(lista, p.resultado));
}

function anularSeleccionado() {
  var ui = SpreadsheetApp.getUi();
  var p = personaSeleccionada_(leerParticipantes_(abrirHoja_()));
  if (!p) return ui.alert('Selecciona una celda en la fila de la persona y vuelve a intentarlo.');
  if (!p.resultado) return ui.alert(p.nombre + ' todavía no ha sacado su amigo secreto.');
  var ok = ui.alert(
    '¿Anular el sorteo de ' + p.nombre + '?',
    'Su amigo secreto vuelve a quedar disponible y ' + p.nombre + ' tendrá que abrir su link y sacar de nuevo.',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;
  conCandado_(function () {
    var sh = abrirHoja_();
    var actual = leerParticipantes_(sh).filter(function (x) { return x.id === p.id; })[0];
    if (actual) {
      sh.getRange(actual.fila, C_SACO, 1, 3).clearContent();
      SpreadsheetApp.flush();
    }
  });
  ui.alert('Listo. ' + p.nombre + ' puede volver a sacar con su mismo link.');
}

function reiniciarSorteo() {
  var ui = SpreadsheetApp.getUi();
  var ok = ui.alert(
    '¿Reiniciar el sorteo?',
    'Se borran TODOS los resultados y todos deben volver a sacar. Los links personales siguen siendo los mismos.',
    ui.ButtonSet.YES_NO
  );
  if (ok !== ui.Button.YES) return;
  conCandado_(function () {
    var sh = abrirHoja_();
    if (sh.getLastRow() >= 2) sh.getRange(2, C_SACO, sh.getLastRow() - 1, 3).clearContent();
    SpreadsheetApp.flush();
  });
  ui.alert('Listo. El sorteo quedó en cero.');
}

// ================================================================
//  APLICACIÓN WEB (la usa la página de GitHub)
// ================================================================

function doGet(e) {
  return responder_((e && e.parameter) || {});
}

function doPost(e) {
  var datos = {};
  try {
    datos = JSON.parse(e.postData.contents);
  } catch (err) {
    datos = {};
  }
  return responder_(datos || {});
}

function responder_(datos) {
  var salida;
  try {
    if (datos.action === 'info') salida = info_(datos.c);
    else if (datos.action === 'draw') salida = sacar_(datos.c);
    else salida = { ok: true, service: 'amigo-secreto' };
  } catch (err) {
    if (err.codigo) {
      salida = { ok: false, code: err.codigo, error: err.message };
    } else {
      console.error(err);
      salida = { ok: false, code: 'INTERNAL', error: 'Error interno. Intenta de nuevo en un momento.' };
    }
  }
  return ContentService.createTextOutput(JSON.stringify(salida)).setMimeType(ContentService.MimeType.JSON);
}

// Datos para la persona dueña del link (y SOLO de ella).
function info_(codigo) {
  var lista = leerParticipantes_(abrirHoja_());
  validar_(lista);
  var yo = buscarPorCodigo_(lista, codigo);
  return {
    ok: true,
    title: TITULO,
    name: yo.nombre,
    drawn: Boolean(yo.resultado),
    recipient: yo.resultado ? nombrePorId_(lista, yo.resultado) : null,
    names: lista.map(function (p) { return p.nombre; }), // solo para la animación de barajar
    total: lista.length,
    drawnCount: lista.filter(function (p) { return p.resultado; }).length,
  };
}

// Sorteo. Todo ocurre dentro del candado: leer → validar → elegir → escribir.
function sacar_(codigo) {
  if (!normalizarCodigo_(codigo)) throw errorAmigo_('Este link está incompleto.', 'NO_CODE');
  return conCandado_(function () {
    var sh = abrirHoja_();
    var lista = leerParticipantes_(sh);
    validar_(lista);
    var yo = buscarPorCodigo_(lista, codigo);
    if (yo.resultado) {
      // Ya sacó: se devuelve el MISMO resultado, nunca uno nuevo.
      return { ok: true, already: true, recipient: nombrePorId_(lista, yo.resultado) };
    }
    var amigoId = elegirAmigo_(lista, yo.id, Math.random);
    sh.getRange(yo.fila, C_SACO, 1, 3).setValues([['✓', new Date(), amigoId]]);
    SpreadsheetApp.flush();
    return { ok: true, already: false, recipient: nombrePorId_(lista, amigoId) };
  });
}

// ================================================================
//  LÓGICA DEL SORTEO
// ================================================================

function leerParticipantes_(sh) {
  var filas = sh.getDataRange().getValues();
  var lista = [];
  for (var i = 1; i < filas.length; i++) {
    var f = filas[i];
    var nombre = limpiar_(f[C_NOMBRE - 1]);
    if (!nombre) continue;
    lista.push({
      fila: i + 1,
      id: limpiar_(f[C_ID - 1]),
      nombre: nombre,
      telefono: soloDigitos_(f[C_TELEFONO - 1]),
      codigo: normalizarCodigo_(f[C_CODIGO - 1]),
      resultado: limpiar_(f[C_RESULTADO - 1]),
    });
  }
  return lista;
}

// Revisa TODAS las reglas sobre la hoja. Si algo está mal (por ejemplo, alguien
// editó la hoja a mano), no se sortea nada hasta que el organizador lo corrija.
function validar_(lista) {
  var problemas = [];
  var ids = {};
  var codigos = {};
  var nombres = {};
  var salieron = {};

  if (lista.length < 3) problemas.push('Se necesitan al menos 3 participantes.');

  lista.forEach(function (p) {
    if (!p.id || !p.codigo) problemas.push(p.nombre + ' no tiene código. Usa "2. Generar códigos y links".');
    if (p.id) {
      if (ids[p.id]) problemas.push('ID repetido: ' + p.id + '.');
      ids[p.id] = true;
    }
    if (p.codigo) {
      if (codigos[p.codigo]) problemas.push('Código repetido en la fila de ' + p.nombre + '.');
      codigos[p.codigo] = true;
    }
    var k = normalizarNombre_(p.nombre);
    if (nombres[k]) problemas.push('Nombre repetido: ' + p.nombre + '.');
    nombres[k] = true;
  });

  lista.forEach(function (p) {
    if (!p.resultado) return;
    if (!ids[p.resultado]) problemas.push('El resultado de ' + p.nombre + ' no corresponde a nadie de la lista.');
    else if (p.resultado === p.id) problemas.push(p.nombre + ' quedó consigo mismo.');
    if (salieron[p.resultado]) problemas.push('A dos personas les salió la misma persona (' + p.resultado + ').');
    salieron[p.resultado] = true;
  });

  if (!problemas.length) {
    var r = pendientes_(lista);
    if (!puedeTerminar_(r.quienes, r.disponibles)) problemas.push('Con los resultados actuales el sorteo no se puede terminar.');
  }

  if (problemas.length) {
    var e = errorAmigo_('Hay un problema con la lista del sorteo. Avísale al organizador.', 'SHEET_INVALID');
    e.problemas = problemas;
    throw e;
  }
}

// Quiénes faltan por sacar y quiénes siguen disponibles para salir.
function pendientes_(lista) {
  var tomados = {};
  lista.forEach(function (p) { if (p.resultado) tomados[p.resultado] = true; });
  return {
    quienes: lista.filter(function (p) { return !p.resultado; }).map(function (p) { return p.id; }),
    disponibles: lista.filter(function (p) { return !tomados[p.id]; }).map(function (p) { return p.id; }),
  };
}

// ¿Se puede terminar el sorteo? Busca una forma de darle a cada persona que
// falta alguien disponible que no sea ella misma (emparejamiento perfecto).
function puedeTerminar_(quienes, disponibles) {
  if (quienes.length !== disponibles.length) return false;
  var asignado = {}; // disponible -> quien

  function intentar(q, visitados) {
    for (var i = 0; i < disponibles.length; i++) {
      var d = disponibles[i];
      if (d === q || visitados[d]) continue;
      visitados[d] = true;
      if (!(d in asignado) || intentar(asignado[d], visitados)) {
        asignado[d] = q;
        return true;
      }
    }
    return false;
  }

  for (var i = 0; i < quienes.length; i++) {
    if (!intentar(quienes[i], {})) return false;
  }
  return true;
}

// Personas que le pueden salir a `quienId` sin romper ninguna regla.
function candidatos_(lista, quienId) {
  var r = pendientes_(lista);
  if (r.quienes.indexOf(quienId) < 0) throw errorAmigo_('Esta persona ya sacó.', 'ALREADY_DRAWN');
  var otros = r.quienes.filter(function (q) { return q !== quienId; });
  return r.disponibles.filter(function (c) {
    return c !== quienId && puedeTerminar_(otros, r.disponibles.filter(function (x) { return x !== c; }));
  });
}

function elegirAmigo_(lista, quienId, aleatorio) {
  var opciones = candidatos_(lista, quienId);
  if (!opciones.length) throw errorAmigo_('No hay personas disponibles para sortear.', 'NO_CANDIDATES');
  var i = Math.floor(aleatorio() * opciones.length);
  return opciones[Math.min(Math.max(i, 0), opciones.length - 1)];
}

// ================================================================
//  UTILIDADES
// ================================================================

function conCandado_(fn) {
  var candado = LockService.getScriptLock();
  if (!candado.tryLock(ESPERA_CANDADO_MS)) {
    throw errorAmigo_('Hay mucha gente sacando al mismo tiempo. Espera unos segundos e intenta de nuevo.', 'BUSY');
  }
  try {
    return fn();
  } finally {
    candado.releaseLock();
  }
}

function abrirHoja_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
    if (id) ss = SpreadsheetApp.openById(id);
  }
  var sh = ss && ss.getSheetByName(HOJA);
  if (!sh) throw errorAmigo_('El organizador todavía no ha preparado el sorteo.', 'NOT_READY');
  return sh;
}

function buscarPorCodigo_(lista, codigo) {
  var c = normalizarCodigo_(codigo);
  if (!c) throw errorAmigo_('Este link está incompleto.', 'NO_CODE');
  var p = lista.filter(function (x) { return x.codigo === c; })[0];
  if (!p) throw errorAmigo_('Este link no es válido.', 'INVALID_CODE');
  return p;
}

function personaSeleccionada_(lista) {
  var sh = SpreadsheetApp.getActiveSheet();
  if (!sh || sh.getName() !== HOJA) return null;
  var fila = sh.getActiveCell().getRow();
  return lista.filter(function (p) { return p.fila === fila; })[0] || null;
}

function nombrePorId_(lista, id) {
  var p = lista.filter(function (x) { return x.id === id; })[0];
  return p ? p.nombre : '';
}

// Código aleatorio de 8 caracteres (≈ 1 billón de combinaciones), basado en
// el generador aleatorio de Google. Siempre empieza por letra.
function nuevoCodigo_() {
  var codigo = '';
  while (codigo.length < LARGO_CODIGO) {
    var hex = Utilities.getUuid().replace(/-/g, '');
    for (var i = 0; i + 2 <= 12 && codigo.length < LARGO_CODIGO; i += 2) {
      var n = parseInt(hex.substr(i, 2), 16);
      if (n >= 256 - (256 % ALFABETO.length)) continue; // evita sesgo
      var ch = ALFABETO.charAt(n % ALFABETO.length);
      if (codigo.length === 0 && /\d/.test(ch)) continue;
      codigo += ch;
    }
  }
  return codigo;
}

function numeroWhatsApp_(telefono) {
  var d = soloDigitos_(telefono);
  if (!d) return '';
  if (d.length === 10 && d.charAt(0) === '3') return '57' + d; // celular de Colombia
  if (d.length === 8) return '506' + d; // Costa Rica (8 dígitos)
  return d;
}

function mensajeWhatsApp_(nombre, link) {
  var nombreJuego = TITULO + (FAMILIA ? ' “' + FAMILIA + '”' : '');
  return (
    '🎄✨ *¡Hola, ' + nombre.split(' ')[0] + '!* ✨🎄\n\n' +
    '¡Llegó la época más bonita del año! 🎅 Y con ella, nuestro *' + nombreJuego + '* 🎁\n\n' +
    'Este es *tu link personal* 👇\n' + link + '\n\n' +
    '🎁 Ábrelo, toca el botón *"Encuentra a tu amigo secreto"* y descubre a quién le vas a dar regalo esta Navidad.\n\n' +
    '🤫 *Recuerda:*\n' +
    '• Es *secreto*: no le cuentes a nadie quién te salió.\n' +
    '• El link es *solo tuyo*, no lo reenvíes.\n' +
    '• Si se te olvida, vuelve a abrirlo: siempre te mostrará el mismo.\n\n' +
    '¡Que viva la Navidad en familia! ❤️⭐'
  );
}

function enlaceWhatsApp_(nombre, telefono, link) {
  var numero = numeroWhatsApp_(telefono);
  // api.whatsapp.com y no wa.me: la redirección de wa.me cambia los emojis por "�".
  return {
    texto: numero ? '📲 Enviar' : '📲 Elegir a quién',
    url: 'https://api.whatsapp.com/send?' + (numero ? 'phone=' + numero + '&' : '') +
      'text=' + encodeURIComponent(mensajeWhatsApp_(nombre, link)),
  };
}

function errorAmigo_(mensaje, codigo) {
  var e = new Error(mensaje);
  e.codigo = codigo;
  return e;
}

function limpiar_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
}

function soloDigitos_(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\D/g, '');
}

function normalizarCodigo_(v) {
  return String(v === null || v === undefined ? '' : v).toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function normalizarNombre_(v) {
  return limpiar_(v).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
