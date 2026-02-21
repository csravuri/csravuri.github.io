const $ = (sel, root = document) => root.querySelector(sel);

function extractSection(text, tag) {
  const re = new RegExp(`<${tag}>\\s*([\\s\\S]*?)\\s*</${tag}>`, "i");
  const match = text.match(re);
  return match ? match[1].trim() : "";
}

function normalizeSpaces(s) {
  return s.replace(/\s+/g, " ").trim();
}

function parseBaseData(sectionText) {
  const lines = sectionText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const data = { groom: "", bride: "", familyName: "", events: [] };
  let currentEvent = null;

  const startEvent = (name) => {
    currentEvent = { name: normalizeSpaces(name), date: "", venue: "" };
    data.events.push(currentEvent);
  };

  for (const raw of lines) {
    const line = normalizeSpaces(raw);
    const kv = line.match(/^([^:]+):\s*(.*)$/);

    if (kv) {
      const key = normalizeSpaces(kv[1]);
      const value = normalizeSpaces(kv[2] ?? "");
      const lowerKey = key.toLowerCase();

      if (lowerKey === "groom") data.groom = value;
      else if (lowerKey === "bride") data.bride = value;
      else if (lowerKey === "family name") data.familyName = value;
      else if (value === "") startEvent(key);
      else if (currentEvent) {
        if (lowerKey === "date") currentEvent.date = value;
        else if (lowerKey === "venue") currentEvent.venue = value;
        else if (!currentEvent.venue) currentEvent.venue = line;
      }
    } else if (currentEvent) {
      if (!currentEvent.venue) currentEvent.venue = line;
      else currentEvent.venue = normalizeSpaces(`${currentEvent.venue} ${line}`);
    }
  }

  return data;
}

function mapsUrl(query) {
  const q = encodeURIComponent(query);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

function mailtoRsvp({ familyName, couple, eventName }) {
  const subject = `RSVP - ${familyName} Wedding (${eventName})`;
  const body = [
    `Couple: ${couple}`,
    `Event: ${eventName}`,
    ``,
    `Name:`,
    `Attending: Yes / No`,
    `Guests:`,
    ``,
    `Message:`,
  ].join("\n");

  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function render(data) {
  const couple = `${data.groom || "Groom"} & ${data.bride || "Bride"}`;
  const familyName = data.familyName || "Ravuri";

  const heroTitle = $("#heroTitle");
  const names = $("#names");
  const familyLine = $("#familyLine");

  if (heroTitle) heroTitle.textContent = `${familyName}'s Wedding Invitation`;
  if (names) names.innerHTML = `${data.groom || "Durga Sai"} <span class="amp">&amp;</span> ${data.bride || "Ashiervachita"}`;
  if (familyLine) familyLine.textContent = `Family name: ${familyName}`;

  const eventsEl = $("#events");
  eventsEl.innerHTML = "";

  for (const ev of data.events) {
    const card = document.createElement("article");
    card.className = "event";

    const title = document.createElement("h2");
    title.textContent = ev.name;

    const venueText = (ev.venue || "").replace("Appratment", "Apartment");

    const actions = document.createElement("div");
    actions.className = "event-actions";

    const rsvp = document.createElement("a");
    rsvp.className = "btn btn-primary";
    rsvp.href = mailtoRsvp({ familyName, couple, eventName: ev.name });
    rsvp.textContent = "RSVP";

    const map = document.createElement("a");
    map.className = "btn btn-ghost";
    map.href = mapsUrl(venueText || ev.name);
    map.target = "_blank";
    map.rel = "noopener noreferrer";
    map.textContent = "Google Map";

    actions.appendChild(rsvp);
    actions.appendChild(map);

    card.appendChild(title);

    if (ev.date) {
      const dateRow = document.createElement("div");
      dateRow.className = "event-row";
      dateRow.innerHTML = `<span class="label">Date</span><span class="value">${ev.date}</span>`;
      card.appendChild(dateRow);
    }

    if (venueText) {
      const venueRow = document.createElement("div");
      venueRow.className = "event-row";
      venueRow.innerHTML = `<span class="label">${ev.name.toLowerCase().includes("home") ? "Address" : "Venue"}</span><span class="value">${venueText}</span>`;
      card.appendChild(venueRow);
    }

    card.appendChild(actions);
    eventsEl.appendChild(card);
  }
}

function initGalleryLightbox() {
  const strip = $("#galleryStrip");
  const lightbox = $("#lightbox");
  const stage = $("#lightboxStage");
  const lightboxImage = $("#lightboxImage");
  const counter = $("#lightboxCounter");

  if (!strip || !lightbox || !stage || !lightboxImage || !counter) return;

  const thumbnails = Array.from(strip.querySelectorAll("img"));
  if (thumbnails.length === 0) return;

  const closeEls = Array.from(lightbox.querySelectorAll("[data-lightbox-close]"));
  const closeBtn = lightbox.querySelector(".lightbox-close");
  const prevBtn = lightbox.querySelector("[data-lightbox-prev]");
  const nextBtn = lightbox.querySelector("[data-lightbox-next]");
  const focusables = [prevBtn, nextBtn, closeBtn].filter((el) => el && typeof el.focus === "function");

  let isOpen = false;
  let currentIndex = 0;
  let lastFocused = null;

  const modIndex = (n) => (n + thumbnails.length) % thumbnails.length;

  function setOpen(open) {
    isOpen = open;
    if (open) {
      lastFocused = document.activeElement;
      lightbox.hidden = false;
      lightbox.setAttribute("aria-hidden", "false");
      document.body.classList.add("lightbox-open");
      (closeBtn || lightbox).focus?.();
    } else {
      lightbox.hidden = true;
      lightbox.setAttribute("aria-hidden", "true");
      document.body.classList.remove("lightbox-open");
      if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
      lastFocused = null;
    }
  }

  function show(index) {
    currentIndex = modIndex(index);
    const img = thumbnails[currentIndex];
    lightboxImage.src = img.currentSrc || img.src;
    lightboxImage.alt = img.alt || `Gallery image ${currentIndex + 1}`;
    counter.textContent = `${currentIndex + 1} / ${thumbnails.length}`;

    const next = thumbnails[modIndex(currentIndex + 1)];
    const prev = thumbnails[modIndex(currentIndex - 1)];
    new Image().src = next.currentSrc || next.src;
    new Image().src = prev.currentSrc || prev.src;
  }

  function openAt(index) {
    show(index);
    if (!isOpen) {
      setOpen(true);
      document.addEventListener("keydown", onKeyDown, true);
    }
  }

  function close() {
    if (!isOpen) return;
    setOpen(false);
    document.removeEventListener("keydown", onKeyDown, true);
  }

  function prev() {
    show(currentIndex - 1);
  }

  function next() {
    show(currentIndex + 1);
  }

  function onKeyDown(e) {
    if (!isOpen) return;

    if (e.key === "Escape") {
      e.preventDefault();
      close();
      return;
    }

    if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
      return;
    }

    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
      return;
    }

    if (e.key === "Tab") {
      const active = document.activeElement;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (!first || !last) return;

      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  for (const [i, img] of thumbnails.entries()) {
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-label", `${img.alt || "Open gallery image"} (opens viewer)`);

    img.addEventListener("click", () => openAt(i));
    img.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openAt(i);
      }
    });
  }

  for (const el of closeEls) el.addEventListener("click", close);
  prevBtn?.addEventListener("click", prev);
  nextBtn?.addEventListener("click", next);

  // Swipe (and mouse-drag) navigation on the stage
  let activePointerId = null;
  let startX = 0;
  let startY = 0;

  stage.addEventListener("pointerdown", (e) => {
    if (!isOpen) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    stage.setPointerCapture?.(e.pointerId);
  });

  stage.addEventListener("pointerup", (e) => {
    if (!isOpen) return;
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;

    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const threshold = 44;

    if (absX > threshold && absX > absY * 1.2) {
      if (dx > 0) prev();
      else next();
    }
  });

  stage.addEventListener("pointercancel", () => {
    activePointerId = null;
  });
}

