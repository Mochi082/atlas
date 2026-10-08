// Run before rendering so reloads do not restore the previous scroll position.
(() => {
  const navigation = performance.getEntriesByType("navigation")[0];
  if (navigation?.type !== "reload") return;

  history.scrollRestoration = "manual";
  window.addEventListener("pageshow", () => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, { once: true });
})();
