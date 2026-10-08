// Load the external map only when its reserved frame enters the viewport.
(() => {
  const frame = document.querySelector('[data-map-src]');
  if (!frame) return;
  const load = () => {
    frame.src = frame.dataset.mapSrc;
    frame.removeAttribute('data-map-src');
  };
  if (!('IntersectionObserver' in window)) { load(); return; }
  const observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer.disconnect();
    load();
  });
  observer.observe(frame);
})();