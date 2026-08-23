(function () {
  const root = document.getElementById("salesRoot");
  const modalRoot = document.getElementById("modalRoot");
  const overlay = document.getElementById("loadingOverlay");
  const toastStack = document.getElementById("toastStack");
  const APP_TITLE = "HKM Vizag Book Distribution";
  const APP_SUBTITLE = "Sign in with your warehouse account to post direct sale entries from live stock.";
  const QR_IMAGE_URL = "/assets/idfc-qr.jpg";

  const state = {
    currentUser: null,
    itemGroup: "BOOK",
    devotionalCategory: "ALL",
    search: "",
    warehouseId: "",
    warehouseName: "",
    catalogByGroup: {
      BOOK: [],
      PARAPHERNALIA: []
    },
    loadingCatalog: false,
    cart: [],
    notes: "",
    view: "catalog",
    imageViewer: null,
    mySales: [],
    mySalesLoaded: false,
    mySalesLoading: false,
    mySalesExpanded: "",
    requestSubmitting: false,
    submittedSaleId: "",
    lastSubmittedSale: null,
    paymentDialog: {
      open: false,
      method: "CASH",
      mixedCash: "",
      error: ""
    },
    printerTransport: "",
    printerReady: false,
    printerLabel: "Not connected",
    printerBaudRate: "9600",
    printerPort: null,
    printerDevice: null,
    printerUsbInterfaceNumber: null,
    printerUsbEndpointOut: null,
    installReady: false,
    deferredInstallPrompt: null
  };

  function resetWarehouseSessionState() {
    state.warehouseId = "";
    state.warehouseName = "";
    state.catalogByGroup = {
      BOOK: [],
      PARAPHERNALIA: []
    };
    state.loadingCatalog = false;
    state.cart = [];
    state.notes = "";
    state.search = "";
    state.devotionalCategory = "ALL";
    state.itemGroup = "BOOK";
    state.mySales = [];
    state.mySalesLoaded = false;
    state.mySalesLoading = false;
    state.mySalesExpanded = "";
    state.submittedSaleId = "";
    state.lastSubmittedSale = null;
    state.view = "catalog";
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
    return `Rs. ${number.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
  }

  function moneyNumber(value) {
    const number = Number(value || 0);
    return number.toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  }

  function concatUint8Arrays(parts) {
    const arrays = parts.filter(Boolean).map((part) => part instanceof Uint8Array ? part : new Uint8Array(part));
    const totalLength = arrays.reduce((sum, array) => sum + array.length, 0);
    const merged = new Uint8Array(totalLength);
    let offset = 0;
    arrays.forEach((array) => {
      merged.set(array, offset);
      offset += array.length;
    });
    return merged;
  }

  function encodeEscPosText(value) {
    return new TextEncoder().encode(String(value || ""));
  }

  function uint8ToBase64(bytes) {
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      const slice = bytes.subarray(i, i + chunk);
      binary += String.fromCharCode(...slice);
    }
    return btoa(binary);
  }

  function hasAndroidPrinterBridge() {
    return typeof window !== "undefined" && !!window.AndroidPosPrinter;
  }

  function canUseAndroidNativePrint() {
    return hasAndroidPrinterBridge() && typeof window.AndroidPosPrinter.printHtml === "function";
  }

  function parseNativeResponse(raw) {
    try {
      return typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch (error) {
      return { ok: false, message: "Invalid printer response" };
    }
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

  function getStoredSessionToken() {
    try {
      return window.localStorage.getItem("hkm-session-token") || "";
    } catch (error) {
      return "";
    }
  }

  function setStoredSessionToken(token) {
    try {
      if (token) {
        window.localStorage.setItem("hkm-session-token", token);
      } else {
        window.localStorage.removeItem("hkm-session-token");
      }
    } catch (error) {
      // ignore storage issues
    }
  }

  function normalizeCategorySelection(categories, value) {
    const raw = String(value || "").trim();
    if (!raw || raw.toUpperCase() === "ALL") return "ALL";
    return categories.includes(raw) ? raw : "ALL";
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

  function getFilteredItems() {
    const query = normalizeText(state.search);
    return getActiveCatalog()
      .filter((item) => {
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
      })
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")) || String(a.erpCode || "").localeCompare(String(b.erpCode || "")));
  }

  function getItemByCode(erpCode) {
    return [...getCatalog("BOOK"), ...getCatalog("PARAPHERNALIA")].find((item) => String(item.erpCode || "") === String(erpCode || ""));
  }

  function cartTotalQty() {
    return state.cart.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  }

  function cartTotalValue() {
    return state.cart.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.salePrice || 0), 0);
  }

  function currentPaymentMethod() {
    return String(state.paymentDialog?.method || "CASH").toUpperCase();
  }

  function paymentMethodLabel(method) {
    if (method === "ONLINE") return "Online";
    if (method === "MIXED") return "Mixed";
    return "Cash";
  }

  function paymentBreakup() {
    const total = Number(cartTotalValue() || 0);
    const method = currentPaymentMethod();
    if (method === "ONLINE") {
      return { method, cashAmount: 0, onlineAmount: total, totalAmount: total };
    }
    if (method === "MIXED") {
      const cashAmount = Number(state.paymentDialog?.mixedCash || 0);
      const boundedCash = Math.min(Math.max(cashAmount, 0), total);
      const onlineAmount = Math.max(total - boundedCash, 0);
      return { method, cashAmount: boundedCash, onlineAmount, totalAmount: total };
    }
    return { method, cashAmount: total, onlineAmount: 0, totalAmount: total };
  }

  function mySalesPendingTotal() {
    return (state.mySales || []).reduce((sum, row) => sum + Number(row.pendingAmount || 0), 0);
  }

  function mySalesOrderCount() {
    return (state.mySales || []).length;
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
    const item = getItemByCode(erpCode);
    if (!item) return;
    openImageViewer(item.imageUrl, item.name);
  }

  function closeImageViewer() {
    state.imageViewer = null;
    renderModalLayer();
  }

  function closePaymentDialog() {
    state.paymentDialog = {
      open: false,
      method: "CASH",
      mixedCash: "",
      error: ""
    };
    renderModalLayer();
  }

  function openPaymentDialog() {
    if (!state.cart.length) {
      showToast("Add at least one item");
      return;
    }
    if (!state.currentUser) {
      showToast("Please log in first");
      return;
    }
    state.paymentDialog = {
      open: true,
      method: "CASH",
      mixedCash: "",
      error: ""
    };
    renderModalLayer();
  }

  function setPaymentMethod(method) {
    state.paymentDialog.method = String(method || "CASH").toUpperCase();
    state.paymentDialog.error = "";
    if (state.paymentDialog.method !== "MIXED") {
      state.paymentDialog.mixedCash = "";
    }
    renderModalLayer();
  }

  function setMixedCash(value) {
    state.paymentDialog.mixedCash = String(value ?? "");
    state.paymentDialog.error = "";
    renderModalLayer();
  }

  function validatePaymentSelection() {
    const totalAmount = Number(cartTotalValue() || 0);
    const { method, cashAmount, onlineAmount } = paymentBreakup();
    if (totalAmount <= 0) return "Cart total must be greater than zero";
    if (method === "MIXED") {
      const rawCash = String(state.paymentDialog?.mixedCash || "").trim();
      if (!rawCash.length) return "Enter the cash amount received";
      if (!Number.isFinite(cashAmount)) return "Enter a valid cash amount";
      if (cashAmount < 0) return "Cash amount cannot be negative";
      if (cashAmount > totalAmount) return "Cash amount cannot exceed the total amount";
      if (cashAmount === 0 && onlineAmount === 0) return "Enter a valid payment split";
    }
    return "";
  }

  function renderImageViewer() {
    if (!state.imageViewer || !state.imageViewer.imageUrl) {
      modalRoot.innerHTML = "";
      return;
    }
    modalRoot.innerHTML = `
      <div class="modal-backdrop image-viewer-backdrop" onclick="window.kkdSalesApp.closeImageViewer()"></div>
      <section class="image-viewer-modal" role="dialog" aria-modal="true" aria-label="${escapeAttr(state.imageViewer.itemName)}">
        <button class="image-viewer-close" type="button" onclick="window.kkdSalesApp.closeImageViewer()" aria-label="Close image">Close</button>
        <div class="image-viewer-frame">
          <img src="${escapeAttr(state.imageViewer.imageUrl)}" alt="${escapeAttr(state.imageViewer.itemName)}">
        </div>
      </section>
    `;
  }

  function renderPaymentDialog() {
    if (!state.paymentDialog?.open) return false;
    const method = currentPaymentMethod();
    const breakup = paymentBreakup();
    modalRoot.innerHTML = `
      <div class="modal-backdrop image-viewer-backdrop" onclick="window.kkdSalesApp.closePaymentDialog()"></div>
      <section class="payment-modal" role="dialog" aria-modal="true" aria-label="Select payment method">
        <div class="public-card payment-card">
          <div class="public-card-header">
            <h2>Payment Method</h2>
            <div class="public-tag">${money(breakup.totalAmount)}</div>
          </div>
          <div class="payment-method-grid">
            ${["CASH", "ONLINE", "MIXED"].map((option) => `
              <button class="payment-method-button${method === option ? " active" : ""}" type="button" onclick="window.kkdSalesApp.setPaymentMethod('${option}')">${paymentMethodLabel(option)}</button>
            `).join("")}
          </div>
          ${method === "CASH" ? `
            <div class="payment-summary-card">
              <div><strong>Cash Received:</strong> ${money(breakup.cashAmount)}</div>
              <div><strong>Online Received:</strong> ${money(breakup.onlineAmount)}</div>
            </div>
          ` : `
            <div class="payment-qr-card">
              <img class="payment-qr-image" src="${escapeAttr(QR_IMAGE_URL)}" alt="Scan to pay QR code">
            </div>
          `}
          ${method === "MIXED" ? `
            <div class="grid-two payment-split-grid">
              <label class="field">
                <span>Cash Received</span>
                <input type="number" min="0" max="${escapeAttr(String(breakup.totalAmount))}" step="0.01" value="${escapeAttr(state.paymentDialog?.mixedCash || "")}" placeholder="Enter cash amount" oninput="window.kkdSalesApp.setMixedCash(this.value)">
              </label>
              <label class="field">
                <span>Online Received</span>
                <input type="text" value="${escapeAttr(money(breakup.onlineAmount))}" readonly>
              </label>
            </div>
          ` : ""}
          ${method === "ONLINE" ? `
            <div class="payment-summary-card">
              <div><strong>Cash Received:</strong> ${money(0)}</div>
              <div><strong>Online Received:</strong> ${money(breakup.totalAmount)}</div>
            </div>
          ` : ""}
          ${state.paymentDialog?.error ? `<div class="payment-error">${escapeHtml(state.paymentDialog.error)}</div>` : ""}
          <div class="public-actions checkout-actions">
            <button class="button secondary" type="button" onclick="window.kkdSalesApp.closePaymentDialog()">Back to Cart</button>
            <button class="button" type="button" onclick="window.kkdSalesApp.confirmPaymentAndSubmit()">${method === "CASH" ? "Confirm Cash and Post Sale" : "Done and Post Sale"}</button>
          </div>
        </div>
      </section>
    `;
    return true;
  }

  function renderModalLayer() {
    if (renderPaymentDialog()) return;
    renderImageViewer();
  }

  async function ensureAuthenticated() {
    const token = getStoredSessionToken();
    if (!token) return false;
    try {
      const user = await window.erpApi.request("auth.me", { sessionToken: token });
      if (!user) return false;
      resetWarehouseSessionState();
      state.currentUser = user;
      return true;
    } catch (error) {
      return false;
    }
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const username = String(data.get("username") || "").trim();
    const password = String(data.get("password") || "");
    if (!username || !password) {
      showToast("Enter username and password");
      return;
    }
    setLoading(true, "Signing in...");
    try {
      const result = await window.erpApi.request("auth.login", { username, password });
      setStoredSessionToken(result.sessionToken);
      resetWarehouseSessionState();
      state.currentUser = result.user || null;
      await Promise.all([ensureCatalogLoaded("BOOK"), ensureCatalogLoaded("PARAPHERNALIA"), loadMySales()]);
      showToast(`Welcome, ${state.currentUser?.name || username}`);
      render();
    } catch (error) {
      showToast(error.message || "Could not log in");
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    const token = getStoredSessionToken();
    if (token) {
      try {
        await window.erpApi.request("auth.logout", { sessionToken: token });
      } catch (error) {
        // ignore
      }
    }
    setStoredSessionToken("");
    resetWarehouseSessionState();
    state.currentUser = null;
    state.view = "login";
    render();
  }

  async function ensureCatalogLoaded(group) {
    if (getCatalog(group).length) return;
    state.loadingCatalog = true;
    render();
    try {
      const assignedWarehouseId = String(state.currentUser?.assignedWarehouseId || "").trim();
      const assignedWarehouseName = String(state.currentUser?.assignedWarehouseName || "").trim();
      state.warehouseId = assignedWarehouseId;
      state.warehouseName = assignedWarehouseName || assignedWarehouseId || "Warehouse";
      const ref = state.warehouseId || state.warehouseName;
      if (!ref) {
        throw new Error("No warehouse is assigned to this login. Please assign a warehouse in ERP settings.");
      }
      const catalog = await window.erpApi.request("catalog.items", {
        sourceWarehouseId: ref,
        warehouseId: ref,
        warehouseCode: ref,
        warehouseName: ref,
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

  async function loadMySales() {
    state.mySalesLoading = true;
    try {
      const result = await window.erpApi.request("sales.entriesList", {
        warehouseId: state.warehouseId || "",
        warehouseName: state.warehouseName || "",
        onlyMine: true
      });
      const rows = Array.isArray(result) ? result : Array.isArray(result?.rows) ? result.rows : [];
      state.mySales = rows;
      state.mySalesLoaded = true;
      return state.mySales;
    } finally {
      state.mySalesLoading = false;
    }
  }

  async function loadSaleDetail(documentId) {
    if (!documentId) return null;
    return window.erpApi.request("sales.entryDetail", { documentId });
  }

  function buildEscPosReceiptBytes(detail) {
    const lines = Array.isArray(detail?.lines) ? detail.lines : [];
    const createdAt = detail?.createdAt || detail?.documentDate || new Date().toISOString();
    const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const totalAmount = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const rowText = lines.map((line) => {
      const qty = Number(line.quantity || 0);
      const rate = moneyNumber(line.rate || 0);
      const amount = moneyNumber(line.amount || 0);
      return `${String(line.itemName || "-").slice(0, 24)}\n${qty} x ${rate} = ${amount}\n`;
    }).join("");
    return concatUint8Arrays([
      new Uint8Array([0x1b, 0x40]),
      new Uint8Array([0x1b, 0x61, 0x01]),
      new Uint8Array([0x1b, 0x45, 0x01]),
      encodeEscPosText("HARE KRISHNA MOVEMENT\n"),
      encodeEscPosText("VISAKHAPATNAM\n"),
      new Uint8Array([0x1b, 0x45, 0x00]),
      encodeEscPosText("Kakinada Warehouse Sale Bill\n"),
      new Uint8Array([0x1b, 0x61, 0x00]),
      encodeEscPosText("--------------------------------\n"),
      encodeEscPosText(`Bill No: ${detail?.documentId || "-"}\n`),
      encodeEscPosText(`Date: ${formatDateTime(createdAt)}\n`),
      encodeEscPosText(`Warehouse: ${detail?.warehouseName || state.warehouseName || "Warehouse"}\n`),
      encodeEscPosText(`User: ${detail?.createdByName || detail?.createdByUsername || "-"}\n`),
      detail?.notes ? encodeEscPosText(`Notes: ${detail.notes}\n`) : new Uint8Array(),
      encodeEscPosText("--------------------------------\n"),
      encodeEscPosText(rowText),
      encodeEscPosText("--------------------------------\n"),
      new Uint8Array([0x1b, 0x45, 0x01]),
      encodeEscPosText(`Total Qty: ${totalQty}\n`),
      encodeEscPosText(`Total Amount: Rs. ${moneyNumber(totalAmount)}\n`),
      new Uint8Array([0x1b, 0x45, 0x00]),
      new Uint8Array([0x1b, 0x61, 0x01]),
      encodeEscPosText("Thank you\n\n\n")
    ]);
  }

  function buildTestPrintBytes() {
    return concatUint8Arrays([
      new Uint8Array([0x1b, 0x40]),
      new Uint8Array([0x1b, 0x61, 0x01]),
      new Uint8Array([0x1b, 0x45, 0x01]),
      encodeEscPosText("HKM TEST PRINT\n"),
      new Uint8Array([0x1b, 0x45, 0x00]),
      encodeEscPosText("Kakinada Warehouse\n"),
      encodeEscPosText(`${formatDateTime(new Date().toISOString())}\n`),
      encodeEscPosText("If this prints, USB access works.\n\n\n")
    ]);
  }

  function updatePrinterState(nextState) {
    Object.assign(state, nextState);
    render();
  }

  function syncNativePrinterStatus() {
    if (!hasAndroidPrinterBridge()) return;
    try {
      const response = parseNativeResponse(window.AndroidPosPrinter.getStatus());
      if (response && response.ok) {
        updatePrinterState({
          printerTransport: String(response.transport || ""),
          printerReady: Boolean(response.ready),
          printerLabel: String(response.label || (response.ready ? "Printer connected" : "Not connected")),
          printerPort: null,
          printerDevice: null,
          printerUsbInterfaceNumber: null,
          printerUsbEndpointOut: null
        });
      }
    } catch (error) {
      // ignore native status issues
    }
  }

  async function connectUsbPrinterDirect() {
    if (!navigator.usb) {
      throw new Error("WebUSB is not available in this browser");
    }
    const device = await navigator.usb.requestDevice({ filters: [] });
    await device.open();
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }
    let interfaceNumber = null;
    let endpointOut = null;
    const interfaces = device.configuration ? device.configuration.interfaces || [] : [];
    for (const iface of interfaces) {
      const alternates = iface.alternates || [];
      for (const alternate of alternates) {
        const outEndpoint = (alternate.endpoints || []).find((endpoint) => endpoint.direction === "out");
        if (outEndpoint) {
          interfaceNumber = iface.interfaceNumber;
          endpointOut = outEndpoint.endpointNumber;
          break;
        }
      }
      if (endpointOut !== null) break;
    }
    if (interfaceNumber === null || endpointOut === null) {
      throw new Error("No writable USB endpoint found for this printer");
    }
    await device.claimInterface(interfaceNumber);
    updatePrinterState({
      printerTransport: "usb",
      printerReady: true,
      printerLabel: `USB printer connected${device.productName ? `: ${device.productName}` : ""}`,
      printerDevice: device,
      printerPort: null,
      printerUsbInterfaceNumber: interfaceNumber,
      printerUsbEndpointOut: endpointOut
    });
    return true;
  }

  async function connectUsbPrinterSerial() {
    if (!navigator.serial) {
      throw new Error("Web Serial is not available in this browser");
    }
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: Number(state.printerBaudRate || 9600) });
    updatePrinterState({
      printerTransport: "serial",
      printerReady: true,
      printerLabel: `Serial printer connected (${state.printerBaudRate} baud)`,
      printerPort: port,
      printerDevice: null,
      printerUsbInterfaceNumber: null,
      printerUsbEndpointOut: null
    });
    return true;
  }

  async function connectPrinter() {
    if (hasAndroidPrinterBridge()) {
      setLoading(true, "Connecting USB printer...");
      try {
        const response = parseNativeResponse(window.AndroidPosPrinter.connectUsbPrinter());
        if (!response.ok) {
          throw new Error(response.message || "Could not connect USB printer");
        }
        updatePrinterState({
          printerTransport: String(response.transport || "usb"),
          printerReady: true,
          printerLabel: String(response.label || "USB printer connected")
        });
        showToast(response.message || "USB printer connected");
      } catch (error) {
        showToast(error.message || "Could not connect USB printer");
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true, "Connecting printer...");
    try {
      try {
        await connectUsbPrinterDirect();
        showToast("USB printer connected");
        return;
      } catch (usbError) {
        if (navigator.serial) {
          await connectUsbPrinterSerial();
          showToast("Serial printer connected");
          return;
        }
        throw usbError;
      }
    } catch (error) {
      updatePrinterState({
        printerTransport: "",
        printerReady: false,
        printerLabel: "Connection failed",
        printerPort: null,
        printerDevice: null,
        printerUsbInterfaceNumber: null,
        printerUsbEndpointOut: null
      });
      showToast(error.message || "Could not connect printer");
    } finally {
      setLoading(false);
    }
  }

  async function connectBluetoothPrinter() {
    if (!hasAndroidPrinterBridge()) {
      showToast("Bluetooth printer connection is available in the Android wrapper app");
      return;
    }
    setLoading(true, "Connecting Bluetooth printer...");
    try {
      const response = parseNativeResponse(window.AndroidPosPrinter.connectBluetoothPrinter(""));
      if (!response.ok) {
        throw new Error(response.message || "Could not connect Bluetooth printer");
      }
      updatePrinterState({
        printerTransport: String(response.transport || "bluetooth"),
        printerReady: true,
        printerLabel: String(response.label || "Bluetooth printer connected")
      });
      showToast(response.message || "Bluetooth printer connected");
    } catch (error) {
      showToast(error.message || "Could not connect Bluetooth printer");
    } finally {
      setLoading(false);
    }
  }

  async function sendBytesToPrinter(bytes) {
    if (!state.printerReady) {
      throw new Error("Printer is not connected");
    }
    if (state.printerTransport === "serial" && state.printerPort?.writable) {
      const writer = state.printerPort.writable.getWriter();
      try {
        await writer.write(bytes);
      } finally {
        writer.releaseLock();
      }
      return;
    }
    if (state.printerTransport === "usb" && state.printerDevice && state.printerUsbEndpointOut !== null) {
      const result = await state.printerDevice.transferOut(state.printerUsbEndpointOut, bytes);
      if (result.status !== "ok") {
        throw new Error(`USB print failed: ${result.status}`);
      }
      return;
    }
    throw new Error("Printer connection is not writable");
  }

  async function testPrint() {
    if (!state.printerReady) {
      showToast("Connect the printer first");
      return;
    }
    if (hasAndroidPrinterBridge()) {
      setLoading(true, "Sending test print...");
      try {
        const response = parseNativeResponse(window.AndroidPosPrinter.testPrint());
        if (!response.ok) {
          throw new Error(response.message || "Test print failed");
        }
        showToast(response.message || "Test print sent");
      } catch (error) {
        showToast(error.message || "Test print failed");
      } finally {
        setLoading(false);
      }
      return;
    }
    setLoading(true, "Sending test print...");
    try {
      await sendBytesToPrinter(buildTestPrintBytes());
      showToast("Test print sent");
    } catch (error) {
      showToast(error.message || "Test print failed");
    } finally {
      setLoading(false);
    }
  }

  async function printReceiptToPrinter(documentId) {
    const targetId = String(documentId || state.submittedSaleId || "").trim();
    if (!targetId) {
      showToast("No sale entry available to print");
      return;
    }
    if (!canUseAndroidNativePrint() && !state.printerReady) {
      showToast("Connect the printer first");
      return;
    }
    setLoading(true, canUseAndroidNativePrint() ? "Opening print dialog..." : "Sending bill to printer...");
    try {
      const detail = state.lastSubmittedSale && String(state.lastSubmittedSale.documentId || "") === targetId
        ? state.lastSubmittedSale
        : await loadSaleDetail(targetId);
      if (!detail) {
        throw new Error("Sale entry not found");
      }
      if (canUseAndroidNativePrint()) {
        const response = parseNativeResponse(
          window.AndroidPosPrinter.printHtml(
            detail?.documentId || "Sale Receipt",
            buildReceiptHtml(detail, true)
          )
        );
        if (!response.ok) {
          throw new Error(response.message || "Could not open print dialog");
        }
        showToast(response.message || "Print dialog opened");
        return;
      }
      if (hasAndroidPrinterBridge()) {
        const response = parseNativeResponse(window.AndroidPosPrinter.printBase64(uint8ToBase64(buildEscPosReceiptBytes(detail))));
        if (!response.ok) {
          throw new Error(response.message || "Could not print bill");
        }
        showToast(response.message || "Bill sent to printer");
        return;
      }
      await sendBytesToPrinter(buildEscPosReceiptBytes(detail));
      showToast("Bill sent to printer");
    } catch (error) {
      showToast(error.message || "Could not print bill");
    } finally {
      setLoading(false);
    }
  }

  function setView(view) {
    state.view = view;
    if (view === "history" && state.currentUser) {
      loadMySales().then(render).catch((error) => showToast(error.message || "Could not load sale entries"));
    }
    render();
  }

  function setCategory(group) {
    state.itemGroup = group === "PARAPHERNALIA" ? "PARAPHERNALIA" : "BOOK";
    if (state.itemGroup === "BOOK") state.devotionalCategory = "ALL";
    else state.devotionalCategory = normalizeCategorySelection(getDevotionalCategories(), state.devotionalCategory);
    state.search = "";
    ensureCatalogLoaded(state.itemGroup).then(render).catch((error) => showToast(error.message || "Could not load catalog"));
    render();
  }

  function rerenderSearchPreservingFocus() {
    const currentValue = String(state.search || "");
    render();
    const next = document.querySelector('.catalog-search input[type="search"]');
    if (next) {
      next.value = currentValue;
      next.focus();
      if (typeof next.setSelectionRange === "function") {
        next.setSelectionRange(currentValue.length, currentValue.length);
      }
    }
  }

  function setField(field, value) {
    state[field] = value;
    if (field === "search") {
      rerenderSearchPreservingFocus();
      return;
    }
    render();
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

  async function submitSale() {
    openPaymentDialog();
  }

  async function confirmPaymentAndSubmit() {
    const paymentError = validatePaymentSelection();
    if (paymentError) {
      state.paymentDialog.error = paymentError;
      renderModalLayer();
      return;
    }
    const breakup = paymentBreakup();
    state.requestSubmitting = true;
    setLoading(true, "Posting sale entry...");
    try {
      const result = await window.erpApi.request("sales.submit", {
        warehouseId: state.warehouseId || state.warehouseName || "",
        warehouseName: state.warehouseName || state.warehouseId || "",
        documentDate: new Date().toISOString().slice(0, 10),
        notes: String(state.notes || "").trim(),
        paymentMethod: breakup.method,
        paymentMethodLabel: paymentMethodLabel(breakup.method),
        paymentDate: new Date().toISOString().slice(0, 10),
        paymentNotes: `Payment captured at sale entry (${paymentMethodLabel(breakup.method)})`,
        cashAmount: Number(breakup.cashAmount || 0),
        onlineAmount: Number(breakup.onlineAmount || 0),
        lines: state.cart.map((line) => ({
          erpCode: line.erpCode,
          quantity: Number(line.quantity || 0),
          salePrice: Number(line.salePrice || 0),
          rate: Number(line.salePrice || 0)
        }))
      });
      state.submittedSaleId = result?.documentId || "";
      state.lastSubmittedSale = result || null;
      state.cart = [];
      state.notes = "";
      closePaymentDialog();
      state.view = "submitted";
      state.catalogByGroup = { BOOK: [], PARAPHERNALIA: [] };
      await Promise.all([ensureCatalogLoaded("BOOK"), ensureCatalogLoaded("PARAPHERNALIA"), loadMySales()]);
      showToast("Sale entry created");
      render();
    } catch (error) {
      showToast(error.message || "Could not create sale entry");
    } finally {
      state.requestSubmitting = false;
      setLoading(false);
    }
  }

  function buildReceiptHtml(detail, printOnly) {
    const lines = Array.isArray(detail?.lines) ? detail.lines : [];
    const createdAt = detail?.createdAt || detail?.documentDate || new Date().toISOString();
    const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
    const totalAmount = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
    const paidCashAmount = Number(detail?.paidCashAmount || 0);
    const paidOnlineAmount = Number(detail?.paidOnlineAmount || 0);
    const paymentType = paidCashAmount > 0 && paidOnlineAmount > 0 ? "Mixed" : paidOnlineAmount > 0 ? "Online" : "Cash";
    const isPrintOnly = Boolean(printOnly);
    return `
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(detail?.documentId || "Sale Receipt")}</title>
  <style>
    body {
      margin: 0;
      padding: 16px;
      font-family: Arial, sans-serif;
      color: #111;
      background: #f6efe4;
      font-size: 14px;
      line-height: 1.35;
    }
    .receipt {
      width: min(100%, 420px);
      margin: 0 auto;
      background: #fff;
      border: 1px solid #d8c2a7;
      border-radius: 12px;
      padding: 16px 14px;
      box-sizing: border-box;
      box-shadow: 0 8px 24px rgba(80, 44, 18, 0.12);
    }
    .center { text-align: center; }
    .strong { font-weight: 700; }
    .divider {
      border-top: 1px dashed #000;
      margin: 8px 0;
    }
    .meta-row,
    .total-row {
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 6px;
      table-layout: fixed;
      font-size: 12px;
    }
    th, td {
      vertical-align: top;
      padding: 4px 3px;
    }
    th {
      text-align: left;
      border-bottom: 1px solid #000;
      font-size: 11px;
    }
    td.num, th.num {
      text-align: right;
      white-space: nowrap;
    }
    th + th,
    td + td {
      border-left: 1px solid #d2c3ae;
    }
    th.num,
    td.num {
      padding-left: 6px;
    }
    .item-name {
      word-break: break-word;
      padding-right: 6px;
    }
    .actions {
      width: min(100%, 420px);
      margin: 0 auto 12px;
      display: flex;
      gap: 8px;
      justify-content: center;
      flex-wrap: wrap;
    }
    button {
      padding: 10px 12px;
      border: 1px solid #000;
      background: #fff;
      font-size: 14px;
      cursor: pointer;
      border-radius: 8px;
    }
    @media print {
      body {
        padding: 0;
        background: #fff;
        font-size: 12px;
      }
      .actions { display: none; }
      .receipt {
        width: 58mm;
        max-width: 58mm;
        margin: 0;
        padding: 0;
        border: 0;
        border-radius: 0;
        box-shadow: none;
      }
      table {
        font-size: 11px;
      }
      th, td {
        padding: 4px 2px;
      }
      th.num,
      td.num {
        padding-left: 4px;
      }
      @page { margin: 4mm; size: 58mm auto; }
    }
  </style>
</head>
<body>
  ${isPrintOnly ? "" : `
  <div class="actions">
    <button onclick="window.print()">Print Bill</button>
    <button onclick="window.close()">Close</button>
  </div>`}
  <div class="receipt">
    <div class="center strong">HARE KRISHNA MOVEMENT</div>
    <div class="center strong">VISAKHAPATNAM</div>
    <div class="center">Kakinada Warehouse Sale Bill</div>
    <div class="divider"></div>
    <div class="meta-row"><span>Bill No</span><span>${escapeHtml(detail?.documentId || "-")}</span></div>
    <div class="meta-row"><span>Date</span><span>${escapeHtml(formatDateTime(createdAt))}</span></div>
    <div class="meta-row"><span>Warehouse</span><span>${escapeHtml(detail?.warehouseName || state.warehouseName || "Warehouse")}</span></div>
    <div class="meta-row"><span>User</span><span>${escapeHtml(detail?.createdByName || detail?.createdByUsername || "-")}</span></div>
    <div class="meta-row"><span>Payment</span><span>${escapeHtml(paymentType)}</span></div>
    <div class="meta-row"><span>Cash</span><span>${escapeHtml(money(paidCashAmount))}</span></div>
    <div class="meta-row"><span>Online</span><span>${escapeHtml(money(paidOnlineAmount))}</span></div>
    ${detail?.notes ? `<div class="meta-row"><span>Notes</span><span style="text-align:right;">${escapeHtml(detail.notes)}</span></div>` : ""}
    <div class="divider"></div>
    <table>
      <colgroup>
        <col style="width:52%">
        <col style="width:12%">
        <col style="width:18%">
        <col style="width:18%">
      </colgroup>
      <thead>
        <tr>
          <th>Item</th>
          <th class="num">Qty</th>
          <th class="num">Rate</th>
          <th class="num">Amt</th>
        </tr>
      </thead>
      <tbody>
        ${lines.map((line) => `
          <tr>
            <td class="item-name">${escapeHtml(line.itemName || "-")}</td>
            <td class="num">${Number(line.quantity || 0)}</td>
            <td class="num">${moneyNumber(line.rate || 0)}</td>
            <td class="num">${moneyNumber(line.amount || 0)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <div class="divider"></div>
    <div class="total-row strong"><span>Total Qty</span><span>${totalQty}</span></div>
    <div class="total-row strong"><span>Total Amount</span><span>Rs. ${moneyNumber(totalAmount)}</span></div>
    <div class="divider"></div>
    <div class="center">Thank you</div>
  </div>
</body>
</html>
    `;
  }

  async function openReceipt(documentId) {
    const targetId = String(documentId || state.submittedSaleId || "").trim();
    if (!targetId) {
      showToast("No sale entry available for bill");
      return;
    }
    setLoading(true, "Preparing bill...");
    try {
      const detail = state.lastSubmittedSale && String(state.lastSubmittedSale.documentId || "") === targetId
        ? state.lastSubmittedSale
        : await loadSaleDetail(targetId);
      if (!detail) {
        throw new Error("Sale entry not found");
      }
      if (canUseAndroidNativePrint()) {
        const response = parseNativeResponse(
          window.AndroidPosPrinter.printHtml(
            detail?.documentId || "Sale Receipt",
            buildReceiptHtml(detail, true)
          )
        );
        if (!response.ok) {
          throw new Error(response.message || "Could not open print dialog");
        }
        showToast(response.message || "Print dialog opened");
        return;
      }
      const receiptWindow = window.open("", "_blank");
      if (!receiptWindow) {
        throw new Error("Popup blocked. Please allow popups for printing.");
      }
      receiptWindow.document.open();
      receiptWindow.document.write(buildReceiptHtml(detail));
      receiptWindow.document.close();
      receiptWindow.focus();
    } catch (error) {
      showToast(error.message || "Could not prepare bill");
    } finally {
      setLoading(false);
    }
  }

  function toggleHistoryDetails(documentId) {
    state.mySalesExpanded = state.mySalesExpanded === documentId ? "" : documentId;
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
    if (!state.currentUser) return "";
    return `
      <div class="floating-request-actions">
        ${state.installReady ? `<button class="segment" type="button" onclick="window.kkdSalesApp.installPwa()">Install App</button>` : ""}
        <button class="segment" type="button" onclick="window.kkdSalesApp.setView('history')">My Sale Entries</button>
        <button class="segment active" type="button" onclick="window.kkdSalesApp.setView('cart')">Go to Cart (${cartTotalQty()})</button>
        <button class="segment" type="button" onclick="window.kkdSalesApp.logout()">Logout</button>
      </div>
    `;
  }

  function renderPrinterCard() {
    if (!state.currentUser) return "";
    return "";
  }

  function renderHeader() {
    return `
      <header class="public-hero">
        <div class="public-brand">
          <div class="public-mark">HKM</div>
          <div>
            <div class="public-title">${escapeHtml(APP_TITLE)}</div>
            <div class="public-subtitle">${escapeHtml(APP_SUBTITLE)}</div>
          </div>
        </div>
      </header>
      <section class="public-card category-switch-card">
        <div class="public-card-header compact-header">
          <h2>Select Category</h2>
          <div class="public-tag">${escapeHtml(state.currentUser ? `${state.warehouseName} · ${state.currentUser.name || state.currentUser.username || "User"}` : state.warehouseName)}</div>
        </div>
        <div class="segmented category-segmented">
          <button class="segment ${state.itemGroup === "BOOK" ? "active" : ""}" type="button" onclick="window.kkdSalesApp.setCategory('BOOK')">Books</button>
          <button class="segment ${state.itemGroup === "PARAPHERNALIA" ? "active" : ""}" type="button" onclick="window.kkdSalesApp.setCategory('PARAPHERNALIA')">Devotional Items</button>
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
            <button class="catalog-image-button" type="button" onclick="window.kkdSalesApp.openImageViewerByCode('${escapeAttr(item.erpCode)}')" aria-label="View ${escapeAttr(item.name)} image">
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
            <button class="button small-button" type="button" ${qty > 0 ? `onclick="window.kkdSalesApp.addWithQty('${escapeAttr(item.erpCode)}')"` : "disabled"}>Add</button>
          </div>
        </div>
      </article>
    `;
  }

  function renderCatalog() {
    const items = getFilteredItems();
    const devotionalCategories = getDevotionalCategories();
    return `
      <section class="public-card request-main">
        <div class="public-card-header compact-header">
          <h2>${state.itemGroup === "PARAPHERNALIA" ? "Devotional Items" : "Books"}</h2>
          <div class="public-tag">${escapeHtml(state.warehouseName)}</div>
        </div>
        <div class="catalog-toolbar">
          <label class="field compact-field catalog-search">
            <span>${state.itemGroup === "PARAPHERNALIA" ? "Search devotional item" : "Search books"}</span>
            <input type="search" value="${escapeAttr(state.search)}" placeholder="${state.itemGroup === "PARAPHERNALIA" ? "Search item name" : "Search book name"}" oninput="window.kkdSalesApp.setField('search', this.value)">
          </label>
          ${state.itemGroup === "PARAPHERNALIA" ? `
            <label class="field compact-field">
              <span>Devotional Category</span>
              <select onchange="window.kkdSalesApp.setField('devotionalCategory', this.value)">
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
          <input type="number" min="0" step="1" value="${escapeAttr(line.quantity)}" onchange="window.kkdSalesApp.updateCartQty('${escapeAttr(line.erpCode)}', this.value)">
          <button class="small-button danger" type="button" onclick="window.kkdSalesApp.removeCartLine('${escapeAttr(line.erpCode)}')">Remove</button>
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
        <label class="field">
          <span>Notes</span>
          <input type="text" value="${escapeAttr(state.notes)}" placeholder="Optional note for this sale entry" oninput="window.kkdSalesApp.setField('notes', this.value)">
        </label>
        <div class="public-actions checkout-actions">
          <button class="button secondary" type="button" onclick="window.kkdSalesApp.setView('catalog')">Continue picking books / items</button>
          <button class="button" type="button" onclick="window.kkdSalesApp.submitSale()" ${state.cart.length && !state.requestSubmitting ? "" : "disabled"}>${state.requestSubmitting ? "Posting..." : "Choose Payment & Post Sale"}</button>
        </div>
      </section>
    `;
  }

  function renderHistoryView() {
    return `
      <section class="public-card request-main">
        <div class="public-card-header">
          <h2>My Sale Entries</h2>
          <div class="public-tag">${escapeHtml(state.warehouseName)}</div>
        </div>
        <div class="grid metrics reports-metrics activity-report-metrics">
          <article class="card metric-card">
            <div class="metric-label">My Sale Orders</div>
            <div class="metric-value">${mySalesOrderCount()}</div>
            <div class="metric-note">Total sale entries posted by you</div>
          </article>
          <article class="card metric-card">
            <div class="metric-label">Pending Settlement</div>
            <div class="metric-value">${money(mySalesPendingTotal())}</div>
            <div class="metric-note">Amount still to settle to backend</div>
          </article>
        </div>
        ${state.mySalesLoading ? `<div class="empty-note">Loading sale entries...</div>` : ""}
        ${!state.mySalesLoading && !state.mySales.length ? `<div class="empty-note">You have not posted any sale entries yet.</div>` : ""}
        ${!state.mySalesLoading && state.mySales.length ? `
          <div class="history-table-wrap">
            <table class="history-table">
              <thead>
                <tr>
                  <th>Sale Date</th>
                  <th>Sale ID</th>
                  <th>Status</th>
                  <th>Worth</th>
                  <th>Cash</th>
                  <th>Online</th>
                  <th>Pending</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                ${state.mySales.map((row) => `
                  <tr>
                    <td>${escapeHtml(formatDateTime(row.createdAt || row.documentDate))}</td>
                    <td>${escapeHtml(row.documentId || "-")}</td>
                    <td>${escapeHtml(Number(row.pendingAmount || 0) > 0 ? "Settlement Pending" : "Settled")}</td>
                    <td>${escapeHtml(money(row.totalAmount || 0))}</td>
                    <td>${escapeHtml(money(row.paidCashAmount || 0))}</td>
                    <td>${escapeHtml(money(row.paidOnlineAmount || 0))}</td>
                    <td>${escapeHtml(money(row.pendingAmount || 0))}</td>
                    <td>
                      <div class="row-actions">
                        <button class="small-button" type="button" onclick="window.kkdSalesApp.toggleHistoryDetails('${escapeAttr(row.documentId)}')">${state.mySalesExpanded === row.documentId ? "Hide" : "Show"} Details</button>
                      </div>
                    </td>
                  </tr>
                  ${state.mySalesExpanded === row.documentId ? `
                    <tr class="history-detail-row">
                      <td colspan="8">
                        <div class="history-detail-card">
                          <div class="detail-meta">
                            <div><strong>Warehouse:</strong> ${escapeHtml(row.warehouseName || "-")}</div>
                            <div><strong>Notes:</strong> ${escapeHtml(row.notes || "-")}</div>
                            <div><strong>Cash Received:</strong> ${escapeHtml(money(row.paidCashAmount || 0))}</div>
                            <div><strong>Online Received:</strong> ${escapeHtml(money(row.paidOnlineAmount || 0))}</div>
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
                                    <td>${escapeHtml(String(line.quantity || 0))}</td>
                                    <td>${escapeHtml(money(line.rate || 0))}</td>
                                    <td>${escapeHtml(money(line.amount || 0))}</td>
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
        ` : ""}
      </section>
    `;
  }

  function renderSubmittedView() {
    return `
      <section class="public-card success-card">
        <div class="success-badge">HKM</div>
        <h1>Sale Entry Posted</h1>
        <p>Your cart has been posted as a sale entry for the ${escapeHtml(state.warehouseName)} warehouse.</p>
        <div class="success-meta">${state.submittedSaleId ? `Sale Entry ${escapeHtml(state.submittedSaleId)} was created successfully.` : "Sale entry created successfully."}</div>
        ${state.lastSubmittedSale ? `
          <div class="payment-summary-card submitted-payment-summary">
            <div><strong>Cash Received:</strong> ${money(state.lastSubmittedSale.paidCashAmount || 0)}</div>
            <div><strong>Online Received:</strong> ${money(state.lastSubmittedSale.paidOnlineAmount || 0)}</div>
          </div>
        ` : ""}
        <div class="public-actions centered-actions">
          <button class="button secondary" type="button" onclick="window.kkdSalesApp.setView('history')">My Sale Entries</button>
          <button class="button" type="button" onclick="window.kkdSalesApp.setView('catalog')">Post Another Sale</button>
        </div>
      </section>
    `;
  }

  function renderLoginView() {
    return `
      <section class="public-card success-card">
        <div class="success-badge">HKM</div>
        <h1>${escapeHtml(APP_TITLE)}</h1>
        <p>Sign in with the warehouse incharge account to post live sales from the warehouse assigned to your login.</p>
        <form class="public-form" onsubmit="window.kkdSalesApp.login(event)">
          <label class="field">
            <span>Username</span>
            <input name="username" type="text" required placeholder="Username" autocomplete="username">
          </label>
          <label class="field">
            <span>Password</span>
            <input name="password" type="password" required placeholder="Password" autocomplete="current-password">
          </label>
          <div class="public-actions centered-actions">
            <button class="button" type="submit">Login</button>
          </div>
        </form>
      </section>
    `;
  }

  function renderBody() {
    if (!state.currentUser) return renderLoginView();
    if (state.view === "cart") return renderCartView();
    if (state.view === "history") return renderHistoryView();
    if (state.view === "submitted") return renderSubmittedView();
    return renderCatalog();
  }

  function renderPage() {
    return `
      <div class="public-shell pwa-shell">
        ${renderFloatingActions()}
        ${state.currentUser ? renderHeader() : ""}
        ${renderPrinterCard()}
        ${renderBody()}
      </div>
    `;
  }

  function render() {
    root.innerHTML = renderPage();
    renderModalLayer();
    document.title = state.currentUser ? APP_TITLE : `${APP_TITLE} Login`;
  }

  function registerServiceWorker() {
    if (!("serviceWorker" in navigator)) return;
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sales-warehouse-sw.js?v=1").catch(() => {});
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

  window.kkdSalesApp = {
    login,
    logout,
    setView,
    setCategory,
    setField,
    addWithQty,
    updateCartQty,
    removeCartLine,
    submitSale,
    closePaymentDialog,
    setPaymentMethod,
    setMixedCash,
    confirmPaymentAndSubmit,
    openReceipt,
    connectPrinter,
    connectBluetoothPrinter,
    testPrint,
    printReceiptToPrinter,
    toggleHistoryDetails,
    openImageViewer,
    openImageViewerByCode,
    closeImageViewer,
    installPwa
  };

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.imageViewer) {
      closeImageViewer();
    }
  });

  async function init() {
    try {
      setLoading(true, "Loading page...");
      const loggedIn = await ensureAuthenticated();
      syncNativePrinterStatus();
      if (loggedIn) {
        await Promise.all([ensureCatalogLoaded("BOOK"), ensureCatalogLoaded("PARAPHERNALIA"), loadMySales()]);
      }
      render();
    } catch (error) {
      root.innerHTML = `
        <section class="public-card success-card">
          <h1>Could not load the sales page</h1>
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