async function initData() {
  try {
    const res = await fetch("./data.md", { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to load data.md (${res.status})`);
    const md = await res.text();
    const base = extractSection(md, "BaseData");
    if (!base) throw new Error("BaseData section not found in data.md");
    render(parseBaseData(base));
  } catch (err) {
    console.warn(err);
    const note = document.createElement("div");
    note.className = "load-error";
    note.textContent = "Could not load data.md. Showing fallback content.";
    $("#content")?.appendChild(note);
  }
}

function initStars() {
  const canvas = /** @type {HTMLCanvasElement} */ ($("#star-canvas"));
  const ctx = canvas.getContext("2d");

  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (prefersReducedMotion) return;

  const stars = [];
  const numStars = 110;
  let width = 0;
  let height = 0;

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;

    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    stars.length = 0;
    for (let i = 0; i < numStars; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: 0.7 + Math.random() * 1.4,
        alpha: 0.25 + Math.random() * 0.75,
        speed: (Math.random() * 0.22 + 0.05) * (Math.random() < 0.5 ? -1 : 1),
      });
    }
  }

  function tick() {
    ctx.clearRect(0, 0, width, height);

    for (const s of stars) {
      s.alpha += s.speed;
      if (s.alpha > 1) {
        s.alpha = 1;
        s.speed *= -1;
      }
      if (s.alpha < 0.15) {
        s.alpha = 0.15;
        s.speed *= -1;
      }

      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${s.alpha})`;
      ctx.fill();
    }
    requestAnimationFrame(tick);
  }

  resizeCanvas();
  tick();

  if ("ResizeObserver" in window) {
    const ro = new ResizeObserver(() => resizeCanvas());
    ro.observe(canvas);
  }

  window.addEventListener("resize", resizeCanvas, { passive: true });
}

initStars();
initGalleryLightbox();
