function routeRequest_(request) {
  const action = request.action;
  const payload = request.payload || {};
  const routes = {
    "system.setup": setupDatabase,
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
    "activities.list": function () { return readObjects_("Activities").map(mapActivity_); },
    "activities.create": function () { return createActivity_(payload); },
    "activities.update": function () { return updateActivity_(payload); },
    "activities.delete": function () { return deleteActivity_(payload); },
    "documents.list": function () { return readObjects_("Documents").map(mapDocument_); },
    "documents.create": function () { return createDocument_(payload); },
    "stock.current": getCurrentStock_,
    "activity.unsettled": getActivityUnsettled_
  };

  if (!routes[action]) {
    throw new Error("Unknown action: " + action);
  }
  return routes[action]();
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

function mapActivity_(row) {
  return {
    activityId: row["Activity ID"],
    name: row.Name,
    type: row.Type,
    startDate: row["Start Date"],
    endDate: row["End Date"],
    warehouseId: row["Warehouse ID"],
    spoc: row.SPOC,
    status: row.Status
  };
}

function createActivity_(payload) {
  validateActivity_(payload);
  const now = new Date();
  const activity = {
    "Activity ID": nextId_("ACT", "Activities", "Activity ID"),
    "Name": payload.name,
    "Type": payload.type || "Stall",
    "Start Date": payload.startDate ? new Date(payload.startDate) : "",
    "End Date": payload.endDate ? new Date(payload.endDate) : "",
    "Warehouse ID": payload.warehouseId,
    "SPOC": payload.spoc || "",
    "Status": payload.status || "Draft",
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
    "Start Date": payload.startDate ? new Date(payload.startDate) : "",
    "End Date": payload.endDate ? new Date(payload.endDate) : "",
    "Warehouse ID": payload.warehouseId,
    "SPOC": payload.spoc || "",
    "Status": payload.status || "Draft",
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

function createDocument_(payload) {
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
    "Created By": payload.createdBy || "Admin",
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

  const inwardTypes = ["OPENING", "RECEIVE", "RETURN"];
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
      index[key] = {
        activityId: doc["Activity ID"],
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
    "User": Session.getActiveUser().getEmail() || "Unknown",
    "Action": action,
    "Entity": entity,
    "Entity ID": entityId,
    "Details": details || ""
  });
}
