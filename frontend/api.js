(function () {
  const config = window.ERP_CONFIG || {};

  const mockData = {
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

  async function request(action, payload) {
    if (config.mockMode || !config.apiBaseUrl) {
      return mockResponse(action);
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

  async function mockResponse(action) {
    await new Promise((resolve) => setTimeout(resolve, 160));
    const routes = {
      "dashboard.summary": mockData.dashboard,
      "books.list": mockData.books,
      "warehouses.list": mockData.warehouses,
      "activities.list": mockData.activities
    };
    return routes[action] || [];
  }

  window.erpApi = { request };
})();

