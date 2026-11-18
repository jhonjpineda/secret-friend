'use strict';

// Simulador mínimo de Google Sheets + Apps Script para probar apps-script/Codigo.gs
// en Node, tal cual se pega en Google. También verifica que TODA escritura en la
// hoja ocurra con el candado tomado.

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const GS_FILE = path.join(__dirname, '..', 'apps-script', 'Codigo.gs');

function createSheet(name, data = []) {
  const cells = data.map((r) => r.slice()); // cells[fila-1][col-1]
  const env = { lockHeld: () => true };
  let activeRow = 1;
  let hidden = new Set();

  const ensure = (r, c) => {
    while (cells.length < r) cells.push([]);
    const row = cells[r - 1];
    while (row.length < c) row.push('');
  };
  const lastRow = () => {
    for (let r = cells.length; r >= 1; r--) {
      if (cells[r - 1].some((v) => v !== '' && v !== null && v !== undefined)) return r;
    }
    return 0;
  };
  const lastCol = () => {
    let max = 0;
    cells.forEach((row) => row.forEach((v, i) => { if (v !== '' && v !== null && v !== undefined) max = Math.max(max, i + 1); }));
    return max;
  };
  const requireLock = (what) => {
    if (!env.lockHeld()) throw new Error(`Escritura sin candado: ${what}`);
  };

  function range(r, c, nr = 1, nc = 1) {
    const self = {
      getRow: () => r,
      getValues: () => Array.from({ length: nr }, (_, i) =>
        Array.from({ length: nc }, (_, j) => {
          const v = (cells[r - 1 + i] || [])[c - 1 + j];
          return v === undefined ? '' : v;
        })),
      getValue: () => self.getValues()[0][0],
      setValues: (vals) => {
        requireLock('setValues');
        if (vals.length !== nr || vals.some((row) => row.length !== nc)) throw new Error('Dimensiones incorrectas en setValues');
        vals.forEach((row, i) => row.forEach((v, j) => { ensure(r + i, c + j); cells[r - 1 + i][c - 1 + j] = v; }));
        return self;
      },
      setFormulas: (vals) => self.setValues(vals),
      setRichTextValue: (rich) => self.setValues([[rich]]),
      setValue: (v) => self.setValues([[v]]),
      clearContent: () => {
        requireLock('clearContent');
        for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) { ensure(r + i, c + j); cells[r - 1 + i][c - 1 + j] = ''; }
        return self;
      },
      setNumberFormat: () => self,
      setFontWeight: () => self,
      setBackground: () => self,
      setFontColor: () => self,
    };
    return self;
  }

  const sheet = {
    _cells: cells,
    _env: env,
    _hidden: () => hidden,
    _select: (row) => { activeRow = row; },
    getName: () => name,
    setName: (n) => { name = n; return sheet; },
    getRange: range,
    getDataRange: () => range(1, 1, Math.max(lastRow(), 1), Math.max(lastCol(), 1)),
    getLastRow: lastRow,
    getLastColumn: lastCol,
    getMaxRows: () => Math.max(cells.length, 1000),
    getActiveCell: () => range(activeRow, 1),
    setFrozenRows: () => sheet,
    setColumnWidth: () => sheet,
    hideColumns: (c) => { hidden.add(c); return sheet; },
  };
  return sheet;
}

function loadScript({ sheets = [createSheet('Hoja1')], answers = [] } = {}) {
  let lockHeld = false;
  let manualEdit = false; // simula al organizador escribiendo a mano en la hoja
  let lockCount = 0;
  const canWrite = () => lockHeld || manualEdit;
  const alerts = [];
  const props = {};
  let activeSheet = sheets[0];

  const ss = {
    getId: () => 'hoja-de-prueba',
    getSheetByName: (n) => sheets.find((s) => s.getName() === n) || null,
    getSheets: () => sheets,
    insertSheet: (n, idx = sheets.length) => {
      const s = createSheet(n);
      s._env.lockHeld = canWrite;
      sheets.splice(idx, 0, s);
      return s;
    },
  };
  sheets.forEach((s) => { s._env.lockHeld = canWrite; });

  const ui = {
    Button: { YES: 'YES', NO: 'NO', OK: 'OK' },
    ButtonSet: { OK: 'OK', YES_NO: 'YES_NO' },
    alert: (title, msg, buttons) => {
      alerts.push({ title, msg, buttons });
      return answers.length ? answers.shift() : 'YES';
    },
    createMenu: () => {
      const menu = { addItem: () => menu, addSeparator: () => menu, addToUi: () => menu };
      return menu;
    },
  };

  const sandbox = {
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      getActiveSheet: () => activeSheet,
      openById: () => ss,
      getUi: () => ui,
      flush: () => {},
      newRichTextValue: () => {
        const b = { text: '', url: null };
        const builder = {
          setText: (t) => { b.text = t; return builder; },
          setLinkUrl: (u) => { b.url = u; return builder; },
          build: () => ({ text: b.text, url: b.url }),
        };
        return builder;
      },
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => {
          if (lockHeld) throw new Error('Candado tomado dos veces');
          lockHeld = true;
          lockCount++;
          return true;
        },
        waitLock: () => { lockHeld = true; lockCount++; },
        releaseLock: () => { lockHeld = false; },
      }),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (k in props ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
      }),
    },
    ContentService: {
      MimeType: { JSON: 'application/json' },
      createTextOutput: (text) => {
        const out = { getContent: () => text, setMimeType: () => out };
        return out;
      },
    },
    Utilities: { getUuid: () => crypto.randomUUID() },
  };

  const ctx = vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(GS_FILE, 'utf8'), ctx, { filename: 'Codigo.gs' });

  return {
    ctx,
    ss,
    ui,
    alerts,
    sheet: () => ss.getSheetByName('Participantes'),
    selectRow: (row) => { activeSheet = ss.getSheetByName('Participantes'); activeSheet._select(row); },
    lockCount: () => lockCount,
    isLocked: () => lockHeld,
    byHand: (fn) => { manualEdit = true; try { return fn(); } finally { manualEdit = false; } },
    get: (params) => JSON.parse(ctx.doGet({ parameter: params }).getContent()),
    post: (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).getContent()),
  };
}

// Deja la hoja lista: prepara, pega nombres/teléfonos en B y C, y genera links.
function setupGame(people, opts = {}) {
  const g = loadScript(opts);
  g.ctx.prepararHoja();
  g.byHand(() => {
    const sh = g.sheet();
    people.forEach((p, i) => sh.getRange(i + 2, 2, 1, 2).setValues([[p.name, p.phone || '']]));
  });
  g.ctx.generarLinks();
  return g;
}

module.exports = { loadScript, createSheet, setupGame, GS_FILE };
