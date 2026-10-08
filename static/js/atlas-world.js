/* Decorative animation: walkers complete a full circular orbit without teleporting.
   Only the near/top part of their route is visible. The rest is behind the globe. */
(() => {
  const world = document.querySelector('.home-page .atlas-world');
  if (!world) return;
  const walkers = [...world.querySelectorAll('.atlas-walker')];
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const people = [
    { angle: -1.70, speed: 0.085, direction: 1 },
    { angle: -1.05, speed: 0.072, direction: -1 },
    { angle: -2.25, speed: 0.060, direction: 1 },
    { angle: -0.63, speed: 0.077, direction: -1 }
  ];
  const centerX = 450, centerY = 600, radius = 450;
  let last = null, raf = null;
  function render(now) {
    const dt = last === null ? 0 : Math.min((now - last) / 1000, 0.05);
    last = now;
    people.forEach((person, i) => {
      person.angle += dt * person.speed * person.direction;
      const angle = person.angle;
      const x = centerX + radius * Math.cos(angle);
      const y = centerY + radius * Math.sin(angle);
      const degrees = (angle + Math.PI / 2) * 180 / Math.PI;
      const walker = walkers[i];
      // When the person reaches the far hemisphere, hide behind the planet.
      // The edge fade handles the transition as the walker leaves the visible arc.
      const visibility = Math.max(0, Math.min(1, (-Math.sin(angle) - 0.57) / 0.17));
      walker.style.opacity = visibility.toFixed(3);
      walker.setAttribute('transform',
        `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${degrees.toFixed(2)}) scale(${person.direction === 1 ? 1 : -1} 1)`);
    });
    raf = requestAnimationFrame(render);
  }
  function sync() {
    if (raf !== null) cancelAnimationFrame(raf);
    raf = null;
    last = null;
    if (!reduceMotion.matches) raf = requestAnimationFrame(render);
  }
  reduceMotion.addEventListener?.('change', sync);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (raf !== null) cancelAnimationFrame(raf); raf = null; last = null; }
    else sync();
  });
  sync();
})();
