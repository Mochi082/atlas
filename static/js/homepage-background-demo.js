/* Temporary demo: the URL can be shared; no persistent preference is saved. */
(() => {
  const selector = document.getElementById('background-demo-select');
  if (!selector) return;
  const panel = selector.closest('.background-demo');
  const toggle = panel.querySelector('.background-demo-toggle');
  const controls = panel.querySelector('.background-demo-controls');
  const mobile = window.matchMedia('(max-width:600px)');
  function setOpen(open, restoreFocus = false) {
    panel.classList.toggle('is-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.querySelector('.background-demo-indicator').textContent = open ? '−' : '＋';
    controls.inert = mobile.matches && !open;
    if (restoreFocus && mobile.matches) toggle.focus();
  }
  toggle.addEventListener('click', () => setOpen(!panel.classList.contains('is-open')));
  panel.addEventListener('keydown', event => {
    if (event.key === 'Escape' && mobile.matches && panel.classList.contains('is-open')) {
      event.stopPropagation();
      setOpen(false, true);
    }
  });
  mobile.addEventListener('change', () => setOpen(false));
  setOpen(false);
  const choices = new Set(['white', 'light-blue', 'gradient']);
  const url = new URL(window.location.href);
  const initial = url.searchParams.get('background');
  selector.value = choices.has(initial) ? initial : 'gradient';
  document.body.dataset.backgroundDemo = selector.value;
  selector.addEventListener('change', () => {
    document.body.dataset.backgroundDemo = selector.value;
    const next = new URL(window.location.href);
    if (selector.value === 'gradient') next.searchParams.delete('background');
    else next.searchParams.set('background', selector.value);
    window.history.replaceState(window.history.state, '', next.href);
    if (mobile.matches) setOpen(false, true);
  });
})();

