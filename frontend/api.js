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
      { bookId: "BK-001", name: "Bhagavad Gita As It Is", language: "English", mrp: 350, distributorPrice: 210, category: "Main", active: true },
      { bookId: "BK-002", name: "Beyond Birth and Death", language: "English", mrp: 80, distributorPrice: 45, category: "Small", active: true },
      { bookId: "BK-003", name: "Perfection of Yoga", language: "Telugu", mrp: 60, distributorPrice: 35, category: "Small", active: true }
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
    ]
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
      "books.create": () => createMockBook(payload),
      "books.update": () => updateMockBook(payload),
      "books.delete": () => deleteMockBook(payload),
      "warehouses.list": mockData.warehouses,
      "warehouses.create": () => createMockWarehouse(payload),
      "warehouses.update": () => updateMockWarehouse(payload),
      "warehouses.delete": () => deleteMockWarehouse(payload),
      "activities.list": mockData.activities
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
    book.bookId = nextMockId("BK", mockData.books, "bookId");
    mockData.books.push(book);
    saveMockData();
    return book;
  }

  function updateMockBook(payload) {
    const index = mockData.books.findIndex((book) => book.bookId === payload.bookId);
    if (index === -1) {
      throw new Error("Book not found");
    }
    mockData.books[index] = { ...mockData.books[index], ...normalizeMockBook(payload), bookId: payload.bookId };
    saveMockData();
    return mockData.books[index];
  }

  function deleteMockBook(payload) {
    const book = mockData.books.find((item) => item.bookId === payload.bookId);
    if (!book) {
      throw new Error("Book not found");
    }
    book.active = false;
    saveMockData();
    return book;
  }

  function normalizeMockBook(payload) {
    return {
      bookId: payload.bookId || "",
      name: String(payload.name || "").trim(),
      language: String(payload.language || "").trim(),
      mrp: Number(payload.mrp || 0),
      distributorPrice: Number(payload.distributorPrice || 0),
      category: String(payload.category || "").trim(),
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

  window.erpApi = { request };
})();
