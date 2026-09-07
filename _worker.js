import "./menu-data.js";
import "./storefront.js";
const Pantry = globalThis.Pantry;
const EMAIL_TO_DEFAULT = "cyrolones@gmail.com";
const FROM_DEFAULT = "Argyle Pantry <orders@argylepantry.com.au>";
export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return optionsResponse(request);
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      return jsonResponse(request, 200, { status: "ok" });
    }

    if (request.method === "POST" && url.pathname === "/api/reservations") {
      return handleReservation(request, env);
    }

    if (request.method === "POST" && url.pathname === "/api/orders") {
      return handleOrder(request, env);
    }

    if (url.pathname.startsWith("/api/")) return jsonResponse(request, 404, { message: "Endpoint not found." });
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", { status: 405 });
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); } catch { return new Response("Bad request", { status: 400 }); }
    const pages = ["/", "/index", "/index.html", "/menu", "/menu.html", "/checkout", "/checkout.html", "/success", "/success.html", "/styles.css", "/experience.css", "/app.js", "/menu-data.js", "/storefront.js", "/booking-ui.js", "/checkout.js", "/reservation.js", "/success.js", "/logo.png", "/robots.txt", "/sitemap.xml"];
    const asset = /^\/(assets|新菜品图)\/[^\\]*\.(png|jpe?g|webp|svg)$/i.test(pathname) && !pathname.split("/").includes("..");
    if (!pages.includes(pathname) && pathname !== "/image-map.js" && !asset) return new Response("Not found", { status: 404 });
    return env.ASSETS.fetch(request);
  }
};

async function handleReservation(request, env) {
  return handleSubmission(request, env, "reservation");
}

async function handleOrder(request, env) {
  return handleSubmission(request, env, "order");
}

async function handleSubmission(request, env, type) {
  try {
    const origin = request.headers.get("Origin");
    if (origin && origin !== new URL(request.url).origin) return jsonResponse(request, 403, { message: "Please submit from the Argyle Pantry website." });
    if (!request.headers.get("Content-Type")?.includes("application/json")) return jsonResponse(request, 415, { message: "Please send a JSON request." });
    const text = await request.text();
    if (text.length > 32000) return jsonResponse(request, 413, { message: "Your request is too large. Please shorten your notes." });
    let payload;
    try { payload = JSON.parse(text); } catch { return jsonResponse(request, 400, { message: "The request could not be read. Please try again." }); }
    if (!payload || Array.isArray(payload) || typeof payload !== "object") return jsonResponse(request, 400, { message: "Invalid request." });
    let data;
    try { data = type === "order" ? normalizeOrder(payload) : normalizeReservation(payload); }
    catch (error) { return jsonResponse(request, 400, { message: error.message }); }
    const errors = type === "order" ? validateOrder(data) : validateReservation(data);
    const customer = type === "order" ? data.customer : data;
    if (customer.name.length > 120 || customer.phone.length > 40 || customer.email.length > 254 || customer.notes.length > 2000) errors.push("Please shorten your name, contact details or notes.");
    if (errors.length) return jsonResponse(request, 400, { message: errors[0], errors });
    const suppliedKey = request.headers.get("Idempotency-Key");
    if (suppliedKey && !/^[a-zA-Z0-9-]{16,80}$/.test(suppliedKey)) return jsonResponse(request, 400, { message: "Invalid submission reference." });
    const key = suppliedKey || crypto.randomUUID();
    // Include canonical content so a changed request never reuses another request's email.
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(type + key + JSON.stringify(data))))).map(b => b.toString(16).padStart(2, "0")).join("");
    const reference = `AP-${type === "order" ? "O" : "R"}-${hash.slice(0, 16).toUpperCase()}`;
    data.reference = reference;
    let existing;
    if (env.DB) {
      await env.DB.prepare("INSERT OR IGNORE INTO submissions (reference, kind, payload, created_at) VALUES (?, ?, ?, ?)")
        .bind(reference, type, JSON.stringify(data), new Date().toISOString()).run();
      existing = await env.DB.prepare("SELECT response, owner_email_id FROM submissions WHERE reference = ?").bind(reference).first();
      if (existing?.response && JSON.parse(existing.response).receiptSent) return jsonResponse(request, 200, JSON.parse(existing.response));
    }
    const ownerEmail = type === "order" ? buildOrderEmail(data) : buildReservationEmail(data);
    const customerEmail = type === "order" ? buildOrderReceiptEmail(data) : buildReservationReceiptEmail(data);
    const owner = { ...ownerEmail, from: senderAddress(env), to: ownerAddress(env), replyTo: customer.email, idempotencyKey: `owner/${hash}` };
    const receipt = { ...customerEmail, from: senderAddress(env), to: customer.email, replyTo: ownerAddress(env), idempotencyKey: `receipt/${hash}` };
    const ownerId = existing?.owner_email_id || await sendResendMail(env, owner);
    // An owner notification failure must stop the customer receipt.
    let receiptSent = false, receiptId = null;
    try { receiptId = await sendResendMail(env, receipt); receiptSent = true; }
    catch { console.warn("Customer receipt failed", reference); }
    const result = { message: "Request received.", reference, receiptSent };
    if (type === "order") { result.items = data.items; result.total = Pantry.money(Pantry.total(data.items)); }
    if (env.DB) {
      // Do not turn a completed email submission into a client error if recording its status fails.
      try {
        await env.DB.prepare("UPDATE submissions SET owner_email_id = ?, receipt_email_id = ?, response = ? WHERE reference = ?")
          .bind(ownerId, receiptId, JSON.stringify(result), reference).run();
      } catch { console.error("Submission status could not be saved", reference); }
    }
    return jsonResponse(request, 200, result);
  } catch (error) {
    console.error("Submission service failed", error.name);
    return jsonResponse(request, 503, { message: "We could not confirm your request. Please retry with the same details, or call 03 6288 7654 before placing another order." });
  }
}

