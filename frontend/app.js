(function () {
  const state = { view: "dashboard" };

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
    const rows = await window.erpApi.request("books.list");
    return tableSection("Book Master", "Add Book", ["Book ID", "Name", "Language", "MRP", "Distributor Price", "Category", "Status"], rows.map((row) => [
      row.bookId,
      row.name,
      row.language,
      money(row.mrp),
      money(row.distributorPrice),
      row.category,
      status(row.active ? "Active" : "Inactive", row.active ? "good" : "warn")
    ]));
  }

  async function renderWarehouses() {
    const rows = await window.erpApi.request("warehouses.list");
    return tableSection("Warehouse Master", "Add Warehouse", ["Warehouse ID", "Name", "Type", "SPOC", "Mobile", "Status"], rows.map((row) => [
      row.warehouseId,
      row.name,
      row.type,
      row.spoc || "-",
      row.mobile || "-",
      status(row.active ? "Active" : "Inactive", row.active ? "good" : "warn")
    ]));
  }

  async function renderActivities() {
    const rows = await window.erpApi.request("activities.list");
    return tableSection("Activities", "Create Activity", ["Activity ID", "Name", "Type", "Warehouse", "Status"], rows.map((row) => [
      row.activityId,
      row.name,
      row.type,
      row.warehouse,
      status(row.status, row.status === "Running" ? "good" : "warn")
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
      <p><strong>${escapeHtml(row.name)}</strong><br><span class="metric-note">${escapeHtml(row.warehouse)} - ${escapeHtml(row.status)}</span></p>
    `).join("");
  }

  function documentList(rows) {
    return rows.map((row) => `
      <p><strong>${escapeHtml(row.type)} ${escapeHtml(row.ref)}</strong><br><span class="metric-note">${escapeHtml(row.warehouse)} - ${row.qty} books</span></p>
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

  window.erpApp = { toast: showToast, navigate };
  navigate(state.view);
})();

