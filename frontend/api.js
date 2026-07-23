(function () {
  const config = window.ERP_CONFIG || {};

  const mockSeed = {
    dashboard: {
      todaySales: 18500,
      todayBooks: 342,
      runningActivities: 4,
      totalStock: 12840,
      recentActivities: [
        { name: "Simhachalam Stall", warehouse: "Simhachalam", status: "Running" },
        { name: "Annavaram Daily Stall", warehouse: "Annavaram", status: "Running" },
        { name: "Book Marathon", warehouse: "GMB Main", status: "Draft" }
      ],
      recentDocuments: [
        { type: "ISSUE", ref: "DOC-1004", warehouse: "GMB Main", qty: 250 },
        { type: "SALE", ref: "DOC-1005", warehouse: "Simhachalam", qty: 84 },
        { type: "RETURN", ref: "DOC-1006", warehouse: "Annavaram", qty: 18 }
      ]
    },
    books: [
      { bookId: "PRB-00074", erpCode: "PRB-00074", name: "Tel - Bhagavad Gita", bookType: "Maha Big Books", salePrice: 350, purchasePrice: 197.56, active: true },
      { bookId: "PRB-00072", erpCode: "PRB-00072", name: "Tel - Beyond Birth and Death", bookType: "Small Books", salePrice: 20, purchasePrice: 12.5, active: true },
      { bookId: "PRB-00069", erpCode: "PRB-00069", name: "Tel - Bhagavad Jyothi", bookType: "Medium Books", salePrice: 55, purchasePrice: 30, active: true }
    ],
    warehouses: [
      { warehouseId: "WH-001", name: "GMB Main", type: "Main", spoc: "Admin", mobile: "", active: true },
      { warehouseId: "WH-002", name: "Annavaram", type: "Event", spoc: "", mobile: "", active: true },
      { warehouseId: "WH-003", name: "Simhachalam", type: "Event", spoc: "", mobile: "", active: true },
      { warehouseId: "WH-004", name: "Kakinada", type: "Event", spoc: "", mobile: "", active: true }
    ],
    devotees: [
      { devoteeId: "DEV-0001", devoteeName: "HG NCBP", active: true },
      { devoteeId: "DEV-0002", devoteeName: "YDRP", active: true },
      { devoteeId: "DEV-0003", devoteeName: "VKTP", active: true },
      { devoteeId: "DEV-0004", devoteeName: "ABRP", active: true },
      { devoteeId: "DEV-0005", devoteeName: "SRSP", active: true },
      { devoteeId: "DEV-0006", devoteeName: "SYMP", active: true },
      { devoteeId: "DEV-0007", devoteeName: "KKRP", active: true },
      { devoteeId: "DEV-0008", devoteeName: "GPVP", active: true },
      { devoteeId: "DEV-0009", devoteeName: "RVRP", active: true },
      { devoteeId: "DEV-0010", devoteeName: "ADKP", active: true },
      { devoteeId: "DEV-0011", devoteeName: "GDHP", active: true },
      { devoteeId: "DEV-0012", devoteeName: "ISKP", active: true },
      { devoteeId: "DEV-0013", devoteeName: "NVKP", active: true },
      { devoteeId: "DEV-0014", devoteeName: "SDGP", active: true },
      { devoteeId: "DEV-0015", devoteeName: "NTHP", active: true },
      { devoteeId: "DEV-0016", devoteeName: "RMPP", active: true },
      { devoteeId: "DEV-0017", devoteeName: "SJRD", active: true },
      { devoteeId: "DEV-0018", devoteeName: "BDCP", active: true },
      { devoteeId: "DEV-0019", devoteeName: "GVBP", active: true },
      { devoteeId: "DEV-0020", devoteeName: "MKGP", active: true }
    ],
    activities: [
      { activityId: "ACT-001", name: "Simhachalam Stall", type: "Stall", devoteeId: "DEV-0007", devoteeName: "KKRP", warehouse: "Simhachalam", status: "Running" },
      { activityId: "ACT-002", name: "Annavaram Daily Stall", type: "Daily", devoteeId: "DEV-0010", devoteeName: "ADKP", warehouse: "Annavaram", status: "Running" }
    ],
    documents: [],
    requests: [],
    onlineClasses: [],
    users: [
      { userId: "USR-0001", name: "Admin", username: "admin", password: "admin123", role: "mainAdmin", active: true },
      { userId: "USR-0002", name: "Store Incharge", username: "incharge", password: "incharge123", role: "storeIncharge", active: true }
    ],
    sessions: {}
  };

  const mockData = loadMockData();

  async function request(action, payload) {
    const requestPayload = { ...(payload || {}) };
    if (action !== "auth.login" && action !== "system.setup") {
      requestPayload.sessionToken = getSessionToken();
    }
    if (config.mockMode || !config.apiBaseUrl) {
      return mockResponse(action, requestPayload);
    }

    const response = await fetch(config.apiBaseUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload: requestPayload })
    });

    const raw = await response.text();
    let result;
    try {
      result = raw ? JSON.parse(raw) : {};
    } catch (error) {
      const preview = raw ? raw.trim().slice(0, 180) : "Empty response";
      throw new Error(`Backend returned non-JSON response: ${preview}`);
    }

    if (!response.ok || !result.ok) {
      throw new Error(result.error || `Request failed (${response.status})`);
    }
    return result.data;
  }

  async function mockResponse(action, payload) {
    await new Promise((resolve) => setTimeout(resolve, 160));
    const routes = {
      "dashboard.summary": mockData.dashboard,
      "books.list": mockData.books,
      "books.adminList": mockData.books,
      "books.create": () => createMockBook(payload),
      "books.update": () => updateMockBook(payload),
      "books.delete": () => deleteMockBook(payload),
      "books.bulkUpsert": () => bulkUpsertMockBooks(payload),
      "warehouses.list": mockData.warehouses,
      "devotees.list": mockData.devotees,
      "users.list": mockData.users.map(({ password, ...user }) => user),
      "auth.me": () => mockAuthMe(payload),
      "auth.login": () => mockAuthLogin(payload),
      "auth.logout": () => mockAuthLogout(payload),
      "users.create": () => createMockUser(payload),
      "users.update": () => updateMockUser(payload),
      "warehouses.create": () => createMockWarehouse(payload),
      "warehouses.update": () => updateMockWarehouse(payload),
      "warehouses.delete": () => deleteMockWarehouse(payload),
      "activities.list": mockData.activities,
      "activities.create": () => createMockActivity(payload),
      "activities.update": () => updateMockActivity(payload),
      "activities.delete": () => deleteMockActivity(payload),
      "documents.list": mockData.documents,
      "documents.create": () => createMockDocument(payload),
      "catalog.items": () => getMockCatalogItems(payload),
      "catalog.submit": () => createMockCatalogRequest(payload),
      "requests.list": () => mockData.requests.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
      "onlineClasses.warehouseBooks": () => getMockOnlineClassWarehouseBooks(payload),
      "onlineClasses.list": mockData.onlineClasses.slice().sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || ""))),
      "onlineClasses.submit": () => createMockOnlineClassRegistration(payload),
      "stock.current": () => getMockCurrentStock(),
      "activity.unsettled": () => getMockActivityUnsettled(),
      "reports.activityLedger": () => getMockActivityLedger(payload)
    };
    const handler = routes[action];
    return typeof handler === "function" ? handler() : handler || [];
  }

  function loadMockData() {
    try {
      const saved = window.localStorage.getItem("hkm-book-erp-mock-data");
      if (saved) {
        return migrateMockData(JSON.parse(saved));
      }
    } catch (error) {
      console.warn("Could not read mock data", error);
    }
    return JSON.parse(JSON.stringify(mockSeed));
  }

  function migrateMockData(data) {
    const clone = JSON.parse(JSON.stringify(mockSeed));
    const source = data || {};
    clone.dashboard = source.dashboard || clone.dashboard;
    clone.books = Array.isArray(source.books) && source.books.length ? source.books : clone.books;
    clone.warehouses = Array.isArray(source.warehouses) && source.warehouses.length ? source.warehouses : clone.warehouses;
    clone.devotees = Array.isArray(source.devotees) && source.devotees.length ? source.devotees : clone.devotees;
    clone.activities = Array.isArray(source.activities) && source.activities.length
      ? source.activities.map((activity) => ({
          ...activity,
          devoteeId: activity.devoteeId || "",
          devoteeName: activity.devoteeName || getMockDevoteeName(activity.devoteeId)
        }))
      : clone.activities;
    clone.documents = Array.isArray(source.documents) ? source.documents : clone.documents;
    clone.requests = Array.isArray(source.requests) ? source.requests : clone.requests;
    clone.onlineClasses = Array.isArray(source.onlineClasses) ? source.onlineClasses : clone.onlineClasses;
    clone.users = Array.isArray(source.users) && source.users.length ? source.users : clone.users;
    clone.sessions = source.sessions || clone.sessions;
    return clone;
  }

  function saveMockData() {
    try {
      window.localStorage.setItem("hkm-book-erp-mock-data", JSON.stringify(mockData));
    } catch (error) {
      console.warn("Could not save mock data", error);
    }
  }

  function getSessionToken() {
    try {
      return window.localStorage.getItem("hkm-session-token") || config.sessionToken || "";
    } catch (error) {
      return config.sessionToken || "";
    }
  }

  function mockAuthLogin(payload) {
    const username = String(payload.username || "").trim().toLowerCase();
    const password = String(payload.password || "");
    const user = mockData.users.find((item) => String(item.username || "").trim().toLowerCase() === username);
    if (!user || !user.active) {
      throw new Error("Invalid username or password");
    }
    if (String(user.password || "") !== password) {
      throw new Error("Invalid username or password");
    }
    const token = `mock-${user.username}`;
    mockData.sessions[token] = { userId: user.userId, name: user.name, username: user.username, role: user.role };
    saveMockData();
    return {
      sessionToken: token,
      user: { userId: user.userId, name: user.name, username: user.username, role: user.role, active: user.active }
    };
  }

  function mockAuthMe(payload) {
    const session = mockData.sessions[payload.sessionToken];
    if (!session) {
      return null;
    }
    const user = mockData.users.find((item) => item.userId === session.userId);
    return user ? { userId: user.userId, name: user.name, username: user.username, role: user.role, active: user.active } : null;
  }

  function mockAuthLogout(payload) {
    if (payload.sessionToken && mockData.sessions[payload.sessionToken]) {
      delete mockData.sessions[payload.sessionToken];
      saveMockData();
    }
    return { ok: true };
  }

  function createMockUser(payload) {
    const user = normalizeMockUser(payload);
    user.userId = nextMockId("USR", mockData.users, "userId");
    mockData.users.push(user);
    saveMockData();
    return { ...user, password: undefined };
  }

  function updateMockUser(payload) {
    const index = mockData.users.findIndex((item) => item.userId === payload.userId);
    if (index === -1) {
      throw new Error("User not found");
    }
    const current = mockData.users[index];
    const updated = { ...current, ...normalizeMockUser(payload), userId: current.userId };
    if (!payload.password) {
      updated.password = current.password;
    }
    mockData.users[index] = updated;
    saveMockData();
    const { password, ...safe } = updated;
    return safe;
  }

  function normalizeMockUser(payload) {
    return {
      userId: payload.userId || "",
      name: String(payload.name || "").trim(),
      username: String(payload.username || "").trim(),
      password: String(payload.password || "").trim(),
      role: String(payload.role || "storeIncharge").trim(),
      active: payload.active !== false
    };
  }

  function createMockBook(payload) {
    const book = normalizeMockBook(payload);
    book.bookId = book.erpCode;
    mockData.books.push(book);
    saveMockData();
    return book;
  }

  function updateMockBook(payload) {
    const erpCode = payload.erpCode || payload.bookId;
    const index = mockData.books.findIndex((book) => book.erpCode === erpCode || book.bookId === erpCode);
    if (index === -1) {
      throw new Error("Book not found");
    }
    mockData.books[index] = { ...mockData.books[index], ...normalizeMockBook(payload), bookId: erpCode, erpCode };
    saveMockData();
    return mockData.books[index];
  }

  function deleteMockBook(payload) {
    const erpCode = payload.erpCode || payload.bookId;
    const book = mockData.books.find((item) => item.erpCode === erpCode || item.bookId === erpCode);
    if (!book) {
      throw new Error("Book not found");
    }
    book.active = false;
    saveMockData();
    return book;
  }

  function bulkUpsertMockBooks(payload) {
    const result = { created: 0, updated: 0, total: (payload.books || []).length };
    (payload.books || []).forEach((item) => {
      const erpCode = item.erpCode || item["ERP Code"];
      const existing = mockData.books.some((book) => book.erpCode === erpCode || book.bookId === erpCode);
      if (existing) {
        updateMockBook({ ...item, erpCode });
        result.updated += 1;
      } else {
        createMockBook({ ...item, erpCode });
        result.created += 1;
      }
    });
    return result;
  }

  function normalizeMockBook(payload) {
    const erpCode = String(payload.erpCode || payload.bookId || payload["ERP Code"] || "").trim();
    return {
      bookId: erpCode,
      erpCode,
      name: String(payload.name || payload["Book Name"] || "").trim(),
      bookType: String(payload.bookType || payload.category || payload["Book Type"] || "").trim(),
      salePrice: Number(payload.salePrice || payload.mrp || payload["Sale Price"] || 0),
      purchasePrice: Number(payload.purchasePrice || payload.distributorPrice || payload["Purchase Price"] || 0),
      category: String(payload.bookType || payload.category || payload["Book Type"] || "").trim(),
      mrp: Number(payload.salePrice || payload.mrp || payload["Sale Price"] || 0),
      distributorPrice: Number(payload.purchasePrice || payload.distributorPrice || payload["Purchase Price"] || 0),
      active: payload.active !== false
    };
  }

  function nextMockId(prefix, rows, key) {
    const max = rows.reduce((highest, row) => {
      const number = Number(String(row[key] || "").replace(`${prefix}-`, ""));
      return Number.isNaN(number) ? highest : Math.max(highest, number);
    }, 0);
    return `${prefix}-${String(max + 1).padStart(3, "0")}`;
  }

  function createMockWarehouse(payload) {
    const warehouse = normalizeMockWarehouse(payload);
    warehouse.warehouseId = nextMockId("WH", mockData.warehouses, "warehouseId");
    mockData.warehouses.push(warehouse);
    saveMockData();
    return warehouse;
  }

  function updateMockWarehouse(payload) {
    const index = mockData.warehouses.findIndex((warehouse) => warehouse.warehouseId === payload.warehouseId);
    if (index === -1) {
      throw new Error("Warehouse not found");
    }
    mockData.warehouses[index] = { ...mockData.warehouses[index], ...normalizeMockWarehouse(payload), warehouseId: payload.warehouseId };
    saveMockData();
    return mockData.warehouses[index];
  }

  function deleteMockWarehouse(payload) {
    const warehouse = mockData.warehouses.find((item) => item.warehouseId === payload.warehouseId);
    if (!warehouse) {
      throw new Error("Warehouse not found");
    }
    warehouse.active = false;
    saveMockData();
    return warehouse;
  }

  function normalizeMockWarehouse(payload) {
    return {
      warehouseId: payload.warehouseId || "",
      name: String(payload.name || "").trim(),
      type: String(payload.type || "Event").trim(),
      spoc: String(payload.spoc || "").trim(),
      mobile: String(payload.mobile || "").trim(),
      active: payload.active !== false
    };
  }

  function createMockActivity(payload) {
    if (!payload.devoteeId) {
      throw new Error("Devotee is required");
    }
    const activity = normalizeMockActivity(payload);
    activity.activityId = nextMockId("ACT", mockData.activities, "activityId");
    activity.devoteeName = getMockDevoteeName(activity.devoteeId);
    mockData.activities.push(activity);
    saveMockData();
    return activity;
  }

  function updateMockActivity(payload) {
    const index = mockData.activities.findIndex((activity) => activity.activityId === payload.activityId);
    if (index === -1) {
      throw new Error("Activity not found");
    }
    mockData.activities[index] = { ...mockData.activities[index], ...normalizeMockActivity(payload), activityId: payload.activityId, devoteeName: getMockDevoteeName(payload.devoteeId) };
    saveMockData();
    return mockData.activities[index];
  }

  function deleteMockActivity(payload) {
    const activity = mockData.activities.find((item) => item.activityId === payload.activityId);
    if (!activity) {
      throw new Error("Activity not found");
    }
    activity.status = "Cancelled";
    saveMockData();
    return activity;
  }

  function normalizeMockActivity(payload) {
    return {
      activityId: payload.activityId || "",
      name: String(payload.name || "").trim(),
      type: String(payload.type || "Stall").trim(),
      devoteeId: String(payload.devoteeId || "").trim(),
      startDate: payload.startDate || "",
      endDate: payload.endDate || "",
      warehouseId: payload.warehouseId || payload.warehouse || "",
      spoc: String(payload.spoc || "").trim(),
      status: payload.status || "Draft",
      devoteeName: getMockDevoteeName(payload.devoteeId)
    };
  }

  function createMockDocument(payload) {
    if (payload.documentType === "ISSUE" && !payload.activityId) {
      throw new Error("Activity is required for issue documents");
    }
    if ((payload.documentType === "RETURN" || payload.documentType === "UNSETTLED_OPENING") && !payload.activityId) {
      throw new Error("Activity is required for unsettled stock documents");
    }
    if (payload.documentType === "UNSETTLED_OPENING" && !payload.fromWarehouseId) {
      throw new Error("Source warehouse is required for unsettled opening documents");
    }
    if (payload.documentType === "RETURN" && !activityHasIssueMock(payload.activityId) && !activityHasUnsettledSeedMock(payload.activityId)) {
      throw new Error("Return can be posted only for an activity that already has issue or unsettled opening entries");
    }

    const documentId = nextMockId("DOC", mockData.documents, "documentId");
    const document = {
      documentId,
      documentType: payload.documentType,
      documentDate: payload.documentDate || new Date().toISOString().slice(0, 10),
      fromWarehouseId: payload.fromWarehouseId || "",
      toWarehouseId: payload.toWarehouseId || "",
      activityId: payload.activityId || "",
      volunteerId: payload.volunteerId || "",
      status: payload.status || "Posted",
      notes: payload.notes || "",
      lines: payload.lines || [],
      lineCount: (payload.lines || []).length,
      totalQuantity: (payload.lines || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0)
    };
    mockData.documents.push(document);
    saveMockData();
    return { documentId };
  }

  function getMockCatalogItems(payload) {
    const itemGroup = String(payload.itemGroup || "BOOK").trim().toUpperCase();
    if (itemGroup !== "BOOK") {
      return [];
    }
    const warehouse = mockData.warehouses[0];
    return mockData.books
      .filter((book) => book.active !== false)
      .map((book) => ({
        warehouseId: warehouse ? warehouse.warehouseId : "WH-001",
        warehouseCode: warehouse ? warehouse.warehouseId : "WH-001",
        warehouseName: warehouse ? warehouse.name : "GMB Main",
        itemGroup,
        bookId: book.erpCode,
        erpCode: book.erpCode,
        name: book.name,
        bookName: book.name,
        bookType: book.bookType || "",
        salePrice: Number(book.salePrice || 0),
        purchasePrice: Number(book.purchasePrice || 0),
        imageUrl: book.imageUrl || "",
        active: true,
        availableQty: 25
      }));
  }

  function createMockCatalogRequest(payload) {
    const lines = Array.isArray(payload.lines) ? payload.lines : [];
    const requestId = nextMockId("REQ", mockData.requests, "requestId");
    const request = {
      requestId,
      requestCode: requestId,
      sourceWarehouseId: payload.sourceWarehouseId || "WH-001",
      sourceWarehouseCode: payload.sourceWarehouseId || "WH-001",
      sourceWarehouseName: payload.sourceWarehouseName || "GMB Main",
      itemGroup: String(payload.itemGroup || "BOOK").trim().toUpperCase(),
      requesterName: String(payload.requesterName || payload.name || "").trim(),
      requesterMobile: String(payload.requesterMobile || payload.mobile || "").trim(),
      notes: String(payload.notes || "").trim(),
      status: "New",
      totalQty: lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0),
      totalAmount: lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.salePrice || 0), 0),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      lines: lines.map((line, index) => ({
        lineId: `${String(index + 1).padStart(2, "0")}`,
        lineNo: index + 1,
        erpCode: String(line.erpCode || "").trim(),
        itemName: String(line.itemName || "").trim(),
        itemGroup: String(line.itemGroup || "BOOK").trim().toUpperCase(),
        imageUrl: String(line.imageUrl || "").trim(),
        salePrice: Number(line.salePrice || 0),
        availableQty: Number(line.availableQty || 0),
        requestedQty: Number(line.quantity || 0),
        lineTotal: Number(line.quantity || 0) * Number(line.salePrice || 0)
      }))
    };
    mockData.requests.unshift(request);
    saveMockData();
    return request;
  }

  function createMockOnlineClassRegistration(payload) {
    const language = String(payload.language || "English").trim() || "English";
    if (!["English", "Telugu"].includes(language)) {
      throw new Error("Language is required");
    }
    const warehouseId = String(payload.sourceWarehouseId || payload.warehouseId || "").trim();
    if (!warehouseId) {
      throw new Error("Warehouse is required");
    }
    const warehouse = mockData.warehouses.find((item) => item.warehouseId === warehouseId || item.name === warehouseId);
    if (!warehouse) {
      throw new Error("Warehouse not found");
    }
    const itemId = String(payload.itemId || payload.erpCode || payload.bookId || "").trim();
    const book = mockData.books.find((item) => item.erpCode === itemId || item.bookId === itemId);
    if (!book) {
      throw new Error("Selected book is required");
    }
    const name = String(payload.name || "").trim();
    const whatsappNumber = String(payload.whatsappNumber || "").replace(/\D/g, "").trim();
    const occupation = String(payload.occupation || payload.workingStatus || "").trim();
    const stayArea = String(payload.stayArea || payload.areaOfStay || "").trim();
    if (!name || whatsappNumber.length !== 10 || !occupation || !stayArea) {
      throw new Error("Please fill all required fields");
    }
    const now = new Date().toISOString();
    const registration = {
      registrationId: nextMockId("OLC", mockData.onlineClasses, "registrationId"),
      language,
      sourceWarehouseId: warehouse.warehouseId,
      sourceWarehouseCode: warehouse.warehouseId,
      sourceWarehouseName: warehouse.name,
      utmSource: String(payload.utmSource || payload.utm_source || warehouse.warehouseId || warehouse.name || "").trim(),
      utmMedium: String(payload.utmMedium || payload.utm_medium || "online_classes").trim() || "online_classes",
      utmCampaign: String(payload.utmCampaign || payload.utm_campaign || "").trim(),
      name,
      whatsappNumber,
      age: payload.age ? Number(payload.age) : "",
      occupation,
      stayArea,
      itemId: book.erpCode,
      itemErpCode: book.erpCode,
      itemName: book.name,
      itemGroup: book.itemGroup || "BOOK",
      interestedInClasses: Boolean(payload.interestedInClasses || payload.interested_in_classes),
      createdAt: now,
      updatedAt: now
    };
    mockData.onlineClasses.push(registration);
    saveMockData();
    return registration;
  }

  function getMockOnlineClassWarehouseBooks(payload) {
    const warehouseId = String(payload.sourceWarehouseId || payload.warehouseId || payload.warehouseCode || payload.warehouseName || "").trim();
    if (!warehouseId) {
      return [];
    }
    const stock = getMockCurrentStock();
    const stockByBook = new Map();
    stock.forEach((row) => {
      if (String(row.warehouseId || "") !== warehouseId) return;
      stockByBook.set(String(row.bookId || ""), Number(row.quantity || 0));
    });
    return mockData.books
      .filter((book) => book.active !== false)
      .map((book) => ({
        registrationWarehouseId: warehouseId,
        bookId: book.erpCode,
        erpCode: book.erpCode,
        name: book.name,
        bookName: book.name,
        bookType: book.bookType,
        itemGroup: "BOOK",
        salePrice: Number(book.salePrice || 0),
        purchasePrice: Number(book.purchasePrice || 0),
        active: book.active !== false,
        availableQty: Number(stockByBook.get(String(book.erpCode || "")) || 0)
      }))
      .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")) || String(a.erpCode || "").localeCompare(String(b.erpCode || "")));
  }

  function activityHasIssueMock(activityId) {
    return mockData.documents.some((document) => document.activityId === activityId && document.documentType === "ISSUE" && document.status !== "Cancelled");
  }

  function activityHasUnsettledSeedMock(activityId) {
    return mockData.documents.some((document) => document.activityId === activityId && document.documentType === "UNSETTLED_OPENING" && document.status !== "Cancelled");
  }

  function getMockCurrentStock() {
    const index = {};
    mockData.documents.forEach((document) => {
      (document.lines || []).forEach((line) => {
        if (document.documentType === "TRANSFER") {
          addMockStock(index, document.fromWarehouseId, line.bookId, -Number(line.quantity || 0));
          addMockStock(index, document.toWarehouseId, line.bookId, Number(line.quantity || 0));
          return;
        }

        if (document.documentType === "UNSETTLED_OPENING") {
          return;
        }

        const inwardTypes = ["OPENING", "RECEIVE", "RETURN"];
        const quantity = inwardTypes.includes(document.documentType) ? Number(line.quantity || 0) : -Number(line.quantity || 0);
        addMockStock(index, document.toWarehouseId || document.fromWarehouseId, line.bookId, quantity);
      });
    });
    return Object.values(index);
  }

  function getMockActivityUnsettled() {
    const index = {};
    mockData.documents.forEach((document) => {
      const allowed = ["ISSUE", "RETURN", "SALE", "COMPLIMENTARY", "UNSETTLED_OPENING"];
      if (!document.activityId || !allowed.includes(document.documentType)) {
        return;
      }
      (document.lines || []).forEach((line) => {
        const key = `${document.activityId}|${line.bookId}`;
        if (!index[key]) {
          index[key] = {
            activityId: document.activityId,
            bookId: line.bookId,
            warehouseId: document.fromWarehouseId || document.toWarehouseId || "",
            issuedQty: 0,
            returnedQty: 0,
            soldQty: 0,
            complimentaryQty: 0,
            unsettledQty: 0
          };
        }
        const qty = Number(line.quantity || 0);
        if (document.documentType === "ISSUE" || document.documentType === "UNSETTLED_OPENING") {
          index[key].issuedQty += qty;
          index[key].unsettledQty += qty;
        } else if (document.documentType === "RETURN") {
          index[key].returnedQty += qty;
          index[key].unsettledQty -= qty;
        } else if (document.documentType === "SALE") {
          index[key].soldQty += qty;
          index[key].unsettledQty -= qty;
        } else if (document.documentType === "COMPLIMENTARY") {
          index[key].complimentaryQty += qty;
        }
      });
    });
    return Object.values(index);
  }

  function getMockActivityLedger(payload) {
    const devoteeId = String(payload && payload.devoteeId ? payload.devoteeId : "");
    const rows = [];
    mockData.documents.forEach((document) => {
      const activity = mockData.activities.find((item) => item.activityId === document.activityId);
      if (!activity || (devoteeId && activity.devoteeId !== devoteeId)) {
        return;
      }
      const allowed = ["ISSUE", "RETURN", "SALE", "COMPLIMENTARY", "UNSETTLED_OPENING"];
      if (!allowed.includes(document.documentType)) {
        return;
      }
      (document.lines || []).forEach((line) => {
        let row = rows.find((item) => item.activityId === document.activityId && item.bookId === line.bookId);
        if (!row) {
          row = {
            devoteeId: activity.devoteeId || "",
            devoteeName: activity.devoteeName || getMockDevoteeName(activity.devoteeId),
            activityId: document.activityId,
            activityName: activity.name,
            bookId: line.bookId,
            warehouseId: document.fromWarehouseId || document.toWarehouseId || activity.warehouseId || "",
            issueQty: 0,
            returnQty: 0,
            saleQty: 0,
            complimentaryQty: 0,
            unsettledQty: 0
          };
          rows.push(row);
        }
        const qty = Number(line.quantity || 0);
        if (document.documentType === "ISSUE" || document.documentType === "UNSETTLED_OPENING") {
          row.issueQty += qty;
          row.unsettledQty += qty;
        } else if (document.documentType === "RETURN") {
          row.returnQty += qty;
          row.unsettledQty -= qty;
        } else if (document.documentType === "SALE") {
          row.saleQty += qty;
          row.unsettledQty -= qty;
        } else if (document.documentType === "COMPLIMENTARY") {
          row.complimentaryQty += qty;
        }
      });
    });
    return rows;
  }

  function getMockDevoteeName(devoteeId) {
    const devotee = mockData.devotees.find((item) => item.devoteeId === devoteeId);
    return devotee ? devotee.devoteeName : devoteeId || "";
  }

  function addMockStock(index, warehouseId, bookId, quantity) {
    const key = `${warehouseId}|${bookId}`;
    if (!index[key]) {
      index[key] = { warehouseId, bookId, quantity: 0 };
    }
    index[key].quantity += quantity;
  }

  window.erpApi = { request };
})();
