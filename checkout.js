const CART_STORAGE_KEY = "argylePantryCart";
const checkoutForm = document.querySelector("#checkoutForm");
const checkoutOrderList = document.querySelector("#checkoutOrderList");
const checkoutItemCount = document.querySelector("#checkoutItemCount");
const checkoutEmpty = document.querySelector("#checkoutEmpty");
const checkoutTotal = document.querySelector("#checkoutTotal");
const checkoutMessage = document.querySelector("#checkoutMessage");
const TRADING_OPEN = "11:30";
const TRADING_CLOSE = "20:30";
const MIN_PICKUP_NOTICE_MINUTES = 15;
const MIN_PICKUP_NOTICE_MESSAGE = "Please choose a pickup time at least 15 minutes from now. We need at least 15 minutes to prepare your food, and during busy periods it may take a little longer. We will prepare your order as quickly as we can.";

let cart = loadCart();

function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => item && item.id && item.quantity > 0) : [];
  } catch {
    return [];
  }
}

function moneyValue(price) {
  const value = Number(String(price || "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(value) ? value : 0;
}

function formatMoney(value) {
  return `$${value.toFixed(2)}`;
}

function renderCheckoutOrder() {
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);
  const orderTotal = cart.reduce((sum, item) => sum + moneyValue(item.price) * item.quantity, 0);
  checkoutItemCount.textContent = `${totalItems} ${totalItems === 1 ? "item" : "items"}`;
  checkoutEmpty.hidden = cart.length > 0;
  checkoutForm.hidden = cart.length === 0;
  checkoutTotal.hidden = cart.length === 0;
  checkoutTotal.textContent = `Estimated total ${formatMoney(orderTotal)}`;

  const fragment = document.createDocumentFragment();
  cart.forEach((item) => {
    const row = document.createElement("li");
    row.className = "order-row";

    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.displayName || item.name;
    const meta = document.createElement("span");
    meta.textContent = `${item.category} · ${item.price}`;
    details.append(name, meta);

    const quantity = document.createElement("strong");
    quantity.className = "checkout-line-quantity";
    quantity.textContent = `x${item.quantity}`;
    row.append(details, quantity);
    fragment.appendChild(row);
  });
  checkoutOrderList.replaceChildren(fragment);
}

function checkoutPayload(form) {
  const data = new FormData(form);
  return {
    customer: {
      name: String(data.get("name") || "").trim(),
      phone: String(data.get("phone") || "").trim(),
      email: String(data.get("email") || "").trim(),
      pickupDate: String(data.get("pickupDate") || "").trim(),
      pickupTime: String(data.get("pickupTime") || "").trim(),
      serviceType: String(data.get("serviceType") || "").trim(),
      cutleryNeeded: data.get("cutleryNeeded") === "Yes",
      cutleryCount: data.get("cutleryNeeded") === "Yes" ? Number(data.get("cutleryCount") || 0) : 0,
      notes: String(data.get("notes") || "").trim()
    },
    items: cart.map((item) => ({
      id: item.id,
      name: item.name,
      displayName: item.displayName || item.name,
      category: item.category,
      variant: item.variant || "",
      price: item.price,
      quantity: item.quantity
    }))
  };
}

function setCheckoutMessage(text, type = "") {
  checkoutMessage.textContent = text;
  checkoutMessage.dataset.type = type;
}

if (checkoutForm) {
  const pickupDateInput = checkoutForm.querySelector('input[name="pickupDate"]');
  const pickupTimeInput = checkoutForm.querySelector('input[name="pickupTime"]');
  const cutleryChoices = checkoutForm.querySelectorAll('input[name="cutleryNeeded"]');
  const cutleryCountField = checkoutForm.querySelector("#cutleryCountField");
  const cutleryCountInput = checkoutForm.querySelector('input[name="cutleryCount"]');

  if (pickupDateInput) {
    pickupDateInput.min = hobartDateTimeParts().date;
    pickupDateInput.addEventListener("change", () => validatePickupDateTime(pickupDateInput, pickupTimeInput));
  }
  if (pickupTimeInput) {
    pickupTimeInput.min = TRADING_OPEN;
    pickupTimeInput.max = TRADING_CLOSE;
    pickupTimeInput.addEventListener("input", () => validatePickupDateTime(pickupDateInput, pickupTimeInput));
    pickupTimeInput.addEventListener("change", () => validatePickupDateTime(pickupDateInput, pickupTimeInput));
  }

  const updateCutleryField = () => {
    const needsCutlery = checkoutForm.querySelector('input[name="cutleryNeeded"]:checked')?.value === "Yes";
    cutleryCountField.hidden = !needsCutlery;
    cutleryCountInput.disabled = !needsCutlery;
    cutleryCountInput.required = needsCutlery;
    if (!needsCutlery) cutleryCountInput.value = "";
  };
  cutleryChoices.forEach((choice) => choice.addEventListener("change", updateCutleryField));
  updateCutleryField();

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!cart.length) {
      setCheckoutMessage("Please add dishes to your order first.", "error");
      return;
    }
    if (!validatePickupDateTime(pickupDateInput, pickupTimeInput)) {
      (pickupDateInput && !pickupDateInput.checkValidity() ? pickupDateInput : pickupTimeInput)?.reportValidity();
      return;
    }
    if (!checkoutForm.checkValidity()) {
      checkoutForm.reportValidity();
      return;
    }

    const submitButton = checkoutForm.querySelector('button[type="submit"]');
    const originalText = submitButton.textContent;
    submitButton.disabled = true;
    submitButton.textContent = "Sending...";
    setCheckoutMessage("", "");

    try {
      submitButton.textContent = "Sending...";
      const payload = checkoutPayload(checkoutForm);
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Order could not be sent. Please try again.");
      }

      saveSubmissionSummary({
        type: "order",
        customer: payload.customer,
        items: payload.items,
        total: formatMoney(payload.items.reduce((sum, item) => sum + moneyValue(item.price) * item.quantity, 0)),
        receiptSent: result.receiptSent !== false,
        submittedAt: new Date().toISOString()
      });
      localStorage.removeItem(CART_STORAGE_KEY);
      window.location.href = "success.html?type=order";
    } catch (error) {
      const message = error instanceof TypeError
        ? "The order service could not be reached. Please check your connection and try again."
        : error.message;
      setCheckoutMessage(message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}

function isSaturday(dateValue) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  return Boolean(year && month && day) && new Date(year, month - 1, day).getDay() === 6;
}

function validatePickupDateTime(dateInput, timeInput) {
  if (!dateInput || !timeInput) return true;

  dateInput.setCustomValidity("");
  timeInput.setCustomValidity("");

  if (isSaturday(dateInput.value)) {
    dateInput.setCustomValidity("Argyle Pantry is closed on Saturdays. Please choose another day.");
  } else if (dateInput.value && dateInput.value < hobartDateTimeParts().date) {
    dateInput.setCustomValidity("Please choose today or a future pickup date.");
  }

  if (dateInput.checkValidity() && dateInput.value && timeInput.value && !hasMinimumPickupNotice(dateInput.value, timeInput.value)) {
    timeInput.setCustomValidity(MIN_PICKUP_NOTICE_MESSAGE);
  }

  return dateInput.checkValidity() && timeInput.checkValidity();
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

function saveSubmissionSummary(summary) {
  try {
    sessionStorage.setItem("argylePantrySubmission", JSON.stringify(summary));
  } catch {
    // The success page still has a fallback if session storage is unavailable.
  }
}

renderCheckoutOrder();
