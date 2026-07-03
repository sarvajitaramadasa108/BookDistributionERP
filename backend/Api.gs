var CURRENT_USER_ = null;

function routeRequest_(request) {
  const action = request.action;
  const payload = request.payload || {};
  const publicActions = {
    "auth.login": true,
    "auth.me": true,
    "system.setup": true
  };
  CURRENT_USER_ = publicActions[action] ? null : getSessionUser_(payload.sessionToken);
  if (!publicActions[action] && !CURRENT_USER_) {
    throw new Error("Please log in to continue");
  }
  const routes = {
    "system.setup": setupDatabase,
    "auth.login": function () { return authLogin_(payload); },
    "auth.me": function () { return CURRENT_USER_ || null; },
    "auth.logout": function () { return authLogout_(payload); },
    "users.list": function () { return readUsers_(); },
    "users.create": function () { return createUser_(payload); },
    "users.update": function () { return updateUser_(payload); },
    "dashboard.summary": getDashboardSummary_,
    "books.list": function () { return readObjects_("Books").map(function (row) { return mapBook_(row, false); }); },
    "books.adminList": function () { return readObjects_("Books").map(function (row) { return mapBook_(row, true); }); },
    "books.create": function () { return createBook_(payload); },
    "books.update": function () { return updateBook_(payload); },
    "books.delete": function () { return deleteBook_(payload); },
    "books.bulkUpsert": function () { return bulkUpsertBooks_(payload); },
    "warehouses.list": function () { return readObjects_("Warehouses").map(mapWarehouse_); },
    "warehouses.create": function () { return createWarehouse_(payload); },
    "warehouses.update": function () { return updateWarehouse_(payload); },
    "warehouses.delete": function () { return deleteWarehouse_(payload); },
    "devotees.list": function () { return readObjects_("Devotees").map(mapDevotee_); },
    "activities.list": function () { return readObjects_("Activities").map(mapActivity_); },
    "activities.create": function () { return createActivity_(payload); },
    "activities.update": function () { return updateActivity_(payload); },
    "activities.delete": function () { return deleteActivity_(payload); },
    "documents.list": function () { return readObjects_("Documents").map(mapDocument_); },
    "documents.create": function () { return createDocument_(payload); },
    "stock.current": getCurrentStock_,
    "activity.unsettled": getActivityUnsettled_,
    "activity.complimentary": getActivityComplimentary_,
    "reports.activityLedger": function () { return getActivityLedger_(payload); },
    "reports.activityMonthly": function () { return getActivityMonthlyReport_(payload); },
    "reports.warehouseMonthly": function () { return getWarehouseMonthlyReport_(payload); }
  };

  if (!routes[action]) {
    throw new Error("Unknown action: " + action);
  }
  const result = routes[action]();
  CURRENT_USER_ = null;
  return result;
}

function readUsers_() {
  return readObjects_("Users").map(function (row) {
    return mapUser_(row);
  });
}

function mapUser_(row) {
  return {
    userId: row["User ID"],
    name: row.Name,
    username: row.Username,
    role: row.Role,
    active: row.Active === true || row.Active === "TRUE" || row.Active === "true",
    createdAt: row["Created At"],
    updatedAt: row["Updated At"]
  };
}

function getUserByUsername_(username, excludeUserId) {
  const normalized = String(username || "").trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  return readObjects_("Users").find(function (row) {
    if (excludeUserId && row["User ID"] === excludeUserId) {
      return false;
    }
    return String(row.Username || "").trim().toLowerCase() === normalized;
  }) || null;
}

function authLogin_(payload) {
  const username = String(payload.username || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!username || !password) {
    throw new Error("Username and password are required");
  }

  const userRow = getUserByUsername_(username);

  if (!userRow) {
    throw new Error("Invalid username or password");
  }
  if (!(userRow.Active === true || userRow.Active === "TRUE" || userRow.Active === "true")) {
    throw new Error("This account is inactive");
  }
  if (hashPassword_(password) !== String(userRow["Password Hash"] || "")) {
    throw new Error("Invalid username or password");
  }

  const token = Utilities.getUuid();
  CacheService.getScriptCache().put("session:" + token, JSON.stringify({
    userId: userRow["User ID"],
    name: userRow.Name,
    username: userRow.Username,
    role: userRow.Role
  }), 21600);
  return {
    sessionToken: token,
    user: mapUser_(userRow)
  };
}

function authLogout_(payload) {
  if (payload.sessionToken) {
    CacheService.getScriptCache().remove("session:" + payload.sessionToken);
  }
  return { ok: true };
}

function getSessionUser_(sessionToken) {
  if (!sessionToken) {
    return null;
  }
  const cached = CacheService.getScriptCache().get("session:" + sessionToken);
  if (!cached) {
    return null;
  }
  try {
    return JSON.parse(cached);
  } catch (error) {
    return null;
  }
}

function createUser_(payload) {
  validateUserPayload_(payload);
  if (getUserByUsername_(payload.username)) {
    throw new Error("Username already exists");
  }
  const now = new Date();
  const user = {
    "User ID": nextId_("USR", "Users", "User ID"),
    "Name": payload.name,
    "Username": payload.username,
    "Password Hash": hashPassword_(payload.password),
    "Role": payload.role || "storeIncharge",
    "Active": payload.active !== false,
    "Created At": now,
    "Updated At": now
  };
  appendObject_("Users", user);
  logAudit_("users.create", "Users", user["User ID"], JSON.stringify({ name: user["Name"], username: user["Username"], role: user["Role"], active: user["Active"] }));
  return mapUser_(user);
}

function updateUser_(payload) {
  const userId = payload.userId;
  if (!userId) {
    throw new Error("User ID is required");
  }
  validateUserPayload_(payload, true);
  if (payload.username && getUserByUsername_(payload.username, userId)) {
    throw new Error("Username already exists");
  }
  const sheet = getSheet_("Users");
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf("User ID");
  const rowIndex = values.findIndex(function (row, index) {
    return index > 0 && row[idIndex] === userId;
  });
  if (rowIndex === -1) {
    throw new Error("User not found");
  }

  const current = {};
  headers.forEach(function (header, index) {
    current[header] = values[rowIndex][index];
  });

  const updated = {
    "User ID": userId,
    "Name": payload.name || current["Name"],
    "Username": payload.username || current["Username"],
    "Password Hash": payload.password ? hashPassword_(payload.password) : current["Password Hash"],
    "Role": payload.role || current["Role"] || "storeIncharge",
    "Active": payload.active !== undefined ? payload.active : (current["Active"] === true || current["Active"] === "TRUE" || current["Active"] === "true"),
    "Created At": current["Created At"] || new Date(),
    "Updated At": new Date()
  };

  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([headers.map(function (header) {
    return updated[header] === undefined ? "" : updated[header];
  })]);
  logAudit_("users.update", "Users", userId, JSON.stringify({ name: updated["Name"], username: updated["Username"], role: updated["Role"], active: updated["Active"] }));
  return mapUser_(updated);
}

