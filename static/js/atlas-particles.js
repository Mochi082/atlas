/* Homepage-only particle study. No third-party libraries. */
(() => {
  const canvas = document.getElementById("atlas-particles");
  if (!canvas) return;
  const ctx = canvas.getContext("2d", { alpha: true });
  if (!ctx) return;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let particles = [], width = 0, height = 0, raf = 0, last = 0;
  const colors = ["rgba(18,99,174,", "rgba(28,132,200,", "rgba(60,160,218,"];
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bounds = canvas.getBoundingClientRect();
    const nextWidth = Math.round(bounds.width), nextHeight = Math.round(bounds.height);
    if (width === nextWidth && height === nextHeight) return;
    const oldWidth = width, oldHeight = height;
    width = nextWidth; height = nextHeight;
    if (oldWidth && oldHeight) for (const p of particles) {
      p.x *= width / oldWidth; p.y *= height / oldHeight;
    }
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.min(64, Math.max(24, Math.round(width * height / 26000)));
    // Safari toolbar resizing must not randomize the whole particle field.
    while (particles.length < count) particles.push({
      x: Math.random() * width, y: Math.random() * height,
      vx: (Math.random() - .5) * .95, vy: (Math.random() - .5) * .95,
      depth: .45 + Math.random() * 1.25,
      r: 1.1 + Math.random() * 1.8,
      color: colors[Math.floor(Math.random() * colors.length)],
      phase: Math.random() * Math.PI * 2
    });
    draw(last || performance.now());
  }
  function draw(t) {
    ctx.clearRect(0, 0, width, height);
    const point = p => ({x:p.x, y:p.y});
    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      for (let j = i + 1; j < particles.length; j++) {
        const b = particles[j], ap = point(a), bp = point(b), dx = ap.x - bp.x, dy = ap.y - bp.y;
        const dist2 = dx * dx + dy * dy;
        if (dist2 < 145 * 145) {
          const opacity = (1 - Math.sqrt(dist2) / 145) * .30 * Math.min(a.depth,b.depth);
          ctx.strokeStyle = "rgba(35,127,184," + opacity.toFixed(3) + ")";
          ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(ap.x,ap.y);
          ctx.lineTo(bp.x,bp.y); ctx.stroke();
        }
      }
      const alpha = (.32 + .15 * Math.sin(t / 1700 + a.phase)) * a.depth;
      ctx.fillStyle = a.color + alpha.toFixed(3) + ")";
      const ap = point(a);
      ctx.beginPath(); ctx.arc(ap.x, ap.y, a.r * a.depth, 0, Math.PI * 2); ctx.fill();
    }
  }
  function frame(t) {
    if (t - last >= 30) {
      const dt = Math.min((t - (last || t)) / 16.67, 2);
      last = t;
      for (const p of particles) {
        p.x += p.vx * dt * p.depth; p.y += p.vy * dt * p.depth;
        if (p.x < -10) p.x = width + 10;
        if (p.x > width + 10) p.x = -10;
        if (p.y < -10) p.y = height + 10;
        if (p.y > height + 10) p.y = -10;
      }
      draw(t);
    }
    raf = requestAnimationFrame(frame);
  }
  function syncMotion() {
    cancelAnimationFrame(raf); raf = 0; last = 0;
    resize();
    if (!motion.matches && !document.hidden) raf = requestAnimationFrame(frame);
  }
  window.addEventListener("resize", resize, { passive:true });
  window.addEventListener("pageshow", syncMotion);
  document.addEventListener("visibilitychange", syncMotion);
  if (motion.addEventListener) motion.addEventListener("change", syncMotion);
  else motion.addListener(syncMotion);
  syncMotion();
})();
