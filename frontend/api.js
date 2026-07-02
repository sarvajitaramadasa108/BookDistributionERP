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
    activities: [
      { activityId: "ACT-001", name: "Simhachalam Stall", type: "Stall", warehouse: "Simhachalam", status: "Running" },
      { activityId: "ACT-002", name: "Annavaram Daily Stall", type: "Daily", warehouse: "Annavaram", status: "Running" }
    ],
    documents: []
  };

  const mockData = loadMockData();

  async function request(action, payload) {
    if (config.mockMode || !config.apiBaseUrl) {
      return mockResponse(action, payload || {});
    }

    const response = await fetch(config.apiBaseUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ action, payload: payload || {} })
    });

    const result = await response.json();
    if (!result.ok) {
      throw new Error(result.error || "Request failed");
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
      "warehouses.create": () => createMockWarehouse(payload),
      "warehouses.update": () => updateMockWarehouse(payload),
      "warehouses.delete": () => deleteMockWarehouse(payload),
      "activities.list": mockData.activities,
      "activities.create": () => createMockActivity(payload),
      "activities.update": () => updateMockActivity(payload),
      "activities.delete": () => deleteMockActivity(payload),
      "documents.list": mockData.documents,
      "documents.create": () => createMockDocument(payload),
      "stock.current": () => getMockCurrentStock()
    };
    const handler = routes[action];
    return typeof handler === "function" ? handler() : handler || [];
  }

  function loadMockData() {
    try {
      const saved = window.localStorage.getItem("hkm-book-erp-mock-data");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (error) {
      console.warn("Could not read mock data", error);
    }
    return JSON.parse(JSON.stringify(mockSeed));
  }

  function saveMockData() {
    try {
      window.localStorage.setItem("hkm-book-erp-mock-data", JSON.stringify(mockData));
    } catch (error) {
      console.warn("Could not save mock data", error);
    }
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
    const activity = normalizeMockActivity(payload);
    activity.activityId = nextMockId("ACT", mockData.activities, "activityId");
    mockData.activities.push(activity);
    saveMockData();
    return activity;
  }

  function updateMockActivity(payload) {
    const index = mockData.activities.findIndex((activity) => activity.activityId === payload.activityId);
    if (index === -1) {
      throw new Error("Activity not found");
    }
    mockData.activities[index] = { ...mockData.activities[index], ...normalizeMockActivity(payload), activityId: payload.activityId };
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
      startDate: payload.startDate || "",
      endDate: payload.endDate || "",
      warehouseId: payload.warehouseId || payload.warehouse || "",
      spoc: String(payload.spoc || "").trim(),
      status: payload.status || "Draft"
    };
  }

  function createMockDocument(payload) {
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

  function getMockCurrentStock() {
    const index = {};
    mockData.documents.forEach((document) => {
      (document.lines || []).forEach((line) => {
        if (document.documentType === "TRANSFER") {
          addMockStock(index, document.fromWarehouseId, line.bookId, -Number(line.quantity || 0));
          addMockStock(index, document.toWarehouseId, line.bookId, Number(line.quantity || 0));
          return;
        }

        const inwardTypes = ["RECEIVE", "RETURN"];
        const quantity = inwardTypes.includes(document.documentType) ? Number(line.quantity || 0) : -Number(line.quantity || 0);
        addMockStock(index, document.toWarehouseId || document.fromWarehouseId, line.bookId, quantity);
      });
    });
    return Object.values(index);
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