function validateUserPayload_(payload, isUpdate) {
  if (!payload.name && !isUpdate) {
    throw new Error("Name is required");
  }
  if (!payload.username && !isUpdate) {
    throw new Error("Username is required");
  }
  if (!payload.password && !isUpdate) {
    throw new Error("Password is required");
  }
  if (payload.password && String(payload.password).length < 4) {
    throw new Error("Password must be at least 4 characters");
  }
  const allowedRoles = ["mainAdmin", "storeIncharge"];
  if (payload.role && allowedRoles.indexOf(payload.role) === -1) {
    throw new Error("Invalid user role");
  }
}

function hashPassword_(password) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(password));
  return Utilities.base64Encode(digest);
}

function createBook_(payload) {
  validateBook_(payload);
  const now = new Date();
  const book = {
    "ERP Code": payload.erpCode,
    "Book Name": payload.name,
    "Book Type": payload.bookType || payload.category || "",
    "Purchase Price": Number(payload.purchasePrice || payload.distributorPrice || 0),
    "Sale Price": Number(payload.salePrice || payload.mrp || 0),
    "Active": payload.active !== false,
    "Created At": now,
    "Updated At": now
  };
  appendObject_("Books", book);
  logAudit_("books.create", "Books", book["ERP Code"], JSON.stringify(book));
  return mapBook_(book, true);
}

function updateBook_(payload) {
  const erpCode = payload.erpCode || payload.bookId;
  if (!erpCode) {
    throw new Error("ERP Code is required");
  }
  payload.erpCode = erpCode;
  validateBook_(payload);

  const sheet = getSheet_("Books");
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const erpCodeIndex = headers.indexOf("ERP Code");
  const rowIndex = values.findIndex(function (row, index) {
    return index > 0 && row[erpCodeIndex] === erpCode;
  });

  if (rowIndex === -1) {
    throw new Error("Book not found");
  }

  const current = {};
  headers.forEach(function (header, index) {
    current[header] = values[rowIndex][index];
  });

  const updated = {
    "ERP Code": erpCode,
    "Book Name": payload.name,
    "Book Type": payload.bookType || payload.category || "",
    "Purchase Price": Number(payload.purchasePrice || payload.distributorPrice || 0),
    "Sale Price": Number(payload.salePrice || payload.mrp || 0),
    "Active": payload.active !== false,
    "Created At": current["Created At"] || new Date(),
    "Updated At": new Date()
  };

  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([headers.map(function (header) {
    return updated[header] === undefined ? "" : updated[header];
  })]);
  logAudit_("books.update", "Books", erpCode, JSON.stringify(updated));
  return mapBook_(updated, true);
}

function deleteBook_(payload) {
  const erpCode = payload.erpCode || payload.bookId;
  if (!erpCode) {
    throw new Error("ERP Code is required");
  }

  const rows = readObjects_("Books");
  const book = rows.find(function (row) {
    return row["ERP Code"] === erpCode;
  });
  if (!book) {
    throw new Error("Book not found");
  }

  return updateBook_({
    erpCode: erpCode,
    name: book["Book Name"],
    bookType: book["Book Type"],
    purchasePrice: book["Purchase Price"],
    salePrice: book["Sale Price"],
    active: false
  });
}

function bulkUpsertBooks_(payload) {
  const books = payload.books || [];
  if (!books.length) {
    throw new Error("No books supplied");
  }

  const result = { created: 0, updated: 0, total: books.length };
  books.forEach(function (book) {
    const normalized = {
      erpCode: book.erpCode || book["ERP Code"],
      name: book.name || book["Book Name"],
      bookType: book.bookType || book["Book Type"],
      purchasePrice: book.purchasePrice || book["Purchase Price"],
      salePrice: book.salePrice || book["Sale Price"],
      active: book.active !== false
    };
    const existing = readObjects_("Books").some(function (row) {
      return row["ERP Code"] === normalized.erpCode;
    });
    if (existing) {
      updateBook_(normalized);
      result.updated += 1;
    } else {
      createBook_(normalized);
      result.created += 1;
    }
  });
  logAudit_("books.bulkUpsert", "Books", "bulk", JSON.stringify(result));
  return result;
}

function validateBook_(payload) {
  if (!payload.erpCode) {
    throw new Error("ERP Code is required");
  }
  if (!payload.name) {
    throw new Error("Book name is required");
  }
  if (!payload.bookType && !payload.category) {
    throw new Error("Book type is required");
  }
  if (Number(payload.salePrice || payload.mrp || 0) < 0) {
    throw new Error("Sale price cannot be negative");
  }
  if (Number(payload.purchasePrice || payload.distributorPrice || 0) < 0) {
    throw new Error("Purchase price cannot be negative");
  }
}

function mapBook_(row, includeInternal) {
  const book = {
    bookId: row["ERP Code"],
    erpCode: row["ERP Code"],
    name: row["Book Name"],
    bookType: row["Book Type"],
    category: row["Book Type"],
    salePrice: row["Sale Price"],
    mrp: row["Sale Price"],
    active: row.Active === true || row.Active === "TRUE" || row.Active === "true"
  };
  if (includeInternal) {
    book.purchasePrice = row["Purchase Price"];
    book.distributorPrice = row["Purchase Price"];
  }
  return book;
}

function createWarehouse_(payload) {
  validateWarehouse_(payload);
  const now = new Date();
  const warehouse = {
    "Warehouse ID": nextId_("WH", "Warehouses", "Warehouse ID"),
    "Warehouse Name": payload.name,
    "Type": payload.type || "Event",
    "SPOC": payload.spoc || "",
    "Mobile": payload.mobile || "",
    "Active": payload.active !== false,
    "Created At": now,
    "Updated At": now
  };
  appendObject_("Warehouses", warehouse);
  logAudit_("warehouses.create", "Warehouses", warehouse["Warehouse ID"], JSON.stringify(warehouse));
  return mapWarehouse_(warehouse);
}

