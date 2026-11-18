'use strict';

// Servidor SOLO para probar en tu computador, sin Google: sirve la página de
// docs/ y responde como lo haría la hoja, usando el MISMO apps-script/Codigo.gs
// sobre una hoja simulada en memoria.
//
//   npm run dev      →  imprime un link personal por participante
//
// Usa participantes.txt si existe (una persona por línea: "Nombre<TAB>Teléfono"
// o "Nombre, Teléfono"); si no, nombres de ejemplo.

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { loadScript } = require('../tests/harness');

const PORT = Number(process.env.PORT) || 3000;
const ROOT = path.join(__dirname, '..');
const DOCS = path.join(ROOT, 'docs');
const BASE = `http://localhost:${PORT}/`;

function readPeople() {
  const file = path.join(ROOT, 'participantes.txt');
  if (!fs.existsSync(file)) {
    return ['Ana', 'Beto', 'Carla', 'Diego', 'Elena', 'Fabio'].map((name) => ({ name, phone: '' }));
  }
  return fs.readFileSync(file, 'utf8').split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const parts = line.includes('\t') ? line.split('\t') : line.split(/,(?=[^,]*$)/);
    const phone = (parts[1] || '').replace(/\D/g, '');
    return phone ? { name: parts[0].trim(), phone } : { name: line.trim(), phone: '' };
  });
}

const g = loadScript();
g.ctx.URL_PAGINA = BASE;
g.ctx.prepararHoja();
g.byHand(() => {
  readPeople().forEach((p, i) => g.sheet().getRange(i + 2, 2, 1, 2).setValues([[p.name, p.phone]]));
});
g.ctx.generarLinks();

const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

function sendJson(res, text) {
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(text);
}

const fallas = { busy: Number(process.env.FALLAS_BUSY) || 0, e500: Number(process.env.FALLAS_500) || 0 };

http.createServer((req, res) => {
  const url = new URL(req.url, BASE);

  if (url.pathname === '/api') {
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; });
      req.on('end', () => {
        // Simulación de fallas pasajeras de Google (para probar los reintentos):
        //   FALLAS_BUSY=n  -> los primeros n sorteos responden "ocupado"
        //   FALLAS_500=n   -> los primeros n sorteos responden error 500 (HTML)
        if (/"draw"/.test(body) && fallas.busy > 0) {
          fallas.busy--;
          return setTimeout(() => sendJson(res, JSON.stringify({ ok: false, code: 'BUSY', error: 'Ocupado (simulado)' })), 800);
        }
        if (/"draw"/.test(body) && fallas.e500 > 0) {
          fallas.e500--;
          res.writeHead(500, { 'Content-Type': 'text/html' });
          return res.end('<html><body>Error del servidor (simulado)</body></html>');
        }
        setTimeout(() => sendJson(res, g.ctx.doPost({ postData: { contents: body } }).getContent()), 600); // simula la demora de Google
      });
      return;
    }
    return setTimeout(() => sendJson(res, g.ctx.doGet({ parameter: Object.fromEntries(url.searchParams) }).getContent()), 400);
  }

  if (url.pathname === '/config.js') {
    res.writeHead(200, { 'Content-Type': TYPES['.js'] });
    return res.end("window.AMIGO_SECRETO_API = '/api';\n");
  }

  if (url.pathname === '/hoja') {
    // Vista de la hoja simulada (como la vería el organizador).
    const rows = g.sheet()._cells.map((r) => r.slice(0, 9).map((v) => (v && typeof v.toISOString === 'function' ? v.toISOString() : v)));
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end(rows.map((r) => [r[0], r[1], r[3], r[6], r[8]].join('\t')).join('\n'));
  }

  const rel = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
  const file = path.resolve(DOCS, rel);
  if (!file.startsWith(DOCS + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`\nPágina de prueba: ${BASE}  (hoja simulada: ${BASE}hoja)\n`);
  console.log('Links personales de prueba:');
  for (const r of g.sheet()._cells.slice(1).filter((r) => r[1])) console.log(`  ${String(r[1]).padEnd(28)} ${r[4]}`);
  console.log('\nTodo vive en memoria: al cerrar este servidor, el sorteo de prueba se borra.');
});
