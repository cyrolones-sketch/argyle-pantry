const menuItems = window.menuItems || [];
const menuGrid = document.querySelector("#menuGrid");
const categoryRail = document.querySelector(".category-rail");
const activeCategoryLabel = document.querySelector("#activeCategory");
const resultCount = document.querySelector("#resultCount");
const searchInput = document.querySelector("#menuSearch");
const cartCount = document.querySelector("#cartCount");
const orderItemCount = document.querySelector("#orderItemCount");
const orderEmpty = document.querySelector("#orderEmpty");
const orderList = document.querySelector("#orderList");
const orderMail = document.querySelector("#orderMail");
const CART_STORAGE_KEY = "argylePantryCart";
let feedbackTimer;

const state = {
  activeCategory: new URLSearchParams(window.location.search).get("category") || "All",
  search: new URLSearchParams(window.location.search).get("q") || "",
  cart: loadCart()
};

const categoryOrder = [
  "All",
  "Chef Special Menu",
  "Sizzling",
  "Donburi & Curry",
  "Deluxe Bento",
  "Classic Bento",
  "Ramen",
  "Udon",
  "Fried Rice & Noodles",
  "Sushi",
  "Gyoza",
  "Sides",
  "Drinks",
  "Others"
];

function uniqueCategories() {
  const discovered = [...new Set(menuItems.map((item) => item.category))];
  return categoryOrder.filter((category) => category === "All" || discovered.includes(category));
}

function renderCategoryFilters() {
  const fragment = document.createDocumentFragment();

  uniqueCategories().forEach((category) => {
    const button = document.createElement("button");
    button.className = "category-filter";
    button.type = "button";
    button.dataset.category = category;
    button.textContent = category === "All" ? "All dishes" : category;
    button.setAttribute("aria-pressed", String(category === state.activeCategory));
    if (category === state.activeCategory) button.classList.add("active");
    fragment.appendChild(button);
  });

  categoryRail.replaceChildren(fragment);
}

function filteredItems() {
  return menuItems.filter((item) => {
    const matchesCategory = Boolean(state.search) || state.activeCategory === "All" || item.category === state.activeCategory;
    const aliases = `${item.name} ${item.category} ${descriptionFor(item)} ${item.variants?.map(v => v.label).join(" ") || ""}`.toLowerCase();
    const query = state.search.toLowerCase().replace(/gyoza|dumpling(s)?/g, "gyoza").replace(/soda/g, "soft drink");
    const matchesSearch = query.split(/\s+/).every(word => aliases.includes(word));
    return matchesCategory && matchesSearch;
  });
}

function renderMenu() {
  const items = filteredItems();
  activeCategoryLabel.textContent = state.search ? "Search results" : state.activeCategory === "All" ? "All dishes" : state.activeCategory;
  resultCount.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;

  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "menu-card";

    const image = document.createElement("img");
    image.src = getDefaultImage(item);
    image.alt = item.name;
    image.loading = "lazy";
    image.decoding = "async";
    image.width = 640;
    image.height = 480;
    const imageButton = document.createElement("button");
    imageButton.type = "button";
    imageButton.className = "dish-image-button";
    imageButton.setAttribute("aria-label", `View ${item.name}`);
    imageButton.append(image);
    imageButton.addEventListener("click", () => showDish(item, image.src));

    const body = document.createElement("div");
    body.className = "menu-card-body";

    const meta = document.createElement("span");
    meta.className = "menu-card-category";
    meta.textContent = item.category;

    const title = document.createElement("h3");
    title.textContent = item.name;

    const footer = document.createElement("div");
    footer.className = "menu-card-footer";

    const variantGroup = createVariantGroup(item);
    if (variantGroup) footer.classList.add("menu-card-footer-variants");

    const price = document.createElement("span");
    price.className = "menu-price";
    price.textContent = getPriceLabel(item);

    const button = document.createElement("button");
    button.className = "add-button";
    button.type = "button";
    button.textContent = "Add";
    button.addEventListener("click", () => {
      const variant = getSelectedVariant(card, item);
      addToCart(item, variant);
      document.querySelector("#cartFeedback").textContent = `${item.name} added to your order.`;
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => { document.querySelector("#cartFeedback").textContent = ""; }, 2500);
    });

    if (variantGroup) {
      footer.append(button);
    } else {
      footer.append(price, button);
    }
    body.append(meta, title);
    const description = descriptionFor(item);
    if (description) {
      const text = document.createElement("p");
      text.className = "dish-description";
      text.textContent = description;
      body.append(text);
    }
    if (variantGroup) body.append(variantGroup);
    body.append(footer);
    card.append(imageButton, body);
    wireVariantImageSwap(card, item, image);
    fragment.appendChild(card);
  });

  menuGrid.replaceChildren(fragment);
  if (!items.length) {
    const empty = document.createElement("div");
    empty.className = "menu-empty";
    const text = document.createElement("p");
    text.textContent = `No dishes found for "${state.search}".`;
    const reset = document.createElement("button");
    reset.type = "button";
    reset.className = "button secondary";
    reset.textContent = "See all dishes";
    reset.addEventListener("click", () => { state.search = ""; state.activeCategory = "All"; searchInput.value = ""; updateNavigation(); });
    empty.append(text, reset);
    menuGrid.append(empty);
  }
}