function updateWarehouse_(payload) {
  if (!payload.warehouseId) {
    throw new Error("Warehouse ID is required");
  }
  validateWarehouse_(payload);

  const sheet = getSheet_("Warehouses");
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf("Warehouse ID");
  const rowIndex = values.findIndex(function (row, index) {
    return index > 0 && row[idIndex] === payload.warehouseId;
  });

  if (rowIndex === -1) {
    throw new Error("Warehouse not found");
  }

  const current = {};
  headers.forEach(function (header, index) {
    current[header] = values[rowIndex][index];
  });

  const updated = {
    "Warehouse ID": payload.warehouseId,
    "Warehouse Name": payload.name,
    "Type": payload.type || "Event",
    "SPOC": payload.spoc || "",
    "Mobile": payload.mobile || "",
    "Active": payload.active !== false,
    "Created At": current["Created At"] || new Date(),
    "Updated At": new Date()
  };

  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([headers.map(function (header) {
    return updated[header] === undefined ? "" : updated[header];
  })]);
  logAudit_("warehouses.update", "Warehouses", payload.warehouseId, JSON.stringify(updated));
  return mapWarehouse_(updated);
}

function deleteWarehouse_(payload) {
  if (!payload.warehouseId) {
    throw new Error("Warehouse ID is required");
  }

  const rows = readObjects_("Warehouses");
  const warehouse = rows.find(function (row) {
    return row["Warehouse ID"] === payload.warehouseId;
  });
  if (!warehouse) {
    throw new Error("Warehouse not found");
  }

  return updateWarehouse_({
    warehouseId: payload.warehouseId,
    name: warehouse["Warehouse Name"],
    type: warehouse.Type,
    spoc: warehouse.SPOC,
    mobile: warehouse.Mobile,
    active: false
  });
}

function validateWarehouse_(payload) {
  if (!payload.name) {
    throw new Error("Warehouse name is required");
  }
  if (!payload.type) {
    throw new Error("Warehouse type is required");
  }
}

function mapWarehouse_(row) {
  return {
    warehouseId: row["Warehouse ID"],
    name: row["Warehouse Name"],
    type: row.Type,
    spoc: row.SPOC,
    mobile: row.Mobile,
    active: row.Active === true || row.Active === "TRUE" || row.Active === "true"
  };
}

function mapDevotee_(row) {
  return {
    devoteeId: row["Devotee ID"],
    devoteeName: row["Devotee Name"],
    active: row.Active === true || row.Active === "TRUE" || row.Active === "true"
  };
}

function mapActivity_(row) {
  const devoteeId = row["Devotee ID"] || getDevoteeIdByName_("SJRD") || "";
  return {
    activityId: row["Activity ID"],
    name: row.Name,
    type: row.Type,
    devoteeId: devoteeId,
    devoteeName: getDevoteeName_(devoteeId),
    startDate: row["Start Date"],
    endDate: row["End Date"],
    warehouseId: row["Warehouse ID"],
    spoc: row.SPOC,
    status: row.Status,
    settledAt: row["Settled At"]
  };
}

function createActivity_(payload) {
  validateActivity_(payload);
  const now = new Date();
  const activity = {
    "Activity ID": nextId_("ACT", "Activities", "Activity ID"),
    "Name": payload.name,
    "Type": payload.type || "Stall",
    "Devotee ID": payload.devoteeId || "",
    "Start Date": payload.startDate ? new Date(payload.startDate) : "",
    "End Date": payload.endDate ? new Date(payload.endDate) : "",
    "Warehouse ID": payload.warehouseId,
    "SPOC": payload.spoc || "",
    "Status": payload.status || "Draft",
    "Settled At": payload.status === "Completed" ? now : "",
    "Created At": now,
    "Updated At": now
  };
  appendObject_("Activities", activity);
  logAudit_("activities.create", "Activities", activity["Activity ID"], JSON.stringify(activity));
  return mapActivity_(activity);
}

function updateActivity_(payload) {
  if (!payload.activityId) {
    throw new Error("Activity ID is required");
  }
  validateActivity_(payload);

  const sheet = getSheet_("Activities");
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const idIndex = headers.indexOf("Activity ID");
  const rowIndex = values.findIndex(function (row, index) {
    return index > 0 && row[idIndex] === payload.activityId;
  });

  if (rowIndex === -1) {
    throw new Error("Activity not found");
  }

  const current = {};
  headers.forEach(function (header, index) {
    current[header] = values[rowIndex][index];
  });

  const updated = {
    "Activity ID": payload.activityId,
    "Name": payload.name,
    "Type": payload.type || "Stall",
    "Devotee ID": payload.devoteeId || "",
    "Start Date": payload.startDate ? new Date(payload.startDate) : "",
    "End Date": payload.endDate ? new Date(payload.endDate) : "",
    "Warehouse ID": payload.warehouseId,
    "SPOC": payload.spoc || "",
    "Status": payload.status || "Draft",
    "Settled At": current["Settled At"] || (payload.status === "Completed" ? new Date() : ""),
    "Created At": current["Created At"] || new Date(),
    "Updated At": new Date()
  };

  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([headers.map(function (header) {
    return updated[header] === undefined ? "" : updated[header];
  })]);
  logAudit_("activities.update", "Activities", payload.activityId, JSON.stringify(updated));
  return mapActivity_(updated);
}

function deleteActivity_(payload) {
  if (!payload.activityId) {
    throw new Error("Activity ID is required");
  }

  const activity = readObjects_("Activities").find(function (row) {
    return row["Activity ID"] === payload.activityId;
  });
  if (!activity) {
    throw new Error("Activity not found");
  }

  return updateActivity_({
    activityId: payload.activityId,
    name: activity.Name,
    type: activity.Type,
    devoteeId: activity["Devotee ID"],
    startDate: activity["Start Date"],
    endDate: activity["End Date"],
    warehouseId: activity["Warehouse ID"],
    spoc: activity.SPOC,
    status: "Cancelled"
  });
}

function validateActivity_(payload) {
  if (!payload.name) {
    throw new Error("Activity name is required");
  }
  if (!payload.type) {
    throw new Error("Activity type is required");
  }
  if (!payload.devoteeId && !payload.activityId) {
    throw new Error("Devotee is required");
  }
  if (!payload.warehouseId) {
    throw new Error("Warehouse is required");
  }
  const allowedStatuses = ["Draft", "Running", "Completed", "Cancelled"];
  if (payload.status && allowedStatuses.indexOf(payload.status) === -1) {
    throw new Error("Invalid activity status");
  }
}

