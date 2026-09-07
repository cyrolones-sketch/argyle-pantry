(function (root) {
  "use strict";
  const CART_KEY = "argylePantryCart";
  const NOTICE = "Please choose a pickup time at least 15 minutes from now. We need at least 15 minutes to prepare your food. During busy periods it may take a little longer, but we will prepare your order as quickly as we can.";
  const specialDays = {
    "2026-08-14": { close: "18:00" },
    "2026-08-16": { closed: true }
  };
  function nowParts(now = new Date()) {
    const values = Object.fromEntries(new Intl.DateTimeFormat("en-AU", {
      timeZone: "Australia/Hobart", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(now).map(p => [p.type, p.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, minutes: +values.hour * 60 + +values.minute + +values.second / 60 };
  }
  function validDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
  }
  function schedule(date) {
    const special = specialDays[date] || {};
    const closed = special.closed || (validDate(date) && new Date(`${date}T12:00:00Z`).getUTCDay() === 6);
    return { open: "11:30", close: special.close || "20:30", closed: Boolean(closed) };
  }
  function minutes(time) { const [h, m] = String(time).split(":").map(Number); return h * 60 + m; }
  function formatTime(time) {
    const [h, m] = time.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h >= 12 ? "pm" : "am"}`;
  }
  function dateTimeError(date, time, type = "order", now = new Date()) {
    if (!validDate(date)) return "Please choose a valid date.";
    const today = nowParts(now), hours = schedule(date);
    if (date < today.date) return "Please choose today or a future date.";
    if (hours.closed) return "Argyle Pantry is closed on this date. Please choose another day. We are closed every Saturday.";
    if (!time) return "Please choose an available time.";
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || time < hours.open || time > hours.close) return `Please choose a time between ${formatTime(hours.open)} and ${formatTime(hours.close)}.`;
    if (date === today.date && minutes(time) < today.minutes + (type === "order" ? 15 : 0)) return type === "order" ? NOTICE : "Please choose a future reservation time.";
    return "";
  }
  function slots(date, type = "order", now = new Date()) {
    if (!validDate(date) || schedule(date).closed) return [];
    const times = [], hours = schedule(date);
    for (let m = minutes(hours.open); m <= minutes(hours.close); m += 5) {
      const time = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      if (!dateTimeError(date, time, type, now)) times.push(time);
    }
    return times;
  }
  function moneyCents(price) { return Math.round(Number(String(price).replace(/[^0-9.]/g, "")) * 100); }
  function money(cents) { return new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(cents / 100); }
  function canonicalItem(input) {
    const item = (root.menuItems || []).find(dish => dish.name === input.name);
    if (!item) throw new Error("A dish in your order is no longer available. Please review your cart.");
    const variant = item.variants?.find(option => option.label === input.variant);
    if ((item.variants && !variant) || (!item.variants && input.variant)) throw new Error(`Please choose a valid option for ${item.name}.`);
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 50) throw new Error("Please choose between 1 and 50 of each dish.");
    return { id: `${item.name}::${variant?.label || "default"}`, name: item.name, category: item.category,
      displayName: variant ? `${item.name} (${variant.label})` : item.name, variant: variant?.label || "",
      price: variant?.price || item.price, image: variant?.image || item.image, quantity: input.quantity };
  }
  function readCart() {
    try {
      const items = JSON.parse(root.localStorage.getItem(CART_KEY) || "[]");
      if (!Array.isArray(items)) return [];
      return items.flatMap(item => { try { return [canonicalItem(item)]; } catch { return []; } });
    } catch { return []; }
  }
  function saveCart(cart) {
    try { root.localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch { /* Cart remains usable in this tab. */ }
    root.dispatchEvent?.(new Event("cartchange"));
  }
  function total(cart) { return cart.reduce((sum, item) => sum + moneyCents(item.price) * item.quantity, 0); }
  function submissionKey(type, payload) {
    const value = JSON.stringify(payload), storageKey = `argylePantryPending:${type}`;
    try {
      const old = JSON.parse(root.sessionStorage.getItem(storageKey) || "null");
      if (old?.payload === value && Date.now() - old.created < 23 * 60 * 60 * 1000) return old.id;
      const id = crypto.randomUUID();
      root.sessionStorage.setItem(storageKey, JSON.stringify({ id, payload: value, created: Date.now() }));
      return id;
    } catch { return crypto.randomUUID(); }
  }
  root.Pantry = { CART_KEY, NOTICE, specialDays, nowParts, validDate, schedule, minutes, formatTime,
    dateTimeError, slots, moneyCents, money, canonicalItem, readCart, saveCart, total, submissionKey };
  if (!root.document) return;
  function updateStatus() {
    const now = nowParts(), hours = schedule(now.date);
    const status = hours.closed ? "Closed today" : now.minutes < minutes(hours.open) ? `Opens at ${formatTime(hours.open)}` : now.minutes > minutes(hours.close) ? "Closed for today" : `Open until ${formatTime(hours.close)}`;
    document.querySelectorAll("[data-trading-status]").forEach(el => { el.textContent = status; });
    const notices = Object.entries(specialDays).filter(([date]) => date >= now.date).map(([date, day]) => `${date}: ${day.closed ? "Closed" : `Closing at ${formatTime(day.close)}`}`).join(". ");
    document.querySelectorAll("[data-special-hours]").forEach(el => { el.textContent = notices; el.hidden = !notices; });
    const count = readCart().reduce((n, i) => n + i.quantity, 0);
    document.querySelectorAll("[data-cart-count]").forEach(el => { el.textContent = count; });
  }
  root.addEventListener("storage", updateStatus);
  root.addEventListener("cartchange", updateStatus);
  root.addEventListener("pageshow", updateStatus);
  updateStatus();
  setInterval(updateStatus, 60000);
})(globalThis);