function getPriceLabel(item) {
  if (!item.variants) return item.price;
  return item.variants.map((variant) => `${variant.label} ${variant.price}`).join(" / ");
}

function getDefaultImage(item) {
  return optimizedImage(item.variants?.[0]?.image || item.image);
}

function optimizedImage(source) {
  const base = globalThis.optimizedImages?.[source.split("?")[0]];
  return base ? `${base}-640.webp` : source;
}

function getVariantImage(item, label) {
  return optimizedImage(item.variants?.find((variant) => variant.label === label)?.image || item.image);
}

function wireVariantImageSwap(card, item, image) {
  if (!item.variants?.some((variant) => variant.image)) return;

  card.querySelectorAll(".variant-options input").forEach((input) => {
    input.addEventListener("change", () => {
      if (!input.checked) return;
      image.src = getVariantImage(item, input.value);
    });
  });
}

function createVariantGroup(item) {
  if (!item.variants) return null;

  const fieldset = document.createElement("fieldset");
  fieldset.className = "variant-options";

  const legend = document.createElement("legend");
  legend.textContent = item.category === "Gyoza" ? "Filling" : item.category === "Drinks" ? "Flavour" : item.category === "Sushi" ? "Size" : item.category === "Donburi & Curry" ? "Rice style" : "Choice";
  fieldset.appendChild(legend);

  const groupName = `variant-${item.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  item.variants.forEach((variant, index) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = groupName;
    input.value = variant.label;
    input.checked = index === 0;
    const text = document.createElement("span");
    text.textContent = `${variant.label} ${variant.price}`;
    label.append(input, text);
    fieldset.appendChild(label);
  });

  return fieldset;
}

function getSelectedVariant(card, item) {
  if (!item.variants) return null;
  const selected = card.querySelector(".variant-options input:checked");
  return item.variants.find((variant) => variant.label === selected?.value) || item.variants[0];
}

function addToCart(item, variant = null) {
  const displayName = variant ? `${item.name} (${variant.label})` : item.name;
  const price = variant ? variant.price : item.price;
  const id = `${item.name}::${variant?.label || "default"}`;
  const existing = state.cart.find((cartItem) => cartItem.id === id);
  if (existing) {
    existing.quantity = Math.min(50, existing.quantity + 1);
  } else {
    state.cart.push({ ...item, id, displayName, price, image: variant?.image || item.image, variant: variant?.label || "", quantity: 1 });
  }
  renderOrder();
}

function changeQuantity(id, delta) {
  const existing = state.cart.find((item) => item.id === id);
  if (!existing) return;
  existing.quantity = Math.min(50, existing.quantity + delta);
  if (existing.quantity <= 0) {
    state.cart = state.cart.filter((item) => item.id !== id);
  }
  renderOrder();
}

function renderOrder() {
  const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = String(totalItems);
  orderItemCount.textContent = `${totalItems} ${totalItems === 1 ? "item" : "items"}`;
  const total = Pantry.money(Pantry.total(state.cart));
  document.querySelector("#orderTotal").textContent = total;
  document.querySelector("#mobileCartLabel").textContent = `View order (${totalItems})`;
  document.querySelector("#mobileCartTotal").textContent = total;
  document.querySelector("#mobileCart").hidden = !state.cart.length;
  orderEmpty.hidden = state.cart.length > 0;
  orderMail.classList.toggle("disabled", state.cart.length === 0);
  orderMail.setAttribute("aria-disabled", String(state.cart.length === 0));

  const fragment = document.createDocumentFragment();
  state.cart.forEach((item) => {
    const row = document.createElement("li");
    row.className = "order-row";

    const details = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = item.displayName;
    const category = document.createElement("span");
    category.textContent = `${item.category} · ${item.price}`;
    details.append(name, category);

    const controls = document.createElement("div");
    controls.className = "quantity-controls";

    const minus = document.createElement("button");
    minus.type = "button";
    minus.textContent = "-";
    minus.setAttribute("aria-label", `Remove one ${item.displayName}`);
    minus.addEventListener("click", () => changeQuantity(item.id, -1));

    const quantity = document.createElement("span");
    quantity.textContent = String(item.quantity);

    const plus = document.createElement("button");
    plus.type = "button";
    plus.textContent = "+";
    plus.setAttribute("aria-label", `Add one ${item.displayName}`);
    plus.addEventListener("click", () => changeQuantity(item.id, 1));

    controls.append(minus, quantity, plus);
    row.append(details, controls);
    fragment.appendChild(row);
  });

  orderList.replaceChildren(fragment);
  saveCart();

  orderMail.href = state.cart.length ? "checkout.html" : "#order";
}

function loadCart() {
  return Pantry.readCart();
}

function saveCart() {
  Pantry.saveCart(state.cart);
}

categoryRail.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.activeCategory = button.dataset.category;
  state.search = "";
  searchInput.value = "";
  updateNavigation();
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  updateNavigation();
});

orderMail.addEventListener("click", (event) => {
  if (!state.cart.length) event.preventDefault();
});

function updateNavigation() {
  const url = new URL(location.href);
  url.searchParams.set("category", state.activeCategory);
  if (state.search) url.searchParams.set("q", state.search); else url.searchParams.delete("q");
  history.replaceState(null, "", url);
  try { sessionStorage.setItem("argylePantryMenuURL", url.pathname + url.search); } catch {}
  document.querySelector("#categorySelect").value = state.activeCategory;
  renderCategoryFilters();
  renderMenu();
}

function descriptionFor(item) {
  const sushi = {
    "Crispy Chicken Roll": "Crispy fried chicken.", "Chicken Katsu Roll": "Chicken katsu and cucumber.",
    "Teriyaki Chicken Roll": "Teriyaki chicken and avocado.", "Spicy Chicken Roll": "Chicken katsu, cucumber and chilli sauce.",
    "Crumbed Prawn Roll": "Crumbed prawn and cucumber.", "Spicy Prawn Roll": "Crumbed prawn, cucumber and chilli sauce.",
    "Cooked Prawn Roll": "Cooked prawn and avocado.", "Cooked Tuna Roll": "Cooked tuna and avocado.",
    "California Roll": "Crab stick and avocado.", "Salmon Avocado Roll": "Fresh salmon and avocado.",
    "Teriyaki Salmon Roll": "Teriyaki salmon and avocado.", "Spicy Salmon Roll": "Fresh salmon, avocado and chilli sauce.",
    "Avocado Roll": "Avocado.", "Vegetable Roll": "Inari tofu and cucumber."
  };
  return Object.entries(sushi).find(([name]) => name.toLowerCase() === item.name.toLowerCase())?.[1] || (item.category === "Gyoza" ? "Pan-fried dumplings. Choose chicken or pork." : "");
}

function showDish(item, src) {
  const dialog = document.querySelector("#dishDialog");
  dialog.querySelector("img").src = src.replace(/-640\.webp$/, "-1280.webp");
  dialog.querySelector("img").alt = item.name;
  dialog.querySelector("h2").textContent = item.name;
  dialog.querySelector(".dialog-description").textContent = descriptionFor(item);
  dialog.querySelector(".dialog-price").textContent = getPriceLabel(item);
  dialog.showModal();
}
document.querySelector("#dishDialogClose").addEventListener("click", () => document.querySelector("#dishDialog").close());
const categorySelect = document.querySelector("#categorySelect");
uniqueCategories().forEach(category => categorySelect.add(new Option(category === "All" ? "All dishes" : category, category)));
categorySelect.addEventListener("change", () => { state.activeCategory = categorySelect.value; state.search = ""; searchInput.value = ""; updateNavigation(); });
if (!uniqueCategories().includes(state.activeCategory)) state.activeCategory = "All";
categorySelect.value = state.activeCategory;
searchInput.value = state.search;
window.addEventListener("pageshow", () => { state.cart = loadCart(); renderOrder(); });
window.addEventListener("storage", () => { state.cart = loadCart(); renderOrder(); });
updateNavigation();
renderOrder();
