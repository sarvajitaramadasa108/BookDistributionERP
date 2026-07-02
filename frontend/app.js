(function () {
  const state = {
    view: "dashboard",
    books: [],
    bookSearch: "",
    bookStatus: "active",
    warehouses: [],
    warehouseSearch: "",
    warehouseStatus: "active"
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
    const rows = await window.erpApi.request("activities.list");
    return tableSection("Activities", "Create Activity", ["Activity ID", "Name", "Type", "Warehouse", "Status"], rows.map((row) => [
      row.activityId || row["Activity ID"],
      row.name || row.Name,
      row.type || row.Type,
      row.warehouse || row.warehouseId || row["Warehouse ID"] || "-",
      status(row.status || row.Status || "-", (row.status || row.Status) === "Running" ? "good" : "warn")
    ]));
  }

  async function renderDocuments() {
    return `
      <section class="card">
        <div class="panel-header">
          <h2>Stock Document Flow</h2>
          <button class="button" type="button" onclick="window.erpApp.toast('Document entry screen comes next')">New Document</button>
        </div>
        <div class="panel-body">
          <div class="grid metrics">
            ${metric("Issue", "Out", "Books sent from warehouse to activity or location")}
            ${metric("Receive", "In", "Balance stock received back")}
            ${metric("Sale", "Out", "Books distributed and amount recorded")}
            ${metric("Return", "In", "Returned books restored or marked damaged")}
          </div>
        </div>
      </section>
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
    closeModal
  };
  navigate(state.view);
})();
