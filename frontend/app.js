(function () {
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
    receiveDraft: {},
    receiveLines: []
  };

  const views = {
    dashboard: ["Home", "Daily view of distribution, stock, and active service.", renderDashboard],
    books: ["Books", "Book master with prices, language, category, and status.", renderBooks],
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
    state.books = await window.erpApi.request("books.list");
    return renderBooksMarkup();
  }

  function renderBooksMarkup() {
    const rows = getFilteredBooks();
    return `
      <section class="card">
        <div class="panel-header">
          <h2>Book Master</h2>
          <button class="button" type="button" onclick="window.erpApp.openBookForm()">Add Book</button>
        </div>
        <div class="panel-body">
          <div class="toolbar">
            <label class="field compact-field">
              <span>Search</span>
              <input type="search" value="${escapeAttribute(state.bookSearch)}" placeholder="Search name, language, category" oninput="window.erpApp.setBookSearch(this.value)">
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
              <th>Book ID</th>
              <th>Name</th>
              <th>Language</th>
              <th>MRP</th>
              <th>Distributor Price</th>
              <th>Category</th>
              <th>Status</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((row) => `
              <tr>
                <td>${escapeHtml(row.bookId)}</td>
                <td><strong>${escapeHtml(row.name)}</strong></td>
                <td>${escapeHtml(row.language)}</td>
                <td>${money(row.mrp)}</td>
                <td>${money(row.distributorPrice)}</td>
                <td>${escapeHtml(row.category || "-")}</td>
                <td>${status(row.active ? "Active" : "Inactive", row.active ? "good" : "warn")}</td>
                <td>
                  <div class="row-actions">
                    <button class="small-button" type="button" onclick="window.erpApp.openBookForm('${escapeAttribute(row.bookId)}')">Edit</button>
                    ${row.active ? `<button class="small-button danger" type="button" onclick="window.erpApp.deactivateBook('${escapeAttribute(row.bookId)}')">Deactivate</button>` : ""}
                  </div>
                </td>
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
    const [documents, books, warehouses, activities] = await Promise.all([
      window.erpApi.request("documents.list"),
      window.erpApi.request("books.list"),
      window.erpApi.request("warehouses.list"),
      window.erpApi.request("activities.list")
    ]);
    state.documents = documents.map(normalizeDocument);
    state.books = books;
    state.warehouses = warehouses.map(normalizeWarehouse);
    state.activities = activities.map(normalizeActivity);

    return `
      <section class="card">
        <div class="panel-header">
          <h2>Stock Documents</h2>
          <div class="row-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.openReceiveForm()">Receive Books</button>
            <button class="button" type="button" onclick="window.erpApp.openIssueForm()">Issue Books</button>
          </div>
        </div>
        <div class="panel-body">
          <div class="grid metrics">
            ${metric("Issue", "Out", "Books sent from warehouse to activity or location")}
            ${metric("Receive", "In", "Balance stock received back")}
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
                <td>${status(row.documentType, row.documentType === "ISSUE" ? "warn" : "good")}</td>
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
    return `
      <section class="card">
        <div class="panel-header"><h2>Reports</h2></div>
        <div class="panel-body">
          <div class="grid metrics">
            ${metric("Current Stock", "Ready", "Calculated from stock ledger")}
            ${metric("Warehouse Stock", "Ready", "Stock by location")}
            ${metric("Activity Summary", "Ready", "Issued, sold, returned, balance")}
            ${metric("Book-wise Sales", "Ready", "Quantity and amount by book")}
          </div>
        </div>
      </section>
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

      const haystack = [book.bookId, book.name, book.language, book.category].join(" ").toLowerCase();
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
    const book = state.books.find((item) => item.bookId === bookId) || {
      bookId: "",
      name: "",
      language: "",
      mrp: "",
      distributorPrice: "",
      category: "",
      active: true
    };
    const isEdit = Boolean(book.bookId);

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="bookFormTitle">
        <div class="modal-header">
          <h2 id="bookFormTitle">${isEdit ? "Edit Book" : "Add Book"}</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="bookForm">
          <input type="hidden" name="bookId" value="${escapeAttribute(book.bookId)}">
          <label class="field wide-field">
            <span>Book Name</span>
            <input name="name" required value="${escapeAttribute(book.name)}" placeholder="Bhagavad Gita As It Is">
          </label>
          <label class="field">
            <span>Language</span>
            <input name="language" required value="${escapeAttribute(book.language)}" placeholder="English">
          </label>
          <label class="field">
            <span>Category</span>
            <input name="category" value="${escapeAttribute(book.category)}" placeholder="Main / Small / Set">
          </label>
          <label class="field">
            <span>MRP</span>
            <input name="mrp" type="number" min="0" step="0.01" required value="${escapeAttribute(book.mrp)}">
          </label>
          <label class="field">
            <span>Distributor Price</span>
            <input name="distributorPrice" type="number" min="0" step="0.01" required value="${escapeAttribute(book.distributorPrice)}">
          </label>
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
      bookId: data.get("bookId"),
      name: data.get("name").trim(),
      language: data.get("language").trim(),
      category: data.get("category").trim(),
      mrp: Number(data.get("mrp")),
      distributorPrice: Number(data.get("distributorPrice")),
      active: data.get("active") === "on"
    };

    if (!payload.name || !payload.language) {
      showToast("Book name and language are required");
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request(payload.bookId ? "books.update" : "books.create", payload);
      closeModal();
      content.innerHTML = await renderBooks();
      showToast(payload.bookId ? "Book updated" : "Book created");
    } catch (error) {
      showToast(error.message || "Could not save book");
    } finally {
      setLoading(false);
    }
  }

  async function deactivateBook(bookId) {
    const book = state.books.find((item) => item.bookId === bookId);
    if (!book) {
      showToast("Book not found");
      return;
    }

    setLoading(true);
    try {
      await window.erpApi.request("books.delete", { bookId });
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

  function getWarehouseName(warehouseId) {
    const warehouse = state.warehouses.find((item) => item.warehouseId === warehouseId);
    return warehouse ? warehouse.name : warehouseId || "-";
  }

  function getActivityName(activityId) {
    const activity = state.activities.find((item) => item.activityId === activityId);
    return activity ? activity.name : activityId || "-";
  }

  function openIssueForm() {
    state.issueDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      fromWarehouseId: "",
      activityId: "",
      notes: ""
    };
    state.issueLines = [blankIssueLine()];
    renderIssueModal();
  }

  function blankIssueLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderIssueModal() {
    const activeBooks = state.books.filter((book) => book.active !== false);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const openActivities = state.activities.filter((activity) => activity.status !== "Completed" && activity.status !== "Cancelled");
    const draft = state.issueDraft;

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
            <select name="fromWarehouseId" required>
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
              <h3>Books</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addIssueLine()">Add Line</button>
            </div>
            ${activeBooks.length ? issueLinesMarkup(activeBooks) : '<div class="empty-state">Add active books before issuing stock.</div>'}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${activeBooks.length ? "" : "disabled"}>Post Issue</button>
          </div>
        </form>
      </section>
    `;

    document.getElementById("issueForm").addEventListener("submit", saveIssueDocument);
  }

  function issueLinesMarkup(activeBooks) {
    return `
      <div class="line-table">
        ${state.issueLines.map((line, index) => `
          <div class="line-row">
            <label class="field">
              <span>Book</span>
              <select onchange="window.erpApp.updateIssueLine(${index}, 'bookId', this.value)" required>
                <option value="">Select book</option>
                ${activeBooks.map((book) => `<option value="${escapeAttribute(book.bookId)}" ${line.bookId === book.bookId ? "selected" : ""}>${escapeHtml(book.name)} - ${escapeHtml(book.language)}</option>`).join("")}
              </select>
            </label>
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
    renderIssueModal();
  }

  function removeIssueLine(index) {
    syncIssueDraft();
    state.issueLines.splice(index, 1);
    if (!state.issueLines.length) {
      state.issueLines.push(blankIssueLine());
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
    state.receiveDraft = {
      documentDate: new Date().toISOString().slice(0, 10),
      toWarehouseId: "",
      notes: ""
    };
    state.receiveLines = [blankReceiveLine()];
    renderReceiveModal();
  }

  function blankReceiveLine() {
    return { bookId: "", quantity: 1, rate: 0 };
  }

  function renderReceiveModal() {
    const activeBooks = state.books.filter((book) => book.active !== false);
    const activeWarehouses = state.warehouses.filter((warehouse) => warehouse.active);
    const draft = state.receiveDraft;

    modalRoot.innerHTML = `
      <div class="modal-backdrop" role="presentation" onclick="window.erpApp.closeModal()"></div>
      <section class="modal wide-modal" role="dialog" aria-modal="true" aria-labelledby="receiveFormTitle">
        <div class="modal-header">
          <h2 id="receiveFormTitle">Receive Books</h2>
          <button class="icon-button" type="button" onclick="window.erpApp.closeModal()" aria-label="Close">Close</button>
        </div>
        <form class="form-grid" id="receiveForm">
          <label class="field">
            <span>Receive Date</span>
            <input name="documentDate" type="date" value="${escapeAttribute(draft.documentDate)}" required>
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
            <input name="notes" value="${escapeAttribute(draft.notes)}" placeholder="Supplier, source, or receipt note">
          </label>
          <div class="wide-field">
            <div class="line-editor-header">
              <h3>Books</h3>
              <button class="small-button" type="button" onclick="window.erpApp.addReceiveLine()">Add Line</button>
            </div>
            ${activeBooks.length ? receiveLinesMarkup(activeBooks) : '<div class="empty-state">Add active books before receiving stock.</div>'}
          </div>
          <div class="form-actions">
            <button class="button secondary" type="button" onclick="window.erpApp.closeModal()">Cancel</button>
            <button class="button" type="submit" ${activeBooks.length ? "" : "disabled"}>Post Receipt</button>
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
            <label class="field">
              <span>Book</span>
              <select onchange="window.erpApp.updateReceiveLine(${index}, 'bookId', this.value)" required>
                <option value="">Select book</option>
                ${activeBooks.map((book) => `<option value="${escapeAttribute(book.bookId)}" ${line.bookId === book.bookId ? "selected" : ""}>${escapeHtml(book.name)} - ${escapeHtml(book.language)}</option>`).join("")}
              </select>
            </label>
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
    renderReceiveModal();
  }

  function removeReceiveLine(index) {
    syncReceiveDraft();
    state.receiveLines.splice(index, 1);
    if (!state.receiveLines.length) {
      state.receiveLines.push(blankReceiveLine());
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
      documentType: "RECEIVE",
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
      showToast(`Receipt posted: ${result.documentId}`);
    } catch (error) {
      showToast(error.message || "Could not post receipt");
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
    openIssueForm,
    addIssueLine,
    removeIssueLine,
    updateIssueLine,
    openReceiveForm,
    addReceiveLine,
    removeReceiveLine,
    updateReceiveLine,
    closeModal
  };
  navigate(state.view);
})();
