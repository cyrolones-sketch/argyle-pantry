const EMAIL_TO_DEFAULT = "cyrolones@gmail.com";
const FROM_DEFAULT = "Argyle Pantry <orders@argylepantry.com.au>";
const TRADING_OPEN = "11:30";
const TRADING_CLOSE = "20:30";
const MIN_PICKUP_NOTICE_MINUTES = 15;
const MIN_PICKUP_NOTICE_MESSAGE = "Please choose a pickup time at least 15 minutes from now. We need at least 15 minutes to prepare your food, and during busy periods it may take a little longer. We will prepare your order as quickly as we can.";

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

    return env.ASSETS.fetch(request);
  }
};

async function handleReservation(request, env) {
  const reservation = normalizeReservation(await readJson(request));
  const errors = validateReservation(reservation);

  if (errors.length) {
    return jsonResponse(request, 400, { message: errors[0], errors });
  }

  const ownerEmail = buildReservationEmail(reservation);
  const customerEmail = buildReservationReceiptEmail(reservation);

  try {
    const receiptSent = await sendOwnerThenCustomerReceipt(env, {
      from: senderAddress(env),
      to: ownerAddress(env),
      replyTo: reservation.email,
      subject: ownerEmail.subject,
      text: ownerEmail.text,
      html: ownerEmail.html
    }, {
      from: senderAddress(env),
      to: reservation.email,
      replyTo: ownerAddress(env),
      subject: customerEmail.subject,
      text: customerEmail.text,
      html: customerEmail.html
    });

    return jsonResponse(request, 200, { message: "Reservation request sent.", receiptSent });
  } catch (error) {
    console.error("Reservation email failed:", error.message);
    return jsonResponse(request, 500, { message: "Reservation could not be sent. Please try again or call the restaurant." });
  }
}

async function handleOrder(request, env) {
  const order = normalizeOrder(await readJson(request));
  const errors = validateOrder(order);

  if (errors.length) {
    return jsonResponse(request, 400, { message: errors[0], errors });
  }

  const ownerEmail = buildOrderEmail(order);
  const customerEmail = buildOrderReceiptEmail(order);

  try {
    const receiptSent = await sendOwnerThenCustomerReceipt(env, {
      from: senderAddress(env),
      to: ownerAddress(env),
      replyTo: order.customer.email,
      subject: ownerEmail.subject,
      text: ownerEmail.text,
      html: ownerEmail.html
    }, {
      from: senderAddress(env),
      to: order.customer.email,
      replyTo: ownerAddress(env),
      subject: customerEmail.subject,
      text: customerEmail.text,
      html: customerEmail.html
    });

    return jsonResponse(request, 200, { message: "Order request sent.", receiptSent });
  } catch (error) {
    console.error("Order email failed:", error.message);
    return jsonResponse(request, 500, { message: "Order could not be sent. Please try again or call the restaurant." });
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

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
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
    items: items.map((item) => ({
      displayName: String(item.displayName || item.name || "").trim(),
      category: String(item.category || "").trim(),
      variant: String(item.variant || "").trim(),
      price: String(item.price || "").trim(),
      quantity: Number(item.quantity || 0)
    }))
  };
}

function validateReservation(reservation) {
  const errors = [];
  [
    ["name", "Please enter your name."],
    ["phone", "Please enter your phone number."],
    ["email", "Please enter your email address."],
    ["date", "Please choose a reservation date."],
    ["time", "Please choose a reservation time."],
    ["guests", "Please enter the number of guests."]
  ].forEach(([key, message]) => {
    if (!reservation[key]) errors.push(message);
  });

  if (reservation.email && !isValidEmail(reservation.email)) errors.push("Please enter a valid email address.");
  if (reservation.date && !isValidDateValue(reservation.date)) errors.push("Please choose a valid reservation date.");
  if (reservation.time && !isWithinTradingHours(reservation.time)) errors.push(`Reservation time must be between ${TRADING_OPEN} and ${TRADING_CLOSE}.`);
  if (reservation.date && isSaturday(reservation.date)) errors.push("Argyle Pantry is closed on Saturdays. Please choose another reservation date.");
  if (reservation.guests && (!Number.isInteger(Number(reservation.guests)) || Number(reservation.guests) < 1)) errors.push("Guests must be at least 1.");

  return errors;
}