function jsonResponse(request, status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders(request),
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function optionsResponse(request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request)
  });
}

function normalizeReservation(payload = {}) {
  return {
    name: String(payload.name || "").trim(),
    phone: String(payload.phone || "").trim(),
    email: String(payload.email || "").trim(),
    date: String(payload.date || "").trim(),
    time: String(payload.time || "").trim(),
    guests: String(payload.guests || "").trim(),
    notes: String(payload.notes || "").trim()
  };
}

function normalizeOrder(payload = {}) {
  const customer = payload.customer || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    customer: {
      name: String(customer.name || "").trim(),
      phone: String(customer.phone || "").trim(),
      email: String(customer.email || "").trim(),
      pickupDate: String(customer.pickupDate || "").trim(),
      pickupTime: String(customer.pickupTime || "").trim(),
      serviceType: String(customer.serviceType || "").trim(),
      cutleryNeeded: customer.cutleryNeeded === true || customer.cutleryNeeded === "Yes",
      cutleryCount: Number(customer.cutleryCount || 0),
      notes: String(customer.notes || "").trim()
    },
    items: items.map(item => Pantry.canonicalItem(item))
  };
}

function validateContact(customer) {
  const errors = [];
  if (!customer.name) errors.push("Please enter your name.");
  if (!customer.phone) errors.push("Please enter your phone number.");
  if (!isValidEmail(customer.email)) errors.push("Please enter a valid email address.");
  return errors;
}

function validateReservation(reservation) {
  const errors = validateContact(reservation);
  const scheduleError = Pantry.dateTimeError(reservation.date, reservation.time, "reservation");
  if (scheduleError) errors.push(scheduleError);
  if (!Number.isInteger(Number(reservation.guests)) || Number(reservation.guests) < 1) errors.push("Guests must be at least 1.");
  return errors;
}

function validateOrder(order) {
  const errors = validateContact(order.customer);
  const scheduleError = Pantry.dateTimeError(order.customer.pickupDate, order.customer.pickupTime, "order");
  if (scheduleError) errors.push(scheduleError);
  if (!["Dine in", "Takeaway"].includes(order.customer.serviceType)) errors.push("Please choose dine in or takeaway.");
  if (order.customer.cutleryNeeded && (!Number.isInteger(order.customer.cutleryCount) || order.customer.cutleryCount < 1 || order.customer.cutleryCount > 50)) errors.push("Please choose between 1 and 50 cutlery sets.");
  if (!order.items.length) errors.push("Please add at least one dish to the order.");
  if (order.items.length > 100) errors.push("Please call us for larger orders.");
  return errors;
}

function buildReservationEmail(reservation) {
  const submittedAt = "Website request";
  const rows = [
    ["Reference", reservation.reference],
    ["Status", "Request received - awaiting restaurant confirmation"],
    ["Name", reservation.name],
    ["Phone", reservation.phone],
    ["Email", reservation.email],
    ["Date", reservation.date],
    ["Time", reservation.time],
    ["Guests", reservation.guests],
    ["Notes", reservation.notes || "No notes"],
    ["Submitted", submittedAt]
  ];

  return {
    subject: `Argyle Pantry reservation: ${reservation.name} - ${reservation.date} ${reservation.time}`,
    text: rows.map(([label, value]) => `${label}: ${value}`).join("\n"),
    html: emailShell("New Reservation", "A customer submitted a table reservation request from the website.", rows)
  };
}

