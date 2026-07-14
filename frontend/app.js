(function () {
  const appConfig = window.ERP_CONFIG || {};
  const state = {
    view: "dashboard",
    books: [],
    bookSearch: "",
    bookStatus: "active",
    devotionalItems: [],
    devotionalSearch: "",
    devotionalStatus: "active",
    warehouses: [],
    warehouseSearch: "",
    warehouseStatus: "active",
    devotees: [],
    activities: [],
    activitySearch: "",
    activityStatus: "open",
    reportView: "",
    activityReportDevoteeId: "",
    activityReportDevoteeSearch: "",
    activityReportActivityId: "",
    activityReportActivitySearch: "",
    showWarehouseDayWiseSales: false,
    issueDocumentType: "ISSUE",
    currentUser: null,
    sessionToken: "",
    purchaseDraft: {},
    purchaseLines: [],
    purchaseImportName: "",
    documents: [],
    issueDraft: {},
    issueLines: [],
    issueBookQueries: [],
    saleDraft: {},
    saleLines: [],
    saleBookQueries: [],
    receiveDraft: {},
    receiveLines: [],
    receiveBookQueries: [],
    transferDraft: {},
    transferLines: [],
    transferBookQueries: [],
    openingDraft: {},
    openingLines: [],
    openingBookQueries: [],
    unsettledDraft: {},
    unsettledLines: [],
    unsettledBookQueries: [],
    currentStock: [],
    currentStockLoaded: false,
    currentStockLoading: false,
    activityUnsettled: [],
    activityLedger: [],
    activityMonthlyReport: null,
    warehouseMonthlyReport: null,
    reportErrors: [],
    reportsInitialized: false,
    reportsLoading: false,
    reportsLoadToken: 0,
    unsettledReportActivityId: "",
    complimentaryReportActivityId: "",
    activityComplimentary: [],
    documentsMode: "entries",
    pendingSettlements: [],
    pendingSettlementActivityId: "",
    pendingSettlementDetails: null,
    sidebarCollapsed: false,
    reportWarehouseId: "",
    reportMonth: new Date().toISOString().slice(0, 7),
    documentEntryGroup: "BOOK"
  };

  const views = {
    dashboard: ["Home", "Daily view of distribution, stock, and active service.", renderDashboard],
    books: ["Books", "Book master with ERP codes, book type, sale price, and status.", renderBooks],
    devotional: ["Devotional Items", "Devotional items and paraphernalia master.", renderDevotionalItems],
    warehouses: ["Warehouses", "Main and event stock locations.", renderWarehouses],
    activities: ["Activities", "Daily stalls, marathons, events, and closing workflow.", renderActivities],
    documents: ["Stock Documents", "Issue, receive, sale, return, transfer, and adjustment entries.", renderDocuments],
    reports: ["Reports", "Current stock, activity summary, book-wise sales, and ledger.", renderReports],
    settings: ["Settings", "System configuration and backend connection.", renderSettings]
  };

  const content = document.getElementById("content");
  const title = document.getElementById("pageTitle");
  const subtitle = document.getElementById("pageSubtitle");
  const appShell = document.getElementById("appShell");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggleButton = document.getElementById("sidebarToggleButton");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const toastStack = document.getElementById("toastStack");
  const authRoot = document.getElementById("authRoot");
  const userChip = document.getElementById("userChip");
  const modalRoot = document.getElementById("modalRoot");

  try {
    state.sidebarCollapsed = window.localStorage.getItem("hkm-sidebar-collapsed") === "true";
  } catch (error) {
    state.sidebarCollapsed = false;
  }

  function isMobileViewport() {
    return window.matchMedia("(max-width: 980px)").matches;
  }

  function applySidebarState() {
    appShell.classList.toggle("sidebar-collapsed", state.sidebarCollapsed);
    try {
      window.localStorage.setItem("hkm-sidebar-collapsed", String(state.sidebarCollapsed));
    } catch (error) {
      // ignore storage issues
    }
  }

  sidebarToggleButton.addEventListener("click", () => {
    if (isMobileViewport()) {
      sidebar.classList.toggle("open");
      return;
    }
    state.sidebarCollapsed = !state.sidebarCollapsed;
    if (!state.sidebarCollapsed) {
      sidebar.classList.remove("open");
    }
    applySidebarState();
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      navigate(item.dataset.view);
      if (isMobileViewport()) {
        sidebar.classList.remove("open");
      }
    });
  });

  async function navigate(view) {
    state.view = view;
    document.querySelectorAll(".nav-item").forEach((item) => {
      item.classList.toggle("active", item.dataset.view === view);
    });

    const current = views[view];
    title.textContent = current[0];
    subtitle.textContent = current[1];
    setLoading(true);

    try {
      content.innerHTML = await current[2]();
    } catch (error) {
      content.innerHTML = '<div class="empty-state">Could not load this section.</div>';
      showToast(error.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  async function renderDashboard() {
    const data = await window.erpApi.request("dashboard.summary");
    return `
      <div class="grid metrics">
        ${metric("Today's Sales", money(data.todaySales), "Recorded through sales documents")}
        ${metric("Books Distributed", data.todayBooks, "Today's book quantity")}
        ${metric("Running Activities", data.runningActivities, "Open service locations")}
        ${metric("Total Stock", data.totalStock, "Across all warehouses")}
      </div>
      <div class="grid two-col">
        <section class="card">
          <div class="panel-header"><h2>Recent Activities</h2></div>
          <div class="panel-body">${activityList(data.recentActivities)}</div>
        </section>
        <section class="card">
          <div class="panel-header"><h2>Recent Documents</h2></div>
          <div class="panel-body">${documentList(data.recentDocuments)}</div>
        </section>
      </div>
    `;
  }

  async function renderBooks() {
    state.books = await window.erpApi.request(isMainAdmin() ? "books.adminList" : "books.list");
    return renderBooksMarkup();
  }

  async function renderDevotionalItems() {
    state.devotionalItems = await window.erpApi.request("items.list", { itemGroup: "PARAPHERNALIA" });
    return renderDevotionalItemsMarkup();
  }

  function rerenderContentKeepingFocus(inputId, renderFn) {
    const previous = document.getElementById(inputId);
    const selectionStart = previous && typeof previous.selectionStart === "number" ? previous.selectionStart : null;
    const selectionEnd = previous && typeof previous.selectionEnd === "number" ? previous.selectionEnd : null;
    const currentValue = previous ? previous.value : "";
    content.innerHTML = renderFn();
    const next = document.getElementById(inputId);
    if (next) {
      next.value = currentValue;
      next.focus();
      if (selectionStart !== null && selectionEnd !== null && next.setSelectionRange) {
        next.setSelectionRange(selectionStart, selectionEnd);
      }
    }
  }

  function renderBooksMarkup() {
    const rows = getFilteredBooks();
    return `
      <section class="card">
        <div class="panel-header">
          <h2>Book Master</h2>
          ${isMainAdmin() ? `
            <div class="row-actions">
              <button class="small-button" type="button" onclick="document.getElementById('bookImportInput').click()">Import Excel</button>
              <button class="small-button" type="button" onclick="window.erpApp.downloadBookSample()">Download Sample</button>
              <button class="button" type="button" onclick="window.erpApp.openBookForm()">Add Book</button>
            </div>
          ` : ""}
        </div>
        <div class="panel-body">
          ${isMainAdmin() ? '<input id="bookImportInput" type="file" accept=".csv,.xlsx,.xls" style="display:none" onchange="window.erpApp.importBookFile(this.files[0])">' : ""}
          <div class="toolbar">
            <label class="field compact-field">
              <span>Search</span>
              <input id="bookSearchInput" type="search" value="${escapeAttribute(state.bookSearch)}" placeholder="Search code, name, or type" oninput="window.erpApp.setBookSearch(this.value)">
            </label>
            <label class="field compact-field">
              <span>Status</span>
              <select onchange="window.erpApp.setBookStatus(this.value)">
                <option value="active" ${state.bookStatus === "active" ? "selected" : ""}>Active books</option>
                <option value="all" ${state.bookStatus === "all" ? "selected" : ""}>All books</option>
                <option value="inactive" ${state.bookStatus === "inactive" ? "selected" : ""}>Inactive books</option>
              </select>
            </label>
          </div>
          ${rows.length ? booksTable(rows) : '<div class="empty-state">No books found.</div>'}
        </div>
      </section>
    `;
  }

  function booksTable(rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ERP Code</th>
              <th>Name</th>
              <th>Book Type</th>
              <th>Sale Price</th>
              ${isMainAdmin() ? "<th>Purchase Price</th>" : ""}
              <th>Status</th>
              ${isMainAdmin() ? "<th>Actions</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.erpCode || row.bookId)}</td>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.bookType || row.category || "-")}</td>
                <td>${money(row.salePrice || row.mrp)}</td>
                ${isMainAdmin() ? `<td>${money(row.purchasePrice || row.distributorPrice)}</td>` : ""}
                <td>${status(row.active ? "Active" : "Inactive", row.active ? "good" : "warn")}</td>
                ${isMainAdmin() ? `<td>
                  <div class="row-actions">
                    <button class="small-button" type="button" onclick="window.erpApp.openBookForm('${escapeAttribute(row.erpCode || row.bookId)}')">Edit</button>
                    ${row.active ? `<button class="small-button danger" type="button" onclick="window.erpApp.deactivateBook('${escapeAttribute(row.erpCode || row.bookId)}')">Deactivate</button>` : ""}
                  </div>
                </td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function renderWarehouses() {
    state.warehouses = (await window.erpApi.request("warehouses.list")).map(normalizeWarehouse);
    return renderWarehousesMarkup();
  }

  function renderWarehousesMarkup() {
    const rows = getFilteredWarehouses();
    const canEditWarehouses = isMainAdmin();
    return `
      <section class="card">
        <div class="panel-header">
          <h2>Warehouse Master</h2>
          <div class="row-actions">
            ${canEditWarehouses ? `
              <button class="small-button" type="button" onclick="document.getElementById('warehouseImportInput').click()">Import Excel</button>
              <button class="small-button" type="button" onclick="window.erpApp.downloadWarehouseSample()">Download Sample</button>
            ` : ""}
            ${canEditWarehouses ? '<button class="button" type="button" onclick="window.erpApp.openWarehouseForm()">Add Warehouse</button>' : ""}
          </div>
        </div>
        <div class="panel-body">
          ${canEditWarehouses ? '<input id="warehouseImportInput" type="file" accept=".csv,.xlsx,.xls" style="display:none" onchange="window.erpApp.importWarehouseFile(this.files[0])">' : ""}
          <div class="toolbar">
            <label class="field compact-field">
              <span>Search</span>
              <input id="warehouseSearchInput" type="search" value="${escapeAttribute(state.warehouseSearch)}" placeholder="Search name, type, SPOC" oninput="window.erpApp.setWarehouseSearch(this.value)">
            </label>
            <label class="field compact-field">
              <span>Status</span>
              <select onchange="window.erpApp.setWarehouseStatus(this.value)">
                <option value="active" ${state.warehouseStatus === "active" ? "selected" : ""}>Active warehouses</option>
                <option value="all" ${state.warehouseStatus === "all" ? "selected" : ""}>All warehouses</option>
                <option value="inactive" ${state.warehouseStatus === "inactive" ? "selected" : ""}>Inactive warehouses</option>
              </select>
            </label>
          </div>
          ${rows.length ? warehousesTable(rows) : '<div class="empty-state">No warehouses found.</div>'}
        </div>
      </section>
    `;
  }

  function warehousesTable(rows) {
    const canEditWarehouses = isMainAdmin();
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Warehouse ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>SPOC</th>
              <th>Mobile</th>
              <th>Status</th>
              ${canEditWarehouses ? "<th>Actions</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.warehouseId)}</td>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.type)}</td>
                <td>${escapeHtml(row.spoc || "-")}</td>
                <td>${escapeHtml(row.mobile || "-")}</td>
                <td>${status(row.active ? "Active" : "Inactive", row.active ? "good" : "warn")}</td>
                ${canEditWarehouses ? `<td>
                  <div class="row-actions">
                    <button class="small-button" type="button" onclick="window.erpApp.openWarehouseForm('${escapeAttribute(row.warehouseId)}')">Edit</button>
                    ${row.active ? `<button class="small-button danger" type="button" onclick="window.erpApp.deactivateWarehouse('${escapeAttribute(row.warehouseId)}')">Deactivate</button>` : ""}
                  </div>
                </td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function renderActivities() {
    const [activities, warehouses, devotees] = await Promise.all([
      window.erpApi.request("activities.list"),
      window.erpApi.request("warehouses.list"),
      window.erpApi.request("devotees.list")
    ]);
    state.activities = activities.map(normalizeActivity);
    state.warehouses = warehouses.map(normalizeWarehouse);
    state.devotees = devotees.map(normalizeDevotee);
    return renderActivitiesMarkup();
  }

  async function ensureActivityMastersLoaded() {
    if (state.warehouses.length && state.devotees.length) {
      return;
    }
    const [warehouses, devotees] = await Promise.all([
      state.warehouses.length ? Promise.resolve(state.warehouses) : window.erpApi.request("warehouses.list"),
      state.devotees.length ? Promise.resolve(state.devotees) : window.erpApi.request("devotees.list")
    ]);
    if (!state.warehouses.length) {
      state.warehouses = Array.isArray(warehouses) ? warehouses.map(normalizeWarehouse) : [];
    }
    if (!state.devotees.length) {
      state.devotees = Array.isArray(devotees) ? devotees.map(normalizeDevotee) : [];
    }
  }

  async function ensureDocumentItemMastersLoaded() {
    const jobs = [];
    if (!state.books.length) {
      jobs.push(window.erpApi.request("books.list").then((rows) => {
        state.books = Array.isArray(rows) ? rows : [];
      }));
    }
    if (!state.devotionalItems.length) {
      jobs.push(window.erpApi.request("items.list", { itemGroup: "PARAPHERNALIA" }).then((rows) => {
        state.devotionalItems = Array.isArray(rows) ? rows : [];
      }));
    }
    if (jobs.length) {
      await Promise.all(jobs);
    }
  }

  window.addEventListener("resize", () => {
    if (!isMobileViewport()) {
      sidebar.classList.remove("open");
    }
  });

  applySidebarState();

  function renderActivitiesMarkup() {
    const rows = getFilteredActivities();
    return `
      <section class="card">
        <div class="panel-header">
          <h2>Activities</h2>
          <button class="button" type="button" onclick="window.erpApp.openActivityForm()">Create Activity</button>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <label class="field compact-field">
              <span>Search</span>
              <input id="activitySearchInput" type="search" value="${escapeAttribute(state.activitySearch)}" placeholder="Search name, type, warehouse" oninput="window.erpApp.setActivitySearch(this.value)">
            </label>
            <label class="field compact-field">
              <span>Status</span>
              <select onchange="window.erpApp.setActivityStatus(this.value)">
                <option value="open" ${state.activityStatus === "open" ? "selected" : ""}>Open activities</option>
                <option value="all" ${state.activityStatus === "all" ? "selected" : ""}>All activities</option>
                <option value="Draft" ${state.activityStatus === "Draft" ? "selected" : ""}>Draft</option>
                <option value="Running" ${state.activityStatus === "Running" ? "selected" : ""}>Running</option>
                <option value="Completed" ${state.activityStatus === "Completed" ? "selected" : ""}>Completed</option>
                <option value="Cancelled" ${state.activityStatus === "Cancelled" ? "selected" : ""}>Cancelled</option>
              </select>
            </label>
          </div>
          ${rows.length ? activitiesTable(rows) : '<div class="empty-state">No activities found.</div>'}
        </div>
      </section>
    `;
  }

  function activitiesTable(rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Activity ID</th>
              <th>Name</th>
              <th>Type</th>
              <th>Devotee</th>
              <th>Dates</th>
              <th>Warehouse</th>
              <th>SPOC</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.activityId)}</td>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.type)}</td>
                <td>${escapeHtml(getDevoteeName(row.devoteeId))}</td>
                <td>${escapeHtml(formatDateRange(row.startDate, row.endDate))}</td>
                <td>${escapeHtml(getWarehouseName(row.warehouseId))}</td>
                <td>${escapeHtml(row.spoc || "-")}</td>
                <td>${status(row.status, row.status === "Running" ? "good" : row.status === "Cancelled" ? "bad" : "warn")}</td>
                <td>
                  <div class="row-actions">
                    <button class="small-button" type="button" onclick="window.erpApp.openActivityForm('${escapeAttribute(row.activityId)}')">Edit</button>
                    ${row.status !== "Cancelled" ? `<button class="small-button danger" type="button" onclick="window.erpApp.cancelActivity('${escapeAttribute(row.activityId)}')">Cancel</button>` : ""}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function renderDocuments() {
    const [documents, books, warehouses, activities, pendingSettlements] = await Promise.all([
      window.erpApi.request("documents.list"),
      window.erpApi.request(isMainAdmin() ? "books.adminList" : "books.list"),
      window.erpApi.request("warehouses.list"),
      window.erpApi.request("activities.list"),
      window.erpApi.request("activity.pendingSettlements")
    ]);
    state.documents = documents.map(normalizeDocument);
    state.books = books;
    state.warehouses = warehouses.map(normalizeWarehouse);
    state.activities = activities.map(normalizeActivity);
    state.pendingSettlements = Array.isArray(pendingSettlements) ? pendingSettlements.map(normalizePendingSettlementSummary) : [];
    void ensureDocumentItemMastersLoaded().catch(() => {});

    return `
      <section class="card">
        <div class="panel-header">
          <h2>Stock Documents</h2>
          <div class="row-actions">
            <button class="button ${state.documentsMode === "entries" ? "" : "secondary"}" type="button" onclick="window.erpApp.setDocumentsMode('entries')">Stock Entries</button>
            <button class="button ${state.documentsMode === "pending" ? "" : "secondary"}" type="button" onclick="window.erpApp.setDocumentsMode('pending')">Pending Settlements</button>
          </div>
        </div>
        <div class="panel-body">
          ${state.documentsMode === "pending" ? `
            <div class="grid metrics">
              ${metric("Pending Activities", state.pendingSettlements.length, "Completed activities with settlement dues")}
              ${metric("Pending Amount", money(state.pendingSettlements.reduce((sum, row) => sum + Number(row.summary?.pendingAmount || 0), 0)), "Total amount still to be collected")}
              ${metric("Paid So Far", money(state.pendingSettlements.reduce((sum, row) => sum + Number(row.summary?.paidTotalAmount || 0), 0)), "Cash plus online received")}
              ${metric("Returned Qty", state.pendingSettlements.reduce((sum, row) => sum + Number(row.summary?.returnQty || 0), 0), "Returned quantity across pending activities")}
            </div>
            <div class="section-gap">
              ${state.pendingSettlementActivityId ? pendingSettlementDetailMarkup(state.pendingSettlementDetails) : pendingSettlementSummaryMarkup(state.pendingSettlements)}
            </div>
          ` : `
            <div class="grid metrics">
              ${metric("Issue", "Out", "Books sent from warehouse to activity or location")}
              ${metric("Return", "In", "Books received back from an issued activity")}
              ${metric("Sale", "Out", "Books distributed and amount recorded")}
              ${metric("Return", "In", "Returned books restored or marked damaged")}
            </div>
            <div class="section-gap">
              <div class="row-actions" style="margin-bottom:12px;">
                <button class="button secondary" type="button" onclick="window.erpApp.openOpeningStockForm()">Opening Stock Entry</button>
                <button class="button secondary" type="button" onclick="window.erpApp.openUnsettledOpeningForm()">Unsettled Issue Entry</button>
                <button class="button secondary" type="button" onclick="window.erpApp.openPurchaseForm()">Purchase Stock Entry</button>
                <button class="button secondary" type="button" onclick="window.erpApp.openSaleForm()">Sale Entry</button>
                <button class="button secondary" type="button" onclick="window.erpApp.openReceiveForm()">Returns Entry</button>
                <button class="button secondary" type="button" onclick="window.erpApp.openTransferForm()">Transfer Entry</button>
                <button class="button secondary" type="button" onclick="window.erpApp.openComplimentaryForm()">Complimentary Issue Entry</button>
                <button class="button" type="button" onclick="window.erpApp.openIssueForm()">Issue Entry</button>
              </div>
              ${state.documents.length ? documentsTable(state.documents) : '<div class="empty-state">No stock documents found.</div>'}
            </div>
          `}
        </div>
      </section>
    `;
  }

  function documentsTable(rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Document ID</th>
              <th>Type</th>
              <th>Date</th>
              <th>From</th>
              <th>To</th>
              <th>Activity</th>
              <th>Status</th>
              <th>Notes</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.slice().reverse().map((row) => `
              <tr>
                <td>${escapeHtml(row.documentId)}</td>
                <td>${status(row.documentType, documentTone(row.documentType))}</td>
                <td>${escapeHtml(toInputDate(row.documentDate) || "-")}</td>
                <td>${escapeHtml(getWarehouseName(row.fromWarehouseId))}</td>
                <td>${escapeHtml(getWarehouseName(row.toWarehouseId))}</td>
                <td>${escapeHtml(getActivityName(row.activityId))}</td>
                <td>${escapeHtml(row.status || "-")}</td>
                <td>${escapeHtml(row.notes || "-")}</td>
                <td>
                  <div class="row-actions">
                    <button class="small-button" type="button" onclick="window.erpApp.downloadDocumentPdf('${escapeAttribute(row.documentId)}')">PDF</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function loadReportsData() {
    const results = await Promise.allSettled([
      window.erpApi.request("stock.current"),
      window.erpApi.request(isMainAdmin() ? "books.adminList" : "books.list"),
      window.erpApi.request("items.list", { itemGroup: "PARAPHERNALIA" }),
      window.erpApi.request("warehouses.list"),
      window.erpApi.request("devotees.list"),
      window.erpApi.request("activities.list"),
      window.erpApi.request("activity.unsettled"),
      window.erpApi.request("activity.complimentary")
    ]);
    const stockResult = results[0];
    const booksResult = results[1];
    const devotionalResult = results[2];
    const warehousesResult = results[3];
    const devoteesResult = results[4];
    const activitiesResult = results[5];
    const unsettledResult = results[6];
    const complimentaryResult = results[7];
    const reportErrors = [];
    if (stockResult.status === "rejected") reportErrors.push("Current stock");
    if (booksResult.status === "rejected") reportErrors.push("Books");
    if (devotionalResult.status === "rejected") reportErrors.push("Devotional items");
    if (warehousesResult.status === "rejected") reportErrors.push("Warehouses");
    if (devoteesResult.status === "rejected") reportErrors.push("Devotees");
    if (activitiesResult.status === "rejected") reportErrors.push("Activities");
    if (unsettledResult.status === "rejected") reportErrors.push("Unsettled stock");
    if (complimentaryResult.status === "rejected") reportErrors.push("Complimentary stock");

    if (stockResult.status === "fulfilled") {
      state.currentStock = Array.isArray(stockResult.value) ? stockResult.value.map(normalizeStockRow) : [];
      state.currentStockLoaded = true;
    }
    if (booksResult.status === "fulfilled") {
      state.books = Array.isArray(booksResult.value) ? booksResult.value : [];
    }
    if (devotionalResult.status === "fulfilled") {
      state.devotionalItems = Array.isArray(devotionalResult.value) ? devotionalResult.value : [];
    }
    if (warehousesResult.status === "fulfilled") {
      state.warehouses = Array.isArray(warehousesResult.value) ? warehousesResult.value.map(normalizeWarehouse) : [];
    }
    if (devoteesResult.status === "fulfilled") {
      state.devotees = Array.isArray(devoteesResult.value) ? devoteesResult.value.map(normalizeDevotee) : [];
    }
    if (activitiesResult.status === "fulfilled") {
      state.activities = Array.isArray(activitiesResult.value) ? activitiesResult.value.map(normalizeActivity) : [];
    }
    if (unsettledResult.status === "fulfilled") {
      state.activityUnsettled = Array.isArray(unsettledResult.value) ? unsettledResult.value.map(normalizeActivityUnsettled) : [];
    }
    if (complimentaryResult.status === "fulfilled") {
      state.activityComplimentary = Array.isArray(complimentaryResult.value) ? complimentaryResult.value.map(normalizeActivityComplimentary) : [];
    }
    state.reportErrors = reportErrors;

    if (!state.reportWarehouseId) {
      state.reportWarehouseId = state.warehouses.find((warehouse) => (warehouse.name || "").toLowerCase().indexOf("gmb") === 0)?.warehouseId || state.warehouses[0]?.warehouseId || "";
    }
    if (!state.reportMonth) {
      state.reportMonth = new Date().toISOString().slice(0, 7);
    }
  }

  function renderReportsMarkup() {
    const totalQuantity = state.currentStock.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const activeWarehouses = new Set(state.currentStock.filter((row) => Number(row.quantity || 0) !== 0).map((row) => row.warehouseId)).size;
    const unsettledQuantity = state.activityUnsettled.reduce((sum, row) => sum + Number(row.unsettledQty || 0), 0);
    const unsettledActivities = new Set(state.activityUnsettled.filter((row) => Number(row.unsettledQty || 0) > 0).map((row) => row.activityId)).size;
    const reportView = state.reportView || "";
    const reportStats = reportView === "activity" && state.activityMonthlyReport
      ? activityMonthlyStats(state.activityMonthlyReport)
      : null;

    return `
      <section class="card">
        <div class="panel-header"><h2>Reports</h2></div>
        <div class="panel-body">
          <div class="grid metrics reports-metrics">
            ${metric("Current Stock", totalQuantity, "Books available across warehouses")}
            ${metric("Warehouse Stock", activeWarehouses, "Warehouses with non-zero stock")}
            ${metric("Unsettled Qty", unsettledQuantity, "Open quantity by activity")}
            ${metric("Activities Open", unsettledActivities, "Activities with unsettled balance")}
            ${metric("Ledger Rows", state.activityLedger.length, "Devotee-linked activity rows")}
          </div>
          ${state.reportErrors.length ? `<div class="empty-state">${escapeHtml(`Some report sources are unavailable right now: ${state.reportErrors.join(", ")}.`)}</div>` : ""}
          <div class="section-gap">
            <label class="field compact-field">
              <span>What do you want me to generate</span>
              <select onchange="window.erpApp.setReportView(this.value)">
                <option value="" disabled ${!reportView ? "selected" : ""}>Select report type</option>
                <option value="warehouse" ${reportView === "warehouse" ? "selected" : ""}>Warehouse wise report</option>
                <option value="activity" ${reportView === "activity" ? "selected" : ""}>Activity wise report</option>
                <option value="unsettled" ${reportView === "unsettled" ? "selected" : ""}>Unsettled issues report</option>
                <option value="complimentary" ${reportView === "complimentary" ? "selected" : ""}>Complimentary issues report</option>
              </select>
            </label>
          </div>
          <div class="section-gap">
            ${!reportView ? '<div class="empty-state">Select a report type to continue.</div>' : ""}
            ${reportView === "warehouse" ? `
              <div class="panel-header compact-header">
                <h2>Warehouse Summary</h2>
                <div class="row-actions">
                  <label class="field compact-field">
                    <span>Warehouse</span>
                    <select onchange="window.erpApp.setReportWarehouse(this.value)">
                      <option value="" disabled ${!state.reportWarehouseId ? "selected" : ""}>Select warehouse</option>
                      ${state.warehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${state.reportWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
                    </select>
                  </label>
                  <label class="field compact-field">
                    <span>Month</span>
                    <input type="month" value="${escapeAttribute(state.reportMonth)}" onchange="window.erpApp.setReportMonth(this.value)">
                  </label>
                  <button class="button" type="button" onclick="window.erpApp.loadWarehouseReport()">Get Report</button>
                  <button class="button secondary" type="button" onclick="window.erpApp.loadWarehouseDayWiseSales()">Get Day Wise Sales</button>
                  <button class="button secondary" type="button" onclick="window.erpApp.downloadWarehouseReport()">Download Excel</button>
                </div>
              </div>
              ${state.warehouseMonthlyReport ? (state.showWarehouseDayWiseSales ? warehouseDayWiseMarkup(state.warehouseMonthlyReport) : warehouseMonthlyMarkup(state.warehouseMonthlyReport)) : '<div class="empty-state">Choose a warehouse and month, then click Get Report.</div>'}
            ` : ""}
            ${reportView === "activity" ? `
              <div class="panel-header compact-header">
                <h2>Activity Wise Report</h2>
                <div class="row-actions">
                  <label class="field compact-field">
                    <span>Month</span>
                    <input type="month" value="${escapeAttribute(state.reportMonth)}" onchange="window.erpApp.setReportMonth(this.value)">
                  </label>
                  <button class="button" type="button" onclick="window.erpApp.loadActivityReport()">Get Report</button>
                  <button class="button secondary" type="button" onclick="window.erpApp.downloadActivityReport()">Download Excel</button>
                </div>
              </div>
              <div class="grid two-col report-activity-filters">
                <div>
                  <label class="field compact-field">
                    <span>Devotee search</span>
                    <input id="activityReportDevoteeSearch" type="search" value="${escapeAttribute(state.activityReportDevoteeSearch)}" placeholder="Type devotee id or name" autocomplete="off" oninput="window.erpApp.setActivityReportDevoteeSearch(this.value)">
                  </label>
                  <div class="book-picker-results report-picker-results">
                    ${activityReportDevoteeOptions().map((devotee) => `
                      <button class="book-picker-item ${state.activityReportDevoteeId === devotee.devoteeId ? "selected" : ""}" type="button" onclick="window.erpApp.selectActivityReportDevotee('${escapeAttribute(devotee.devoteeId)}')">
                        <span class="book-picker-name">${escapeHtml(devotee.devoteeName)}</span>
                        <span class="book-picker-meta">${escapeHtml(devotee.devoteeId)}</span>
                      </button>
                    `).join("") || '<div class="book-picker-empty">No matching devotees.</div>'}
                  </div>
                </div>
                <div>
                  <label class="field compact-field">
                    <span>Activity search</span>
                    <input id="activityReportActivitySearch" type="search" value="${escapeAttribute(state.activityReportActivitySearch)}" placeholder="Type activity id or name" autocomplete="off" oninput="window.erpApp.setActivityReportActivitySearch(this.value)">
                  </label>
                  <div class="book-picker-results report-picker-results">
                    ${activityReportActivityOptions().map((activity) => `
                      <button class="book-picker-item ${state.activityReportActivityId === activity.activityId ? "selected" : ""}" type="button" onclick="window.erpApp.selectActivityReportActivity('${escapeAttribute(activity.activityId)}')">
                        <span class="book-picker-name">${escapeHtml(activity.name || activity.activityId)}</span>
                        <span class="book-picker-meta">${escapeHtml(activity.activityId)} | ${escapeHtml(getWarehouseName(activity.warehouseId))}</span>
                      </button>
                    `).join("") || '<div class="book-picker-empty">No matching activities.</div>'}
                  </div>
                </div>
              </div>
              ${state.activityMonthlyReport ? `
                ${reportStats ? `
                  <div class="grid metrics reports-metrics activity-report-metrics">
                    ${metric("Docs", reportStats.documentCount, "Documents in the selected month")}
                    ${metric("Issue Qty", reportStats.issueQty, "Issue quantity total")}
                    ${metric("Return Qty", reportStats.returnQty, "Return quantity total")}
                    ${metric("Sale Qty", reportStats.saleQty, "Sale quantity total")}
                    ${metric("Unsettled Qty", reportStats.unsettledQty, "Open balance for the activity")}
                  </div>
                ` : ""}
                ${activityMonthlyMarkup(state.activityMonthlyReport)}
              ` : '<div class="empty-state">Select a devotee, then an activity, and click Get Report.</div>'}
            ` : ""}
            ${reportView === "unsettled" ? `
              <div class="panel-header compact-header">
                <h2>Unsettled Issues</h2>
                <div class="row-actions">
                  <button class="button secondary" type="button" onclick="window.erpApp.downloadUnsettledIssuesReport()">Download Excel</button>
                  ${state.unsettledReportActivityId ? `<button class="button secondary" type="button" onclick="window.erpApp.backToUnsettledSummary()">Back to Summary</button>` : ""}
                </div>
              </div>
              ${state.activityUnsettled.length ? (
                state.unsettledReportActivityId
                  ? unsettledActivityDetailMarkup(state.activityUnsettled, state.unsettledReportActivityId)
                : unsettledActivitySummaryMarkup(state.activityUnsettled)
              ) : '<div class="empty-state">No unsettled issues yet.</div>'}
            ` : ""}
            ${reportView === "complimentary" ? `
              <div class="panel-header compact-header">
                <h2>Complimentary Issues</h2>
                <div class="row-actions">
                  <button class="button secondary" type="button" onclick="window.erpApp.downloadComplimentaryIssuesReport()">Download Excel</button>
                  ${state.complimentaryReportActivityId ? `<button class="button secondary" type="button" onclick="window.erpApp.backToComplimentarySummary()">Back to Summary</button>` : ""}
                </div>
              </div>
              ${state.activityComplimentary.length ? (
                state.complimentaryReportActivityId
                  ? complimentaryActivityDetailMarkup(state.activityComplimentary, state.complimentaryReportActivityId)
                  : complimentaryActivitySummaryMarkup(state.activityComplimentary)
              ) : '<div class="empty-state">No complimentary issues yet.</div>'}
            ` : ""}
          </div>
        </div>
      </section>
    `;
  }

  async function renderReports() {
    if (!state.reportsInitialized) {
      state.reportsInitialized = true;
      refreshReportsData();
    }
    return renderReportsMarkup();
  }

  async function refreshReportsData() {
    if (state.reportsLoading) {
      return;
    }
    state.reportsLoading = true;
    const token = Date.now();
    state.reportsLoadToken = token;
    try {
      await loadReportsData();
    } catch (error) {
      state.reportErrors = [error.message || "Reports data"];
    } finally {
      if (state.reportsLoadToken === token) {
        state.reportsLoading = false;
      }
      if (state.view === "reports") {
        content.innerHTML = renderReportsMarkup();
      }
    }
  }

  function currentStockTable(rows) {
    const worthByColumn = rows.reduce((acc, row) => {
      const price = getBookSalePrice(row.bookId);
      const quantity = Number(row.quantity || 0);
      acc.quantity += quantity * price;
      acc.value += quantity * price;
      return acc;
    }, { quantity: 0, value: 0 });
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Warehouse</th>
              <th>Book</th>
              <th>Book Type</th>
              <th>Quantity</th>
              <th>Value</th>
            </tr>
          </thead>
          <tbody>
            <tr class="worth-row">
              <td colspan="3"><strong>Worth</strong></td>
              <td>${money(worthByColumn.quantity)}</td>
              <td>${money(worthByColumn.value)}</td>
            </tr>
          </tbody>
          <tbody>
            ${rows
              .slice()
              .sort((a, b) => getWarehouseName(a.warehouseId).localeCompare(getWarehouseName(b.warehouseId)) || getBookName(a.bookId).localeCompare(getBookName(b.bookId)))
              .map((row) => {
                const book = getBook(row.bookId);
                const quantity = Number(row.quantity || 0);
                const rate = isMainAdmin()
                  ? Number(book.purchasePrice || book.distributorPrice || book["Purchase Price"] || book["Distributor Price"] || 0)
                  : Number(book.salePrice || book.mrp || book["Sale Price"] || 0);
                return `
                  <tr>
                    <td>${escapeHtml(getWarehouseName(row.warehouseId))}</td>
                    <td>${escapeHtml(getBookName(row.bookId))}</td>
                    <td>${escapeHtml(getBookType(book))}</td>
                    <td>${quantity}</td>
                    <td>${money(quantity * rate)}</td>
                  </tr>
                `;
              }).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function renderSettings() {
    const config = window.ERP_CONFIG || {};
    state.users = await window.erpApi.request("users.list");
    return `
      <section class="card">
        <div class="panel-header"><h2>Backend Connection</h2></div>
        <div class="panel-body">
          <table>
            <tbody>
              <tr><th>App Name</th><td>${escapeHtml(config.appName)}</td></tr>
              <tr><th>API URL</th><td>${escapeHtml(config.apiBaseUrl || "Not connected yet")}</td></tr>
              <tr><th>Mode</th><td>${config.mockMode ? "Mock data" : "Live Apps Script"}</td></tr>
              <tr><th>Current User</th><td>${escapeHtml(state.currentUser ? `${state.currentUser.name} (${state.currentUser.role})` : "-")}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
      <section class="card" style="margin-top:18px;">
        <div class="panel-header">
          <h2>User Master</h2>
          <button class="button" type="button" onclick="window.erpApp.openUserForm()">Add User</button>
        </div>
        <div class="panel-body">
          ${renderUsersMarkup(state.users)}
        </div>
      </section>
    `;
  }

  function renderUsersMarkup(rows) {
    if (!rows || !rows.length) {
      return '<div class="empty-state">No users found.</div>';
    }
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>User ID</th>
              <th>Name</th>
              <th>Username</th>
              <th>Role</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.userId || "-")}</td>
                <td>${escapeHtml(row.name || "-")}</td>
                <td>${escapeHtml(row.username || "-")}</td>
                <td>${escapeHtml(row.role || "-")}</td>
                <td>${status(row.active ? "Active" : "Inactive", row.active ? "good" : "warn")}</td>
                <td>
                  <div class="row-actions">
                    <button class="small-button" type="button" onclick="window.erpApp.openUserForm('${escapeAttribute(row.userId)}')">Edit</button>
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function normalizePendingSettlementSummary(row) {
    return {
      activityId: row.activityId || row.activity_code || "",
      activityName: row.activityName || row.name || "",
      activityType: row.activityType || row.type || "",
      devoteeId: row.devoteeId || "",
      devoteeName: row.devoteeName || "",
      warehouseId: row.warehouseId || "",
      warehouseName: row.warehouseName || "",
      settledAt: row.settledAt || "",
      summary: {
        issueQty: Number(row.summary && row.summary.issueQty || 0),
        returnQty: Number(row.summary && row.summary.returnQty || 0),
        saleQty: Number(row.summary && row.summary.saleQty || 0),
        saleDueAmount: Number(row.summary && row.summary.saleDueAmount || 0),
        paidCashAmount: Number(row.summary && row.summary.paidCashAmount || 0),
        paidOnlineAmount: Number(row.summary && row.summary.paidOnlineAmount || 0),
        paidTotalAmount: Number(row.summary && row.summary.paidTotalAmount || 0),
        pendingAmount: Number(row.summary && row.summary.pendingAmount || 0),
        overpaidAmount: Number(row.summary && row.summary.overpaidAmount || 0)
      }
    };
  }

  function setDocumentsMode(mode) {
    state.documentsMode = mode === "pending" ? "pending" : "entries";
    if (state.documentsMode !== "pending") {
      state.pendingSettlementActivityId = "";
      state.pendingSettlementDetails = null;
    }
    content.innerHTML = "";
    void navigate("documents");
  }

  async function showPendingSettlementDetails(activityId) {
    if (!activityId) return;
    state.documentsMode = "pending";
    state.pendingSettlementActivityId = activityId;
    setLoading(true);
    try {
      state.pendingSettlementDetails = await window.erpApi.request("activity.pendingSettlementDetails", { activityId });
      content.innerHTML = await renderDocuments();
    } catch (error) {
      showToast(error.message || "Could not load settlement details");
    } finally {
      setLoading(false);
    }
  }

  function backToPendingSettlementSummary() {
    state.pendingSettlementActivityId = "";
    state.pendingSettlementDetails = null;
    content.innerHTML = renderDocuments();
  }

  function pendingSettlementSummaryMarkup(rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SNo</th>
              <th>Devotee</th>
              <th>Activity</th>
              <th>Sale Due</th>
              <th>Paid</th>
              <th>Pending</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(row.devoteeName || row.devoteeId || "-")}</td>
                <td>
                  <strong>${escapeHtml(row.activityName || row.activityId || "-")}</strong>
                  <div class="metric-note">${escapeHtml(row.warehouseName || "")}</div>
                </td>
                <td>${money(Number(row.summary?.saleDueAmount || 0))}</td>
                <td>${money(Number(row.summary?.paidTotalAmount || 0))}</td>
                <td><strong>${money(Number(row.summary?.pendingAmount || 0))}</strong></td>
                <td><button class="small-button" type="button" onclick="window.erpApp.showPendingSettlementDetails('${escapeAttribute(row.activityId)}')">Show Details</button></td>
              </tr>
            `).join("") : `<tr><td colspan="7"><div class="empty-state">No pending settlements found.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function pendingSettlementDocumentRows(detail) {
    return (detail && Array.isArray(detail.documents) ? detail.documents : []).map((row) => `
      <tr>
        <td>${escapeHtml(row.documentId || "-")}</td>
        <td>${escapeHtml(row.documentType || "-")}</td>
        <td>${escapeHtml(row.documentDate || "-")}</td>
        <td>${Number(row.issueQty || 0)}</td>
        <td>${Number(row.returnQty || 0)}</td>
        <td>${money(Number(row.amount || 0))}</td>
      </tr>
    `).join("");
  }

  function pendingSettlementBooksMarkup(detail) {
    const rows = detail && Array.isArray(detail.books) ? detail.books : [];
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ERP Code</th>
              <th>Book</th>
              <th>Issue</th>
              <th>Return</th>
              <th>Sale</th>
              <th>Net Amount</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.bookId || "-")}</td>
                <td>${escapeHtml(row.bookName || "-")}</td>
                <td>${Number(row.issueQty || 0)}</td>
                <td>${Number(row.returnQty || 0)}</td>
                <td>${Number(row.saleQty || 0)}</td>
                <td>${money(Number(row.amount || 0))}</td>
              </tr>
            `).join("") : `<tr><td colspan="6"><div class="empty-state">No book rows available.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function pendingSettlementPaymentsMarkup(detail) {
    const rows = detail && Array.isArray(detail.payments) ? detail.payments : [];
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Cash</th>
              <th>Online</th>
              <th>Total</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows.length ? rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.paymentDate || "-")}</td>
                <td>${money(Number(row.cashAmount || 0))}</td>
                <td>${money(Number(row.onlineAmount || 0))}</td>
                <td><strong>${money(Number(row.totalAmount || 0))}</strong></td>
                <td>${escapeHtml(row.notes || "-")}</td>
              </tr>
            `).join("") : `<tr><td colspan="5"><div class="empty-state">No settlement payments recorded yet.</div></td></tr>`}
          </tbody>
        </table>
      </div>
    `;
  }

  function pendingSettlementAdminActionsMarkup(detail) {
    if (!isMainAdmin() || !detail || !Array.isArray(detail.books) || !detail.books.length) {
      return "";
    }
    const bookOptions = detail.books.map((row) => `<option value="${escapeAttribute(row.bookId)}">${escapeHtml(row.bookName || row.bookId || "-")}</option>`).join("");
    return `
      <div class="section-gap">
        <h3>Admin Actions</h3>
        <form class="form-grid" id="pendingSettlementActionForm" onsubmit="window.erpApp.savePendingSettlementAdjustment(event)">
          <label class="field">
            <span>Action Type</span>
            <select name="actionType" onchange="window.erpApp.onPendingSettlementActionChange(this.value)">
              <option value="COMPLIMENTARY">Complimentary</option>
              <option value="ADJUSTMENT">Correction</option>
            </select>
          </label>
          <label class="field">
            <span>Document Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(new Date().toISOString().slice(0, 10))}" required>
          </label>
          <label class="field wide-field">
            <span>Book</span>
            <select name="bookId" required>
              <option value="">Select book</option>
              ${bookOptions}
            </select>
          </label>
          <label class="field">
            <span>Quantity</span>
            <input name="quantity" type="number" min="1" step="1" value="1" required>
          </label>
          <label class="field">
            <span>Direction</span>
            <select name="adjustmentDirection" style="display:none">
              <option value="OUT">Reduce stock</option>
              <option value="IN">Add stock</option>
            </select>
          </label>
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" placeholder="Optional note">
          </label>
          <div class="form-actions wide-field">
            <button class="button secondary" type="button" onclick="window.erpApp.onPendingSettlementActionChange('COMPLIMENTARY')">Complimentary</button>
            <button class="button" type="submit">Post Action</button>
          </div>
        </form>
      </div>
    `;
  }

  function pendingSettlementDetailMarkup(detail) {
    if (!detail) {
      return '<div class="empty-state">Choose a pending activity to view the settlement details.</div>';
    }
    const summary = detail.summary || {};
    return `
      <div class="panel-header compact-header">
        <h2>${escapeHtml(detail.activityName || detail.activityId || "Pending Settlement")}</h2>
        <div class="row-actions">
          <button class="button secondary" type="button" onclick="window.erpApp.backToPendingSettlementSummary()">Back to Summary</button>
        </div>
      </div>
      <div class="grid metrics">
        ${metric("Sale Due", money(Number(summary.saleDueAmount || 0)), "Total issue less return value")}
        ${metric("Paid", money(Number(summary.paidTotalAmount || 0)), "Cash plus online already received")}
        ${metric("Complimentary", Number(summary.complimentaryQty || 0), "Marked as free issue")}
        ${metric("Pending", money(Number(summary.pendingAmount || 0)), "Still to be collected")}
        ${metric("Activity", escapeHtml(detail.activityId || "-"), "Settlement record")}
      </div>
      <div class="section-gap">
        <form class="form-grid" id="pendingSettlementPaymentForm" onsubmit="window.erpApp.savePendingSettlementPayment(event)">
          <label class="field">
            <span>Payment Date</span>
            <input name="paymentDate" type="date" value="${escapeAttribute(new Date().toISOString().slice(0, 10))}" required>
          </label>
          <label class="field">
            <span>Cash Received</span>
            <input name="cashAmount" type="number" min="0" step="0.01" value="0" placeholder="0.00">
          </label>
          <label class="field">
            <span>Online Received</span>
            <input name="onlineAmount" type="number" min="0" step="0.01" value="0" placeholder="0.00">
          </label>
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" placeholder="Optional settlement note">
          </label>
          <div class="form-actions wide-field">
            <button class="button" type="submit">Save Payment</button>
          </div>
        </form>
      </div>
      <div class="section-gap">
        <h3>Issue by Issue</h3>
        ${detail.documents && detail.documents.length ? `<div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Document ID</th>
                <th>Type</th>
                <th>Date</th>
                <th>Issue Qty</th>
                <th>Return Qty</th>
                <th>Net Amount</th>
              </tr>
            </thead>
            <tbody>${pendingSettlementDocumentRows(detail)}</tbody>
          </table>
        </div>` : '<div class="empty-state">No issue or return documents found for this activity.</div>'}
      </div>
      <div class="section-gap">
        <h3>Book Wise</h3>
        ${pendingSettlementBooksMarkup(detail)}
      </div>
      <div class="section-gap">
        <h3>Payment History</h3>
        ${pendingSettlementPaymentsMarkup(detail)}
      </div>
      ${pendingSettlementAdminActionsMarkup(detail)}
    `;
  }

  async function savePendingSettlementPayment(event) {
    event.preventDefault();
    const detail = state.pendingSettlementDetails;
    if (!detail) {
      showToast("Select a pending settlement first");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      activityId: detail.activityId,
      paymentDate: data.get("paymentDate"),
      cashAmount: Number(data.get("cashAmount") || 0),
      onlineAmount: Number(data.get("onlineAmount") || 0),
      notes: String(data.get("notes") || "").trim()
    };
    setLoading(true);
    try {
      await window.erpApi.request("activity.settlementPaymentCreate", payload);
      state.pendingSettlementDetails = await window.erpApi.request("activity.pendingSettlementDetails", { activityId: detail.activityId });
      state.pendingSettlements = await window.erpApi.request("activity.pendingSettlements");
      if (Number(state.pendingSettlementDetails.summary?.pendingAmount || 0) <= 0) {
        state.pendingSettlementActivityId = "";
        state.pendingSettlementDetails = null;
      }
      content.innerHTML = await renderDocuments();
      showToast("Settlement payment saved");
    } catch (error) {
      showToast(error.message || "Could not save settlement payment");
    } finally {
      setLoading(false);
    }
  }

  function onPendingSettlementActionChange(value) {
    const form = document.getElementById("pendingSettlementActionForm");
    if (!form) return;
    const actionField = form.querySelector('select[name="actionType"]');
    const directionField = form.querySelector('select[name="adjustmentDirection"]');
    const actionType = String(value || "COMPLIMENTARY");
    if (actionField) {
      actionField.value = actionType;
    }
    if (directionField) {
      directionField.style.display = actionType === "ADJUSTMENT" ? "" : "none";
    }
  }

  async function savePendingSettlementAdjustment(event) {
    event.preventDefault();
    const detail = state.pendingSettlementDetails;
    if (!detail) {
      showToast("Select a pending settlement first");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const actionType = String(data.get("actionType") || "COMPLIMENTARY");
    const quantity = Number(data.get("quantity") || 0);
    if (quantity <= 0) {
      showToast("Quantity must be greater than zero");
      return;
    }
    const payload = {
      documentType: actionType,
      documentDate: data.get("documentDate"),
      activityId: detail.activityId,
      fromWarehouseId: detail.warehouseId,
      toWarehouseId: detail.warehouseId,
      adjustmentDirection: actionType === "ADJUSTMENT" ? String(data.get("adjustmentDirection") || "OUT") : "OUT",
      notes: String(data.get("notes") || "").trim(),
      lines: [{
        bookId: String(data.get("bookId") || "").trim(),
        quantity,
        rate: 0
      }]
    };
    if (!payload.lines[0].bookId) {
      showToast("Select a book");
      return;
    }
    setLoading(true);
    try {
      await window.erpApi.request("documents.create", payload);
      state.pendingSettlementDetails = await window.erpApi.request("activity.pendingSettlementDetails", { activityId: detail.activityId });
      state.pendingSettlements = await window.erpApi.request("activity.pendingSettlements");
      content.innerHTML = await renderDocuments();
      showToast(actionType === "COMPLIMENTARY" ? "Complimentary entry saved" : "Correction entry saved");
    } catch (error) {
      showToast(error.message || "Could not save adjustment");
    } finally {
      setLoading(false);
    }
  }

  function renderDevotionalItemsMarkup() {
    const rows = getFilteredDevotionalItems();
    return `
      <section class="card">
        <div class="panel-header">
          <h2>Devotional Items</h2>
          ${isMainAdmin() ? `
            <div class="row-actions">
              <button class="small-button" type="button" onclick="document.getElementById('devotionalImportInput').click()">Import Excel</button>
              <button class="small-button" type="button" onclick="window.erpApp.downloadDevotionalItemSample()">Download Sample</button>
              <button class="button" type="button" onclick="window.erpApp.openDevotionalItemForm()">Add Item</button>
            </div>
          ` : ""}
        </div>
        <div class="panel-body">
          ${isMainAdmin() ? '<input id="devotionalImportInput" type="file" accept=".csv,.xlsx,.xls" style="display:none" onchange="window.erpApp.importDevotionalItemFile(this.files[0])">' : ""}
          <div class="toolbar">
            <label class="field compact-field">
              <span>Search</span>
              <input id="devotionalSearchInput" type="search" value="${escapeAttribute(state.devotionalSearch)}" placeholder="Search code, name, or type" oninput="window.erpApp.setDevotionalSearch(this.value)">
            </label>
            <label class="field compact-field">
              <span>Status</span>
              <select onchange="window.erpApp.setDevotionalStatus(this.value)">
                <option value="active" ${state.devotionalStatus === "active" ? "selected" : ""}>Active items</option>
                <option value="all" ${state.devotionalStatus === "all" ? "selected" : ""}>All items</option>
                <option value="inactive" ${state.devotionalStatus === "inactive" ? "selected" : ""}>Inactive items</option>
              </select>
            </label>
          </div>
          ${rows.length ? devotionalItemsTable(rows) : '<div class="empty-state">No devotional items found.</div>'}
        </div>
      </section>
    `;
  }

  function devotionalItemsTable(rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ERP Code</th>
              <th>Name</th>
              <th>Item Type</th>
              <th>Sale Price</th>
              ${isMainAdmin() ? "<th>Purchase Price</th>" : ""}
              <th>Status</th>
              ${isMainAdmin() ? "<th>Actions</th>" : ""}
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.erpCode || row.bookId)}</td>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.bookType || row.category || "-")}</td>
                <td>${money(row.salePrice || row.mrp)}</td>
                ${isMainAdmin() ? `<td>${money(row.purchasePrice || row.distributorPrice)}</td>` : ""}
                <td>${status(row.active ? "Active" : "Inactive", row.active ? "good" : "warn")}</td>
                ${isMainAdmin() ? `<td>
                  <div class="row-actions">
                    <button class="small-button" type="button" onclick="window.erpApp.openDevotionalItemForm('${escapeAttribute(row.erpCode || row.bookId)}')">Edit</button>
                    ${row.active ? `<button class="small-button danger" type="button" onclick="window.erpApp.deactivateDevotionalItem('${escapeAttribute(row.erpCode || row.bookId)}')">Deactivate</button>` : ""}
                  </div>
                </td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function openUserForm(userId) {
    const user = state.users.find((item) => item.userId === userId) || {
      userId: "",
      name: "",
      username: "",
      role: "storeIncharge",
      active: true
    };
    const isEdit = Boolean(user.userId);
    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="userFormTitle">
        <div class="modal-header">
          <h2 id="userFormTitle">${isEdit ? "Edit User" : "Add User"}</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="userForm">
          <input type="hidden" name="userId" value="${escapeAttribute(user.userId)}">
          <label class="field wide-field">
            <span>Name</span>
            <input name="name" required value="${escapeAttribute(user.name)}" placeholder="User name">
          </label>
          <label class="field">
            <span>Username</span>
            <input name="username" required value="${escapeAttribute(user.username)}" placeholder="admin">
          </label>
          <label class="field">
            <span>Password ${isEdit ? "(leave blank to keep)" : ""}</span>
            <input name="password" type="password" ${isEdit ? "" : "required"} placeholder="Password">
          </label>
          <label class="field">
            <span>Role</span>
            <select name="role" required>
              <option value="mainAdmin" ${user.role === "mainAdmin" ? "selected" : ""}>Admin</option>
              <option value="storeIncharge" ${user.role === "storeIncharge" ? "selected" : ""}>Store Incharge</option>
            </select>
          </label>
          <label class="check-field">
            <input name="active" type="checkbox" ${user.active ? "checked" : ""}>
            <span>Active</span>
          </label>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit">${isEdit ? "Save Changes" : "Create User"}</button>
          </div>
        </form>
      </section>
    `;
    document.getElementById("userForm").addEventListener("submit", saveUser);
  }

  async function saveUser(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      userId: data.get("userId"),
      name: data.get("name").trim(),
      username: data.get("username").trim(),
      password: data.get("password").trim(),
      role: data.get("role"),
      active: data.get("active") === "on"
    };

    if (!payload.name || !payload.username) {
      showToast("Name and username are required");
      return;
    }

    if (!payload.userId && !payload.password) {
      showToast("Password is required");
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request(payload.userId ? "users.update" : "users.create", payload);
      closeModal();
      content.innerHTML = await renderSettings();
      showToast(payload.userId ? "User updated" : "User created");
    } catch (error) {
      showToast(error.message || "Could not save user");
    } finally {
      setLoading(false);
    }
  }

  function tableSection(sectionTitle, actionLabel, headings, rows) {
    return `
      <section class="card">
        <div class="panel-header">
          <h2>${sectionTitle}</h2>
          <button class="button" type="button" onclick="window.erpApp.toast('${actionLabel} screen comes next')">${actionLabel}</button>
        </div>
        <div class="panel-body">
          <div class="table-wrap">
            <table>
              <thead><tr>${headings.map((item) => `<th>${item}</th>`).join("")}</tr></thead>
              <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
            </table>
          </div>
        </div>
      </section>
    `;
  }

  function getFilteredBooks() {
    const query = state.bookSearch.trim().toLowerCase();
    return state.books.filter((book) => {
      const matchesStatus =
        state.bookStatus === "all" ||
        (state.bookStatus === "active" && book.active) ||
        (state.bookStatus === "inactive" && !book.active);

      const haystack = [book.erpCode, book.bookId, book.name, book.bookType, book.category].join(" ").toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }

  function getFilteredDevotionalItems() {
    const query = state.devotionalSearch.trim().toLowerCase();
    return state.devotionalItems.filter((item) => {
      const matchesStatus =
        state.devotionalStatus === "all" ||
        (state.devotionalStatus === "active" && item.active) ||
        (state.devotionalStatus === "inactive" && !item.active);

      const haystack = [item.erpCode, item.bookId, item.name, item.bookType, item.category].join(" ").toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }

  function setBookSearch(value) {
    state.bookSearch = value;
    rerenderContentKeepingFocus("bookSearchInput", renderBooksMarkup);
  }

  function setBookStatus(value) {
    state.bookStatus = value;
    rerenderContentKeepingFocus("bookSearchInput", renderBooksMarkup);
  }

  function setDevotionalSearch(value) {
    state.devotionalSearch = value;
    rerenderContentKeepingFocus("devotionalSearchInput", renderDevotionalItemsMarkup);
  }

  function setDevotionalStatus(value) {
    state.devotionalStatus = value;
    rerenderContentKeepingFocus("devotionalSearchInput", renderDevotionalItemsMarkup);
  }

  function getItemCollection(itemGroup) {
    return String(itemGroup || "BOOK").toUpperCase() === "BOOK" ? state.books : state.devotionalItems;
  }

  function getItemLabel(itemGroup) {
    return String(itemGroup || "BOOK").toUpperCase() === "BOOK" ? "Book" : "Item";
  }

  function openBookForm(bookId, itemGroup = "BOOK") {
    state.itemFormGroup = itemGroup;
    const collection = getItemCollection(itemGroup);
    const label = getItemLabel(itemGroup);
    const book = collection.find((item) => item.bookId === bookId || item.erpCode === bookId) || {
      bookId: "",
      erpCode: "",
      name: "",
      bookType: "",
      salePrice: "",
      purchasePrice: "",
      category: "",
      active: true
    };
    const isEdit = Boolean(book.erpCode || book.bookId);
    const erpCode = book.erpCode || book.bookId || "";
    const bookType = book.bookType || book.category || "";

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="bookFormTitle">
        <div class="modal-header">
          <h2 id="bookFormTitle">${isEdit ? "Edit Book" : "Add Book"}</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="bookForm">
          <label class="field">
            <span>ERP Code</span>
            <input name="erpCode" required value="${escapeAttribute(erpCode)}" placeholder="PRB-00074" ${isEdit ? "readonly" : ""}>
          </label>
          <label class="field wide-field">
            <span>${label} Name</span>
            <input name="name" required value="${escapeAttribute(book.name)}" placeholder="${label} Name">
          </label>
          <label class="field">
            <span>Book Type</span>
            <input name="bookType" required value="${escapeAttribute(bookType)}" placeholder="Maha Big Books">
          </label>
          <label class="field">
            <span>Sale Price</span>
            <input name="salePrice" type="number" min="0" step="0.01" required value="${escapeAttribute(book.salePrice || book.mrp || "")}">
          </label>
          ${isMainAdmin() ? `<label class="field">
            <span>Purchase Price</span>
            <input name="purchasePrice" type="number" min="0" step="0.01" required value="${escapeAttribute(book.purchasePrice || book.distributorPrice || "")}">
          </label>` : ""}
          <input type="hidden" name="itemGroup" value="${escapeAttribute(itemGroup)}">
          <label class="check-field">
            <input name="active" type="checkbox" ${book.active ? "checked" : ""}>
            <span>Active</span>
          </label>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit">${isEdit ? "Save Changes" : `Create ${label}`}</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("bookForm").addEventListener("submit", saveBook);
  }

  function openDevotionalItemForm(itemId) {
    openBookForm(itemId, "PARAPHERNALIA");
  }

  async function saveBook(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      erpCode: data.get("erpCode").trim(),
      name: data.get("name").trim(),
      bookType: data.get("bookType").trim(),
      salePrice: Number(data.get("salePrice")),
      purchasePrice: isMainAdmin() ? Number(data.get("purchasePrice")) : 0,
      itemGroup: data.get("itemGroup") || "BOOK",
      active: data.get("active") === "on"
    };

    if (!payload.erpCode || !payload.name || !payload.bookType) {
      showToast("ERP code, book name, and book type are required");
      return;
    }

    setLoading(true);
    try {
      const collection = getItemCollection(payload.itemGroup);
      const existing = collection.some((item) => (item.erpCode || item.bookId) === payload.erpCode);
      const action = payload.itemGroup === "BOOK"
        ? (existing ? "books.update" : "books.create")
        : (existing ? "items.update" : "items.create");
      await window.erpApi.request(action, payload);
      closeModal();
      content.innerHTML = payload.itemGroup === "BOOK" ? await renderBooks() : await renderDevotionalItems();
      showToast(existing ? `${getItemLabel(payload.itemGroup)} updated` : `${getItemLabel(payload.itemGroup)} created`);
    } catch (error) {
      showToast(error.message || "Could not save item");
    } finally {
      setLoading(false);
    }
  }

  async function deactivateBook(bookId) {
    const book = state.books.find((item) => item.bookId === bookId || item.erpCode === bookId);
    if (!book) {
      showToast("Book not found");
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request("books.delete", { erpCode: bookId });
      content.innerHTML = await renderBooks();
      showToast("Book deactivated");
    } catch (error) {
      showToast(error.message || "Could not deactivate book");
    } finally {
      setLoading(false);
    }
  }

  function closeModal() {
    modalRoot.innerHTML = "";
  }

  function getFilteredWarehouses() {
    const query = state.warehouseSearch.trim().toLowerCase();
    return state.warehouses.filter((warehouse) => {
      const matchesStatus =
        state.warehouseStatus === "all" ||
        (state.warehouseStatus === "active" && warehouse.active) ||
        (state.warehouseStatus === "inactive" && !warehouse.active);

      const haystack = [warehouse.warehouseId, warehouse.name, warehouse.type, warehouse.spoc, warehouse.mobile].join(" ").toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }

  function setWarehouseSearch(value) {
    state.warehouseSearch = value;
    rerenderContentKeepingFocus("warehouseSearchInput", renderWarehousesMarkup);
  }

  function setWarehouseStatus(value) {
    state.warehouseStatus = value;
    rerenderContentKeepingFocus("warehouseSearchInput", renderWarehousesMarkup);
  }

  function downloadWarehouseSample() {
    const rows = [
      ["Warehouse ID", "Warehouse Name", "Type", "SPOC", "Mobile"],
      ["WH-0001", "GMB Main", "Main", "Admin", ""],
      ["WH-0002", "Annavaram", "Event", "", ""]
    ];
    if (window.XLSX && window.XLSX.utils) {
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, "Warehouses");
      window.XLSX.writeFile(workbook, "warehouse-master-sample.xlsx");
      return;
    }
    const csv = rows.map((row) => row.map((cell) => {
      const text = String(cell || "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "warehouse-master-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importWarehouseFile(file) {
    if (!isMainAdmin()) {
      showToast("Only admin can import warehouses");
      return;
    }
    if (!file) return;
    try {
      const name = file.name || "import";
      const lower = name.toLowerCase();
      let rows = [];
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        if (!window.XLSX) {
          showToast("Excel import library is not loaded");
          return;
        }
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const sheet = workbook.SheetNames[0];
        rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
      } else {
        const text = await file.text();
        rows = parseCsvRows(text);
      }

      const warehouses = rows.map((row) => ({
        warehouseId: String(row["Warehouse ID"] || row.warehouseId || row["Warehouse Code"] || row.warehouseCode || "").trim(),
        name: String(row["Warehouse Name"] || row.name || "").trim(),
        type: String(row["Type"] || row.type || "Event").trim() || "Event",
        spoc: String(row["SPOC"] || row.spoc || "").trim(),
        mobile: String(row["Mobile"] || row.mobile || "").trim(),
        active: true
      })).filter((row) => row.name || row.warehouseId);

      if (!warehouses.length) {
        showToast("No warehouse rows found in the file");
        return;
      }

      setLoading(true);
      try {
        await window.erpApi.request("warehouses.bulkUpsert", { warehouses });
        state.warehouses = (await window.erpApi.request("warehouses.list")).map(normalizeWarehouse);
        content.innerHTML = renderWarehousesMarkup();
        showToast(`Imported ${warehouses.length} warehouses`);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      showToast(error.message || "Could not read the import file");
    } finally {
      const input = document.getElementById("warehouseImportInput");
      if (input) {
        input.value = "";
      }
    }
  }

  async function deactivateDevotionalItem(itemId) {
    const item = state.devotionalItems.find((entry) => entry.bookId === itemId || entry.erpCode === itemId);
    if (!item) {
      showToast("Item not found");
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request("items.delete", { erpCode: itemId });
      content.innerHTML = await renderDevotionalItems();
      showToast("Item deactivated");
    } catch (error) {
      showToast(error.message || "Could not deactivate item");
    } finally {
      setLoading(false);
    }
  }

  function openWarehouseForm(warehouseId) {
    if (!isMainAdmin()) {
      showToast("Only admin can edit warehouses");
      return;
    }
    const warehouse = state.warehouses.find((item) => item.warehouseId === warehouseId) || {
      warehouseId: "",
      name: "",
      type: "Event",
      spoc: "",
      mobile: "",
      active: true
    };
    const isEdit = Boolean(warehouse.warehouseId);

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="warehouseFormTitle">
        <div class="modal-header">
          <h2 id="warehouseFormTitle">${isEdit ? "Edit Warehouse" : "Add Warehouse"}</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="warehouseForm">
          <input type="hidden" name="warehouseId" value="${escapeAttribute(warehouse.warehouseId)}">
          <label class="field wide-field">
            <span>Warehouse Name</span>
            <input name="name" required value="${escapeAttribute(warehouse.name)}" placeholder="GMB Main">
          </label>
          <label class="field">
            <span>Type</span>
            <select name="type" required>
              <option value="" disabled ${!warehouse.type ? "selected" : ""}>Select type</option>
              <option value="Main" ${warehouse.type === "Main" ? "selected" : ""}>Main</option>
              <option value="Event" ${warehouse.type === "Event" ? "selected" : ""}>Event</option>
              <option value="Temporary" ${warehouse.type === "Temporary" ? "selected" : ""}>Temporary</option>
            </select>
          </label>
          <label class="field">
            <span>SPOC</span>
            <input name="spoc" value="${escapeAttribute(warehouse.spoc)}" placeholder="Person responsible">
          </label>
          <label class="field">
            <span>Mobile</span>
            <input name="mobile" value="${escapeAttribute(warehouse.mobile)}" placeholder="Contact number">
          </label>
          <label class="check-field">
            <input name="active" type="checkbox" ${warehouse.active ? "checked" : ""}>
            <span>Active</span>
          </label>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit">${isEdit ? "Save Changes" : "Create Warehouse"}</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("warehouseForm").addEventListener("submit", saveWarehouse);
  }

  async function saveWarehouse(event) {
    event.preventDefault();
    if (!isMainAdmin()) {
      showToast("Only admin can edit warehouses");
      return;
    }
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      warehouseId: data.get("warehouseId"),
      name: data.get("name").trim(),
      type: data.get("type"),
      spoc: data.get("spoc").trim(),
      mobile: data.get("mobile").trim(),
      active: data.get("active") === "on"
    };

    if (!payload.name || !payload.type) {
      showToast("Warehouse name and type are required");
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request(payload.warehouseId ? "warehouses.update" : "warehouses.create", payload);
      closeModal();
      content.innerHTML = await renderWarehouses();
      showToast(payload.warehouseId ? "Warehouse updated" : "Warehouse created");
    } catch (error) {
      showToast(error.message || "Could not save warehouse");
    } finally {
      setLoading(false);
    }
  }

  async function deactivateWarehouse(warehouseId) {
    if (!isMainAdmin()) {
      showToast("Only admin can edit warehouses");
      return;
    }
    const warehouse = state.warehouses.find((item) => item.warehouseId === warehouseId);
    if (!warehouse) {
      showToast("Warehouse not found");
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request("warehouses.delete", { warehouseId });
      content.innerHTML = await renderWarehouses();
      showToast("Warehouse deactivated");
    } catch (error) {
      showToast(error.message || "Could not deactivate warehouse");
    } finally {
      setLoading(false);
    }
  }

  function normalizeWarehouse(row) {
    return {
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      name: row.name || row["Warehouse Name"] || "",
      type: row.type || row.Type || "",
      spoc: row.spoc || row.SPOC || "",
      mobile: row.mobile || row.Mobile || "",
      active: row.active === true || row.active === "TRUE" || row.Active === true || row.Active === "TRUE" || row.Active === "true"
    };
  }

  function getFilteredActivities() {
    const query = state.activitySearch.trim().toLowerCase();
    return state.activities.filter((activity) => {
      const matchesStatus =
        state.activityStatus === "all" ||
        (state.activityStatus === "open" && activity.status !== "Completed" && activity.status !== "Cancelled") ||
        activity.status === state.activityStatus;
      const haystack = [activity.activityId, activity.name, activity.type, activity.spoc, getWarehouseName(activity.warehouseId), getDevoteeName(activity.devoteeId)].join(" ").toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }

  function setActivitySearch(value) {
    state.activitySearch = value;
    rerenderContentKeepingFocus("activitySearchInput", renderActivitiesMarkup);
  }

  function setActivityStatus(value) {
    state.activityStatus = value;
    rerenderContentKeepingFocus("activitySearchInput", renderActivitiesMarkup);
  }

  async function openActivityForm(activityId) {
    setLoading(true);
    try {
      await ensureActivityMastersLoaded();
    } catch (error) {
      showToast(error.message || "Could not load activity form data");
      return;
    } finally {
      setLoading(false);
    }

    const activity = state.activities.find((item) => item.activityId === activityId) || {
      activityId: "",
      name: "",
      type: "",
      devoteeId: "",
      startDate: new Date().toISOString().slice(0, 10),
      endDate: "",
      warehouseId: state.warehouses.find((warehouse) => warehouse.active)?.warehouseId || "",
      spoc: "",
      status: "Draft"
    };
    const isEdit = Boolean(activity.activityId);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active || warehouse.warehouseId === activity.warehouseId);

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="activityFormTitle">
        <div class="modal-header">
          <h2 id="activityFormTitle">${isEdit ? "Edit Activity" : "Create Activity"}</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="activityForm">
          <input type="hidden" name="activityId" value="${escapeAttribute(activity.activityId)}">
          <label class="field wide-field">
            <span>Activity Name</span>
            <input name="name" required value="${escapeAttribute(activity.name)}" placeholder="Simhachalam Stall">
          </label>
          <label class="field">
            <span>Type</span>
            <select name="type" required>
              <option value="" disabled ${!activity.type ? "selected" : ""}>Select type</option>
              ${["Stall", "Daily", "Event", "Marathon", "Festival"].map((type) => `<option value="${type}" ${activity.type === type ? "selected" : ""}>${type}</option>`).join("")}
            </select>
          </label>
          <label class="field wide-field">
            <span>Devotee</span>
            <select name="devoteeId" required>
              <option value="" disabled ${!activity.devoteeId ? "selected" : ""}>Select devotee</option>
              ${state.devotees.length
                ? state.devotees.map((devotee) => `<option value="${escapeAttribute(devotee.devoteeId)}" ${activity.devoteeId === devotee.devoteeId ? "selected" : ""}>${escapeHtml(devotee.devoteeName || devotee.devoteeId || "-")}</option>`).join("")
                : '<option value="" disabled>No devotees found</option>'}
            </select>
          </label>
          <label class="field">
            <span>Warehouse</span>
            <select name="warehouseId" required>
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${activity.warehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Start Date</span>
            <input name="startDate" type="date" value="${escapeAttribute(toInputDate(activity.startDate))}">
          </label>
          <label class="field">
            <span>End Date</span>
            <input name="endDate" type="date" value="${escapeAttribute(toInputDate(activity.endDate))}">
          </label>
          <label class="field">
            <span>SPOC</span>
            <input name="spoc" value="${escapeAttribute(activity.spoc)}" placeholder="Person responsible">
          </label>
          <label class="field">
            <span>Status</span>
            <select name="status">
              ${["Draft", "Running", "Completed", "Cancelled"].map((item) => `<option value="${item}" ${activity.status === item ? "selected" : ""}>${item}</option>`).join("")}
            </select>
          </label>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit">${isEdit ? "Save Changes" : "Create Activity"}</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("activityForm").addEventListener("submit", saveActivity);
  }

  async function saveActivity(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      activityId: data.get("activityId"),
      name: data.get("name").trim(),
      type: data.get("type"),
      devoteeId: data.get("devoteeId"),
      startDate: data.get("startDate"),
      endDate: data.get("endDate"),
      warehouseId: data.get("warehouseId"),
      spoc: data.get("spoc").trim(),
      status: data.get("status")
    };

    if (!payload.name || !payload.type || !payload.warehouseId) {
      showToast("Activity name, type, and warehouse are required");
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request(payload.activityId ? "activities.update" : "activities.create", payload);
      closeModal();
      content.innerHTML = await renderActivities();
      showToast(payload.activityId ? "Activity updated" : "Activity created");
    } catch (error) {
      showToast(error.message || "Could not save activity");
    } finally {
      setLoading(false);
    }
  }

  async function cancelActivity(activityId) {
    setLoading(true);
    try {
      await window.erpApi.request("activities.delete", { activityId });
      content.innerHTML = await renderActivities();
      showToast("Activity cancelled");
    } catch (error) {
      showToast(error.message || "Could not cancel activity");
    } finally {
      setLoading(false);
    }
  }

  function normalizeActivity(row) {
    return {
      activityId: row.activityId || row["Activity ID"] || "",
      name: row.name || row.Name || "",
      type: row.type || row.Type || "",
      devoteeId: row.devoteeId || row["Devotee ID"] || "",
      devoteeName: row.devoteeName || row["Devotee Name"] || "",
      startDate: row.startDate || row["Start Date"] || "",
      endDate: row.endDate || row["End Date"] || "",
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      spoc: row.spoc || row.SPOC || "",
      status: row.status || row.Status || "Draft"
    };
  }

  function normalizeDocument(row) {
    return {
      documentId: row.documentId || row["Document ID"] || "",
      documentType: row.documentType || row["Document Type"] || "",
      documentDate: row.documentDate || row["Document Date"] || "",
      fromWarehouseId: row.fromWarehouseId || row["From Warehouse ID"] || "",
      toWarehouseId: row.toWarehouseId || row["To Warehouse ID"] || "",
      activityId: row.activityId || row["Activity ID"] || "",
      status: row.status || row.Status || "",
      notes: row.notes || row.Notes || ""
    };
  }

  function documentTypeLabel(documentType) {
    const labels = {
      OPENING: "Opening Stock",
      UNSETTLED_OPENING: "Unsettled Issue Entry",
      PURCHASE: "Purchase Stock Entry",
      ISSUE: "Issue Entry",
      RECEIVE: "Returns Entry",
      RETURN: "Returns Entry",
      SALE: "Sale Entry",
      TRANSFER: "Transfer Entry",
      COMPLIMENTARY: "Complimentary Issue Entry",
      ADJUSTMENT: "Adjustment Entry"
    };
    return labels[String(documentType || "").toUpperCase()] || String(documentType || "-").replace(/_/g, " ");
  }

  function normalizeStockRow(row) {
    return {
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      bookId: row.bookId || row["Book ID"] || "",
      quantity: Number(row.quantity || row.Quantity || 0)
    };
  }

  function activityLedgerTable(rows) {
    const showAction = rows.some((row) => Number(row.unsettledQty || 0) > 0);
    const worthTotals = rows.reduce((acc, row) => {
      const price = getBookSalePrice(row.bookId);
      const group = String(row.itemGroup || "BOOK").toUpperCase();
      const bucket = group === "BOOK" ? "books" : "devotional";
      acc[bucket].issue += Number(row.issueQty || 0) * price;
      acc[bucket].return += Number(row.returnQty || 0) * price;
      acc[bucket].sale += Number(row.saleQty || 0) * price;
      acc[bucket].complimentary += Number(row.complimentaryQty || 0) * price;
      acc[bucket].balance += Number(row.unsettledQty || 0) * price;
      return acc;
    }, {
      books: { issue: 0, return: 0, sale: 0, complimentary: 0, balance: 0 },
      devotional: { issue: 0, return: 0, sale: 0, complimentary: 0, balance: 0 }
    });
    const sortedRows = rows.slice().sort((a, b) => {
      const groupA = String(a.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
      const groupB = String(b.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
      if (groupA !== groupB) return groupA - groupB;
      return String(a.bookId || "").localeCompare(String(b.bookId || ""));
    });
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Devotee</th>
              <th>Activity</th>
              <th>Book</th>
              <th>Category</th>
              <th>Issue</th>
              <th>Return</th>
              <th>Sale</th>
              <th>Complimentary</th>
              <th>Balance</th>
              ${showAction ? "<th>Action</th>" : ""}
            </tr>
          </thead>
          <tbody>
            <tr class="worth-row">
              <td colspan="4"><strong>Worth</strong></td>
              <td>${money(worthTotals.books.issue)}</td>
              <td>${money(worthTotals.books.return)}</td>
              <td>${money(worthTotals.books.sale)}</td>
              <td>${money(worthTotals.books.complimentary)}</td>
              <td><strong>${money(worthTotals.books.balance)}</strong></td>
              ${showAction ? "<td></td>" : ""}
            </tr>
            <tr class="worth-row">
              <td colspan="4"><strong>Devotional Worth</strong></td>
              <td>${money(worthTotals.devotional.issue)}</td>
              <td>${money(worthTotals.devotional.return)}</td>
              <td>${money(worthTotals.devotional.sale)}</td>
              <td>${money(worthTotals.devotional.complimentary)}</td>
              <td><strong>${money(worthTotals.devotional.balance)}</strong></td>
              ${showAction ? "<td></td>" : ""}
            </tr>
            ${sortedRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.devoteeName || row.devoteeId || "-")}</td>
                <td>${escapeHtml(row.activityName || row.activityId || "-")}</td>
                <td>${escapeHtml(getBookName(row.bookId))}</td>
                <td>${escapeHtml(String(row.itemGroup || "BOOK"))}</td>
                <td>${Number(row.issueQty || 0)}</td>
                <td>${Number(row.returnQty || 0)}</td>
                <td>${Number(row.saleQty || 0)}</td>
                <td>${Number(row.complimentaryQty || 0)}</td>
                <td><strong>${Number(row.unsettledQty || 0)}</strong></td>
                ${showAction ? `<td>${Number(row.unsettledQty || 0) > 0 ? `<button class="small-button" type="button" onclick="window.erpApp.settleActivity('${escapeAttribute(row.activityId)}')">Settle Now</button>` : ""}</td>` : ""}
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function activityReportDevoteeOptions() {
    const query = state.activityReportDevoteeSearch.trim().toLowerCase();
    const selected = state.devotees.find((devotee) => devotee.devoteeId === state.activityReportDevoteeId);
    const options = state.devotees
      .filter((devotee) => {
        const haystack = [devotee.devoteeId, devotee.devoteeName].join(" ").toLowerCase();
        return !query || haystack.indexOf(query) !== -1;
      })
      .sort((left, right) => {
        const leftText = `${left.devoteeId} ${left.devoteeName}`.toLowerCase();
        const rightText = `${right.devoteeId} ${right.devoteeName}`.toLowerCase();
        const leftScore = leftText.startsWith(query) ? 0 : leftText.indexOf(query) !== -1 ? 1 : 2;
        const rightScore = rightText.startsWith(query) ? 0 : rightText.indexOf(query) !== -1 ? 1 : 2;
        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }
        return leftText.localeCompare(rightText);
      })
      .slice(0, 12);
    if (selected && !options.some((devotee) => devotee.devoteeId === selected.devoteeId)) {
      options.unshift(selected);
    }
    return options;
  }

  function activityReportActivityOptions() {
    const query = state.activityReportActivitySearch.trim().toLowerCase();
    const selected = state.activities.find((activity) => activity.activityId === state.activityReportActivityId);
    const options = state.activities
      .filter((activity) => {
        if (state.activityReportDevoteeId && activity.devoteeId !== state.activityReportDevoteeId) {
          return false;
        }
        const haystack = [activity.activityId, activity.name, getWarehouseName(activity.warehouseId), activity.status].join(" ").toLowerCase();
        return !query || haystack.indexOf(query) !== -1;
      })
      .sort((left, right) => {
        const leftText = [left.activityId, left.name, getWarehouseName(left.warehouseId), left.status].join(" ").toLowerCase();
        const rightText = [right.activityId, right.name, getWarehouseName(right.warehouseId), right.status].join(" ").toLowerCase();
        const leftScore = leftText.startsWith(query) ? 0 : leftText.indexOf(query) !== -1 ? 1 : 2;
        const rightScore = rightText.startsWith(query) ? 0 : rightText.indexOf(query) !== -1 ? 1 : 2;
        if (leftScore !== rightScore) {
          return leftScore - rightScore;
        }
        return leftText.localeCompare(rightText);
      })
      .slice(0, 12);
    if (selected && !options.some((activity) => activity.activityId === selected.activityId)) {
      options.unshift(selected);
    }
    return options;
  }

  function activityMonthlyStats(report) {
    if (!report) {
      return null;
    }
    return {
      documentCount: Number(report.documents && report.documents.length || 0),
      issueQty: Number(report.totals && report.totals.issueQty || 0),
      returnQty: Number(report.totals && report.totals.returnQty || 0),
      saleQty: Number(report.totals && report.totals.saleQty || 0),
      unsettledQty: Number(report.totals && report.totals.unsettledQty || 0)
    };
  }

  function activityDocumentWorthTotals(report) {
    const docs = report && report.documents ? report.documents : [];
    const totals = docs.map(() => 0);
    let overall = 0;
    (report && report.rows ? report.rows : []).forEach((row) => {
      const price = getBookSalePrice(row.bookId);
      (row.docMapArray || []).forEach((doc, index) => {
        const quantity = Number(doc.issueQty || 0) +
          Number(doc.returnQty || 0) +
          Number(doc.saleQty || 0) +
          Number(doc.unsettledQty || 0) +
          Number(doc.complimentaryQty || 0);
        const value = quantity * price;
        totals[index] += value;
        overall += value;
      });
    });
    return { totals: totals, overall: overall };
  }

  function activityMonthlyMarkup(report) {
    if (!report || !report.rows) {
      return '<div class="empty-state">No activity report available.</div>';
    }
    const docs = report.documents || [];
    const worthTotals = activityDocumentWorthTotals(report);
    return `
      <div class="table-wrap activity-report-wrap">
        <table class="activity-report-table">
          <thead>
            <tr>
              <th rowspan="2">ERP Code</th>
              <th rowspan="2">Book</th>
              <th rowspan="2">Category</th>
              ${docs.map((doc) => `<th colspan="5">${escapeHtml(doc.documentId)}</th>`).join("")}
              <th rowspan="2">Issue</th>
              <th rowspan="2">Return</th>
              <th rowspan="2">Sale</th>
              <th rowspan="2">Unsettled</th>
              <th rowspan="2">Complimentary</th>
              <th rowspan="2">Worth</th>
            </tr>
            <tr>
              ${docs.map(() => "<th>Issue</th><th>Return</th><th>Sale</th><th>Unsettled</th><th>Complimentary</th>").join("")}
            </tr>
          </thead>
          <tbody>
            <tr class="worth-row">
              <td colspan="3"><strong>Worth</strong></td>
              ${worthTotals.totals.map((value) => `<td colspan="5">${money(value)}</td>`).join("")}
              <td>${Number(report.totals && report.totals.issueQty || 0)}</td>
              <td>${Number(report.totals && report.totals.returnQty || 0)}</td>
              <td>${Number(report.totals && report.totals.saleQty || 0)}</td>
              <td>${Number(report.totals && report.totals.unsettledQty || 0)}</td>
              <td>${Number(report.totals && report.totals.complimentaryQty || 0)}</td>
              <td>${money(worthTotals.overall || report.totals && report.totals.worth || 0)}</td>
            </tr>
            ${report.rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.bookId)}</td>
                <td><strong>${escapeHtml(row.bookName)}</strong></td>
                <td>${escapeHtml(getItemGroupLabel(row.itemGroup))}</td>
                ${(row.docMapArray || []).map((doc) => `
                  <td>${Number(doc.issueQty || 0)}</td>
                  <td>${Number(doc.returnQty || 0)}</td>
                  <td>${Number(doc.saleQty || 0)}</td>
                  <td>${Number(doc.unsettledQty || 0)}</td>
                  <td>${Number(doc.complimentaryQty || 0)}</td>
                `).join("")}
                <td>${Number(row.issueQty || 0)}</td>
                <td>${Number(row.returnQty || 0)}</td>
                <td>${Number(row.saleQty || 0)}</td>
                <td><strong>${Number(row.unsettledQty || 0)}</strong></td>
                <td>${Number(row.complimentaryQty || 0)}</td>
                <td>${money(row.worth || 0)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function downloadActivityReport() {
    const report = state.activityMonthlyReport;
    if (!report || !report.rows) {
      showToast("Load an activity report first");
      return;
    }

    const html = buildActivityMonthlyExcel(report);
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeName = String(report.activityName || "Activity").replace(/[^\w.-]+/g, "_");
    link.href = url;
    link.download = `${safeName}-${report.month || "report"}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildActivityMonthlyExcel(report) {
    const docs = report.documents || [];
    const worthTotals = activityDocumentWorthTotals(report);
    const headerTop = `
      <tr>
        <th rowspan="2">ERP Code</th>
        <th rowspan="2">Book</th>
        <th rowspan="2">Category</th>
        ${docs.map((doc) => `<th colspan="5">${escapeHtml(doc.documentId)}</th>`).join("")}
        <th rowspan="2">Issue</th>
        <th rowspan="2">Return</th>
        <th rowspan="2">Sale</th>
        <th rowspan="2">Unsettled</th>
        <th rowspan="2">Complimentary</th>
        <th rowspan="2">Worth</th>
      </tr>
      <tr>${docs.map(() => "<th>Issue</th><th>Return</th><th>Sale</th><th>Unsettled</th><th>Complimentary</th>").join("")}</tr>
    `;
    const totalsRow = `
      <tr>
        <td colspan="3"><strong>Worth</strong></td>
        ${worthTotals.totals.map((value) => `<td colspan="5">${escapeHtml(String(value))}</td>`).join("")}
        <td>${Number(report.totals && report.totals.issueQty || 0)}</td>
        <td>${Number(report.totals && report.totals.returnQty || 0)}</td>
        <td>${Number(report.totals && report.totals.saleQty || 0)}</td>
        <td>${Number(report.totals && report.totals.unsettledQty || 0)}</td>
        <td>${Number(report.totals && report.totals.complimentaryQty || 0)}</td>
        <td>${Number(worthTotals.overall || report.totals && report.totals.worth || 0)}</td>
      </tr>
    `;
    const rows = report.rows.map((row) => `
      <tr>
        <td>${escapeHtml(row.bookId)}</td>
        <td>${escapeHtml(row.bookName)}</td>
        <td>${escapeHtml(getItemGroupLabel(row.itemGroup))}</td>
        ${(row.docMapArray || []).map((doc) => `
          <td>${Number(doc.issueQty || 0)}</td>
          <td>${Number(doc.returnQty || 0)}</td>
          <td>${Number(doc.saleQty || 0)}</td>
          <td>${Number(doc.unsettledQty || 0)}</td>
          <td>${Number(doc.complimentaryQty || 0)}</td>
        `).join("")}
        <td>${Number(row.issueQty || 0)}</td>
        <td>${Number(row.returnQty || 0)}</td>
        <td>${Number(row.saleQty || 0)}</td>
        <td>${Number(row.unsettledQty || 0)}</td>
        <td>${Number(row.complimentaryQty || 0)}</td>
        <td>${Number(row.worth || 0)}</td>
      </tr>
    `).join("");
    return `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 11px; }
            th, td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
            th { background: #e9edf5; }
          </style>
        </head>
        <body>
          <table>
            <thead>${headerTop}</thead>
            <tbody>${totalsRow}${rows}</tbody>
          </table>
        </body>
      </html>
    `;
  }

  function warehouseMonthlyMarkup(report) {
    if (!report || !report.rows) {
      return '<div class="empty-state">No warehouse report available.</div>';
    }
    const isMain = report.reportMode === "main";
    const transferTargets = isMain
      ? state.warehouses.filter((warehouse) =>
          warehouse.warehouseId !== report.warehouseId &&
          warehouse.active &&
          String(warehouse.type || "").toLowerCase() !== "temporary" &&
          (warehouse.name || "").toLowerCase().indexOf("gmb") !== 0)
      : [];
    const worthTotals = buildWarehouseWorthTotals(report, transferTargets);
    return `
      <div class="table-wrap warehouse-report-wrap">
        <table class="warehouse-report-table">
          <thead>
            <tr>
              <th>ERP Code</th>
              <th>Book</th>
              <th>Category</th>
              <th>Opening</th>
              ${isMain
                ? `${transferTargets.map((warehouse) => `<th>To ${escapeHtml(warehouse.name)}</th>`).join("")}<th>Sales</th><th>Complimentary</th><th>Unsettled</th><th>Closing</th>`
                : `<th>Transfer In</th><th>Sales</th><th>Closing</th>`}
            </tr>
          </thead>
          <tbody>
            ${buildWarehouseWorthRow(report, transferTargets, worthTotals)}
          </tbody>
          <tbody>
            ${report.rows.map((row) => renderWarehouseReportRow(row, report, transferTargets)).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderTransferBreakdown(transfers) {
    if (!transfers || !transfers.length) {
      return "0";
    }
    return transfers.map((item) => `${escapeHtml(item.name)}: ${Number(item.quantity || 0)}`).join("<br>");
  }

  function renderWarehouseReportRow(row, report, transferTargets) {
    const isMain = report.reportMode === "main";
    return `
      <tr>
        <td>${escapeHtml(row.bookId)}</td>
        <td><strong>${escapeHtml(row.bookName)}</strong></td>
        <td>${escapeHtml(getItemGroupLabel(row.itemGroup))}</td>
        <td>${Number(row.openingQty || 0)}</td>
        ${isMain
          ? `${transferTargets.map((warehouse) => `<td>${Number(((row.transferMap || {})[warehouse.name]) || 0)}</td>`).join("")}<td>${Number(row.saleQty || 0)}</td><td>${Number(row.complimentaryQty || 0)}</td><td>${Number(row.unsettledQty || 0)}</td><td><strong>${Number(row.closingQty || 0)}</strong></td>`
          : `<td>${Number(row.transferInQty || 0)}</td><td>${Number(row.saleQty || 0)}</td><td><strong>${Number(row.closingQty || 0)}</strong></td>`}
      </tr>
    `;
  }

  function warehouseDayWiseMarkup(report) {
    if (!report || !report.rows) {
      return "";
    }
    const worthByDay = report.dayColumns.reduce((acc, day) => {
      acc[day] = 0;
      return acc;
    }, {});
    report.rows.forEach((row) => {
      const price = getBookSalePrice(row.bookId);
      report.dayColumns.forEach((day) => {
        worthByDay[day] += Number((row.daySalesMap && row.daySalesMap[day]) || 0) * price;
      });
    });

    return `
      <div class="section-gap">
        <div class="panel-header compact-header">
          <h2>Day Wise Sales</h2>
        </div>
        <div class="table-wrap warehouse-daywise-wrap">
          <table class="warehouse-daywise-table">
            <thead>
              <tr>
                <th>ERP Code</th>
                <th>Book</th>
                <th>Category</th>
                ${report.dayColumns.map((day) => `<th>${escapeHtml(day)}</th>`).join("")}
              </tr>
            </thead>
            <tbody>
              <tr class="worth-row">
                <td colspan="3"><strong>Worth</strong></td>
                ${report.dayColumns.map((day) => `<td>${money(worthByDay[day] || 0)}</td>`).join("")}
              </tr>
              ${report.rows.map((row) => `
                <tr>
                  <td>${escapeHtml(row.bookId)}</td>
                  <td><strong>${escapeHtml(row.bookName)}</strong></td>
                  <td>${escapeHtml(getItemGroupLabel(row.itemGroup))}</td>
                  ${report.dayColumns.map((day) => `<td>${Number((row.daySalesMap && row.daySalesMap[day]) || 0)}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  function downloadWarehouseReport() {
    const report = state.warehouseMonthlyReport;
    if (!report || !report.rows) {
      showToast("Load a warehouse report first");
      return;
    }

    const html = buildWarehouseReportExcel(report);
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const safeWarehouse = String(report.warehouseName || "Warehouse").replace(/[^\w.-]+/g, "_");
    link.href = url;
    link.download = `${safeWarehouse}-${report.month || "report"}.xls`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function buildWarehouseReportExcel(report) {
    const isMain = report.reportMode === "main";
    const transferTargets = isMain
      ? state.warehouses.filter((warehouse) =>
          warehouse.warehouseId !== report.warehouseId &&
          warehouse.active &&
          String(warehouse.type || "").toLowerCase() !== "temporary" &&
          (warehouse.name || "").toLowerCase().indexOf("gmb") !== 0)
      : [];
    const headerCells = ["ERP Code", "Book", "Opening"];
    const sortedRows = report.rows.slice().sort((a, b) => {
      const groupA = String(a.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
      const groupB = String(b.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
      return groupA - groupB || String(a.bookName || "").localeCompare(String(b.bookName || "")) || String(a.bookId || "").localeCompare(String(b.bookId || ""));
    });
    headerCells.splice(2, 0, "Category");
    if (isMain) {
      transferTargets.forEach((warehouse) => headerCells.push(`To ${warehouse.name}`));
      headerCells.push("Sales", "Complimentary", "Unsettled", "Closing");
    } else {
      headerCells.push("Transfer In", "Sales", "Closing");
      report.dayColumns.forEach((day) => headerCells.push(day));
    }
    const worthTotals = buildWarehouseWorthTotals(report, transferTargets);
    const worthRow = buildWarehouseWorthExcelRow(report, transferTargets, worthTotals);

    const rows = sortedRows.map((row) => {
      const cells = [row.bookId || "", row.bookName || "", getItemGroupLabel(row.itemGroup), Number(row.openingQty || 0)];
      if (isMain) {
        transferTargets.forEach((warehouse) => cells.push(Number(((row.transferMap || {})[warehouse.name]) || 0)));
        cells.push(Number(row.saleQty || 0), Number(row.complimentaryQty || 0), Number(row.unsettledQty || 0), Number(row.closingQty || 0));
      } else {
        cells.push(Number(row.transferInQty || 0), Number(row.saleQty || 0), Number(row.closingQty || 0));
        report.dayColumns.forEach((day) => cells.push(Number((row.daySalesMap && row.daySalesMap[day]) || 0)));
      }
      return `<tr>${cells.map((cell) => `<td>${escapeHtml(String(cell))}</td>`).join("")}</tr>`;
    }).join("");

    return `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 11px; }
            th, td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
            th { background: #e9edf5; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>${headerCells.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr>
            </thead>
            <tbody>${worthRow}</tbody>
            <tbody>${rows}</tbody>
          </table>
        </body>
      </html>
    `;
  }

  function normalizeActivityUnsettled(row) {
    return {
      devoteeId: row.devoteeId || row["Devotee ID"] || "",
      devoteeName: row.devoteeName || row["Devotee Name"] || "",
      activityId: row.activityId || row["Activity ID"] || "",
      activityName: row.activityName || row["Activity Name"] || "",
      bookId: row.bookId || row["Book ID"] || "",
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      issuedQty: Number(row.issuedQty || row["Issued Qty"] || 0),
      returnedQty: Number(row.returnedQty || row["Returned Qty"] || 0),
      soldQty: Number(row.soldQty || row["Sold Qty"] || 0),
      complimentaryQty: Number(row.complimentaryQty || row["Complimentary Qty"] || 0),
      unsettledQty: Number(row.unsettledQty || row["Unsettled Qty"] || 0)
    };
  }

  function normalizeActivityComplimentary(row) {
    return {
      devoteeId: row.devoteeId || row["Devotee ID"] || "",
      devoteeName: row.devoteeName || row["Devotee Name"] || "",
      activityId: row.activityId || row["Activity ID"] || "",
      activityName: row.activityName || row["Activity Name"] || "",
      bookId: row.bookId || row["Book ID"] || "",
      bookName: row.bookName || row["Book Name"] || "",
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      complimentaryQty: Number(row.complimentaryQty || row["Complimentary Qty"] || 0),
      worth: Number(row.worth || row["Worth"] || 0)
    };
  }

  function normalizeActivityLedger(row) {
    return {
      devoteeId: row.devoteeId || row["Devotee ID"] || "",
      devoteeName: row.devoteeName || row["Devotee Name"] || "",
      activityId: row.activityId || row["Activity ID"] || "",
      activityName: row.activityName || row["Activity Name"] || "",
      bookId: row.bookId || row["Book ID"] || "",
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      issueQty: Number(row.issueQty || row["Issue Qty"] || 0),
      returnQty: Number(row.returnQty || row["Return Qty"] || 0),
      saleQty: Number(row.saleQty || row["Sale Qty"] || 0),
      complimentaryQty: Number(row.complimentaryQty || row["Complimentary Qty"] || 0),
      unsettledQty: Number(row.unsettledQty || row["Unsettled Qty"] || 0)
    };
  }

  function normalizeActivityMonthlyReport(row) {
    return {
      month: row.month || "",
      devoteeId: row.devoteeId || row["Devotee ID"] || "",
      devoteeName: row.devoteeName || row["Devotee Name"] || "",
      activityId: row.activityId || row["Activity ID"] || "",
      activityName: row.activityName || row["Activity Name"] || "",
      activityStatus: row.activityStatus || row["Activity Status"] || "",
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      warehouseName: row.warehouseName || row["Warehouse Name"] || "",
      documents: (row.documents || row["Documents"] || []).map((doc) => ({
        documentId: doc.documentId || doc["Document ID"] || "",
        documentType: doc.documentType || doc["Document Type"] || "",
        documentDate: doc.documentDate || doc["Document Date"] || "",
        status: doc.status || doc.Status || "",
        notes: doc.notes || doc.Notes || ""
      })),
      rows: (row.rows || []).map((item) => ({
        bookId: item.bookId || item["Book ID"] || "",
        bookName: item.bookName || item["Book Name"] || "",
        bookType: item.bookType || item["Book Type"] || "",
        issueQty: Number(item.issueQty || item["Issue Qty"] || 0),
        returnQty: Number(item.returnQty || item["Return Qty"] || 0),
        saleQty: Number(item.saleQty || item["Sale Qty"] || 0),
        complimentaryQty: Number(item.complimentaryQty || item["Complimentary Qty"] || 0),
        unsettledQty: Number(item.unsettledQty || item["Unsettled Qty"] || 0),
        worth: Number(item.worth || item["Worth"] || 0),
        documentCount: Number(item.documentCount || item["Document Count"] || 0),
        docMapArray: (item.docMapArray || item["Doc Map Array"] || []).map((doc) => ({
          documentId: doc.documentId || doc["Document ID"] || "",
          documentType: doc.documentType || doc["Document Type"] || "",
          documentDate: doc.documentDate || doc["Document Date"] || "",
          issueQty: Number(doc.issueQty || doc["Issue Qty"] || 0),
          returnQty: Number(doc.returnQty || doc["Return Qty"] || 0),
          saleQty: Number(doc.saleQty || doc["Sale Qty"] || 0),
          unsettledQty: Number(doc.unsettledQty || doc["Unsettled Qty"] || 0),
          complimentaryQty: Number(doc.complimentaryQty || doc["Complimentary Qty"] || 0)
        }))
      })),
      totals: {
        issueQty: Number(row.totals && (row.totals.issueQty || row.totals["Issue Qty"]) || 0),
        returnQty: Number(row.totals && (row.totals.returnQty || row.totals["Return Qty"]) || 0),
        saleQty: Number(row.totals && (row.totals.saleQty || row.totals["Sale Qty"]) || 0),
        complimentaryQty: Number(row.totals && (row.totals.complimentaryQty || row.totals["Complimentary Qty"]) || 0),
        unsettledQty: Number(row.totals && (row.totals.unsettledQty || row.totals["Unsettled Qty"]) || 0),
        worth: Number(row.totals && (row.totals.worth || row.totals["Worth"]) || 0)
      }
    };
  }

  function normalizeDevotee(row) {
    return {
      devoteeId: row.devoteeId || row["Devotee ID"] || "",
      devoteeName: row.devoteeName || row["Devotee Name"] || "",
      active: row.active === true || row.active === "TRUE" || row.Active === true || row.Active === "TRUE" || row.Active === "true"
    };
  }

  function normalizeWarehouseMonthlyReport(row) {
    return {
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      warehouseName: row.warehouseName || row["Warehouse Name"] || "",
      month: row.month || "",
      reportMode: row.reportMode || "branch",
      dayColumns: row.dayColumns || [],
      rows: (row.rows || []).map((item) => ({
        bookId: item.bookId || item["Book ID"] || "",
        bookName: item.bookName || item["Book Name"] || "",
        bookType: item.bookType || item["Book Type"] || "",
        openingQty: Number(item.openingQty || item["Opening Qty"] || 0),
        issueQty: Number(item.issueQty || item["Issue Qty"] || 0),
        returnQty: Number(item.returnQty || item["Return Qty"] || 0),
        transferInQty: Number(item.transferInQty || item["Transfer In Qty"] || 0),
        transferOutQty: Number(item.transferOutQty || item["Transfer Out Qty"] || 0),
        saleQty: Number(item.saleQty || item["Sale Qty"] || 0),
        complimentaryQty: Number(item.complimentaryQty || item["Complimentary Qty"] || 0),
        unsettledQty: Number(item.unsettledQty || item["Unsettled Qty"] || 0),
        closingQty: Number(item.closingQty || item["Closing Qty"] || 0),
        transferArray: (item.transferArray || item["Transfer Array"] || []).map((transfer) => ({
          name: transfer.name || transfer["Name"] || "",
          quantity: Number(transfer.quantity || transfer["Quantity"] || 0)
        })),
        transferMap: (item.transferArray || item["Transfer Array"] || []).reduce((acc, transfer) => {
          const name = transfer.name || transfer["Name"] || "";
          if (name) {
            acc[name] = Number(transfer.quantity || transfer["Quantity"] || 0);
          }
          return acc;
        }, {}),
        daySalesMap: (item.daySalesArray || item["Day Sales Array"] || []).reduce((acc, sale) => {
          const day = sale.day || sale["Day"] || "";
          if (day) {
            acc[day] = Number(sale.quantity || sale["Quantity"] || 0);
          }
          return acc;
        }, {})
      }))
    };
  }

  function getWarehouseName(warehouseId) {
    const warehouse = state.warehouses.find((item) => item.warehouseId === warehouseId);
    return warehouse ? warehouse.name : warehouseId || "-";
  }

  function getDevoteeName(devoteeId) {
    const devotee = state.devotees.find((item) => item.devoteeId === devoteeId);
    return devotee ? devotee.devoteeName : devoteeId || "-";
  }

  function getBook(bookId) {
    return getItem(bookId);
  }

  function getBookSalePrice(bookId) {
    const item = getItem(bookId);
    return Number(item.salePrice || item.mrp || item["Sale Price"] || 0);
  }

  function getBookName(bookId) {
    const item = getItem(bookId);
    return item.name || item["Book Name"] || bookId || "-";
  }

  function normalizeItemGroup(itemGroup) {
    const value = String(itemGroup || "BOOK").trim().toUpperCase();
    if (value === "PARAPHERNALIA" || value === "BOOK" || value === "OTHER") {
      return value;
    }
    return "BOOK";
  }

  function getItemGroupLabel(itemGroup) {
    const value = normalizeItemGroup(itemGroup);
    if (value === "PARAPHERNALIA") return "Devotional Items";
    if (value === "OTHER") return "Other Items";
    return "Books";
  }

  function getItemGroupSingularLabel(itemGroup) {
    const value = normalizeItemGroup(itemGroup);
    if (value === "PARAPHERNALIA") return "Item";
    if (value === "OTHER") return "Item";
    return "Book";
  }

  function getDocumentItemGroupOptions() {
    return [
      { value: "BOOK", label: "Books" },
      { value: "PARAPHERNALIA", label: "Devotional Items" }
    ];
  }

  function getDocumentItemsForGroup(itemGroup) {
    const value = normalizeItemGroup(itemGroup);
    if (value === "PARAPHERNALIA") {
      return state.devotionalItems.filter((item) => item.active !== false);
    }
    return state.books.filter((item) => item.active !== false);
  }

  function renderDocumentItemGroupField(kind, draft) {
    const current = normalizeItemGroup(draft && draft.itemGroup ? draft.itemGroup : "BOOK");
    return `
      <label class="field">
        <span>Category</span>
        <select name="itemGroup" onchange="window.erpApp.onDocumentItemGroupChange('${kind}', this.value)">
          ${getDocumentItemGroupOptions().map((option) => `<option value="${escapeAttribute(option.value)}" ${current === option.value ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("")}
        </select>
      </label>
    `;
  }

  function getItem(bookId) {
    return state.books.find((item) => item.bookId === bookId || item.erpCode === bookId || item["ERP Code"] === bookId || item["Book ID"] === bookId)
      || state.devotionalItems.find((item) => item.bookId === bookId || item.erpCode === bookId || item["ERP Code"] === bookId || item["Book ID"] === bookId)
      || {};
  }

  function getAvailableStock(warehouseId, bookId) {
    const stockRow = state.currentStock.find((row) => row.warehouseId === warehouseId && row.bookId === bookId);
    return stockRow ? Number(stockRow.quantity || 0) : 0;
  }

  function getBookType(book) {
    return book.bookType || book.category || book["Book Type"] || "-";
  }

  function getBookOptionLabel(book) {
    return `${book.name || book["Book Name"] || "-"} - ${getBookType(book)}`;
  }

  function getBookPickerState(kind) {
    if (kind === "issue") return state.issueBookQueries;
    if (kind === "sale") return state.saleBookQueries;
    if (kind === "receive") return state.receiveBookQueries;
    if (kind === "transfer") return state.transferBookQueries;
    if (kind === "opening") return state.openingBookQueries;
    if (kind === "unsettled") return state.unsettledBookQueries;
    return [];
  }

  function ensureBookPickerState(kind, index) {
    const bucket = getBookPickerState(kind);
    while (bucket.length <= index) {
      bucket.push("");
    }
    return bucket;
  }

  function setBookPickerQuery(kind, index, value) {
    const bucket = ensureBookPickerState(kind, index);
    bucket[index] = value;
    rerenderDocumentModal(kind, index, value);
  }

  function pickBookFromPicker(kind, index, bookId) {
    const line = getDocumentLineByKind(kind, index);
    if (!line) return;
    line.bookId = bookId;
    line.quantity = Number(line.quantity || 1);
    line.rate = kind === "sale" ? getBookSalePrice(bookId) : Number(line.rate || 0);
    const book = getBook(bookId);
    const bucket = ensureBookPickerState(kind, index);
    bucket[index] = getBookPickerDisplayLabel(book);
    rerenderDocumentModal(kind, index, bucket[index]);
  }

  function getBookPickerDisplayLabel(book) {
    return `${book.name || book["Book Name"] || "-"}${book.bookType || book.category || book["Book Type"] ? ` - ${book.bookType || book.category || book["Book Type"]}` : ""}`;
  }

  function filterBooksForPicker(activeBooks, query, warehouseId) {
    const needle = String(query || "").trim().toLowerCase();
    return activeBooks
      .filter((book) => {
        const bookId = book.erpCode || book.bookId;
        if (warehouseId && state.currentStockLoaded && getAvailableStock(warehouseId, bookId) <= 0) {
          return false;
        }
        if (!needle) return true;
        const haystack = [bookId, book.name, book["Book Name"], getBookType(book)].join(" ").toLowerCase();
        return haystack.indexOf(needle) !== -1;
      })
      .slice(0, 12);
  }

  function bookPickerMarkup(kind, index, activeBooks, line, query, warehouseId, itemGroup) {
    const bookId = line.bookId || "";
    const selectedBook = bookId ? getBook(bookId) : null;
    const activeQuery = String(query || "");
    const filteredBooks = filterBooksForPicker(activeBooks, activeQuery, warehouseId);
    const singular = getItemGroupSingularLabel(itemGroup);
    const availabilityHint = warehouseId
      ? (state.currentStockLoaded ? `Stock at ${getWarehouseName(warehouseId)}` : `Loading stock for ${getWarehouseName(warehouseId)}...`)
      : "Type to search";
    return `
      <div class="book-picker">
        <label class="field">
          <span>Search ${singular}</span>
          <input
            type="search"
            data-book-picker="${kind}-${index}"
            value="${escapeAttribute(activeQuery || (selectedBook ? getBookPickerDisplayLabel(selectedBook) : ""))}"
            placeholder="Type ERP code or ${singular.toLowerCase()} name"
            autocomplete="off"
            oninput="window.erpApp.setBookPickerQuery('${kind}', ${index}, this.value)">
        </label>
        <div class="book-picker-results">
          ${filteredBooks.length ? filteredBooks.map((book) => {
            const itemId = book.erpCode || book.bookId;
            const selected = itemId === bookId;
            const avail = warehouseId && state.currentStockLoaded ? getAvailableStock(warehouseId, itemId) : null;
            return `
              <button
                class="book-picker-item ${selected ? "selected" : ""}"
                type="button"
                onclick="window.erpApp.pickBookFromPicker('${kind}', ${index}, '${escapeAttribute(itemId)}')">
                <span class="book-picker-name">${escapeHtml(getBookPickerDisplayLabel(book))}</span>
                <span class="book-picker-meta">${escapeHtml(itemId)}${avail !== null ? ` | Avail ${avail}` : ""}</span>
              </button>
            `;
          }).join("") : `<div class="book-picker-empty">${escapeHtml(activeQuery ? `No books match "${activeQuery}".` : availabilityHint)}</div>`}
        </div>
        ${selectedBook ? `<div class="book-picker-selected">Selected: ${escapeHtml(getBookPickerDisplayLabel(selectedBook))}</div>` : ""}
      </div>
    `;
  }

  function unsettledActivitySummaryRows(rows) {
    const index = {};
    rows.forEach((row) => {
      const key = row.activityId || "";
      if (!key) {
        return;
      }
      if (!index[key]) {
        index[key] = {
          devoteeId: row.devoteeId || "",
          devoteeName: row.devoteeName || getDevoteeName(row.devoteeId),
          activityId: row.activityId,
          activityName: row.activityName || getActivityName(row.activityId),
          booksWorth: 0,
          devotionalWorth: 0,
          worth: 0,
          unsettledQty: 0,
          rowCount: 0
        };
      }
      index[key].rowCount += 1;
      index[key].unsettledQty += Number(row.unsettledQty || 0);
      const worth = Number(row.unsettledQty || 0) * getBookSalePrice(row.bookId);
      if (String(row.itemGroup || "BOOK").toUpperCase() === "BOOK") {
        index[key].booksWorth += worth;
      } else {
        index[key].devotionalWorth += worth;
      }
      index[key].worth += worth;
    });
    return Object.keys(index)
      .map((key) => index[key])
      .sort((a, b) => a.devoteeName.localeCompare(b.devoteeName) || a.activityName.localeCompare(b.activityName));
  }

  function unsettledActivitySummaryMarkup(rows) {
    const summaryRows = unsettledActivitySummaryRows(rows);
    const totalWorth = summaryRows.reduce((sum, row) => sum + Number(row.worth || 0), 0);
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>SNo</th>
              <th>Devotee Name</th>
              <th>Activity Name</th>
              <th>Books Worth</th>
              <th>Devotional Worth</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            <tr class="worth-row">
              <td colspan="3"><strong>Worth</strong></td>
              <td><strong>${money(summaryRows.reduce((sum, row) => sum + Number(row.booksWorth || 0), 0))}</strong></td>
              <td><strong>${money(summaryRows.reduce((sum, row) => sum + Number(row.devotionalWorth || 0), 0))}</strong></td>
              <td></td>
            </tr>
            ${summaryRows.map((row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(row.devoteeName || row.devoteeId || "-")}</td>
                <td>${escapeHtml(row.activityName || row.activityId || "-")}</td>
                <td><strong>${money(row.booksWorth || 0)}</strong></td>
                <td><strong>${money(row.devotionalWorth || 0)}</strong></td>
                <td><button class="small-button" type="button" onclick="window.erpApp.showUnsettledActivityDetails('${escapeAttribute(row.activityId)}')">Show Details</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function unsettledActivityDetailRows(rows, activityId) {
    const filtered = rows.filter((row) => row.activityId === activityId);
    const index = {};
    filtered.forEach((row) => {
      if (!index[row.bookId]) {
        index[row.bookId] = {
          bookId: row.bookId,
          bookName: getBookName(row.bookId),
          itemGroup: row.itemGroup || "BOOK",
          unsettledQty: 0
        };
      }
      index[row.bookId].unsettledQty += Number(row.unsettledQty || 0);
    });
    return Object.keys(index)
      .map((bookId) => index[bookId])
      .sort((a, b) => a.bookName.localeCompare(b.bookName) || a.bookId.localeCompare(b.bookId));
  }

  function unsettledActivityDetailMarkup(rows, activityId) {
    const detailRows = unsettledActivityDetailRows(rows, activityId);
    const totalUnsettled = rows.reduce((sum, row) => sum + Number(row.unsettledQty || 0), 0);
    const selectedActivity = rows.find((row) => row.activityId === activityId);
    if (!selectedActivity) {
      return '<div class="empty-state">Unsettled activity not found.</div>';
    }
    return `
      <div class="grid metrics reports-metrics activity-report-metrics">
        ${metric("Total Unsettled Qty of All Activities", totalUnsettled, "All unsettled quantities currently on record")}
        ${metric("Selected Activity", selectedActivity.activityName || selectedActivity.activityId, "Book-wise unsettled details below")}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ERP Code</th>
              <th>Book Name</th>
              <th>Category</th>
              <th>Unsettled Quantity</th>
              <th>Total Unsettled Qty of all activities</th>
            </tr>
          </thead>
          <tbody>
            <tr class="worth-row">
              <td colspan="3"><strong>Worth</strong></td>
              <td><strong>${Number(detailRows.reduce((sum, row) => sum + Number(row.unsettledQty || 0), 0))}</strong></td>
              <td><strong>${Number(totalUnsettled)}</strong></td>
            </tr>
            ${detailRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.bookId)}</td>
                <td>${escapeHtml(row.bookName)}</td>
                <td>${escapeHtml(row.itemGroup || "BOOK")}</td>
                <td><strong>${Number(row.unsettledQty || 0)}</strong></td>
                <td>${Number(totalUnsettled)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function complimentaryActivitySummaryRows(rows) {
    const index = {};
    rows.forEach((row) => {
      const key = row.activityId || "";
      if (!key) {
        return;
      }
      if (!index[key]) {
        index[key] = {
          devoteeId: row.devoteeId || "",
          devoteeName: row.devoteeName || getDevoteeName(row.devoteeId),
          activityId: row.activityId,
          activityName: row.activityName || getActivityName(row.activityId),
          booksWorth: 0,
          devotionalWorth: 0,
          worth: 0,
          complimentaryQty: 0
        };
      }
      index[key].complimentaryQty += Number(row.complimentaryQty || 0);
      const worth = Number(row.complimentaryQty || 0) * getBookSalePrice(row.bookId);
      if (String(row.itemGroup || "BOOK").toUpperCase() === "BOOK") {
        index[key].booksWorth += worth;
      } else {
        index[key].devotionalWorth += worth;
      }
      index[key].worth += worth;
    });
    return Object.keys(index)
      .map((key) => index[key])
      .sort((a, b) => a.devoteeName.localeCompare(b.devoteeName) || a.activityName.localeCompare(b.activityName));
  }

  function complimentaryActivitySummaryMarkup(rows) {
    const summaryRows = complimentaryActivitySummaryRows(rows);
    const totalWorth = summaryRows.reduce((sum, row) => sum + Number(row.worth || 0), 0);
    return `
      <div class="table-wrap">
        <table>
          <thead>
          <tr>
            <th>SNo</th>
            <th>Devotee Name</th>
            <th>Activity Name</th>
            <th>Books Worth</th>
            <th>Devotional Worth</th>
            <th>Action</th>
          </tr>
          </thead>
          <tbody>
            <tr class="worth-row">
              <td colspan="3"><strong>Worth</strong></td>
              <td><strong>${money(summaryRows.reduce((sum, row) => sum + Number(row.booksWorth || 0), 0))}</strong></td>
              <td><strong>${money(summaryRows.reduce((sum, row) => sum + Number(row.devotionalWorth || 0), 0))}</strong></td>
              <td></td>
            </tr>
            ${summaryRows.map((row, index) => `
              <tr>
                <td>${index + 1}</td>
                <td>${escapeHtml(row.devoteeName || row.devoteeId || "-")}</td>
                <td>${escapeHtml(row.activityName || row.activityId || "-")}</td>
                <td><strong>${money(row.booksWorth || 0)}</strong></td>
                <td><strong>${money(row.devotionalWorth || 0)}</strong></td>
                <td><button class="small-button" type="button" onclick="window.erpApp.showComplimentaryActivityDetails('${escapeAttribute(row.activityId)}')">Show Details</button></td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function complimentaryActivityDetailRows(rows, activityId) {
    const filtered = rows.filter((row) => row.activityId === activityId);
    const index = {};
    filtered.forEach((row) => {
      if (!index[row.bookId]) {
        index[row.bookId] = {
          bookId: row.bookId,
          bookName: row.bookName || getBookName(row.bookId),
          itemGroup: row.itemGroup || "BOOK",
          complimentaryQty: 0
        };
      }
      index[row.bookId].complimentaryQty += Number(row.complimentaryQty || 0);
    });
    return Object.keys(index)
      .map((bookId) => index[bookId])
      .sort((a, b) => a.bookName.localeCompare(b.bookName) || a.bookId.localeCompare(b.bookId));
  }

  function complimentaryActivityDetailMarkup(rows, activityId) {
    const detailRows = complimentaryActivityDetailRows(rows, activityId);
    const totalComplimentary = rows.reduce((sum, row) => sum + Number(row.complimentaryQty || 0), 0);
    const selectedActivity = rows.find((row) => row.activityId === activityId);
    if (!selectedActivity) {
      return '<div class="empty-state">Complimentary activity not found.</div>';
    }
    return `
      <div class="grid metrics reports-metrics activity-report-metrics">
        ${metric("Total Complimentary Qty of All Activities", totalComplimentary, "All complimentary quantities currently on record")}
        ${metric("Selected Activity", selectedActivity.activityName || selectedActivity.activityId, "Book-wise complimentary details below")}
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ERP Code</th>
              <th>Book Name</th>
              <th>Category</th>
              <th>Complimentary Quantity</th>
              <th>Total Complimentary Qty of all activities</th>
            </tr>
          </thead>
          <tbody>
            <tr class="worth-row">
              <td colspan="3"><strong>Worth</strong></td>
              <td><strong>${Number(detailRows.reduce((sum, row) => sum + Number(row.complimentaryQty || 0), 0))}</strong></td>
              <td><strong>${Number(totalComplimentary)}</strong></td>
            </tr>
            ${detailRows.map((row) => `
              <tr>
                <td>${escapeHtml(row.bookId)}</td>
                <td>${escapeHtml(row.bookName)}</td>
                <td>${escapeHtml(row.itemGroup || "BOOK")}</td>
                <td><strong>${Number(row.complimentaryQty || 0)}</strong></td>
                <td>${Number(totalComplimentary)}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function downloadUnsettledIssuesReport() {
    const rows = state.activityUnsettled || [];
    if (!rows.length) {
      showToast("Load an unsettled report first");
      return;
    }
    const html = buildActivityPivotExcel({
      title: "Unsettled Issues",
      rows,
      summaryRows: unsettledActivitySummaryRows(rows),
      quantityField: "unsettledQty",
      filePrefix: "unsettled-issues"
    });
    downloadHtmlExcel(html, `unsettled-issues-${state.reportMonth || "report"}.xls`);
  }

  function downloadComplimentaryIssuesReport() {
    const rows = state.activityComplimentary || [];
    if (!rows.length) {
      showToast("Load a complimentary report first");
      return;
    }
    const html = buildActivityPivotExcel({
      title: "Complimentary Issues",
      rows,
      summaryRows: complimentaryActivitySummaryRows(rows),
      quantityField: "complimentaryQty",
      filePrefix: "complimentary-issues"
    });
    downloadHtmlExcel(html, `complimentary-issues-${state.reportMonth || "report"}.xls`);
  }

  function buildActivityPivotExcel(config) {
    const rows = Array.isArray(config.rows) ? config.rows : [];
    const summaryRows = Array.isArray(config.summaryRows) ? config.summaryRows : [];
    const quantityField = config.quantityField || "unsettledQty";
    const activityList = summaryRows
      .slice()
      .sort((a, b) => String(a.devoteeName || "").localeCompare(String(b.devoteeName || "")) || String(a.activityName || "").localeCompare(String(b.activityName || "")));
    const activityIds = activityList.map((row) => row.activityId);
    const activeBooks = [...state.books, ...state.devotionalItems]
      .slice()
      .sort((a, b) => {
        const groupA = String(a.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
        const groupB = String(b.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
        return groupA - groupB
          || String(getBookName(a.erpCode || a.bookId)).localeCompare(String(getBookName(b.erpCode || b.bookId)))
          || String(a.erpCode || a.bookId).localeCompare(String(b.erpCode || b.bookId));
      });
    const bookIndex = {};
    const activityIndex = {};

    rows.forEach((row) => {
      const bookId = String(row.bookId || "").trim();
      const activityId = String(row.activityId || "").trim();
      if (!bookId || !activityId) {
        return;
      }
      if (!bookIndex[bookId]) {
        bookIndex[bookId] = {
          bookId,
          bookName: row.bookName || getBookName(bookId),
          salePrice: getBookSalePrice(bookId),
          quantities: {}
        };
      }
      if (!activityIndex[activityId]) {
        activityIndex[activityId] = {
          devoteeName: row.devoteeName || getDevoteeName(row.devoteeId),
          activityName: row.activityName || getActivityName(activityId)
        };
      }
      bookIndex[bookId].quantities[activityId] = Number(row[quantityField] || 0);
    });

    activeBooks.forEach((book) => {
      const bookId = book.erpCode || book.bookId;
      if (!bookIndex[bookId]) {
        bookIndex[bookId] = {
          bookId,
          bookName: getBookName(bookId),
          salePrice: getBookSalePrice(bookId),
          quantities: {}
        };
      }
    });

    const books = Object.values(bookIndex).sort((a, b) => {
      return String(a.bookName).localeCompare(String(b.bookName)) || String(a.bookId).localeCompare(String(b.bookId));
    });

    const worthTotals = activityIds.reduce((acc, activityId) => {
      acc[activityId] = 0;
      return acc;
    }, {});
    let overallWorth = 0;
    const rowsHtml = books.map((book) => {
      const qtyCells = activityIds.map((activityId) => {
        const qty = Number(book.quantities[activityId] || 0);
        worthTotals[activityId] = (worthTotals[activityId] || 0) + qty * Number(book.salePrice || 0);
        overallWorth += qty * Number(book.salePrice || 0);
        return `<td>${escapeHtml(String(qty))}</td>`;
      }).join("");
      return `
        <tr>
          <td>${escapeHtml(book.bookId)}</td>
          <td>${escapeHtml(book.bookName)}</td>
          <td>${escapeHtml(getItemGroupLabel(book.itemGroup || "BOOK"))}</td>
          <td>${escapeHtml(String(book.salePrice || 0))}</td>
          ${qtyCells}
        </tr>
      `;
    }).join("");

    const headerCells = [
      "<th rowspan=\"2\">ERP Code</th>",
      "<th rowspan=\"2\">Book Name</th>",
      "<th rowspan=\"2\">Category</th>",
      "<th rowspan=\"2\">Sale Price</th>",
      `<th colspan="${Math.max(activityIds.length, 1)}">Activities</th>`
    ];
    const secondRow = activityIds.length
      ? `<tr>${activityIds.map((activityId) => {
          const meta = activityIndex[activityId] || {};
          const label = meta.activityName || activityId;
          const devotee = meta.devoteeName ? ` (${meta.devoteeName})` : "";
          return `<th>${escapeHtml(label + devotee)}</th>`;
        }).join("")}</tr>`
      : `<tr><th>No activities found</th></tr>`;
    const worthRow = `
      <tr class="worth-row">
        <td colspan="4"><strong>Worth</strong></td>
        ${activityIds.map((activityId) => `<td><strong>${money(worthTotals[activityId] || 0)}</strong></td>`).join("")}
      </tr>
    `;

    return `
      <html>
        <head>
          <meta charset="utf-8">
          <style>
            table { border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 11px; }
            th, td { border: 1px solid #999; padding: 4px 6px; vertical-align: top; }
            th { background: #e9edf5; }
          </style>
        </head>
        <body>
          <table>
            <thead>
              <tr>${headerCells.join("")}</tr>
              ${secondRow}
            </thead>
            <tbody>
              ${worthRow}
              ${rowsHtml}
              <tr class="worth-row">
                <td colspan="4"><strong>Total Worth</strong></td>
                <td colspan="${Math.max(activityIds.length, 1)}"><strong>${money(overallWorth)}</strong></td>
              </tr>
            </tbody>
          </table>
        </body>
      </html>
    `;
  }

  function downloadHtmlExcel(html, filename) {
    const blob = new Blob([html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function activityComplimentaryTable(rows) {
    return complimentaryActivitySummaryMarkup(rows);
  }

  function getDocumentLineByKind(kind, index) {
    if (kind === "issue") return state.issueLines[index];
    if (kind === "sale") return state.saleLines[index];
    if (kind === "receive") return state.receiveLines[index];
    if (kind === "transfer") return state.transferLines[index];
    if (kind === "opening") return state.openingLines[index];
    if (kind === "unsettled") return state.unsettledLines[index];
    return null;
  }

  function rerenderDocumentModal(kind, index, value) {
    if (kind === "issue") {
      renderIssueModal();
    } else if (kind === "sale") {
      renderSaleModal();
    } else if (kind === "receive") {
      renderReceiveModal();
    } else if (kind === "transfer") {
      renderTransferModal();
    } else if (kind === "opening") {
      renderOpeningStockModal();
    } else if (kind === "unsettled") {
      renderUnsettledOpeningModal();
    }
    if (index === undefined) {
      return;
    }
    requestAnimationFrame(function () {
      const selector = '[data-book-picker="' + kind + '-' + index + '"]';
      const input = document.querySelector(selector);
      if (input) {
        input.focus();
        if (typeof value === "string") {
          input.setSelectionRange(value.length, value.length);
        }
      }
    });
  }

  function getIssuedActivityOptions() {
    return state.activities.filter((activity) => state.documents.some((document) => document.activityId === activity.activityId && (document.documentType === "ISSUE" || document.documentType === "UNSETTLED_OPENING")));
  }

  function isMainAdmin() {
    return (state.currentUser && state.currentUser.role === "mainAdmin") || appConfig.currentUserRole === "mainAdmin";
  }

  function getActivityName(activityId) {
    const activity = state.activities.find((item) => item.activityId === activityId);
    return activity ? activity.name : activityId || "-";
  }

  async function setReportView(value) {
    state.reportView = value;
    state.warehouseMonthlyReport = null;
    state.activityMonthlyReport = null;
    state.showWarehouseDayWiseSales = false;
    state.unsettledReportActivityId = "";
    state.complimentaryReportActivityId = "";
    content.innerHTML = renderReportsMarkup();
  }

  async function setReportWarehouse(value) {
    state.reportWarehouseId = value;
    state.warehouseMonthlyReport = null;
    state.showWarehouseDayWiseSales = false;
    content.innerHTML = renderReportsMarkup();
  }

  async function setReportMonth(value) {
    state.reportMonth = value;
    state.warehouseMonthlyReport = null;
    state.activityMonthlyReport = null;
    state.showWarehouseDayWiseSales = false;
    state.unsettledReportActivityId = "";
    state.complimentaryReportActivityId = "";
    content.innerHTML = renderReportsMarkup();
  }

  async function setActivityReportDevoteeSearch(value) {
    state.activityReportDevoteeSearch = value;
    content.innerHTML = renderReportsMarkup();
    const input = document.getElementById("activityReportDevoteeSearch");
    if (input) {
      input.focus();
      input.setSelectionRange(value.length, value.length);
    }
  }

  async function setActivityReportActivitySearch(value) {
    state.activityReportActivitySearch = value;
    content.innerHTML = renderReportsMarkup();
    const input = document.getElementById("activityReportActivitySearch");
    if (input) {
      input.focus();
      input.setSelectionRange(value.length, value.length);
    }
  }

  async function selectActivityReportDevotee(devoteeId) {
    state.activityReportDevoteeId = devoteeId;
    state.activityReportDevoteeSearch = getDevoteeName(devoteeId);
    state.activityReportActivityId = "";
    state.activityReportActivitySearch = "";
    state.activityMonthlyReport = null;
    content.innerHTML = renderReportsMarkup();
  }

  async function selectActivityReportActivity(activityId) {
    const activity = state.activities.find((item) => item.activityId === activityId);
    state.activityReportActivityId = activityId;
    state.activityReportActivitySearch = activity ? activity.name : activityId;
    state.activityMonthlyReport = null;
    content.innerHTML = renderReportsMarkup();
  }

  async function loadWarehouseReport(showDayWise = false) {
    if (!state.reportWarehouseId || !state.reportMonth) {
      showToast("Select a warehouse and month first");
      return;
    }

    setLoading(true);
    try {
      const report = await window.erpApi.request("reports.warehouseMonthly", {
        warehouseId: state.reportWarehouseId,
        month: state.reportMonth
      });
      state.warehouseMonthlyReport = normalizeWarehouseMonthlyReport(report);
      state.showWarehouseDayWiseSales = showDayWise;
      content.innerHTML = renderReportsMarkup();
    } catch (error) {
      state.warehouseMonthlyReport = null;
      state.showWarehouseDayWiseSales = false;
      content.innerHTML = renderReportsMarkup();
      showToast(error.message || "Could not load warehouse report");
    } finally {
      setLoading(false);
    }
  }

  function loadWarehouseDayWiseSales() {
    return loadWarehouseReport(true);
  }

  async function loadActivityReport() {
    if (!state.activityReportDevoteeId || !state.activityReportActivityId || !state.reportMonth) {
      showToast("Select a devotee, activity, and month first");
      return;
    }

    setLoading(true);
    try {
      const report = await window.erpApi.request("reports.activityMonthly", {
        devoteeId: state.activityReportDevoteeId,
        activityId: state.activityReportActivityId,
        month: state.reportMonth
      });
      state.activityMonthlyReport = normalizeActivityMonthlyReport(report);
      content.innerHTML = renderReportsMarkup();
    } catch (error) {
      state.activityMonthlyReport = null;
      content.innerHTML = renderReportsMarkup();
      showToast(error.message || "Could not load activity report");
    } finally {
      setLoading(false);
    }
  }

  function showUnsettledActivityDetails(activityId) {
    state.unsettledReportActivityId = activityId;
    content.innerHTML = renderReportsMarkup();
  }

  function backToUnsettledSummary() {
    state.unsettledReportActivityId = "";
    content.innerHTML = renderReportsMarkup();
  }

  function showComplimentaryActivityDetails(activityId) {
    state.complimentaryReportActivityId = activityId;
    content.innerHTML = renderReportsMarkup();
  }

  function backToComplimentarySummary() {
    state.complimentaryReportActivityId = "";
    content.innerHTML = renderReportsMarkup();
  }

  async function settleActivity(activityId) {
    const activity = state.activities.find((item) => item.activityId === activityId);
    if (!activity) {
      showToast("Activity not found");
      return;
    }

    if (!confirm(`Settle activity "${activity.name}" now?`)) {
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request("activities.update", {
        activityId: activity.activityId,
        name: activity.name,
        type: activity.type,
        devoteeId: activity.devoteeId,
        startDate: activity.startDate,
        endDate: activity.endDate,
        warehouseId: activity.warehouseId,
        spoc: activity.spoc,
        status: "Completed"
      });
      state.activities = state.activities.map((item) => item.activityId === activityId ? { ...item, status: "Completed" } : item);
      content.innerHTML = renderReportsMarkup();
      showToast("Activity settled");
    } catch (error) {
      showToast(error.message || "Could not settle activity");
    } finally {
      setLoading(false);
    }
  }

  function documentTone(documentType) {
    const toneByType = {
      OPENING: "good",
      UNSETTLED_OPENING: "good",
      RECEIVE: "good",
      PURCHASE: "good",
      RETURN: "good",
      TRANSFER: "warn",
      ISSUE: "warn",
      COMPLIMENTARY: "bad",
      SALE: "bad",
      ADJUSTMENT: "warn"
    };
    return toneByType[documentType] || "warn";
  }

  function buildWarehouseWorthTotals(report, transferTargets) {
    const totals = {
      opening: 0,
      sales: 0,
      complimentary: 0,
      unsettled: 0,
      closing: 0,
      transferIn: 0,
      transferMap: {},
      dayMap: {}
    };

    if (!report || !report.rows) {
      return totals;
    }

    report.rows.forEach((row) => {
      const price = getBookSalePrice(row.bookId);
      totals.opening += Number(row.openingQty || 0) * price;
      totals.sales += Number(row.saleQty || 0) * price;
      totals.complimentary += Number(row.complimentaryQty || 0) * price;
      totals.unsettled += Number(row.unsettledQty || 0) * price;
      totals.closing += Number(row.closingQty || 0) * price;
      if (report.reportMode === "main") {
        transferTargets.forEach((warehouse) => {
          totals.transferMap[warehouse.name] = (totals.transferMap[warehouse.name] || 0) + Number(((row.transferMap || {})[warehouse.name]) || 0) * price;
        });
      } else {
        totals.transferIn += Number(row.transferInQty || 0) * price;
      }
      report.dayColumns.forEach((day) => {
        totals.dayMap[day] = (totals.dayMap[day] || 0) + Number((row.daySalesMap && row.daySalesMap[day]) || 0) * price;
      });
    });

    return totals;
  }

  function buildWarehouseWorthRow(report, transferTargets, totals) {
    const isMain = report.reportMode === "main";
    const cells = isMain
      ? `${transferTargets.map((warehouse) => `<td>${money(totals.transferMap[warehouse.name] || 0)}</td>`).join("")}<td>${money(totals.sales)}</td><td>${money(totals.complimentary)}</td><td>${money(totals.unsettled)}</td><td><strong>${money(totals.closing)}</strong></td>`
      : `<td>${money(totals.transferIn)}</td><td>${money(totals.sales)}</td><td><strong>${money(totals.closing)}</strong></td>`;
    return `<tr class="worth-row"><td colspan="3"><strong>Worth</strong></td><td>${money(totals.opening)}</td>${cells}</tr>`;
  }

  function buildWarehouseWorthExcelRow(report, transferTargets, totals) {
    const isMain = report.reportMode === "main";
    const dayCells = !isMain
      ? report.dayColumns.map((day) => `<td>${escapeHtml(String((totals.dayMap || {})[day] || 0))}</td>`).join("")
      : "";
    const cells = isMain
      ? `${transferTargets.map((warehouse) => `<td>${escapeHtml(String(totals.transferMap[warehouse.name] || 0))}</td>`).join("")}<td>${escapeHtml(String(totals.sales || 0))}</td><td>${escapeHtml(String(totals.complimentary || 0))}</td><td>${escapeHtml(String(totals.unsettled || 0))}</td><td>${escapeHtml(String(totals.closing || 0))}</td>`
      : `<td>${escapeHtml(String(totals.transferIn || 0))}</td><td>${escapeHtml(String(totals.sales || 0))}</td><td>${escapeHtml(String(totals.closing || 0))}</td>${dayCells}`;
    return `<tr><td colspan="3"><strong>Worth</strong></td><td>${escapeHtml(String(totals.opening || 0))}</td>${cells}</tr>`;
  }

  function openIssueForm() {
    void ensureDocumentItemMastersLoaded().catch(() => {});
    state.issueDocumentType = "ISSUE";
    state.issueDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      fromWarehouseId: "",
      activityId: "",
      notes: "",
      itemGroup: normalizeItemGroup(state.documentEntryGroup || "BOOK")
    };
    state.issueLines = [blankIssueLine()];
    state.issueBookQueries = [""];
    renderIssueModal();
    refreshCurrentStockForOpenDocumentModal();
  }

  function openComplimentaryForm() {
    void ensureDocumentItemMastersLoaded().catch(() => {});
    state.issueDocumentType = "COMPLIMENTARY";
    state.issueDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      fromWarehouseId: "",
      activityId: "",
      notes: "",
      itemGroup: normalizeItemGroup(state.documentEntryGroup || "BOOK")
    };
    state.issueLines = [blankIssueLine()];
    state.issueBookQueries = [""];
    renderIssueModal();
    refreshCurrentStockForOpenDocumentModal();
  }

  function blankIssueLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function openSaleForm() {
    void ensureDocumentItemMastersLoaded().catch(() => {});
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active && (warehouse.name || "").toLowerCase().indexOf("gmb") !== 0);
    state.saleDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      warehouseId: activeWarehouses[0]?.warehouseId || "",
      notes: "",
      itemGroup: normalizeItemGroup(state.documentEntryGroup || "BOOK")
    };
    state.saleLines = [blankSaleLine()];
    state.saleBookQueries = [""];
    renderSaleModal();
    refreshCurrentStockForOpenDocumentModal();
  }

  function blankSaleLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function openOpeningStockForm() {
    void ensureDocumentItemMastersLoaded().catch(() => {});
    state.openingDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      toWarehouseId: state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || "",
      notes: "Opening stock as on date",
      itemGroup: normalizeItemGroup(state.documentEntryGroup || "BOOK")
    };
    state.openingLines = [blankOpeningLine()];
    state.openingBookQueries = [""];
    renderOpeningStockModal();
  }

  function blankOpeningLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function openPurchaseForm() {
    void ensureDocumentItemMastersLoaded().catch(() => {});
    state.purchaseDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      toWarehouseId: state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || state.warehouses[0]?.warehouseId || "",
      notes: "",
      itemGroup: normalizeItemGroup(state.documentEntryGroup || "BOOK")
    };
    state.purchaseLines = [blankPurchaseLine()];
    state.purchaseImportName = "";
    renderPurchaseModal();
  }

  function blankPurchaseLine() {
    return {
      erpCode: "",
      bookName: "",
      bookType: "",
      quantity: 1,
      purchasePrice: 0,
      salePrice: 0
    };
  }

  function renderPurchaseModal() {
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const draft = state.purchaseDraft;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="purchaseFormTitle">
        <div class="modal-header">
          <h2 id="purchaseFormTitle">Purchase Input</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="purchaseForm">
          <label class="field">
            <span>Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
          </label>
          <label class="field">
            <span>Warehouse</span>
            <select name="toWarehouseId" required>
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.toWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          ${renderDocumentItemGroupField("purchase", draft)}
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Purchase or input stock note">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>${getItemGroupLabel(draft.itemGroup)} lines</h3>
              <div class="row-actions">
                <button class="small-button" type="button" onclick="window.erpApp.downloadPurchaseSample()">Download Sample</button>
                <button class="small-button" type="button" onclick="document.getElementById('purchaseImportInput').click()">Import Excel</button>
                <button class="small-button" type="button" onclick="window.erpApp.addPurchaseLine()">Add Line</button>
              </div>
            </div>
            <input id="purchaseImportInput" type="file" accept=".csv,.xlsx,.xls" style="display:none" onchange="window.erpApp.importPurchaseFile(this.files[0])">
            <div class="metric-note" style="margin-bottom:10px;">Leave ERP Code blank for new ${getItemGroupSingularLabel(draft.itemGroup).toLowerCase()}s. If the name does not already exist, it will be created automatically on save.</div>
            ${purchaseLinesMarkup(draft.itemGroup)}
            ${state.purchaseImportName ? `<div class="metric-note" style="margin-top:8px;">Loaded from ${escapeHtml(state.purchaseImportName)}</div>` : ""}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${state.purchaseLines.length ? "" : "disabled"}>Post Purchase Input</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("purchaseForm").addEventListener("submit", savePurchaseDocument);
  }

  function purchaseLinesMarkup(itemGroup) {
    const singular = getItemGroupSingularLabel(itemGroup);
    return `
      <div class="line-table purchase-lines">
        ${state.purchaseLines.map((line, index) => `
          <div class="line-row purchase-line-row">
            <label class="field">
              <span>ERP Code</span>
              <input type="text" value="${escapeAttribute(line.erpCode || "")}" placeholder="Optional" oninput="window.erpApp.updatePurchaseLine(${index}, 'erpCode', this.value)">
            </label>
            <label class="field">
              <span>${singular} Name</span>
              <input type="text" value="${escapeAttribute(line.bookName || "")}" placeholder="Enter ${singular.toLowerCase()} name" oninput="window.erpApp.updatePurchaseLine(${index}, 'bookName', this.value)">
            </label>
            <label class="field">
              <span>${singular} Type</span>
              <input type="text" value="${escapeAttribute(line.bookType || "")}" placeholder="General" oninput="window.erpApp.updatePurchaseLine(${index}, 'bookType', this.value)">
            </label>
            <label class="field">
              <span>Qty</span>
              <input type="number" min="1" step="1" value="${escapeAttribute(line.quantity)}" oninput="window.erpApp.updatePurchaseLine(${index}, 'quantity', this.value)" required>
            </label>
            <label class="field">
              <span>Purchase</span>
              <input type="number" min="0" step="0.01" value="${escapeAttribute(line.purchasePrice)}" oninput="window.erpApp.updatePurchaseLine(${index}, 'purchasePrice', this.value)">
            </label>
            <label class="field">
              <span>Sale</span>
              <input type="number" min="0" step="0.01" value="${escapeAttribute(line.salePrice)}" oninput="window.erpApp.updatePurchaseLine(${index}, 'salePrice', this.value)">
            </label>
            <button class="small-button danger line-remove purchase-remove" type="button" onclick="window.erpApp.removePurchaseLine(${index})">Remove</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function addPurchaseLine() {
    syncPurchaseDraft();
    state.purchaseLines.push(blankPurchaseLine());
    renderPurchaseModal();
  }

  function removePurchaseLine(index) {
    syncPurchaseDraft();
    state.purchaseLines.splice(index, 1);
    if (!state.purchaseLines.length) {
      state.purchaseLines.push(blankPurchaseLine());
    }
    renderPurchaseModal();
  }

  function updatePurchaseLine(index, key, value) {
    if (!state.purchaseLines[index]) return;
    if (key === "quantity" || key === "purchasePrice" || key === "salePrice") {
      state.purchaseLines[index][key] = Number(value || 0);
      return;
    }
    state.purchaseLines[index][key] = value;
  }

  function syncPurchaseDraft() {
    const form = document.getElementById("purchaseForm");
    if (!form) return;
    const data = new FormData(form);
    state.purchaseDraft = {
      documentDate: data.get("documentDate") || new Date().toISOString().slice(0, 10),
      toWarehouseId: data.get("toWarehouseId") || "",
      notes: data.get("notes") || "",
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.purchaseDraft.itemGroup || "BOOK")
    };
  }

  function downloadPurchaseSample() {
    const singular = getItemGroupSingularLabel(state.purchaseDraft.itemGroup || "BOOK");
    const rows = [
      ["ERP Code", `${singular} Name`, `${singular} Type`, "Purchase Price", "Sale Price", "Quantity"],
      ["", singular === "Item" ? "Incense Sticks" : "Bhagavad Gita", "General", "50", "60", "100"]
    ];
    if (window.XLSX && window.XLSX.utils) {
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, "Purchase Input");
      window.XLSX.writeFile(workbook, "purchase-input-sample.xlsx");
      return;
    }
    const csv = rows.map((row) => row.map((cell) => {
      const text = String(cell || "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "purchase-input-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadBookSample() {
    const rows = [
      ["ERP Code", "Book Name", "Book Type", "Purchase Price", "Sale Price"],
      ["PRB-00074", "Tel - Bhagavad Gita", "Maha Big Books", "197.56", "350"]
    ];
    if (window.XLSX && window.XLSX.utils) {
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, "Book Master");
      window.XLSX.writeFile(workbook, "book-master-sample.xlsx");
      return;
    }
    const csv = rows.map((row) => row.map((cell) => {
      const text = String(cell || "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "book-master-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadDevotionalItemSample() {
    const rows = [
      ["ERP Code", "Book Name", "Book Type", "Purchase Price", "Sale Price"],
      ["DVA-0001", "Incense Sticks", "Puja Items", "25", "40"]
    ];
    if (window.XLSX && window.XLSX.utils) {
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, "Devotional Items");
      window.XLSX.writeFile(workbook, "devotional-items-sample.xlsx");
      return;
    }
    const csv = rows.map((row) => row.map((cell) => {
      const text = String(cell || "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "devotional-items-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importBookFile(file) {
    if (!file) return;
    try {
      const name = file.name || "import";
      const lower = name.toLowerCase();
      let rows = [];
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        if (!window.XLSX) {
          showToast("Excel import library is not loaded");
          return;
        }
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const sheet = workbook.SheetNames[0];
        rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
      } else {
        const text = await file.text();
        rows = parseCsvRows(text);
      }

      const books = rows.map((row) => ({
        erpCode: String(row["ERP Code"] || row.erpCode || row["ERP"] || "").trim(),
        name: String(row["Book Name"] || row.bookName || row["Name"] || "").trim(),
        bookType: String(row["Book Type"] || row.bookType || row["Type"] || "General").trim() || "General",
        purchasePrice: Number(row["Purchase Price"] || row.purchasePrice || row["Distributor Price"] || 0),
        salePrice: Number(row["Sale Price"] || row.salePrice || row.mrp || 0),
        active: true
      })).filter((row) => row.name || row.erpCode);

      if (!books.length) {
        showToast("No books found in the file");
        return;
      }

      setLoading(true);
      try {
        await window.erpApi.request("books.bulkUpsert", { books });
        state.books = await window.erpApi.request(isMainAdmin() ? "books.adminList" : "books.list");
        content.innerHTML = renderBooksMarkup();
        showToast(`Imported ${books.length} books`);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      showToast(error.message || "Could not read the import file");
    } finally {
      const input = document.getElementById("bookImportInput");
      if (input) {
        input.value = "";
      }
    }
  }

  async function importDevotionalItemFile(file) {
    if (!file) return;
    try {
      const name = file.name || "import";
      const lower = name.toLowerCase();
      let rows = [];
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        if (!window.XLSX) {
          showToast("Excel import library is not loaded");
          return;
        }
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const sheet = workbook.SheetNames[0];
        rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
      } else {
        const text = await file.text();
        rows = parseCsvRows(text);
      }

      const items = rows.map((row) => ({
        erpCode: String(row["ERP Code"] || row.erpCode || row["ERP"] || "").trim(),
        name: String(row["Book Name"] || row["Item Name"] || row.name || row["Name"] || "").trim(),
        bookType: String(row["Book Type"] || row["Item Type"] || row.bookType || row.category || "General").trim() || "General",
        purchasePrice: Number(row["Purchase Price"] || row.purchasePrice || row["Distributor Price"] || 0),
        salePrice: Number(row["Sale Price"] || row.salePrice || row.mrp || 0),
        active: true
      })).filter((row) => row.name || row.erpCode);

      if (!items.length) {
        showToast("No devotional items found in the file");
        return;
      }

      setLoading(true);
      try {
        await window.erpApi.request("items.bulkUpsert", { itemGroup: "PARAPHERNALIA", items });
        state.devotionalItems = await window.erpApi.request("items.list", { itemGroup: "PARAPHERNALIA" });
        content.innerHTML = renderDevotionalItemsMarkup();
        showToast(`Imported ${items.length} devotional items`);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      showToast(error.message || "Could not read the import file");
    } finally {
      const input = document.getElementById("devotionalImportInput");
      if (input) {
        input.value = "";
      }
    }
  }

  async function importPurchaseFile(file) {
    if (!file) return;
    try {
      const name = file.name || "import";
      const lower = name.toLowerCase();
      let rows = [];
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        if (!window.XLSX) {
          showToast("Excel import library is not loaded");
          return;
        }
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const sheet = workbook.SheetNames[0];
        rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
      } else {
        const text = await file.text();
        rows = parseCsvRows(text);
      }

      state.purchaseLines = rows.map((row) => ({
        erpCode: String(row["ERP Code"] || row.erpCode || row["ERP"] || "").trim(),
        bookName: String(row["Book Name"] || row.bookName || row["Name"] || "").trim(),
        bookType: String(row["Book Type"] || row.bookType || row["Type"] || "General").trim() || "General",
        quantity: Number(row["Quantity"] || row.quantity || 0),
        purchasePrice: Number(row["Purchase Price"] || row.purchasePrice || row["Distributor Price"] || row.rate || 0),
        salePrice: Number(row["Sale Price"] || row.salePrice || row.mrp || 0)
      })).filter((row) => row.bookName || row.erpCode);
      if (!state.purchaseLines.length) {
        state.purchaseLines = [blankPurchaseLine()];
        showToast("No purchase rows found in the file");
      }
      state.purchaseImportName = file.name;
      renderPurchaseModal();
    } catch (error) {
      showToast(error.message || "Could not read the import file");
    } finally {
      const input = document.getElementById("purchaseImportInput");
      if (input) {
        input.value = "";
      }
    }
  }

  function parseCsvRows(text) {
    const lines = String(text || "").trim().split(/\r?\n/).filter(Boolean);
    if (!lines.length) return [];
    const headers = splitCsvLine(lines[0]).map((header) => header.trim());
    return lines.slice(1).map((line) => {
      const values = splitCsvLine(line);
      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] !== undefined ? values[index] : "";
      });
      return row;
    });
  }

  function splitCsvLine(line) {
    const values = [];
    let current = "";
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"' && quoted && next === '"') {
        current += '"';
        index += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === ',' && !quoted) {
        values.push(current);
        current = "";
      } else {
        current += char;
      }
    }
    values.push(current);
    return values;
  }

  async function savePurchaseDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = state.purchaseLines
      .filter((line) => (line.bookName || line.erpCode) && Number(line.quantity || 0) > 0)
      .map((line) => ({
        bookId: line.erpCode ? String(line.erpCode).trim() : "",
        erpCode: line.erpCode ? String(line.erpCode).trim() : "",
        bookName: String(line.bookName || "").trim(),
        bookType: String(line.bookType || "General").trim() || "General",
        quantity: Number(line.quantity),
        purchasePrice: Number(line.purchasePrice || 0),
        salePrice: Number(line.salePrice || 0),
        rate: Number(line.purchasePrice || 0)
      }));

    if (!lines.length) {
      showToast("Add at least one purchase line");
      return;
    }

    const payload = {
      documentType: "PURCHASE",
      documentDate: data.get("documentDate"),
      toWarehouseId: data.get("toWarehouseId"),
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.purchaseDraft.itemGroup || "BOOK"),
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      invalidateCurrentStockCache();
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Purchase input posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post purchase input");
    } finally {
      setLoading(false);
    }
  }

  function renderOpeningStockModal() {
    const itemGroup = normalizeItemGroup(state.openingDraft.itemGroup || "BOOK");
    const activeBooks = getDocumentItemsForGroup(itemGroup);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const draft = state.openingDraft;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="openingFormTitle">
        <div class="modal-header">
          <h2 id="openingFormTitle">Opening Stock</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="openingForm">
          <label class="field">
            <span>Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
          </label>
          <label class="field">
            <span>Warehouse</span>
            <select name="toWarehouseId" required>
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.toWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          ${renderDocumentItemGroupField("opening", draft)}
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Opening stock note">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>${getItemGroupLabel(itemGroup)}</h3>
              <div class="row-actions">
                <button class="small-button" type="button" onclick="window.erpApp.downloadOpeningSample()">Download Sample</button>
                <button class="small-button" type="button" onclick="document.getElementById('openingImportInput').click()">Import Excel</button>
                <button class="small-button" type="button" onclick="window.erpApp.addOpeningLine()">Add Line</button>
              </div>
            </div>
            <input id="openingImportInput" type="file" accept=".csv,.xlsx,.xls" style="display:none" onchange="window.erpApp.importOpeningFile(this.files[0])">
            ${activeBooks.length ? openingLinesMarkup(activeBooks, itemGroup) : `<div class="empty-state">Add active ${getItemGroupLabel(itemGroup).toLowerCase()} before posting opening stock.</div>`}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${activeBooks.length ? "" : "disabled"}>Post Opening Stock</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("openingForm").addEventListener("submit", saveOpeningStock);
  }

  function openingLinesMarkup(activeBooks, itemGroup) {
    return `
      <div class="line-table">
        ${state.openingLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("opening", index, activeBooks, line, state.openingBookQueries[index] || "", "", itemGroup)}
            <label class="field">
              <span>Qty</span>
              <input type="number" min="1" step="1" value="${escapeAttribute(line.quantity)}" onchange="window.erpApp.updateOpeningLine(${index}, 'quantity', this.value)" required>
            </label>
            <label class="field">
              <span>Cost</span>
              <input type="number" min="0" step="0.01" value="${escapeAttribute(line.rate)}" onchange="window.erpApp.updateOpeningLine(${index}, 'rate', this.value)">
            </label>
            <button class="small-button danger line-remove" type="button" onclick="window.erpApp.removeOpeningLine(${index})">Remove</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function addOpeningLine() {
    syncOpeningDraft();
    state.openingLines.push(blankOpeningLine());
    state.openingBookQueries.push("");
    renderOpeningStockModal();
  }

  function removeOpeningLine(index) {
    syncOpeningDraft();
    state.openingLines.splice(index, 1);
    state.openingBookQueries.splice(index, 1);
    if (!state.openingLines.length) {
      state.openingLines.push(blankOpeningLine());
      state.openingBookQueries.push("");
    }
    renderOpeningStockModal();
  }

  function updateOpeningLine(index, key, value) {
    if (!state.openingLines[index]) return;
    state.openingLines[index][key] = key === "bookId" ? value : Number(value || 0);
  }

  function syncOpeningDraft() {
    const form = document.getElementById("openingForm");
    if (!form) return;
    const data = new FormData(form);
    state.openingDraft = {
      documentDate: data.get("documentDate") || new Date().toISOString().slice(0, 10),
      toWarehouseId: data.get("toWarehouseId") || "",
      notes: data.get("notes") || "",
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.openingDraft.itemGroup || "BOOK")
    };
  }

  async function saveOpeningStock(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = state.openingLines
      .filter((line) => line.bookId && Number(line.quantity || 0) > 0)
      .map((line) => ({
        bookId: line.bookId,
        quantity: Number(line.quantity),
        rate: Number(line.rate || 0)
      }));

    if (!lines.length) {
      showToast("Add at least one book line");
      return;
    }

    const payload = {
      documentType: "OPENING",
      documentDate: data.get("documentDate"),
      toWarehouseId: data.get("toWarehouseId"),
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.openingDraft.itemGroup || "BOOK"),
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      invalidateCurrentStockCache();
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Opening stock posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post opening stock");
    } finally {
      setLoading(false);
    }
  }

  function downloadOpeningSample() {
    const singular = getItemGroupSingularLabel(state.openingDraft.itemGroup || "BOOK");
    const rows = [
      ["ERP Code", `${singular} Name`, "Qty", "Cost"],
      ["PRB-00074", singular === "Item" ? "Incense Sticks" : "Tel - Bhagavad Gita", "100", "197.56"],
      ["PRB-00072", singular === "Item" ? "Tulsi Mala" : "Tel - Beyond Birth and Death", "50", "12.50"]
    ];
    if (window.XLSX && window.XLSX.utils) {
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, "Opening Stock");
      window.XLSX.writeFile(workbook, "opening-stock-sample.xlsx");
      return;
    }
    const csv = rows.map((row) => row.map((cell) => {
      const text = String(cell || "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "opening-stock-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function downloadUnsettledOpeningSample() {
    const singular = getItemGroupSingularLabel(state.unsettledDraft.itemGroup || "BOOK");
    const activityHeaders = state.activities
      .filter((activity) => activity.status !== "Cancelled")
      .map((activity) => activity.name || activity.activityName || activity.activityId)
      .filter(Boolean)
      .slice(0, 8);
    const headers = ["ERP Code", `${singular} Name`, ...(activityHeaders.length ? activityHeaders : ["Activity 1", "Activity 2"])];
    const rows = [
      headers,
      ["PRB-00074", "Tel - Bhagavad Gita", ...(headers.slice(2).map((_, index) => (index === 0 ? "10" : "0")))],
      ["PRB-00072", "Tel - Beyond Birth and Death", ...(headers.slice(2).map((_, index) => (index === 1 ? "5" : "0")))]
    ];
    if (window.XLSX && window.XLSX.utils) {
      const sheet = window.XLSX.utils.aoa_to_sheet(rows);
      const workbook = window.XLSX.utils.book_new();
      window.XLSX.utils.book_append_sheet(workbook, sheet, "Unsettled Opening");
      window.XLSX.writeFile(workbook, "unsettled-opening-sample.xlsx");
      return;
    }
    const csv = rows.map((row) => row.map((cell) => {
      const text = String(cell || "");
      return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    }).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "unsettled-opening-sample.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  async function importOpeningFile(file) {
    if (!file) return;
    try {
      const name = file.name || "import";
      const lower = name.toLowerCase();
      let rows = [];
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        if (!window.XLSX) {
          showToast("Excel import library is not loaded");
          return;
        }
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const sheet = workbook.SheetNames[0];
        rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
      } else {
        const text = await file.text();
        rows = parseCsvRows(text);
      }

      const bookRows = rows.map((row) => {
        const erpCode = String(row["ERP Code"] || row.erpCode || row["ERP"] || "").trim();
        const bookName = String(row["Book Name"] || row.bookName || row["Name"] || "").trim();
        const book = erpCode ? getBook(erpCode) : (bookName ? state.books.find((item) => String(item.name || "").trim().toLowerCase() === bookName.toLowerCase()) || {} : {});
        return {
          bookId: book.erpCode || book.bookId || erpCode || "",
          quantity: Number(row["Qty"] || row.qty || row.quantity || 0),
          rate: Number(row["Cost"] || row.cost || row.rate || book.purchasePrice || book.distributorPrice || 0)
        };
      }).filter((row) => row.bookId && Number(row.quantity || 0) > 0);

      if (!bookRows.length) {
        showToast("No opening stock rows found in the file");
        return;
      }

      state.openingLines = bookRows;
      state.openingBookQueries = bookRows.map(() => "");
      state.openingDraft = {
        documentDate: state.openingDraft.documentDate || new Date().toISOString().slice(0, 10),
        toWarehouseId: state.openingDraft.toWarehouseId || state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || "",
        notes: state.openingDraft.notes || "Opening stock as on date"
      };
      renderOpeningStockModal();
      showToast(`Loaded ${bookRows.length} opening stock rows`);
    } catch (error) {
      showToast(error.message || "Could not read the import file");
    } finally {
      const input = document.getElementById("openingImportInput");
      if (input) {
        input.value = "";
      }
    }
  }

  async function importUnsettledOpeningFile(file) {
    if (!file) return;
    try {
      const name = file.name || "import";
      const lower = name.toLowerCase();
      let rows = [];
      if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
        if (!window.XLSX) {
          showToast("Excel import library is not loaded");
          return;
        }
        const buffer = await file.arrayBuffer();
        const workbook = window.XLSX.read(buffer, { type: "array" });
        const sheet = workbook.SheetNames[0];
        rows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheet], { defval: "" });
      } else {
        const text = await file.text();
        rows = parseCsvRows(text);
      }

      if (!rows.length) {
        showToast("No rows found in the file");
        return;
      }

      const fields = Object.keys(rows[0] || {});
      const fixedFields = new Set(["ERP Code", "Book Name", "ERP", "Book"]);
      const activityHeaders = fields.filter((field) => !fixedFields.has(String(field).trim()));
      if (!activityHeaders.length) {
        showToast("Add activity columns to the file");
        return;
      }

      const activityLookup = new Map();
      state.activities.forEach((activity) => {
        const key = String(activity.name || activity.activityName || "").trim().toLowerCase();
        if (key) {
          activityLookup.set(key, activity);
        }
      });

      const resolvedActivities = activityHeaders.map((header) => {
        const key = String(header || "").trim().toLowerCase();
        return activityLookup.get(key) || null;
      });

      const missingActivities = activityHeaders.filter((header, index) => !resolvedActivities[index]).map((header) => String(header || "").trim());
      if (missingActivities.length) {
        throw new Error("Please create activities first");
      }

      const entriesByActivityId = new Map();
      for (const row of rows) {
        const erpCode = String(row["ERP Code"] || row.erpCode || row["ERP"] || "").trim();
        const bookName = String(row["Book Name"] || row.bookName || row["Book"] || "").trim();
        const book = erpCode
          ? getBook(erpCode)
          : (bookName ? state.books.find((item) => String(item.name || "").trim().toLowerCase() === bookName.toLowerCase()) || null : null);
        if (!book) {
          throw new Error(`Book not found: ${erpCode || bookName || "-"}`);
        }
        const bookId = book.erpCode || book.bookId || erpCode || "";
        activityHeaders.forEach((header, index) => {
          const activity = resolvedActivities[index];
          if (!activity) return;
          const quantity = Number(row[header] || row[String(header).trim()] || 0);
          if (quantity <= 0) return;
          const entry = entriesByActivityId.get(activity.activityId) || {
            activityId: activity.activityId,
            lines: []
          };
          entry.lines.push({
            bookId,
            quantity,
            rate: Number(book.purchasePrice || book.distributorPrice || 0)
          });
          entriesByActivityId.set(activity.activityId, entry);
        });
      }

      const entries = Array.from(entriesByActivityId.values()).filter((entry) => entry.lines.length);
      if (!entries.length) {
        showToast("No unsettled quantities found in the file");
        return;
      }

      const payload = {
        documentDate: state.unsettledDraft.documentDate || new Date().toISOString().slice(0, 10),
        fromWarehouseId: state.unsettledDraft.fromWarehouseId || state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || "",
        notes: state.unsettledDraft.notes || "Legacy unsettled issue opening",
        entries
      };

      setLoading(true);
      try {
        const result = await window.erpApi.request("documents.importUnsettledOpening", payload);
        invalidateCurrentStockCache();
        closeModal();
        content.innerHTML = await renderDocuments();
        showToast(`Loaded unsettled opening for ${result.created || entries.length} activities`);
      } finally {
        setLoading(false);
      }
    } catch (error) {
      showToast(error.message || "Could not read the unsettled opening file");
    } finally {
      const input = document.getElementById("unsettledOpeningImportInput");
      if (input) {
        input.value = "";
      }
    }
  }

  function openUnsettledOpeningForm() {
    void ensureDocumentItemMastersLoaded().catch(() => {});
    state.unsettledDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      fromWarehouseId: state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || "",
      activityId: "",
      notes: "Legacy unsettled issue opening",
      itemGroup: normalizeItemGroup(state.documentEntryGroup || "BOOK")
    };
    state.unsettledLines = [blankUnsettledLine()];
    state.unsettledBookQueries = [""];
    renderUnsettledOpeningModal();
  }

  function blankUnsettledLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderUnsettledOpeningModal() {
    const itemGroup = normalizeItemGroup(state.unsettledDraft.itemGroup || "BOOK");
    const activeBooks = getDocumentItemsForGroup(itemGroup);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const openActivities = state.activities.filter((activity) => activity.status !== "Completed" && activity.status !== "Cancelled");
    const draft = state.unsettledDraft;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="unsettledFormTitle">
        <div class="modal-header">
          <h2 id="unsettledFormTitle">Unsettled Opening</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="unsettledForm">
          <label class="field">
            <span>Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
          </label>
          <label class="field">
            <span>Source Warehouse</span>
            <select name="fromWarehouseId" required>
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.fromWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          ${renderDocumentItemGroupField("unsettled", draft)}
          ${openActivities.length ? `
            <label class="field wide-field">
              <span>Activity</span>
              <select name="activityId" required>
                <option value="">Select activity</option>
                ${openActivities.map((activity) => `<option value="${escapeAttribute(activity.activityId)}" ${draft.activityId === activity.activityId ? "selected" : ""}>${escapeHtml(activity.name)} (${escapeHtml(getWarehouseName(activity.warehouseId))})</option>`).join("")}
              </select>
            </label>
          ` : '<div class="empty-state wide-field">Create the activity first, then seed unsettled stock against it.</div>'}
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Unsettled opening note">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>${getItemGroupLabel(itemGroup)}</h3>
              <div class="button-row">
                <button class="small-button" type="button" onclick="window.erpApp.downloadUnsettledOpeningSample()">Download Sample</button>
                <button class="small-button" type="button" onclick="window.erpApp.pickUnsettledOpeningImport()">Import Excel</button>
                <button class="small-button" type="button" onclick="window.erpApp.addUnsettledLine()">Add Line</button>
              </div>
            </div>
            <input id="unsettledOpeningImportInput" type="file" accept=".csv,.xlsx,.xls" style="display:none" onchange="window.erpApp.importUnsettledOpeningFile(this.files[0])">
            ${activeBooks.length ? unsettledLinesMarkup(activeBooks, itemGroup) : `<div class="empty-state">Add active ${getItemGroupLabel(itemGroup).toLowerCase()} before posting unsettled opening stock.</div>`}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${(activeBooks.length && openActivities.length) ? "" : "disabled"}>Post Unsettled Opening</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("unsettledForm").addEventListener("submit", saveUnsettledOpeningDocument);
  }

  function pickUnsettledOpeningImport() {
    const input = document.getElementById("unsettledOpeningImportInput");
    if (input) {
      input.click();
    }
  }

  function unsettledLinesMarkup(activeBooks, itemGroup) {
    return `
      <div class="line-table">
        ${state.unsettledLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("unsettled", index, activeBooks, line, state.unsettledBookQueries[index] || "", "", itemGroup)}
            <label class="field">
              <span>Qty</span>
              <input type="number" min="1" step="1" value="${escapeAttribute(line.quantity)}" onchange="window.erpApp.updateUnsettledLine(${index}, 'quantity', this.value)" required>
            </label>
            <label class="field">
              <span>Rate</span>
              <input type="number" min="0" step="0.01" value="${escapeAttribute(line.rate)}" onchange="window.erpApp.updateUnsettledLine(${index}, 'rate', this.value)">
            </label>
            <button class="small-button danger line-remove" type="button" onclick="window.erpApp.removeUnsettledLine(${index})">Remove</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function addUnsettledLine() {
    syncUnsettledDraft();
    state.unsettledLines.push(blankUnsettledLine());
    state.unsettledBookQueries.push("");
    renderUnsettledOpeningModal();
  }

  function removeUnsettledLine(index) {
    syncUnsettledDraft();
    state.unsettledLines.splice(index, 1);
    state.unsettledBookQueries.splice(index, 1);
    if (!state.unsettledLines.length) {
      state.unsettledLines.push(blankUnsettledLine());
      state.unsettledBookQueries.push("");
    }
    renderUnsettledOpeningModal();
  }

  function updateUnsettledLine(index, key, value) {
    if (!state.unsettledLines[index]) return;
    state.unsettledLines[index][key] = key === "bookId" ? value : Number(value || 0);
  }

  function syncUnsettledDraft() {
    const form = document.getElementById("unsettledForm");
    if (!form) return;
    const data = new FormData(form);
    state.unsettledDraft = {
      documentDate: data.get("documentDate") || new Date().toISOString().slice(0, 10),
      fromWarehouseId: data.get("fromWarehouseId") || "",
      activityId: data.get("activityId") || "",
      notes: data.get("notes") || "",
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.unsettledDraft.itemGroup || "BOOK")
    };
  }

  async function saveUnsettledOpeningDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = state.unsettledLines
      .filter((line) => line.bookId && Number(line.quantity || 0) > 0)
      .map((line) => ({
        bookId: line.bookId,
        quantity: Number(line.quantity),
        rate: Number(line.rate || 0)
      }));

    if (!lines.length) {
      showToast("Add at least one book line");
      return;
    }

    const payload = {
      documentType: "UNSETTLED_OPENING",
      documentDate: data.get("documentDate"),
      fromWarehouseId: data.get("fromWarehouseId"),
      activityId: data.get("activityId"),
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.unsettledDraft.itemGroup || "BOOK"),
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      invalidateCurrentStockCache();
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Unsettled opening posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post unsettled opening stock");
    } finally {
      setLoading(false);
    }
  }

  function renderSaleModal() {
    const itemGroup = normalizeItemGroup(state.saleDraft.itemGroup || "BOOK");
    const activeBooks = getDocumentItemsForGroup(itemGroup);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active && (warehouse.name || "").toLowerCase().indexOf("gmb") !== 0);
    const draft = state.saleDraft;
    const warehouseId = draft.warehouseId || "";
    const booksWithStock = warehouseId
      ? (state.currentStockLoaded ? activeBooks.filter((book) => getAvailableStock(warehouseId, book.erpCode || book.bookId) > 0) : activeBooks)
      : [];

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="saleFormTitle">
        <div class="modal-header">
          <h2 id="saleFormTitle">Sale Books</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="saleForm">
          <label class="field">
            <span>Sale Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
          </label>
          <label class="field">
            <span>Warehouse</span>
            <select name="warehouseId" required onchange="window.erpApp.onSaleWarehouseChange(this.value)">
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.warehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          ${renderDocumentItemGroupField("sale", draft)}
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Sale note or memo">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>${getItemGroupLabel(itemGroup)}${warehouseId ? ` (Stock at ${getWarehouseName(warehouseId)})` : ""}</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addSaleLine()">Add Line</button>
            </div>
            ${warehouseId ? (booksWithStock.length ? saleLinesMarkup(booksWithStock, warehouseId, itemGroup) : `<div class="empty-state">No active ${getItemGroupLabel(itemGroup).toLowerCase()} with stock at the selected warehouse.</div>`) : `<div class="empty-state">Select a warehouse to see available ${getItemGroupLabel(itemGroup).toLowerCase()}.</div>`}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${warehouseId && booksWithStock.length ? "" : "disabled"}>Post Sale</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("saleForm").addEventListener("submit", saveSaleDocument);
  }

  function saleLinesMarkup(activeBooks, warehouseId, itemGroup) {
    return `
      <div class="line-table">
        ${state.saleLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("sale", index, activeBooks, line, state.saleBookQueries[index] || "", warehouseId, itemGroup)}
            <label class="field">
              <span>Qty</span>
              <input type="number" min="1" step="1" value="${escapeAttribute(line.quantity)}" onchange="window.erpApp.updateSaleLine(${index}, 'quantity', this.value)" required>
            </label>
            <label class="field">
              <span>Rate</span>
              <input type="number" min="0" step="0.01" value="${escapeAttribute(line.rate)}" onchange="window.erpApp.updateSaleLine(${index}, 'rate', this.value)">
            </label>
            <button class="small-button danger line-remove" type="button" onclick="window.erpApp.removeSaleLine(${index})">Remove</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function addSaleLine() {
    syncSaleDraft();
    state.saleLines.push(blankSaleLine());
    state.saleBookQueries.push("");
    renderSaleModal();
  }

  function removeSaleLine(index) {
    syncSaleDraft();
    state.saleLines.splice(index, 1);
    state.saleBookQueries.splice(index, 1);
    if (!state.saleLines.length) {
      state.saleLines.push(blankSaleLine());
      state.saleBookQueries.push("");
    }
    renderSaleModal();
  }

  function updateSaleLine(index, key, value) {
    if (!state.saleLines[index]) return;
    state.saleLines[index][key] = key === "bookId" ? value : Number(value || 0);
  }

  function syncSaleDraft() {
    const form = document.getElementById("saleForm");
    if (!form) return;
    const data = new FormData(form);
    state.saleDraft = {
      documentDate: data.get("documentDate") || new Date().toISOString().slice(0, 10),
      warehouseId: data.get("warehouseId") || "",
      notes: data.get("notes") || "",
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.saleDraft.itemGroup || "BOOK")
    };
  }

  async function saveSaleDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = state.saleLines
      .filter((line) => line.bookId && Number(line.quantity || 0) > 0)
      .map((line) => ({
        bookId: line.bookId,
        quantity: Number(line.quantity),
        rate: Number(line.rate || getBookSalePrice(line.bookId))
      }));

    if (!lines.length) {
      showToast("Add at least one book line");
      return;
    }

    const payload = {
      documentType: "SALE",
      documentDate: data.get("documentDate"),
      warehouseId: data.get("warehouseId"),
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.saleDraft.itemGroup || "BOOK"),
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      invalidateCurrentStockCache();
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Sale posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post sale");
    } finally {
      setLoading(false);
    }
  }

  function renderIssueModal() {
    const itemGroup = normalizeItemGroup(state.issueDraft.itemGroup || "BOOK");
    const activeBooks = getDocumentItemsForGroup(itemGroup);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const openActivities = state.activities.filter((activity) => activity.status !== "Completed" && activity.status !== "Cancelled");
    const draft = state.issueDraft;
    const isComplimentary = state.issueDocumentType === "COMPLIMENTARY";
    const fromWarehouseId = draft.fromWarehouseId || "";
    const booksWithStock = fromWarehouseId
      ? (state.currentStockLoaded ? activeBooks.filter((book) => getAvailableStock(fromWarehouseId, book.erpCode || book.bookId) > 0) : activeBooks)
      : [];

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="issueFormTitle">
        <div class="modal-header">
          <h2 id="issueFormTitle">${isComplimentary ? "Complimentary Issue" : "Issue Books"}</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="issueForm">
          <label class="field">
            <span>${isComplimentary ? "Complimentary Date" : "Issue Date"}</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
          </label>
          <label class="field">
            <span>From Warehouse</span>
            <select name="fromWarehouseId" required onchange="window.erpApp.onIssueWarehouseChange(this.value)">
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.fromWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          ${renderDocumentItemGroupField("issue", draft)}
          <label class="field wide-field">
            <span>Activity</span>
            <select name="activityId" required>
              <option value="">Select activity</option>
              ${openActivities.map((activity) => `<option value="${escapeAttribute(activity.activityId)}" ${draft.activityId === activity.activityId ? "selected" : ""}>${escapeHtml(activity.name)} (${escapeHtml(getWarehouseName(activity.warehouseId))})</option>`).join("")}
            </select>
          </label>
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="${isComplimentary ? "Optional complimentary note" : "Optional issue note"}">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>${isComplimentary ? `${getItemGroupLabel(itemGroup)} for Complimentary Issue` : `${getItemGroupLabel(itemGroup)}${fromWarehouseId ? ` (Stock at ${getWarehouseName(fromWarehouseId)})` : ""}`}</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addIssueLine()">Add Line</button>
            </div>
            ${booksWithStock.length ? issueLinesMarkup(booksWithStock, fromWarehouseId, itemGroup) : '<div class="empty-state">' + (fromWarehouseId ? `No ${getItemGroupLabel(itemGroup).toLowerCase()} with available stock at ${getWarehouseName(fromWarehouseId)}.` : `Select a warehouse to see available ${getItemGroupLabel(itemGroup).toLowerCase()}.`) + '</div>'}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${booksWithStock.length ? "" : "disabled"}>${isComplimentary ? "Post Complimentary" : "Post Issue"}</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("issueForm").addEventListener("submit", saveIssueDocument);
  }

  function issueLinesMarkup(activeBooks, fromWarehouseId, itemGroup) {
    return `
      <div class="line-table">
        ${state.issueLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("issue", index, activeBooks, line, state.issueBookQueries[index] || "", fromWarehouseId, itemGroup)}
            <label class="field">
              <span>Qty</span>
              <input type="number" min="1" step="1" value="${escapeAttribute(line.quantity)}" onchange="window.erpApp.updateIssueLine(${index}, 'quantity', this.value)" required>
            </label>
            <label class="field">
              <span>Rate</span>
              <input type="number" min="0" step="0.01" value="${escapeAttribute(line.rate)}" onchange="window.erpApp.updateIssueLine(${index}, 'rate', this.value)">
            </label>
            <button class="small-button danger line-remove" type="button" onclick="window.erpApp.removeIssueLine(${index})">Remove</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function addIssueLine() {
    syncIssueDraft();
    state.issueLines.push(blankIssueLine());
    state.issueBookQueries.push("");
    renderIssueModal();
  }

  function removeIssueLine(index) {
    syncIssueDraft();
    state.issueLines.splice(index, 1);
    state.issueBookQueries.splice(index, 1);
    if (!state.issueLines.length) {
      state.issueLines.push(blankIssueLine());
      state.issueBookQueries.push("");
    }
    renderIssueModal();
  }

  function updateIssueLine(index, key, value) {
    if (!state.issueLines[index]) return;
    state.issueLines[index][key] = key === "bookId" ? value : Number(value || 0);
  }

  function syncIssueDraft() {
    const form = document.getElementById("issueForm");
    if (!form) return;
    const data = new FormData(form);
    state.issueDraft = {
      documentDate: data.get("documentDate") || new Date().toISOString().slice(0, 10),
      fromWarehouseId: data.get("fromWarehouseId") || "",
      activityId: data.get("activityId") || "",
      notes: data.get("notes") || "",
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.issueDraft.itemGroup || "BOOK")
    };
  }

  async function saveIssueDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const isComplimentary = state.issueDocumentType === "COMPLIMENTARY";
    const lines = state.issueLines
      .filter((line) => line.bookId && Number(line.quantity || 0) > 0)
      .map((line) => ({
        bookId: line.bookId,
        quantity: Number(line.quantity),
        rate: Number(line.rate || 0)
      }));

    if (!lines.length) {
      showToast("Add at least one book line");
      return;
    }

    const payload = {
      documentType: isComplimentary ? "COMPLIMENTARY" : "ISSUE",
      documentDate: data.get("documentDate"),
      fromWarehouseId: data.get("fromWarehouseId"),
      activityId: data.get("activityId"),
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.issueDraft.itemGroup || "BOOK"),
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      invalidateCurrentStockCache();
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`${isComplimentary ? "Complimentary issue" : "Issue"} posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || `Could not post ${isComplimentary ? "complimentary issue" : "issue"}`);
    } finally {
      setLoading(false);
    }
  }

  function openReceiveForm() {
    void ensureDocumentItemMastersLoaded().catch(() => {});
    const activityId = getIssuedActivityOptions()[0]?.activityId || "";
    state.receiveDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      toWarehouseId: state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || "",
      activityId,
      notes: "",
      returnSettlement: "Settled",
      itemGroup: normalizeItemGroup(state.documentEntryGroup || "BOOK")
    };
    state.receiveLines = [blankReceiveLine()];
    state.receiveBookQueries = [""];
    renderReceiveModal();
  }

  function blankReceiveLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderReceiveModal() {
    const itemGroup = normalizeItemGroup(state.receiveDraft.itemGroup || "BOOK");
    const activeBooks = getDocumentItemsForGroup(itemGroup);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const issuedActivities = getIssuedActivityOptions();
    const draft = state.receiveDraft;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="receiveFormTitle">
        <div class="modal-header">
          <h2 id="receiveFormTitle">Return Books</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="receiveForm">
          <label class="field">
            <span>Return Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
          </label>
          <label class="field">
            <span>To Warehouse</span>
            <select name="toWarehouseId" required>
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.toWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          ${renderDocumentItemGroupField("receive", draft)}
          ${issuedActivities.length ? `
            <label class="field wide-field">
              <span>Activity</span>
              <select name="activityId" required>
                <option value="">Select issued activity</option>
                ${issuedActivities.map((activity) => `<option value="${escapeAttribute(activity.activityId)}" ${draft.activityId === activity.activityId ? "selected" : ""}>${escapeHtml(activity.name)} (${escapeHtml(getWarehouseName(activity.warehouseId))})</option>`).join("")}
              </select>
            </label>
          ` : '<div class="empty-state wide-field">Create an issue for an activity first. Returns can only be posted against activities that already have issue entries.</div>'}
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Return note">
          </label>
          <label class="field">
            <span>Activity outcome</span>
            <select name="returnSettlement" required>
              <option value="Settled" ${draft.returnSettlement === "Settled" ? "selected" : ""}>Settle activity now</option>
              <option value="Unsettled" ${draft.returnSettlement === "Unsettled" ? "selected" : ""}>Keep activity unsettled</option>
            </select>
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>${getItemGroupLabel(itemGroup)}</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addReceiveLine()">Add Line</button>
            </div>
            ${activeBooks.length ? receiveLinesMarkup(activeBooks, itemGroup) : `<div class="empty-state">Add active ${getItemGroupLabel(itemGroup).toLowerCase()} before posting returns.</div>`}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${(activeBooks.length && issuedActivities.length) ? "" : "disabled"}>Post Return</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("receiveForm").addEventListener("submit", saveReceiveDocument);
  }

  function receiveLinesMarkup(activeBooks, itemGroup) {
    return `
      <div class="line-table">
        ${state.receiveLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("receive", index, activeBooks, line, state.receiveBookQueries[index] || "", "", itemGroup)}
            <label class="field">
              <span>Qty</span>
              <input type="number" min="1" step="1" value="${escapeAttribute(line.quantity)}" onchange="window.erpApp.updateReceiveLine(${index}, 'quantity', this.value)" required>
            </label>
            <label class="field">
              <span>Rate</span>
              <input type="number" min="0" step="0.01" value="${escapeAttribute(line.rate)}" onchange="window.erpApp.updateReceiveLine(${index}, 'rate', this.value)">
            </label>
            <button class="small-button danger line-remove" type="button" onclick="window.erpApp.removeReceiveLine(${index})">Remove</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function addReceiveLine() {
    syncReceiveDraft();
    state.receiveLines.push(blankReceiveLine());
    state.receiveBookQueries.push("");
    renderReceiveModal();
  }

  function removeReceiveLine(index) {
    syncReceiveDraft();
    state.receiveLines.splice(index, 1);
    state.receiveBookQueries.splice(index, 1);
    if (!state.receiveLines.length) {
      state.receiveLines.push(blankReceiveLine());
      state.receiveBookQueries.push("");
    }
    renderReceiveModal();
  }

  function updateReceiveLine(index, key, value) {
    if (!state.receiveLines[index]) return;
    state.receiveLines[index][key] = key === "bookId" ? value : Number(value || 0);
  }

  function syncReceiveDraft() {
    const form = document.getElementById("receiveForm");
    if (!form) return;
    const data = new FormData(form);
    state.receiveDraft = {
      documentDate: data.get("documentDate") || new Date().toISOString().slice(0, 10),
      toWarehouseId: data.get("toWarehouseId") || "",
      activityId: data.get("activityId") || "",
      notes: data.get("notes") || "",
      returnSettlement: data.get("returnSettlement") || "Settled",
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.receiveDraft.itemGroup || "BOOK")
    };
  }

  async function saveReceiveDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const lines = state.receiveLines
      .filter((line) => line.bookId && Number(line.quantity || 0) > 0)
      .map((line) => ({
        bookId: line.bookId,
        quantity: Number(line.quantity),
        rate: Number(line.rate || 0)
      }));

    if (!lines.length) {
      showToast("Add at least one book line");
      return;
    }

    const payload = {
      documentType: "RETURN",
      documentDate: data.get("documentDate"),
      toWarehouseId: data.get("toWarehouseId"),
      activityId: data.get("activityId"),
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.receiveDraft.itemGroup || "BOOK"),
      status: data.get("returnSettlement") || "Settled",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      invalidateCurrentStockCache();
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Return posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post return");
    } finally {
      setLoading(false);
    }
  }

  function openTransferForm() {
    void ensureDocumentItemMastersLoaded().catch(() => {});
    state.transferDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      fromWarehouseId: "",
      toWarehouseId: "",
      notes: "",
      itemGroup: normalizeItemGroup(state.documentEntryGroup || "BOOK")
    };
    state.transferLines = [blankTransferLine()];
    state.transferBookQueries = [""];
    renderTransferModal();
    refreshCurrentStockForOpenDocumentModal();
  }

  function blankTransferLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderTransferModal() {
    const itemGroup = normalizeItemGroup(state.transferDraft.itemGroup || "BOOK");
    const activeBooks = getDocumentItemsForGroup(itemGroup);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const draft = state.transferDraft;
    const fromWarehouseId = draft.fromWarehouseId || "";
    const booksWithStock = fromWarehouseId
      ? (state.currentStockLoaded ? activeBooks.filter((book) => getAvailableStock(fromWarehouseId, book.erpCode || book.bookId) > 0) : activeBooks)
      : [];

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="transferFormTitle">
        <div class="modal-header">
          <h2 id="transferFormTitle">Transfer Books</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="transferForm">
          <label class="field">
            <span>Transfer Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
          </label>
          <label class="field">
            <span>From Warehouse</span>
            <select name="fromWarehouseId" required onchange="window.erpApp.onTransferWarehouseChange(this.value)">
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.fromWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>To Warehouse</span>
            <select name="toWarehouseId" required>
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.toWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          ${renderDocumentItemGroupField("transfer", draft)}
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Vehicle, person, or transfer reference">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>${getItemGroupLabel(itemGroup)}${fromWarehouseId ? ` (Stock at ${getWarehouseName(fromWarehouseId)})` : ""}</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addTransferLine()">Add Line</button>
            </div>
            ${booksWithStock.length ? transferLinesMarkup(booksWithStock, fromWarehouseId, itemGroup) : '<div class="empty-state">' + (fromWarehouseId ? `No ${getItemGroupLabel(itemGroup).toLowerCase()} with available stock at ${getWarehouseName(fromWarehouseId)}.` : `Select a source warehouse to see available ${getItemGroupLabel(itemGroup).toLowerCase()}.`) + '</div>'}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${booksWithStock.length ? "" : "disabled"}>Post Transfer</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("transferForm").addEventListener("submit", saveTransferDocument);
  }

  function transferLinesMarkup(activeBooks, fromWarehouseId, itemGroup) {
    return `
      <div class="line-table">
        ${state.transferLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("transfer", index, activeBooks, line, state.transferBookQueries[index] || "", fromWarehouseId, itemGroup)}
            <label class="field">
              <span>Qty</span>
              <input type="number" min="1" step="1" value="${escapeAttribute(line.quantity)}" onchange="window.erpApp.updateTransferLine(${index}, 'quantity', this.value)" required>
            </label>
            <label class="field">
              <span>Rate</span>
              <input type="number" min="0" step="0.01" value="${escapeAttribute(line.rate)}" onchange="window.erpApp.updateTransferLine(${index}, 'rate', this.value)">
            </label>
            <button class="small-button danger line-remove" type="button" onclick="window.erpApp.removeTransferLine(${index})">Remove</button>
          </div>
        `).join("")}
      </div>
    `;
  }

  function addTransferLine() {
    syncTransferDraft();
    state.transferLines.push(blankTransferLine());
    state.transferBookQueries.push("");
    renderTransferModal();
  }

  function removeTransferLine(index) {
    syncTransferDraft();
    state.transferLines.splice(index, 1);
    state.transferBookQueries.splice(index, 1);
    if (!state.transferLines.length) {
      state.transferLines.push(blankTransferLine());
      state.transferBookQueries.push("");
    }
    renderTransferModal();
  }

  function updateTransferLine(index, key, value) {
    if (!state.transferLines[index]) return;
    state.transferLines[index][key] = key === "bookId" ? value : Number(value || 0);
  }

  function syncTransferDraft() {
    const form = document.getElementById("transferForm");
    if (!form) return;
    const data = new FormData(form);
    state.transferDraft = {
      documentDate: data.get("documentDate") || new Date().toISOString().slice(0, 10),
      fromWarehouseId: data.get("fromWarehouseId") || "",
      toWarehouseId: data.get("toWarehouseId") || "",
      notes: data.get("notes") || "",
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.transferDraft.itemGroup || "BOOK")
    };
  }

  function onIssueWarehouseChange(warehouseId) {
    syncIssueDraft();
    state.issueDraft.fromWarehouseId = warehouseId;
    state.issueLines = [blankIssueLine()];
    renderIssueModal();
    refreshCurrentStockForOpenDocumentModal();
  }

  function onSaleWarehouseChange(warehouseId) {
    syncSaleDraft();
    state.saleDraft.warehouseId = warehouseId;
    state.saleLines = [blankSaleLine()];
    renderSaleModal();
    refreshCurrentStockForOpenDocumentModal();
  }

  function onTransferWarehouseChange(warehouseId) {
    syncTransferDraft();
    state.transferDraft.fromWarehouseId = warehouseId;
    state.transferLines = [blankTransferLine()];
    renderTransferModal();
    refreshCurrentStockForOpenDocumentModal();
  }

  function onDocumentItemGroupChange(kind, itemGroup) {
    const normalized = normalizeItemGroup(itemGroup);
    if (kind === "purchase") {
      syncPurchaseDraft();
      state.purchaseDraft.itemGroup = normalized;
      state.purchaseLines = [blankPurchaseLine()];
      renderPurchaseModal();
      return;
    }
    if (kind === "opening") {
      syncOpeningDraft();
      state.openingDraft.itemGroup = normalized;
      state.openingLines = [blankOpeningLine()];
      state.openingBookQueries = [""];
      renderOpeningStockModal();
      return;
    }
    if (kind === "unsettled") {
      syncUnsettledDraft();
      state.unsettledDraft.itemGroup = normalized;
      state.unsettledLines = [blankUnsettledLine()];
      state.unsettledBookQueries = [""];
      renderUnsettledOpeningModal();
      return;
    }
    if (kind === "issue") {
      syncIssueDraft();
      state.issueDraft.itemGroup = normalized;
      state.issueLines = [blankIssueLine()];
      state.issueBookQueries = [""];
      renderIssueModal();
      refreshCurrentStockForOpenDocumentModal();
      return;
    }
    if (kind === "sale") {
      syncSaleDraft();
      state.saleDraft.itemGroup = normalized;
      state.saleLines = [blankSaleLine()];
      state.saleBookQueries = [""];
      renderSaleModal();
      refreshCurrentStockForOpenDocumentModal();
      return;
    }
    if (kind === "receive") {
      syncReceiveDraft();
      state.receiveDraft.itemGroup = normalized;
      state.receiveLines = [blankReceiveLine()];
      state.receiveBookQueries = [""];
      renderReceiveModal();
      return;
    }
    if (kind === "transfer") {
      syncTransferDraft();
      state.transferDraft.itemGroup = normalized;
      state.transferLines = [blankTransferLine()];
      state.transferBookQueries = [""];
      renderTransferModal();
      refreshCurrentStockForOpenDocumentModal();
    }
  }

  async function ensureCurrentStockLoaded() {
    if (state.currentStockLoaded) {
      return state.currentStock;
    }
    state.currentStockLoading = true;
    try {
      state.currentStock = (await window.erpApi.request("stock.current")).map(normalizeStockRow);
      state.currentStockLoaded = true;
      return state.currentStock;
    } finally {
      state.currentStockLoading = false;
    }
  }

  function invalidateCurrentStockCache() {
    state.currentStock = [];
    state.currentStockLoaded = false;
  }

  function refreshCurrentStockForOpenDocumentModal() {
    if (state.currentStockLoading || state.currentStockLoaded) {
      return;
    }
    ensureCurrentStockLoaded()
      .then(() => {
        if (document.getElementById("issueForm")) {
          renderIssueModal();
        } else if (document.getElementById("saleForm")) {
          renderSaleModal();
        } else if (document.getElementById("transferForm")) {
          renderTransferModal();
        } else if (document.getElementById("unsettledForm")) {
          renderUnsettledOpeningModal();
        }
      })
      .catch(() => {
        /* keep the modal usable even if stock refresh fails */
      });
  }

  async function saveTransferDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const fromWarehouseId = data.get("fromWarehouseId");
    const toWarehouseId = data.get("toWarehouseId");

    if (fromWarehouseId === toWarehouseId) {
      showToast("Choose two different warehouses");
      return;
    }

    const lines = state.transferLines
      .filter((line) => line.bookId && Number(line.quantity || 0) > 0)
      .map((line) => ({
        bookId: line.bookId,
        quantity: Number(line.quantity),
        rate: Number(line.rate || 0)
      }));

    if (!lines.length) {
      showToast("Add at least one book line");
      return;
    }

    const payload = {
      documentType: "TRANSFER",
      documentDate: data.get("documentDate"),
      fromWarehouseId,
      toWarehouseId,
      itemGroup: normalizeItemGroup(data.get("itemGroup") || state.transferDraft.itemGroup || "BOOK"),
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      invalidateCurrentStockCache();
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Transfer posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post transfer");
    } finally {
      setLoading(false);
    }
  }

  function toInputDate(value) {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
    return date.toISOString().slice(0, 10);
  }

  function formatDateRange(startDate, endDate) {
    const start = toInputDate(startDate);
    const end = toInputDate(endDate);
    if (start && end) return `${start} to ${end}`;
    return start || end || "-";
  }

  async function downloadDocumentPdf(documentId) {
    if (!documentId) {
      showToast("Document not found");
      return;
    }
    const jsPdfNamespace = window.jspdf || {};
    const JsPdfCtor = jsPdfNamespace.jsPDF;
    if (!JsPdfCtor) {
      showToast("PDF library is not loaded");
      return;
    }

    setLoading(true);
    try {
      const detail = await window.erpApi.request("documents.detail", { documentId });
      const pdf = new JsPdfCtor({ orientation: "p", unit: "mm", format: "a4" });
      if (typeof pdf.autoTable !== "function") {
        throw new Error("PDF table plugin is not loaded");
      }
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 11;
      const accent = [120, 70, 30];
      const gold = [196, 153, 61];
      const soft = [248, 243, 233];

      pdf.setFillColor(...accent);
      pdf.rect(0, 0, pageWidth, 34, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFont("helvetica", "bold");
      pdf.setFontSize(17);
      pdf.text("HARE KRISHNA MOVEMENT VISAKHAPATNAM", pageWidth / 2, 13, { align: "center" });
      pdf.setFont("helvetica", "normal");
      pdf.setFontSize(10);
      pdf.text("Stock Document", pageWidth / 2, 20, { align: "center" });
      pdf.setFontSize(9);
      pdf.text(`${documentTypeLabel(detail.documentType)} • ${detail.status || "Posted"}`, pageWidth / 2, 26, { align: "center" });

      let y = 41;
      const infoBoxes = [
        { label: "Stock Doc ID", value: detail.documentId || "-" },
        { label: "Date", value: toInputDate(detail.documentDate) || "-" },
        { label: "Activity ID", value: detail.activityId || "-" },
        { label: "Activity Name", value: detail.activityName || "-" },
        { label: "From", value: detail.fromWarehouseName || detail.fromWarehouseId || "-" },
        { label: "To", value: detail.toWarehouseName || detail.toWarehouseId || "-" }
      ];
      const boxWidth = (pageWidth - (margin * 2) - 4) / 2;
      const boxHeight = 14;
      pdf.setDrawColor(...gold);
      pdf.setLineWidth(0.2);
      pdf.setFontSize(8);
      pdf.setTextColor(70, 50, 25);
      infoBoxes.forEach((box, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        const x = margin + (col * (boxWidth + 4));
        const boxY = y + (row * (boxHeight + 3));
        pdf.setFillColor(...soft);
        pdf.roundedRect(x, boxY, boxWidth, boxHeight, 2, 2, "FD");
        pdf.setFont("helvetica", "bold");
        pdf.text(box.label, x + 2, boxY + 5);
        pdf.setFont("helvetica", "normal");
        pdf.text(String(box.value), x + 2, boxY + 10);
      });

      y += 2 * (boxHeight + 3) + 4;
      if (detail.notes) {
        const noteLines = pdf.splitTextToSize(String(detail.notes), pageWidth - (margin * 2) - 4);
        const noteBoxHeight = Math.max(11, (noteLines.length * 4) + 6);
        pdf.setFillColor(255, 252, 244);
        pdf.roundedRect(margin, y, pageWidth - (margin * 2), noteBoxHeight, 2, 2, "FD");
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(70, 50, 25);
        pdf.text("Notes", margin + 2, y + 4);
        pdf.setFont("helvetica", "normal");
        pdf.text(noteLines, margin + 2, y + 8);
        y += noteBoxHeight + 2;
      }

      const rows = Array.isArray(detail.lines) ? detail.lines : [];
      const body = rows.map((line, index) => ([
        String(index + 1),
        String(line.erpCode || "-"),
        String(line.bookName || "-"),
        String(line.bookType || "-"),
        String(Number(line.quantity || 0)),
        money(line.rate || 0).replace(/^Rs\.\s*/, ""),
        money(line.amount || 0).replace(/^Rs\.\s*/, "")
      ]));
      pdf.autoTable({
        startY: y + 2,
        head: [[
          "SNo",
          "ERP Code",
          "Book Name",
          "Category",
          "Qty",
          "Rate",
          "Amount"
        ]],
        body,
        theme: "grid",
        margin: { left: margin, right: margin },
        styles: {
          font: "helvetica",
          fontSize: 8,
          cellPadding: 2,
          overflow: "linebreak",
          valign: "middle",
          textColor: [40, 35, 30]
        },
        headStyles: {
          fillColor: accent,
          textColor: 255,
          fontStyle: "bold"
        },
        alternateRowStyles: {
          fillColor: [252, 248, 240]
        },
        columnStyles: {
          0: { cellWidth: 12, halign: "center" },
          4: { cellWidth: 14, halign: "right" },
          5: { cellWidth: 22, halign: "right" },
          6: { cellWidth: 24, halign: "right" }
        },
        didDrawPage: (data) => {
          if (data.pageNumber > 1) {
            pdf.setFillColor(...accent);
            pdf.rect(0, 0, pageWidth, 12, "F");
            pdf.setTextColor(255, 255, 255);
            pdf.setFontSize(9);
            pdf.text("HARE KRISHNA MOVEMENT VISAKHAPATNAM", pageWidth / 2, 7, { align: "center" });
            pdf.setTextColor(40, 35, 30);
          }
        }
      });

      const totalQty = rows.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
      const totalAmount = rows.reduce((sum, line) => sum + Number(line.amount || 0), 0);
      const finalY = pdf.lastAutoTable ? pdf.lastAutoTable.finalY + 6 : y + 70;
      if (finalY < pageHeight - 26) {
        pdf.setDrawColor(...gold);
        pdf.setFillColor(255, 252, 244);
        pdf.roundedRect(margin, finalY, pageWidth - (margin * 2), 18, 2, 2, "FD");
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(70, 50, 25);
        pdf.text(`Total Qty: ${totalQty}`, margin + 3, finalY + 7);
        pdf.text(`Total Amount: ${money(totalAmount)}`, margin + 3, finalY + 13);
      }

      const safeFileName = String(detail.documentId || "stock-document").replace(/[\\/:*?"<>|]+/g, "_");
      pdf.save(`${safeFileName}.pdf`);
    } catch (error) {
      showToast(error.message || "Could not generate PDF");
    } finally {
      setLoading(false);
    }
  }

  function metric(label, value, note) {
    return `
      <article class="card metric-card">
        <div class="metric-label">${label}</div>
        <div class="metric-value">${value}</div>
        <div class="metric-note">${note}</div>
      </article>
    `;
  }

  function activityList(rows) {
    return rows.map((row) => `
      <p><strong>${escapeHtml(row.name || row.Name || "-")}</strong><br><span class="metric-note">${escapeHtml(row.warehouse || row.warehouseId || row["Warehouse ID"] || "-")} - ${escapeHtml(row.status || row.Status || "-")}</span></p>
    `).join("");
  }

  function documentList(rows) {
    return rows.map((row) => `
      <p><strong>${escapeHtml(row.type || row["Document Type"] || "-")} ${escapeHtml(row.ref || row["Document ID"] || "")}</strong><br><span class="metric-note">${escapeHtml(row.warehouse || row["From Warehouse ID"] || row["To Warehouse ID"] || "-")} - ${escapeHtml(row.qty || row.Quantity || 0)} books</span></p>
    `).join("");
  }

  function status(label, tone) {
    return `<span class="status ${tone}">${escapeHtml(label)}</span>`;
  }

  function money(value) {
    return `Rs. ${Number(value || 0).toLocaleString("en-IN")}`;
  }

  function setLoading(value) {
    loadingOverlay.classList.toggle("hidden", !value);
  }

  function showToast(message) {
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.textContent = message;
    toastStack.appendChild(toast);
    setTimeout(() => toast.remove(), 2800);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttribute(value) {
    return escapeHtml(value).replace(/`/g, "&#096;");
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

  function updateCurrentUser(user, sessionToken) {
    state.currentUser = user || null;
    state.sessionToken = sessionToken || "";
    appConfig.currentUserRole = user ? user.role : "";
    if (userChip) {
      userChip.textContent = user ? (user.name || (user.role === "mainAdmin" ? "Admin" : "Store Incharge")) : "Guest";
      userChip.title = user ? "Log out" : "Not signed in";
      userChip.disabled = !user;
    }
  }

  function renderAuthScreen(message) {
    document.body.classList.add("auth-mode");
    authRoot.classList.remove("hidden");
    authRoot.innerHTML = `
      <section class="auth-card">
        <h1>${window.ERP_CONFIG?.appName || "Book Distribution ERP"}</h1>
        <p>${message ? escapeHtml(message) : "Sign in with your username and password."}</p>
        <form id="loginForm" class="form-grid">
          <label class="field wide-field">
            <span>Username</span>
            <input name="username" type="text" required placeholder="admin" autocomplete="username">
          </label>
          <label class="field wide-field">
            <span>Password</span>
            <input name="password" type="password" required placeholder="Password" autocomplete="current-password">
          </label>
          <div class="form-actions">
            <button class="button" type="submit">Login</button>
          </div>
        </form>
      </section>
    `;
    document.getElementById("loginForm").addEventListener("submit", login);
  }

  function hideAuthScreen() {
    document.body.classList.remove("auth-mode");
    authRoot.classList.add("hidden");
    authRoot.innerHTML = "";
  }

  async function bootstrapApp() {
    const token = getStoredSessionToken();
    if (token) {
      try {
        const user = await window.erpApi.request("auth.me", { sessionToken: token });
        if (user && user.userId) {
          updateCurrentUser(user, token);
          hideAuthScreen();
          await navigate(state.view);
          ensureActivityMastersLoaded().catch(() => {});
          return;
        }
      } catch (error) {
        setStoredSessionToken("");
      }
    }
    updateCurrentUser(null, "");
    renderAuthScreen();
  }

  async function login(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const payload = {
      username: String(data.get("username") || "").trim(),
      password: String(data.get("password") || "")
    };

    if (!payload.username || !payload.password) {
      showToast("Enter username and password");
      return;
    }

    setLoading(true);
    try {
      const result = await window.erpApi.request("auth.login", payload);
      setStoredSessionToken(result.sessionToken);
      updateCurrentUser(result.user, result.sessionToken);
      hideAuthScreen();
      await navigate(state.view);
      ensureActivityMastersLoaded().catch(() => {});
      showToast(`Welcome, ${result.user.name}`);
    } catch (error) {
      renderAuthScreen(error.message || "Could not log in");
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
        // ignore logout failures
      }
    }
    setStoredSessionToken("");
    updateCurrentUser(null, "");
    content.innerHTML = "";
    renderAuthScreen("You have been signed out.");
  }

  window.erpApp = {
    toast: showToast,
    logout,
    navigate,
    downloadBookSample,
    importBookFile,
    downloadDevotionalItemSample,
    importDevotionalItemFile,
    setBookSearch,
    setBookStatus,
    openBookForm,
    deactivateBook,
    setDevotionalSearch,
    setDevotionalStatus,
    openDevotionalItemForm,
    deactivateDevotionalItem,
    setWarehouseSearch,
    setWarehouseStatus,
    downloadWarehouseSample,
    importWarehouseFile,
    openWarehouseForm,
    deactivateWarehouse,
    setActivitySearch,
    setActivityStatus,
    openActivityForm,
    cancelActivity,
    setActivityReportDevoteeSearch,
    setActivityReportActivitySearch,
    selectActivityReportDevotee,
    selectActivityReportActivity,
    loadActivityReport,
    downloadActivityReport,
    setReportView,
    setReportWarehouse,
    setReportMonth,
    loadWarehouseReport,
    loadWarehouseDayWiseSales,
    downloadWarehouseReport,
    downloadUnsettledIssuesReport,
    downloadComplimentaryIssuesReport,
    showUnsettledActivityDetails,
    backToUnsettledSummary,
    showComplimentaryActivityDetails,
    backToComplimentarySummary,
    setDocumentsMode,
    downloadDocumentPdf,
    showPendingSettlementDetails,
    backToPendingSettlementSummary,
    savePendingSettlementPayment,
    savePendingSettlementAdjustment,
    onPendingSettlementActionChange,
    settleActivity,
    openOpeningStockForm,
    openPurchaseForm,
    addOpeningLine,
    removeOpeningLine,
    updateOpeningLine,
    downloadOpeningSample,
    importOpeningFile,
    downloadUnsettledOpeningSample,
    importUnsettledOpeningFile,
    pickUnsettledOpeningImport,
    addPurchaseLine,
    removePurchaseLine,
    updatePurchaseLine,
    downloadPurchaseSample,
    importPurchaseFile,
    openUnsettledOpeningForm,
    addUnsettledLine,
    removeUnsettledLine,
    updateUnsettledLine,
    setBookPickerQuery,
    pickBookFromPicker,
    openIssueForm,
    openComplimentaryForm,
    openSaleForm,
    addIssueLine,
    removeIssueLine,
    updateIssueLine,
    addSaleLine,
    removeSaleLine,
    updateSaleLine,
    openReceiveForm,
    addReceiveLine,
    removeReceiveLine,
    updateReceiveLine,
    openTransferForm,
    addTransferLine,
    removeTransferLine,
    updateTransferLine,
    onIssueWarehouseChange,
    onSaleWarehouseChange,
    onTransferWarehouseChange,
    onDocumentItemGroupChange,
    openUserForm,
    closeModal
  };
  bootstrapApp();
})();
