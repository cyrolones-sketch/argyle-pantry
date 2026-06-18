const CART_STORAGE_KEY = "argylePantryCart";
const checkoutForm = document.querySelector("#checkoutForm");
const checkoutOrderList = document.querySelector("#checkoutOrderList");
const checkoutItemCount = document.querySelector("#checkoutItemCount");
const checkoutEmpty = document.querySelector("#checkoutEmpty");
const checkoutTotal = document.querySelector("#checkoutTotal");
const checkoutMessage = document.querySelector("#checkoutMessage");
const TRADING_OPEN = "11:30";
const TRADING_CLOSE = "20:30";
const SERVICE_WAKE_DELAYS = [0, 2000, 4000, 8000];

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

async function waitForOrderService() {
  for (const delay of SERVICE_WAKE_DELAYS) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      const response = await fetch(`/api/health?t=${Date.now()}`, { cache: "no-store" });
      if (response.ok) return;
    } catch {
      // Render may still be waking from sleep; try again after the next delay.
    }
  }
  throw new TypeError("Order service is unavailable.");
}

if (checkoutForm) {
  const pickupDateInput = checkoutForm.querySelector('input[name="pickupDate"]');
  const pickupTimeInput = checkoutForm.querySelector('input[name="pickupTime"]');
  const cutleryChoices = checkoutForm.querySelectorAll('input[name="cutleryNeeded"]');
  const cutleryCountField = checkoutForm.querySelector("#cutleryCountField");
  const cutleryCountInput = checkoutForm.querySelector('input[name="cutleryCount"]');

  if (pickupDateInput) {
    pickupDateInput.min = localDateValue(new Date());
    pickupDateInput.addEventListener("change", () => validateOpenDate(pickupDateInput));
  }
  if (pickupTimeInput) {
    pickupTimeInput.min = TRADING_OPEN;
    pickupTimeInput.max = TRADING_CLOSE;
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
    if (pickupDateInput && !validateOpenDate(pickupDateInput)) {
      pickupDateInput.reportValidity();
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
      submitButton.textContent = "Connecting...";
      await waitForOrderService();
      submitButton.textContent = "Sending...";
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(checkoutPayload(checkoutForm))
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.message || "Order could not be sent. Please try again.");
      }

      localStorage.removeItem(CART_STORAGE_KEY);
      cart = [];
      renderCheckoutOrder();
      checkoutForm.reset();
      if (pickupDateInput) pickupDateInput.min = localDateValue(new Date());
      updateCutleryField();
      const successMessage = result.receiptSent === false
        ? "Thank you. Your order has been sent to Argyle Pantry."
        : "Thank you. Your order has been sent. A receipt has also been emailed to you.";
      setCheckoutMessage(successMessage, "success");
    } catch (error) {
      const message = error instanceof TypeError
        ? "The order service is taking longer than expected to start. Please wait a moment and try again."
        : error.message;
      setCheckoutMessage(message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}

waitForOrderService().catch(() => {});

function localDateValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isSaturday(dateValue) {
  const [year, month, day] = String(dateValue).split("-").map(Number);
  return Boolean(year && month && day) && new Date(year, month - 1, day).getDay() === 6;
}

function validateOpenDate(input) {
  input.setCustomValidity(isSaturday(input.value) ? "Argyle Pantry is closed on Saturdays. Please choose another day." : "");
  return input.checkValidity();
}

renderCheckoutOrder();
