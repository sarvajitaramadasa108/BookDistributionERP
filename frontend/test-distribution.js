(function () {
  const root = document.getElementById("testRoot");
  const overlay = document.getElementById("loadingOverlay");
  const toastStack = document.getElementById("toastStack");
  const config = window.ERP_CONFIG || {};
  const TEST_WAREHOUSE = "TEST";
  const PREACHERS = Array.isArray(config.publicRequestPreachers) ? config.publicRequestPreachers : [];
  const FOLK_GUIDES = Array.isArray(config.publicRequestFolkGuides) ? config.publicRequestFolkGuides : [];

  const state = {
    screen: "phone",
    view: "request",
    itemGroup: "BOOK",
    search: "",
    profile: null,
    mobile: "",
    profileForm: {
      name: "",
      age: "",
      category: "FOLK",
      preacherName: "",
      location: ""
    },
    catalogByGroup: { BOOK: [], PARAPHERNALIA: [] },
    requestQtyByCode: {},
    saleQtyByCode: {},
    activities: [],
    selectedRequestActivity: "General Issue",
    customRequestActivity: "",
    cart: [],
    activityDetailId: "",
    saleActivityId: "",
    activityStock: [],
    saleCart: [],
    salePayment: {
      open: false,
      method: "CASH",
      cashAmount: ""
    },
    loading: false
  };

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

  function money(value) {
    const number = Number(value || 0);
    return `Rs. ${number.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  }

  function qty(value) {
    const number = Number(value || 0);
    return number.toLocaleString("en-IN", { maximumFractionDigits: 2 });
  }

  function normalizeMobile(value) {
    return String(value || "").replace(/\D/g, "").slice(-10);
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function selectorSafe(value) {
    return String(value || "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
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

  function setLoading(value, label) {
    state.loading = value;
    if (!overlay) return;
    overlay.classList.toggle("hidden", !value);
    const text = overlay.querySelector("span");
    if (text) text.textContent = label || "Loading...";
  }

  function showToast(message) {
    if (!toastStack) return;
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    toastStack.appendChild(item);
    setTimeout(() => {
      item.classList.add("hide");
      setTimeout(() => item.remove(), 240);
    }, 2400);
  }

  function lineTotal(line) {
    return Number(line.quantity || 0) * Number(line.salePrice || line.rate || 0);
  }

  function collectionTotal(lines) {
    return (lines || []).reduce((sum, line) => sum + lineTotal(line), 0);
  }

  function cartQty(lines) {
    return (lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  }

  function activityStatus(summary) {
    const raw = String(summary.publicStatus || summary.status || "").trim();
    if (raw) return raw;
    if (Number(summary.totalSaleAmount || 0) > 0) return "Settlement Pending";
    if (Number(summary.totalReturnedAmount || 0) > 0) return "Return Pending";
    if (Number(summary.totalIssuedAmount || 0) > 0) return "Running";
    return "Open";
  }

  function bookPrice(book) {
    const explicit = Number(book.salePrice || book.rate || 0);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const issuedQty = Number(book.issuedQty || book.issueQty || 0);
    const amount = Number(book.amount || 0);
    return issuedQty > 0 ? Math.abs(amount) / issuedQty : 0;
  }

  function bookActivityNumbers(book) {
    const price = bookPrice(book);
    const issueQty = Number(book.issuedQty || book.issueQty || 0);
    const returnQty = Number(book.returnedQty || book.returnQty || 0);
    const saleQty = Number(book.actualSaleQty || book.soldQty || 0);
    const balanceQty = Math.max(Number(book.availableQty || book.unsettledQty || 0), 0);
    return {
      price,
      issueQty,
      returnQty,
      saleQty,
      balanceQty,
      issueWorth: issueQty * price,
      returnWorth: returnQty * price,
      saleWorth: saleQty * price,
      balanceWorth: balanceQty * price
    };
  }

  function activityWorth(activity) {
    const rows = activity.books || [];
    const totals = rows.reduce((sum, book) => {
      const values = bookActivityNumbers(book);
      sum.issueWorth += values.issueWorth;
      sum.returnWorth += values.returnWorth;
      sum.saleWorth += values.saleWorth;
      sum.balanceWorth += values.balanceWorth;
      sum.issueQty += values.issueQty;
      sum.returnQty += values.returnQty;
      sum.saleQty += values.saleQty;
      sum.balanceQty += values.balanceQty;
      return sum;
    }, { issueWorth: 0, returnWorth: 0, saleWorth: 0, balanceWorth: 0, issueQty: 0, returnQty: 0, saleQty: 0, balanceQty: 0 });
    if (!rows.length && activity.summary) {
      totals.issueQty = Number(activity.summary.issueQty || 0);
      totals.returnQty = Number(activity.summary.returnQty || 0);
      totals.saleQty = Number(activity.summary.saleQty || 0);
      totals.issueWorth = Number(activity.summary.saleDueAmount || 0);
      totals.balanceWorth = Math.max(totals.issueWorth - totals.returnWorth - totals.saleWorth, 0);
    }
    return totals;
  }

  function activityOptions() {
    const options = ["Add another activity", "General Issue"];
    for (const activity of state.activities || []) {
      const status = normalizeText(activityStatus(activity));
      if (status === "closed" || status === "settled") continue;
      const name = String(activity.activityName || activity.name || "").trim();
      if (name && !options.some((option) => normalizeText(option) === normalizeText(name))) {
        options.push(name);
      }
    }
    return options;
  }

  function profilePayload(extra) {
    const form = state.profile || state.profileForm || {};
    const category = String(form.category || "").toUpperCase();
    return {
      mobile: state.mobile,
      name: form.name,
      age: form.age,
      category,
      preacherName: form.preacherName,
      location: form.location,
      ...(extra || {})
    };
  }

  async function api(action, payload) {
    return window.erpApi.request(action, payload || {});
  }

  async function lookupProfile() {
    const mobile = normalizeMobile(document.getElementById("publicMobile")?.value || state.mobile);
    if (mobile.length !== 10) {
      showToast("Enter 10 digit mobile number");
      return;
    }
    state.mobile = mobile;
    try {
      setLoading(true, "Checking profile...");
      const result = await api("publicTest.profileLookup", { mobile });
      if (result.exists) {
        state.profile = result;
        state.profileForm = {
          name: result.name || "",
          age: result.age || "",
          category: result.category || "FOLK",
          preacherName: result.preacherName || "",
          location: result.location || ""
        };
        await loadHomeData();
        state.screen = "home";
      } else {
        state.screen = "profile";
      }
      render();
    } catch (error) {
      showToast(error.message || "Could not check profile");
    } finally {
      setLoading(false);
    }
  }

  async function saveProfile() {
    const form = state.profileForm;
    if (!form.name.trim()) return showToast("Name is required");
    if (!form.age || Number(form.age) <= 0) return showToast("Age is required");
    if (!form.category) return showToast("Category is required");
    if (["FOLK", "CONGREGATION"].includes(String(form.category).toUpperCase()) && !form.preacherName.trim()) {
      return showToast("Preacher name is required");
    }
    if (!form.location.trim()) return showToast("Location is required");
    try {
      setLoading(true, "Saving profile...");
      const result = await api("publicTest.profileSave", profilePayload());
      state.profile = result;
      await loadHomeData();
      state.screen = "home";
      render();
    } catch (error) {
      showToast(error.message || "Could not save profile");
    } finally {
      setLoading(false);
    }
  }

  async function loadHomeData() {
    const [books, items, activities] = await Promise.all([
      api("catalog.items", { itemGroup: "BOOK", sourceWarehouseId: TEST_WAREHOUSE }),
      api("catalog.items", { itemGroup: "PARAPHERNALIA", sourceWarehouseId: TEST_WAREHOUSE }),
      api("publicTest.activities", profilePayload())
    ]);
    state.catalogByGroup.BOOK = books || [];
    state.catalogByGroup.PARAPHERNALIA = items || [];
    state.activities = activities || [];
    if (!state.saleActivityId && state.activities.length) {
      state.saleActivityId = state.activities[0].activityId || "";
    }
  }

  async function refreshActivities() {
    state.activities = await api("publicTest.activities", profilePayload());
  }

  async function loadActivityStock(activityId) {
    const selected = activityId || state.saleActivityId;
    if (!selected) {
      state.activityStock = [];
      return;
    }
    state.activityStock = await api("publicTest.activityStock", profilePayload({ activityId: selected }));
  }

  function filteredCatalog() {
    const search = normalizeText(state.search);
    return (state.catalogByGroup[state.itemGroup] || []).filter((item) => {
      if (!search) return true;
      return [item.name, item.bookName, item.erpCode, item.bookId, item.category, item.bookType]
        .some((value) => normalizeText(value).includes(search));
    });
  }

  function filteredSaleStock() {
    const search = normalizeText(state.search);
    return (state.activityStock || []).filter((item) => {
      if (!search) return true;
      return [item.name, item.bookName, item.erpCode, item.bookId, item.itemGroup]
        .some((value) => normalizeText(value).includes(search));
    });
  }

  function pickerState(target) {
    return target === "sale" ? state.saleQtyByCode : state.requestQtyByCode;
  }

  function getPickerQty(code, target = "request") {
    const values = pickerState(target);
    const value = Number(values[code] ?? 0);
    return Number.isFinite(value) && value > 0 ? value : 0;
  }

  function setPickerQty(code, value, target = "request") {
    const values = pickerState(target);
    const item = findItem(code, target);
    const max = Number(item?.availableQty || 0);
    const number = Math.max(0, Math.floor(Number(value || 0)));
    values[code] = max > 0 ? Math.min(number, max) : number;
  }

  function adjustPickerQty(code, delta, target = "request") {
    setPickerQty(code, getPickerQty(code, target) + delta, target);
    const attr = target === "sale" ? "data-sale-picker-qty" : "data-request-picker-qty";
    const input = root.querySelector(`[${attr}="${selectorSafe(code)}"]`);
    if (input) input.value = pickerState(target)[code];
  }

  function addToCart(item, target, quantity) {
    const cart = target === "sale" ? state.saleCart : state.cart;
    const code = item.erpCode || item.bookId;
    const addQty = Math.max(0, Number(quantity || 0));
    if (addQty <= 0) {
      showToast("Enter quantity before adding");
      return;
    }
    const existing = cart.find((line) => line.erpCode === code);
    const availableQty = Number(item.availableQty || 0);
    if (existing) {
      existing.quantity = availableQty > 0
        ? Math.min(Number(existing.quantity || 0) + addQty, availableQty)
        : Number(existing.quantity || 0) + addQty;
    } else {
      cart.push({
        erpCode: code,
        bookId: code,
        itemName: item.name || item.bookName,
        name: item.name || item.bookName,
        itemGroup: item.itemGroup || state.itemGroup,
        salePrice: Number(item.salePrice || 0),
        rate: Number(item.salePrice || 0),
        availableQty,
        quantity: availableQty > 0 ? Math.min(addQty, availableQty) : addQty
      });
    }
    const updated = cart.find((line) => line.erpCode === code);
    if (updated && target === "sale") {
      showToast(`Sale cart: ${qty(updated.quantity)} ${updated.itemName}`);
    }
    render();
  }

  function applyPostedSale(lines, beforeStock, beforeBooks) {
    const soldByCode = new Map();
    for (const line of lines || []) {
      const code = String(line.erpCode || line.bookId || "");
      soldByCode.set(code, Number(soldByCode.get(code) || 0) + Number(line.quantity || 0));
    }
    const beforeStockByCode = new Map((beforeStock || []).map((item) => [String(item.erpCode || item.bookId || ""), Number(item.availableQty || 0)]));
    const beforeBookByCode = new Map((beforeBooks || []).map((book) => [String(book.erpCode || book.bookId || ""), Number(book.availableQty || book.unsettledQty || 0)]));
    state.activityStock = (state.activityStock || [])
      .map((item) => {
        const code = String(item.erpCode || item.bookId || "");
        const soldQty = Number(soldByCode.get(code) || 0);
        if (!soldQty) return item;
        const expectedAvailable = Math.max(Number(beforeStockByCode.get(code) || item.availableQty || 0) - soldQty, 0);
        const nextAvailable = Math.min(Number(item.availableQty || 0), expectedAvailable);
        return {
          ...item,
          availableQty: nextAvailable,
          unsettledQty: nextAvailable
        };
      })
      .filter((item) => Number(item.availableQty || 0) > 0);
    const activity = (state.activities || []).find((row) => row.activityId === state.saleActivityId);
    if (!activity) return;
    activity.books = (activity.books || []).map((book) => {
      const code = String(book.erpCode || book.bookId || "");
      const soldQty = Number(soldByCode.get(code) || 0);
      if (!soldQty) return book;
      const expectedAvailable = Math.max(Number(beforeBookByCode.get(code) || book.availableQty || book.unsettledQty || 0) - soldQty, 0);
      const currentAvailable = Number(book.availableQty || book.unsettledQty || 0);
      const nextAvailable = Math.min(currentAvailable, expectedAvailable);
      const appliedSaleQty = Math.max(currentAvailable - nextAvailable, 0);
      const nextSale = Number(book.actualSaleQty || book.soldQty || 0) + appliedSaleQty;
      return {
        ...book,
        actualSaleQty: nextSale,
        soldQty: nextSale,
        saleQty: nextSale,
        availableQty: nextAvailable,
        unsettledQty: nextAvailable
      };
    });
  }

  function setLineQty(target, code, value) {
    const cart = target === "sale" ? state.saleCart : state.cart;
    const line = cart.find((item) => item.erpCode === code);
    if (!line) return;
    line.quantity = Math.max(0, Number(value || 0));
    if (line.quantity <= 0) {
      const index = cart.indexOf(line);
      cart.splice(index, 1);
    }
    render();
  }

  async function submitRequest() {
    if (!state.cart.length) return showToast("Add items to cart");
    const choice = state.selectedRequestActivity;
    const requestActivityName = choice === "Add another activity"
      ? String(state.customRequestActivity || "").trim()
      : String(choice || "General Issue").trim();
    if (!requestActivityName) return showToast("Enter activity name");
    try {
      setLoading(true, "Placing request...");
      const result = await api("publicTest.submitRequest", profilePayload({
        requestActivityName,
        lines: state.cart
      }));
      state.cart = [];
      state.selectedRequestActivity = requestActivityName;
      state.customRequestActivity = "";
      await refreshActivities();
      state.view = "track";
      render();
      showToast(`Request placed: ${result.requestCode || "Done"}`);
    } catch (error) {
      showToast(error.message || "Could not place request");
    } finally {
      setLoading(false);
    }
  }

  function openSalePayment() {
    if (!state.saleActivityId) return showToast("Select activity");
    if (!state.saleCart.length) return showToast("Add items to sale");
    state.salePayment = { open: true, method: "CASH", cashAmount: "" };
    render();
  }

  async function submitSale() {
    const total = collectionTotal(state.saleCart);
    const method = state.salePayment.method;
    const cash = method === "CASH" ? total : method === "ONLINE" ? 0 : Number(state.salePayment.cashAmount || 0);
    const online = total - cash;
    if (cash < 0 || online < 0) return showToast("Invalid payment split");
    const postedLines = state.saleCart.map((line) => ({ ...line }));
    const beforeStock = (state.activityStock || []).map((item) => ({ ...item }));
    const beforeActivity = (state.activities || []).find((row) => row.activityId === state.saleActivityId);
    const beforeBooks = (beforeActivity?.books || []).map((book) => ({ ...book }));
    try {
      setLoading(true, "Posting sale...");
      const result = await api("publicTest.submitSale", profilePayload({
        activityId: state.saleActivityId,
        paymentMethod: method,
        cashAmount: cash,
        onlineAmount: online,
        lines: state.saleCart
      }));
      state.saleCart = [];
      state.salePayment.open = false;
      await Promise.all([refreshActivities(), loadActivityStock(state.saleActivityId)]);
      applyPostedSale(postedLines, beforeStock, beforeBooks);
      render();
      showToast(`Sale posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post sale");
    } finally {
      setLoading(false);
    }
  }

  function renderPhone() {
    return `
      <section class="public-hero test-hero">
        <div class="public-tag">Test Warehouse</div>
        <h1>Book Distribution Track</h1>
        <p>Enter your mobile number to request stock, track activity stock, and post sales.</p>
      </section>
      <section class="public-card">
        <label class="field-label" for="publicMobile">Mobile Number</label>
        <input id="publicMobile" class="public-input" inputmode="numeric" maxlength="10" value="${escapeAttr(state.mobile)}" placeholder="10 digit mobile number">
        <button class="button wide" data-action="lookupProfile">Continue</button>
      </section>
    `;
  }

  function renderProfile() {
    const form = state.profileForm;
    const category = String(form.category || "").toUpperCase();
    const preacherOptions = (category === "FOLK" ? FOLK_GUIDES : PREACHERS).filter(Boolean);
    return `
      <section class="public-card">
        <h1>Your Details</h1>
        <label class="field-label">Name</label>
        <input class="public-input" data-profile-field="name" value="${escapeAttr(form.name)}">
        <label class="field-label">Age</label>
        <input class="public-input" data-profile-field="age" type="number" min="1" value="${escapeAttr(form.age)}">
        <label class="field-label">Category</label>
        <select class="public-input" data-profile-field="category">
          ${["FOLK", "Congregation", "FTM"].map((option) => `<option value="${escapeAttr(option)}" ${normalizeText(option) === normalizeText(form.category) ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
        ${["FOLK", "CONGREGATION"].includes(category) ? `
          <label class="field-label">Preacher Name</label>
          ${preacherOptions.length ? `
            <select class="public-input" data-profile-field="preacherName">
              <option value="">Select preacher</option>
              ${preacherOptions.map((option) => `<option value="${escapeAttr(option)}" ${option === form.preacherName ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
            </select>
          ` : `<input class="public-input" data-profile-field="preacherName" value="${escapeAttr(form.preacherName)}" placeholder="Preacher name">`}
        ` : ""}
        <label class="field-label">Location</label>
        <input class="public-input" data-profile-field="location" value="${escapeAttr(form.location)}">
        <button class="button wide" data-action="saveProfile">Save and Continue</button>
      </section>
    `;
  }

  function renderNav() {
    const items = [
      ["request", "Place A Request"],
      ["track", "My Stock Track"],
      ["sale", "Enter Sale"],
      ["reports", "Reports"]
    ];
    return `
      <header class="test-app-header">
        <div>
          <div class="public-tag">TEST</div>
          <h1>Distribution Track</h1>
        </div>
        <button class="button secondary small-button" data-action="logoutProfile">Change Phone</button>
      </header>
      <nav class="test-nav">
        ${items.map(([view, label]) => `<button class="segment ${state.view === view ? "active" : ""}" data-view="${view}">${label}</button>`).join("")}
      </nav>
    `;
  }

  function renderGroupToggle() {
    return `
      <div class="segmented category-segmented">
        <button class="segment ${state.itemGroup === "BOOK" ? "active" : ""}" data-group="BOOK">Books</button>
        <button class="segment ${state.itemGroup === "PARAPHERNALIA" ? "active" : ""}" data-group="PARAPHERNALIA">Devotional Items</button>
      </div>
    `;
  }

  function renderSearch() {
    return `<input class="public-input sticky-search" data-search-input value="${escapeAttr(state.search)}" placeholder="Search item name or code">`;
  }

  function renderCatalogCard(item, target) {
    const code = item.erpCode || item.bookId;
    const inCart = (target === "sale" ? state.saleCart : state.cart).find((line) => line.erpCode === code);
    const availableQty = Number(item.availableQty || 0);
    const imageUrl = target === "request" ? normalizeDriveImageUrl(item.imageUrl) : "";
    const fallback = String(item.name || item.bookName || "Item").split(" ").slice(0, 2).map((part) => part[0] || "").join("").toUpperCase();
    if (target === "request") {
      return `
        <article class="catalog-card compact-card ${availableQty > 0 ? "" : "sold-out"}">
          <div class="catalog-image compact-image">
            ${imageUrl ? `<img src="${escapeAttr(imageUrl)}" alt="${escapeAttr(item.name || item.bookName)}" loading="lazy" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')">` : ""}
            <div class="catalog-fallback ${imageUrl ? "hidden" : ""}">${escapeHtml(fallback)}</div>
          </div>
          <div class="catalog-body">
            <div class="catalog-name small-name">${escapeHtml(item.name || item.bookName || "-")}</div>
            <div class="catalog-meta">${escapeHtml(code)}</div>
            <div class="catalog-stats compact-stats">
              <span>${money(item.salePrice)}</span>
              <span>${qty(availableQty)} available</span>
            </div>
            <div class="request-qty-row">
              <button class="qty-step-button" type="button" data-request-qty-minus="${escapeAttr(code)}" aria-label="Decrease quantity">-</button>
              <input class="request-picker-qty" type="number" min="0" ${availableQty > 0 ? `max="${escapeAttr(availableQty)}"` : ""} value="${escapeAttr(getPickerQty(code))}" data-request-picker-qty="${escapeAttr(code)}">
              <button class="qty-step-button" type="button" data-request-qty-plus="${escapeAttr(code)}" aria-label="Increase quantity">+</button>
            </div>
            <button class="button small-button" type="button" data-add-${target}="${escapeAttr(code)}">${inCart ? `Added (${qty(inCart.quantity)})` : "Add"}</button>
          </div>
        </article>
      `;
    }
    if (target === "sale") {
      return `
        <article class="catalog-card compact-card sale-catalog-card ${availableQty > 0 ? "" : "sold-out"}">
          <div class="catalog-body">
            <div class="catalog-name small-name">${escapeHtml(item.name || item.bookName || "-")}</div>
            <div class="catalog-meta">${escapeHtml(code)}</div>
            <div class="catalog-stats compact-stats">
              <span>${money(item.salePrice)}</span>
              <span>${qty(availableQty)} available</span>
            </div>
            <div class="request-qty-row">
              <button class="qty-step-button" type="button" data-sale-qty-minus="${escapeAttr(code)}" aria-label="Decrease quantity">-</button>
              <input class="request-picker-qty" type="number" min="0" ${availableQty > 0 ? `max="${escapeAttr(availableQty)}"` : ""} value="${escapeAttr(getPickerQty(code, "sale"))}" data-sale-picker-qty="${escapeAttr(code)}">
              <button class="qty-step-button" type="button" data-sale-qty-plus="${escapeAttr(code)}" aria-label="Increase quantity">+</button>
            </div>
            <button class="button small-button" type="button" data-add-sale="${escapeAttr(code)}">${inCart ? `Added (${qty(inCart.quantity)})` : "Add"}</button>
          </div>
        </article>
      `;
    }
    return `
      <article class="test-sale-card">
        <div>
          <h3>${escapeHtml(item.name || item.bookName)}</h3>
          <p>${escapeHtml(code)} · ${money(item.salePrice)}</p>
          <p>${qty(availableQty)} available</p>
        </div>
        <button class="button secondary" data-add-${target}="${escapeAttr(code)}">${inCart ? `Added (${qty(inCart.quantity)})` : "Add"}</button>
      </article>
    `;
  }

  function renderRequest() {
    const rows = filteredCatalog();
    return `
      <div class="floating-request-actions test-floating-actions"><button class="segment active" data-action="showRequestCart">Go to Cart (${cartQty(state.cart)})</button></div>
      <section class="public-card">
        <div class="public-card-header compact-header">
          <h2>Place A Request</h2>
          <div class="public-tag">${state.itemGroup === "BOOK" ? "Books" : "Devotional Items"}</div>
        </div>
        <div class="catalog-toolbar">
          <div>${renderGroupToggle()}</div>
          ${renderSearch()}
        </div>
      </section>
      <section class="catalog-grid compact-grid test-catalog-grid">
        ${rows.map((item) => renderCatalogCard(item, "request")).join("") || `<div class="empty-state">No stock found.</div>`}
      </section>
    `;
  }

  function renderRequestCart() {
    const options = activityOptions();
    return `
      <section class="public-card">
        <h2>Request Cart</h2>
        ${state.cart.map((line) => `
          <div class="cart-row">
            <div><strong>${escapeHtml(line.itemName)}</strong><p>${money(line.salePrice)} · ${escapeHtml(line.erpCode)}</p></div>
            <input class="qty-input" type="number" min="0" value="${escapeAttr(line.quantity)}" data-cart-qty="${escapeAttr(line.erpCode)}">
          </div>
        `).join("") || `<div class="empty-state">Your cart is empty.</div>`}
        <label class="field-label">Activity Name</label>
        <select class="public-input" data-request-activity>
          ${options.map((option) => `<option value="${escapeAttr(option)}" ${option === state.selectedRequestActivity ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}
        </select>
        ${state.selectedRequestActivity === "Add another activity" ? `<input class="public-input" data-custom-request-activity value="${escapeAttr(state.customRequestActivity)}" placeholder="Type activity name">` : ""}
        <div class="button-row">
          <button class="button secondary" data-action="backToRequest">Back</button>
          <button class="button" data-action="submitRequest">Place Request</button>
        </div>
      </section>
    `;
  }

  function renderTrack() {
    const detail = state.activities.find((activity) => activity.activityId === state.activityDetailId);
    if (detail) return renderActivityDetail(detail);
    return `
      <section class="public-card">
        <h2>My Stock Track</h2>
        <p class="muted">Activity-wise issue, return, and sale status.</p>
      </section>
      <section class="activity-list">
        ${state.activities.map((activity) => {
          const totals = activityWorth(activity);
          return `
          <article class="public-card activity-card">
            <div class="split-row">
              <div>
                <h3>${escapeHtml(activity.activityName || "Activity")}</h3>
                <p>${escapeHtml(activityStatus(activity))}</p>
              </div>
              <button class="button secondary small-button" data-detail-activity="${escapeAttr(activity.activityId)}">Details</button>
            </div>
            <div class="metric-grid">
              <div><span>Issue Worth</span><strong>${money(totals.issueWorth)}</strong></div>
              <div><span>Return Worth</span><strong>${money(totals.returnWorth)}</strong></div>
              <div><span>Sale Worth</span><strong>${money(totals.saleWorth)}</strong></div>
              <div><span>Balance Worth</span><strong>${money(totals.balanceWorth)}</strong></div>
            </div>
          </article>
        `; }).join("") || `<div class="empty-state">No activities yet.</div>`}
      </section>
    `;
  }

  function renderActivityDetail(activity) {
    const docs = activity.documents || [];
    const books = activity.books || [];
    const totals = activityWorth(activity);
    return `
      <section class="public-card">
        <button class="button secondary small-button" data-action="backToTrack">Back</button>
        <h2>${escapeHtml(activity.activityName || "Activity")}</h2>
        <p>${escapeHtml(activityStatus(activity))}</p>
        <div class="metric-grid">
          <div><span>Issue Worth</span><strong>${money(totals.issueWorth)}</strong></div>
          <div><span>Return Worth</span><strong>${money(totals.returnWorth)}</strong></div>
          <div><span>Sale Worth</span><strong>${money(totals.saleWorth)}</strong></div>
          <div><span>Balance Worth</span><strong>${money(totals.balanceWorth)}</strong></div>
        </div>
      </section>
      <section class="public-card">
        <h3>Issues and Returns</h3>
        ${docs.map((doc) => `
          <div class="cart-row">
            <div><strong>${escapeHtml(doc.documentCode || doc.documentId || "-")}</strong><p>${escapeHtml(doc.documentType || "")} · ${escapeHtml(doc.documentDate || "")}</p></div>
            <strong>${money(doc.amount)}</strong>
          </div>
        `).join("") || `<p class="muted">No documents found.</p>`}
      </section>
      <section class="public-card table-scroll">
        <h3>Item Details</h3>
        <table class="mini-table">
          <thead><tr><th>Item</th><th>Issue</th><th>Return</th><th>Sale</th><th>Balance</th></tr></thead>
          <tbody>
            ${books.map((book) => {
              const values = bookActivityNumbers(book);
              return `<tr>
                <td>${escapeHtml(book.name || book.bookName || book.erpCode || book.bookId)}</td>
                <td>${qty(values.issueQty)}<br><strong>${money(values.issueWorth)}</strong></td>
                <td>${qty(values.returnQty)}<br><strong>${money(values.returnWorth)}</strong></td>
                <td>${qty(values.saleQty)}<br><strong>${money(values.saleWorth)}</strong></td>
                <td>${qty(values.balanceQty)}<br><strong>${money(values.balanceWorth)}</strong></td>
              </tr>`;
            }).join("") || `<tr><td colspan="5">No item stock rows found for this activity.</td></tr>`}
          </tbody>
        </table>
      </section>
    `;
  }

  function renderSale() {
    const total = collectionTotal(state.saleCart);
    return `
      <div class="floating-request-actions test-floating-actions"><button class="segment active" data-action="openSalePayment">Post Sale (${money(total)})</button></div>
      <section class="public-card">
        <h2>Enter Sale</h2>
        <label class="field-label">Running Activity</label>
        <select class="public-input" data-sale-activity>
          <option value="">Select activity</option>
          ${state.activities.map((activity) => `<option value="${escapeAttr(activity.activityId)}" ${activity.activityId === state.saleActivityId ? "selected" : ""}>${escapeHtml(activity.activityName || "Activity")}</option>`).join("")}
        </select>
        ${renderSearch()}
      </section>
      <section class="public-card sale-cart-panel">
        <div class="public-card-header compact-header">
          <h3>Post Sale Cart</h3>
          <div class="public-tag">${cartQty(state.saleCart)} items · ${money(total)}</div>
        </div>
        <div class="compact-sale-cart">
          ${state.saleCart.map((line) => `
            <div class="cart-row compact-cart-row">
              <div><strong>${escapeHtml(line.itemName)}</strong><p>${money(line.salePrice)} · ${escapeHtml(line.erpCode)}</p></div>
              <input class="qty-input" type="number" min="0" value="${escapeAttr(line.quantity)}" data-sale-qty="${escapeAttr(line.erpCode)}">
            </div>
          `).join("") || `<p class="muted">Select items below.</p>`}
        </div>
      </section>
      <section class="catalog-grid compact-grid test-catalog-grid sale-catalog-grid">
        ${filteredSaleStock().map((item) => renderCatalogCard(item, "sale")).join("") || `<div class="empty-state">Select an activity to see available stock.</div>`}
      </section>
      ${state.salePayment.open ? renderPaymentPanel() : ""}
    `;
  }

  function renderPaymentPanel() {
    const total = collectionTotal(state.saleCart);
    const method = state.salePayment.method;
    const cash = method === "CASH" ? total : method === "ONLINE" ? 0 : Number(state.salePayment.cashAmount || 0);
    const online = total - cash;
    return `
      <div class="modal-backdrop">
        <section class="public-card payment-card">
          <div class="split-row"><h2>Payment Method</h2><strong>${money(total)}</strong></div>
          <div class="payment-method-grid">
            ${["CASH", "ONLINE", "MIXED"].map((option) => `<button class="payment-method-button ${method === option ? "active" : ""}" data-payment-method="${option}">${escapeHtml(option)}</button>`).join("")}
          </div>
          ${method === "MIXED" ? `
            <label class="field-label">Cash Received</label>
            <input class="public-input" inputmode="decimal" data-sale-cash value="${escapeAttr(state.salePayment.cashAmount)}" placeholder="Enter cash amount">
          ` : ""}
          <div class="metric-grid">
            <div><span>Cash</span><strong>${money(cash)}</strong></div>
            <div><span>Online</span><strong>${money(online)}</strong></div>
          </div>
          <div class="button-row">
            <button class="button secondary" data-action="closeSalePayment">Back</button>
            <button class="button" data-action="submitSale">Done and Post Sale</button>
          </div>
        </section>
      </div>
    `;
  }

  function renderReports() {
    return `
      <section class="public-card">
        <h2>Reports</h2>
        <p class="muted">Reports will be added in the next stage.</p>
      </section>
    `;
  }

  function renderHome() {
    const body = state.view === "requestCart" ? renderRequestCart()
      : state.view === "request" ? renderRequest()
      : state.view === "track" ? renderTrack()
      : state.view === "sale" ? renderSale()
      : renderReports();
    return `${renderNav()}${body}`;
  }

  function render() {
    if (!root) return;
    root.innerHTML = state.screen === "phone" ? renderPhone()
      : state.screen === "profile" ? renderProfile()
      : renderHome();
  }

  function findItem(code, target) {
    if (target === "sale") return (state.activityStock || []).find((item) => String(item.erpCode || item.bookId) === String(code));
    return (state.catalogByGroup[state.itemGroup] || []).find((item) => String(item.erpCode || item.bookId) === String(code));
  }

  root.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const action = button.dataset.action;
    if (button.dataset.view) {
      state.view = button.dataset.view;
      state.search = "";
      if (state.view === "track" || state.view === "sale") {
        try {
          setLoading(true, state.view === "sale" ? "Loading activity stock..." : "Loading activities...");
          await refreshActivities();
          if (!state.saleActivityId && state.activities.length) {
            state.saleActivityId = state.activities[0].activityId || "";
          }
          if (state.view === "sale") {
            await loadActivityStock();
          }
        } catch (error) {
          showToast(error.message || "Could not load activities");
        } finally {
          setLoading(false);
        }
      }
      render();
      return;
    }
    if (button.dataset.group) {
      state.itemGroup = button.dataset.group;
      render();
      return;
    }
    if (button.dataset.addRequest) {
      const item = findItem(button.dataset.addRequest, "request");
      if (item) addToCart(item, "request", getPickerQty(button.dataset.addRequest));
      return;
    }
    if (button.dataset.requestQtyMinus) {
      adjustPickerQty(button.dataset.requestQtyMinus, -1);
      return;
    }
    if (button.dataset.requestQtyPlus) {
      adjustPickerQty(button.dataset.requestQtyPlus, 1);
      return;
    }
    if (button.dataset.addSale) {
      const item = findItem(button.dataset.addSale, "sale");
      if (item) addToCart(item, "sale", getPickerQty(button.dataset.addSale, "sale"));
      return;
    }
    if (button.dataset.saleQtyMinus) {
      adjustPickerQty(button.dataset.saleQtyMinus, -1, "sale");
      return;
    }
    if (button.dataset.saleQtyPlus) {
      adjustPickerQty(button.dataset.saleQtyPlus, 1, "sale");
      return;
    }
    if (button.dataset.detailActivity) {
      state.activityDetailId = button.dataset.detailActivity;
      render();
      return;
    }
    if (button.dataset.paymentMethod) {
      state.salePayment.method = button.dataset.paymentMethod;
      render();
      return;
    }
    if (action === "lookupProfile") await lookupProfile();
    if (action === "saveProfile") await saveProfile();
    if (action === "logoutProfile") {
      state.screen = "phone";
      state.profile = null;
      render();
    }
    if (action === "showRequestCart") {
      state.view = "requestCart";
      render();
    }
    if (action === "backToRequest") {
      state.view = "request";
      render();
    }
    if (action === "submitRequest") await submitRequest();
    if (action === "backToTrack") {
      state.activityDetailId = "";
      render();
    }
    if (action === "openSalePayment") openSalePayment();
    if (action === "closeSalePayment") {
      state.salePayment.open = false;
      render();
    }
    if (action === "submitSale") await submitSale();
  });

  root.addEventListener("input", (event) => {
    const input = event.target;
    if (input.id === "publicMobile") {
      state.mobile = normalizeMobile(input.value);
      input.value = state.mobile;
      return;
    }
    if (input.dataset.profileField) {
      state.profileForm[input.dataset.profileField] = input.value;
      if (input.dataset.profileField === "category") {
        state.profileForm.preacherName = "";
        render();
      }
      return;
    }
    if (input.dataset.searchInput !== undefined) {
      state.search = input.value;
      const section = state.view === "sale"
        ? root.querySelector(".sale-catalog-grid")
        : root.querySelector(".test-catalog-grid");
      if (section) {
        const rows = state.view === "sale"
          ? filteredSaleStock().map((item) => renderCatalogCard(item, "sale"))
          : filteredCatalog().map((item) => renderCatalogCard(item, "request"));
        section.innerHTML = rows.join("") || `<div class="empty-state">No stock found.</div>`;
      }
      return;
    }
    if (input.dataset.requestPickerQty !== undefined) {
      setPickerQty(input.dataset.requestPickerQty, input.value, "request");
      input.value = state.requestQtyByCode[input.dataset.requestPickerQty];
      return;
    }
    if (input.dataset.salePickerQty !== undefined) {
      setPickerQty(input.dataset.salePickerQty, input.value, "sale");
      input.value = state.saleQtyByCode[input.dataset.salePickerQty];
      return;
    }
    if (input.dataset.cartQty) {
      setLineQty("request", input.dataset.cartQty, input.value);
      return;
    }
    if (input.dataset.saleQty) {
      setLineQty("sale", input.dataset.saleQty, input.value);
      return;
    }
    if (input.dataset.customRequestActivity !== undefined) {
      state.customRequestActivity = input.value;
      return;
    }
    if (input.dataset.saleCash !== undefined) {
      state.salePayment.cashAmount = input.value;
    }
  });

  root.addEventListener("focusin", (event) => {
    const input = event.target;
    if (input.dataset?.requestPickerQty !== undefined) {
      setTimeout(() => input.select(), 0);
    }
    if (input.dataset?.salePickerQty !== undefined) {
      setTimeout(() => input.select(), 0);
    }
  });

  root.addEventListener("change", async (event) => {
    const input = event.target;
    if (input.dataset.profileField) {
      state.profileForm[input.dataset.profileField] = input.value;
      if (input.dataset.profileField === "category") {
        state.profileForm.preacherName = "";
        render();
      }
      return;
    }
    if (input.dataset.requestActivity !== undefined) {
      state.selectedRequestActivity = input.value;
      render();
      return;
    }
    if (input.dataset.saleActivity !== undefined) {
      state.saleActivityId = input.value;
      state.saleCart = [];
      try {
        setLoading(true, "Loading activity stock...");
        await loadActivityStock(state.saleActivityId);
        render();
      } catch (error) {
        showToast(error.message || "Could not load activity stock");
      } finally {
        setLoading(false);
      }
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/test-distribution-sw.js").catch(() => {});
  }

  render();
})();
