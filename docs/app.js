(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const API = window.AMIGO_SECRETO_API || '';
  const SCREENS = ['loading', 'nolink', 'invalid', 'setup', 'draw', 'result', 'error'];
  const CODE = (new URLSearchParams(location.search).get('c') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

  let info = null;

  // ------------------------------------------------------------ utilidades

  function show(name) {
    for (const s of SCREENS) $(`screen-${s}`).hidden = s !== name;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function shuffled(list) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  // Llamadas a la hoja (Google Apps Script). Siempre por POST: Google rechaza
  // (error 400) las URLs de Apps Script que llevan el parámetro "c". Se envía como
  // text/plain para que el navegador no bloquee la petición entre dominios.
  async function api(params) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 40000);
    let data;
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(params),
        signal: ctrl.signal,
      });
      data = await res.json();
    } catch {
      const err = new Error('No pudimos conectarnos. Revisa tu internet e intenta de nuevo.');
      err.code = 'NETWORK';
      throw err;
    } finally {
      clearTimeout(timer);
    }
    if (!data || !data.ok) {
      const err = new Error((data && data.error) || 'Algo salió mal. Intenta de nuevo.');
      err.code = data && data.code;
      throw err;
    }
    return data;
  }

  // Reintenta solo errores pasajeros (Google ocupado, error 500, sin señal).
  // Es seguro repetir "sacar": si un intento anterior sí quedó guardado, la hoja
  // devuelve el MISMO resultado, nunca uno nuevo.
  const TRANSIENT = new Set(['BUSY', 'INTERNAL', 'NETWORK']);
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  async function apiWithRetry(params, { attempts, onRetry }) {
    for (let i = 1; ; i++) {
      try {
        return await api(params);
      } catch (err) {
        if (!TRANSIENT.has(err.code) || i >= attempts) throw err;
        if (onRetry) onRetry(i);
        await wait(1500 + Math.random() * 2500); // espera al azar para no chocar otra vez
      }
    }
  }

  function showError(err) {
    if (err.code === 'INVALID_CODE') return show('invalid');
    if (err.code === 'NO_CODE') return show('nolink');
    if (err.code === 'NOT_READY') return show('setup');
    $('error-text').textContent = err.message;
    show('error');
  }

  // ------------------------------------------------------------ inicio

  async function load() {
    if (!API || API.includes('PEGA_AQUI')) return show('setup');
    if (!CODE) return show('nolink');
    show('loading');
    try {
      info = await apiWithRetry({ action: 'info', c: CODE }, { attempts: 3 });
    } catch (err) {
      return showError(err);
    }
    $('title').textContent = info.title;
    document.title = `${info.title} · ${info.name}`;
    document.querySelectorAll('.js-name').forEach((el) => { el.textContent = info.name; });

    if (info.drawn) return showResult(info.recipient, { covered: true, already: true });

    const pct = info.total ? Math.round((info.drawnCount / info.total) * 100) : 0;
    $('progress-fill').style.width = `${pct}%`;
    $('progress-text').textContent = `${info.drawnCount} de ${info.total} ya descubrieron a su amigo secreto`;
    $('draw-ready').hidden = false;
    $('shuffle').hidden = true;
    $('btn-draw').disabled = false;
    show('draw');
  }

  // ------------------------------------------------------------ sorteo

  function runShuffle(names) {
    const card = $('shuffle-card');
    const label = $('shuffle-name');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let delay = reduced ? 140 : 55;
    let i = 0;
    let timer = null;
    let stopped = false;

    // Baraja rápido y va frenando (~4 s). Si la hoja aún no responde, sigue
    // barajando a ritmo lento hasta que llegue la respuesta: nunca se queda
    // quieta en un nombre que no es el resultado.
    let markDone;
    const done = new Promise((resolve) => { markDone = resolve; });
    const tick = () => {
      if (stopped) return;
      label.textContent = names[i++ % names.length];
      card.classList.remove('tick');
      void card.offsetWidth; // reinicia la animación
      card.classList.add('tick');
      if (delay < 380) delay *= 1.085;
      else markDone();
      timer = setTimeout(tick, delay);
    };
    tick();
    return { done, stop: () => { stopped = true; clearTimeout(timer); } };
  }

  async function startDraw() {
    const btn = $('btn-draw');
    if (btn.disabled) return;
    btn.disabled = true;
    $('draw-ready').hidden = true;
    $('shuffle').hidden = false;

    // La petición sale de inmediato; la animación solo es para dar emoción.
    const label = $('shuffle-label');
    label.textContent = '🎅 Revolviendo los nombres en el gorro…';
    const request = apiWithRetry({ action: 'draw', c: CODE }, {
      attempts: 6,
      onRetry: () => { label.textContent = 'Hay mucha gente sacando al mismo tiempo… seguimos revolviendo 🎅'; },
    });
    const others = info.names.filter((n) => n !== info.name);
    const anim = runShuffle(shuffled(others.length ? others : ['🎁']));

    let result;
    try {
      [result] = await Promise.all([request, anim.done]);
    } catch (err) {
      anim.stop();
      return showError(err);
    }
    anim.stop();
    // Acaba de tocar el botón: se le revela, aunque un reintento haya encontrado
    // su resultado ya guardado (mismo amigo secreto).
    showResult(result.recipient, { fresh: true });
  }

  // ------------------------------------------------------------ resultado

  function showResult(recipient, { fresh = false, covered = false, already = false } = {}) {
    $('result-heading').textContent = already
      ? `${info.name}, ya descubriste a tu amigo secreto:`
      : `${info.name}, tu amigo secreto es…`;
    const card = $('reveal-card');
    card.classList.remove('pop', 'covered');
    if (covered) {
      card.classList.add('covered');
      const tag = document.createElement('span');
      tag.className = 'cover-text';
      tag.textContent = '👀 Toca aquí para verlo';
      card.replaceChildren(tag);
      card.onclick = () => showResult(recipient, { fresh: true, already });
    } else {
      card.textContent = recipient;
      card.onclick = null;
    }
    show('result');
    if (fresh) {
      void card.offsetWidth;
      card.classList.add('pop');
      confetti();
      if (navigator.vibrate) navigator.vibrate([60, 40, 120]);
    }
  }

  // ------------------------------------------------------------ efectos

  function confetti() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const canvas = $('confetti');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#c8102e', '#f2c14e', '#2a8f60', '#ffffff', '#e01e3c', '#7fd1ae'];
    const shapes = ['rect', 'rect', 'star', 'dot'];
    const parts = Array.from({ length: 170 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 15 - 4,
      size: Math.random() * 7 + 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: shapes[Math.floor(Math.random() * shapes.length)],
    }));
    const star = (r) => {
      ctx.beginPath();
      for (let k = 0; k < 10; k++) {
        const a = -Math.PI / 2 + (k * Math.PI) / 5;
        const rr = k % 2 ? r * 0.45 : r;
        ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
    };
    const start = performance.now();
    const frame = (now) => {
      const t = now - start;
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.vy += 0.35;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - t / 4200);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        if (p.shape === 'star') star(p.size * 0.8);
        else if (p.shape === 'dot') { ctx.beginPath(); ctx.arc(0, 0, p.size / 3, 0, Math.PI * 2); ctx.fill(); }
        else ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      }
      if (t < 4200) requestAnimationFrame(frame);
      else ctx.clearRect(0, 0, w, h);
    };
    requestAnimationFrame(frame);
  }

  function snow() {
    const box = document.querySelector('.snow');
    if (!box || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const count = window.innerWidth < 600 ? 28 : 50;
    for (let i = 0; i < count; i++) {
      const f = document.createElement('span');
      if (i % 4 === 0) { // copo de nieve con forma
        f.className = 'flake flake-glyph';
        f.textContent = '❄︎';
        f.style.fontSize = `${Math.random() * 8 + 10}px`;
      } else {
        const size = Math.random() * 4 + 2;
        f.className = 'flake';
        f.style.width = f.style.height = `${size}px`;
      }
      f.style.left = `${Math.random() * 100}%`;
      f.style.opacity = String(Math.random() * 0.6 + 0.25);
      f.style.animationDuration = `${Math.random() * 10 + 9}s`;
      f.style.animationDelay = `${-Math.random() * 18}s`;
      f.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
      box.append(f);
    }
  }

  function stars() {
    const box = document.querySelector('.sky');
    if (!box) return;
    const count = window.innerWidth < 600 ? 45 : 90;
    for (let i = 0; i < count; i++) {
      const s = document.createElement('span');
      const size = Math.random() * 1.6 + 1;
      s.className = 'star';
      s.style.left = `${Math.random() * 100}%`;
      s.style.top = `${Math.random() * 75}%`;
      s.style.width = s.style.height = `${size}px`;
      s.style.opacity = String(Math.random() * 0.5 + 0.4);
      s.style.animationDuration = `${Math.random() * 3 + 2}s`;
      s.style.animationDelay = `${-Math.random() * 4}s`;
      box.append(s);
    }
  }

  // Guirnalda de luces de colores colgada arriba de la página.
  function lights() {
    const box = document.querySelector('.lights');
    if (!box) return;
    const colors = ['#ff4d5e', '#ffd54f', '#4ade80', '#60c3ff'];
    const width = Math.max(window.innerWidth, (window.screen && window.screen.width) || 0);
    const count = Math.ceil(width / 56) + 1;
    for (let i = 0; i < count; i++) {
      const b = document.createElement('i');
      b.style.left = `${i * 56 + 22}px`;
      b.style.setProperty('--c', colors[i % colors.length]);
      b.style.animationDelay = `${(i % 3) * 0.5}s`;
      box.append(b);
    }
  }

  function countdown() {
    const el = $('countdown');
    if (!el) return;
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const christmas = new Date(now.getFullYear(), 11, 25);
    const days = Math.round((christmas - today) / 86400000);
    let text;
    if (days > 1) text = `🎄 Faltan ${days} días para Navidad`;
    else if (days === 1) text = '🎄 ¡Mañana es Navidad!';
    else if (days === 0) text = '🎄 ¡Feliz Navidad!';
    else text = '🎄 ¡Felices fiestas!';
    el.textContent = text;
    el.hidden = false;
  }

  // ------------------------------------------------------------ eventos

  $('btn-draw').addEventListener('click', startDraw);
  $('btn-retry').addEventListener('click', load);

  stars();
  lights();
  snow();
  countdown();
  load();
})();
