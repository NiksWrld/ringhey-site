/* Ringhey screenshot lightbox */
(() => {
  const TRIGGER = ".lightbox-trigger";

  const setup = () => {
    const triggers = [...document.querySelectorAll(TRIGGER)];
    if (!triggers.length) return;

    const root = document.createElement("div");
    root.className = "lightbox";
    root.id = "lightbox";
    root.hidden = true;
    root.setAttribute("role", "dialog");
    root.setAttribute("aria-modal", "true");
    root.setAttribute("aria-label", "Screenshot");
    root.innerHTML = `
      <div class="lightbox-backdrop" data-lightbox-close></div>
      <div class="lightbox-box">
        <button type="button" class="lightbox-close" aria-label="Close screenshot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>
        </button>
        <button type="button" class="lightbox-nav lightbox-prev" aria-label="Previous screenshot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>
        </button>
        <figure class="lightbox-figure">
          <img alt="">
          <figcaption class="lightbox-status" aria-live="polite"></figcaption>
        </figure>
        <button type="button" class="lightbox-nav lightbox-next" aria-label="Next screenshot">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>
        </button>
      </div>
    `;
    document.body.append(root);

    const img = root.querySelector("img");
    const status = root.querySelector(".lightbox-status");
    const btnClose = root.querySelector(".lightbox-close");
    const btnPrev = root.querySelector(".lightbox-prev");
    const btnNext = root.querySelector(".lightbox-next");
    const focusables = () => [btnClose, btnPrev, btnNext].filter((el) => !el.hidden && !el.disabled);

    let index = 0;
    let lastFocus = null;
    let scrollY = 0;

    const fullSrc = (el) => el.getAttribute("data-full") || el.querySelector("img")?.currentSrc || el.querySelector("img")?.src || "";
    const labelOf = (el) => el.getAttribute("data-caption") || el.querySelector("img")?.alt || "Screenshot";

    const lockScroll = (lock) => {
      if (lock) {
        scrollY = window.scrollY;
        document.documentElement.classList.add("lightbox-open");
        document.body.style.top = `-${scrollY}px`;
      } else {
        document.documentElement.classList.remove("lightbox-open");
        document.body.style.top = "";
        window.scrollTo(0, scrollY);
      }
    };

    const show = (i) => {
      index = (i + triggers.length) % triggers.length;
      const trigger = triggers[index];
      const src = fullSrc(trigger);
      const label = labelOf(trigger);
      if (img.getAttribute("src") !== src) {
        img.src = src;
      }
      img.alt = label;
      root.setAttribute("aria-label", label);
      status.textContent = `${index + 1} of ${triggers.length}`;
      const many = triggers.length > 1;
      btnPrev.hidden = !many;
      btnNext.hidden = !many;
    };

    const open = (i) => {
      lastFocus = document.activeElement;
      show(i);
      root.hidden = false;
      lockScroll(true);
      btnClose.focus();
    };

    const close = () => {
      if (root.hidden) return;
      root.hidden = true;
      img.removeAttribute("src");
      lockScroll(false);
      if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    };

    triggers.forEach((el, i) => {
      el.addEventListener("click", () => open(i));
    });

    btnClose.addEventListener("click", close);
    btnPrev.addEventListener("click", () => show(index - 1));
    btnNext.addEventListener("click", () => show(index + 1));
    root.querySelector("[data-lightbox-close]").addEventListener("click", close);

    document.addEventListener("keydown", (e) => {
      if (root.hidden) return;
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "ArrowLeft" && triggers.length > 1) {
        e.preventDefault();
        show(index - 1);
      } else if (e.key === "ArrowRight" && triggers.length > 1) {
        e.preventDefault();
        show(index + 1);
      } else if (e.key === "Tab") {
        const items = focusables();
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup);
  } else {
    setup();
  }
})();
