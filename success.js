const summaryRoot = document.querySelector("#successSummary");
const successTitle = document.querySelector("#successTitle");
const successKicker = document.querySelector("#successKicker");
const successIntro = document.querySelector("#successIntro");

const submission = readSubmission();
const pageType = new URLSearchParams(window.location.search).get("type");

const validSubmission = submission?.reference && submission.type === pageType && Date.now() - Date.parse(submission.submittedAt) >= 0 && Date.now() - Date.parse(submission.submittedAt) < 24 * 60 * 60 * 1000;
if (validSubmission && submission.type === "order" && submission.customer && Array.isArray(submission.items)) {
  renderOrderSuccess(submission);
} else if (validSubmission && submission.type === "reservation" && submission.reservation) {
  renderReservationSuccess(submission);
} else {
  renderFallback();
}

function readSubmission() {
  try {
    return JSON.parse(sessionStorage.getItem("argylePantrySubmission") || "null");
  } catch {
    return null;
  }
}

function renderOrderSuccess(data) {
  successKicker.textContent = "Order received";
  successTitle.textContent = "Thank you for your order";
  successIntro.textContent = "Your order request has been sent to Argyle Pantry. Your requested time is subject to restaurant confirmation. Pay at the restaurant when you collect your meal.";

  if (!data) {
    summaryRoot.replaceChildren(infoCard("Order confirmation", [["Status", "Order submitted"]]));
    return;
  }

  const customerRows = [
    ["Reference", data.reference],
    ["Status", "Request received - awaiting restaurant confirmation"],
    ["Pickup address", "46 Argyle Street, Hobart"],
    ["Name", data.customer.name],
    ["Phone", data.customer.phone],
    ["Email", data.customer.email],
    ["Pickup date", data.customer.pickupDate],
    ["Pickup time", data.customer.pickupTime],
    ["Service", data.customer.serviceType],
    ["Cutlery", data.customer.cutleryNeeded ? `${data.customer.cutleryCount} set(s)` : "Not required"],
    ["Notes", data.customer.notes || "No notes"]
  ];

  summaryRoot.replaceChildren(
    infoCard("Pickup details", customerRows),
    orderCard(data.items || [], data.total || "$0.00"),
    receiptNote(data.receiptSent)
  );
}

function renderReservationSuccess(data) {
  successKicker.textContent = "Reservation received";
  successTitle.textContent = "Thank you for your reservation";
  successIntro.textContent = "Your reservation request has been sent to Argyle Pantry. This is not yet a confirmed booking. Please call us if you need to confirm your table or make a change.";

  if (!data) {
    summaryRoot.replaceChildren(infoCard("Reservation confirmation", [["Status", "Reservation submitted"]]));
    return;
  }

  const rows = [
    ["Reference", data.reference],
    ["Status", "Request received - awaiting restaurant confirmation"],
    ["Name", data.reservation.name],
    ["Phone", data.reservation.phone],
    ["Email", data.reservation.email],
    ["Date", data.reservation.date],
    ["Time", data.reservation.time],
    ["Guests", data.reservation.guests],
    ["Notes", data.reservation.notes || "No notes"]
  ];

  summaryRoot.replaceChildren(
    infoCard("Reservation details", rows),
    receiptNote(data.receiptSent)
  );
}

function renderFallback() {
  successKicker.textContent = "No submission details";
  successTitle.textContent = "We cannot verify a request here";
  successIntro.textContent = "This page does not contain a recent successful submission. Check your email, or call us before placing the same order again.";
  summaryRoot.replaceChildren(infoCard("Need help?", [["Phone", "03 6288 7654"], ["Address", "46 Argyle Street, Hobart"]]));
}

function infoCard(title, rows) {
  const card = document.createElement("section");
  card.className = "success-card";

  const heading = document.createElement("h2");
  heading.textContent = title;
  card.append(heading);

  const list = document.createElement("dl");
  rows.forEach(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = value || "-";
    list.append(term, detail);
  });
  card.append(list);
  return card;
}

function orderCard(items, total) {
  const card = document.createElement("section");
  card.className = "success-card success-order-card";

  const heading = document.createElement("h2");
  heading.textContent = "Order details";
  card.append(heading);

  const list = document.createElement("ul");
  list.className = "success-order-list";

  items.forEach((item) => {
    const row = document.createElement("li");
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.displayName || item.name;
    const meta = document.createElement("span");
    meta.textContent = `${item.category || "Menu"} · ${item.price}`;
    details.append(name, meta);

    const quantity = document.createElement("strong");
    quantity.textContent = `x${item.quantity}`;
    row.append(details, quantity);
    list.append(row);
  });

  const totalRow = document.createElement("div");
  totalRow.className = "success-total";
  totalRow.innerHTML = `<span>Total (AUD)</span><strong>${escapeHtml(total)}</strong>`;

  card.append(list, totalRow);
  return card;
}

function receiptNote(receiptSent) {
  const note = document.createElement("p");
  note.className = "success-receipt-note";
  note.textContent = receiptSent
    ? "A customer receipt has also been sent to the email address provided."
    : "Your request was sent to Argyle Pantry. The customer receipt email could not be sent, so please keep this page for your records.";
  return note;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