function buildReservationReceiptEmail(reservation) {
  const rows = [
    ["Reference", reservation.reference],
    ["Status", "Request received - awaiting restaurant confirmation"],
    ["Name", reservation.name],
    ["Phone", reservation.phone],
    ["Email", reservation.email],
    ["Date", reservation.date],
    ["Time", reservation.time],
    ["Guests", reservation.guests],
    ["Notes", reservation.notes || "No notes"]
  ];

  return {
    subject: `Your Argyle Pantry reservation request - ${reservation.date} ${reservation.time}`,
    text: [
      "Thank you. We have received your reservation request. Your table is subject to confirmation. Please call 03 6288 7654 for changes.",
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      "If anything changes, please contact Argyle Pantry."
    ].join("\n"),
    html: emailShell("Reservation Received", "Thank you. We have received your reservation request. Your table is subject to confirmation. Please call 03 6288 7654 for changes.", rows)
  };
}

function buildOrderEmail(order) {
  const submittedAt = "Website request";
  const customerRows = orderCustomerRows(order, submittedAt);
  const total = orderTotal(order);

  return {
    subject: `Argyle Pantry order: ${order.customer.name} - ${order.customer.pickupDate} ${order.customer.pickupTime}`,
    text: [
      "Customer",
      ...customerRows.map(([label, value]) => `${label}: ${value}`),
      "",
      "Order",
      ...order.items.map((item) => `${item.quantity} x ${item.displayName} - ${item.price}`),
      `Total (AUD): ${formatMoney(total)}`
    ].join("\n"),
    html: orderEmailShell("New Online Order", customerRows, order, total)
  };
}

function buildOrderReceiptEmail(order) {
  const customerRows = orderCustomerRows(order);
  const total = orderTotal(order);

  return {
    subject: `Your Argyle Pantry order - ${order.customer.pickupDate} ${order.customer.pickupTime}`,
    text: [
      "Thank you. We have received your order request. Your requested time is subject to restaurant confirmation. Pay at the restaurant. Call 03 6288 7654 for changes.",
      "",
      "Customer",
      ...customerRows.map(([label, value]) => `${label}: ${value}`),
      "",
      "Order",
      ...order.items.map((item) => `${item.quantity} x ${item.displayName} - ${item.price}`),
      `Total (AUD): ${formatMoney(total)}`,
      "",
      "If anything changes, please contact Argyle Pantry."
    ].join("\n"),
    html: orderEmailShell("Order Received", customerRows, order, total, "Thank you. We have received your order request. Your requested time is subject to restaurant confirmation. Pay at the restaurant. Call 03 6288 7654 for changes.")
  };
}

async function sendResendMail(env, { from, to, replyTo, subject, text, html, idempotencyKey }) {
  if (env.RESERVATION_DRY_RUN === "true") return "dry-run-email";
  const apiKey = env.RESEND_API_KEY || env.SMTP_PASS;
  if (!apiKey) throw new Error("Email API key is not configured.");

  const payload = { from, to: [to], subject, text, html };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Idempotency-Key": idempotencyKey
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000)
  });

  if (!response.ok) {
    throw new Error(`Email provider returned status ${response.status}`);
  }
  const result = await response.json();
  if (!result.id) throw new Error("Email provider did not confirm acceptance.");
  return result.id;
}

function ownerAddress(env) {
  return env.EMAIL_TO || EMAIL_TO_DEFAULT;
}

function senderAddress(env) {
  return env.SMTP_FROM || env.EMAIL_FROM || FROM_DEFAULT;
}

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "";
  const allowed = [
    "https://argylepantry.com.au",
    "https://www.argylepantry.com.au",
    "http://localhost:4181",
    "http://127.0.0.1:4181"
  ];
  const allowOrigin = allowed.includes(origin) || origin.endsWith(".pages.dev") ? origin : "https://argylepantry.com.au";
  return {
    "Access-Control-Allow-Headers": "Content-Type, Idempotency-Key",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin"
  };
}

function orderCustomerRows(order, submittedAt = "") {
  const rows = [
    ["Reference", order.reference],
    ["Status", "Request received - awaiting restaurant confirmation"],
    ["Payment", "Pay at the restaurant"],
    ["Address", "46 Argyle Street, Hobart"],
    ["Name", order.customer.name],
    ["Phone", order.customer.phone],
    ["Email", order.customer.email],
    ["Pickup date", order.customer.pickupDate],
    ["Pickup time", order.customer.pickupTime],
    ["Service", order.customer.serviceType],
    ["Cutlery", order.customer.cutleryNeeded ? `${order.customer.cutleryCount} set(s)` : "Not required"],
    ["Notes", order.customer.notes || "No notes"]
  ];
  if (submittedAt) rows.push(["Submitted", submittedAt]);
  return rows;
}

