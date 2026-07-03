(function () {
  const appConfig = window.ERP_CONFIG || {};
  const state = {
    view: "dashboard",
    books: [],
    bookSearch: "",
    bookStatus: "active",
    warehouses: [],
    warehouseSearch: "",
    warehouseStatus: "active",
    activities: [],
    activitySearch: "",
    activityStatus: "open",
    documents: [],
    issueDraft: {},
    issueLines: [],
    issueBookQueries: [],
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
    activityUnsettled: []
  };

  const views = {
    dashboard: ["Home", "Daily view of distribution, stock, and active service.", renderDashboard],
    books: ["Books", "Book master with ERP codes, book type, sale price, and status.", renderBooks],
    warehouses: ["Warehouses", "Main and event stock locations.", renderWarehouses],
    activities: ["Activities", "Daily stalls, marathons, events, and closing workflow.", renderActivities],
    documents: ["Stock Documents", "Issue, receive, sale, return, transfer, and adjustment entries.", renderDocuments],
    reports: ["Reports", "Current stock, activity summary, book-wise sales, and ledger.", renderReports],
    settings: ["Settings", "System configuration and backend connection.", renderSettings]
  };

  const content = document.getElementById("content");
  const title = document.getElementById("pageTitle");
  const subtitle = document.getElementById("pageSubtitle");
  const sidebar = document.getElementById("sidebar");
  const loadingOverlay = document.getElementById("loadingOverlay");
  const toastStack = document.getElementById("toastStack");
  const modalRoot = document.getElementById("modalRoot");

  document.getElementById("menuButton").addEventListener("click", () => {
    sidebar.classList.toggle("open");
  });

  document.querySelectorAll(".nav-item").forEach((item) => {
    item.addEventListener("click", () => {
      navigate(item.dataset.view);
      sidebar.classList.remove("open");
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

  function renderBooksMarkup() {
    const rows = getFilteredBooks();
    return `
      <section class="card">
        <div class="panel-header">
          <h2>Book Master</h2>
          ${isMainAdmin() ? '<button class="button" type="button" onclick="window.erpApp.openBookForm()">Add Book</button>' : ""}
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <label class="field compact-field">
              <span>Search</span>
              <input type="search" value="${escapeAttribute(state.bookSearch)}" placeholder="Search code, name, or type" oninput="window.erpApp.setBookSearch(this.value)">
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
    return `
      <section class="card">
        <div class="panel-header">
          <h2>Warehouse Master</h2>
          <button class="button" type="button" onclick="window.erpApp.openWarehouseForm()">Add Warehouse</button>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <label class="field compact-field">
              <span>Search</span>
              <input type="search" value="${escapeAttribute(state.warehouseSearch)}" placeholder="Search name, type, SPOC" oninput="window.erpApp.setWarehouseSearch(this.value)">
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
              <th>Actions</th>
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
                <td>
                  <div class="row-actions">
                    <button class="small-button" type="button" onclick="window.erpApp.openWarehouseForm('${escapeAttribute(row.warehouseId)}')">Edit</button>
                    ${row.active ? `<button class="small-button danger" type="button" onclick="window.erpApp.deactivateWarehouse('${escapeAttribute(row.warehouseId)}')">Deactivate</button>` : ""}
                  </div>
                </td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function renderActivities() {
    const [activities, warehouses] = await Promise.all([
      window.erpApi.request("activities.list"),
      window.erpApi.request("warehouses.list")
    ]);
    state.activities = activities.map(normalizeActivity);
    state.warehouses = warehouses.map(normalizeWarehouse);
    return renderActivitiesMarkup();
  }

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
              <input type="search" value="${escapeAttribute(state.activitySearch)}" placeholder="Search name, type, warehouse" oninput="window.erpApp.setActivitySearch(this.value)">
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
    const [documents, books, warehouses, activities, stock] = await Promise.all([
      window.erpApi.request("documents.list"),
      window.erpApi.request(isMainAdmin() ? "books.adminList" : "books.list"),
      window.erpApi.request("warehouses.list"),
      window.erpApi.request("activities.list"),
      window.erpApi.request("stock.current")
    ]);
    state.documents = documents.map(normalizeDocument);
    state.books = books;
    state.warehouses = warehouses.map(normalizeWarehouse);
    state.activities = activities.map(normalizeActivity);
    state.currentStock = stock.map(normalizeStockRow);

    return `
      <section class="card">
        <div class="panel-header">
          <h2>Stock Documents</h2>
          <div class="row-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.openOpeningStockForm()">Opening Stock</button>
            <button class="button secondary" type="button" onclick="window.erpApp.openUnsettledOpeningForm()">Unsettled Opening</button>
            <button class="button secondary" type="button" onclick="window.erpApp.openReceiveForm()">Return Books</button>
            <button class="button secondary" type="button" onclick="window.erpApp.openTransferForm()">Transfer Books</button>
            <button class="button" type="button" onclick="window.erpApp.openIssueForm()">Issue Books</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="grid metrics">
            ${metric("Issue", "Out", "Books sent from warehouse to activity or location")}
            ${metric("Return", "In", "Books received back from an issued activity")}
            ${metric("Sale", "Out", "Books distributed and amount recorded")}
            ${metric("Return", "In", "Returned books restored or marked damaged")}
          </div>
          <div class="section-gap">
            ${state.documents.length ? documentsTable(state.documents) : '<div class="empty-state">No stock documents found.</div>'}
          </div>
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
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  async function renderReports() {
    const [stock, books, warehouses, unsettled] = await Promise.all([
      window.erpApi.request("stock.current"),
      window.erpApi.request(isMainAdmin() ? "books.adminList" : "books.list"),
      window.erpApi.request("warehouses.list"),
      window.erpApi.request("activity.unsettled")
    ]);
    state.currentStock = stock.map(normalizeStockRow);
    state.books = books;
    state.warehouses = warehouses.map(normalizeWarehouse);
    state.activityUnsettled = unsettled.map(normalizeActivityUnsettled);
    const totalQuantity = state.currentStock.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
    const activeWarehouses = new Set(state.currentStock.filter((row) => Number(row.quantity || 0) !== 0).map((row) => row.warehouseId)).size;
    const unsettledQuantity = state.activityUnsettled.reduce((sum, row) => sum + Number(row.unsettledQty || 0), 0);
    const unsettledActivities = new Set(state.activityUnsettled.filter((row) => Number(row.unsettledQty || 0) > 0).map((row) => row.activityId)).size;

    return `
      <section class="card">
        <div class="panel-header"><h2>Reports</h2></div>
        <div class="panel-body">
          <div class="grid metrics">
            ${metric("Current Stock", totalQuantity, "Books available across warehouses")}
            ${metric("Warehouse Stock", activeWarehouses, "Warehouses with non-zero stock")}
            ${metric("Unsettled Qty", unsettledQuantity, "Open quantity by activity")}
            ${metric("Activities Open", unsettledActivities, "Activities with unsettled balance")}
            ${metric("Book-wise Sales", "Ready", "Quantity and amount by book")}
          </div>
          <div class="section-gap">
            <div class="panel-header compact-header">
              <h2>Current Stock</h2>
            </div>
            ${state.currentStock.length ? currentStockTable(state.currentStock) : '<div class="empty-state">No stock ledger entries yet.</div>'}
          </div>
          <div class="section-gap">
            <div class="panel-header compact-header">
              <h2>Activity Unsettled</h2>
            </div>
            ${state.activityUnsettled.length ? activityUnsettledTable(state.activityUnsettled) : '<div class="empty-state">No activity unsettled entries yet.</div>'}
          </div>
        </div>
      </section>
    `;
  }

  function currentStockTable(rows) {
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
    return `
      <section class="card">
        <div class="panel-header"><h2>Backend Connection</h2></div>
        <div class="panel-body">
          <table>
            <tbody>
              <tr><th>App Name</th><td>${escapeHtml(config.appName)}</td></tr>
              <tr><th>API URL</th><td>${escapeHtml(config.apiBaseUrl || "Not connected yet")}</td></tr>
              <tr><th>Mode</th><td>${config.mockMode ? "Mock data" : "Live Apps Script"}</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
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

  function setBookSearch(value) {
    state.bookSearch = value;
    content.innerHTML = renderBooksMarkup();
  }

  function setBookStatus(value) {
    state.bookStatus = value;
    content.innerHTML = renderBooksMarkup();
  }

  function openBookForm(bookId) {
    const book = state.books.find((item) => item.bookId === bookId || item.erpCode === bookId) || {
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
            <span>Book Name</span>
            <input name="name" required value="${escapeAttribute(book.name)}" placeholder="Bhagavad Gita As It Is">
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
          <label class="check-field">
            <input name="active" type="checkbox" ${book.active ? "checked" : ""}>
            <span>Active</span>
          </label>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit">${isEdit ? "Save Changes" : "Create Book"}</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("bookForm").addEventListener("submit", saveBook);
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
      active: data.get("active") === "on"
    };

    if (!payload.erpCode || !payload.name || !payload.bookType) {
      showToast("ERP code, book name, and book type are required");
      return;
    }

    setLoading(true);
    try {
      const existing = state.books.some((book) => (book.erpCode || book.bookId) === payload.erpCode);
      await window.erpApi.request(existing ? "books.update" : "books.create", payload);
      closeModal();
      content.innerHTML = await renderBooks();
      showToast(existing ? "Book updated" : "Book created");
    } catch (error) {
      showToast(error.message || "Could not save book");
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
    content.innerHTML = renderWarehousesMarkup();
  }

  function setWarehouseStatus(value) {
    state.warehouseStatus = value;
    content.innerHTML = renderWarehousesMarkup();
  }

  function openWarehouseForm(warehouseId) {
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
      const haystack = [activity.activityId, activity.name, activity.type, activity.spoc, getWarehouseName(activity.warehouseId)].join(" ").toLowerCase();
      return matchesStatus && (!query || haystack.includes(query));
    });
  }

  function setActivitySearch(value) {
    state.activitySearch = value;
    content.innerHTML = renderActivitiesMarkup();
  }

  function setActivityStatus(value) {
    state.activityStatus = value;
    content.innerHTML = renderActivitiesMarkup();
  }

  function openActivityForm(activityId) {
    const activity = state.activities.find((item) => item.activityId === activityId) || {
      activityId: "",
      name: "",
      type: "Stall",
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
              ${["Stall", "Daily", "Event", "Marathon", "Festival"].map((type) => `<option value="${type}" ${activity.type === type ? "selected" : ""}>${type}</option>`).join("")}
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

  function normalizeStockRow(row) {
    return {
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      bookId: row.bookId || row["Book ID"] || "",
      quantity: Number(row.quantity || row.Quantity || 0)
    };
  }

  function normalizeActivityUnsettled(row) {
    return {
      activityId: row.activityId || row["Activity ID"] || "",
      bookId: row.bookId || row["Book ID"] || "",
      warehouseId: row.warehouseId || row["Warehouse ID"] || "",
      issuedQty: Number(row.issuedQty || row["Issued Qty"] || 0),
      returnedQty: Number(row.returnedQty || row["Returned Qty"] || 0),
      soldQty: Number(row.soldQty || row["Sold Qty"] || 0),
      complimentaryQty: Number(row.complimentaryQty || row["Complimentary Qty"] || 0),
      unsettledQty: Number(row.unsettledQty || row["Unsettled Qty"] || 0)
    };
  }

  function getWarehouseName(warehouseId) {
    const warehouse = state.warehouses.find((item) => item.warehouseId === warehouseId);
    return warehouse ? warehouse.name : warehouseId || "-";
  }

  function getBook(bookId) {
    return state.books.find((item) => item.bookId === bookId || item.erpCode === bookId || item["ERP Code"] === bookId || item["Book ID"] === bookId) || {};
  }

  function getBookName(bookId) {
    const book = getBook(bookId);
    return book.name || book["Book Name"] || bookId || "-";
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
    line.rate = Number(line.rate || 0);
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
        if (warehouseId && getAvailableStock(warehouseId, bookId) <= 0) {
          return false;
        }
        if (!needle) return true;
        const haystack = [bookId, book.name, book["Book Name"], getBookType(book)].join(" ").toLowerCase();
        return haystack.indexOf(needle) !== -1;
      })
      .slice(0, 12);
  }

  function bookPickerMarkup(kind, index, activeBooks, line, query, warehouseId) {
    const bookId = line.bookId || "";
    const selectedBook = bookId ? getBook(bookId) : null;
    const activeQuery = String(query || "");
    const filteredBooks = filterBooksForPicker(activeBooks, activeQuery, warehouseId);
    const availabilityHint = warehouseId ? `Stock at ${getWarehouseName(warehouseId)}` : "Type to search";
    return `
      <div class="book-picker">
        <label class="field">
          <span>Search Book</span>
          <input
            type="search"
            data-book-picker="${kind}-${index}"
            value="${escapeAttribute(activeQuery || (selectedBook ? getBookPickerDisplayLabel(selectedBook) : ""))}"
            placeholder="Type ERP code or name"
            autocomplete="off"
            oninput="window.erpApp.setBookPickerQuery('${kind}', ${index}, this.value)">
        </label>
        <div class="book-picker-results">
          ${filteredBooks.length ? filteredBooks.map((book) => {
            const itemId = book.erpCode || book.bookId;
            const selected = itemId === bookId;
            const avail = warehouseId ? getAvailableStock(warehouseId, itemId) : null;
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

  function activityUnsettledTable(rows) {
    return `
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Activity</th>
              <th>Warehouse</th>
              <th>Book</th>
              <th>Issued</th>
              <th>Returned</th>
              <th>Sold</th>
              <th>Complimentary</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .slice()
              .sort((a, b) => getActivityName(a.activityId).localeCompare(getActivityName(b.activityId)) || getBookName(a.bookId).localeCompare(getBookName(b.bookId)))
              .map((row) => `
                <tr>
                  <td>${escapeHtml(getActivityName(row.activityId))}</td>
                  <td>${escapeHtml(getWarehouseName(row.warehouseId))}</td>
                  <td>${escapeHtml(getBookName(row.bookId))}</td>
                  <td>${Number(row.issuedQty || 0)}</td>
                  <td>${Number(row.returnedQty || 0)}</td>
                  <td>${Number(row.soldQty || 0)}</td>
                  <td>${Number(row.complimentaryQty || 0)}</td>
                  <td><strong>${Number(row.unsettledQty || 0)}</strong></td>
                </tr>
              `).join("")}
          </tbody>
        </table>
      </div>
    `;
  }

  function getDocumentLineByKind(kind, index) {
    if (kind === "issue") return state.issueLines[index];
    if (kind === "receive") return state.receiveLines[index];
    if (kind === "transfer") return state.transferLines[index];
    if (kind === "opening") return state.openingLines[index];
    if (kind === "unsettled") return state.unsettledLines[index];
    return null;
  }

  function rerenderDocumentModal(kind, index, value) {
    if (kind === "issue") {
      renderIssueModal();
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
    return appConfig.currentUserRole === "mainAdmin";
  }

  function getActivityName(activityId) {
    const activity = state.activities.find((item) => item.activityId === activityId);
    return activity ? activity.name : activityId || "-";
  }

  function documentTone(documentType) {
    const toneByType = {
      OPENING: "good",
      UNSETTLED_OPENING: "good",
      RECEIVE: "good",
      RETURN: "good",
      TRANSFER: "warn",
      ISSUE: "warn",
      COMPLIMENTARY: "bad",
      SALE: "bad",
      ADJUSTMENT: "warn"
    };
    return toneByType[documentType] || "warn";
  }

  function openIssueForm() {
    state.issueDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      fromWarehouseId: "",
      activityId: "",
      notes: ""
    };
    state.issueLines = [blankIssueLine()];
    state.issueBookQueries = [""];
    renderIssueModal();
  }

  function blankIssueLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function openOpeningStockForm() {
    state.openingDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      toWarehouseId: state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || "",
      notes: "Opening stock as on date"
    };
    state.openingLines = [blankOpeningLine()];
    state.openingBookQueries = [""];
    renderOpeningStockModal();
  }

  function blankOpeningLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderOpeningStockModal() {
    const activeBooks = state.books.filter((book) => book.active !== false);
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
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Opening stock note">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>Books</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addOpeningLine()">Add Line</button>
            </div>
            ${activeBooks.length ? openingLinesMarkup(activeBooks) : '<div class="empty-state">Add active books before posting opening stock.</div>'}
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

  function openingLinesMarkup(activeBooks) {
    return `
      <div class="line-table">
        ${state.openingLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("opening", index, activeBooks, line, state.openingBookQueries[index] || "")}
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
      notes: data.get("notes") || ""
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
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Opening stock posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post opening stock");
    } finally {
      setLoading(false);
    }
  }

  function openUnsettledOpeningForm() {
    state.unsettledDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      fromWarehouseId: state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || "",
      activityId: "",
      notes: "Legacy unsettled issue opening"
    };
    state.unsettledLines = [blankUnsettledLine()];
    state.unsettledBookQueries = [""];
    renderUnsettledOpeningModal();
  }

  function blankUnsettledLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderUnsettledOpeningModal() {
    const activeBooks = state.books.filter((book) => book.active !== false);
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
              <h3>Books</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addUnsettledLine()">Add Line</button>
            </div>
            ${activeBooks.length ? unsettledLinesMarkup(activeBooks) : '<div class="empty-state">Add active books before posting unsettled opening stock.</div>'}
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

  function unsettledLinesMarkup(activeBooks) {
    return `
      <div class="line-table">
        ${state.unsettledLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("unsettled", index, activeBooks, line, state.unsettledBookQueries[index] || "")}
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
      notes: data.get("notes") || ""
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
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Unsettled opening posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post unsettled opening stock");
    } finally {
      setLoading(false);
    }
  }

  function renderIssueModal() {
    const activeBooks = state.books.filter((book) => book.active !== false);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const openActivities = state.activities.filter((activity) => activity.status !== "Completed" && activity.status !== "Cancelled");
    const draft = state.issueDraft;
    const fromWarehouseId = draft.fromWarehouseId || "";
    const booksWithStock = fromWarehouseId
      ? activeBooks.filter((book) => getAvailableStock(fromWarehouseId, book.erpCode || book.bookId) > 0)
      : [];

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="issueFormTitle">
        <div class="modal-header">
          <h2 id="issueFormTitle">Issue Books</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="issueForm">
          <label class="field">
            <span>Issue Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
          </label>
          <label class="field">
            <span>From Warehouse</span>
            <select name="fromWarehouseId" required onchange="window.erpApp.onIssueWarehouseChange(this.value)">
              <option value="">Select warehouse</option>
              ${activeWarehouses.map((warehouse) => `<option value="${escapeAttribute(warehouse.warehouseId)}" ${draft.fromWarehouseId === warehouse.warehouseId ? "selected" : ""}>${escapeHtml(warehouse.name)}</option>`).join("")}
            </select>
          </label>
          <label class="field wide-field">
            <span>Activity</span>
            <select name="activityId" required>
              <option value="">Select activity</option>
              ${openActivities.map((activity) => `<option value="${escapeAttribute(activity.activityId)}" ${draft.activityId === activity.activityId ? "selected" : ""}>${escapeHtml(activity.name)} (${escapeHtml(getWarehouseName(activity.warehouseId))})</option>`).join("")}
            </select>
          </label>
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Optional issue note">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>Books${fromWarehouseId ? ` (Stock at ${getWarehouseName(fromWarehouseId)})` : ""}</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addIssueLine()">Add Line</button>
            </div>
            ${booksWithStock.length ? issueLinesMarkup(booksWithStock, fromWarehouseId) : '<div class="empty-state">' + (fromWarehouseId ? `No books with available stock at ${getWarehouseName(fromWarehouseId)}.` : "Select a warehouse to see available books.") + '</div>'}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${booksWithStock.length ? "" : "disabled"}>Post Issue</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("issueForm").addEventListener("submit", saveIssueDocument);
  }

  function issueLinesMarkup(activeBooks, fromWarehouseId) {
    return `
      <div class="line-table">
        ${state.issueLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("issue", index, activeBooks, line, state.issueBookQueries[index] || "", fromWarehouseId)}
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
      notes: data.get("notes") || ""
    };
  }

  async function saveIssueDocument(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
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
      documentType: "ISSUE",
      documentDate: data.get("documentDate"),
      fromWarehouseId: data.get("fromWarehouseId"),
      activityId: data.get("activityId"),
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Issue posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post issue");
    } finally {
      setLoading(false);
    }
  }

  function openReceiveForm() {
    const activityId = getIssuedActivityOptions()[0]?.activityId || "";
    state.receiveDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      toWarehouseId: state.warehouses.find((warehouse) => warehouse.name === "GMB Main")?.warehouseId || "",
      activityId,
      notes: ""
    };
    state.receiveLines = [blankReceiveLine()];
    state.receiveBookQueries = [""];
    renderReceiveModal();
  }

  function blankReceiveLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderReceiveModal() {
    const activeBooks = state.books.filter((book) => book.active !== false);
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
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>Books</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addReceiveLine()">Add Line</button>
            </div>
            ${activeBooks.length ? receiveLinesMarkup(activeBooks) : '<div class="empty-state">Add active books before posting returns.</div>'}
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

  function receiveLinesMarkup(activeBooks) {
    return `
      <div class="line-table">
        ${state.receiveLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("receive", index, activeBooks, line, state.receiveBookQueries[index] || "")}
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
      notes: data.get("notes") || ""
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
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
      closeModal();
      content.innerHTML = await renderDocuments();
      showToast(`Return posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post receipt");
    } finally {
      setLoading(false);
    }
  }

  function openTransferForm() {
    state.transferDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      fromWarehouseId: "",
      toWarehouseId: "",
      notes: ""
    };
    state.transferLines = [blankTransferLine()];
    state.transferBookQueries = [""];
    renderTransferModal();
  }

  function blankTransferLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderTransferModal() {
    const activeBooks = state.books.filter((book) => book.active !== false);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const draft = state.transferDraft;
    const fromWarehouseId = draft.fromWarehouseId || "";
    const booksWithStock = fromWarehouseId
      ? activeBooks.filter((book) => getAvailableStock(fromWarehouseId, book.erpCode || book.bookId) > 0)
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
          <label class="field wide-field">
            <span>Notes</span>
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Vehicle, person, or transfer reference">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>Books${fromWarehouseId ? ` (Stock at ${getWarehouseName(fromWarehouseId)})` : ""}</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addTransferLine()">Add Line</button>
            </div>
            ${booksWithStock.length ? transferLinesMarkup(booksWithStock, fromWarehouseId) : '<div class="empty-state">' + (fromWarehouseId ? `No books with available stock at ${getWarehouseName(fromWarehouseId)}.` : "Select a source warehouse to see available books.") + '</div>'}
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

  function transferLinesMarkup(activeBooks, fromWarehouseId) {
    return `
      <div class="line-table">
        ${state.transferLines.map((line, index) => `
          <div class="line-row">
            ${bookPickerMarkup("transfer", index, activeBooks, line, state.transferBookQueries[index] || "", fromWarehouseId)}
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
      notes: data.get("notes") || ""
    };
  }

  function onIssueWarehouseChange(warehouseId) {
    syncIssueDraft();
    state.issueDraft.fromWarehouseId = warehouseId;
    state.issueLines = [blankIssueLine()];
    renderIssueModal();
  }

  function onTransferWarehouseChange(warehouseId) {
    syncTransferDraft();
    state.transferDraft.fromWarehouseId = warehouseId;
    state.transferLines = [blankTransferLine()];
    renderTransferModal();
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
      status: "Posted",
      notes: data.get("notes").trim(),
      lines
    };

    setLoading(true);
    try {
      const result = await window.erpApi.request("documents.create", payload);
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

  window.erpApp = {
    toast: showToast,
    navigate,
    setBookSearch,
    setBookStatus,
    openBookForm,
    deactivateBook,
    setWarehouseSearch,
    setWarehouseStatus,
    openWarehouseForm,
    deactivateWarehouse,
    setActivitySearch,
    setActivityStatus,
    openActivityForm,
    cancelActivity,
    openOpeningStockForm,
    addOpeningLine,
    removeOpeningLine,
    updateOpeningLine,
    openUnsettledOpeningForm,
    addUnsettledLine,
    removeUnsettledLine,
    updateUnsettledLine,
    setBookPickerQuery,
    pickBookFromPicker,
    openIssueForm,
    addIssueLine,
    removeIssueLine,
    updateIssueLine,
    openReceiveForm,
    addReceiveLine,
    removeReceiveLine,
    updateReceiveLine,
    openTransferForm,
    addTransferLine,
    removeTransferLine,
    updateTransferLine,
    onIssueWarehouseChange,
    onTransferWarehouseChange,
    closeModal
  };
  navigate(state.view);
})();
