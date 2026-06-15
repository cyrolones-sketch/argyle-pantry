const http = require("http");
const fs = require("fs");
const path = require("path");
const tls = require("tls");

const ROOT = __dirname;
loadEnvFile(path.join(ROOT, ".env"));

const PORT = Number(process.env.PORT || 4181);
const HOST = process.env.HOST || "0.0.0.0";
const EMAIL_TO = process.env.EMAIL_TO || process.env.RESERVATION_TO || "cyrolones@gmail.com";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.resend.com";
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || (process.env.RESEND_API_KEY ? "resend" : "") || process.env.GMAIL_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || process.env.RESEND_API_KEY || process.env.GMAIL_APP_PASSWORD || "";
const SMTP_FROM = process.env.SMTP_FROM || process.env.EMAIL_FROM || "";
const DRY_RUN = process.env.RESERVATION_DRY_RUN === "true";
const TRADING_OPEN = "10:00";
const TRADING_CLOSE = "20:30";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp"
};

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/reservations") {
      await handleReservation(request, response);
      return;
    }

    if (request.method === "POST" && request.url === "/api/orders") {
      await handleOrder(request, response);
      return;
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      sendJson(response, 405, { message: "Method not allowed." });
      return;
    }

    serveStatic(request, response);
  } catch (error) {
    console.error(error);
    sendJson(response, 500, { message: "Something went wrong. Please try again." });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Argyle Pantry website running at http://${HOST}:${PORT}`);
});

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    value = value.replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function handleReservation(request, response) {
  const payload = await readJsonBody(request);
  const reservation = normalizeReservation(payload);
  const errors = validateReservation(reservation);

  if (errors.length) {
    sendJson(response, 400, { message: errors[0], errors });
    return;
  }

  const ownerEmail = buildReservationEmail(reservation);
  const customerEmail = buildReservationReceiptEmail(reservation);

  if (DRY_RUN) {
    console.log("Reservation dry run:", reservation);
    sendJson(response, 200, { message: "Reservation request received." });
    return;
  }

  if (!isEmailConfigured()) {
    sendJson(response, 500, {
      message: "Reservation email is not configured yet. Please set the Resend API key and sender address on the website server."
    });
    return;
  }

  await sendSmtpMail({
    from: SMTP_FROM,
    to: EMAIL_TO,
    replyTo: reservation.email,
    subject: ownerEmail.subject,
    text: ownerEmail.text,
    html: ownerEmail.html
  });

  await sendSmtpMail({
    from: SMTP_FROM,
    to: reservation.email,
    replyTo: EMAIL_TO,
    subject: customerEmail.subject,
    text: customerEmail.text,
    html: customerEmail.html
  });

  sendJson(response, 200, { message: "Reservation request sent." });
}

async function handleOrder(request, response) {
  const payload = await readJsonBody(request);
  const order = normalizeOrder(payload);
  const errors = validateOrder(order);

  if (errors.length) {
    sendJson(response, 400, { message: errors[0], errors });
    return;
  }

  const ownerEmail = buildOrderEmail(order);
  const customerEmail = buildOrderReceiptEmail(order);

  if (DRY_RUN) {
    console.log("Order dry run:", order);
    sendJson(response, 200, { message: "Order request received." });
    return;
  }

  if (!isEmailConfigured()) {
    sendJson(response, 500, {
      message: "Order email is not configured yet. Please set the Resend API key and sender address on the website server."
    });
    return;
  }

  await sendSmtpMail({
    from: SMTP_FROM,
    to: EMAIL_TO,
    replyTo: order.customer.email,
    subject: ownerEmail.subject,
    text: ownerEmail.text,
    html: ownerEmail.html
  });

  await sendSmtpMail({
    from: SMTP_FROM,
    to: order.customer.email,
    replyTo: EMAIL_TO,
    subject: customerEmail.subject,
    text: customerEmail.text,
    html: customerEmail.html
  });

  sendJson(response, 200, { message: "Order request sent." });
}

function isEmailConfigured() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && SMTP_FROM && EMAIL_TO);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        request.destroy();
        reject(new Error("Request body too large."));
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body || "{}"));
      } catch {
        reject(new Error("Invalid JSON."));
      }
    });
    request.on("error", reject);
  });
}

