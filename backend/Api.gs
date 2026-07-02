function routeRequest_(request) {
  const action = request.action;
  const payload = request.payload || {};
  const routes = {
    "system.setup": setupDatabase,
    "dashboard.summary": getDashboardSummary_,
    "books.list": function () { return readObjects_("Books").map(mapBook_); },
    "books.create": function () { return createBook_(payload); },
    "books.update": function () { return updateBook_(payload); },
    "books.delete": function () { return deleteBook_(payload); },
    "warehouses.list": function () { return readObjects_("Warehouses"); },
    "activities.list": function () { return readObjects_("Activities"); },
    "documents.create": function () { return createDocument_(payload); },
    "stock.current": getCurrentStock_
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
    "Book ID": nextId_("BK", "Books", "Book ID"),
    "Book Name": payload.name,
    "Language": payload.language,
    "MRP": Number(payload.mrp || 0),
    "Distributor Price": Number(payload.distributorPrice || 0),
    "Category": payload.category || "",
    "Active": payload.active !== false,
    "Created At": now,
    "Updated At": now
  };
  appendObject_("Books", book);
  logAudit_("books.create", "Books", book["Book ID"], JSON.stringify(book));
  return mapBook_(book);
}

function updateBook_(payload) {
  if (!payload.bookId) {
    throw new Error("Book ID is required");
  }
  validateBook_(payload);

  const sheet = getSheet_("Books");
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const bookIdIndex = headers.indexOf("Book ID");
  const rowIndex = values.findIndex(function (row, index) {
    return index > 0 && row[bookIdIndex] === payload.bookId;
  });

  if (rowIndex === -1) {
    throw new Error("Book not found");
  }

  const current = {};
  headers.forEach(function (header, index) {
    current[header] = values[rowIndex][index];
  });

  const updated = {
    "Book ID": payload.bookId,
    "Book Name": payload.name,
    "Language": payload.language,
    "MRP": Number(payload.mrp || 0),
    "Distributor Price": Number(payload.distributorPrice || 0),
    "Category": payload.category || "",
    "Active": payload.active !== false,
    "Created At": current["Created At"] || new Date(),
    "Updated At": new Date()
  };

  sheet.getRange(rowIndex + 1, 1, 1, headers.length).setValues([headers.map(function (header) {
    return updated[header] === undefined ? "" : updated[header];
  })]);
  logAudit_("books.update", "Books", payload.bookId, JSON.stringify(updated));
  return mapBook_(updated);
}

function deleteBook_(payload) {
  if (!payload.bookId) {
    throw new Error("Book ID is required");
  }

  const rows = readObjects_("Books");
  const book = rows.find(function (row) {
    return row["Book ID"] === payload.bookId;
  });
  if (!book) {
    throw new Error("Book not found");
  }

  return updateBook_({
    bookId: payload.bookId,
    name: book["Book Name"],
    language: book.Language,
    mrp: book.MRP,
    distributorPrice: book["Distributor Price"],
    category: book.Category,
    active: false
  });
}

function validateBook_(payload) {
  if (!payload.name) {
    throw new Error("Book name is required");
  }
  if (!payload.language) {
    throw new Error("Language is required");
  }
  if (Number(payload.mrp || 0) < 0) {
    throw new Error("MRP cannot be negative");
  }
  if (Number(payload.distributorPrice || 0) < 0) {
    throw new Error("Distributor price cannot be negative");
  }
}

function mapBook_(row) {
  return {
    bookId: row["Book ID"],
    name: row["Book Name"],
    language: row.Language,
    mrp: row.MRP,
    distributorPrice: row["Distributor Price"],
    category: row.Category,
    active: row.Active === true || row.Active === "TRUE" || row.Active === "true"
  };
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

function appendLedgerRows_(documentId, lineId, documentType, documentDate, payload, line, quantity, rate, amount, now) {
  if (documentType === "TRANSFER") {
    appendLedgerRow_(documentId, lineId, documentDate, payload.fromWarehouseId, payload.activityId, line.bookId, "TRANSFER_OUT", 0, quantity, rate, amount, now);
    appendLedgerRow_(documentId, lineId, documentDate, payload.toWarehouseId, payload.activityId, line.bookId, "TRANSFER_IN", quantity, 0, rate, amount, now);
    return;
  }

  const inwardTypes = ["RECEIVE", "RETURN"];
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
  payload.lines.forEach(function (line) {
    if (!line.bookId) {
      throw new Error("Book ID is required on every line");
    }
    if (Number(line.quantity || 0) <= 0) {
      throw new Error("Quantity must be greater than zero");
    }
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
