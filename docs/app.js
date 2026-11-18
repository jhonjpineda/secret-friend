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
    label.textContent = 'Barajando nombres…';
    const request = apiWithRetry({ action: 'draw', c: CODE }, {
      attempts: 6,
      onRetry: () => { label.textContent = 'Hay mucha gente sacando al mismo tiempo… seguimos barajando 🎲'; },
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
      card.textContent = '👀 Toca aquí para verlo';
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
    const parts = Array.from({ length: 170 }, () => ({
      x: w / 2 + (Math.random() - 0.5) * 80,
      y: h * 0.35,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 15 - 4,
      size: Math.random() * 7 + 5,
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));
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
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
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
      const size = Math.random() * 4 + 2;
      f.className = 'flake';
      f.style.left = `${Math.random() * 100}%`;
      f.style.width = f.style.height = `${size}px`;
      f.style.opacity = String(Math.random() * 0.6 + 0.25);
      f.style.animationDuration = `${Math.random() * 10 + 9}s`;
      f.style.animationDelay = `${-Math.random() * 18}s`;
      f.style.setProperty('--drift', `${(Math.random() - 0.5) * 120}px`);
      box.append(f);
    }
  }

  // ------------------------------------------------------------ eventos

  $('btn-draw').addEventListener('click', startDraw);
  $('btn-retry').addEventListener('click', load);

  snow();
  load();
})();
