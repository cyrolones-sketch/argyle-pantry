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

const state = {
  activeCategory: new URLSearchParams(window.location.search).get("category") || "All",
  search: "",
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
    if (category === state.activeCategory) button.classList.add("active");
    fragment.appendChild(button);
  });

  categoryRail.replaceChildren(fragment);
}

function filteredItems() {
  return menuItems.filter((item) => {
    const matchesCategory = state.activeCategory === "All" || item.category === state.activeCategory;
    const matchesSearch = item.name.toLowerCase().includes(state.search.toLowerCase());
    return matchesCategory && matchesSearch;
  });
}

function renderMenu() {
  const items = filteredItems();
  activeCategoryLabel.textContent = state.activeCategory === "All" ? "All dishes" : state.activeCategory;
  resultCount.textContent = `${items.length} ${items.length === 1 ? "item" : "items"}`;

  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = "menu-card";

    const image = document.createElement("img");
    image.src = getDefaultImage(item);
    image.alt = item.name;
    image.loading = "lazy";

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
    });

    if (variantGroup) {
      footer.append(button);
    } else {
      footer.append(price, button);
    }
    body.append(meta, title);
    if (variantGroup) body.append(variantGroup);
    body.append(footer);
    card.append(image, body);
    wireVariantImageSwap(card, item, image);
    fragment.appendChild(card);
  });

  menuGrid.replaceChildren(fragment);
}

function getPriceLabel(item) {
  if (!item.variants) return item.price;
  return item.variants.map((variant) => `${variant.label} ${variant.price}`).join(" / ");
}

function getDefaultImage(item) {
  return item.variants?.[0]?.image || item.image;
}

function getVariantImage(item, label) {
  return item.variants?.find((variant) => variant.label === label)?.image || item.image;
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
  legend.textContent = "Style";
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
    existing.quantity += 1;
  } else {
    state.cart.push({ ...item, id, displayName, price, image: variant?.image || item.image, variant: variant?.label || "", quantity: 1 });
  }
  renderOrder();
}

function changeQuantity(id, delta) {
  const existing = state.cart.find((item) => item.id === id);
  if (!existing) return;
  existing.quantity += delta;
  if (existing.quantity <= 0) {
    state.cart = state.cart.filter((item) => item.id !== id);
  }
  renderOrder();
}

function renderOrder() {
  const totalItems = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = String(totalItems);
  orderItemCount.textContent = `${totalItems} ${totalItems === 1 ? "item" : "items"}`;
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
  try {
    const saved = JSON.parse(localStorage.getItem(CART_STORAGE_KEY) || "[]");
    return Array.isArray(saved) ? saved.filter((item) => item && item.id && item.quantity > 0) : [];
  } catch {
    return [];
  }
}

function saveCart() {
  localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(state.cart));
}

categoryRail.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.activeCategory = button.dataset.category;
  document.querySelectorAll(".category-filter").forEach((filter) => {
    filter.classList.toggle("active", filter.dataset.category === state.activeCategory);
  });
  renderMenu();
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  renderMenu();
});

orderMail.addEventListener("click", (event) => {
  if (!state.cart.length) event.preventDefault();
});

renderCategoryFilters();
renderMenu();
renderOrder();