function emailShell(label, intro, rows) {
  return `<!doctype html>
    <html>
      <body style="margin:0;background:#f7f3ed;font-family:Arial,sans-serif;color:#24211e;">
        <div style="max-width:680px;margin:0 auto;padding:28px;">
          <div style="background:#ffffff;border:1px solid #e3dbce;border-radius:10px;overflow:hidden;">
            <div style="background:#c82920;color:#fff;padding:22px 26px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(label)}</p>
              <h1 style="margin:0;font-size:26px;">Argyle Pantry</h1>
            </div>
            <div style="padding:24px 26px;">
              <p style="margin:0 0 18px;color:#6b6258;">${escapeHtml(intro)}</p>
              ${rowsTable(rows)}
            </div>
          </div>
        </div>
      </body>
    </html>`;
}

function orderEmailShell(label, customerRows, order, total, intro = "") {
  const itemRows = order.items
    .map((item) => {
      const lineTotal = moneyValue(item.price) * item.quantity;
      return `
        <tr>
          <td style="padding:10px;border:1px solid #e3dbce;">${escapeHtml(item.displayName)}</td>
          <td style="padding:10px;border:1px solid #e3dbce;">${escapeHtml(item.category)}</td>
          <td style="text-align:center;padding:10px;border:1px solid #e3dbce;">${escapeHtml(item.quantity)}</td>
          <td style="text-align:right;padding:10px;border:1px solid #e3dbce;">${escapeHtml(item.price)}</td>
          <td style="text-align:right;padding:10px;border:1px solid #e3dbce;">${escapeHtml(formatMoney(lineTotal))}</td>
        </tr>`;
    })
    .join("");

  return `<!doctype html>
    <html>
      <body style="margin:0;background:#f7f3ed;font-family:Arial,sans-serif;color:#24211e;">
        <div style="max-width:760px;margin:0 auto;padding:28px;">
          <div style="background:#ffffff;border:1px solid #e3dbce;border-radius:10px;overflow:hidden;">
            <div style="background:#c82920;color:#fff;padding:22px 26px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">${escapeHtml(label)}</p>
              <h1 style="margin:0;font-size:26px;">Argyle Pantry</h1>
            </div>
            <div style="padding:24px 26px;">
              ${intro ? `<p style="margin:0 0 18px;color:#6b6258;">${escapeHtml(intro)}</p>` : ""}
              <h2 style="font-size:18px;margin:0 0 12px;">Customer information</h2>
              ${rowsTable(customerRows)}
              <h2 style="font-size:18px;margin:24px 0 12px;">Order details</h2>
              <table style="width:100%;border-collapse:collapse;font-size:14px;">
                <thead>
                  <tr style="background:#f7f3ed;">
                    <th style="text-align:left;padding:10px;border:1px solid #e3dbce;">Dish</th>
                    <th style="text-align:left;padding:10px;border:1px solid #e3dbce;">Category</th>
                    <th style="text-align:center;padding:10px;border:1px solid #e3dbce;">Qty</th>
                    <th style="text-align:right;padding:10px;border:1px solid #e3dbce;">Each</th>
                    <th style="text-align:right;padding:10px;border:1px solid #e3dbce;">Line total</th>
                  </tr>
                </thead>
                <tbody>${itemRows}</tbody>
                <tfoot>
                  <tr>
                    <th colspan="4" style="text-align:right;padding:12px;border:1px solid #e3dbce;">Total (AUD)</th>
                    <td style="text-align:right;padding:12px;border:1px solid #e3dbce;font-weight:700;">${escapeHtml(formatMoney(total))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>
      </body>
    </html>`;
}

function rowsTable(rows) {
  const tableRows = rows
    .map(([label, value]) => `
      <tr>
        <th style="width:34%;text-align:left;padding:12px;border:1px solid #e3dbce;background:#f7f3ed;">${escapeHtml(label)}</th>
        <td style="padding:12px;border:1px solid #e3dbce;">${escapeHtml(value)}</td>
      </tr>`)
    .join("");
  return `<table style="width:100%;border-collapse:collapse;font-size:15px;">${tableRows}</table>`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function orderTotal(order) {
  return order.items.reduce((sum, item) => sum + moneyValue(item.price) * item.quantity, 0);
}

function moneyValue(price) {
  const value = Number(String(price || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
