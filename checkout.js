const CART_STORAGE_KEY = "argylePantryCart";
const checkoutForm = document.querySelector("#checkoutForm");
const checkoutOrderList = document.querySelector("#checkoutOrderList");
const checkoutItemCount = document.querySelector("#checkoutItemCount");
const checkoutEmpty = document.querySelector("#checkoutEmpty");
const checkoutTotal = document.querySelector("#checkoutTotal");
const checkoutMessage = document.querySelector("#checkoutMessage");
const TRADING_OPEN = "10:00";
const TRADING_CLOSE = "20:30";

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
      pickupTime: String(data.get("pickupTime") || "").trim(),
      serviceType: String(data.get("serviceType") || "").trim(),
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
  const pickupTimeInput = checkoutForm.querySelector('input[name="pickupTime"]');
  if (pickupTimeInput) {
    pickupTimeInput.min = TRADING_OPEN;
    pickupTimeInput.max = TRADING_CLOSE;
  }

  checkoutForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!cart.length) {
      setCheckoutMessage("Please add dishes to your order first.", "error");
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
      setCheckoutMessage("Thank you. Your order has been sent. A receipt has also been emailed to you.", "success");
    } catch (error) {
      const message = error instanceof TypeError
        ? "Order server is not running. Please try again later or call the restaurant."
        : error.message;
      setCheckoutMessage(message, "error");
    } finally {
      submitButton.disabled = false;
      submitButton.textContent = originalText;
    }
  });
}

renderCheckoutOrder();
