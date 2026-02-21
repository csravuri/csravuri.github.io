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

  $("#heroTitle").textContent = `${familyName}'s Wedding Invitation`;
  $("#names").innerHTML = `${data.groom || "Durga Sai"} <span class="amp">&amp;</span> ${data.bride || "Ashiervachita"}`;
  $("#familyLine").textContent = `Family name: ${familyName}`;

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