function validateOrder(order) {
  const errors = [];
  [
    ["name", "Please enter your name."],
    ["phone", "Please enter your phone number."],
    ["email", "Please enter your email address."],
    ["pickupDate", "Please choose a pickup date."],
    ["pickupTime", "Please choose a pickup time."],
    ["serviceType", "Please choose dine in or takeaway."]
  ].forEach(([key, message]) => {
    if (!order.customer[key]) errors.push(message);
  });

  if (!["Dine in", "Takeaway"].includes(order.customer.serviceType)) errors.push("Please choose dine in or takeaway.");
  if (order.customer.email && !isValidEmail(order.customer.email)) errors.push("Please enter a valid email address.");
  if (order.customer.pickupDate && !isValidDateValue(order.customer.pickupDate)) errors.push("Please choose a valid pickup date.");
  if (order.customer.pickupTime && !isWithinTradingHours(order.customer.pickupTime)) errors.push(`Pickup time must be between ${TRADING_OPEN} and ${TRADING_CLOSE}.`);
  if (order.customer.pickupDate && isSaturday(order.customer.pickupDate)) errors.push("Argyle Pantry is closed on Saturdays. Please choose another pickup date.");
  if (order.customer.pickupDate && order.customer.pickupDate < hobartDateTimeParts().date) errors.push("Please choose today or a future pickup date.");
  if (order.customer.pickupDate && order.customer.pickupTime && !hasMinimumPickupNotice(order.customer.pickupDate, order.customer.pickupTime)) {
    errors.push(MIN_PICKUP_NOTICE_MESSAGE);
  }
  if (order.customer.cutleryNeeded && (!Number.isInteger(order.customer.cutleryCount) || order.customer.cutleryCount < 1 || order.customer.cutleryCount > 50)) {
    errors.push("Please choose between 1 and 50 cutlery sets.");
  }
  if (!order.items.length) errors.push("Please add at least one dish to the order.");
  order.items.forEach((item) => {
    if (!item.displayName || !Number.isInteger(item.quantity) || item.quantity < 1 || !item.price) {
      errors.push("One or more order items are invalid.");
    }
  });

  return errors;
}

function buildReservationEmail(reservation) {
  const submittedAt = hobartNow();
  const rows = [
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
      "Thank you. We have received your reservation request.",
      "",
      ...rows.map(([label, value]) => `${label}: ${value}`),
      "",
      "If anything changes, please contact Argyle Pantry."
    ].join("\n"),
    html: emailShell("Reservation Received", "Thank you. We have received your reservation request.", rows)
  };
}

function buildOrderEmail(order) {
  const submittedAt = hobartNow();
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
      `Estimated total: ${formatMoney(total)}`
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
      "Thank you. We have received your order.",
      "",
      "Customer",
      ...customerRows.map(([label, value]) => `${label}: ${value}`),
      "",
      "Order",
      ...order.items.map((item) => `${item.quantity} x ${item.displayName} - ${item.price}`),
      `Estimated total: ${formatMoney(total)}`,
      "",
      "If anything changes, please contact Argyle Pantry."
    ].join("\n"),
    html: orderEmailShell("Order Received", customerRows, order, total, "Thank you. We have received your order.")
  };
}

async function sendOwnerThenCustomerReceipt(env, ownerMailOptions, customerMailOptions) {
  await sendResendMail(env, ownerMailOptions);
  try {
    await sendResendMail(env, customerMailOptions);
    return true;
  } catch (error) {
    console.warn("Customer receipt email could not be sent:", error.message);
    return false;
  }
}

async function sendResendMail(env, { from, to, replyTo, subject, text, html }) {
  const apiKey = env.RESEND_API_KEY || env.SMTP_PASS;
  if (!apiKey) throw new Error("Email API key is not configured.");

  const payload = { from, to: [to], subject, text, html };
  if (replyTo) payload.reply_to = replyTo;

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    throw new Error(`Resend rejected the message: ${response.status} ${await response.text()}`);
  }
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
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Origin": allowOrigin,
    "Vary": "Origin"
  };
}

function orderCustomerRows(order, submittedAt = "") {
  const rows = [
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
                    <th colspan="4" style="text-align:right;padding:12px;border:1px solid #e3dbce;">Estimated total</th>
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

function isValidDateValue(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [, year, month, day] = match.map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function isSaturday(value) {
  const [year, month, day] = String(value).split("-").map(Number);
  return Boolean(year && month && day) && new Date(year, month - 1, day).getDay() === 6;
}

function isWithinTradingHours(value) {
  return /^\d{2}:\d{2}$/.test(value) && value >= TRADING_OPEN && value <= TRADING_CLOSE;
}

function hasMinimumPickupNotice(dateValue, timeValue) {
  const now = hobartDateTimeParts();
  if (dateValue > now.date) return true;
  if (dateValue < now.date) return false;
  return timeToMinutes(timeValue) >= now.minutes + MIN_PICKUP_NOTICE_MINUTES;
}

function hobartDateTimeParts() {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: "Australia/Hobart",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date()).reduce((values, part) => {
    values[part.type] = part.value;
    return values;
  }, {});

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function hobartNow() {
  return new Date().toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Hobart"
  });
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
