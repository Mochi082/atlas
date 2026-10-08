const header = document.querySelector(".site-header");
const menuButton = document.querySelector(".menu-button");
const drawer = document.querySelector(".drawer");
const backdrop = document.querySelector(".drawer-backdrop");
const closeButton = document.querySelector(".drawer-close");
const peopleModal = document.getElementById("peopleModal");
const peopleModalTitle = document.getElementById("peopleModalTitle");
const peopleModalText = document.getElementById("peopleModalText");
const peopleModalDetail = document.getElementById("peopleModalDetail");
const peopleModalClose = document.querySelector(".people-modal-close");
let peopleModalTrigger = null;
if (peopleModal) peopleModal.inert = true;

function trapFocus(event, container) {
  const controls = [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')]
    .filter(element => element.getClientRects().length && !element.closest('[inert]'));
  const first = controls[0], last = controls[controls.length - 1];
  if (!first) return;
  if (!container.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) {
    event.preventDefault(); (event.shiftKey ? last : first).focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault(); first.focus();
  }
}

// Keep hidden drawer links out of the keyboard order and restore focus on close.
if (drawer) drawer.inert = true;
function setDrawer(open) {
  if (!drawer || !backdrop || !menuButton) return;
  const wasOpen = drawer.classList.contains("open");
  drawer.inert = !open;
  drawer.classList.toggle("open", open);
  backdrop.classList.toggle("open", open);
  drawer.setAttribute("aria-hidden", String(!open));
  menuButton.setAttribute("aria-expanded", String(open));
  document.body.style.overflow = open ? "hidden" : "";
  if (open) {
    header?.classList.remove("header-hidden");
    requestAnimationFrame(() => {
      if (drawer.classList.contains("open")) closeButton?.focus();
    });
  } else if (wasOpen) {
    menuButton.focus();
  }
}

// A desktop navigation must release the mobile drawer and its scroll lock.
const drawerBreakpoint = window.matchMedia('(max-width: 1200px)');
drawerBreakpoint.addEventListener('change', event => {
  if (!event.matches && drawer?.classList.contains('open')) {
    setDrawer(false);
    header?.querySelector('.desktop-nav a[aria-current], .desktop-nav a')?.focus();
  }
});

function openPeopleModal(card) {
  if (!peopleModal || !peopleModalTitle || !peopleModalText || !peopleModalDetail) return;

  peopleModalTitle.textContent = card.dataset.title || "社員インタビュー";
  peopleModalText.textContent = card.dataset.description || "";
  peopleModalDetail.textContent = card.dataset.detail || "";
  peopleModalTrigger = card;
  peopleModal.inert = false;
  peopleModal.classList.add("open");
  peopleModal.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
  peopleModalClose?.focus();
}

function closePeopleModal() {
  if (!peopleModal?.classList.contains("open")) return;

  peopleModal.classList.remove("open");
  peopleModal.setAttribute("aria-hidden", "true");
  peopleModal.inert = true;
  document.body.style.overflow = "";
  peopleModalTrigger?.focus();
  peopleModalTrigger = null;
}

menuButton?.addEventListener("click", () => setDrawer(true));
closeButton?.addEventListener("click", () => setDrawer(false));
backdrop?.addEventListener("click", () => setDrawer(false));
drawer?.querySelectorAll("a").forEach((a) => a.addEventListener("click", () => setDrawer(false)));

if (peopleModal) {
  document.querySelectorAll(".people-card").forEach((card) => {
    card.addEventListener("click", () => openPeopleModal(card));
  });

  peopleModalClose?.addEventListener("click", closePeopleModal);
  peopleModal.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]") || event.target === peopleModal) {
      closePeopleModal();
    }
  });
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Tab") {
    const activePanel = peopleModal?.classList.contains("open") ? peopleModal
      : drawer?.classList.contains("open") ? drawer : null;
    if (activePanel) trapFocus(e, activePanel);
  }
  if (e.key === "Escape") {
    setDrawer(false);
    closePeopleModal();
  }
});

// Keep navigation available while comparing the always-visible header.
header?.classList.remove('header-hidden');
const pageName = location.pathname.split('/').pop().replace(/\.html$/, '') || 'index';
const sectionPage = pageName.startsWith('company-') ? 'company'
  : pageName.startsWith('contact-') ? 'contact' : pageName;
document.querySelectorAll('.desktop-nav a, .drawer-nav a').forEach(link => {
  if (new URL(link.href, location.href).pathname.replace(/\.html$/, '') === '/' + sectionPage) link.setAttribute('aria-current', pageName === sectionPage ? 'page' : 'true');
});

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const smallScreen = window.matchMedia("(max-width: 600px)").matches;
const canObserve = "IntersectionObserver" in window;
const observer = canObserve && !reduceMotion && !smallScreen ? new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
        observer.unobserve(entry.target);
      }
    });
  },
  { threshold: 0.12 },
) : null;

document.querySelectorAll(".reveal").forEach((el) => {
  if (observer) {
    el.classList.add("reveal-pending");
    observer.observe(el);
  } else {
    el.classList.add("visible");
  }
});

const heroTitle = document.querySelector(".hero h1");
if (heroTitle && document.body.classList.contains("home-page") && !reduceMotion && !smallScreen) {
  // Wrap text nodes only: preserve the editorial line break and accent span.
  const titleText = heroTitle.innerText.replace(/\s*\n\s*/g, " ").trim();
  heroTitle.setAttribute("aria-label", titleText);
  let characterIndex = 0;
  const wrapTitleText = (parent) => {
    [...parent.childNodes].forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        node.replaceWith(...Array.from(node.textContent, (character) => {
          const span = document.createElement("span");
          span.className = "hero-title-char";
          span.setAttribute("aria-hidden", "true");
          span.style.setProperty("--char-index", characterIndex++);
          span.textContent = character;
          return span;
        }));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        wrapTitleText(node);
      }
    });
  };
  wrapTitleText(heroTitle);
  const heroContent = heroTitle.closest(".hero-content");
  if (heroContent) {
    // Keep the existing sequence brief; mobile content is displayed immediately.
    const titleDuration = Math.max(0, characterIndex - 1) * 35 + 10;
    heroContent.style.setProperty("--hero-copy-start", `${titleDuration + 120}ms`);
    heroContent.querySelectorAll(".hero-copy-line, .hero-extra").forEach((line, index) => {
      line.style.setProperty("--hero-line-order", index);
    });
    heroContent.classList.add("hero-copy-sequence");
  }
}
