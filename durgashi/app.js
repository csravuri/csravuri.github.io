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

function shuffleArrayInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function decorateGalleryThumbnails(strip) {
  const thumbnails = Array.from(strip.querySelectorAll("img"));
  for (const img of thumbnails) {
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-label", `${img.alt || "Open gallery image"} (opens viewer)`);
    // prevent native HTML drag (which interferes with pointer-drag scrolling)
    img.draggable = false;
    // attach per-thumbnail click handler if lightbox open function is available
    if (typeof strip._openAt === 'function') {
      img.addEventListener('click', (e) => {
        if (strip.dataset.wasDragging) {
          const ts = Number(strip.dataset.wasDragging) || 0;
          delete strip.dataset.wasDragging;
          if (Date.now() - ts < 120) return;
        }
        strip._openAt(img);
      });
    }
  }
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

async function initGalleryDrive() {
  const strip = $("#galleryStrip");
  if (!strip) return;

  const folderId = strip.dataset.gdriveFolderId;
  if (!folderId) {
    decorateGalleryThumbnails(strip);
    shuffleArrayInPlace(Array.from(strip.children)).forEach((n) => strip.appendChild(n));
    return;
  }

  const apiKey = strip.dataset.gdriveApiKey;
  if (!apiKey) {
    console.warn("Gallery: set data-gdrive-api-key on #galleryStrip to load from Google Drive. Using local fallback images.");
    decorateGalleryThumbnails(strip);
    shuffleArrayInPlace(Array.from(strip.children)).forEach((n) => strip.appendChild(n));
    return;
  }

  try {
    const files = [];
    let pageToken = undefined;

    do {
      const params = new URLSearchParams();
      params.set("pageSize", "1000");
      params.set("fields", "nextPageToken,files(id,name,mimeType)");
      params.set("q", `'${folderId}' in parents and mimeType contains 'image/' and trashed = false`);
      params.set("key", apiKey);
      if (pageToken) params.set("pageToken", pageToken);

      const url = `https://www.googleapis.com/drive/v3/files?${params.toString()}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error(`Drive API error (${res.status})`);

      const json = await res.json();
      if (Array.isArray(json.files)) files.push(...json.files);
      pageToken = json.nextPageToken;
    } while (pageToken);

    if (files.length === 0) throw new Error("No images found in Drive folder");

    shuffleArrayInPlace(files);

    const imgs = files.map((f, idx) => {
      const img = document.createElement("img");
      const name = String(f.name || `Photo ${idx + 1}`);
      img.alt = name.replace(/\.[a-z0-9]+$/i, "");
      img.loading = "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";

      const fileId = f.id;
      img.src = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w800`;
      // Use a larger thumbnail for the lightbox to avoid Drive's uc endpoint issues.
      img.dataset.fullsrc = `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w2000`;
      img.dataset.driveId = fileId;
      return img;
    });

    strip.replaceChildren(...imgs);
    decorateGalleryThumbnails(strip);
  } catch (err) {
    console.warn("Gallery: failed to load from Google Drive; using local fallback.", err);
    decorateGalleryThumbnails(strip);
    shuffleArrayInPlace(Array.from(strip.children)).forEach((n) => strip.appendChild(n));
  }
}

