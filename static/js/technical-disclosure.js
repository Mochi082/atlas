/* Start closed; allow closing from the end of the long list. */
(() => {
  const details = document.querySelector('[data-technical-disclosure]');
  if (!details) return;
  details.open = false;
  const close = details.querySelector('[data-technical-close]');
  if (close) close.addEventListener('click', () => {
    details.open = false;
    const summary = details.querySelector('summary');
    summary.focus({ preventScroll: true });
    summary.scrollIntoView({ block: 'center', behavior: 'auto' });
  });
})();
