const checkoutForm = document.querySelector("#checkoutForm");
const checkoutMessage = document.querySelector("#checkoutMessage");
let cart = Pantry.readCart();
const firstContact = checkoutForm.elements.namedItem("name").closest("label");
[checkoutForm.querySelector(".dining-options"), checkoutForm.elements.pickupDate.closest("label"), checkoutForm.elements.pickupTime.closest("label")].forEach(field => firstContact.before(field));
const validateTime = setupBookingTime(checkoutForm, "order");

function renderCheckoutOrder() {
  document.querySelector("#checkoutItemCount").textContent = `${cart.reduce((n, item) => n + item.quantity, 0)} items`;
  document.querySelector("#checkoutEmpty").hidden = cart.length > 0;
  checkoutForm.hidden = !cart.length;
  const total = Pantry.money(Pantry.total(cart));
  document.querySelector("#checkoutTotal").textContent = `Total (AUD) ${total}`;
  document.querySelector("#checkoutTotal").hidden = !cart.length;
  document.querySelector("#submitTotal").textContent = total;
  const list = document.querySelector("#checkoutOrderList");
  list.replaceChildren();
  cart.forEach(item => {
    const row = document.createElement("li");
    row.className = "order-row";
    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.displayName;
    const price = document.createElement("span");
    price.textContent = `${item.price} each`;
    details.append(name, price);
    const controls = document.createElement("div");
    controls.className = "quantity-controls";
    [-1, 0, 1].forEach(delta => {
      const el = document.createElement(delta ? "button" : "span");
      el.textContent = delta ? delta < 0 ? "-" : "+" : item.quantity;
      if (delta) {
        el.type = "button";
        el.setAttribute("aria-label", `${delta < 0 ? "Remove" : "Add"} one ${item.displayName}`);
        el.addEventListener("click", () => {
          item.quantity = Math.min(50, item.quantity + delta);
          cart = cart.filter(i => i.quantity > 0);
          Pantry.saveCart(cart);
          renderCheckoutOrder();
        });
      }
      controls.append(el);
    });
    row.append(details, controls);
    list.append(row);
  });
}
const countField = document.querySelector("#cutleryCountField");
function updateCutlery() {
  const needs = checkoutForm.elements.cutleryNeeded.value === "Yes";
  countField.hidden = !needs;
  checkoutForm.elements.cutleryCount.disabled = !needs;
  checkoutForm.elements.cutleryCount.required = needs;
}
checkoutForm.querySelectorAll('[name="cutleryNeeded"]').forEach(el => el.addEventListener("change", updateCutlery));
updateCutlery();
checkoutForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!cart.length || !validateTime() || !checkoutForm.reportValidity()) { checkoutForm.reportValidity(); return; }
  const data = new FormData(checkoutForm);
  const customer = Object.fromEntries(["name", "phone", "email", "pickupDate", "pickupTime", "serviceType", "notes"].map(key => [key, String(data.get(key) || "").trim()]));
  customer.cutleryNeeded = data.get("cutleryNeeded") === "Yes";
  customer.cutleryCount = customer.cutleryNeeded ? Number(data.get("cutleryCount")) : 0;
  const payload = { customer, items: cart.map(({ id, name, variant, quantity }) => ({ id, name, variant, quantity })) };
  const button = checkoutForm.querySelector('[type="submit"]');
  button.disabled = true;
  checkoutMessage.textContent = "Sending your order...";
  checkoutMessage.dataset.type = "";
  try {
    const response = await fetch("/api/orders", { method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": Pantry.submissionKey("order", payload) }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.reference) throw new Error(result.message || "Your order could not be confirmed. Please try again or call 03 6288 7654.");
    const summary = { type: "order", reference: result.reference, customer, items: result.items || cart,
      total: result.total || Pantry.money(Pantry.total(cart)), receiptSent: result.receiptSent === true, submittedAt: new Date().toISOString() };
    try { sessionStorage.setItem("argylePantrySubmission", JSON.stringify(summary)); sessionStorage.removeItem("argylePantryPending:order"); } catch {
      checkoutMessage.textContent = `Order received. Reference ${result.reference}. Please keep this number. Call 03 6288 7654 for changes.`;
      Pantry.saveCart([]);
      button.hidden = true;
      return;
    }
    Pantry.saveCart([]);
    location.assign("success.html?type=order");
  } catch (error) {
    checkoutMessage.dataset.type = "error";
    checkoutMessage.textContent = error instanceof TypeError ? "Connection interrupted. Please retry with the same details so we can check your request without duplicating it." : error.message;
  } finally { button.disabled = false; }
});
try {
  const saved = sessionStorage.getItem("argylePantryMenuURL");
  if (saved && /^\/menu(?:\.html)?\?/.test(saved)) document.querySelector(".checkout-back").href = saved;
} catch {}
window.addEventListener("pageshow", () => { cart = Pantry.readCart(); renderCheckoutOrder(); });
window.addEventListener("storage", () => { cart = Pantry.readCart(); renderCheckoutOrder(); });
renderCheckoutOrder();