function getDashboardSummary_() {
  const ledger = readObjects_("StockLedger");
  const activities = readObjects_("Activities");
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd");
  const todayRows = ledger.filter(function (row) {
    if (!row["Ledger Date"]) return false;
    return Utilities.formatDate(new Date(row["Ledger Date"]), Session.getScriptTimeZone(), "yyyy-MM-dd") === today;
  });

  const todaySales = todayRows
    .filter(function (row) { return row["Movement Type"] === "SALE"; })
    .reduce(function (sum, row) { return sum + Number(row.Amount || 0); }, 0);

  const todayBooks = todayRows.reduce(function (sum, row) {
    return sum + Number(row["Quantity Out"] || 0);
  }, 0);

  return {
    todaySales: todaySales,
    todayBooks: todayBooks,
    runningActivities: activities.filter(function (row) { return row.Status === "Running"; }).length,
    totalStock: getCurrentStock_().reduce(function (sum, row) { return sum + row.quantity; }, 0),
    recentActivities: activities.slice(-5).reverse(),
    recentDocuments: readObjects_("Documents").slice(-5).reverse()
  };
}

function getDevoteeName_(devoteeId) {
  if (!devoteeId) {
    return "";
  }
  const devotee = readObjects_("Devotees").find(function (row) {
    return row["Devotee ID"] === devoteeId;
  });
  return devotee ? devotee["Devotee Name"] : devoteeId;
}

function createDocument_(payload) {
  payload = payload || {};
  payload.lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (payload.documentType === "PURCHASE") {
    payload.lines = payload.lines.map(function (line) {
      return resolvePurchaseLine_(line);
    });
  }
  validateDocument_(payload);
  const now = new Date();
  const documentId = nextId_("DOC", "Documents", "Document ID");
  const documentType = payload.documentType;
  const documentDate = payload.documentDate ? new Date(payload.documentDate) : now;

  appendObject_("Documents", {
    "Document ID": documentId,
    "Document Type": documentType,
    "Document Date": documentDate,
    "From Warehouse ID": payload.fromWarehouseId || "",
    "To Warehouse ID": payload.toWarehouseId || "",
    "Activity ID": payload.activityId || "",
    "Volunteer ID": payload.volunteerId || "",
    "Status": payload.status || "Posted",
    "Notes": payload.notes || "",
    "Created At": now,
    "Created By": payload.createdBy || getCurrentUserLabel_(),
    "Updated At": now
  });

  payload.lines.forEach(function (line, index) {
    const lineId = documentId + "-L" + String(index + 1).padStart(3, "0");
    const quantity = Number(line.quantity || 0);
    const rate = Number(line.rate || 0);
    const amount = quantity * rate;

    appendObject_("DocumentLines", {
      "Line ID": lineId,
      "Document ID": documentId,
      "Book ID": line.bookId,
      "Quantity": quantity,
      "Rate": rate,
      "Amount": amount,
      "Line Notes": line.notes || ""
    });

    appendLedgerRows_(documentId, lineId, documentType, documentDate, payload, line, quantity, rate, amount, now);
  });

  logAudit_("documents.create", "Documents", documentId, JSON.stringify(payload));
  return { documentId: documentId };
}

function resolvePurchaseLine_(line) {
  const rawCode = String(line.bookId || line.erpCode || "").trim();
  const rawName = String(line.bookName || line.name || "").trim();
  const bookType = String(line.bookType || line.category || "General").trim() || "General";
  const purchasePrice = Number(line.purchasePrice || line.rate || 0);
  const salePrice = Number(line.salePrice || line.mrp || 0);
  const quantity = Number(line.quantity || 0);
  let book = null;

  if (rawCode) {
    book = readObjects_("Books").find(function (row) {
      return String(row["ERP Code"] || "") === rawCode;
    });
  }

  if (!book && rawName) {
    book = readObjects_("Books").find(function (row) {
      return String(row["Book Name"] || "").toLowerCase() === rawName.toLowerCase();
    });
  }

  if (!book) {
    if (!rawName) {
      throw new Error("Book name is required for purchase input");
    }
    const erpCode = rawCode || nextId_("BK", "Books", "ERP Code");
    createBook_({
      erpCode: erpCode,
      name: rawName,
      bookType: bookType,
      purchasePrice: purchasePrice,
      salePrice: salePrice,
      active: true
    });
    return {
      bookId: erpCode,
      quantity: quantity,
      rate: purchasePrice,
      purchasePrice: purchasePrice,
      salePrice: salePrice,
      bookName: rawName,
      bookType: bookType
    };
  }

  return {
    bookId: book["ERP Code"],
    quantity: quantity,
    rate: purchasePrice,
    purchasePrice: purchasePrice,
    salePrice: salePrice,
    bookName: book["Book Name"],
    bookType: book["Book Type"]
  };
}

function mapDocument_(row) {
  return {
    documentId: row["Document ID"],
    documentType: row["Document Type"],
    documentDate: row["Document Date"],
    fromWarehouseId: row["From Warehouse ID"],
    toWarehouseId: row["To Warehouse ID"],
    activityId: row["Activity ID"],
    volunteerId: row["Volunteer ID"],
    status: row.Status,
    notes: row.Notes,
    createdAt: row["Created At"],
    createdBy: row["Created By"]
  };
}

function appendLedgerRows_(documentId, lineId, documentType, documentDate, payload, line, quantity, rate, amount, now) {
  if (documentType === "UNSETTLED_OPENING") {
    return;
  }

  if (documentType === "TRANSFER") {
    appendLedgerRow_(documentId, lineId, documentDate, payload.fromWarehouseId, payload.activityId, line.bookId, "TRANSFER_OUT", 0, quantity, rate, amount, now);
    appendLedgerRow_(documentId, lineId, documentDate, payload.toWarehouseId, payload.activityId, line.bookId, "TRANSFER_IN", quantity, 0, rate, amount, now);
    return;
  }

  const inwardTypes = ["OPENING", "RECEIVE", "RETURN", "PURCHASE"];
  const quantityIn = inwardTypes.indexOf(documentType) !== -1 ? quantity : 0;
  const quantityOut = inwardTypes.indexOf(documentType) !== -1 ? 0 : quantity;
  const warehouseId = payload.warehouseId || payload.fromWarehouseId || payload.toWarehouseId;
  appendLedgerRow_(documentId, lineId, documentDate, warehouseId, payload.activityId, line.bookId, documentType, quantityIn, quantityOut, rate, amount, now);
}

function appendLedgerRow_(documentId, lineId, documentDate, warehouseId, activityId, bookId, movementType, quantityIn, quantityOut, rate, amount, now) {
  appendObject_("StockLedger", {
    "Ledger ID": nextId_("LED", "StockLedger", "Ledger ID"),
    "Document ID": documentId,
    "Document Line ID": lineId,
    "Ledger Date": documentDate,
    "Warehouse ID": warehouseId || "",
    "Activity ID": activityId || "",
    "Book ID": bookId,
    "Movement Type": movementType,
    "Quantity In": quantityIn,
    "Quantity Out": quantityOut,
    "Rate": rate,
    "Amount": amount,
    "Created At": now
  });
}

