/* Shared, one-time reveals for corporate subpages, excluding TOP/contact. */
(() => {
  const main = document.querySelector('main');
  if (!main || !main.matches('.company-page, .company-detail-main, .activity-main, .recruit-page')) return;
  const preference = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (preference.matches || !('IntersectionObserver' in window)) return;
  const compact = window.matchMedia('(max-width: 600px)').matches;
  const targets = new Set();
  main.querySelectorAll('.subpage-motion, .page-hero, .company-detail-article, .activity-article, .consultation-layout, .partner-heading, .partner-prose, .partner-condition-block, .partner-notes, .partner-fee, .recruit-page > .detail-section > p, .recruit-page > .detail-section > h2, .people-card, .flow-step, .entry-rough').forEach(element => {
    // Keep the embedded map out of transformed reveal containers.
    if (element.matches('.company-detail-profile')) return;
    if (element.matches('.page-hero')) {
      targets.add(element.querySelector('.company-title-inner') || element);
    } else {
      targets.add(element);
    }
  });
  // A child of an animated block does not need a second reveal.
  const candidates = [...targets];
  const elements = candidates.filter(element => !candidates.some(parent => parent !== element && parent.contains(element)));
  const show = element => {
    element.classList.add('subpage-motion-visible');
    observer.unobserve(element);
  };
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => { if (entry.isIntersecting) show(entry.target); });
  }, { threshold: 0, rootMargin: compact ? '0px' : '0px 0px -6% 0px' });
  elements.forEach(element => {
    const bounds = element.getBoundingClientRect();
    if (bounds.top < window.innerHeight && bounds.bottom > 0) {
      element.classList.add('subpage-motion-visible');
    } else {
      element.classList.add('subpage-motion-pending');
      observer.observe(element);
    }
  });
  main.addEventListener('focusin', event => {
    elements.forEach(element => { if (element.contains(event.target)) show(element); });
  });
  preference.addEventListener('change', event => {
    if (event.matches) {
      elements.forEach(show);
      observer.disconnect();
    }
  });
})();