function normalizeReservation(payload) {
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

function validateReservation(reservation) {
  const errors = [];
  const required = [
    ["name", "Please enter your name."],
    ["phone", "Please enter your phone number."],
    ["email", "Please enter your email address."],
    ["date", "Please choose a reservation date."],
    ["time", "Please choose a reservation time."],
    ["guests", "Please enter the number of guests."]
  ];

  required.forEach(([key, message]) => {
    if (!reservation[key]) errors.push(message);
  });

  if (reservation.email && !isValidEmail(reservation.email)) {
    errors.push("Please enter a valid email address.");
  }

  if (reservation.time && !isWithinTradingHours(reservation.time)) {
    errors.push(`Reservation time must be between ${TRADING_OPEN} and ${TRADING_CLOSE}.`);
  }

  if (reservation.guests && (!Number.isInteger(Number(reservation.guests)) || Number(reservation.guests) < 1)) {
    errors.push("Guests must be at least 1.");
  }

  return errors;
}

function normalizeOrder(payload) {
  const customer = payload.customer || {};
  const items = Array.isArray(payload.items) ? payload.items : [];
  return {
    customer: {
      name: String(customer.name || "").trim(),
      phone: String(customer.phone || "").trim(),
      email: String(customer.email || "").trim(),
      pickupTime: String(customer.pickupTime || "").trim(),
      serviceType: String(customer.serviceType || "").trim(),
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

function validateOrder(order) {
  const errors = [];
  const required = [
    ["name", "Please enter your name."],
    ["phone", "Please enter your phone number."],
    ["email", "Please enter your email address."],
    ["pickupTime", "Please choose a pickup time."],
    ["serviceType", "Please choose dine in or takeaway."]
  ];

  required.forEach(([key, message]) => {
    if (!order.customer[key]) errors.push(message);
  });

  if (!["Dine in", "Takeaway"].includes(order.customer.serviceType)) {
    errors.push("Please choose dine in or takeaway.");
  }

  if (order.customer.email && !isValidEmail(order.customer.email)) {
    errors.push("Please enter a valid email address.");
  }

  if (order.customer.pickupTime && !isWithinTradingHours(order.customer.pickupTime)) {
    errors.push(`Pickup time must be between ${TRADING_OPEN} and ${TRADING_CLOSE}.`);
  }

  if (!order.items.length) {
    errors.push("Please add at least one dish to the order.");
  }

  order.items.forEach((item) => {
    if (!item.displayName || !Number.isInteger(item.quantity) || item.quantity < 1 || !item.price) {
      errors.push("One or more order items are invalid.");
    }
  });

  return errors;
}

function buildReservationEmail(reservation) {
  const submittedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Hobart"
  });
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

  const tableRows = rows
    .map(([label, value]) => `
      <tr>
        <th style="width:34%;text-align:left;padding:12px;border:1px solid #e3dbce;background:#f7f3ed;">${escapeHtml(label)}</th>
        <td style="padding:12px;border:1px solid #e3dbce;">${escapeHtml(value)}</td>
      </tr>`)
    .join("");

  const subject = `Argyle Pantry reservation: ${reservation.name} - ${reservation.date} ${reservation.time}`;
  const text = rows.map(([label, value]) => `${label}: ${value}`).join("\n");
  const html = `<!doctype html>
    <html>
      <body style="margin:0;background:#f7f3ed;font-family:Arial,sans-serif;color:#24211e;">
        <div style="max-width:680px;margin:0 auto;padding:28px;">
          <div style="background:#ffffff;border:1px solid #e3dbce;border-radius:10px;overflow:hidden;">
            <div style="background:#c82920;color:#fff;padding:22px 26px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">New Reservation</p>
              <h1 style="margin:0;font-size:26px;">Argyle Pantry</h1>
            </div>
            <div style="padding:24px 26px;">
              <p style="margin:0 0 18px;color:#6b6258;">A customer submitted a table reservation request from the website.</p>
              <table style="width:100%;border-collapse:collapse;font-size:15px;">
                ${tableRows}
              </table>
            </div>
          </div>
        </div>
      </body>
    </html>`;

  return { subject, text, html };
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

  const tableRows = rows
    .map(([label, value]) => `
      <tr>
        <th style="width:34%;text-align:left;padding:12px;border:1px solid #e3dbce;background:#f7f3ed;">${escapeHtml(label)}</th>
        <td style="padding:12px;border:1px solid #e3dbce;">${escapeHtml(value)}</td>
      </tr>`)
    .join("");

  const subject = `Your Argyle Pantry reservation request - ${reservation.date} ${reservation.time}`;
  const text = [
    "Thank you. We have received your reservation request.",
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    "If anything changes, please contact Argyle Pantry."
  ].join("\n");
  const html = `<!doctype html>
    <html>
      <body style="margin:0;background:#f7f3ed;font-family:Arial,sans-serif;color:#24211e;">
        <div style="max-width:680px;margin:0 auto;padding:28px;">
          <div style="background:#ffffff;border:1px solid #e3dbce;border-radius:10px;overflow:hidden;">
            <div style="background:#c82920;color:#fff;padding:22px 26px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Reservation Received</p>
              <h1 style="margin:0;font-size:26px;">Argyle Pantry</h1>
            </div>
            <div style="padding:24px 26px;">
              <p style="margin:0 0 18px;color:#6b6258;">Thank you. We have received your reservation request.</p>
              <table style="width:100%;border-collapse:collapse;font-size:15px;">
                ${tableRows}
              </table>
            </div>
          </div>
        </div>
      </body>
    </html>`;

  return { subject, text, html };
}

function buildOrderEmail(order) {
  const submittedAt = new Date().toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Australia/Hobart"
  });
  const customerRows = [
    ["Name", order.customer.name],
    ["Phone", order.customer.phone],
    ["Email", order.customer.email],
    ["Pickup time", order.customer.pickupTime],
    ["Service", order.customer.serviceType],
    ["Notes", order.customer.notes || "No notes"],
    ["Submitted", submittedAt]
  ];
  const total = order.items.reduce((sum, item) => sum + moneyValue(item.price) * item.quantity, 0);

  const customerTableRows = customerRows
    .map(([label, value]) => `
      <tr>
        <th style="width:34%;text-align:left;padding:12px;border:1px solid #e3dbce;background:#f7f3ed;">${escapeHtml(label)}</th>
        <td style="padding:12px;border:1px solid #e3dbce;">${escapeHtml(value)}</td>
      </tr>`)
    .join("");

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

  const subject = `Argyle Pantry order: ${order.customer.name} - ${order.customer.pickupTime}`;
  const text = [
    "Customer",
    ...customerRows.map(([label, value]) => `${label}: ${value}`),
    "",
    "Order",
    ...order.items.map((item) => `${item.quantity} x ${item.displayName} - ${item.price}`),
    `Estimated total: ${formatMoney(total)}`
  ].join("\n");
  const html = `<!doctype html>
    <html>
      <body style="margin:0;background:#f7f3ed;font-family:Arial,sans-serif;color:#24211e;">
        <div style="max-width:760px;margin:0 auto;padding:28px;">
          <div style="background:#ffffff;border:1px solid #e3dbce;border-radius:10px;overflow:hidden;">
            <div style="background:#c82920;color:#fff;padding:22px 26px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">New Online Order</p>
              <h1 style="margin:0;font-size:26px;">Argyle Pantry</h1>
            </div>
            <div style="padding:24px 26px;">
              <h2 style="font-size:18px;margin:0 0 12px;">Customer information</h2>
              <table style="width:100%;border-collapse:collapse;font-size:15px;margin-bottom:24px;">
                ${customerTableRows}
              </table>
              <h2 style="font-size:18px;margin:0 0 12px;">Order details</h2>
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

  return { subject, text, html };
}

function buildOrderReceiptEmail(order) {
  const customerRows = [
    ["Name", order.customer.name],
    ["Phone", order.customer.phone],
    ["Email", order.customer.email],
    ["Pickup time", order.customer.pickupTime],
    ["Service", order.customer.serviceType],
    ["Notes", order.customer.notes || "No notes"]
  ];
  const total = order.items.reduce((sum, item) => sum + moneyValue(item.price) * item.quantity, 0);

  const customerTableRows = customerRows
    .map(([label, value]) => `
      <tr>
        <th style="width:34%;text-align:left;padding:12px;border:1px solid #e3dbce;background:#f7f3ed;">${escapeHtml(label)}</th>
        <td style="padding:12px;border:1px solid #e3dbce;">${escapeHtml(value)}</td>
      </tr>`)
    .join("");

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

  const subject = `Your Argyle Pantry order - ${order.customer.pickupTime}`;
  const text = [
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
  ].join("\n");
  const html = `<!doctype html>
    <html>
      <body style="margin:0;background:#f7f3ed;font-family:Arial,sans-serif;color:#24211e;">
        <div style="max-width:760px;margin:0 auto;padding:28px;">
          <div style="background:#ffffff;border:1px solid #e3dbce;border-radius:10px;overflow:hidden;">
            <div style="background:#c82920;color:#fff;padding:22px 26px;">
              <p style="margin:0 0 6px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Order Received</p>
              <h1 style="margin:0;font-size:26px;">Argyle Pantry</h1>
            </div>
            <div style="padding:24px 26px;">
              <p style="margin:0 0 18px;color:#6b6258;">Thank you. We have received your order.</p>
              <h2 style="font-size:18px;margin:0 0 12px;">Customer information</h2>
              <table style="width:100%;border-collapse:collapse;font-size:15px;margin-bottom:24px;">
                ${customerTableRows}
              </table>
              <h2 style="font-size:18px;margin:0 0 12px;">Order details</h2>
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

  return { subject, text, html };
}