function initGalleryLightbox() {
  const strip = $("#galleryStrip");
  const lightbox = $("#lightbox");
  const stage = $("#lightboxStage");
  const lightboxImage = $("#lightboxImage");
  const counter = $("#lightboxCounter");

  if (!strip || !lightbox || !stage || !lightboxImage || !counter) return;

  const closeEls = Array.from(lightbox.querySelectorAll("[data-lightbox-close]"));
  const closeBtn = lightbox.querySelector(".lightbox-close");
  const prevBtn = lightbox.querySelector("[data-lightbox-prev]");
  const nextBtn = lightbox.querySelector("[data-lightbox-next]");
  const focusables = [prevBtn, nextBtn, closeBtn].filter((el) => el && typeof el.focus === "function");

  let isOpen = false;
  let currentIndex = 0;
  let lastFocused = null;
  let zoomScale = 1;
  let panX = 0;
  let panY = 0;
  /** @type {HTMLImageElement[]} */
  let currentThumbs = [];

  const modIndex = (n) => (n + currentThumbs.length) % currentThumbs.length;

  function clampPan() {
    const stageRect = stage.getBoundingClientRect();
    const imgRect = lightboxImage.getBoundingClientRect();
    const baseWidth = imgRect.width / zoomScale;
    const baseHeight = imgRect.height / zoomScale;
    const scaledWidth = baseWidth * zoomScale;
    const scaledHeight = baseHeight * zoomScale;

    const maxX = Math.max(0, (scaledWidth - stageRect.width) / 2);
    const maxY = Math.max(0, (scaledHeight - stageRect.height) / 2);

    panX = Math.min(maxX, Math.max(-maxX, panX));
    panY = Math.min(maxY, Math.max(-maxY, panY));
  }

  function applyTransform() {
    if (zoomScale <= 1) {
      zoomScale = 1;
      panX = 0;
      panY = 0;
    } else {
      clampPan();
    }
    lightboxImage.style.transform = `translate(${panX}px, ${panY}px) scale(${zoomScale})`;
    lightboxImage.style.cursor = zoomScale > 1 ? "grab" : "zoom-in";
  }

  function resetTransform() {
    zoomScale = 1;
    panX = 0;
    panY = 0;
    lightboxImage.style.transform = "";
    lightboxImage.style.cursor = "zoom-in";
  }

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
      resetTransform();
      if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
      lastFocused = null;
    }
  }

  function show(index) {
    if (currentThumbs.length === 0) return;
    currentIndex = modIndex(index);
    const img = currentThumbs[currentIndex];
    const thumbSrc = img.currentSrc || img.src;
    const fullSrc = img.dataset.fullsrc || thumbSrc;
    lightboxImage.onerror = null;
    lightboxImage.src = fullSrc;
    if (fullSrc !== thumbSrc) {
      lightboxImage.onerror = () => {
        lightboxImage.onerror = null;
        lightboxImage.src = thumbSrc;
      };
    }
    lightboxImage.alt = img.alt || `Gallery image ${currentIndex + 1}`;
    counter.textContent = `${currentIndex + 1} / ${currentThumbs.length}`;
    resetTransform();

    const next = currentThumbs[modIndex(currentIndex + 1)];
    const prev = currentThumbs[modIndex(currentIndex - 1)];
    new Image().src = next.dataset.fullsrc || next.currentSrc || next.src;
    new Image().src = prev.dataset.fullsrc || prev.currentSrc || prev.src;
  }

  function openAt(imgEl) {
    currentThumbs = Array.from(strip.querySelectorAll("img"));
    if (currentThumbs.length === 0) return;

    const index = Math.max(0, currentThumbs.indexOf(imgEl));
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

  // expose openAt for decorateGalleryThumbnails so handlers can be attached after images are replaced
  strip._openAt = openAt;
  decorateGalleryThumbnails(strip);

  strip.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    const img = e.target?.closest?.("img");
    if (!img || !strip.contains(img)) return;
    e.preventDefault();
    openAt(img);
  });

  for (const el of closeEls) el.addEventListener("click", close);
  prevBtn?.addEventListener("click", prev);
  nextBtn?.addEventListener("click", next);

  // Swipe (and mouse-drag) navigation on the stage
  let activePointerId = null;
  let startX = 0;
  let startY = 0;
  let startPanX = 0;
  let startPanY = 0;
  let isPanning = false;

  stage.addEventListener("pointerdown", (e) => {
    if (!isOpen) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (e.target?.closest?.(".lightbox-nav, .lightbox-close")) return;
    activePointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    startPanX = panX;
    startPanY = panY;
    isPanning = zoomScale > 1;
    if (isPanning) stage.setPointerCapture?.(e.pointerId);
  });

  stage.addEventListener("pointermove", (e) => {
    if (!isOpen) return;
    if (activePointerId !== e.pointerId) return;
    if (!isPanning) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    panX = startPanX + dx;
    panY = startPanY + dy;
    applyTransform();
  });

  stage.addEventListener("pointerup", (e) => {
    if (!isOpen) return;
    if (activePointerId !== e.pointerId) return;
    activePointerId = null;
    if (isPanning) {
      isPanning = false;
      try { stage.releasePointerCapture?.(e.pointerId); } catch (err) {}
      return;
    }

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
    isPanning = false;
  });

  stage.addEventListener(
    "wheel",
    (e) => {
      if (!isOpen) return;
      e.preventDefault();

      const rect = stage.getBoundingClientRect();
      const originX = e.clientX - rect.left - rect.width / 2;
      const originY = e.clientY - rect.top - rect.height / 2;

      const delta = e.deltaY;
      const direction = delta > 0 ? -1 : 1;
      const step = e.ctrlKey ? 0.18 : 0.12;
      const newScale = Math.min(4, Math.max(1, zoomScale + direction * step));
      if (newScale === zoomScale) return;

      const factor = newScale / zoomScale;
      panX = panX + originX * (1 - factor);
      panY = panY + originY * (1 - factor);
      zoomScale = newScale;
      applyTransform();
    },
    { passive: false }
  );
}

