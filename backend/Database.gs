function setupDatabase() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(ERP_SCHEMA).forEach(function (sheetName) {
    ensureSheet_(spreadsheet, sheetName, ERP_SCHEMA[sheetName]);
  });
  migrateActivitiesSheet_();
  seedSettings_();
  seedDevotees_();
  seedStarterWarehouses_();
  return { ok: true, message: "Database setup completed", sheets: Object.keys(ERP_SCHEMA) };
}

function ensureSheet_(spreadsheet, sheetName, headers) {
  let sheet = spreadsheet.getSheetByName(sheetName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(sheetName);
  }

  const range = sheet.getRange(1, 1, 1, headers.length);
  const existing = range.getValues()[0];
  const needsHeader = existing.join("") === "" || headers.some(function (header, index) {
    return existing[index] !== header;
  });

  if (sheetName === "Activities" && existing[0] === "Activity ID" && existing.indexOf("Devotee ID") === -1) {
    return;
  }

  if (needsHeader) {
    range.setValues([headers]);
    range.setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  sheet.autoResizeColumns(1, headers.length);
}

function seedSettings_() {
  const sheet = getSheet_("Settings");
  const rows = readObjects_("Settings");
  const existingKeys = rows.map(function (row) { return row.Key; });
  const now = new Date();
  [
    ["App Name", "HKM Visakhapatnam Book Distribution ERP", now, "System"],
    ["Currency", "INR", now, "System"],
    ["Stock Mode", "Ledger", now, "System"]
  ].forEach(function (seed) {
    if (existingKeys.indexOf(seed[0]) === -1) {
      sheet.appendRow(seed);
    }
  });
}

function seedStarterWarehouses_() {
  const sheet = getSheet_("Warehouses");
  const rows = readObjects_("Warehouses");
  if (rows.length > 0) {
    return;
  }

  const now = new Date();
  [
    ["WH-001", "GMB Main", "Main", "Admin", "", true, now, now],
    ["WH-002", "Annavaram", "Event", "", "", true, now, now],
    ["WH-003", "Simhachalam", "Event", "", "", true, now, now],
    ["WH-004", "Kakinada", "Event", "", "", true, now, now]
  ].forEach(function (row) {
    sheet.appendRow(row);
  });
}

function seedDevotees_() {
  const sheet = getSheet_("Devotees");
  const rows = readObjects_("Devotees");
  if (rows.length > 0) {
    return;
  }

  const now = new Date();
  [
    "HG NCBP",
    "YDRP",
    "VKTP",
    "ABRP",
    "SRSP",
    "SYMP",
    "KKRP",
    "GPVP",
    "RVRP",
    "ADKP",
    "GDHP",
    "ISKP",
    "NVKP",
    "SDGP",
    "NTHP",
    "RMPP",
    "SJRD",
    "BDCP",
    "GVBP",
    "MKGP"
  ].forEach(function (name, index) {
    sheet.appendRow([
      "DEV-" + String(index + 1).padStart(4, "0"),
      name,
      true,
      now,
      now
    ]);
  });
}

function migrateActivitiesSheet_() {
  const sheet = getSheet_("Activities");
  const headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), ERP_SCHEMA.Activities.length)).getValues()[0];
  if (headers.indexOf("Devotee ID") !== -1) {
    return;
  }

  sheet.insertColumnBefore(4);
  sheet.getRange(1, 1, 1, ERP_SCHEMA.Activities.length).setValues([ERP_SCHEMA.Activities]);
  sheet.setFrozenRows(1);
}

function getSheet_(sheetName) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error("Missing sheet: " + sheetName + ". Run setupDatabase() first.");
  }
  return sheet;
}

function readObjects_(sheetName) {
  const sheet = getSheet_(sheetName);
  const values = sheet.getDataRange().getValues();
  if (values.length < 2) {
    return [];
  }

  const headers = values[0];
  return values.slice(1).filter(function (row) {
    return row.join("") !== "";
  }).map(function (row) {
    const item = {};
    headers.forEach(function (header, index) {
      item[header] = row[index];
    });
    return item;
  });
}

function appendObject_(sheetName, data) {
  const headers = ERP_SCHEMA[sheetName];
  const row = headers.map(function (header) {
    return data[header] === undefined ? "" : data[header];
  });
  getSheet_(sheetName).appendRow(row);
  return data;
}

function nextId_(prefix, sheetName, columnName) {
  const rows = readObjects_(sheetName);
  let max = 0;
  rows.forEach(function (row) {
    const value = String(row[columnName] || "");
    const number = Number(value.replace(prefix + "-", ""));
    if (!isNaN(number) && number > max) {
      max = number;
    }
  });
  return prefix + "-" + String(max + 1).padStart(4, "0");
}
