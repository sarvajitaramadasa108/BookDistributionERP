(function () {
  const root = document.getElementById("requestRoot");
  const modalRoot = document.getElementById("modalRoot");
  const overlay = document.getElementById("loadingOverlay");
  const toastStack = document.getElementById("toastStack");
  const params = new URLSearchParams(window.location.search);
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const requestPathIndex = pathSegments.findIndex((segment) => segment === "request");
  const requestPathGroup = requestPathIndex >= 0 ? String(pathSegments[requestPathIndex + 1] || "").trim().toLowerCase() : "";
  const requestPathCategory = requestPathIndex >= 0 ? String(pathSegments[requestPathIndex + 2] || "").trim() : "";

  function slugify(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function resolveInitialGroup() {
    const queryGroup = String(params.get("group") || "").trim().toUpperCase();
    if (queryGroup === "PARAPHERNALIA" || requestPathGroup === "devotional") return "PARAPHERNALIA";
    if (queryGroup === "BOOK" || requestPathGroup === "books") return "BOOK";
    return "BOOK";
  }

  function resolveInitialCategory() {
    return decodeURIComponent(String(params.get("category") || requestPathCategory || "").trim());
  }

  const state = {
    language: "English",
    warehouseSource: String(params.get("warehouse") || params.get("warehouseId") || params.get("utm_source") || "").trim(),
    warehouseId: "",
    warehouseName: "",
    itemGroup: resolveInitialGroup(),
    catalog: [],
    search: "",
    devotionalCategory: resolveInitialCategory() || "ALL",
    cart: [],
    name: "",
    mobile: "",
    notes: "",
    submitting: false,
    submitted: false,
    successMessage: "",
    imageViewer: null
  };

  function syncRequestUrl() {
    const nextQuery = new URLSearchParams();
    if (state.warehouseSource) nextQuery.set("warehouse", state.warehouseSource);
    else if (state.warehouseId) nextQuery.set("warehouse", state.warehouseId);
    const path = state.itemGroup === "PARAPHERNALIA"
      ? `/request/devotional${state.devotionalCategory !== "ALL" ? `/${slugify(state.devotionalCategory)}` : ""}`
      : "/request/books";
    const nextUrl = `${path}${nextQuery.toString() ? `?${nextQuery.toString()}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl) {
      window.history.replaceState({}, "", nextUrl);
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function setLoading(value) {
    overlay.classList.toggle("hidden", !value);
  }

  function openImageViewer(imageUrl, itemName) {
    const url = normalizeDriveImageUrl(imageUrl);
    if (!url) return;
    state.imageViewer = {
      imageUrl: url,
      itemName: String(itemName || "Catalog image").trim()
    };
    renderImageViewer();
  }

  function openImageViewerByCode(erpCode) {
    const item = (state.catalog || []).find((row) => String(row.erpCode || "") === String(erpCode || ""));
    if (!item) return;
    openImageViewer(item.imageUrl, item.name);
  }

  function closeImageViewer() {
    state.imageViewer = null;
    renderImageViewer();
  }

  function renderImageViewer() {
    if (!modalRoot) return;
    if (!state.imageViewer || !state.imageViewer.imageUrl) {
      modalRoot.innerHTML = "";
      return;
    }
    modalRoot.innerHTML = `
      <div class="modal-backdrop image-viewer-backdrop" onclick="window.requestApp.closeImageViewer()"></div>
      <section class="image-viewer-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(state.imageViewer.itemName)}">
        <button class="image-viewer-close" type="button" onclick="window.requestApp.closeImageViewer()" aria-label="Close image">Close</button>
        <div class="image-viewer-frame">
          <img src="${escapeAttr(state.imageViewer.imageUrl)}" alt="${escapeAttr(state.imageViewer.itemName)}">
        </div>
      </section>
    `;
  }

  function showToast(message) {
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    toastStack.appendChild(item);
    setTimeout(() => {
      item.classList.add("hide");
      setTimeout(() => item.remove(), 240);
    }, 2200);
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeDriveImageUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    const fileMatch = raw.match(/\/file\/d\/([^/]+)/i) || raw.match(/[?&]id=([^&]+)/i);
    if (raw.includes("drive.google.com") && fileMatch) {
      return `/api/image?url=${encodeURIComponent(raw)}`;
    }
    return raw;
  }

  function selectorSafe(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  }

  function money(value) {
    const number = Number(value || 0);
    if (!Number.isFinite(number)) return "Rs. 0";
    return `Rs. ${number.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  function getWarehouseLabel() {
    return state.warehouseName || state.warehouseId || "Gambhiram";
  }

  function getItems() {
    const query = normalizeText(state.search);
    return (state.catalog || []).filter((item) => {
      if (state.itemGroup === "PARAPHERNALIA" && state.devotionalCategory !== "ALL") {
        const itemCategory = String(item.category || item.bookType || "").trim();
        if (itemCategory !== state.devotionalCategory) return false;
      }
      if (!query) return true;
      const haystack = [
        item.erpCode,
        item.name,
        item.category,
        item.bookType,
        item.salePrice,
        item.availableQty
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }

  function cartTotalQty() {
    return state.cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  }

  function cartTotalValue() {
    return state.cart.reduce((sum, line) => sum + (Number(line.quantity || 0) * Number(line.salePrice || 0)), 0);
  }

  function setField(field, value) {
    state[field] = value;
    render();
  }

  function setCategory(group) {
    state.itemGroup = group === "PARAPHERNALIA" ? "PARAPHERNALIA" : "BOOK";
    state.search = "";
    state.devotionalCategory = "ALL";
    state.catalog = [];
    state.cart = [];
    state.submitted = false;
    state.successMessage = "";
    loadCatalog();
    render();
  }

  function rerenderSearchPreservingFocus() {
    const currentValue = String(state.search || "");
    root.innerHTML = renderPage();
    const next = document.querySelector('input[type="search"]');
    if (next) {
      next.value = currentValue;
      next.focus();
      if (typeof next.setSelectionRange === "function") {
        next.setSelectionRange(currentValue.length, currentValue.length);
      }
    }
    const form = document.getElementById("requestForm");
    if (form) {
      form.addEventListener("submit", submitRequest);
    }
  }

  function addToCart(bookId) {
    const book = state.catalog.find((item) => item.erpCode === bookId);
    if (!book) return;
    const existing = state.cart.find((line) => line.erpCode === bookId);
    const qty = 1;
    const currentQty = existing ? Number(existing.quantity || 0) : 0;
    const availableQty = Number(book.availableQty || 0);
    if (currentQty + qty > availableQty) {
      showToast("Requested quantity exceeds available stock");
      return;
    }
    if (existing) {
      existing.quantity += qty;
    } else {
      state.cart.push({
        erpCode: book.erpCode,
        itemName: book.name,
        itemGroup: book.itemGroup,
        imageUrl: book.imageUrl,
        salePrice: Number(book.salePrice || 0),
        availableQty: Number(book.availableQty || 0),
        quantity: 1
      });
    }
    render();
  }

  function updateCartQty(bookId, value) {
    const line = state.cart.find((item) => item.erpCode === bookId);
    if (!line) return;
    const qty = Math.max(0, Math.floor(Number(value || 0)));
    const book = state.catalog.find((item) => item.erpCode === bookId);
    const availableQty = Number(book ? book.availableQty : line.availableQty || 0);
    line.quantity = Math.min(qty, availableQty);
    if (line.quantity <= 0) {
      state.cart = state.cart.filter((item) => item.erpCode !== bookId);
    }
    render();
  }

  function removeCartLine(bookId) {
    state.cart = state.cart.filter((item) => item.erpCode !== bookId);
    render();
  }

  async function submitRequest(event) {
    event.preventDefault();
    if (!state.cart.length) {
      showToast("Add at least one item");
      return;
    }
    if (!String(state.name || "").trim()) {
      showToast("Name is required");
      return;
    }
    const digits = String(state.mobile || "").replace(/\D/g, "");
    if (digits.length !== 10) {
      showToast("Mobile number is required");
      return;
    }

    setLoading(true);
    state.submitting = true;
    try {
      const payload = {
        sourceWarehouseId: state.warehouseId,
        itemGroup: state.itemGroup,
        requesterName: String(state.name || "").trim(),
        requesterMobile: digits,
        notes: String(state.notes || "").trim(),
        lines: state.cart.map((line) => ({
          erpCode: line.erpCode,
          itemName: line.itemName,
          itemGroup: line.itemGroup,
          imageUrl: line.imageUrl,
          salePrice: Number(line.salePrice || 0),
          availableQty: Number(line.availableQty || 0),
          quantity: Number(line.quantity || 0)
        }))
      };
      const result = await window.erpApi.request("catalog.submit", payload);
      state.submitted = true;
      state.successMessage = result && result.requestCode ? `Request ${result.requestCode} saved successfully` : "Request saved successfully";
      showToast("Request submitted");
      render();
    } catch (error) {
      showToast(error.message || "Could not submit request");
    } finally {
      state.submitting = false;
      setLoading(false);
    }
  }

  function renderHeader() {
    return `
      <header class="public-hero">
        <div class="public-brand">
          <div class="public-mark">HKM</div>
          <div>
            <div class="public-title">Book Distribution Requests</div>
            <div class="public-subtitle">Browse available books or devotional items and place a request for the Gambhiram warehouse.</div>
          </div>
        </div>
        <div class="segmented">
          <button class="segment ${state.itemGroup === "BOOK" ? "active" : ""}" type="button" onclick="window.requestApp.setCategory('BOOK')">Books</button>
          <button class="segment ${state.itemGroup === "PARAPHERNALIA" ? "active" : ""}" type="button" onclick="window.requestApp.setCategory('PARAPHERNALIA')">Devotional Items</button>
        </div>
      </header>
    `;
  }

  function getDevotionalCategories() {
    return [...new Set(
      (state.catalog || [])
        .map((item) => String(item.category || item.bookType || "").trim())
        .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));
  }

  function normalizeCategorySelection(categories, value) {
    const raw = String(value || "").trim();
    if (!raw || raw.toUpperCase() === "ALL") return "ALL";
    const direct = categories.find((category) => category === raw);
    if (direct) return direct;
    const slug = slugify(raw);
    const matched = categories.find((category) => slugify(category) === slug);
    return matched || "ALL";
  }

  function renderCatalogCard(item) {
    const imageUrl = normalizeDriveImageUrl(item.imageUrl);
    const qty = Number(item.availableQty || 0);
    const metaParts = [];
    if (item.erpCode) metaParts.push(item.erpCode);
    if (item.category || item.bookType) metaParts.push(item.category || item.bookType);
    return `
      <article class="catalog-card ${qty > 0 ? "" : "sold-out"}">
        <div class="catalog-image">
          ${imageUrl ? `
            <button class="catalog-image-button" type="button" onclick="window.requestApp.openImageViewerByCode('${escapeAttr(item.erpCode)}')" aria-label="View ${escapeAttr(item.name)} image">
              <img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(item.name)}" loading="lazy" onerror="this.style.display='none';this.parentElement.nextElementSibling?.classList.remove('hidden')">
            </button>
          ` : ""}
          <div class="catalog-fallback ${imageUrl ? "hidden" : ""}">
            ${escapeHtml((item.name || "Item").split(" ").slice(0, 2).map((part) => part[0] || "").join("").toUpperCase())}
          </div>
        </div>
        <div class="catalog-body">
          <div class="catalog-name">${escapeHtml(item.name || "-")}</div>
          <div class="catalog-meta">${escapeHtml(metaParts.join(" · "))}</div>
          <div class="catalog-stats">
            <span>${money(Number(item.salePrice || 0))}</span>
            <span>${qty} in stock</span>
          </div>
          <div class="catalog-actions">
            <input type="number" min="1" step="1" value="1" data-qty="${escapeAttr(item.erpCode)}">
            <button class="button" type="button" ${qty > 0 ? `onclick="window.requestApp.addWithQty('${escapeAttr(item.erpCode)}')"` : "disabled"}>Add to Cart</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderCatalogList(items) {
    if (!items.length) {
      return '<div class="empty-note">No matching items found.</div>';
    }
    return `<div class="catalog-grid">${items.map(renderCatalogCard).join("")}</div>`;
  }

  function renderCart() {
    if (!state.cart.length) {
      return '<div class="empty-note">Your cart is empty.</div>';
    }
    return `
      <div class="cart-items">
        ${state.cart.map((line) => `
          <div class="cart-row">
          <div>
              <strong>${escapeHtml(line.itemName)}</strong>
              <div class="catalog-meta">${escapeHtml(line.erpCode)} &middot; ${money(line.salePrice)}</div>
            </div>
            <div class="cart-row-actions">
              <input type="number" min="0" step="1" value="${escapeAttr(line.quantity)}" onchange="window.requestApp.updateCartQty('${escapeAttr(line.erpCode)}', this.value)">
              <button class="small-button danger" type="button" onclick="window.requestApp.removeCartLine('${escapeAttr(line.erpCode)}')">Remove</button>
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderPage() {
    if (state.submitted) {
      return `
        ${renderHeader()}
        <section class="public-card success-card">
          <div class="success-badge">HKM</div>
          <h1>Request submitted</h1>
          <p>Thank you. Your request has been recorded successfully for the ${escapeHtml(getWarehouseLabel())} warehouse.</p>
          <div class="success-meta">${escapeHtml(state.successMessage || "")}</div>
          <button class="button" type="button" onclick="window.requestApp.resetForm()">Place another request</button>
        </section>
      `;
    }

    const items = getItems();
    const devotionalCategories = getDevotionalCategories();
    const searchPlaceholder = state.itemGroup === "PARAPHERNALIA"
      ? "Search item name or category"
      : "Search code, name, or type";
    return `
      ${renderHeader()}
      <section class="request-layout">
        <section class="public-card request-main">
          <div class="public-card-header">
            <h2>${state.itemGroup === "PARAPHERNALIA" ? "Devotional Items" : "Books"}</h2>
            <div class="public-tag">${escapeHtml(getWarehouseLabel())}</div>
          </div>
          <div class="toolbar">
            <label class="field compact-field">
              <span>Search</span>
              <input type="search" value="${escapeAttr(state.search)}" placeholder="${escapeAttr(searchPlaceholder)}" oninput="window.requestApp.setField('search', this.value)">
            </label>
            ${state.itemGroup === "PARAPHERNALIA" ? `
              <label class="field compact-field">
                <span>Category</span>
                <select onchange="window.requestApp.setField('devotionalCategory', this.value)">
                  <option value="ALL"${state.devotionalCategory === "ALL" ? " selected" : ""}>All categories</option>
                  ${devotionalCategories.map((category) => `<option value="${escapeAttr(category)}"${state.devotionalCategory === category ? " selected" : ""}>${escapeHtml(category)}</option>`).join("")}
                </select>
              </label>
            ` : ""}
          </div>
          ${renderCatalogList(items)}
        </section>

        <aside class="public-card cart-panel">
          <div class="public-card-header">
            <h2>Your Request</h2>
            <div class="public-tag">${cartTotalQty()} items</div>
          </div>
          <form id="requestForm" class="public-form">
            <div class="grid-two">
              <label class="field">
                <span>Name</span>
                <input name="name" type="text" value="${escapeAttr(state.name)}" placeholder="Your name" oninput="window.requestApp.setField('name', this.value)" required>
              </label>
              <label class="field">
                <span>Mobile Number</span>
                <input name="mobile" type="tel" value="${escapeAttr(state.mobile)}" placeholder="10-digit number" oninput="window.requestApp.setField('mobile', this.value)" required>
              </label>
            </div>
            <label class="field">
              <span>Notes</span>
              <textarea name="notes" rows="3" placeholder="Optional note" oninput="window.requestApp.setField('notes', this.value)">${escapeHtml(state.notes)}</textarea>
            </label>
            <div class="cart-summary">
              <div><strong>Total Qty:</strong> ${cartTotalQty()}</div>
              <div><strong>Total Worth:</strong> ${money(cartTotalValue())}</div>
            </div>
            ${renderCart()}
            <div class="form-actions public-actions">
              <button class="button" type="submit" ${state.submitting || !state.cart.length ? "disabled" : ""}>Submit Request</button>
            </div>
          </form>
        </aside>
      </section>
    `;
  }

  function render() {
    syncRequestUrl();
    root.innerHTML = renderPage();
    renderImageViewer();
    const form = document.getElementById("requestForm");
    if (form) {
      form.addEventListener("submit", submitRequest);
    }
    document.title = state.itemGroup === "PARAPHERNALIA" ? "Devotional Item Requests" : "Book Requests";
  }

  async function loadCatalog() {
    setLoading(true);
    try {
      const warehouses = await window.erpApi.request("warehouses.list");
      const activeWarehouses = Array.isArray(warehouses) ? warehouses.filter((row) => row.active !== false) : [];
      const mainWarehouse = activeWarehouses.find((row) => String(row.name || "").toLowerCase().includes("gmb") || String(row.name || "").toLowerCase().includes("gambhiram")) || activeWarehouses[0] || null;
      state.warehouseId = mainWarehouse ? mainWarehouse.warehouseId : "";
      state.warehouseName = mainWarehouse ? mainWarehouse.name : "";
      const ref = state.warehouseSource || state.warehouseId;
      const catalog = await window.erpApi.request("catalog.items", {
        sourceWarehouseId: ref || state.warehouseId,
        warehouseId: ref || state.warehouseId,
        warehouseCode: ref || state.warehouseId,
        warehouseName: ref || state.warehouseName,
        itemGroup: state.itemGroup
      });
      state.catalog = Array.isArray(catalog) ? catalog : [];
      if (state.itemGroup === "PARAPHERNALIA") {
        state.devotionalCategory = normalizeCategorySelection(getDevotionalCategories(), state.devotionalCategory);
      } else {
        state.devotionalCategory = "ALL";
      }
      render();
    } catch (error) {
      root.innerHTML = `
        <section class="public-card success-card">
          <h1>Could not load the request page</h1>
          <p>${escapeHtml(error.message || "Something went wrong")}</p>
        </section>
      `;
      showToast(error.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  }

  window.requestApp = {
    setField(field, value) {
      if (field === "mobile") {
        state.mobile = String(value || "").replace(/\D/g, "").slice(0, 10);
        const input = document.querySelector('input[name="mobile"]');
        if (input) input.value = state.mobile;
        return;
      }
      if (field === "name" || field === "notes") {
        state[field] = value;
        return;
      }
      state[field] = value;
      if (field === "search") {
        rerenderSearchPreservingFocus();
        return;
      }
      render();
    },
    setCategory,
    addToCart,
    addWithQty(bookId) {
      const input = document.querySelector(`[data-qty="${selectorSafe(bookId)}"]`);
      const qty = input ? Number(input.value || 1) : 1;
      const book = state.catalog.find((item) => item.erpCode === bookId);
      if (!book) return;
      const existing = state.cart.find((line) => line.erpCode === bookId);
      const nextQty = Math.max(1, Math.floor(Number(qty || 1)));
      const currentQty = existing ? Number(existing.quantity || 0) : 0;
      if (currentQty + nextQty > Number(book.availableQty || 0)) {
        showToast("Requested quantity exceeds available stock");
        return;
      }
      if (existing) {
        existing.quantity += nextQty;
      } else {
        state.cart.push({
          erpCode: book.erpCode,
          itemName: book.name,
          itemGroup: book.itemGroup,
          imageUrl: book.imageUrl,
          salePrice: Number(book.salePrice || 0),
          availableQty: Number(book.availableQty || 0),
          quantity: nextQty
        });
      }
      render();
    },
    updateCartQty,
    removeCartLine,
    openImageViewer,
    openImageViewerByCode,
    closeImageViewer,
    resetForm() {
      state.search = "";
      state.cart = [];
      state.name = "";
      state.mobile = "";
      state.notes = "";
      state.submitted = false;
      state.successMessage = "";
      render();
    }
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.imageViewer) {
      closeImageViewer();
    }
  });

  loadCatalog();
})();