function validateDocument_(payload) {
  if (ERP_DOCUMENT_TYPES.indexOf(payload.documentType) === -1) {
    throw new Error("Invalid document type");
  }
  if (!payload.lines || !payload.lines.length) {
    throw new Error("At least one document line is required");
  }

  if (payload.documentType === "ISSUE" && !payload.activityId) {
    throw new Error("Activity is required for issue documents");
  }

  if ((payload.documentType === "RETURN" || payload.documentType === "UNSETTLED_OPENING") && !payload.activityId) {
    throw new Error("Activity is required for unsettled stock documents");
  }

  if (payload.documentType === "UNSETTLED_OPENING" && !payload.fromWarehouseId) {
    throw new Error("Source warehouse is required for unsettled opening documents");
  }

  if (payload.documentType === "PURCHASE" && !payload.toWarehouseId) {
    throw new Error("Warehouse is required for purchase input documents");
  }

  if (payload.documentType === "RETURN" && !activityHasIssue_(payload.activityId) && !activityHasUnsettledSeed_(payload.activityId)) {
    throw new Error("Return can be posted only for an activity that already has issue or unsettled opening entries");
  }

  payload.lines.forEach(function (line) {
    if (!line.bookId) {
      throw new Error("Book ID is required on every line");
    }
    if (Number(line.quantity || 0) <= 0) {
      throw new Error("Quantity must be greater than zero");
    }
  });
}

function activityHasIssue_(activityId) {
  if (!activityId) {
    return false;
  }
  return readObjects_("Documents").some(function (row) {
    return row["Activity ID"] === activityId && row["Document Type"] === "ISSUE" && row.Status !== "Cancelled";
  });
}

function activityHasUnsettledSeed_(activityId) {
  if (!activityId) {
    return false;
  }
  return readObjects_("Documents").some(function (row) {
    return row["Activity ID"] === activityId && row["Document Type"] === "UNSETTLED_OPENING" && row.Status !== "Cancelled";
  });
}

function getActivityUnsettled_() {
  const documents = readObjects_("Documents");
  const lines = readObjects_("DocumentLines");
  const activities = readObjects_("Activities");
  const activityById = {};
  activities.forEach(function (activity) {
    activityById[activity["Activity ID"]] = activity;
  });
  const docsById = {};
  documents.forEach(function (doc) {
    docsById[doc["Document ID"]] = doc;
  });

  const index = {};
  lines.forEach(function (line) {
    const doc = docsById[line["Document ID"]];
    if (!doc || !doc["Activity ID"]) {
      return;
    }

    const type = doc["Document Type"];
    const allowed = ["ISSUE", "RETURN", "SALE", "COMPLIMENTARY", "UNSETTLED_OPENING"];
    if (allowed.indexOf(type) === -1) {
      return;
    }

    const key = doc["Activity ID"] + "|" + line["Book ID"];
    if (!index[key]) {
      const activity = activityById[doc["Activity ID"]] || {};
      const devoteeId = activity["Devotee ID"] || getDevoteeIdByName_("SJRD") || "";
      index[key] = {
        devoteeId: devoteeId,
        devoteeName: getDevoteeName_(devoteeId),
        activityId: doc["Activity ID"],
        activityName: activity.Name || doc["Activity ID"],
        bookId: line["Book ID"],
        warehouseId: doc["From Warehouse ID"] || doc["To Warehouse ID"] || "",
        issuedQty: 0,
        returnedQty: 0,
        soldQty: 0,
        complimentaryQty: 0,
        unsettledQty: 0,
        documentCount: 0
      };
    }

    const quantity = Number(line["Quantity"] || 0);
    index[key].documentCount += 1;
    if (type === "ISSUE" || type === "UNSETTLED_OPENING") {
      index[key].issuedQty += quantity;
      index[key].unsettledQty += quantity;
    } else if (type === "RETURN") {
      index[key].returnedQty += quantity;
      index[key].unsettledQty -= quantity;
    } else if (type === "SALE") {
      index[key].soldQty += quantity;
      index[key].unsettledQty -= quantity;
    } else if (type === "COMPLIMENTARY") {
      index[key].complimentaryQty += quantity;
    }
  });

  return Object.keys(index).map(function (key) {
    return index[key];
  }).sort(function (a, b) {
    return String(a.activityId).localeCompare(String(b.activityId)) || String(a.bookId).localeCompare(String(b.bookId));
  });
}

function getActivityComplimentary_() {
  const documents = readObjects_("Documents");
  const lines = readObjects_("DocumentLines");
  const activities = readObjects_("Activities");
  const activityById = {};
  activities.forEach(function (activity) {
    activityById[activity["Activity ID"]] = activity;
  });

  const docsById = {};
  documents.forEach(function (doc) {
    docsById[doc["Document ID"]] = doc;
  });

  const books = readObjects_("Books");
  const booksById = {};
  books.forEach(function (book) {
    booksById[book["ERP Code"]] = book;
  });

  const index = {};
  lines.forEach(function (line) {
    const doc = docsById[line["Document ID"]];
    if (!doc || !doc["Activity ID"] || doc["Document Type"] !== "COMPLIMENTARY") {
      return;
    }
    if (String(doc.Status || "").toLowerCase() === "cancelled") {
      return;
    }

    const activity = activityById[doc["Activity ID"]] || {};
    const activityId = doc["Activity ID"];
    const key = activityId + "|" + line["Book ID"];
    if (!index[key]) {
      const devoteeId = activity["Devotee ID"] || getDevoteeIdByName_("SJRD") || "";
      index[key] = {
        devoteeId: devoteeId,
        devoteeName: getDevoteeName_(devoteeId),
        activityId: activityId,
        activityName: activity.Name || activityId,
        bookId: line["Book ID"],
        bookName: (booksById[line["Book ID"]] && booksById[line["Book ID"]]["Book Name"]) || line["Book ID"],
        warehouseId: doc["From Warehouse ID"] || doc["To Warehouse ID"] || activity["Warehouse ID"] || "",
        complimentaryQty: 0,
        worth: 0
      };
    }

    const quantity = Number(line["Quantity"] || 0);
    const salePrice = Number((booksById[line["Book ID"]] && booksById[line["Book ID"]]["Sale Price"]) || 0);
    index[key].complimentaryQty += quantity;
    index[key].worth += quantity * salePrice;
  });

  return Object.keys(index).map(function (key) {
    return index[key];
  }).sort(function (a, b) {
    return String(a.devoteeName).localeCompare(String(b.devoteeName)) ||
      String(a.activityName).localeCompare(String(b.activityName)) ||
      String(a.bookId).localeCompare(String(b.bookId));
  });
}

