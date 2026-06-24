const summaryRoot = document.querySelector("#successSummary");
const successTitle = document.querySelector("#successTitle");
const successKicker = document.querySelector("#successKicker");
const successIntro = document.querySelector("#successIntro");

const submission = readSubmission();
const pageType = new URLSearchParams(window.location.search).get("type");

if (submission?.type === "order" || pageType === "order") {
  renderOrderSuccess(submission);
} else if (submission?.type === "reservation" || pageType === "reservation") {
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
  successIntro.textContent = data
    ? "We have received your order. A confirmation has been sent to Argyle Pantry, and we will prepare your food as quickly as we can."
    : "We have received your order. We will prepare your food as quickly as we can.";

  if (!data) {
    summaryRoot.replaceChildren(infoCard("Order confirmation", [["Status", "Order submitted"]]));
    return;
  }

  const customerRows = [
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
  successIntro.textContent = data
    ? "We have received your reservation request. A confirmation has been sent to Argyle Pantry."
    : "We have received your reservation request.";

  if (!data) {
    summaryRoot.replaceChildren(infoCard("Reservation confirmation", [["Status", "Reservation submitted"]]));
    return;
  }

  const rows = [
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
  successKicker.textContent = "Submitted";
  successTitle.textContent = "Thank you";
  successIntro.textContent = "If your request was submitted successfully, Argyle Pantry has received it.";
  summaryRoot.replaceChildren(infoCard("Next step", [["Need help?", "Please contact Argyle Pantry if you want to confirm your request."]]));
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
  totalRow.innerHTML = `<span>Estimated total</span><strong>${escapeHtml(total)}</strong>`;

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