function sendSmtpMail({ from, to, replyTo, subject, text, html }) {
  const fromEmail = extractEmail(from);
  const boundary = `argyle-${Date.now().toString(36)}`;
  const headers = [
    `From: ${formatMailbox("Argyle Pantry Website", fromEmail)}`,
    `To: ${to}`,
    `Subject: ${mimeWord(subject)}`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`
  ];
  if (replyTo) headers.splice(2, 0, `Reply-To: ${replyTo}`);

  const message = [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    text,
    "",
    `--${boundary}`,
    "Content-Type: text/html; charset=utf-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    html,
    "",
    `--${boundary}--`,
    ""
  ].join("\r\n");

  return smtpTransaction([
    ["EHLO argylepantry.local"],
    ["AUTH LOGIN"],
    [Buffer.from(SMTP_USER).toString("base64")],
    [Buffer.from(SMTP_PASS).toString("base64")],
    [`MAIL FROM:<${fromEmail}>`],
    [`RCPT TO:<${to}>`],
    ["DATA"],
    [`${dotStuff(message)}\r\n.`],
    ["QUIT"]
  ]);
}

function smtpTransaction(commands) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(SMTP_PORT, SMTP_HOST, { servername: SMTP_HOST });
    let buffer = "";
    let index = -1;

    socket.setEncoding("utf8");
    socket.setTimeout(20000);

    socket.on("data", (chunk) => {
      buffer += chunk;
      if (!hasCompleteSmtpResponse(buffer)) return;
      const response = buffer;
      buffer = "";
      const code = Number(response.slice(0, 3));

      if (code >= 400) {
        socket.destroy();
        reject(new Error(`Email server rejected the message: ${response.trim()}`));
        return;
      }

      index += 1;
      if (index >= commands.length) {
        socket.end();
        resolve();
        return;
      }

      socket.write(`${commands[index][0]}\r\n`);
    });

    socket.on("timeout", () => {
      socket.destroy();
      reject(new Error("Email server timed out."));
    });
    socket.on("error", reject);
  });
}

function hasCompleteSmtpResponse(response) {
  const lines = response.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return false;
  return /^\d{3} /.test(lines[lines.length - 1]);
}

function serveStatic(request, response) {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const pathname = decodeURIComponent(url.pathname);
  const requestedPath = pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = path.normalize(path.join(ROOT, requestedPath));

  if (!filePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": contentTypes[ext] || "application/octet-stream"
    });
    if (request.method === "HEAD") {
      response.end();
      return;
    }
    fs.createReadStream(filePath).pipe(response);
  });
}

function sendJson(response, status, payload) {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function moneyValue(price) {
  const value = Number(String(price || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function formatMoney(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || ""));
}

function isWithinTradingHours(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) return false;
  const minutes = timeToMinutes(value);
  return minutes >= timeToMinutes(TRADING_OPEN) && minutes <= timeToMinutes(TRADING_CLOSE);
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function extractEmail(value) {
  const match = String(value).match(/<([^>]+)>/);
  return match ? match[1] : String(value).trim();
}

function formatMailbox(name, email) {
  return `${mimeWord(name)} <${email}>`;
}

function mimeWord(value) {
  return `=?UTF-8?B?${Buffer.from(String(value), "utf8").toString("base64")}?=`;
}

function dotStuff(message) {
  return message.replace(/^\./gm, "..");
}