function getActivityLedger_(payload) {
  const documents = readObjects_("Documents");
  const lines = readObjects_("DocumentLines");
  const activities = readObjects_("Activities");
  const docsById = {};
  const activityById = {};
  activities.forEach(function (activity) {
    activityById[activity["Activity ID"]] = activity;
  });
  documents.forEach(function (doc) {
    docsById[doc["Document ID"]] = doc;
  });

  const devoteeId = payload && payload.devoteeId ? String(payload.devoteeId) : "";
  const index = {};
  lines.forEach(function (line) {
    const doc = docsById[line["Document ID"]];
    if (!doc || !doc["Activity ID"]) {
      return;
    }

    const activity = activityById[doc["Activity ID"]];
    if (!activity) {
      return;
    }

    const activityDevoteeId = activity["Devotee ID"] || getDevoteeIdByName_("SJRD") || "";

    if (devoteeId && String(activityDevoteeId || "") !== devoteeId) {
      return;
    }

    const type = doc["Document Type"];
    const allowed = ["ISSUE", "RETURN", "SALE", "COMPLIMENTARY", "UNSETTLED_OPENING"];
    if (allowed.indexOf(type) === -1) {
      return;
    }

    const key = doc["Activity ID"] + "|" + line["Book ID"];
    if (!index[key]) {
      index[key] = {
        devoteeId: activityDevoteeId,
        devoteeName: getDevoteeName_(activityDevoteeId),
        activityId: doc["Activity ID"],
        activityName: activity.Name,
        bookId: line["Book ID"],
        warehouseId: doc["From Warehouse ID"] || doc["To Warehouse ID"] || activity["Warehouse ID"] || "",
        issueQty: 0,
        returnQty: 0,
        saleQty: 0,
        complimentaryQty: 0,
        unsettledQty: 0
      };
    }

    const quantity = Number(line["Quantity"] || 0);
    if (type === "ISSUE" || type === "UNSETTLED_OPENING") {
      index[key].issueQty += quantity;
      index[key].unsettledQty += quantity;
    } else if (type === "RETURN") {
      index[key].returnQty += quantity;
      index[key].unsettledQty -= quantity;
    } else if (type === "SALE") {
      index[key].saleQty += quantity;
      index[key].unsettledQty -= quantity;
    } else if (type === "COMPLIMENTARY") {
      index[key].complimentaryQty += quantity;
    }
  });

  return Object.keys(index).map(function (key) {
    return index[key];
  }).sort(function (a, b) {
    return String(a.devoteeName).localeCompare(String(b.devoteeName)) ||
      String(a.activityName).localeCompare(String(b.activityName)) ||
      String(a.bookId).localeCompare(String(b.bookId));
  });
}

function getActivityMonthlyReport_(payload) {
  const month = payload && payload.month ? String(payload.month) : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  const window = getMonthWindow_(month);
  const devoteeId = payload && payload.devoteeId ? String(payload.devoteeId) : "";
  const activityId = payload && payload.activityId ? String(payload.activityId) : "";
  if (!activityId) {
    throw new Error("Activity is required");
  }

  const activities = readObjects_("Activities");
  const activity = activities.find(function (row) {
    return row["Activity ID"] === activityId;
  });
  if (!activity) {
    throw new Error("Activity not found");
  }
  const activityDevoteeId = activity["Devotee ID"] || getDevoteeIdByName_("SJRD") || "";
  if (devoteeId && String(activityDevoteeId || "") !== devoteeId) {
    throw new Error("Selected activity does not belong to the selected devotee");
  }

  const books = readObjects_("Books").filter(function (row) {
    return row.Active === true || row.Active === "TRUE" || row.Active === "true";
  });
  const booksById = {};
  books.forEach(function (book) {
    booksById[book["ERP Code"]] = book;
  });

  const documents = readObjects_("Documents");
  const lines = readObjects_("DocumentLines");
  const docsById = {};
  documents.forEach(function (doc) {
    docsById[doc["Document ID"]] = doc;
  });

  const allowed = ["ISSUE", "RETURN", "SALE", "COMPLIMENTARY", "UNSETTLED_OPENING"];
  const docColumns = documents.filter(function (doc) {
    if (doc["Activity ID"] !== activityId) {
      return false;
    }
    if (String(doc.Status || "").toLowerCase() === "cancelled") {
      return false;
    }
    if (allowed.indexOf(doc["Document Type"]) === -1) {
      return false;
    }
    const docDate = doc["Document Date"] ? new Date(doc["Document Date"]) : null;
    return docDate && !isNaN(docDate.getTime()) && docDate >= window.start && docDate <= window.end;
  }).map(function (doc) {
    return {
      documentId: doc["Document ID"],
      documentType: doc["Document Type"],
      documentDate: doc["Document Date"],
      status: doc.Status,
      notes: doc.Notes
    };
  }).sort(function (a, b) {
    const aDate = a.documentDate ? new Date(a.documentDate) : null;
    const bDate = b.documentDate ? new Date(b.documentDate) : null;
    const diff = (aDate ? aDate.getTime() : 0) - (bDate ? bDate.getTime() : 0);
    if (diff !== 0) {
      return diff;
    }
    return String(a.documentId).localeCompare(String(b.documentId));
  });

  const index = {};
  lines.forEach(function (line) {
    const doc = docsById[line["Document ID"]];
    if (!doc || doc["Activity ID"] !== activityId) {
      return;
    }
    if (String(doc.Status || "").toLowerCase() === "cancelled") {
      return;
    }
    if (allowed.indexOf(doc["Document Type"]) === -1) {
      return;
    }
    const docDate = doc["Document Date"] ? new Date(doc["Document Date"]) : null;
    if (!docDate || isNaN(docDate.getTime()) || docDate < window.start || docDate > window.end) {
      return;
    }

    const bookId = line["Book ID"];
    if (!index[bookId]) {
      const book = booksById[bookId] || {};
      index[bookId] = {
        bookId: bookId,
        bookName: book["Book Name"] || bookId,
        bookType: book["Book Type"] || "",
        issueQty: 0,
        returnQty: 0,
        saleQty: 0,
        complimentaryQty: 0,
        unsettledQty: 0,
        docMap: {},
        worth: 0
      };
    }

    const quantity = Number(line["Quantity"] || 0);
    const salePrice = Number((booksById[bookId] && booksById[bookId]["Sale Price"]) || 0);
    if (!index[bookId].docMap[doc["Document ID"]]) {
      index[bookId].docMap[doc["Document ID"]] = {
        issueQty: 0,
        returnQty: 0,
        saleQty: 0,
        complimentaryQty: 0,
        unsettledQty: 0
      };
    }
    const docBucket = index[bookId].docMap[doc["Document ID"]];
    const type = doc["Document Type"];
    if (type === "ISSUE") {
      docBucket.issueQty += quantity;
      index[bookId].issueQty += quantity;
      index[bookId].unsettledQty += quantity;
    } else if (type === "UNSETTLED_OPENING") {
      docBucket.unsettledQty += quantity;
      index[bookId].issueQty += quantity;
      index[bookId].unsettledQty += quantity;
    } else if (type === "RETURN") {
      docBucket.returnQty += quantity;
      index[bookId].returnQty += quantity;
      index[bookId].unsettledQty -= quantity;
    } else if (type === "SALE") {
      docBucket.saleQty += quantity;
      index[bookId].saleQty += quantity;
      index[bookId].unsettledQty -= quantity;
    } else if (type === "COMPLIMENTARY") {
      docBucket.complimentaryQty += quantity;
      index[bookId].complimentaryQty += quantity;
    }
    index[bookId].worth += quantity * salePrice;
  });

  Object.keys(index).forEach(function (bookId) {
    const row = index[bookId];
    const settled = String(activity.Status || "").toLowerCase() === "completed";
    if (settled && row.saleQty === 0) {
      row.saleQty = Math.max(0, row.issueQty - row.returnQty);
      row.unsettledQty = 0;
    } else {
      row.unsettledQty = Math.max(0, row.unsettledQty);
    }
  });

  const rows = Object.keys(index).map(function (bookId) {
    return index[bookId];
  }).sort(function (a, b) {
    return String(a.bookName).localeCompare(String(b.bookName)) || String(a.bookId).localeCompare(String(b.bookId));
  });

  const totals = {
    issueQty: 0,
    returnQty: 0,
    saleQty: 0,
    complimentaryQty: 0,
    unsettledQty: 0,
    worth: 0
  };
  rows.forEach(function (row) {
    totals.issueQty += Number(row.issueQty || 0);
    totals.returnQty += Number(row.returnQty || 0);
    totals.saleQty += Number(row.saleQty || 0);
    totals.complimentaryQty += Number(row.complimentaryQty || 0);
    totals.unsettledQty += Number(row.unsettledQty || 0);
    totals.worth += Number(row.worth || 0);
    row.documentCount = Object.keys(row.docMap || {}).length;
    row.docMapArray = docColumns.map(function (doc) {
      return {
        documentId: doc.documentId,
        documentType: doc.documentType,
        documentDate: doc.documentDate,
        issueQty: Number((row.docMap[doc.documentId] && row.docMap[doc.documentId].issueQty) || 0),
        returnQty: Number((row.docMap[doc.documentId] && row.docMap[doc.documentId].returnQty) || 0),
        saleQty: Number((row.docMap[doc.documentId] && row.docMap[doc.documentId].saleQty) || 0),
        complimentaryQty: Number((row.docMap[doc.documentId] && row.docMap[doc.documentId].complimentaryQty) || 0),
        unsettledQty: Number((row.docMap[doc.documentId] && row.docMap[doc.documentId].unsettledQty) || 0)
      };
    });
  });

  return {
    month: month,
    devoteeId: activityDevoteeId,
    devoteeName: getDevoteeName_(activityDevoteeId),
    activityId: activity["Activity ID"],
    activityName: activity.Name,
    activityStatus: activity.Status,
    warehouseId: activity["Warehouse ID"] || "",
    warehouseName: getWarehouseName_(activity["Warehouse ID"]),
    documents: docColumns,
    rows: rows,
    totals: totals
  };
}