function initGalleryNav() {
  const strip = $("#galleryStrip");
  if (!strip) return;

  const container = strip.closest('.gallery-container') || strip.parentElement;
  const prevBtn = container.querySelector('.gallery-nav.prev');
  const nextBtn = container.querySelector('.gallery-nav.next');
  if (!prevBtn || !nextBtn) return;

  const scrollAmount = () => Math.max(strip.clientWidth * 0.6, 240);

  function updateButtons() {
    prevBtn.disabled = strip.scrollLeft <= 0;
    nextBtn.disabled = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 1;
  }

  prevBtn.addEventListener('click', () => {
    strip.scrollBy({ left: -scrollAmount(), behavior: 'smooth' });
    setTimeout(updateButtons, 420);
  });

  nextBtn.addEventListener('click', () => {
    strip.scrollBy({ left: scrollAmount(), behavior: 'smooth' });
    setTimeout(updateButtons, 420);
  });

  // Pointer-drag to scroll (keeps drag-to-scroll behavior)
  let dragPointerId = null;
  let dragStartX = 0;
  let dragStartScroll = 0;
  let isDragging = false;

  strip.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    dragPointerId = e.pointerId;
    dragStartX = e.clientX;
    dragStartScroll = strip.scrollLeft;
    isDragging = false;
  });

  strip.addEventListener('pointermove', (e) => {
    if (dragPointerId !== e.pointerId) return;
    const dx = e.clientX - dragStartX;
    if (!isDragging && Math.abs(dx) > 6) {
      isDragging = true;
      strip.dataset.wasDragging = String(Date.now());
      strip.setPointerCapture?.(e.pointerId);
    }
    if (!isDragging) return;
    strip.scrollLeft = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, dragStartScroll - dx));
  });

  const endDrag = (e) => {
    if (dragPointerId !== e.pointerId) return;
    if (isDragging) {
      try { strip.releasePointerCapture?.(e.pointerId); } catch (err) {}
    }
    dragPointerId = null;
    isDragging = false;
    setTimeout(() => { delete strip.dataset.wasDragging; }, 80);
    setTimeout(updateButtons, 120);
  };

  strip.addEventListener('pointerup', endDrag);
  strip.addEventListener('pointercancel', endDrag);

  strip.addEventListener('scroll', updateButtons, { passive: true });
  updateButtons();
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
// start drive loader and then initialize gallery navigation buttons
initGalleryDrive().finally(() => initGalleryNav());
