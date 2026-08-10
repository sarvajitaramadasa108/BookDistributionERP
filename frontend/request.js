(function () {
  const root = document.getElementById("requestRoot");
  const modalRoot = document.getElementById("modalRoot");
  const overlay = document.getElementById("loadingOverlay");
  const toastStack = document.getElementById("toastStack");
  const config = window.ERP_CONFIG || {};
  const params = new URLSearchParams(window.location.search);
  const pathSegments = window.location.pathname.split("/").filter(Boolean);
  const requestPathIndex = pathSegments.findIndex((segment) => segment === "request");
  const requestPathGroup = requestPathIndex >= 0 ? String(pathSegments[requestPathIndex + 1] || "").trim().toLowerCase() : "";
  const requestPathCategory = requestPathIndex >= 0 ? String(pathSegments[requestPathIndex + 2] || "").trim() : "";

  const FOLK_GUIDES = Array.isArray(config.publicRequestFolkGuides) ? config.publicRequestFolkGuides : [];
  const PREACHERS = Array.isArray(config.publicRequestPreachers) ? config.publicRequestPreachers : [];

  const state = {
    warehouseSource: String(params.get("warehouse") || params.get("warehouseId") || params.get("utm_source") || "").trim(),
    warehouseId: "",
    warehouseName: "",
    view: "catalog",
    itemGroup: resolveInitialGroup(),
    devotionalCategory: resolveInitialCategory() || "ALL",
    search: "",
    catalogByGroup: {
      BOOK: [],
      PARAPHERNALIA: []
    },
    loadingCatalog: false,
    cart: [],
    notes: "",
    requestMobile: "",
    lookupInProgress: false,
    profileChecked: false,
    profile: null,
    name: "",
    requesterSegment: "",
    folkGuideName: "",
    preacherName: "",
    requesterLocation: "",
    requestSubmitting: false,
    submitted: false,
    successMessage: "",
    historyMobile: "",
    historyLoading: false,
    historyLoaded: false,
    historyRows: [],
    historyExpanded: "",
    imageViewer: null,
    installReady: false,
    deferredInstallPrompt: null
  };

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

  function setLoading(value, message) {
    overlay.classList.toggle("hidden", !value);
    const label = overlay ? overlay.querySelector("span") : null;
    if (label) label.textContent = message || "Loading";
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

  function normalizeMobile(value) {
    return String(value || "").replace(/\D/g, "").slice(-10);
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

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getWarehouseLabel() {
    return state.warehouseName || state.warehouseId || "Gambhiram";
  }

  function getCatalog(group) {
    return state.catalogByGroup[group] || [];
  }

  function getActiveCatalog() {
    return getCatalog(state.itemGroup);
  }

  function getDevotionalCategories() {
    return [...new Set(
      getCatalog("PARAPHERNALIA")
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

  function getFilteredItems() {
    const query = normalizeText(state.search);
    const items = getActiveCatalog();
    const filtered = items.filter((item) => {
      if (state.itemGroup === "PARAPHERNALIA" && state.devotionalCategory !== "ALL") {
        const category = String(item.category || item.bookType || "").trim();
        if (category !== state.devotionalCategory) return false;
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
    if (!query) return filtered;
    return filtered.sort((a, b) => {
      const aName = String(a.name || "").toLowerCase();
      const bName = String(b.name || "").toLowerCase();
      const aStarts = aName.startsWith(query) ? 0 : 1;
      const bStarts = bName.startsWith(query) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return aName.localeCompare(bName) || String(a.erpCode || "").localeCompare(String(b.erpCode || ""));
    });
  }

  function cartTotalQty() {
    return state.cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  }

  function cartTotalValue() {
    return state.cart.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.salePrice || 0), 0);
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
    const item = [...getCatalog("BOOK"), ...getCatalog("PARAPHERNALIA")].find((row) => String(row.erpCode || "") === String(erpCode || ""));
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

  function syncRequestUrl() {
    const nextQuery = new URLSearchParams();
    if (state.warehouseSource) nextQuery.set("warehouse", state.warehouseSource);
    else if (state.warehouseId) nextQuery.set("warehouse", state.warehouseId);
    const path = state.itemGroup === "PARAPHERNALIA"
      ? `/request/devotional${state.devotionalCategory !== "ALL" ? `/${slugify(state.devotionalCategory)}` : ""}`
      : "/request/books";
    const nextUrl = `${path}${nextQuery.toString() ? `?${nextQuery.toString()}` : ""}`;
    if (`${window.location.pathname}${window.location.search}` !== nextUrl && state.view === "catalog") {
      window.history.replaceState({}, "", nextUrl);
    }
  }

  function rerenderSearchPreservingFocus() {
    const currentValue = String(state.search || "");
    render();
    const next = document.querySelector(".catalog-search input[type=\"search\"]");
    if (next) {
      next.value = currentValue;
      next.focus();
      if (typeof next.setSelectionRange === "function") {
        next.setSelectionRange(currentValue.length, currentValue.length);
      }
    }
  }

  function setView(view) {
    state.view = view;
    render();
  }

  function setCategory(group) {
    state.itemGroup = group === "PARAPHERNALIA" ? "PARAPHERNALIA" : "BOOK";
    if (state.itemGroup === "BOOK") state.devotionalCategory = "ALL";
    else state.devotionalCategory = normalizeCategorySelection(getDevotionalCategories(), state.devotionalCategory);
    state.search = "";
    syncRequestUrl();
    ensureCatalogLoaded(state.itemGroup).then(render).catch((error) => {
      showToast(error.message || "Could not load catalog");
    });
    render();
  }

  function setField(field, value) {
    if (field === "requestMobile" || field === "historyMobile") {
      state[field] = normalizeMobile(value);
      render();
      return;
    }
    state[field] = value;
    if (field === "search") {
      rerenderSearchPreservingFocus();
      return;
    }
    render();
  }

  function getItemByCode(erpCode) {
    return [...getCatalog("BOOK"), ...getCatalog("PARAPHERNALIA")].find((item) => String(item.erpCode || "") === String(erpCode || ""));
  }

  function addWithQty(erpCode) {
    const item = getItemByCode(erpCode);
    if (!item) return;
    const input = document.querySelector(`[data-qty="${selectorSafe(erpCode)}"]`);
    const qty = Math.max(1, Math.floor(Number(input ? input.value : 1) || 1));
    const existing = state.cart.find((line) => line.erpCode === erpCode);
    const currentQty = existing ? Number(existing.quantity || 0) : 0;
    const availableQty = Number(item.availableQty || 0);
    if (qty + currentQty > availableQty) {
      showToast("Requested quantity exceeds available stock");
      return;
    }
    if (existing) {
      existing.quantity += qty;
    } else {
      state.cart.push({
        erpCode: item.erpCode,
        itemName: item.name,
        itemGroup: item.itemGroup,
        imageUrl: item.imageUrl,
        salePrice: Number(item.salePrice || 0),
        availableQty: Number(item.availableQty || 0),
        quantity: qty
      });
    }
    showToast("Added to cart");
    render();
  }

  function updateCartQty(erpCode, value) {
    const line = state.cart.find((item) => item.erpCode === erpCode);
    if (!line) return;
    const nextQty = Math.max(0, Math.floor(Number(value || 0)));
    const item = getItemByCode(erpCode);
    const availableQty = Number(item ? item.availableQty : line.availableQty || 0);
    line.quantity = Math.min(nextQty, availableQty);
    if (line.quantity <= 0) {
      state.cart = state.cart.filter((itemRow) => itemRow.erpCode !== erpCode);
    }
    render();
  }

  function removeCartLine(erpCode) {
    state.cart = state.cart.filter((item) => item.erpCode !== erpCode);
    render();
  }

  async function ensureCatalogLoaded(group) {
    if (getCatalog(group).length) return;
    state.loadingCatalog = true;
    render();
    try {
      const warehouses = await window.erpApi.request("warehouses.list");
      const activeWarehouses = Array.isArray(warehouses) ? warehouses.filter((row) => row.active !== false) : [];
      const matchBySource = activeWarehouses.find((row) => {
        const candidates = [row.warehouseId, row.name].map((candidate) => normalizeText(candidate).replace(/[^a-z0-9]/g, ""));
        const ref = normalizeText(state.warehouseSource).replace(/[^a-z0-9]/g, "");
        return ref && candidates.includes(ref);
      });
      const mainWarehouse = matchBySource
        || activeWarehouses.find((row) => String(row.name || "").toLowerCase().includes("gmb") || String(row.name || "").toLowerCase().includes("gambhiram"))
        || activeWarehouses[0]
        || null;
      state.warehouseId = mainWarehouse ? mainWarehouse.warehouseId : "";
      state.warehouseName = mainWarehouse ? mainWarehouse.name : "";
      const ref = state.warehouseSource || state.warehouseId || state.warehouseName;
      const catalog = await window.erpApi.request("catalog.items", {
        sourceWarehouseId: ref || state.warehouseId,
        warehouseId: ref || state.warehouseId,
        warehouseCode: ref || state.warehouseId,
        warehouseName: ref || state.warehouseName,
        itemGroup: group
      });
      state.catalogByGroup[group] = Array.isArray(catalog) ? catalog : [];
      if (group === "PARAPHERNALIA") {
        state.devotionalCategory = normalizeCategorySelection(getDevotionalCategories(), state.devotionalCategory);
      }
    } finally {
      state.loadingCatalog = false;
    }
  }

  async function lookupProfile() {
    const mobile = normalizeMobile(state.requestMobile);
    if (mobile.length !== 10) {
      showToast("Enter a valid 10-digit mobile number");
      return;
    }
    state.lookupInProgress = true;
    render();
    try {
      const profile = await window.erpApi.request("catalog.profileLookup", { requesterMobile: mobile });
      state.profileChecked = true;
      state.profile = profile || null;
      state.name = String(profile?.name || "").trim();
      state.requesterSegment = String(profile?.requesterSegment || "").trim();
      state.folkGuideName = String(profile?.folkGuideName || "").trim();
      state.preacherName = String(profile?.preacherName || "").trim();
      state.requesterLocation = String(profile?.requesterLocation || "").trim();
      render();
    } catch (error) {
      showToast(error.message || "Could not verify mobile number");
    } finally {
      state.lookupInProgress = false;
      render();
    }
  }

  function profileNeedsExtraField(segment) {
    return segment === "FOLK" || segment === "CONGREGATION";
  }

  function validateProfileBeforeSubmit() {
    const mobile = normalizeMobile(state.requestMobile);
    if (mobile.length !== 10) {
      showToast("Enter a valid 10-digit mobile number");
      return false;
    }
    if (!String(state.name || "").trim()) {
      showToast("Name is required");
      return false;
    }
    if (!String(state.requesterSegment || "").trim()) {
      showToast("Select category");
      return false;
    }
    if (state.requesterSegment === "FOLK" && !String(state.folkGuideName || "").trim()) {
      showToast("Folk guide name is required");
      return false;
    }
    if (state.requesterSegment === "CONGREGATION" && !String(state.preacherName || "").trim()) {
      showToast("Preacher name is required");
      return false;
    }
    if (!String(state.requesterLocation || "").trim()) {
      showToast("Location is required");
      return false;
    }
    return true;
  }

  async function submitRequest(event) {
    if (event) event.preventDefault();
    if (!state.cart.length) {
      showToast("Add at least one item");
      return;
    }
    if (!validateProfileBeforeSubmit()) return;
    state.requestSubmitting = true;
    setLoading(true, "Placing request...");
    try {
      const payload = {
        sourceWarehouseId: state.warehouseId,
        sourceWarehouseName: state.warehouseName,
        requesterName: String(state.name || "").trim(),
        requesterMobile: normalizeMobile(state.requestMobile),
        requesterSegment: String(state.requesterSegment || "").trim(),
        folkGuideName: String(state.folkGuideName || "").trim(),
        preacherName: String(state.preacherName || "").trim(),
        requesterLocation: String(state.requesterLocation || "").trim(),
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
      state.successMessage = result && result.requestCode
        ? `Request ${result.requestCode} was placed successfully for ${escapeHtml(getWarehouseLabel())}.`
        : `Your request was placed successfully for ${escapeHtml(getWarehouseLabel())}.`;
      state.view = "submitted";
      state.profile = {
        exists: true,
        complete: true,
        name: payload.requesterName,
        mobile: payload.requesterMobile,
        requesterSegment: payload.requesterSegment,
        folkGuideName: payload.folkGuideName,
        preacherName: payload.preacherName,
        requesterLocation: payload.requesterLocation
      };
      showToast("Request placed");
      render();
    } catch (error) {
      showToast(error.message || "Could not place request");
    } finally {
      state.requestSubmitting = false;
      setLoading(false);
    }
  }

  async function loadHistory() {
    const mobile = normalizeMobile(state.historyMobile);
    if (mobile.length !== 10) {
      showToast("Enter a valid 10-digit mobile number");
      return;
    }
    state.historyLoading = true;
    render();
    try {
      const rows = await window.erpApi.request("catalog.requestsByMobile", { requesterMobile: mobile });
      state.historyRows = Array.isArray(rows) ? rows : [];
      state.historyLoaded = true;
      state.historyExpanded = "";
      render();
    } catch (error) {
      showToast(error.message || "Could not load requests");
    } finally {
      state.historyLoading = false;
      render();
    }
  }

  function toggleHistoryDetails(requestId) {
    state.historyExpanded = state.historyExpanded === requestId ? "" : requestId;
    render();
  }

  function resetForAnotherRequest() {
    state.view = "catalog";
    state.search = "";
    state.cart = [];
    state.notes = "";
    state.requestMobile = "";
    state.lookupInProgress = false;
    state.profileChecked = false;
    state.profile = null;
    state.name = "";
    state.requesterSegment = "";
    state.folkGuideName = "";
    state.preacherName = "";
    state.requesterLocation = "";
    state.requestSubmitting = false;
    state.submitted = false;
    state.successMessage = "";
    render();
  }

  function openCart() {
    state.view = "cart";
    render();
  }

  function openCheckout() {
    if (!state.cart.length) {
      showToast("Add at least one item");
      return;
    }
    state.view = "checkout";
    render();
  }

  function openHistory() {
    state.view = "history";
    render();
  }

  function openCatalog() {
    state.view = "catalog";
    render();
  }

  async function installPwa() {
    if (!state.deferredInstallPrompt) {
      showToast("Install option is not available on this device right now");
      return;
    }
    state.deferredInstallPrompt.prompt();
    try {
      await state.deferredInstallPrompt.userChoice;
    } catch {}
    state.deferredInstallPrompt = null;
    state.installReady = false;
    render();
  }

  function renderFloatingActions() {
    return `
      <div class="floating-request-actions">
        ${state.installReady ? `<button class="segment" type="button" onclick="window.requestApp.installPwa()">Install App</button>` : ""}
        <button class="segment" type="button" onclick="window.requestApp.openHistory()">My Requests</button>
        <button class="segment active" type="button" onclick="window.requestApp.openCart()">Go to Cart (${cartTotalQty()})</button>
      </div>
    `;
  }

  function renderHeader() {
    const title = state.itemGroup === "PARAPHERNALIA" ? "Devotional Items" : "Books";
    return `
      <header class="public-hero">
        <div class="public-brand">
          <div class="public-mark">HKM</div>
          <div>
            <div class="public-title">Book Distribution Requests</div>
            <div class="public-subtitle">Browse, build your cart, and place requests for the ${escapeHtml(getWarehouseLabel())} warehouse.</div>
          </div>
        </div>
      </header>
      <section class="public-card category-switch-card">
        <div class="public-card-header compact-header">
          <h2>Select Category</h2>
          <div class="public-tag">${escapeHtml(title)}</div>
        </div>
        <div class="segmented category-segmented">
          <button class="segment ${state.itemGroup === "BOOK" ? "active" : ""}" type="button" onclick="window.requestApp.setCategory('BOOK')">Books</button>
          <button class="segment ${state.itemGroup === "PARAPHERNALIA" ? "active" : ""}" type="button" onclick="window.requestApp.setCategory('PARAPHERNALIA')">Devotional Items</button>
        </div>
      </section>
    `;
  }

  function renderCatalogCard(item) {
    const imageUrl = normalizeDriveImageUrl(item.imageUrl);
    const qty = Number(item.availableQty || 0);
    const metaParts = [];
    if (item.category || item.bookType) metaParts.push(item.category || item.bookType);
    return `
      <article class="catalog-card compact-card ${qty > 0 ? "" : "sold-out"}">
        <div class="catalog-image compact-image">
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
          <div class="catalog-name small-name">${escapeHtml(item.name || "-")}</div>
          <div class="catalog-meta">${escapeHtml(metaParts.join(" · "))}</div>
          <div class="catalog-stats compact-stats">
            <span>${money(Number(item.salePrice || 0))}</span>
            <span>${qty} in stock</span>
          </div>
          <div class="catalog-actions compact-actions">
            <input type="number" min="1" step="1" value="1" data-qty="${escapeAttr(item.erpCode)}">
            <button class="button small-button" type="button" ${qty > 0 ? `onclick="window.requestApp.addWithQty('${escapeAttr(item.erpCode)}')"` : "disabled"}>Add</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderCatalog() {
    const items = getFilteredItems();
    const devotionalCategories = getDevotionalCategories();
    const searchPlaceholder = state.itemGroup === "PARAPHERNALIA"
      ? "Search item name"
      : "Search book name";
    return `
      <section class="public-card request-main">
        <div class="public-card-header compact-header">
          <h2>${state.itemGroup === "PARAPHERNALIA" ? "Devotional Items" : "Books"}</h2>
          <div class="public-tag">${escapeHtml(getWarehouseLabel())}</div>
        </div>
        <div class="catalog-toolbar">
          <label class="field compact-field catalog-search">
            <span>${state.itemGroup === "PARAPHERNALIA" ? "Search devotional item" : "Search books"}</span>
            <input type="search" value="${escapeAttr(state.search)}" placeholder="${escapeAttr(searchPlaceholder)}" oninput="window.requestApp.setField('search', this.value)">
          </label>
          ${state.itemGroup === "PARAPHERNALIA" ? `
            <label class="field compact-field">
              <span>Devotional Category</span>
              <select onchange="window.requestApp.setField('devotionalCategory', this.value)">
                <option value="ALL"${state.devotionalCategory === "ALL" ? " selected" : ""}>All categories</option>
                ${devotionalCategories.map((category) => `<option value="${escapeAttr(category)}"${state.devotionalCategory === category ? " selected" : ""}>${escapeHtml(category)}</option>`).join("")}
              </select>
            </label>
          ` : ""}
        </div>
        ${state.loadingCatalog ? `<div class="empty-note">Loading catalog...</div>` : ""}
        ${!state.loadingCatalog && !items.length ? `<div class="empty-note">No matching ${state.itemGroup === "PARAPHERNALIA" ? "items" : "books"} found.</div>` : ""}
        ${!state.loadingCatalog ? `<div class="catalog-grid compact-grid">${items.map(renderCatalogCard).join("")}</div>` : ""}
      </section>
    `;
  }

  function renderCartLine(line) {
    return `
      <div class="cart-row">
        <div>
          <strong>${escapeHtml(line.itemName)}</strong>
          <div class="catalog-meta">${escapeHtml(line.itemGroup === "PARAPHERNALIA" ? "Devotional Item" : "Book")} · ${money(line.salePrice)}</div>
        </div>
        <div class="cart-row-actions">
          <input type="number" min="0" step="1" value="${escapeAttr(line.quantity)}" onchange="window.requestApp.updateCartQty('${escapeAttr(line.erpCode)}', this.value)">
          <button class="small-button danger" type="button" onclick="window.requestApp.removeCartLine('${escapeAttr(line.erpCode)}')">Remove</button>
        </div>
      </div>
    `;
  }

  function renderCartView() {
    return `
      <section class="public-card request-main">
        <div class="public-card-header">
          <h2>Your Cart</h2>
          <div class="public-tag">${cartTotalQty()} items</div>
        </div>
        <div class="cart-summary">
          <div><strong>Total Qty:</strong> ${cartTotalQty()}</div>
          <div><strong>Total Worth:</strong> ${money(cartTotalValue())}</div>
        </div>
        <div class="cart-items">
          ${state.cart.length ? state.cart.map(renderCartLine).join("") : `<div class="empty-note">Your cart is empty. Start by adding books or devotional items.</div>`}
        </div>
        <div class="public-actions checkout-actions">
          <button class="button secondary" type="button" onclick="window.requestApp.openCatalog()">Continue picking books / items</button>
          <button class="button" type="button" onclick="window.requestApp.openCheckout()" ${state.cart.length ? "" : "disabled"}>Place Request</button>
        </div>
      </section>
    `;
  }

  function renderProfileStatus() {
    if (!state.profileChecked) {
      return `<div class="empty-note">Enter your mobile number first. If you have placed requests before, we will detect your details automatically.</div>`;
    }
    if (state.lookupInProgress) {
      return `<div class="empty-note">Checking your mobile number...</div>`;
    }
    if (!state.profile || !state.profile.exists) {
      return `<div class="empty-note">First-time user. Please complete your details below.</div>`;
    }
    if (state.profile.complete) {
      return `<div class="success-inline">Welcome back, ${escapeHtml(state.profile.name || "devotee")}. We found your details. You can place the request directly now.</div>`;
    }
    return `<div class="empty-note">We found your number. Please complete the missing details below.</div>`;
  }

  function renderReferenceField() {
    if (state.requesterSegment === "FOLK") {
      if (FOLK_GUIDES.length) {
        return `
          <label class="field">
            <span>Folk Guide Name</span>
            <select onchange="window.requestApp.setField('folkGuideName', this.value)">
              <option value="">Select folk guide</option>
              ${FOLK_GUIDES.map((name) => `<option value="${escapeAttr(name)}"${state.folkGuideName === name ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
        `;
      }
      return `
        <label class="field">
          <span>Folk Guide Name</span>
          <input type="text" value="${escapeAttr(state.folkGuideName)}" placeholder="Enter folk guide name" oninput="window.requestApp.setField('folkGuideName', this.value)">
        </label>
      `;
    }
    if (state.requesterSegment === "CONGREGATION") {
      if (PREACHERS.length) {
        return `
          <label class="field">
            <span>Preacher Name</span>
            <select onchange="window.requestApp.setField('preacherName', this.value)">
              <option value="">Select preacher</option>
              ${PREACHERS.map((name) => `<option value="${escapeAttr(name)}"${state.preacherName === name ? " selected" : ""}>${escapeHtml(name)}</option>`).join("")}
            </select>
          </label>
        `;
      }
      return `
        <label class="field">
          <span>Preacher Name</span>
          <input type="text" value="${escapeAttr(state.preacherName)}" placeholder="Enter preacher name" oninput="window.requestApp.setField('preacherName', this.value)">
        </label>
      `;
    }
    return "";
  }

  function renderCheckoutView() {
    return `
      <section class="public-card request-main">
        <div class="public-card-header">
          <h2>Place Request</h2>
          <div class="public-tag">${escapeHtml(getWarehouseLabel())}</div>
        </div>
        <div class="cart-summary compact-summary">
          <div><strong>Total Qty:</strong> ${cartTotalQty()}</div>
          <div><strong>Total Worth:</strong> ${money(cartTotalValue())}</div>
        </div>
        <form class="public-form" onsubmit="window.requestApp.submitRequest(event)">
          <label class="field">
            <span>Mobile Number</span>
            <div class="mobile-lookup-row">
              <input type="tel" value="${escapeAttr(state.requestMobile)}" placeholder="10-digit mobile number" oninput="window.requestApp.setField('requestMobile', this.value)">
              <button class="button small-button" type="button" onclick="window.requestApp.lookupProfile()" ${state.lookupInProgress ? "disabled" : ""}>${state.lookupInProgress ? "Checking..." : "Continue"}</button>
            </div>
          </label>
          ${renderProfileStatus()}
          ${state.profileChecked ? `
            <div class="grid-two">
              <label class="field">
                <span>Name</span>
                <input type="text" value="${escapeAttr(state.name)}" placeholder="Your name" oninput="window.requestApp.setField('name', this.value)">
              </label>
              <label class="field">
                <span>Category</span>
                <select onchange="window.requestApp.setField('requesterSegment', this.value)">
                  <option value="">Select category</option>
                  <option value="FOLK"${state.requesterSegment === "FOLK" ? " selected" : ""}>FOLK</option>
                  <option value="CONGREGATION"${state.requesterSegment === "CONGREGATION" ? " selected" : ""}>Congregation</option>
                  <option value="FTM"${state.requesterSegment === "FTM" ? " selected" : ""}>FTM</option>
                </select>
              </label>
            </div>
            ${profileNeedsExtraField(state.requesterSegment) ? `<div class="grid-two">${renderReferenceField()}</div>` : ""}
            <div class="grid-two">
              <label class="field">
                <span>Where do you stay?</span>
                <input type="text" value="${escapeAttr(state.requesterLocation)}" placeholder="Location" oninput="window.requestApp.setField('requesterLocation', this.value)">
              </label>
              <label class="field">
                <span>Notes</span>
                <input type="text" value="${escapeAttr(state.notes)}" placeholder="Optional note" oninput="window.requestApp.setField('notes', this.value)">
              </label>
            </div>
          ` : ""}
          <div class="public-actions checkout-actions">
            <button class="button secondary" type="button" onclick="window.requestApp.openCart()">Back to Cart</button>
            <button class="button" type="submit" ${state.profileChecked && !state.requestSubmitting ? "" : "disabled"}>${state.requestSubmitting ? "Placing..." : "Place Request"}</button>
          </div>
        </form>
      </section>
    `;
  }

  function renderHistoryRows() {
    if (!state.historyLoaded) {
      return `<div class="empty-note">Enter your mobile number to view previous requests.</div>`;
    }
    if (!state.historyRows.length) {
      return `
        <div class="empty-note">
          There are no requests placed on this mobile number yet.
          <div class="public-actions inline-actions">
            <button class="button secondary" type="button" onclick="window.requestApp.openCatalog()">Go to Home</button>
          </div>
        </div>
      `;
    }
    return `
      <div class="history-table-wrap">
        <table class="history-table">
          <thead>
            <tr>
              <th>Request Date</th>
              <th>Request ID</th>
              <th>Status</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            ${state.historyRows.map((row) => `
              <tr>
                <td>${escapeHtml(formatDateTime(row.createdAt))}</td>
                <td>${escapeHtml(row.requestCode || row.requestId || "-")}</td>
                <td>${escapeHtml(row.status || "New")}</td>
                <td><button class="small-button" type="button" onclick="window.requestApp.toggleHistoryDetails('${escapeAttr(row.requestId)}')">${state.historyExpanded === row.requestId ? "Hide" : "Show"} Details</button></td>
              </tr>
              ${state.historyExpanded === row.requestId ? `
                <tr class="history-detail-row">
                  <td colspan="4">
                    <div class="history-detail-card">
                      <div class="detail-meta">
                        <div><strong>Name:</strong> ${escapeHtml(row.requesterName || "-")}</div>
                        <div><strong>Mobile:</strong> ${escapeHtml(row.requesterMobile || "-")}</div>
                        <div><strong>Total Qty:</strong> ${escapeHtml(String(row.totalQty || 0))}</div>
                        <div><strong>Total Worth:</strong> ${escapeHtml(money(row.totalAmount || 0))}</div>
                      </div>
                      <div class="history-detail-table-wrap">
                        <table class="history-detail-table">
                          <thead>
                            <tr>
                              <th>ERP Code</th>
                              <th>Item</th>
                              <th>Category</th>
                              <th>Qty</th>
                              <th>Rate</th>
                              <th>Amount</th>
                            </tr>
                          </thead>
                          <tbody>
                            ${(row.lines || []).map((line) => `
                              <tr>
                                <td>${escapeHtml(line.erpCode || "-")}</td>
                                <td>${escapeHtml(line.itemName || "-")}</td>
                                <td>${escapeHtml(line.itemGroup === "PARAPHERNALIA" ? "Devotional" : "Books")}</td>
                                <td>${escapeHtml(String(line.requestedQty || 0))}</td>
                                <td>${escapeHtml(money(line.salePrice || 0))}</td>
                                <td>${escapeHtml(money(line.lineTotal || 0))}</td>
                              </tr>
                            `).join("")}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </td>
                </tr>
              ` : ""}
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderHistoryView() {
    return `
      <section class="public-card request-main">
        <div class="public-card-header">
          <h2>My Requests</h2>
          <div class="public-tag">Search by mobile number</div>
        </div>
        <div class="history-lookup">
          <label class="field">
            <span>Mobile Number</span>
            <div class="mobile-lookup-row">
              <input type="tel" value="${escapeAttr(state.historyMobile)}" placeholder="10-digit mobile number" oninput="window.requestApp.setField('historyMobile', this.value)">
              <button class="button small-button" type="button" onclick="window.requestApp.loadHistory()" ${state.historyLoading ? "disabled" : ""}>${state.historyLoading ? "Checking..." : "Get My Requests"}</button>
            </div>
          </label>
        </div>
        ${renderHistoryRows()}
      </section>
    `;
  }

  function renderSubmittedView() {
    return `
      <section class="public-card success-card">
        <div class="success-badge">HKM</div>
        <h1>Request Submitted</h1>
        <p>Thank you. Your request has been recorded successfully for the ${escapeHtml(getWarehouseLabel())} warehouse.</p>
        <div class="success-meta">${state.successMessage}</div>
        <div class="public-actions centered-actions">
          <button class="button secondary" type="button" onclick="window.requestApp.openHistory()">My Requests</button>
          <button class="button" type="button" onclick="window.requestApp.resetForAnotherRequest()">Place Another Request</button>
        </div>
      </section>
    `;
  }

  function renderBody() {
    if (state.view === "cart") return renderCartView();
    if (state.view === "checkout") return renderCheckoutView();
    if (state.view === "history") return renderHistoryView();
    if (state.view === "submitted") return renderSubmittedView();
    return renderCatalog();
  }

  function renderPage() {
    return `
      <div class="public-shell pwa-shell">
        ${renderFloatingActions()}
        ${renderHeader()}
        ${renderBody()}
      </div>
    `;
  }

  function render() {
    syncRequestUrl();
    root.innerHTML = renderPage();
    renderImageViewer();
    document.title = state.view === "history" ? "My Requests" : "Book & Devotional Request";
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    });
  }

  function setupInstallPrompt() {
    window.addEventListener("beforeinstallprompt", (event) => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
      state.installReady = true;
      render();
    });
    window.addEventListener("appinstalled", () => {
      state.deferredInstallPrompt = null;
      state.installReady = false;
      render();
    });
  }

  window.requestApp = {
    setField,
    setCategory,
    addWithQty,
    updateCartQty,
    removeCartLine,
    openImageViewer,
    openImageViewerByCode,
    closeImageViewer,
    lookupProfile,
    submitRequest,
    loadHistory,
    toggleHistoryDetails,
    openCart,
    openCheckout,
    openCatalog,
    openHistory,
    resetForAnotherRequest,
    installPwa
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.imageViewer) {
      closeImageViewer();
    }
  });

  async function init() {
    try {
      setLoading(true, "Loading catalog...");
      await Promise.all([ensureCatalogLoaded("BOOK"), ensureCatalogLoaded("PARAPHERNALIA")]);
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

  registerServiceWorker();
  setupInstallPrompt();
  init();
})();