function getWarehouseMonthlyReport_(payload) {
  const warehouseId = payload && payload.warehouseId ? String(payload.warehouseId) : "";
  if (!warehouseId) {
    throw new Error("Warehouse is required");
  }

  const warehouses = readObjects_("Warehouses");
  const books = readObjects_("Books").filter(function (row) {
    return row.Active === true || row.Active === "TRUE" || row.Active === "true";
  });
  const warehouse = warehouses.find(function (row) {
    return row["Warehouse ID"] === warehouseId;
  });
  if (!warehouse) {
    throw new Error("Warehouse not found");
  }
  const isMainWarehouse = (warehouse["Warehouse Name"] || "").toLowerCase().indexOf("gmb") === 0;

  const month = payload && payload.month ? String(payload.month) : Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM");
  const window = getMonthWindow_(month);
  const ledger = readObjects_("StockLedger");
  const docs = readObjects_("Documents");
  const activities = readObjects_("Activities");
  const docById = {};
  const activityById = {};
  docs.forEach(function (doc) {
    docById[doc["Document ID"]] = doc;
  });
  activities.forEach(function (activity) {
    activityById[activity["Activity ID"]] = activity;
  });

  const rowsByBook = {};
  books.forEach(function (book) {
    rowsByBook[book["ERP Code"]] = {
      bookId: book["ERP Code"],
      bookName: book["Book Name"],
      bookType: book["Book Type"],
      openingQty: 0,
      issueQty: 0,
      returnQty: 0,
      settledIssueQty: 0,
      settledReturnQty: 0,
      transferInQty: 0,
      transferOutQty: 0,
      saleQty: 0,
      complimentaryQty: 0,
      unsettledQty: 0,
      closingQty: 0,
      transferBreakdown: {},
      daySales: {}
    };
  });

  ledger.forEach(function (row) {
    if (row["Warehouse ID"] !== warehouseId) {
      return;
    }
    const bookId = row["Book ID"];
    if (!rowsByBook[bookId]) {
      return;
    }

    const rowDate = row["Ledger Date"] ? new Date(row["Ledger Date"]) : null;
    const movement = row["Movement Type"];
    const inQty = Number(row["Quantity In"] || 0);
    const outQty = Number(row["Quantity Out"] || 0);
    const net = inQty - outQty;
    const doc = docById[row["Document ID"]];
    const activity = doc ? activityById[doc["Activity ID"]] : null;
    const isSettledActivity = activity && String(activity.Status || "").toLowerCase() === "completed";

    if (rowDate && rowDate < window.start) {
      rowsByBook[bookId].openingQty += net;
      rowsByBook[bookId].closingQty += net;
      return;
    }
    if (!rowDate || rowDate > window.end) {
      return;
    }

    if (movement === "ISSUE") {
      rowsByBook[bookId].issueQty += outQty;
      if (isSettledActivity) {
        rowsByBook[bookId].settledIssueQty += outQty;
      }
    } else if (movement === "RETURN") {
      rowsByBook[bookId].returnQty += inQty;
      if (isSettledActivity) {
        rowsByBook[bookId].settledReturnQty += inQty;
      }
    } else if (movement === "TRANSFER_IN") {
      rowsByBook[bookId].transferInQty += inQty;
      const fromName = doc ? getWarehouseName_(doc["From Warehouse ID"]) : "";
      rowsByBook[bookId].transferBreakdown[fromName || "Transfer In"] = (rowsByBook[bookId].transferBreakdown[fromName || "Transfer In"] || 0) + inQty;
    } else if (movement === "TRANSFER_OUT") {
      rowsByBook[bookId].transferOutQty += outQty;
      const toName = doc ? getWarehouseName_(doc["To Warehouse ID"]) : "";
      rowsByBook[bookId].transferBreakdown[toName || "Transfer Out"] = (rowsByBook[bookId].transferBreakdown[toName || "Transfer Out"] || 0) + outQty;
    } else if (movement === "SALE" && !isMainWarehouse) {
      rowsByBook[bookId].saleQty += outQty;
      const dayKey = Utilities.formatDate(rowDate, Session.getScriptTimeZone(), "yyyy-MM-dd");
      rowsByBook[bookId].daySales[dayKey] = (rowsByBook[bookId].daySales[dayKey] || 0) + outQty;
    } else if (movement === "COMPLIMENTARY") {
      rowsByBook[bookId].complimentaryQty += outQty;
    } else if (movement === "UNSETTLED_OPENING") {
      rowsByBook[bookId].unsettledQty += outQty;
    }

    rowsByBook[bookId].closingQty += net;
  });

  if (isMainWarehouse) {
    getActivityUnsettled_().forEach(function (row) {
      const activity = activityById[row.activityId];
      if (!activity || activity["Warehouse ID"] !== warehouseId) {
        return;
      }
      if (!rowsByBook[row.bookId]) {
        return;
      }
      const quantity = Number(row.unsettledQty || 0);
      if (quantity > 0) {
        rowsByBook[row.bookId].unsettledQty += quantity;
      }
    });
  }

  if (isMainWarehouse) {
    const activityLedgerRows = getActivityLedger_({});
    activityLedgerRows.forEach(function (row) {
      const activity = activityById[row.activityId];
      if (!activity || activity["Warehouse ID"] !== warehouseId) {
        return;
      }
      if (String(activity.Status || "").toLowerCase() !== "completed") {
        return;
      }
      const settledAtValue = activity["Settled At"] || activity["Updated At"] || "";
      const settledAt = settledAtValue ? new Date(settledAtValue) : null;
      if (!settledAt || settledAt < window.start || settledAt > window.end) {
        return;
      }
      if (!rowsByBook[row.bookId]) {
        return;
      }
      const dayKey = Utilities.formatDate(settledAt, Session.getScriptTimeZone(), "yyyy-MM-dd");
      const settledNet = Math.max(0, Number(row.issueQty || 0) - Number(row.returnQty || 0));
      if (settledNet > 0) {
        rowsByBook[row.bookId].saleQty += settledNet;
        rowsByBook[row.bookId].daySales[dayKey] = (rowsByBook[row.bookId].daySales[dayKey] || 0) + settledNet;
      }
    });
  }

  if (isMainWarehouse) {
    Object.keys(rowsByBook).forEach(function (bookId) {
      const row = rowsByBook[bookId];
      row.saleQty = Number(row.saleQty || 0);
    });
  }

  const dayColumns = getDayColumns_(window.start, window.end);
  const rows = Object.keys(rowsByBook).sort().map(function (bookId) {
    const row = rowsByBook[bookId];
    row.daySalesArray = dayColumns.map(function (day) {
      return { day: day, quantity: Number(row.daySales[day] || 0) };
    });
    row.transferArray = Object.keys(row.transferBreakdown).sort().map(function (name) {
      return { name: name, quantity: Number(row.transferBreakdown[name] || 0) };
    });
    return row;
  });

  return {
    warehouseId: warehouseId,
    warehouseName: warehouse["Warehouse Name"],
    month: month,
    reportMode: isMainWarehouse ? "main" : "branch",
    dayColumns: dayColumns,
    rows: rows
  };
}

function getMonthWindow_(month) {
  const parts = String(month || "").split("-");
  const year = Number(parts[0]) || new Date().getFullYear();
  const monthValue = Number(parts[1]);
  const monthIndex = Number.isNaN(monthValue) ? new Date().getMonth() : Math.max(0, Math.min(11, monthValue - 1));
  const start = new Date(year, monthIndex, 1, 0, 0, 0, 0);
  const now = new Date();
  let end = new Date(year, monthIndex + 1, 0, 23, 59, 59, 999);
  const currentMonth = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM");
  if (month === currentMonth) {
    end = now;
  }
  return { start: start, end: end };
}

function getDayColumns_(start, end) {
  const columns = [];
  const cursor = new Date(start.getTime());
  while (cursor <= end) {
    columns.push(Utilities.formatDate(cursor, Session.getScriptTimeZone(), "yyyy-MM-dd"));
    cursor.setDate(cursor.getDate() + 1);
  }
  return columns;
}

function getWarehouseName_(warehouseId) {
  if (!warehouseId) {
    return "";
  }
  const warehouse = readObjects_("Warehouses").find(function (row) {
    return row["Warehouse ID"] === warehouseId;
  });
  return warehouse ? warehouse["Warehouse Name"] : warehouseId;
}

function getCurrentStock_() {
  const ledger = readObjects_("StockLedger");
  const index = {};
  ledger.forEach(function (row) {
    const key = row["Warehouse ID"] + "|" + row["Book ID"];
    if (!index[key]) {
      index[key] = { warehouseId: row["Warehouse ID"], bookId: row["Book ID"], quantity: 0 };
    }
    index[key].quantity += Number(row["Quantity In"] || 0) - Number(row["Quantity Out"] || 0);
  });
  return Object.keys(index).map(function (key) { return index[key]; });
}

function logAudit_(action, entity, entityId, details) {
  appendObject_("AuditLog", {
    "Log ID": nextId_("LOG", "AuditLog", "Log ID"),
    "Timestamp": new Date(),
    "User": getCurrentUserLabel_(),
    "Action": action,
    "Entity": entity,
    "Entity ID": entityId,
    "Details": details || ""
  });
}

function getCurrentUserLabel_() {
  if (CURRENT_USER_ && CURRENT_USER_.username) {
    return CURRENT_USER_.name ? CURRENT_USER_.name + " (" + CURRENT_USER_.username + ")" : CURRENT_USER_.username;
  }
  return Session.getActiveUser().getEmail() || "Unknown";
}
