import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { BOOK_IMAGE_MAP } from "./book-image-map.js";
import { DEVOTIONAL_IMAGE_MAP } from "./devotional-image-map.js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const config = {
  runtime: "nodejs"
};

function json(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing Supabase env vars");
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
  });
}

function sha256(value) {
  return crypto.createHash("sha256").update(String(value)).digest("hex");
}

function tokenHash(token) {
  return sha256(token || "");
}

function createSessionToken() {
  return crypto.randomUUID().replace(/-/g, "");
}

const BOOTSTRAP_ACCOUNTS = {
  admin: { name: "Admin", username: "admin", password: "admin123", role: "admin" },
  incharge: { name: "Store Incharge", username: "incharge", password: "incharge123", role: "store_incharge" }
};

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function bootstrapSignature(account) {
  return sha256(`bootstrap:${account.username}:${account.password}`);
}

function createBootstrapSessionToken(account) {
  return `bootstrap.${account.username}.${bootstrapSignature(account)}`;
}

function parseBootstrapSessionToken(sessionToken) {
  const match = String(sessionToken || "").match(/^bootstrap\.([^.]+)\.([a-f0-9]{64})$/i);
  if (!match) return null;
  const account = BOOTSTRAP_ACCOUNTS[match[1]];
  if (!account) return null;
  if (match[2] !== bootstrapSignature(account)) return null;
  return account;
}

function nowIso() {
  return new Date().toISOString();
}

function toDateOnly(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value).slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function normalizeMobile(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function normalizeRequesterSegment(value) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "CONGREGATION") return "CONGREGATION";
  if (raw === "FOLK") return "FOLK";
  if (raw === "FTM") return "FTM";
  return "";
}

function deriveRequestItemGroup(lines, fallback = "BOOK") {
  const groups = [...new Set((lines || []).map((line) => String(line.itemGroup || fallback || "BOOK").trim().toUpperCase()).filter(Boolean))];
  if (!groups.length) return String(fallback || "BOOK").trim().toUpperCase();
  return groups.length === 1 ? groups[0] : "MIXED";
}

function buildCatalogProfileFromRequestRows(rows) {
  const ordered = Array.isArray(rows) ? rows : [];
  const latest = ordered[0] || null;
  if (!latest) {
    return {
      exists: false,
      complete: false,
      name: "",
      mobile: "",
      requesterSegment: "",
      folkGuideName: "",
      preacherName: "",
      requesterLocation: ""
    };
  }

  const values = {
    name: "",
    mobile: normalizeMobile(latest.requester_mobile || ""),
    requesterSegment: "",
    folkGuideName: "",
    preacherName: "",
    requesterLocation: ""
  };
  for (const row of ordered) {
    if (!values.name && String(row.requester_name || "").trim()) values.name = String(row.requester_name || "").trim();
    if (!values.requesterSegment && normalizeRequesterSegment(row.requester_segment)) values.requesterSegment = normalizeRequesterSegment(row.requester_segment);
    if (!values.folkGuideName && String(row.folk_guide_name || "").trim()) values.folkGuideName = String(row.folk_guide_name || "").trim();
    if (!values.preacherName && String(row.preacher_name || "").trim()) values.preacherName = String(row.preacher_name || "").trim();
    if (!values.requesterLocation && String(row.requester_location || "").trim()) values.requesterLocation = String(row.requester_location || "").trim();
  }

  const missingFields = [];
  if (!values.name) missingFields.push("name");
  if (!values.requesterSegment) missingFields.push("requesterSegment");
  if (!values.requesterLocation) missingFields.push("requesterLocation");
  if (values.requesterSegment === "FOLK" && !values.folkGuideName) missingFields.push("folkGuideName");
  if (values.requesterSegment === "CONGREGATION" && !values.preacherName) missingFields.push("preacherName");

  return {
    exists: true,
    complete: missingFields.length === 0,
    missingFields,
    ...values
  };
}

function canAcceptCatalogRequest(row) {
  const status = String(row.status || "").trim().toUpperCase();
  return !["ACCEPTED", "FULFILLED", "REJECTED"].includes(status);
}

function normalizeCatalogKey(value) {
  return String(value || "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

function lookupCatalogImageUrl(itemGroup, erpCode, itemName) {
  const group = String(itemGroup || "BOOK").trim().toUpperCase();
  const map = group === "PARAPHERNALIA" ? DEVOTIONAL_IMAGE_MAP : BOOK_IMAGE_MAP;
  const code = String(erpCode || "").trim();
  if (code && map[code]) return map[code];
  const raw = String(itemName || "").trim();
  if (!raw) return "";
  const candidates = [
    raw,
    raw.replace(/^[^-]+-\s*/u, ""),
    raw.replace(/\s*\(.*$/u, "")
  ];
  for (const candidate of candidates) {
    const key = normalizeCatalogKey(candidate);
    if (candidate && map[candidate]) return map[candidate];
    if (key && map[key]) return map[key];
  }
  return "";
}

function resolveItemImageUrl(row, itemGroupOverride = "") {
  const group = String(itemGroupOverride || row.item_group || "BOOK").trim().toUpperCase();
  const mapped = lookupCatalogImageUrl(group, row.erp_code, row.item_name);
  if (mapped) return mapped;
  return "";
}

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function readNodeBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function nodeHeadersToWebHeaders(reqHeaders) {
  const headers = new Headers();
  for (const [key, value] of Object.entries(reqHeaders || {})) {
    if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    } else if (value !== undefined) {
      headers.set(key, String(value));
    }
  }
  return headers;
}

async function sendWebResponse(res, webResponse) {
  res.statusCode = webResponse.status;
  for (const [key, value] of webResponse.headers.entries()) {
    res.setHeader(key, value);
  }
  const body = Buffer.from(await webResponse.arrayBuffer());
  if (body.length) {
    res.end(body);
  } else {
    res.end();
  }
}

function mapUser(row) {
  const normalizedRole = String(row.role || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const isStoreIncharge = normalizedRole === "storeincharge";
  return {
    userId: row.id,
    name: row.name,
    username: row.username,
    role: isStoreIncharge ? "storeIncharge" : "mainAdmin",
    assignedWarehouseRowId: row.assigned_warehouse_id || "",
    assignedWarehouseId: row.assigned_warehouse_code || "",
    assignedWarehouseName: row.assigned_warehouse_name || "",
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function normalizeUserRole(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  return normalized === "admin" || normalized === "mainadmin" ? "admin" : "store_incharge";
}

function getBoundWarehouseFilter(currentUser) {
  if (!currentUser) return "";
  const role = String(currentUser.role || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (role !== "storeincharge") return "";
  return String(currentUser.assignedWarehouseId || "").trim();
}

async function fetchUserWithWarehouse(supabase, userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("users")
    .select("id, name, username, role, active, created_at, updated_at, assigned_warehouse_id, warehouses:assigned_warehouse_id (id, warehouse_code, warehouse_name)")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return mapUser({
    ...data,
    assigned_warehouse_code: data.warehouses?.warehouse_code || "",
    assigned_warehouse_name: data.warehouses?.warehouse_name || ""
  });
}

function mapDevotee(row) {
  return {
    devoteeId: row.devotee_code,
    devoteeName: row.devotee_name,
    active: row.active
  };
}

function mapDevoteeRow(row) {
  return {
    devoteeRowId: row.id,
    devoteeId: row.devotee_code,
    devoteeName: row.devotee_name,
    active: row.active
  };
}

function mapWarehouse(row) {
  return {
    rowId: row.id,
    warehouseId: row.warehouse_code,
    name: row.warehouse_name,
    type: row.warehouse_type,
    spoc: row.spoc,
    mobile: row.mobile,
    active: row.active
  };
}

function mapItem(row) {
  return {
    id: row.id,
    itemRowId: row.id,
    bookId: row.erp_code,
    erpCode: row.erp_code,
    name: row.item_name,
    bookType: row.item_type,
    category: row.item_type,
    salePrice: Number(row.sale_price || 0),
    mrp: Number(row.sale_price || 0),
    purchasePrice: Number(row.purchase_price || 0),
    distributorPrice: Number(row.purchase_price || 0),
    imageUrl: resolveItemImageUrl(row),
    active: row.active
  };
}

function mapActivity(row, devoteesById = {}, warehousesById = {}) {
  const devotee = devoteesById[row.devotee_id] || {};
  const warehouse = warehousesById[row.warehouse_id] || {};
  return {
    activityRowId: row.id,
    activityId: row.activity_code,
    name: row.activity_name,
    type: row.activity_type,
    devoteeId: devotee.devotee_code || row.devotee_id || "",
    devoteeRowId: row.devotee_id || "",
    devoteeName: devotee.devotee_name || "",
    startDate: row.start_date,
    endDate: row.end_date,
    warehouseId: warehouse.warehouse_code || row.warehouse_id || "",
    warehouseRowId: row.warehouse_id || "",
    warehouseName: warehouse.warehouse_name || "",
    spoc: row.spoc,
    status: row.status,
    settledAt: row.settled_at,
    active: row.active
  };
}

function mapDocument(row) {
  return {
    documentId: row.document_code,
    documentType: row.document_type,
    documentDate: row.document_date,
    fromWarehouseId: row.from_warehouse_id || "",
    toWarehouseId: row.to_warehouse_id || "",
    activityId: row.activity_id || "",
    volunteerId: row.created_by_user_id || "",
    status: row.status,
    notes: row.notes,
    createdAt: row.created_at,
    createdBy: row.created_by_user_id || ""
  };
}

function mapOnlineClassRegistration(row, warehousesById = {}, itemsById = {}) {
  const warehouse = warehousesById[row.source_warehouse_id] || {};
  const item = itemsById[row.item_id] || {};
  return {
    registrationId: row.id,
    language: row.language || "English",
    sourceWarehouseId: row.source_warehouse_id || "",
    sourceWarehouseCode: row.source_warehouse_code || warehouse.warehouse_code || "",
    sourceWarehouseName: row.source_warehouse_name || warehouse.warehouse_name || "",
    utmSource: row.utm_source || "",
    utmMedium: row.utm_medium || "",
    utmCampaign: row.utm_campaign || "",
    name: row.name || "",
    whatsappNumber: row.whatsapp_number || "",
    age: row.age,
    occupation: row.occupation || "",
    stayArea: row.stay_area || "",
    itemId: row.item_id || "",
    itemErpCode: row.item_erp_code || item.erp_code || "",
    itemName: row.item_name || item.item_name || "",
    itemGroup: row.item_group || item.item_group || "BOOK",
    interestedInClasses: row.interested_in_classes || false,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getSessionUser(supabase, sessionToken) {
  if (!sessionToken) return null;
  const bootstrapAccount = parseBootstrapSessionToken(sessionToken);
  if (bootstrapAccount) {
    return mapUser({
      id: `bootstrap-${bootstrapAccount.username}`,
      name: bootstrapAccount.name,
      username: bootstrapAccount.username,
      role: bootstrapAccount.role,
      active: true,
      created_at: null,
      updated_at: null
    });
  }
  const { data: session } = await supabase
    .from("user_sessions")
    .select("user_id,expires_at,revoked_at")
    .eq("session_token_hash", tokenHash(sessionToken))
    .is("revoked_at", null)
    .gt("expires_at", nowIso())
    .maybeSingle();
  if (!session) return null;
  return fetchUserWithWarehouse(supabase, session.user_id);
}

async function requireCurrentUser(supabase, payload, publicAction) {
  if (publicAction) return null;
  const currentUser = await getSessionUser(supabase, payload.sessionToken);
  if (!currentUser) throw new Error("Please log in to continue");
  return currentUser;
}

function requireAdminUser(currentUser) {
  const role = String(currentUser && currentUser.role || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  const username = String(currentUser && currentUser.username || "").trim().toLowerCase();
  const isAdmin = role === "mainadmin" || role === "admin" || username === "admin";
  if (!currentUser || !isAdmin) {
    throw new Error("Admin access required");
  }
}

async function listTable(supabase, tableName, mapper) {
  const data = await selectAllRows((from, to) => supabase.from(tableName).select("*").range(from, to));
  return (data || []).map(mapper);
}

async function selectAllRows(fetchPage, pageSize = 1000) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw error;
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

async function findByCode(supabase, tableName, codeColumn, code) {
  const { data, error } = await supabase.from(tableName).select("*").eq(codeColumn, code).maybeSingle();
  if (error) throw error;
  return data || null;
}

async function nextCode(supabase, tableName, columnName, prefix, pad = 4) {
  const { data, error } = await supabase.from(tableName).select(columnName).order(columnName, { ascending: false }).limit(1);
  if (error) throw error;
  const latest = data && data[0] ? String(data[0][columnName] || "") : "";
  const match = latest.match(new RegExp(`${prefix}-(\\d+)`));
  const next = match ? Number(match[1]) + 1 : 1;
  return `${prefix}-${String(next).padStart(pad, "0")}`;
}

async function createItem(supabase, payload) {
  const erpCode = String(payload.erpCode || payload.bookId || "").trim();
  const name = String(payload.name || payload.bookName || "").trim();
  const itemGroup = String(payload.itemGroup || payload.group || "BOOK").trim().toUpperCase();
  const label = itemGroup === "PARAPHERNALIA" ? "item" : "book";
  if (!erpCode || !name) throw new Error(`ERP Code and ${label} name are required`);
  const { data, error } = await supabase.from("items").insert({
    erp_code: erpCode,
    item_name: name,
    item_group: ["BOOK", "PARAPHERNALIA", "OTHER"].includes(itemGroup) ? itemGroup : "BOOK",
    item_type: String(payload.bookType || payload.category || "").trim(),
    unit: payload.unit || "pcs",
    purchase_price: Number(payload.purchasePrice || payload.distributorPrice || 0),
    sale_price: Number(payload.salePrice || payload.mrp || 0),
    image_url: String(payload.imageUrl || payload.image_url || "").trim(),
    active: payload.active !== false
  }).select("*").single();
  if (error) throw error;
  return mapItem(data);
}

async function updateItem(supabase, payload) {
  const erpCode = String(payload.erpCode || payload.bookId || "").trim();
  if (!erpCode) throw new Error("ERP Code is required");
  const updates = {};
  if (payload.itemGroup !== undefined || payload.group !== undefined) {
    const itemGroup = String(payload.itemGroup || payload.group || "BOOK").trim().toUpperCase();
    updates.item_group = ["BOOK", "PARAPHERNALIA", "OTHER"].includes(itemGroup) ? itemGroup : "BOOK";
  }
  if (payload.name !== undefined || payload.bookName !== undefined) updates.item_name = String(payload.name || payload.bookName || "").trim();
  if (payload.bookType !== undefined || payload.category !== undefined) updates.item_type = String(payload.bookType || payload.category || "").trim();
  if (payload.purchasePrice !== undefined || payload.distributorPrice !== undefined) updates.purchase_price = Number(payload.purchasePrice || payload.distributorPrice || 0);
  if (payload.salePrice !== undefined || payload.mrp !== undefined) updates.sale_price = Number(payload.salePrice || payload.mrp || 0);
  if (payload.imageUrl !== undefined || payload.image_url !== undefined) updates.image_url = String(payload.imageUrl || payload.image_url || "").trim();
  if (payload.active !== undefined) updates.active = Boolean(payload.active);
  const { data, error } = await supabase.from("items").update(updates).eq("erp_code", erpCode).select("*").single();
  if (error) throw error;
  return mapItem(data);
}

async function deleteItem(supabase, payload) {
  const erpCode = String(payload.erpCode || payload.bookId || "").trim();
  const { data, error } = await supabase.from("items").update({ active: false }).eq("erp_code", erpCode).select("*").single();
  if (error) throw error;
  return mapItem(data);
}

async function itemsList(supabase, payload = {}) {
  let query = supabase.from("items").select("*").order("item_name", { ascending: true });
  const itemGroup = String(payload.itemGroup || payload.group || "").trim().toUpperCase();
  if (itemGroup) {
    query = query.eq("item_group", itemGroup);
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(mapItem);
}

async function itemsCreate(supabase, payload) {
  return createItem(supabase, payload);
}

async function itemsUpdate(supabase, payload) {
  return updateItem(supabase, payload);
}

async function itemsDelete(supabase, payload) {
  return deleteItem(supabase, payload);
}

async function itemsBulkUpsert(supabase, payload) {
  const itemGroup = String(payload.itemGroup || payload.group || "BOOK").trim().toUpperCase();
  const items = Array.isArray(payload.items) ? payload.items : [];
  const existingRows = await listTable(supabase, "items", mapItem);
  const existingByCode = new Map(existingRows.map((row) => [row.erpCode, row]));
  let nextSuffix = existingRows.reduce((max, row) => {
    const match = String(row.erpCode || "").match(/^IT-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const normalized = items.map((item) => {
    const rawCode = String(item.erpCode || item["ERP Code"] || "").trim();
    const erpCode = rawCode || `IT-${String(++nextSuffix).padStart(4, "0")}`;
    return {
      erp_code: erpCode,
      item_name: String(item.name || item["Book Name"] || item["Item Name"] || "").trim(),
      item_group: ["BOOK", "PARAPHERNALIA", "OTHER"].includes(itemGroup) ? itemGroup : "OTHER",
      item_type: String(item.bookType || item.category || item["Item Type"] || item["Book Type"] || "").trim(),
      unit: "pcs",
      purchase_price: Number(item.purchasePrice || item["Purchase Price"] || item.distributorPrice || 0),
      sale_price: Number(item.salePrice || item["Sale Price"] || item.mrp || 0),
      image_url: String(item.imageUrl || item.image_url || item["Image URL"] || item["Image Link"] || "").trim(),
      active: item.active !== false
    };
  }).filter((row) => row.erp_code && row.item_name);

  if (!normalized.length) {
    return { created: 0, updated: 0, total: 0 };
  }

  const created = normalized.filter((row) => !existingByCode.has(row.erp_code)).length;
  const updated = normalized.length - created;
  const { error } = await supabase.from("items").upsert(normalized, { onConflict: "erp_code" });
  if (error) throw error;
  return { created, updated, total: normalized.length };
}

async function upsertItemIfMissing(supabase, line) {
  const erpCode = String(line.erpCode || line.bookId || "").trim();
  const name = String(line.bookName || line.name || "").trim();
  const itemGroup = String(line.itemGroup || line.group || "BOOK").trim().toUpperCase();
  const label = itemGroup === "PARAPHERNALIA" ? "item" : "book";
  if (!name) throw new Error(`${label[0].toUpperCase()}${label.slice(1)} name is required for purchase input`);
  if (erpCode) {
    const existing = await findByCode(supabase, "items", "erp_code", erpCode);
    if (existing) return mapItem(existing);
  }
  let byNameQuery = supabase.from("items").select("*").ilike("item_name", name);
  if (itemGroup) {
    byNameQuery = byNameQuery.eq("item_group", itemGroup);
  }
  const { data: byName } = await byNameQuery.maybeSingle();
  if (byName) return mapItem(byName);
  return await createItem(supabase, {
    erpCode: erpCode || await nextCode(supabase, "items", "erp_code", "BK"),
    name,
    bookType: line.bookType || line.category || "General",
    purchasePrice: line.purchasePrice || line.rate || 0,
    salePrice: line.salePrice || line.mrp || 0,
    imageUrl: line.imageUrl || line.image_url || "",
    itemGroup,
    active: true
  });
}

async function createWarehouse(supabase, payload) {
  const warehouseCode = payload.warehouseId || payload.warehouseCode || await nextCode(supabase, "warehouses", "warehouse_code", "WH");
  const { data, error } = await supabase.from("warehouses").insert({
    warehouse_code: warehouseCode,
    warehouse_name: String(payload.name || "").trim(),
    warehouse_type: String(payload.type || "Event").trim(),
    spoc: String(payload.spoc || "").trim(),
    mobile: String(payload.mobile || "").trim(),
    active: payload.active !== false
  }).select("*").single();
  if (error) throw error;
  return mapWarehouse(data);
}

async function updateWarehouse(supabase, payload) {
  const warehouseCode = String(payload.warehouseId || payload.warehouseCode || "").trim();
  const updates = {
    warehouse_name: String(payload.name || "").trim(),
    warehouse_type: String(payload.type || "Event").trim(),
    spoc: String(payload.spoc || "").trim(),
    mobile: String(payload.mobile || "").trim(),
    active: payload.active !== false
  };
  const { data, error } = await supabase.from("warehouses").update(updates).eq("warehouse_code", warehouseCode).select("*").single();
  if (error) throw error;
  return mapWarehouse(data);
}

async function deleteWarehouse(supabase, payload) {
  const warehouseCode = String(payload.warehouseId || payload.warehouseCode || "").trim();
  const { data, error } = await supabase.from("warehouses").update({ active: false }).eq("warehouse_code", warehouseCode).select("*").single();
  if (error) throw error;
  return mapWarehouse(data);
}

async function warehousesBulkUpsert(supabase, payload) {
  const warehouses = Array.isArray(payload.warehouses) ? payload.warehouses : [];
  const existingRows = await listTable(supabase, "warehouses", mapWarehouse);
  const existingByCode = new Map(existingRows.map((row) => [row.warehouseId, row]));
  let nextSuffix = existingRows.reduce((max, row) => {
    const match = String(row.warehouseId || "").match(/^WH-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const normalized = warehouses.map((warehouse) => {
    const rawCode = String(warehouse.warehouseId || warehouse.warehouseCode || "").trim();
    const warehouseCode = rawCode || `WH-${String(++nextSuffix).padStart(4, "0")}`;
    return {
      warehouse_code: warehouseCode,
      warehouse_name: String(warehouse.name || warehouse.warehouseName || "").trim(),
      warehouse_type: String(warehouse.type || warehouse.warehouseType || "Event").trim() || "Event",
      spoc: String(warehouse.spoc || "").trim(),
      mobile: String(warehouse.mobile || "").trim(),
      active: warehouse.active !== false
    };
  }).filter((row) => row.warehouse_code && row.warehouse_name);

  if (!normalized.length) {
    return { created: 0, updated: 0, total: 0 };
  }

  const created = normalized.filter((row) => !existingByCode.has(row.warehouse_code)).length;
  const updated = normalized.length - created;
  const { error } = await supabase.from("warehouses").upsert(normalized, { onConflict: "warehouse_code" });
  if (error) throw error;
  return { created, updated, total: normalized.length };
}

async function createDevotee(supabase, payload) {
  const devoteeCode = payload.devoteeId || payload.devoteeCode || await nextCode(supabase, "devotees", "devotee_code", "DEV");
  const { data, error } = await supabase.from("devotees").insert({
    devotee_code: devoteeCode,
    devotee_name: String(payload.devoteeName || payload.name || "").trim(),
    active: payload.active !== false
  }).select("*").single();
  if (error) throw error;
  return mapDevotee(data);
}

async function updateDevotee(supabase, payload) {
  const devoteeCode = String(payload.devoteeId || payload.devoteeCode || "").trim();
  const { data, error } = await supabase.from("devotees").update({
    devotee_name: String(payload.devoteeName || payload.name || "").trim(),
    active: payload.active !== false
  }).eq("devotee_code", devoteeCode).select("*").single();
  if (error) throw error;
  return mapDevotee(data);
}

async function resolveDevoteeRef(supabase, value) {
  const devoteeRef = String(value || "").trim();
  if (!devoteeRef) return null;
  const query = supabase.from("devotees").select("id, devotee_code");
  const { data, error } = isUuidLike(devoteeRef)
    ? await query.eq("id", devoteeRef).maybeSingle()
    : await query.eq("devotee_code", devoteeRef).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Devotee not found: ${devoteeRef}`);
  return data.id;
}

async function createActivity(supabase, payload) {
  const activityCode = payload.activityId || payload.activityCode || await nextCode(supabase, "activities", "activity_code", "ACT");
  const devoteeId = await resolveDevoteeRef(supabase, payload.devoteeId);
  const warehouseId = await resolveWarehouseRef(supabase, payload.warehouseId);
  const { data, error } = await supabase.from("activities").insert({
    activity_code: activityCode,
    activity_name: String(payload.name || "").trim(),
    activity_type: String(payload.type || "Stall").trim(),
    devotee_id: devoteeId,
    warehouse_id: warehouseId,
    spoc: String(payload.spoc || "").trim(),
    status: payload.status || "Draft",
    start_date: payload.startDate || null,
    end_date: payload.endDate || null,
    settled_at: payload.status === "Completed" ? nowIso() : null,
    active: payload.status !== "Cancelled"
  }).select("*").single();
  if (error) throw error;
  return data;
}

async function updateActivity(supabase, payload) {
  const activityCode = String(payload.activityId || payload.activityCode || "").trim();
  const devoteeId = await resolveDevoteeRef(supabase, payload.devoteeId);
  const warehouseId = await resolveWarehouseRef(supabase, payload.warehouseId);
  const updates = {
    activity_name: String(payload.name || "").trim(),
    activity_type: String(payload.type || "Stall").trim(),
    devotee_id: devoteeId,
    warehouse_id: warehouseId,
    spoc: String(payload.spoc || "").trim(),
    status: payload.status || "Draft",
    start_date: payload.startDate || null,
    end_date: payload.endDate || null,
    settled_at: payload.status === "Completed" ? nowIso() : null,
    active: payload.status !== "Cancelled"
  };
  const { data, error } = await supabase.from("activities").update(updates).eq("activity_code", activityCode).select("*").single();
  if (error) throw error;
  return data;
}

async function deleteActivity(supabase, payload) {
  const activityCode = String(payload.activityId || payload.activityCode || "").trim();
  const { data, error } = await supabase.from("activities").update({ status: "Cancelled", active: false }).eq("activity_code", activityCode).select("*").single();
  if (error) throw error;
  return data;
}

async function authLogin(supabase, payload) {
  const username = String(payload.username || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!username || !password) throw new Error("Username and password are required");
  const { data: users, error } = await supabase.from("users").select("id, username, password_hash, active");
  if (error) throw error;
  const user = (users || []).find((row) => String(row.username || "").trim().toLowerCase() === username);
  if (user && user.active && user.password_hash === sha256(password)) {
    const sessionToken = createSessionToken();
    const { error: sessionError } = await supabase.from("user_sessions").insert({
      user_id: user.id,
      session_token_hash: tokenHash(sessionToken),
      expires_at: new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString()
    });
    if (sessionError) throw sessionError;
    return { sessionToken, user: await fetchUserWithWarehouse(supabase, user.id) };
  }
  const bootstrapAccount = BOOTSTRAP_ACCOUNTS[username];
  if (bootstrapAccount && bootstrapAccount.password === password) {
    return {
      sessionToken: createBootstrapSessionToken(bootstrapAccount),
      user: mapUser({
        id: `bootstrap-${bootstrapAccount.username}`,
        name: bootstrapAccount.name,
        username: bootstrapAccount.username,
        role: bootstrapAccount.role,
        active: true,
        created_at: null,
        updated_at: null
      })
    };
  }
  throw new Error("Invalid username or password");
}

async function authLogout(supabase, payload) {
  if (parseBootstrapSessionToken(payload.sessionToken)) {
    return { ok: true };
  }
  if (payload.sessionToken) {
    await supabase.from("user_sessions").update({ revoked_at: nowIso() }).eq("session_token_hash", tokenHash(payload.sessionToken));
  }
  return { ok: true };
}

async function usersList(supabase) {
  const { data, error } = await supabase
    .from("users")
    .select("id, name, username, role, active, created_at, updated_at, assigned_warehouse_id, warehouses:assigned_warehouse_id (id, warehouse_code, warehouse_name)")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []).map((row) => mapUser({
    ...row,
    assigned_warehouse_code: row.warehouses?.warehouse_code || "",
    assigned_warehouse_name: row.warehouses?.warehouse_name || ""
  }));
}

async function createUser(supabase, payload) {
  const username = String(payload.username || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  if (!name || !username || !String(payload.password || "").trim()) throw new Error("Name, username, and password are required");
  let assignedWarehouseId = null;
  if (payload.assignedWarehouseId) {
    const assignedWarehouse = await resolveWarehouseRow(supabase, payload.assignedWarehouseId);
    assignedWarehouseId = assignedWarehouse?.id || null;
  }
  const { data: existing } = await supabase.from("users").select("id").ilike("username", username).maybeSingle();
  if (existing) throw new Error("Username already exists");
  const { data, error } = await supabase.from("users").insert({
    name,
    username,
    password_hash: sha256(payload.password),
    role: normalizeUserRole(payload.role),
    assigned_warehouse_id: assignedWarehouseId,
    active: payload.active !== false
  }).select("*").single();
  if (error) throw error;
  return fetchUserWithWarehouse(supabase, data.id);
}

async function updateUser(supabase, payload) {
  const id = payload.userId;
  if (!id) throw new Error("User ID is required");
  const updates = {};
  if (payload.name !== undefined) updates.name = String(payload.name || "").trim();
  if (payload.username !== undefined) updates.username = String(payload.username || "").trim().toLowerCase();
  if (payload.password !== undefined && String(payload.password || "").trim()) updates.password_hash = sha256(payload.password);
  if (payload.role !== undefined) updates.role = normalizeUserRole(payload.role);
  if (payload.assignedWarehouseId !== undefined) {
    if (String(payload.assignedWarehouseId || "").trim()) {
      const assignedWarehouse = await resolveWarehouseRow(supabase, payload.assignedWarehouseId);
      updates.assigned_warehouse_id = assignedWarehouse?.id || null;
    } else {
      updates.assigned_warehouse_id = null;
    }
  }
  if (payload.active !== undefined) updates.active = Boolean(payload.active);
  const { data, error } = await supabase.from("users").update(updates).eq("id", id).select("*").single();
  if (error) throw error;
  return fetchUserWithWarehouse(supabase, data.id);
}

async function booksList(supabase) {
  return (await itemsList(supabase, { itemGroup: "BOOK" })).map((row) => {
    const { purchasePrice, distributorPrice, ...publicRow } = row;
    return publicRow;
  });
}

async function booksAdminList(supabase) {
  return itemsList(supabase, { itemGroup: "BOOK" });
}

async function itemsAdminList(supabase, payload) {
  return itemsList(supabase, payload);
}

async function itemsPublicList(supabase, payload) {
  return (await itemsList(supabase, payload)).map((row) => {
    const { purchasePrice, distributorPrice, ...publicRow } = row;
    return publicRow;
  });
}

async function booksCreate(supabase, payload) {
  return createItem(supabase, { ...payload, itemGroup: "BOOK" });
}

async function booksUpdate(supabase, payload) {
  return updateItem(supabase, { ...payload, itemGroup: payload.itemGroup || "BOOK" });
}

async function booksDelete(supabase, payload) {
  return deleteItem(supabase, payload);
}

async function booksBulkUpsert(supabase, payload) {
  const books = Array.isArray(payload.books) ? payload.books : [];
  const existingRows = await listTable(supabase, "items", mapItem);
  const existingByCode = new Map(existingRows.map((row) => [row.erpCode, row]));
  let nextSuffix = existingRows.reduce((max, row) => {
    const match = String(row.erpCode || "").match(/^BK-(\d+)$/i);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);

  const normalized = books.map((book) => {
    const rawCode = String(book.erpCode || book["ERP Code"] || "").trim();
    const erpCode = rawCode || `BK-${String(++nextSuffix).padStart(4, "0")}`;
    return {
      erp_code: erpCode,
      item_name: String(book.name || book["Book Name"] || "").trim(),
      item_group: "BOOK",
      item_type: String(book.bookType || book["Book Type"] || "").trim(),
      unit: "pcs",
      purchase_price: Number(book.purchasePrice || book["Purchase Price"] || 0),
      sale_price: Number(book.salePrice || book["Sale Price"] || 0),
      active: book.active !== false
    };
  }).filter((row) => row.erp_code && row.item_name);

  if (!normalized.length) {
    return { created: 0, updated: 0, total: 0 };
  }

  const created = normalized.filter((row) => !existingByCode.has(row.erp_code)).length;
  const updated = normalized.length - created;
  const { error } = await supabase.from("items").upsert(normalized, { onConflict: "erp_code" });
  if (error) throw error;
  return { created, updated, total: normalized.length };
}

async function devotionalItemsList(supabase) {
  return (await itemsList(supabase, { itemGroup: "PARAPHERNALIA" })).map((row) => {
    const { purchasePrice, distributorPrice, ...publicRow } = row;
    return publicRow;
  });
}

async function warehousesList(supabase) {
  return listTable(supabase, "warehouses", mapWarehouse);
}

async function devoteesList(supabase) {
  return listTable(supabase, "devotees", mapDevotee);
}

async function activitiesList(supabase) {
  const { data: devotees } = await supabase.from("devotees").select("*");
  const { data: warehouses } = await supabase.from("warehouses").select("*");
  const devoteeById = Object.fromEntries((devotees || []).map((row) => [row.id, row]));
  const warehouseById = Object.fromEntries((warehouses || []).map((row) => [row.id, row]));
  const { data, error } = await supabase.from("activities").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => mapActivity(row, devoteeById, warehouseById));
}

async function documentsList(supabase) {
  const { data, error } = await supabase.from("documents").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapDocument);
}

async function onlineClassRegistrationsList(supabase) {
  const [warehousesResult, itemsResult, registrationsResult] = await Promise.all([
    supabase.from("warehouses").select("*"),
    supabase.from("items").select("*"),
    supabase.from("online_class_registrations").select("*").order("created_at", { ascending: false })
  ]);
  if (warehousesResult.error) throw warehousesResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (registrationsResult.error) {
    const message = String(registrationsResult.error.message || "");
    if (message.includes("could not find the table") || message.includes("does not exist")) {
      return [];
    }
    throw registrationsResult.error;
  }
  const warehousesById = Object.fromEntries((warehousesResult.data || []).map((row) => [row.id, row]));
  const itemsById = Object.fromEntries((itemsResult.data || []).map((row) => [row.id, row]));
  return (registrationsResult.data || []).map((row) => mapOnlineClassRegistration(row, warehousesById, itemsById));
}

async function createOnlineClassRegistration(supabase, payload) {
  const language = String(payload.language || "English").trim() || "English";
  if (!["English", "Telugu"].includes(language)) throw new Error("Language is required");
  const sourceWarehouseRow = await resolveWarehouseRow(supabase, payload.sourceWarehouseId || payload.warehouseId || payload.sourceWarehouseCode || payload.sourceWarehouseName || "");
  if (!sourceWarehouseRow) throw new Error("Warehouse is required");
  const itemRow = await resolveItemRow(supabase, payload.itemId || payload.erpCode || payload.bookId || "");
  if (!itemRow) throw new Error("Selected book is required");
  const name = String(payload.name || "").trim();
  const whatsappNumber = String(payload.whatsappNumber || "").replace(/\D/g, "").trim();
  const age = payload.age === undefined || payload.age === null || payload.age === "" ? null : Number.parseInt(payload.age, 10);
  const occupation = String(payload.occupation || payload.workingStatus || "").trim();
  const stayArea = String(payload.stayArea || payload.areaOfStay || "").trim();
  if (!name) throw new Error("Name is required");
  if (whatsappNumber.length !== 10) throw new Error("WhatsApp number is required");
  if (!occupation) throw new Error("Working / Student is required");
  if (!stayArea) throw new Error("Area of stay is required");
  if (Number.isNaN(age) && payload.age !== undefined && payload.age !== null && payload.age !== "") {
    throw new Error("Age must be a number");
  }

  const { data, error } = await supabase.from("online_class_registrations").insert({
    language,
    source_warehouse_id: sourceWarehouseRow.id,
    source_warehouse_code: sourceWarehouseRow.warehouse_code || "",
    source_warehouse_name: sourceWarehouseRow.warehouse_name || "",
    utm_source: String(payload.utmSource || payload.utm_source || sourceWarehouseRow.warehouse_code || sourceWarehouseRow.warehouse_name || "").trim(),
    utm_medium: String(payload.utmMedium || payload.utm_medium || "online_classes").trim() || "online_classes",
    utm_campaign: String(payload.utmCampaign || payload.utm_campaign || "").trim(),
    name,
    whatsapp_number: whatsappNumber,
    age: Number.isNaN(age) ? null : age,
    occupation,
    stay_area: stayArea,
    item_id: itemRow.id,
    item_erp_code: itemRow.erp_code || "",
    item_name: itemRow.item_name || "",
    item_group: itemRow.item_group || "BOOK",
    interested_in_classes: Boolean(payload.interestedInClasses || payload.interested_in_classes)
  }).select("*").single();
  if (error) {
    const message = String(error.message || "");
    if (message.includes("could not find the table") || message.includes("does not exist")) {
      throw new Error("Online classes schema is not applied yet. Please run supabase/schema.sql in Supabase.");
    }
    throw error;
  }
  const registrations = await onlineClassRegistrationsList(supabase);
  const created = registrations.find((row) => row.registrationId === data.id);
  return created || mapOnlineClassRegistration(data, { [sourceWarehouseRow.id]: sourceWarehouseRow }, { [itemRow.id]: itemRow });
}

async function resolveWarehouseRef(supabase, value) {
  const warehouseRef = String(value || "").trim();
  if (!warehouseRef) return null;
  const query = supabase.from("warehouses").select("id, warehouse_code");
  const { data, error } = isUuidLike(warehouseRef)
    ? await query.eq("id", warehouseRef).maybeSingle()
    : await query.eq("warehouse_code", warehouseRef).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Warehouse not found: ${warehouseRef}`);
  return data.id;
}

async function resolveWarehouseRow(supabase, value) {
  const warehouseRef = String(value || "").trim();
  if (!warehouseRef) return null;
  const { data: byId, error: byIdError } = isUuidLike(warehouseRef)
    ? await supabase.from("warehouses").select("id, warehouse_code, warehouse_name").eq("id", warehouseRef).maybeSingle()
    : { data: null, error: null };
  if (byIdError) throw byIdError;
  if (byId) return byId;
  const { data: byCode, error: byCodeError } = await supabase.from("warehouses").select("id, warehouse_code, warehouse_name").eq("warehouse_code", warehouseRef).maybeSingle();
  if (byCodeError) throw byCodeError;
  if (byCode) return byCode;
  const { data: byName, error: byNameError } = await supabase.from("warehouses").select("id, warehouse_code, warehouse_name").eq("warehouse_name", warehouseRef).maybeSingle();
  if (byNameError) throw byNameError;
  if (byName) return byName;
  const normalizedRef = warehouseRef.toLowerCase().replace(/[^a-z0-9]/g, "");
  const { data: allWarehouses, error: listError } = await supabase.from("warehouses").select("id, warehouse_code, warehouse_name");
  if (listError) throw listError;
  const normalizedMatch = (allWarehouses || []).find((row) => {
    const candidates = [row.id, row.warehouse_code, row.warehouse_name]
      .map((candidate) => String(candidate || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    return candidates.includes(normalizedRef);
  });
  if (normalizedMatch) return normalizedMatch;
  throw new Error(`Warehouse not found: ${warehouseRef}`);
}

async function resolveItemRef(supabase, value) {
  const itemRef = String(value || "").trim();
  if (!itemRef) return null;
  const query = supabase.from("items").select("id, erp_code");
  const { data, error } = isUuidLike(itemRef)
    ? await query.eq("id", itemRef).maybeSingle()
    : await query.eq("erp_code", itemRef).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Item not found: ${itemRef}`);
  return data.id;
}

async function resolveItemRow(supabase, value) {
  const itemRef = String(value || "").trim();
  if (!itemRef) return null;
  const query = supabase.from("items").select("id, erp_code, item_name, item_group");
  const { data, error } = isUuidLike(itemRef)
    ? await query.eq("id", itemRef).maybeSingle()
    : await query.eq("erp_code", itemRef).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error(`Item not found: ${itemRef}`);
  return data;
}

async function resolveActivityRow(supabase, value) {
  const activityRef = String(value || "").trim();
  if (!activityRef) return null;
  const query = supabase.from("activities").select("id, activity_code, activity_name");
  const { data, error } = isUuidLike(activityRef)
    ? await query.eq("id", activityRef).maybeSingle()
    : await query.eq("activity_code", activityRef).maybeSingle();
  if (error) throw error;
  if (data) return data;
  const normalizedRef = activityRef.toLowerCase().replace(/[^a-z0-9]/g, "");
  const { data: allActivities, error: listError } = await supabase.from("activities").select("id, activity_code, activity_name");
  if (listError) throw listError;
  const normalizedMatch = (allActivities || []).find((row) => {
    const candidates = [row.id, row.activity_code, row.activity_name]
      .map((candidate) => String(candidate || "").toLowerCase().replace(/[^a-z0-9]/g, ""));
    return candidates.includes(normalizedRef);
  });
  if (normalizedMatch) return normalizedMatch;
  throw new Error(`Activity not found: ${activityRef}`);
}

async function documentDetail(supabase, payload) {
  const documentId = String(payload.documentId || payload.documentCode || "").trim();
  if (!documentId) throw new Error("Document is required");
  const { data: doc, error: docError } = await supabase.from("documents").select("*").eq("document_code", documentId).maybeSingle();
  if (docError) throw docError;
  if (!doc) throw new Error("Document not found");
  const [linesResult, itemsResult, warehousesResult, activitiesResult] = await Promise.all([
    supabase.from("document_lines").select("*").eq("document_id", doc.id).order("line_no", { ascending: true }),
    supabase.from("items").select("*"),
    supabase.from("warehouses").select("*"),
    supabase.from("activities").select("*")
  ]);
  if (linesResult.error) throw linesResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (warehousesResult.error) throw warehousesResult.error;
  if (activitiesResult.error) throw activitiesResult.error;
  const itemById = Object.fromEntries((itemsResult.data || []).map((row) => [row.id, row]));
  const warehouseById = Object.fromEntries((warehousesResult.data || []).map((row) => [row.id, row]));
  const activityById = Object.fromEntries((activitiesResult.data || []).map((row) => [row.id, row]));
  const lines = (linesResult.data || []).map((line, index) => {
    const item = itemById[line.item_id] || {};
    return {
      lineId: line.id,
      lineNo: Number(line.line_no || index + 1),
      erpCode: item.erp_code || line.item_id || "",
      bookName: item.item_name || "",
      bookType: item.item_type || "",
      itemGroup: item.item_group || "",
      quantity: Number(line.quantity || 0),
      rate: Number(line.rate || 0),
      amount: Number(line.amount || Number(line.quantity || 0) * Number(line.rate || 0)),
      notes: line.line_notes || "",
      rawItemId: line.item_id || ""
    };
  });
  return {
    documentId: doc.document_code,
    documentType: doc.document_type,
    documentDate: doc.document_date,
    status: doc.status,
    notes: doc.notes || "",
    fromWarehouseId: doc.from_warehouse_id || "",
    fromWarehouseName: warehouseById[doc.from_warehouse_id || ""]?.warehouse_name || "",
    toWarehouseId: doc.to_warehouse_id || "",
    toWarehouseName: warehouseById[doc.to_warehouse_id || ""]?.warehouse_name || "",
    activityId: doc.activity_id || "",
    activityName: activityById[doc.activity_id || ""]?.activity_name || "",
    lines
  };
}

function documentTypeRequiresActivity(documentType) {
  return ["ISSUE", "COMPLIMENTARY", "RETURN", "UNSETTLED_OPENING", "ADJUSTMENT"].includes(documentType);
}

function parseSettlementEditNote(note) {
  const text = String(note || "").trim();
  const parts = text.split("|");
  if (parts[0] !== "SETTLEMENT_EDIT") return null;
  return {
    target: String(parts[1] || "").trim().toUpperCase(),
    direction: String(parts[2] || "").trim().toUpperCase()
  };
}

function computeLedgerQuantitiesForRow(ledgerRow, quantity) {
  const movementType = String(ledgerRow.movement_type || "").trim().toUpperCase();
  const qty = Number(quantity || 0);
  if (movementType === "TRANSFER_IN") {
    return { quantityIn: qty, quantityOut: 0 };
  }
  if (movementType === "TRANSFER_OUT") {
    return { quantityIn: 0, quantityOut: qty };
  }
  if (movementType === "UNSETTLED_OPENING") {
    return { quantityIn: 0, quantityOut: 0 };
  }
  if (Number(ledgerRow.quantity_in || 0) > 0 && Number(ledgerRow.quantity_out || 0) <= 0) {
    return { quantityIn: qty, quantityOut: 0 };
  }
  if (Number(ledgerRow.quantity_out || 0) > 0 && Number(ledgerRow.quantity_in || 0) <= 0) {
    return { quantityIn: 0, quantityOut: qty };
  }
  return { quantityIn: 0, quantityOut: 0 };
}

async function updateDocumentInPlace(supabase, payload, currentUser) {
  requireAdminUser(currentUser);
  const documentRef = String(payload.documentId || payload.documentCode || "").trim();
  if (!documentRef) throw new Error("Document is required");
  const { data: doc, error: docError } = await supabase
    .from("documents")
    .select("*")
    .or(`document_code.eq.${documentRef},id.eq.${documentRef}`)
    .maybeSingle();
  if (docError) throw docError;
  if (!doc) throw new Error("Document not found");
  if (!isCountableDocument(doc)) throw new Error("This document cannot be edited");
  if (doc.activity_id) {
    const context = await getSettlementContext(supabase);
    const activity = context.activities.find((row) => row.id === doc.activity_id);
    if (activity) {
      const detail = buildSettlementSummaryForActivity(activity, context);
      if (Number(detail.summary?.pendingAmount || 0) <= 0) {
        throw new Error("This activity is fully settled. Document editing is locked.");
      }
    }
  }
  const { data: existingLines, error: linesError } = await supabase
    .from("document_lines")
    .select("*")
    .eq("document_id", doc.id)
    .order("line_no", { ascending: true });
  if (linesError) throw linesError;
  const payloadLines = Array.isArray(payload.lines) ? payload.lines : [];
  if (!payloadLines.length) throw new Error("At least one document line is required");
  const lineById = Object.fromEntries((existingLines || []).map((line) => [String(line.id), line]));
  const lineByNo = Object.fromEntries((existingLines || []).map((line) => [String(line.line_no), line]));
  for (const rawLine of payloadLines) {
    const existingLine = lineById[String(rawLine.lineId || "").trim()] || lineByNo[String(rawLine.lineNo || "").trim()];
    if (!existingLine) {
      throw new Error(`Document line not found: ${rawLine.lineNo || rawLine.lineId || "-"}`);
    }
    const item = await resolveItemRow(supabase, rawLine.bookId || rawLine.erpCode || existingLine.item_id);
    const quantity = Number(rawLine.quantity || 0);
    const rate = Number(rawLine.rate !== undefined ? rawLine.rate : existingLine.rate || 0);
    const amount = quantity * rate;
    const { error: updateLineError } = await supabase
      .from("document_lines")
      .update({
        item_id: item.id,
        quantity,
        rate,
        amount,
        line_notes: rawLine.notes !== undefined ? String(rawLine.notes || "") : (existingLine.line_notes || "")
      })
      .eq("id", existingLine.id);
    if (updateLineError) throw updateLineError;
    const { data: ledgerRows, error: ledgerLoadError } = await supabase
      .from("stock_ledger")
      .select("*")
      .eq("document_line_id", existingLine.id);
    if (ledgerLoadError) throw ledgerLoadError;
    for (const ledgerRow of ledgerRows || []) {
      const nextQty = computeLedgerQuantitiesForRow(ledgerRow, quantity);
      const { error: ledgerUpdateError } = await supabase
        .from("stock_ledger")
        .update({
          item_id: item.id,
          ledger_date: toDateOnly(payload.documentDate || doc.document_date),
          quantity_in: nextQty.quantityIn,
          quantity_out: nextQty.quantityOut,
          rate,
          amount,
          updated_at: nowIso()
        })
        .eq("id", ledgerRow.id);
      if (ledgerUpdateError) throw ledgerUpdateError;
    }
  }
  const { error: updateDocError } = await supabase
    .from("documents")
    .update({
      document_date: toDateOnly(payload.documentDate || doc.document_date),
      notes: payload.notes !== undefined ? String(payload.notes || "") : (doc.notes || ""),
      updated_at: nowIso()
    })
    .eq("id", doc.id);
  if (updateDocError) throw updateDocError;
  if (doc.activity_id) {
    await syncActivitySettlementStatus(supabase, doc.activity_id);
  }
  return { documentId: doc.document_code, documentRowId: doc.id };
}

function isCountableDocument(doc) {
  const status = String(doc && doc.status || "").trim().toLowerCase();
  return !["corrected", "cancelled", "void"].includes(status);
}

function documentTouchesWarehouse(doc, warehouseId) {
  const target = String(warehouseId || "").trim();
  if (!target || !doc) return false;
  return [
    doc.warehouse_id,
    doc.from_warehouse_id,
    doc.to_warehouse_id
  ].some((value) => String(value || "").trim() === target);
}

async function createDocument(supabase, payload, currentUser) {
  const documentType = String(payload.documentType || "").trim();
  const allowed = ["OPENING", "ISSUE", "COMPLIMENTARY", "RECEIVE", "PURCHASE", "SALE", "RETURN", "TRANSFER", "ADJUSTMENT", "UNSETTLED_OPENING"];
  if (!allowed.includes(documentType)) throw new Error("Invalid document type");
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const itemGroup = String(payload.itemGroup || "BOOK").trim().toUpperCase();
  const adjustmentDirection = String(payload.adjustmentDirection || payload.adjustmentMode || "").trim().toUpperCase();
  if (!lines.length) throw new Error("At least one document line is required");
  const activityRow = documentTypeRequiresActivity(documentType) ? await resolveActivityRow(supabase, payload.activityId) : null;
  if (documentTypeRequiresActivity(documentType) && !activityRow) throw new Error("Activity is required for this document");
  if ((documentType === "OPENING" || documentType === "UNSETTLED_OPENING" || documentType === "PURCHASE") && !payload.toWarehouseId && !payload.fromWarehouseId) {
    throw new Error("Warehouse is required");
  }
  if (documentType === "TRANSFER" && (!payload.fromWarehouseId || !payload.toWarehouseId)) {
    throw new Error("Both warehouses are required for transfer");
  }
  if (documentType === "ADJUSTMENT" && !["IN", "OUT"].includes(adjustmentDirection)) {
    throw new Error("Adjustment direction is required");
  }
  const fromWarehouseId = await resolveWarehouseRef(supabase, payload.fromWarehouseId);
  const toWarehouseId = await resolveWarehouseRef(supabase, payload.toWarehouseId);
  if (documentType === "RETURN") {
    const { data: existingIssue } = await supabase.from("documents").select("id").eq("activity_id", activityRow ? activityRow.id : null).in("document_type", ["ISSUE", "UNSETTLED_OPENING"]).limit(1);
    if (!existingIssue || !existingIssue.length) throw new Error("Return can be posted only for an activity that already has issue or unsettled opening entries");
  }

  const docCode = await nextCode(supabase, "documents", "document_code", "DOC");
  const documentDate = toDateOnly(payload.documentDate || nowIso());
  const { data: doc, error: docError } = await supabase.from("documents").insert({
    document_code: docCode,
    document_type: documentType,
    document_date: documentDate,
    from_warehouse_id: fromWarehouseId,
    to_warehouse_id: toWarehouseId,
    activity_id: activityRow ? activityRow.id : null,
    created_by_user_id: currentUser && isUuidLike(currentUser.userId) ? currentUser.userId : null,
    status: payload.status || "Posted",
    notes: payload.notes || ""
  }).select("*").single();
  if (docError) throw docError;

  const warehouseId = toWarehouseId || fromWarehouseId || null;
  let lineNo = 0;
  for (const rawLine of lines) {
    lineNo += 1;
    let item = null;
    if (documentType === "PURCHASE") {
      item = await upsertItemIfMissing(supabase, { ...rawLine, itemGroup });
    } else {
      const erpCode = String(rawLine.bookId || rawLine.erpCode || "").trim();
      item = await findByCode(supabase, "items", "erp_code", erpCode);
      if (!item && documentType !== "PURCHASE") throw new Error(`Book not found: ${erpCode}`);
      if (item && documentType === "PURCHASE" && rawLine.bookName) {
        item = await upsertItemIfMissing(supabase, { ...rawLine, itemGroup });
      }
    }
    const itemRowId = String(item && (item.id || item.itemRowId) || "").trim();
    if (!itemRowId) {
      const lineLabel = String(rawLine.bookName || rawLine.name || rawLine.erpCode || rawLine.bookId || `line ${lineNo}`).trim();
      throw new Error(`Could not resolve item for ${lineLabel}`);
    }
    const qty = Number(rawLine.quantity || 0);
    const rate = Number(rawLine.rate || rawLine.purchasePrice || 0);
    const amount = qty * rate;
    const { data: line, error: lineError } = await supabase.from("document_lines").insert({
      document_id: doc.id,
      line_no: lineNo,
      item_id: itemRowId,
      quantity: qty,
      rate,
      amount,
      line_notes: rawLine.notes || ""
    }).select("*").single();
    if (lineError) throw lineError;

    const ledgerRows = [];
    if (documentType === "TRANSFER") {
      ledgerRows.push({
        document_id: doc.id,
        document_line_id: line.id,
        ledger_date: documentDate,
        warehouse_id: fromWarehouseId,
          activity_id: activityRow ? activityRow.id : null,
          item_id: itemRowId,
          movement_type: "TRANSFER_OUT",
          quantity_in: 0,
          quantity_out: qty,
        rate,
        amount
      });
        ledgerRows.push({
          document_id: doc.id,
          document_line_id: line.id,
          ledger_date: documentDate,
          warehouse_id: toWarehouseId,
          activity_id: activityRow ? activityRow.id : null,
          item_id: itemRowId,
          movement_type: "TRANSFER_IN",
          quantity_in: qty,
        quantity_out: 0,
        rate,
        amount
      });
    } else if (documentType === "UNSETTLED_OPENING") {
      ledgerRows.push({
        document_id: doc.id,
        document_line_id: line.id,
        ledger_date: documentDate,
        warehouse_id: warehouseId,
        activity_id: activityRow ? activityRow.id : null,
        item_id: itemRowId,
        movement_type: "UNSETTLED_OPENING",
        quantity_in: 0,
        quantity_out: 0,
        rate,
        amount: 0
      });
    } else if (documentType === "OPENING" || documentType === "RECEIVE" || documentType === "RETURN" || documentType === "PURCHASE" || (documentType === "ADJUSTMENT" && adjustmentDirection === "IN")) {
      ledgerRows.push({
        document_id: doc.id,
        document_line_id: line.id,
        ledger_date: documentDate,
        warehouse_id: warehouseId,
          activity_id: activityRow ? activityRow.id : null,
          item_id: itemRowId,
          movement_type: documentType,
          quantity_in: qty,
          quantity_out: 0,
        rate,
        amount
      });
    } else {
        ledgerRows.push({
          document_id: doc.id,
          document_line_id: line.id,
          ledger_date: documentDate,
          warehouse_id: warehouseId,
          activity_id: activityRow ? activityRow.id : null,
          item_id: itemRowId,
          movement_type: documentType,
          quantity_in: 0,
          quantity_out: qty,
        rate,
        amount
      });
    }
    const { error: ledgerError } = await supabase.from("stock_ledger").insert(ledgerRows);
    if (ledgerError) throw ledgerError;
  }

  if (documentType === "RETURN" && activityRow) {
    const returnProgress = String(payload.returnProgress || "").trim().toUpperCase();
    if (returnProgress === "RETURNS_COMPLETE") {
      const { error: activityError } = await supabase.from("activities").update({
        status: "Completed",
        settled_at: nowIso()
      }).eq("id", activityRow.id);
      if (activityError) throw activityError;
    } else {
      const { error: activityError } = await supabase.from("activities").update({
        status: "Running",
        settled_at: null
      }).eq("id", activityRow.id);
      if (activityError) throw activityError;
    }
  }

  if (activityRow && ["COMPLIMENTARY", "ADJUSTMENT"].includes(documentType)) {
    await syncActivitySettlementStatus(supabase, activityRow.id);
  }

  return { documentId: doc.document_code };
}

async function correctDocument(supabase, payload, currentUser) {
  const sourceDocumentId = String(payload.documentId || payload.sourceDocumentId || "").trim();
  if (!sourceDocumentId) throw new Error("Document ID is required");
  const { data: sourceDoc, error: lookupError } = await supabase
    .from("documents")
    .select("*")
    .or(`document_code.eq.${sourceDocumentId},id.eq.${sourceDocumentId}`)
    .maybeSingle();
  if (lookupError) throw lookupError;
  if (!sourceDoc) throw new Error("Document not found");
  const { data: sourceLines, error: linesError } = await supabase.from("document_lines").select("*").eq("document_id", sourceDoc.id);
  if (linesError) throw linesError;

  const correctionType = String(payload.documentType || sourceDoc.document_type || "").trim();
  const correctionPayload = {
    documentType: correctionType,
    documentDate: payload.documentDate || sourceDoc.document_date,
    fromWarehouseId: payload.fromWarehouseId !== undefined ? payload.fromWarehouseId : sourceDoc.from_warehouse_id,
    toWarehouseId: payload.toWarehouseId !== undefined ? payload.toWarehouseId : sourceDoc.to_warehouse_id,
    activityId: payload.activityId !== undefined ? payload.activityId : sourceDoc.activity_id,
    volunteerId: payload.volunteerId !== undefined ? payload.volunteerId : sourceDoc.created_by_user_id,
    status: payload.status || "Posted",
    notes: payload.notes || sourceDoc.notes || "",
    itemGroup: payload.itemGroup || "BOOK",
    adjustmentDirection: String(payload.adjustmentDirection || payload.adjustmentMode || "OUT").trim().toUpperCase(),
    lines: Array.isArray(payload.lines) && payload.lines.length ? payload.lines : (sourceLines || []).map((line) => ({
      bookId: line.item_id,
      quantity: Number(line.quantity || 0),
      rate: Number(line.rate || 0),
      notes: line.line_notes || ""
    }))
  };

  if (!correctionPayload.lines.length) {
    throw new Error("At least one document line is required");
  }

  const { error: cancelError } = await supabase.from("documents").update({
    status: "Corrected",
    notes: [sourceDoc.notes, payload.correctionNote || ""].filter(Boolean).join(" | "),
    updated_at: nowIso()
  }).eq("id", sourceDoc.id);
  if (cancelError) throw cancelError;

  const result = await createDocument(supabase, correctionPayload, currentUser);
  return {
    originalDocumentId: sourceDoc.document_code,
    correctedDocumentId: result.documentId
  };
}

async function importUnsettledOpeningDocuments(supabase, payload, currentUser) {
  const entries = Array.isArray(payload.entries) ? payload.entries : [];
  if (!entries.length) throw new Error("At least one activity entry is required");
  const created = [];
  for (const entry of entries) {
    const lines = Array.isArray(entry.lines) ? entry.lines : [];
    const cleanLines = lines.filter((line) => String(line.bookId || line.erpCode || "").trim() && Number(line.quantity || 0) > 0);
    if (!cleanLines.length) continue;
    const result = await createDocument(supabase, {
      documentType: "UNSETTLED_OPENING",
      documentDate: payload.documentDate,
      fromWarehouseId: payload.fromWarehouseId,
      activityId: entry.activityId,
      status: "Posted",
      notes: payload.notes || "",
      itemGroup: payload.itemGroup || "BOOK",
      lines: cleanLines
    }, currentUser);
    created.push(result);
  }
  if (!created.length) throw new Error("No unsettled opening lines found");
  return { created: created.length, documents: created };
}

async function halveWarehouseOpeningStock(supabase, payload) {
  const warehouseId = await resolveWarehouseRef(supabase, payload.warehouseId);
  if (!warehouseId) throw new Error("Warehouse is required");
  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, document_code")
    .eq("document_type", "OPENING")
    .eq("to_warehouse_id", warehouseId);
  if (docsError) throw docsError;
  if (!docs || !docs.length) throw new Error("No opening stock found for that warehouse");
  const docIds = docs.map((doc) => doc.id);
  const [linesResult, ledgerResult] = await Promise.all([
    supabase.from("document_lines").select("*").in("document_id", docIds),
    supabase.from("stock_ledger").select("*").in("document_id", docIds)
  ]);
  if (linesResult.error) throw linesResult.error;
  if (ledgerResult.error) throw ledgerResult.error;
  const lineUpdates = (linesResult.data || []).map(async (line) => {
    const oldQty = Number(line.quantity || 0);
    const newQty = oldQty / 2;
    const newAmount = Number(line.rate || 0) * newQty;
    const { error } = await supabase.from("document_lines").update({
      quantity: newQty,
      amount: newAmount
    }).eq("id", line.id);
    if (error) throw error;
  });
  const ledgerUpdates = (ledgerResult.data || []).map(async (row) => {
    const qtyIn = Number(row.quantity_in || 0);
    const qtyOut = Number(row.quantity_out || 0);
    const oldQty = qtyIn > 0 ? qtyIn : qtyOut;
    const newQty = oldQty / 2;
    const update = {
      quantity_in: qtyIn > 0 ? newQty : 0,
      quantity_out: qtyOut > 0 ? newQty : 0,
      amount: Number(row.rate || 0) * newQty
    };
    const { error } = await supabase.from("stock_ledger").update(update).eq("id", row.id);
    if (error) throw error;
  });
  await Promise.all([...lineUpdates, ...ledgerUpdates]);
  return {
    warehouseId,
    openingDocuments: docs.length,
    updatedLines: (linesResult.data || []).length,
    updatedLedgerRows: (ledgerResult.data || []).length
  };
}

async function stockCurrent(supabase) {
  const ledger = await selectAllRows((from, to) =>
    supabase
      .from("stock_ledger")
      .select("warehouse_id,item_id,quantity_in,quantity_out,movement_type")
      .range(from, to)
  );
  const index = new Map();
  for (const row of ledger || []) {
    const key = `${row.warehouse_id || ""}|${row.item_id || ""}`;
    const prev = index.get(key) || { warehouseId: row.warehouse_id || "", bookId: row.item_id || "", quantity: 0 };
    prev.quantity += Number(row.quantity_in || 0) - Number(row.quantity_out || 0);
    index.set(key, prev);
  }
  const [items, warehouses] = await Promise.all([
    listTable(supabase, "items", mapItem),
    listTable(supabase, "warehouses", mapWarehouse)
  ]);
  const itemsById = Object.fromEntries(
    items.flatMap((item) => {
      const pairs = [];
      if (item.itemRowId) pairs.push([String(item.itemRowId), item]);
      if (item.bookId) pairs.push([String(item.bookId), item]);
      if (item.erpCode) pairs.push([String(item.erpCode), item]);
      return pairs;
    })
  );
  const warehousesById = Object.fromEntries(
    warehouses.flatMap((warehouse) => {
      const pairs = [];
      if (warehouse.rowId) pairs.push([String(warehouse.rowId), warehouse]);
      if (warehouse.warehouseId) pairs.push([String(warehouse.warehouseId), warehouse]);
      return pairs;
    })
  );
  return Array.from(index.values()).map((row) => ({
    warehouseId: warehousesById[String(row.warehouseId || "")]?.warehouseId || row.warehouseId,
    bookId: itemsById[String(row.bookId || "")]?.erpCode || row.bookId,
    quantity: row.quantity
  }));
}

async function adminUpdateCurrentStock(supabase, payload, currentUser) {
  requireAdminUser(currentUser);
  const warehouseRow = await resolveWarehouseRow(supabase, payload.warehouseId || payload.warehouseCode || payload.warehouseName || "");
  if (!warehouseRow) throw new Error("Warehouse is required");
  const inputRows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!inputRows.length) throw new Error("At least one stock row is required");

  const currentRows = await stockCurrent(supabase);
  const currentMap = new Map(
    currentRows
      .filter((row) => String(row.warehouseId || "") === String(warehouseRow.warehouse_code || ""))
      .map((row) => [String(row.bookId || "").trim(), Number(row.quantity || 0)])
  );

  const desiredMap = new Map();
  const addDesired = (erpCode, quantityDelta) => {
    const code = String(erpCode || "").trim();
    if (!code) return;
    desiredMap.set(code, Number(desiredMap.get(code) || 0) + Number(quantityDelta || 0));
  };

  for (const row of inputRows) {
    const originalCode = String(row.originalBookId || row.originalErpCode || "").trim();
    const nextCode = String(row.bookId || row.erpCode || "").trim();
    const nextQty = Number(row.quantity || 0);
    if (!nextCode && !originalCode) continue;
    if (nextCode && nextQty < 0) throw new Error(`Quantity cannot be negative for ${nextCode}`);
    if (originalCode && !nextCode) {
      addDesired(originalCode, 0);
      continue;
    }
    addDesired(nextCode, nextQty);
    if (originalCode && originalCode !== nextCode && !desiredMap.has(originalCode)) {
      addDesired(originalCode, 0);
    }
  }

  const outLines = [];
  const inLines = [];
  for (const [erpCode, desiredQtyRaw] of desiredMap.entries()) {
    const desiredQty = Number(desiredQtyRaw || 0);
    const currentQty = Number(currentMap.get(erpCode) || 0);
    const delta = desiredQty - currentQty;
    if (!delta) continue;
    const item = await findByCode(supabase, "items", "erp_code", erpCode);
    if (!item) throw new Error(`Item not found: ${erpCode}`);
    const baseLine = {
      bookId: erpCode,
      quantity: Math.abs(delta),
      rate: Number(item.sale_price || 0),
      notes: "Admin current stock update"
    };
    if (delta > 0) {
      inLines.push(baseLine);
    } else {
      outLines.push(baseLine);
    }
  }

  const documentIds = [];
  const documentDate = toDateOnly(payload.documentDate || nowIso());
  const notes = String(payload.notes || "Admin current stock update").trim() || "Admin current stock update";
  if (outLines.length) {
    const outDoc = await createDocument(supabase, {
      documentType: "ADJUSTMENT",
      documentDate,
      toWarehouseId: warehouseRow.warehouse_code,
      adjustmentDirection: "OUT",
      notes,
      lines: outLines
    }, currentUser);
    documentIds.push(outDoc.documentId);
  }
  if (inLines.length) {
    const inDoc = await createDocument(supabase, {
      documentType: "ADJUSTMENT",
      documentDate,
      toWarehouseId: warehouseRow.warehouse_code,
      adjustmentDirection: "IN",
      notes,
      lines: inLines
    }, currentUser);
    documentIds.push(inDoc.documentId);
  }

  return {
    warehouseId: warehouseRow.warehouse_code,
    documentIds,
    updatedRows: inLines.length + outLines.length
  };
}

async function resetWarehouseToOpening(supabase, payload, currentUser) {
  requireAdminUser(currentUser);
  const warehouseRow = await resolveWarehouseRow(supabase, payload.warehouseId || payload.warehouseCode || payload.warehouseName || "");
  if (!warehouseRow) throw new Error("Warehouse is required");

  const currentRows = await stockCurrent(supabase);
  const currentMap = new Map(
    currentRows
      .filter((row) => String(row.warehouseId || "") === String(warehouseRow.warehouse_code || ""))
      .map((row) => [String(row.bookId || "").trim(), Number(row.quantity || 0)])
  );

  const overrideRows = Array.isArray(payload.overrideRows) ? payload.overrideRows : [];
  for (const row of overrideRows) {
    const code = String(row.bookId || row.erpCode || "").trim();
    if (!code) continue;
    currentMap.set(code, Number(row.quantity || 0));
  }

  const desiredLines = [];
  for (const [erpCode, quantity] of currentMap.entries()) {
    const qty = Number(quantity || 0);
    if (!(qty > 0)) continue;
    const item = await findByCode(supabase, "items", "erp_code", erpCode);
    if (!item) throw new Error(`Item not found: ${erpCode}`);
    desiredLines.push({
      bookId: erpCode,
      quantity: qty,
      rate: Number(item.sale_price || 0)
    });
  }
  if (!desiredLines.length) throw new Error("No current stock found for that warehouse");

  const { data: docs, error: docsError } = await supabase
    .from("documents")
    .select("id, document_code, document_date")
    .or(`from_warehouse_id.eq.${warehouseRow.id},to_warehouse_id.eq.${warehouseRow.id}`)
    .order("created_at", { ascending: false });
  if (docsError) throw docsError;

  const latestDocumentDate = String(
    payload.documentDate
    || (docs || []).find((row) => row.document_date)?.document_date
    || nowIso()
  ).slice(0, 10);

  const deletedDocumentIds = (docs || []).map((row) => row.document_code || row.id).filter(Boolean);
  const docRowIds = (docs || []).map((row) => row.id).filter(Boolean);

  if (docRowIds.length) {
    const { error: deleteDocsError } = await supabase.from("documents").delete().in("id", docRowIds);
    if (deleteDocsError) throw deleteDocsError;
  }

  const { error: deleteDayPaymentsError } = await supabase.from("sale_day_payments").delete().eq("warehouse_id", warehouseRow.id);
  if (deleteDayPaymentsError) throw deleteDayPaymentsError;

  const created = await createDocument(supabase, {
    documentType: "OPENING",
    documentDate: latestDocumentDate,
    toWarehouseId: warehouseRow.warehouse_code,
    notes: String(payload.notes || "Warehouse reset to opening snapshot").trim() || "Warehouse reset to opening snapshot",
    lines: desiredLines
  }, currentUser);

  return {
    warehouseId: warehouseRow.warehouse_code,
    warehouseName: warehouseRow.warehouse_name,
    deletedDocuments: deletedDocumentIds,
    recreatedOpeningDocumentId: created.documentId,
    openingLines: desiredLines.length
  };
}

async function onlineClassWarehouseBooks(supabase, payload) {
  const sourceWarehouseRow = await resolveWarehouseRow(supabase, payload.sourceWarehouseId || payload.warehouseId || payload.warehouseCode || payload.warehouseName || "");
  const [itemsResult, stockRows] = await Promise.all([
    supabase.from("items").select("*").eq("item_group", "BOOK").eq("active", true),
    stockCurrent(supabase)
  ]);
  if (itemsResult.error) throw itemsResult.error;
  const stockByBook = new Map();
  for (const row of stockRows || []) {
    if (sourceWarehouseRow && String(row.warehouseId || "") !== String(sourceWarehouseRow.warehouse_code || "")) continue;
    stockByBook.set(String(row.bookId || ""), Number(row.quantity || 0));
  }
  return (itemsResult.data || [])
    .map((row) => ({
      registrationWarehouseId: sourceWarehouseRow ? sourceWarehouseRow.id : "",
      registrationWarehouseCode: sourceWarehouseRow?.warehouse_code || "",
      registrationWarehouseName: sourceWarehouseRow?.warehouse_name || "",
      bookId: row.erp_code,
      erpCode: row.erp_code,
      name: row.item_name,
      bookName: row.item_name,
      bookType: row.item_type,
      itemGroup: row.item_group,
      salePrice: Number(row.sale_price || 0),
      purchasePrice: Number(row.purchase_price || 0),
      active: row.active,
      availableQty: Number(stockByBook.get(String(row.erp_code || "")) || 0)
    }))
    .filter((row) => row.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")) || String(a.erpCode || "").localeCompare(String(b.erpCode || "")));
}

async function catalogRequestItems(supabase, payload) {
  const itemGroup = String(payload.itemGroup || "BOOK").trim().toUpperCase();
  const sourceWarehouseRow = await resolveWarehouseRow(supabase, payload.sourceWarehouseId || payload.warehouseId || payload.warehouseCode || payload.warehouseName || "");
  if (!sourceWarehouseRow) throw new Error("Warehouse is required");
  const itemsQuery = supabase.from("items").select("*").eq("active", true);
  const normalizedGroup = itemGroup === "PARAPHERNALIA" ? ["PARAPHERNALIA", "OTHER"] : [itemGroup];
  const [itemsResult, stockRows] = await Promise.all([
    itemsQuery.in("item_group", normalizedGroup),
    stockCurrent(supabase)
  ]);
  if (itemsResult.error) throw itemsResult.error;
  const stockByBook = new Map();
  for (const row of stockRows || []) {
    if (String(row.warehouseId || "") !== String(sourceWarehouseRow.warehouse_code || "")) continue;
    stockByBook.set(String(row.bookId || ""), Number(row.quantity || 0));
  }
  return (itemsResult.data || [])
    .map((row) => ({
      warehouseId: sourceWarehouseRow.id,
      warehouseCode: sourceWarehouseRow.warehouse_code || "",
      warehouseName: sourceWarehouseRow.warehouse_name || "",
      itemGroup,
      bookId: row.erp_code,
      erpCode: row.erp_code,
      name: row.item_name,
      bookName: row.item_name,
      bookType: row.item_type,
      category: row.item_type,
      salePrice: Number(row.sale_price || 0),
      purchasePrice: Number(row.purchase_price || 0),
      imageUrl: resolveItemImageUrl(row, itemGroup),
      active: row.active,
      availableQty: Number(stockByBook.get(String(row.erp_code || "")) || 0)
    }))
    .filter((row) => row.active !== false)
    .sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")) || String(a.erpCode || "").localeCompare(String(b.erpCode || "")));
}

async function catalogProfileLookup(supabase, payload) {
  const requesterMobile = normalizeMobile(payload.requesterMobile || payload.mobile || "");
  if (requesterMobile.length !== 10) throw new Error("Mobile number is required");
  const { data, error } = await supabase
    .from("catalog_requests")
    .select("requester_name, requester_mobile, requester_segment, folk_guide_name, preacher_name, requester_location, created_at")
    .eq("requester_mobile", requesterMobile)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return buildCatalogProfileFromRequestRows(data || []);
}

async function createCatalogRequest(supabase, payload, currentUser) {
  const sourceWarehouseRow = await resolveWarehouseRow(supabase, payload.sourceWarehouseId || payload.warehouseId || payload.warehouseCode || payload.warehouseName || "");
  if (!sourceWarehouseRow) throw new Error("Warehouse is required");
  const requesterName = String(payload.requesterName || payload.name || "").trim();
  const requesterMobile = normalizeMobile(payload.requesterMobile || payload.mobile || "");
  if (!requesterName) throw new Error("Name is required");
  if (requesterMobile.length !== 10) throw new Error("Mobile number is required");
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const cleanLines = lines
    .map((line) => ({
      erpCode: String(line.erpCode || line.bookId || "").trim(),
      itemName: String(line.itemName || line.name || "").trim(),
      itemGroup: String(line.itemGroup || payload.itemGroup || "BOOK").trim().toUpperCase(),
      imageUrl: String(line.imageUrl || line.image_url || "").trim(),
      salePrice: Number(line.salePrice || 0),
      availableQty: Number(line.availableQty || 0),
      quantity: Number(line.quantity || 0)
    }))
    .filter((line) => line.erpCode && line.itemName && line.quantity > 0);
  if (!cleanLines.length) throw new Error("Add at least one item");
  const itemGroup = deriveRequestItemGroup(cleanLines, payload.itemGroup || "BOOK");
  if (!["BOOK", "PARAPHERNALIA", "MIXED"].includes(itemGroup)) throw new Error("Item category is required");
  const requesterSegment = normalizeRequesterSegment(payload.requesterSegment || payload.segment || payload.category || "");
  const folkGuideName = String(payload.folkGuideName || "").trim();
  const preacherName = String(payload.preacherName || "").trim();
  const requesterLocation = String(payload.requesterLocation || payload.location || "").trim();
  if (!requesterSegment) throw new Error("Category is required");
  if (!requesterLocation) throw new Error("Location is required");
  if (requesterSegment === "FOLK" && !folkGuideName) throw new Error("Folk guide name is required");
  if (requesterSegment === "CONGREGATION" && !preacherName) throw new Error("Preacher name is required");

  const requestCode = await nextCode(supabase, "catalog_requests", "request_code", "REQ");
  const { data: request, error: requestError } = await supabase.from("catalog_requests").insert({
    request_code: requestCode,
    source_warehouse_id: sourceWarehouseRow.id,
    source_warehouse_code: sourceWarehouseRow.warehouse_code || "",
    source_warehouse_name: sourceWarehouseRow.warehouse_name || "",
    item_group: itemGroup,
    requester_name: requesterName,
    requester_mobile: requesterMobile,
    requester_segment: requesterSegment,
    folk_guide_name: folkGuideName,
    preacher_name: preacherName,
    requester_location: requesterLocation,
    notes: String(payload.notes || "").trim(),
    status: "New",
    created_by_user_id: currentUser && isUuidLike(currentUser.userId) ? currentUser.userId : null
  }).select("*").single();
  if (requestError) throw requestError;

  const linePayload = cleanLines.map((line, index) => ({
    request_id: request.id,
    line_no: index + 1,
    item_erp_code: line.erpCode,
    item_name: line.itemName,
    item_group: line.itemGroup,
    image_url: line.imageUrl || "",
    sale_price: Number(line.salePrice || 0),
    available_qty: Number(line.availableQty || 0),
    requested_qty: Number(line.quantity || 0),
    line_total: Number(line.quantity || 0) * Number(line.salePrice || 0)
  }));
  const { error: lineError } = await supabase.from("catalog_request_lines").insert(linePayload);
  if (lineError) throw lineError;
  return {
    requestId: request.id,
    requestCode: request.request_code,
    sourceWarehouseName: request.source_warehouse_name,
    itemGroup: request.item_group,
    requesterName: request.requester_name,
    requesterMobile: request.requester_mobile,
    requesterSegment: request.requester_segment,
    folkGuideName: request.folk_guide_name,
    preacherName: request.preacher_name,
    requesterLocation: request.requester_location,
    acceptedActivityId: request.accepted_activity_id || "",
    acceptedActivityCode: request.accepted_activity_code || "",
    acceptedDocumentId: request.accepted_document_id || "",
    acceptedDocumentCode: request.accepted_document_code || "",
    acceptedAt: request.accepted_at || "",
    createdAt: request.created_at
  };
}

async function catalogRequestsList(supabase) {
  const [{ data: requests, error: requestError }, { data: lines, error: lineError }] = await Promise.all([
    supabase.from("catalog_requests").select("*").order("created_at", { ascending: false }),
    supabase.from("catalog_request_lines").select("*").order("request_id", { ascending: true }).order("line_no", { ascending: true })
  ]);
  if (requestError) throw requestError;
  if (lineError) throw lineError;
  const linesByRequest = new Map();
  for (const line of lines || []) {
    const requestId = line.request_id;
    if (!linesByRequest.has(requestId)) linesByRequest.set(requestId, []);
    linesByRequest.get(requestId).push({
      lineId: line.id,
      lineNo: line.line_no,
      erpCode: line.item_erp_code || "",
      itemName: line.item_name || "",
      itemGroup: line.item_group || "BOOK",
      imageUrl: line.image_url || "",
      salePrice: Number(line.sale_price || 0),
      availableQty: Number(line.available_qty || 0),
      requestedQty: Number(line.requested_qty || 0),
      lineTotal: Number(line.line_total || 0)
    });
  }
  return (requests || []).map((row) => {
    const requestLines = linesByRequest.get(row.id) || [];
    const totalQty = requestLines.reduce((sum, line) => sum + Number(line.requestedQty || 0), 0);
    const totalAmount = requestLines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
    return {
      requestId: row.id,
      requestCode: row.request_code,
      sourceWarehouseId: row.source_warehouse_id || "",
      sourceWarehouseCode: row.source_warehouse_code || "",
      sourceWarehouseName: row.source_warehouse_name || "",
      itemGroup: row.item_group || "BOOK",
      requesterName: row.requester_name || "",
      requesterMobile: row.requester_mobile || "",
      requesterSegment: row.requester_segment || "",
      folkGuideName: row.folk_guide_name || "",
      preacherName: row.preacher_name || "",
      requesterLocation: row.requester_location || "",
      acceptedActivityId: row.accepted_activity_id || "",
      acceptedActivityCode: row.accepted_activity_code || "",
      acceptedDocumentId: row.accepted_document_id || "",
      acceptedDocumentCode: row.accepted_document_code || "",
      acceptedAt: row.accepted_at || "",
      notes: row.notes || "",
      status: row.status || "New",
      totalQty,
      totalAmount,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lines: requestLines
    };
  });
}

async function catalogRequestsByMobile(supabase, payload) {
  const requesterMobile = normalizeMobile(payload.requesterMobile || payload.mobile || "");
  if (requesterMobile.length !== 10) throw new Error("Mobile number is required");
  const [{ data: requests, error: requestError }, { data: lines, error: lineError }] = await Promise.all([
    supabase.from("catalog_requests").select("*").eq("requester_mobile", requesterMobile).order("created_at", { ascending: false }),
    supabase.from("catalog_request_lines").select("*").order("request_id", { ascending: true }).order("line_no", { ascending: true })
  ]);
  if (requestError) throw requestError;
  if (lineError) throw lineError;
  const linesByRequest = new Map();
  for (const line of lines || []) {
    const requestId = line.request_id;
    if (!linesByRequest.has(requestId)) linesByRequest.set(requestId, []);
    linesByRequest.get(requestId).push({
      lineId: line.id,
      lineNo: line.line_no,
      erpCode: line.item_erp_code || "",
      itemName: line.item_name || "",
      itemGroup: line.item_group || "BOOK",
      imageUrl: line.image_url || "",
      salePrice: Number(line.sale_price || 0),
      availableQty: Number(line.available_qty || 0),
      requestedQty: Number(line.requested_qty || 0),
      lineTotal: Number(line.line_total || 0)
    });
  }
  return (requests || []).map((row) => {
    const requestLines = linesByRequest.get(row.id) || [];
    const totalQty = requestLines.reduce((sum, line) => sum + Number(line.requestedQty || 0), 0);
    const totalAmount = requestLines.reduce((sum, line) => sum + Number(line.lineTotal || 0), 0);
    return {
      requestId: row.id,
      requestCode: row.request_code,
      sourceWarehouseId: row.source_warehouse_id || "",
      sourceWarehouseCode: row.source_warehouse_code || "",
      sourceWarehouseName: row.source_warehouse_name || "",
      itemGroup: row.item_group || "BOOK",
      requesterName: row.requester_name || "",
      requesterMobile: row.requester_mobile || "",
      requesterSegment: row.requester_segment || "",
      folkGuideName: row.folk_guide_name || "",
      preacherName: row.preacher_name || "",
      requesterLocation: row.requester_location || "",
      acceptedActivityId: row.accepted_activity_id || "",
      acceptedActivityCode: row.accepted_activity_code || "",
      acceptedDocumentId: row.accepted_document_id || "",
      acceptedDocumentCode: row.accepted_document_code || "",
      acceptedAt: row.accepted_at || "",
      notes: row.notes || "",
      status: row.status || "New",
      totalQty,
      totalAmount,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lines: requestLines
    };
  });
}

async function approveCatalogRequest(supabase, payload, currentUser) {
  const requestRef = String(payload.requestId || payload.requestCode || "").trim();
  if (!requestRef) throw new Error("Request is required");
  const { data: requestRow, error: requestError } = await supabase
    .from("catalog_requests")
    .select("*")
    .or(`id.eq.${requestRef},request_code.eq.${requestRef}`)
    .maybeSingle();
  if (requestError) throw requestError;
  if (!requestRow) throw new Error("Request not found");
  if (!canAcceptCatalogRequest(requestRow)) {
    throw new Error("This request is already processed");
  }

  const linesResult = await supabase
    .from("catalog_request_lines")
    .select("*")
    .eq("request_id", requestRow.id)
    .order("line_no", { ascending: true });
  if (linesResult.error) throw linesResult.error;
  const requestLines = Array.isArray(linesResult.data) ? linesResult.data : [];
  if (!requestLines.length) throw new Error("This request has no item lines");

  const activityPayload = {
    name: String(payload.activityName || payload.name || "").trim(),
    type: String(payload.activityType || payload.type || "Stall").trim(),
    devoteeId: String(payload.devoteeId || "").trim(),
    warehouseId: String(payload.warehouseId || requestRow.source_warehouse_code || "").trim(),
    spoc: String(payload.spoc || requestRow.requester_name || "").trim(),
    startDate: payload.startDate || null,
    endDate: payload.endDate || null,
    status: String(payload.activityStatus || payload.status || "Running").trim() || "Running"
  };
  if (!activityPayload.name || !activityPayload.type || !activityPayload.devoteeId || !activityPayload.warehouseId) {
    throw new Error("Activity name, type, devotee, and warehouse are required");
  }

  const createdActivity = await createActivity(supabase, activityPayload);
  const createdActivityCode = String(createdActivity.activity_code || "").trim();
  const issuePayload = {
    documentType: "ISSUE",
    documentDate: payload.issueDate || toDateOnly(nowIso()),
    fromWarehouseId: activityPayload.warehouseId,
    activityId: createdActivityCode,
    status: "Posted",
    notes: String(payload.issueNotes || requestRow.notes || "").trim(),
    itemGroup: requestRow.item_group || deriveRequestItemGroup(requestLines, "BOOK"),
    lines: requestLines.map((line) => ({
      bookId: line.item_erp_code,
      erpCode: line.item_erp_code,
      quantity: Number(line.requested_qty || 0),
      rate: Number(line.sale_price || 0),
      notes: `Approved from request ${requestRow.request_code || ""}`.trim()
    }))
  };
  const createdIssue = await createDocument(supabase, issuePayload, currentUser);

  const { error: updateRequestError } = await supabase.from("catalog_requests").update({
    status: "Accepted",
    accepted_activity_id: createdActivity.id,
    accepted_activity_code: createdActivity.activity_code || "",
    accepted_document_id: createdIssue.documentRowId || null,
    accepted_document_code: createdIssue.documentId || "",
    accepted_at: nowIso(),
    accepted_by_user_id: currentUser && isUuidLike(currentUser.userId) ? currentUser.userId : null,
    updated_at: nowIso()
  }).eq("id", requestRow.id);
  if (updateRequestError) throw updateRequestError;

  return {
    requestId: requestRow.id,
    requestCode: requestRow.request_code,
    status: "Accepted",
    activityId: createdActivity.activity_code || "",
    activityName: createdActivity.activity_name || "",
    documentId: createdIssue.documentId || "",
    acceptedAt: nowIso()
  };
}

async function getSaleEntriesContext(supabase) {
  const [
    documents,
    lines,
    items,
    warehouses,
    users,
    payments,
    dayPaymentsRows
  ] = await Promise.all([
    selectAllRows((from, to) =>
      supabase
        .from("documents")
        .select("*")
        .eq("document_type", "SALE")
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    selectAllRows((from, to) =>
      supabase
        .from("document_lines")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    listTable(supabase, "items", mapItem),
    listTable(supabase, "warehouses", mapWarehouse),
    listTable(supabase, "users", mapUser),
    selectAllRows((from, to) =>
      supabase
        .from("sale_entry_payments")
        .select("*")
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to)
    ),
    selectAllRows((from, to) =>
      supabase
        .from("sale_day_payments")
        .select("*")
        .order("sale_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to)
    ).catch((error) => {
      const message = String(error?.message || "").toLowerCase();
      if (!message.includes("sale_day_payments") && !message.includes("schema cache") && !message.includes("does not exist")) {
        throw error;
      }
      return [];
    })
  ]);
  if (Array.isArray(dayPaymentsRows) === false) {
    const message = String(dayPaymentsRows?.error?.message || "").toLowerCase();
    if (!message.includes("sale_day_payments") && !message.includes("schema cache") && !message.includes("does not exist")) {
      throw dayPaymentsRows.error;
    }
  }
  return {
    documents: documents || [],
    lines: lines || [],
    items: items || [],
    warehouses: warehouses || [],
    users: users || [],
    payments: payments || [],
    dayPayments: Array.isArray(dayPaymentsRows) ? dayPaymentsRows : []
  };
}

function buildSaleEntrySummary(doc, context) {
  const itemById = Object.fromEntries((context.items || []).map((row) => [String(row.itemRowId || ""), row]));
  const warehouseById = Object.fromEntries((context.warehouses || []).map((row) => [String(row.rowId || ""), row]));
  const userById = Object.fromEntries((context.users || []).map((row) => [String(row.userId || ""), row]));
  const docLines = (context.lines || []).filter((line) => line.document_id === doc.id).sort((a, b) => Number(a.line_no || 0) - Number(b.line_no || 0));
  const paymentRows = (context.payments || []).filter((row) => row.document_id === doc.id);
  const collectionRows = paymentRows.filter((row) => classifySaleEntryPaymentKind(row) === "SALE_COLLECTION");
  const settlementRows = paymentRows.filter((row) => classifySaleEntryPaymentKind(row) === "BACKEND_SETTLEMENT");
  const lines = docLines.map((line, index) => {
    const item = itemById[line.item_id] || {};
    return {
      lineId: line.id,
      lineNo: Number(line.line_no || index + 1),
      erpCode: item.erpCode || "",
      itemName: item.name || "",
      itemGroup: String(item.erpCode || "").startsWith("PRB-") ? "BOOK" : "DEVOTIONAL",
      itemType: item.bookType || "",
      quantity: Number(line.quantity || 0),
      rate: Number(line.rate || 0),
      amount: Number(line.amount || 0)
    };
  });
  const totalQty = lines.reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  const totalAmount = lines.reduce((sum, line) => sum + Number(line.amount || 0), 0);
  const collectedCashAmount = collectionRows.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0);
  const collectedOnlineAmount = collectionRows.reduce((sum, row) => sum + Number(row.online_amount || 0), 0);
  const collectedTotalAmount = collectedCashAmount + collectedOnlineAmount;
  const entrySettledCashAmount = settlementRows.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0);
  const entrySettledOnlineAmount = settlementRows.reduce((sum, row) => sum + Number(row.online_amount || 0), 0);
  const entrySettledTotalAmount = entrySettledCashAmount + entrySettledOnlineAmount;
  const pendingCashAmount = Math.max(collectedCashAmount - entrySettledCashAmount, 0);
  const pendingOnlineAmount = Math.max(collectedOnlineAmount - entrySettledOnlineAmount, 0);
  const pendingAmount = pendingCashAmount + pendingOnlineAmount;
  return {
    documentRowId: doc.id,
    documentId: doc.document_code,
    documentType: doc.document_type,
    documentDate: doc.document_date,
    status: doc.status || "Posted",
    notes: doc.notes || "",
    warehouseId: doc.from_warehouse_id || doc.to_warehouse_id || "",
    warehouseCode: warehouseById[doc.from_warehouse_id || doc.to_warehouse_id || ""]?.warehouseId || "",
    warehouseName: warehouseById[doc.from_warehouse_id || doc.to_warehouse_id || ""]?.name || "",
    createdByUserId: doc.created_by_user_id || "",
    createdByName: userById[doc.created_by_user_id || ""]?.name || "",
    createdByUsername: userById[doc.created_by_user_id || ""]?.username || "",
    createdAt: doc.created_at,
    updatedAt: doc.updated_at,
    totalQty,
    totalAmount,
    collectedCashAmount,
    collectedOnlineAmount,
    collectedTotalAmount,
    entrySettledCashAmount,
    entrySettledOnlineAmount,
    entrySettledTotalAmount,
    paidCashAmount: collectedCashAmount,
    paidOnlineAmount: collectedOnlineAmount,
    paidTotalAmount: collectedTotalAmount,
    pendingCashAmount,
    pendingOnlineAmount,
    pendingAmount,
    lines,
    payments: settlementRows.map((row) => ({
      paymentId: row.id,
      paymentDate: row.payment_date,
      cashAmount: Number(row.cash_amount || 0),
      onlineAmount: Number(row.online_amount || 0),
      totalAmount: Number(row.cash_amount || 0) + Number(row.online_amount || 0),
      notes: cleanSalePaymentNote(row.notes || ""),
      createdAt: row.created_at
    })),
    collections: collectionRows.map((row) => ({
      paymentId: row.id,
      paymentDate: row.payment_date,
      cashAmount: Number(row.cash_amount || 0),
      onlineAmount: Number(row.online_amount || 0),
      totalAmount: Number(row.cash_amount || 0) + Number(row.online_amount || 0),
      notes: cleanSalePaymentNote(row.notes || ""),
      createdAt: row.created_at
    }))
  };
}

function buildSaleDayPaymentSummary(row, context) {
  const warehouseById = Object.fromEntries((context.warehouses || []).map((item) => [String(item.rowId || ""), item]));
  const userById = Object.fromEntries((context.users || []).map((item) => [String(item.userId || ""), item]));
  const warehouse = warehouseById[row.warehouse_id] || {};
  const user = userById[row.created_by_user_id] || {};
  return {
    dayPaymentId: row.id,
    warehouseId: row.warehouse_id || "",
    warehouseCode: warehouse.warehouseId || "",
    warehouseName: warehouse.name || "",
    saleDate: row.sale_date || "",
    cashAmount: Number(row.cash_amount || 0),
    onlineAmount: Number(row.online_amount || 0),
    totalAmount: Number(row.cash_amount || 0) + Number(row.online_amount || 0),
    notes: cleanSalePaymentNote(row.notes || ""),
    createdByUserId: row.created_by_user_id || "",
    createdByName: user.name || "",
    createdByUsername: user.username || "",
    createdAt: row.created_at || ""
  };
}

function classifySaleEntryPaymentKind(row) {
  const notes = String(row?.notes || "").trim();
  if (/^\[SALE_COLLECTION\]/i.test(notes) || /payment captured at sale entry/i.test(notes)) {
    return "SALE_COLLECTION";
  }
  return "BACKEND_SETTLEMENT";
}

function cleanSalePaymentNote(notes) {
  return String(notes || "")
    .replace(/^\[SALE_COLLECTION\]\s*/i, "")
    .replace(/^\[BACKEND_SETTLEMENT\]\s*/i, "")
    .replace(/^\[BACKEND_DAY_SETTLEMENT\]\s*/i, "")
    .trim();
}

async function saleEntriesList(supabase, payload, currentUser) {
  const context = await getSaleEntriesContext(supabase);
  const boundWarehouseFilter = getBoundWarehouseFilter(currentUser);
  const warehouseFilter = boundWarehouseFilter || String(payload.warehouseId || payload.warehouseCode || payload.warehouseName || "").trim();
  const onlyMine = Boolean(payload.onlyMine);
  let rows = (context.documents || []).map((doc) => buildSaleEntrySummary(doc, context));
  if (warehouseFilter) {
    rows = rows.filter((row) => [row.warehouseId, row.warehouseCode, row.warehouseName].some((value) => String(value || "").trim() === warehouseFilter));
  }
  if (onlyMine && currentUser && currentUser.userId) {
    rows = rows.filter((row) => String(row.createdByUserId || "") === String(currentUser.userId || ""));
  }
  const sortedRows = rows.sort((a, b) => String(b.createdAt || b.documentDate || "").localeCompare(String(a.createdAt || a.documentDate || "")) || String(b.documentId || "").localeCompare(String(a.documentId || "")));
  let dayPayments = (context.dayPayments || []).map((row) => buildSaleDayPaymentSummary(row, context));
  if (warehouseFilter) {
    dayPayments = dayPayments.filter((row) => [row.warehouseId, row.warehouseCode, row.warehouseName].some((value) => String(value || "").trim() === warehouseFilter));
  }
  if (onlyMine && currentUser && currentUser.userId) {
    dayPayments = dayPayments.filter((row) => String(row.createdByUserId || "") === String(currentUser.userId || ""));
  }
  dayPayments = dayPayments.sort((a, b) => String(b.saleDate || "").localeCompare(String(a.saleDate || "")) || String(b.createdAt || "").localeCompare(String(a.createdAt || "")));
  return {
    rows: sortedRows,
    dayPayments
  };
}

async function saleEntryDetail(supabase, payload) {
  const documentRef = String(payload.documentId || payload.documentCode || "").trim();
  if (!documentRef) throw new Error("Sale entry is required");
  const documentLookup = isUuidLike(documentRef)
    ? (from, to) => supabase
      .from("documents")
      .select("*")
      .eq("document_type", "SALE")
      .eq("id", documentRef)
      .range(from, to)
    : (from, to) => supabase
      .from("documents")
      .select("*")
      .eq("document_type", "SALE")
      .eq("document_code", documentRef)
      .range(from, to);
  const [documents, lines, items, warehouses, users, payments] = await Promise.all([
    selectAllRows(documentLookup),
    selectAllRows((from, to) =>
      supabase
        .from("document_lines")
        .select("*")
        .order("created_at", { ascending: false })
        .range(from, to)
    ),
    listTable(supabase, "items", mapItem),
    listTable(supabase, "warehouses", mapWarehouse),
    listTable(supabase, "users", mapUser),
    selectAllRows((from, to) =>
      supabase
        .from("sale_entry_payments")
        .select("*")
        .order("payment_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, to)
    )
  ]);
  const context = { documents, lines, items, warehouses, users, payments, dayPayments: [] };
  const doc = (documents || []).find((row) => row.id === documentRef || row.document_code === documentRef);
  if (!doc) throw new Error("Sale entry not found");
  return buildSaleEntrySummary(doc, context);
}

async function createSaleEntryPayment(supabase, payload, currentUser) {
  const documentRef = String(payload.documentId || payload.documentCode || "").trim();
  if (!documentRef) throw new Error("Sale entry is required");
  const cashAmount = Number(payload.cashAmount || 0);
  const onlineAmount = Number(payload.onlineAmount || 0);
  if (cashAmount <= 0 && onlineAmount <= 0) throw new Error("Enter cash or online amount");
  const documentQuery = supabase
    .from("documents")
    .select("id, document_type");
  const { data: documentRow, error: documentError } = await (isUuidLike(documentRef)
    ? documentQuery.eq("id", documentRef).maybeSingle()
    : documentQuery.eq("document_code", documentRef).maybeSingle());
  if (documentError) throw documentError;
  if (!documentRow || String(documentRow.document_type || "").toUpperCase() !== "SALE") {
    throw new Error("Sale entry not found");
  }
  const paymentDate = toDateOnly(payload.paymentDate || nowIso());
  const { error } = await supabase.from("sale_entry_payments").insert({
    document_id: documentRow.id,
    payment_date: paymentDate,
    cash_amount: cashAmount,
    online_amount: onlineAmount,
    notes: `[BACKEND_SETTLEMENT] ${String(payload.notes || "").trim()}`.trim(),
    created_by_user_id: currentUser && isUuidLike(currentUser.userId) ? currentUser.userId : null
  });
  if (error) throw error;
  return saleEntryDetail(supabase, { documentId: documentRow.id });
}

async function createSaleDayPayment(supabase, payload, currentUser) {
  const warehouseRef = String(payload.warehouseId || payload.warehouseCode || payload.warehouseName || "").trim();
  if (!warehouseRef) throw new Error("Warehouse is required");
  const saleDate = toDateOnly(payload.saleDate || payload.paymentDate || nowIso());
  const cashAmount = Number(payload.cashAmount || 0);
  const onlineAmount = Number(payload.onlineAmount || 0);
  if (cashAmount <= 0 && onlineAmount <= 0) throw new Error("Enter cash or online amount");
  const warehouseRow = await resolveWarehouseRow(supabase, warehouseRef);
  if (!warehouseRow) throw new Error("Warehouse not found");
  const { error } = await supabase.from("sale_day_payments").insert({
    warehouse_id: warehouseRow.id,
    sale_date: saleDate,
    cash_amount: cashAmount,
    online_amount: onlineAmount,
    notes: `[BACKEND_DAY_SETTLEMENT] ${String(payload.notes || "").trim()}`.trim(),
    created_by_user_id: currentUser && isUuidLike(currentUser.userId) ? currentUser.userId : null
  });
  if (error) throw error;
  return saleEntriesList(supabase, { warehouseId: warehouseRow.id }, currentUser);
}

async function submitWarehouseSale(supabase, payload, currentUser) {
  if (!currentUser || !currentUser.userId) throw new Error("Login is required");
  const boundWarehouseFilter = getBoundWarehouseFilter(currentUser);
  const warehouseRow = await resolveWarehouseRow(
    supabase,
    boundWarehouseFilter || payload.warehouseId || payload.warehouseCode || payload.warehouseName || ""
  );
  if (!warehouseRow) throw new Error("Warehouse is required");
  const rawLines = Array.isArray(payload.lines) ? payload.lines : [];
  const lines = rawLines
    .map((line) => ({
      bookId: String(line.bookId || line.erpCode || "").trim(),
      quantity: Number(line.quantity || 0),
      rate: Number(line.rate !== undefined ? line.rate : line.salePrice || 0)
    }))
    .filter((line) => line.bookId && line.quantity > 0);
  if (!lines.length) throw new Error("Add at least one item");
  const paymentMethod = String(payload.paymentMethod || "").trim().toUpperCase();
  const cashAmount = Number(payload.cashAmount || 0);
  const onlineAmount = Number(payload.onlineAmount || 0);
  if (!paymentMethod || !["CASH", "ONLINE", "MIXED"].includes(paymentMethod)) {
    throw new Error("Select a payment method");
  }
  if (cashAmount < 0 || onlineAmount < 0) {
    throw new Error("Payment amounts cannot be negative");
  }
  const expectedTotalAmount = lines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.rate || 0), 0);
  const paidTotalAmount = cashAmount + onlineAmount;
  if (Math.abs(expectedTotalAmount - paidTotalAmount) > 0.01) {
    throw new Error("Payment total must match the sale amount");
  }
  const created = await createDocument(supabase, {
    documentType: "SALE",
    documentDate: payload.documentDate || nowIso(),
    fromWarehouseId: warehouseRow.id,
    status: "Posted",
    notes: String(payload.notes || "").trim(),
    lines
  }, currentUser);
  const detail = await saleEntryDetail(supabase, { documentId: created.documentId });
  if (cashAmount > 0 || onlineAmount > 0) {
    const paymentDate = toDateOnly(payload.paymentDate || payload.documentDate || nowIso());
    const paymentNotes = String(
      payload.paymentNotes
      || payload.paymentMethodLabel
      || `Payment captured at sale entry (${paymentMethod})`
    ).trim();
    const { error: paymentError } = await supabase.from("sale_entry_payments").insert({
      document_id: detail.documentRowId,
      payment_date: paymentDate,
      cash_amount: cashAmount,
      online_amount: onlineAmount,
      notes: `[SALE_COLLECTION] ${paymentNotes}`.trim()
    });
    if (paymentError) throw paymentError;
  }
  return saleEntryDetail(supabase, { documentId: created.documentId });
}

async function getActivityUnsettled(supabase) {
  const { data: documents } = await supabase.from("documents").select("*");
  const { data: lines } = await supabase.from("document_lines").select("*");
  const { data: activities } = await supabase.from("activities").select("*");
  const { data: items } = await supabase.from("items").select("*");
  const { data: devotees } = await supabase.from("devotees").select("*");
  const activityById = Object.fromEntries((activities || []).map((row) => [row.id, row]));
  const itemById = Object.fromEntries((items || []).map((row) => [row.id, row]));
  const devoteeById = Object.fromEntries((devotees || []).map((row) => [row.id, row]));
  const devoteeByCode = Object.fromEntries((devotees || []).map((row) => [row.devotee_code, row]));
  const docsById = Object.fromEntries((documents || []).map((row) => [row.id, row]));
  const index = new Map();
  for (const line of lines || []) {
    const doc = docsById[line.document_id];
    if (!doc || !doc.activity_id) continue;
    const activity = activityById[doc.activity_id] || {};
    if (String(activity.status || "").toLowerCase() === "completed" || activity.settled_at) {
      continue;
    }
    const type = doc.document_type;
    if (!["ISSUE", "RETURN", "SALE", "COMPLIMENTARY", "UNSETTLED_OPENING"].includes(type)) continue;
    const item = itemById[line.item_id] || {};
    const devotee = devoteeById[activity.devotee_id] || devoteeByCode[activity.devotee_id] || {};
    const key = `${doc.activity_id}|${line.item_id}`;
    const existing = index.get(key) || {
      devoteeId: devotee.devotee_code || activity.devotee_id || "",
      devoteeName: devotee.devotee_name || "",
      activityId: doc.activity_id,
      activityName: activity.activity_name || doc.activity_id,
      bookId: item.erp_code || line.item_id,
      itemGroup: item.item_group || "BOOK",
      warehouseId: doc.from_warehouse_id || doc.to_warehouse_id || "",
      issuedQty: 0,
      returnedQty: 0,
      soldQty: 0,
      complimentaryQty: 0,
      unsettledQty: 0,
      documentCount: 0
    };
    const qty = Number(line.quantity || 0);
    existing.documentCount += 1;
    if (type === "ISSUE" || type === "UNSETTLED_OPENING") {
      existing.issuedQty += qty;
      existing.unsettledQty += qty;
    } else if (type === "RETURN") {
      existing.returnedQty += qty;
      existing.unsettledQty -= qty;
    } else if (type === "SALE") {
      existing.soldQty += qty;
      existing.unsettledQty -= qty;
    } else if (type === "COMPLIMENTARY") {
      existing.complimentaryQty += qty;
    }
    index.set(key, existing);
  }
  return Array.from(index.values()).sort((a, b) => String(a.activityId).localeCompare(String(b.activityId)) || String(a.bookId).localeCompare(String(b.bookId)));
}

async function getActivityComplimentary(supabase) {
  const { data: documents } = await supabase.from("documents").select("*").eq("document_type", "COMPLIMENTARY");
  const { data: lines } = await supabase.from("document_lines").select("*");
  const { data: activities } = await supabase.from("activities").select("*");
  const { data: items } = await supabase.from("items").select("*");
  const { data: devotees } = await supabase.from("devotees").select("*");
  const { data: warehouses } = await supabase.from("warehouses").select("*");
  const activityById = Object.fromEntries((activities || []).map((row) => [row.id, row]));
  const itemById = Object.fromEntries((items || []).map((row) => [row.id, row]));
  const devoteeById = Object.fromEntries((devotees || []).map((row) => [row.id, row]));
  const devoteeByCode = Object.fromEntries((devotees || []).map((row) => [row.devotee_code, row]));
  const warehouseById = Object.fromEntries((warehouses || []).map((row) => [row.id, row]));
  const docsById = Object.fromEntries((documents || []).map((row) => [row.id, row]));
  const index = new Map();
  for (const line of lines || []) {
    const doc = docsById[line.document_id];
    if (!doc || !doc.activity_id) continue;
    const activity = activityById[doc.activity_id] || {};
    const item = itemById[line.item_id] || {};
    const devotee = devoteeById[activity.devotee_id] || devoteeByCode[activity.devotee_id] || {};
    const key = `${doc.activity_id}|${line.item_id}`;
    const existing = index.get(key) || {
      devoteeId: devotee.devotee_code || activity.devotee_id || "",
      devoteeName: devotee.devotee_name || "",
      activityId: doc.activity_id,
      activityName: activity.activity_name || doc.activity_id,
      bookId: item.erp_code || line.item_id,
      bookName: item.item_name || item.erp_code || line.item_id,
      itemGroup: item.item_group || "BOOK",
      warehouseId: doc.from_warehouse_id || doc.to_warehouse_id || activity.warehouse_id || "",
      complimentaryQty: 0,
      worth: 0
    };
    const qty = Number(line.quantity || 0);
    existing.complimentaryQty += qty;
    existing.worth += qty * Number(item.sale_price || 0);
    index.set(key, existing);
  }
  return Array.from(index.values()).sort((a, b) => String(a.devoteeName).localeCompare(String(b.devoteeName)) || String(a.activityName).localeCompare(String(b.activityName)) || String(a.bookId).localeCompare(String(b.bookId)));
}

async function getSettlementContext(supabase) {
  const [activitiesResult, documentsResult, linesResult, itemsResult, devoteesResult, warehousesResult, paymentsResult] = await Promise.all([
    supabase.from("activities").select("*"),
    supabase.from("documents").select("*"),
    supabase.from("document_lines").select("*"),
    supabase.from("items").select("*"),
    supabase.from("devotees").select("*"),
    supabase.from("warehouses").select("*"),
    supabase.from("activity_settlement_payments").select("*")
  ]);
  if (activitiesResult.error) throw activitiesResult.error;
  if (documentsResult.error) throw documentsResult.error;
  if (linesResult.error) throw linesResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (devoteesResult.error) throw devoteesResult.error;
  if (warehousesResult.error) throw warehousesResult.error;
  if (paymentsResult.error) throw paymentsResult.error;
  return {
    activities: activitiesResult.data || [],
    documents: documentsResult.data || [],
    lines: linesResult.data || [],
    items: itemsResult.data || [],
    devotees: devoteesResult.data || [],
    warehouses: warehousesResult.data || [],
    payments: paymentsResult.data || []
  };
}

function buildSettlementSummaryForActivity(activity, context) {
  const { documents, lines, items, devotees, warehouses, payments } = context;
  const activityDocs = documents.filter((doc) => doc.activity_id === activity.id && isCountableDocument(doc));
  const itemById = Object.fromEntries(items.map((row) => [row.id, row]));
  const devoteeById = Object.fromEntries(devotees.map((row) => [row.id, row]));
  const warehouseById = Object.fromEntries(warehouses.map((row) => [row.id, row]));
  const activityPayments = payments.filter((payment) => payment.activity_id === activity.id).sort((a, b) => String(a.payment_date || "").localeCompare(String(b.payment_date || "")) || String(a.created_at || "").localeCompare(String(b.created_at || "")));
  const summary = {
    issueQty: 0,
    returnQty: 0,
    saleQty: 0,
    complimentaryQty: 0,
    saleDueAmount: 0,
    paidCashAmount: 0,
    paidOnlineAmount: 0,
    paidTotalAmount: 0,
    pendingAmount: 0,
    overpaidAmount: 0
  };
  const docRows = [];
  const bookIndex = new Map();
  const activityId = activity.id;
  for (const doc of activityDocs) {
    const docLines = lines.filter((line) => line.document_id === doc.id);
    let issueQty = 0;
    let returnQty = 0;
    let saleQty = 0;
    let complimentaryQty = 0;
    let amount = 0;
    for (const line of docLines) {
      const item = itemById[line.item_id] || {};
      const qty = Number(line.quantity || 0);
      const price = Number(item.sale_price || line.rate || 0);
      const settlementEdit = doc.document_type === "ADJUSTMENT" ? parseSettlementEditNote(line.line_notes || doc.notes || "") : null;
      if (doc.document_type === "ISSUE" || doc.document_type === "UNSETTLED_OPENING") {
        issueQty += qty;
        amount += qty * price;
      } else if (doc.document_type === "RETURN") {
        returnQty += qty;
        amount -= qty * price;
      } else if (doc.document_type === "SALE") {
        saleQty += qty;
      } else if (doc.document_type === "COMPLIMENTARY") {
        complimentaryQty += qty;
      } else if (doc.document_type === "ADJUSTMENT" && settlementEdit) {
        const target = settlementEdit.target;
        const direction = settlementEdit.direction;
        if (target === "ISSUE") {
          if (direction === "IN") {
            issueQty -= qty;
            amount -= qty * price;
          } else {
            issueQty += qty;
            amount += qty * price;
          }
        } else if (target === "RETURN") {
          if (direction === "IN") {
            returnQty += qty;
            amount -= qty * price;
          } else {
            returnQty -= qty;
            amount += qty * price;
          }
        } else if (target === "SALE") {
          if (direction === "IN") {
            saleQty += qty;
          } else {
            saleQty -= qty;
          }
        } else if (target === "COMPLIMENTARY") {
          if (direction === "IN") {
            complimentaryQty += qty;
            amount -= qty * price;
          } else {
            complimentaryQty -= qty;
            amount += qty * price;
          }
        }
      }
      const bookKey = item.erp_code || line.item_id;
      const existingBookRow = bookIndex.get(bookKey) || {
        bookId: item.erp_code || line.item_id,
        bookName: item.item_name || line.item_id,
        itemGroup: item.item_group || "BOOK",
        issueQty: 0,
        returnQty: 0,
        saleQty: 0,
        complimentaryQty: 0,
        amount: 0
      };
      if (doc.document_type === "ISSUE" || doc.document_type === "UNSETTLED_OPENING") {
        existingBookRow.issueQty += qty;
      } else if (doc.document_type === "RETURN") {
        existingBookRow.returnQty += qty;
      } else if (doc.document_type === "SALE") {
        existingBookRow.saleQty += qty;
      } else if (doc.document_type === "COMPLIMENTARY") {
        existingBookRow.saleQty += qty;
      } else if (doc.document_type === "ADJUSTMENT" && settlementEdit) {
        const target = settlementEdit.target;
        const direction = settlementEdit.direction;
        if (target === "ISSUE") {
          existingBookRow.issueQty += direction === "IN" ? -qty : qty;
        } else if (target === "RETURN") {
          existingBookRow.returnQty += direction === "IN" ? qty : -qty;
        } else if (target === "SALE") {
          existingBookRow.saleQty += direction === "IN" ? qty : -qty;
        } else if (target === "COMPLIMENTARY") {
          existingBookRow.complimentaryQty = Number(existingBookRow.complimentaryQty || 0) + (direction === "IN" ? qty : -qty);
        }
      }
      if (doc.document_type === "ISSUE" || doc.document_type === "UNSETTLED_OPENING") {
        existingBookRow.amount += qty * price;
      } else if (doc.document_type === "RETURN") {
        existingBookRow.amount -= qty * price;
      } else if (doc.document_type === "COMPLIMENTARY") {
        existingBookRow.amount -= qty * price;
      } else if (doc.document_type === "ADJUSTMENT" && settlementEdit) {
        const target = settlementEdit.target;
        const direction = settlementEdit.direction;
        if (target === "ISSUE") {
          existingBookRow.amount += direction === "IN" ? -(qty * price) : (qty * price);
        } else if (target === "RETURN") {
          existingBookRow.amount += direction === "IN" ? -(qty * price) : (qty * price);
        } else if (target === "COMPLIMENTARY") {
          existingBookRow.amount += direction === "IN" ? -(qty * price) : (qty * price);
        }
      }
      bookIndex.set(bookKey, existingBookRow);
    }
    if (!docLines.length) continue;
    docRows.push({
      documentId: doc.document_code,
      documentType: doc.document_type,
      documentDate: doc.document_date,
      warehouseName: warehouseById[doc.from_warehouse_id || doc.to_warehouse_id || ""]?.warehouse_name || "",
      issueQty,
      returnQty,
      saleQty,
      complimentaryQty,
      amount
    });
    summary.issueQty += issueQty;
    summary.returnQty += returnQty;
    summary.saleDueAmount += amount;
    summary.complimentaryQty += complimentaryQty;
  }
  const bookRows = Array.from(bookIndex.values())
    .map((row) => {
      const finalSaleQty = Math.max(Number(row.issueQty || 0) - Number(row.returnQty || 0) - Number(row.complimentaryQty || 0), 0);
      return {
        ...row,
        saleQty: finalSaleQty
      };
    })
    .sort((a, b) => String(a.bookName).localeCompare(String(b.bookName)) || String(a.bookId).localeCompare(String(b.bookId)));
  summary.saleQty = bookRows.reduce((sum, row) => sum + Number(row.saleQty || 0), 0);
  const paidCashAmount = activityPayments.reduce((sum, row) => sum + Number(row.cash_amount || 0), 0);
  const paidOnlineAmount = activityPayments.reduce((sum, row) => sum + Number(row.online_amount || 0), 0);
  const paidTotalAmount = paidCashAmount + paidOnlineAmount;
  const pendingAmountRaw = summary.saleDueAmount - paidTotalAmount;
  summary.paidCashAmount = paidCashAmount;
  summary.paidOnlineAmount = paidOnlineAmount;
  summary.paidTotalAmount = paidTotalAmount;
  summary.pendingAmount = Math.max(pendingAmountRaw, 0);
  summary.overpaidAmount = Math.max(paidTotalAmount - summary.saleDueAmount, 0);
  const isCompleted = String(activity.status || "").toLowerCase() === "completed" || Boolean(activity.settled_at);
  const settlementStatus = isCompleted
    ? (Number(summary.pendingAmount || 0) <= 0 ? "Settled" : "Settlement Pending")
    : "Return Pending";
  return {
    activityId,
    activityName: activity.activity_name || activity.activity_code,
    activityCode: activity.activity_code,
    activityType: activity.activity_type,
    activityStatus: activity.status,
    settlementStatus,
    settledAt: activity.settled_at,
    devoteeId: devoteeById[activity.devotee_id]?.devotee_code || activity.devotee_id || "",
    devoteeName: devoteeById[activity.devotee_id]?.devotee_name || "",
    warehouseId: activity.warehouse_id || "",
    warehouseName: warehouseById[activity.warehouse_id]?.warehouse_name || "",
    summary,
    documents: docRows.sort((a, b) => String(a.documentDate).localeCompare(String(b.documentDate)) || String(a.documentId).localeCompare(String(b.documentId))),
    books: bookRows,
    payments: activityPayments.map((row) => ({
      paymentId: row.id,
      paymentDate: row.payment_date,
      cashAmount: Number(row.cash_amount || 0),
      onlineAmount: Number(row.online_amount || 0),
      totalAmount: Number(row.cash_amount || 0) + Number(row.online_amount || 0),
      notes: row.notes || "",
      createdAt: row.created_at
    }))
  };
}

async function syncActivitySettlementStatus(supabase, activityRef) {
  if (!activityRef) return;
  const context = await getSettlementContext(supabase);
  const activity = context.activities.find((row) => row.id === activityRef || row.activity_code === activityRef);
  if (!activity) return;
  const detail = buildSettlementSummaryForActivity(activity, context);
  const isCompleted = String(activity.status || "").toLowerCase() === "completed" || Boolean(activity.settled_at);
  if (isCompleted && Number(detail.summary.pendingAmount || 0) <= 0 && !activity.settled_at) {
    const { error } = await supabase.from("activities").update({
      status: "Completed",
      settled_at: nowIso()
    }).eq("id", activity.id);
    if (error) throw error;
  }
}

async function getPendingSettlements(supabase) {
  const context = await getSettlementContext(supabase);
  return context.activities
    .map((activity) => buildSettlementSummaryForActivity(activity, context))
    .filter((row) => {
      const hasIssueHistory = Number(row.summary?.issueQty || 0) > 0;
      const isCompleted = String(row.activityStatus || "").toLowerCase() === "completed" || Boolean(row.settledAt);
      return hasIssueHistory && (!isCompleted || Number(row.summary?.pendingAmount || 0) > 0);
    })
    .sort((a, b) => Number(b.summary.pendingAmount || 0) - Number(a.summary.pendingAmount || 0) || String(a.activityName).localeCompare(String(b.activityName)));
}

async function getPendingSettlementDetails(supabase, payload) {
  const activityId = String(payload.activityId || "").trim();
  if (!activityId) throw new Error("Activity is required");
  const context = await getSettlementContext(supabase);
  const activity = context.activities.find((row) => row.activity_code === activityId || row.id === activityId);
  if (!activity) throw new Error("Activity not found");
  return buildSettlementSummaryForActivity(activity, context);
}

async function createSettlementPayment(supabase, payload, currentUser) {
  const activityId = String(payload.activityId || "").trim();
  if (!activityId) throw new Error("Activity is required");
  const cashAmount = Number(payload.cashAmount || 0);
  const onlineAmount = Number(payload.onlineAmount || 0);
  if (cashAmount <= 0 && onlineAmount <= 0) throw new Error("Enter cash or online amount");
  const paymentDate = toDateOnly(payload.paymentDate || nowIso());
  let resolvedActivityId = activityId;
  if (!isUuidLike(activityId)) {
    const { data: activityRow, error: activityLookupError } = await supabase.from("activities").select("id").eq("activity_code", activityId).maybeSingle();
    if (activityLookupError) throw activityLookupError;
    if (!activityRow) throw new Error("Activity not found");
    resolvedActivityId = activityRow.id;
  }
  const { data, error } = await supabase.from("activity_settlement_payments").insert({
    activity_id: resolvedActivityId,
    payment_date: paymentDate,
    cash_amount: cashAmount,
    online_amount: onlineAmount,
    notes: String(payload.notes || "").trim(),
    created_by_user_id: currentUser && isUuidLike(currentUser.userId) ? currentUser.userId : null
  }).select("*").single();
  if (error) throw error;
  const context = await getSettlementContext(supabase);
  const activity = context.activities.find((row) => row.id === resolvedActivityId || row.activity_code === activityId);
  if (activity) {
    const detail = buildSettlementSummaryForActivity(activity, context);
    if (Number(detail.summary.pendingAmount || 0) <= 0) {
      await syncActivitySettlementStatus(supabase, activity.id);
    }
  }
  return {
    paymentId: data.id,
    activityId: data.activity_id,
    paymentDate: data.payment_date,
    cashAmount: Number(data.cash_amount || 0),
    onlineAmount: Number(data.online_amount || 0),
    totalAmount: Number(data.cash_amount || 0) + Number(data.online_amount || 0),
    notes: data.notes || ""
  };
}

async function markReturnsComplete(supabase, payload) {
  const activityId = String(payload.activityId || "").trim();
  if (!activityId) throw new Error("Activity is required");
  let resolvedActivityId = activityId;
  if (!isUuidLike(activityId)) {
    const { data: activityRow, error: activityLookupError } = await supabase.from("activities").select("id").eq("activity_code", activityId).maybeSingle();
    if (activityLookupError) throw activityLookupError;
    if (!activityRow) throw new Error("Activity not found");
    resolvedActivityId = activityRow.id;
  }
  const { error } = await supabase.from("activities").update({
    status: "Completed",
    settled_at: nowIso()
  }).eq("id", resolvedActivityId);
  if (error) throw error;
  const context = await getSettlementContext(supabase);
  const activity = context.activities.find((row) => row.id === resolvedActivityId || row.activity_code === activityId);
  if (!activity) {
    return { activityId: resolvedActivityId };
  }
  return buildSettlementSummaryForActivity(activity, context);
}

async function savePendingSettlementAdjustments(supabase, payload, currentUser) {
  requireAdminUser(currentUser);
  const activityId = String(payload.activityId || "").trim();
  if (!activityId) throw new Error("Activity is required");
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!rows.length) throw new Error("No adjustment rows were provided");
  const context = await getSettlementContext(supabase);
  const activity = context.activities.find((row) => row.activity_code === activityId || row.id === activityId);
  if (!activity) throw new Error("Activity not found");
  const detail = buildSettlementSummaryForActivity(activity, context);
  const currentByBook = Object.fromEntries((detail.books || []).map((row) => [String(row.bookId || "").trim(), row]));
  const itemByCode = Object.fromEntries((context.items || []).map((row) => [String(row.erp_code || "").trim(), row]));
  const documentDate = toDateOnly(payload.documentDate || nowIso());
  const createdAdjustments = [];

  for (const row of rows) {
    const bookId = String(row.bookId || "").trim();
    if (!bookId) continue;
    const current = currentByBook[bookId] || { issueQty: 0, returnQty: 0, saleQty: 0, complimentaryQty: 0 };
    const targetValues = {
      ISSUE: Number(row.issueQty || 0),
      RETURN: Number(row.returnQty || 0),
      SALE: Number(row.saleQty || 0),
      COMPLIMENTARY: Number(row.complimentaryQty || 0)
    };
    const item = itemByCode[bookId] || await findByCode(supabase, "items", "erp_code", bookId);
    if (!item) throw new Error(`Book not found: ${bookId}`);
    const itemGroup = String(item.item_group || "BOOK").trim().toUpperCase();
    const price = Number(item.sale_price || 0);
    for (const [target, desiredQty] of Object.entries(targetValues)) {
      const currentQty = Number(current[(target === "ISSUE" ? "issueQty" : target === "RETURN" ? "returnQty" : target === "SALE" ? "saleQty" : "complimentaryQty")] || 0);
      const delta = desiredQty - currentQty;
      if (delta === 0) continue;
      const direction = target === "RETURN" ? (delta > 0 ? "IN" : "OUT") : (delta > 0 ? "OUT" : "IN");
      const absQty = Math.abs(delta);
      const note = `SETTLEMENT_EDIT|${target}|${direction}|book=${bookId}|old=${currentQty}|new=${desiredQty}`;
      await createDocument(supabase, {
        documentType: "ADJUSTMENT",
        documentDate,
        fromWarehouseId: detail.warehouseId,
        toWarehouseId: detail.warehouseId,
        activityId,
        itemGroup,
        adjustmentDirection: direction,
        status: "Posted",
        notes: note,
        lines: [{
          bookId,
          quantity: absQty,
          rate: price,
          notes: note
        }]
      }, currentUser);
      createdAdjustments.push({ bookId, target, direction, quantity: absQty });
    }
  }

  await syncActivitySettlementStatus(supabase, activity.id);

  return {
    activityId,
    createdAdjustments: createdAdjustments.length,
    adjustments: createdAdjustments
  };
}

async function getSettledActivities(supabase) {
  const context = await getSettlementContext(supabase);
  return context.activities
    .filter((activity) => activity.status === "Completed" || activity.settled_at)
    .map((activity) => buildSettlementSummaryForActivity(activity, context))
    .filter((row) => Number(row.summary.pendingAmount || 0) <= 0)
    .sort((a, b) => String(b.settledAt || b.activityId || "").localeCompare(String(a.settledAt || a.activityId || "")) || String(a.activityName || "").localeCompare(String(b.activityName || "")));
}

async function getActivityLedger(supabase, payload) {
  const rows = await getActivityUnsettled(supabase);
  const devoteeId = String(payload.devoteeId || "").trim();
  const activityId = String(payload.activityId || "").trim();
  let filtered = rows;
  if (devoteeId) filtered = filtered.filter((row) => row.devoteeId === devoteeId);
  if (activityId) filtered = filtered.filter((row) => row.activityId === activityId);
  return filtered;
}

async function getActivityMonthlyReport(supabase, payload) {
  const month = String(payload.month || new Date().toISOString().slice(0, 7));
  const devoteeId = String(payload.devoteeId || "").trim();
  const activityId = String(payload.activityId || "").trim();
  const { data: activities } = await supabase.from("activities").select("*");
  const { data: devotees } = await supabase.from("devotees").select("*");
  const { data: warehouses } = await supabase.from("warehouses").select("*");
  const { data: items } = await supabase.from("items").select("*");
  const { data: documents } = await supabase.from("documents").select("*").gte("document_date", `${month}-01`).lt("document_date", monthEnd(month));
  const { data: lines } = await supabase.from("document_lines").select("*");
  const devoteeById = Object.fromEntries((devotees || []).map((row) => [row.id, row]));
  const devoteeByCode = Object.fromEntries((devotees || []).map((row) => [row.devotee_code, row]));
  const selectedDevotee = devoteeByCode[devoteeId] || devoteeById[devoteeId] || null;
  const activity = (activities || []).find((row) => row.activity_code === activityId || (!activityId && selectedDevotee && row.devotee_id === selectedDevotee.id)) || null;
  if (!activity) {
    return { month, rows: [], documents: [], totals: {} };
  }
  const docs = (documents || []).filter((doc) => doc.activity_id === activity.id && isCountableDocument(doc));
  const docsById = Object.fromEntries(docs.map((doc) => [doc.id, doc]));
  const itemById = Object.fromEntries((items || []).map((row) => [row.id, row]));
  const warehouseById = Object.fromEntries((warehouses || []).map((row) => [row.id, row]));
  const index = new Map();
  const docMap = {};
  for (const doc of docs) {
    const docLines = (lines || []).filter((line) => line.document_id === doc.id);
    const docRow = {
      documentId: doc.document_code,
      documentType: doc.document_type,
      documentDate: doc.document_date,
      status: doc.status,
      notes: doc.notes
    };
    const summary = { issueQty: 0, returnQty: 0, saleQty: 0, unsettledQty: 0, complimentaryQty: 0 };
    for (const line of docLines) {
      const item = itemById[line.item_id] || {};
      const key = line.item_id;
      const qty = Number(line.quantity || 0);
      const price = Number(item.sale_price || line.rate || 0);
      const settlementEdit = doc.document_type === "ADJUSTMENT" ? parseSettlementEditNote(line.line_notes || doc.notes || "") : null;
      const existing = index.get(key) || {
        bookId: item.erp_code || line.item_id,
        bookName: item.item_name || line.item_id,
        bookType: item.item_type || "",
        itemGroup: item.item_group || "BOOK",
        issueQty: 0,
        returnQty: 0,
        saleQty: 0,
        complimentaryQty: 0,
        unsettledQty: 0,
        worth: 0,
        documentCount: 0,
        docMap: {}
      };
      existing.documentCount += 1;
      if (!existing.docMap[doc.document_code]) existing.docMap[doc.document_code] = { documentId: doc.document_code, issueQty: 0, returnQty: 0, saleQty: 0, unsettledQty: 0, complimentaryQty: 0 };
      const docBucket = existing.docMap[doc.document_code];
      if (doc.document_type === "ISSUE" || doc.document_type === "UNSETTLED_OPENING") {
        existing.issueQty += qty;
        existing.unsettledQty += qty;
        docBucket.issueQty += qty;
        docBucket.unsettledQty += qty;
      } else if (doc.document_type === "RETURN") {
        existing.returnQty += qty;
        existing.unsettledQty -= qty;
        docBucket.returnQty += qty;
        docBucket.unsettledQty -= qty;
      } else if (doc.document_type === "SALE") {
        existing.saleQty += qty;
        existing.unsettledQty -= qty;
        docBucket.saleQty += qty;
        docBucket.unsettledQty -= qty;
      } else if (doc.document_type === "COMPLIMENTARY") {
        existing.complimentaryQty += qty;
        docBucket.complimentaryQty += qty;
      } else if (doc.document_type === "ADJUSTMENT" && settlementEdit) {
        const target = settlementEdit.target;
        const direction = settlementEdit.direction;
        if (target === "ISSUE") {
          if (direction === "IN") {
            existing.issueQty -= qty;
            existing.unsettledQty -= qty;
            docBucket.issueQty -= qty;
            docBucket.unsettledQty -= qty;
          } else {
            existing.issueQty += qty;
            existing.unsettledQty += qty;
            docBucket.issueQty += qty;
            docBucket.unsettledQty += qty;
          }
        } else if (target === "RETURN") {
          if (direction === "IN") {
            existing.returnQty += qty;
            existing.unsettledQty -= qty;
            docBucket.returnQty += qty;
            docBucket.unsettledQty -= qty;
          } else {
            existing.returnQty -= qty;
            existing.unsettledQty += qty;
            docBucket.returnQty -= qty;
            docBucket.unsettledQty += qty;
          }
        } else if (target === "SALE") {
          if (direction === "IN") {
            existing.saleQty += qty;
            docBucket.saleQty += qty;
          } else {
            existing.saleQty -= qty;
            docBucket.saleQty -= qty;
          }
        } else if (target === "COMPLIMENTARY") {
          if (direction === "IN") {
            existing.complimentaryQty += qty;
            docBucket.complimentaryQty += qty;
          } else {
            existing.complimentaryQty -= qty;
            docBucket.complimentaryQty -= qty;
          }
        }
      }
      if (doc.document_type !== "ADJUSTMENT" || settlementEdit) {
        existing.worth += qty * price;
      }
      index.set(key, existing);
      summary.issueQty += existing.issueQty;
      summary.returnQty += existing.returnQty;
      summary.saleQty += existing.saleQty;
      summary.unsettledQty += existing.unsettledQty;
      summary.complimentaryQty += existing.complimentaryQty;
    }
    docMap[doc.document_code] = docRow;
  }
  const rows = Array.from(index.values()).sort((a, b) => String(a.bookName).localeCompare(String(b.bookName)) || String(a.bookId).localeCompare(String(b.bookId)));
  rows.sort((a, b) => {
    const groupA = String(a.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
    const groupB = String(b.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
    return groupA - groupB || String(a.bookName).localeCompare(String(b.bookName)) || String(a.bookId).localeCompare(String(b.bookId));
  });
  const documentsArray = docs.map((doc) => ({
    documentId: doc.document_code,
    documentType: doc.document_type,
    documentDate: doc.document_date,
    status: doc.status,
    notes: doc.notes
  }));
  const rowsWithDocArray = rows.map((row) => ({
    ...row,
    docMapArray: documentsArray.map((doc) => {
      const bucket = row.docMap[doc.documentId] || {
        documentId: doc.documentId,
        documentType: doc.documentType,
        documentDate: doc.documentDate,
        issueQty: 0,
        returnQty: 0,
        saleQty: 0,
        unsettledQty: 0,
        complimentaryQty: 0
      };
      return {
        documentId: bucket.documentId || doc.documentId,
        documentType: bucket.documentType || doc.documentType,
        documentDate: bucket.documentDate || doc.documentDate,
        issueQty: Number(bucket.issueQty || 0),
        returnQty: Number(bucket.returnQty || 0),
        saleQty: Number(bucket.saleQty || 0),
        unsettledQty: Number(bucket.unsettledQty || 0),
        complimentaryQty: Number(bucket.complimentaryQty || 0)
      };
    })
  }));
  for (const row of rowsWithDocArray) {
    const finalSaleQty = Math.max(Number(row.issueQty || 0) - Number(row.returnQty || 0) - Number(row.complimentaryQty || 0), 0);
    row.saleQty = finalSaleQty;
    const item = itemById[Object.keys(itemById).find((itemId) => (itemById[itemId].erp_code || itemId) === row.bookId)] || {};
    const price = Number(item.sale_price || 0);
    row.worth = finalSaleQty * price;
  }
  const settlementContext = await getSettlementContext(supabase);
  const settlementActivity = settlementContext.activities.find((row) => row.id === activity.id) || activity;
  const settlementDetail = buildSettlementSummaryForActivity(settlementActivity, settlementContext);
  const totals = rowsWithDocArray.reduce((acc, row) => {
    acc.issueQty += Number(row.issueQty || 0);
    acc.returnQty += Number(row.returnQty || 0);
    acc.saleQty += Number(row.saleQty || 0);
    acc.complimentaryQty += Number(row.complimentaryQty || 0);
    acc.unsettledQty += Number(row.unsettledQty || 0);
    acc.worth += Number(row.worth || 0);
    return acc;
  }, { issueQty: 0, returnQty: 0, saleQty: 0, complimentaryQty: 0, unsettledQty: 0, worth: 0 });
  return {
    month,
    devoteeId: selectedDevotee?.devotee_code || devoteeById[activity.devotee_id]?.devotee_code || "",
    devoteeName: devoteeById[activity.devotee_id]?.devotee_name || selectedDevotee?.devotee_name || "",
    activityId: activity.activity_code,
    activityName: activity.activity_name,
    activityStatus: activity.status,
    settlementStatus: settlementDetail.settlementStatus,
    saleDueAmount: Number(settlementDetail.summary?.saleDueAmount || 0),
    paidCashAmount: Number(settlementDetail.summary?.paidCashAmount || 0),
    paidOnlineAmount: Number(settlementDetail.summary?.paidOnlineAmount || 0),
    paidTotalAmount: Number(settlementDetail.summary?.paidTotalAmount || 0),
    pendingAmount: Number(settlementDetail.summary?.pendingAmount || 0),
    warehouseId: activity.warehouse_id || "",
    warehouseName: warehouseById[activity.warehouse_id]?.warehouse_name || "",
    documents: documentsArray,
    rows: rowsWithDocArray,
    totals
  };
}

function monthEnd(month) {
  const [y, m] = String(month || "").split("-").map(Number);
  const d = new Date(y || new Date().getFullYear(), (m || 1), 0);
  return d.toISOString().slice(0, 10);
}

async function getWarehouseMonthlyReport(supabase, payload) {
  const warehouseId = String(payload.warehouseId || "").trim();
  const month = String(payload.month || new Date().toISOString().slice(0, 7));
  const { data: warehouse } = await supabase.from("warehouses").select("*").eq("warehouse_code", warehouseId).maybeSingle();
  if (!warehouse) throw new Error("Warehouse not found");
  const { data: allWarehouses } = await supabase.from("warehouses").select("*");
  const { data: activities } = await supabase.from("activities").select("id, status, settled_at, warehouse_id");
  const { data: items } = await supabase.from("items").select("*");
  const { data: documents } = await supabase.from("documents").select("*").gte("document_date", `${month}-01`).lt("document_date", monthEnd(month));
  const { data: lines } = await supabase.from("document_lines").select("*");
  const itemsById = Object.fromEntries((items || []).map((row) => [row.id, row]));
  const warehousesById = Object.fromEntries((allWarehouses || []).map((row) => [row.id, row]));
  const activityById = Object.fromEntries((activities || []).map((row) => [row.id, row]));
  const startDocs = (documents || []).filter((doc) =>
    isCountableDocument(doc) &&
    doc.document_date &&
    doc.document_date.slice(0, 7) === month &&
    documentTouchesWarehouse(doc, warehouse.id)
  );
  const index = new Map();
  const warehouseNameLower = String(warehouse.warehouse_name || "").toLowerCase();
  const isMain = warehouseNameLower.includes("gmb") || warehouseNameLower.includes("gambhiram");
  const daySet = new Set(startDocs.map((doc) => doc.document_date));
  for (const activity of activities || []) {
    if (!activity || String(activity.status || "").toLowerCase() !== "completed" && !activity.settled_at) continue;
    const settledDay = toDateOnly(activity.settled_at || "");
    if (settledDay && settledDay.slice(0, 7) === month) {
      daySet.add(settledDay);
    }
  }
  const days = Array.from(daySet).sort();
  for (const doc of startDocs) {
    const docLines = (lines || []).filter((line) => line.document_id === doc.id);
    const activity = doc.activity_id ? activityById[doc.activity_id] || null : null;
    const settledAtDate = activity && (String(activity.status || "").toLowerCase() === "completed" || activity.settled_at)
      ? toDateOnly(activity.settled_at || doc.document_date)
      : "";
    for (const line of docLines) {
      const item = itemsById[line.item_id] || {};
      const fromWarehouse = warehousesById[doc.from_warehouse_id || ""] || null;
      const toWarehouse = warehousesById[doc.to_warehouse_id || ""] || null;
      const fromWarehouseName = fromWarehouse?.warehouse_name || doc.from_warehouse_id || "";
      const toWarehouseName = toWarehouse?.warehouse_name || doc.to_warehouse_id || "";
      const key = line.item_id;
      const row = index.get(key) || {
        bookId: item.erp_code || line.item_id,
        bookName: item.item_name || line.item_id,
        bookType: item.item_type || "",
        itemGroup: item.item_group || "BOOK",
        openingQty: 0,
        purchaseInQty: 0,
        issueQty: 0,
        returnQty: 0,
        transferInQty: 0,
        transferOutQty: 0,
        saleQty: 0,
        unsettledQty: 0,
        closingQty: 0,
        transferMap: {},
        transferArray: [],
        daySalesMap: {},
        daySalesArray: []
      };
      const qty = Number(line.quantity || 0);
      if (doc.document_type === "OPENING") {
        row.openingQty += qty;
        row.closingQty += qty;
      } else if (doc.document_type === "PURCHASE") {
        row.purchaseInQty += qty;
        row.closingQty += qty;
      } else if (doc.document_type === "ISSUE" || doc.document_type === "UNSETTLED_OPENING") {
        row.issueQty += qty;
        row.unsettledQty += qty;
        row.closingQty -= qty;
      } else if (doc.document_type === "RETURN") {
        row.returnQty += qty;
        row.unsettledQty -= qty;
        row.closingQty += qty;
      } else if (doc.document_type === "SALE") {
        row.saleQty += qty;
        row.daySalesMap[doc.document_date] = (row.daySalesMap[doc.document_date] || 0) + qty;
        row.closingQty -= qty;
      } else if (doc.document_type === "COMPLIMENTARY") {
        row.closingQty -= qty;
      } else if (doc.document_type === "ADJUSTMENT") {
        const settlementEdit = parseSettlementEditNote(line.line_notes || doc.notes || "");
        if (settlementEdit) {
          const target = settlementEdit.target;
          const direction = settlementEdit.direction;
          if (target === "ISSUE") {
            if (direction === "IN") {
              row.issueQty -= qty;
              row.unsettledQty -= qty;
              row.closingQty += qty;
            } else {
              row.issueQty += qty;
              row.unsettledQty += qty;
              row.closingQty -= qty;
            }
          } else if (target === "RETURN") {
            if (direction === "IN") {
              row.returnQty += qty;
              row.unsettledQty += qty;
              row.closingQty += qty;
            } else {
              row.returnQty -= qty;
              row.unsettledQty -= qty;
              row.closingQty -= qty;
            }
          } else if (target === "SALE") {
            if (direction === "IN") {
              row.saleQty += qty;
              row.daySalesMap[doc.document_date] = (row.daySalesMap[doc.document_date] || 0) + qty;
              row.closingQty -= qty;
            } else {
              row.saleQty -= qty;
              row.daySalesMap[doc.document_date] = (row.daySalesMap[doc.document_date] || 0) - qty;
              row.closingQty += qty;
            }
          } else if (target === "COMPLIMENTARY") {
            if (direction === "IN") {
              row.closingQty -= qty;
            } else {
              row.closingQty += qty;
            }
          }
        } else {
          const qtyIn = Number(doc.to_warehouse_id === warehouse.id ? qty : 0);
          const qtyOut = Number(doc.from_warehouse_id === warehouse.id ? qty : 0);
          if (qtyIn > 0) {
            row.closingQty += qtyIn;
          }
          if (qtyOut > 0) {
            row.closingQty -= qtyOut;
          }
        }
      } else if (doc.document_type === "TRANSFER") {
        if (doc.from_warehouse_id === warehouse.id) {
          row.transferOutQty += qty;
          row.closingQty -= qty;
          if (isMain) {
            const transferName = toWarehouseName || "Transfer Out";
            row.transferMap[transferName] = (row.transferMap[transferName] || 0) + qty;
          }
        }
        if (doc.to_warehouse_id === warehouse.id) {
          row.transferInQty += qty;
          row.closingQty += qty;
          if (isMain) {
            const transferName = fromWarehouseName || "Transfer In";
            row.transferMap[transferName] = (row.transferMap[transferName] || 0) + qty;
          }
        }
      }
      index.set(key, row);
    }
  }
  const rows = Array.from(index.values()).sort((a, b) => {
    const groupA = String(a.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
    const groupB = String(b.itemGroup || "BOOK").toUpperCase() === "BOOK" ? 0 : 1;
    return groupA - groupB || String(a.bookName).localeCompare(String(b.bookName)) || String(a.bookId).localeCompare(String(b.bookId));
  });
  const settlementContext = await getSettlementContext(supabase);
  const rowByBookId = new Map(rows.map((row) => [String(row.bookId || ""), row]));
  for (const activity of settlementContext.activities || []) {
    if (String(activity.warehouse_id || "") !== String(warehouse.id || "")) continue;
    if (String(activity.status || "").toLowerCase() !== "completed" && !activity.settled_at) continue;
    const settledDay = toDateOnly(activity.settled_at || "");
    if (!settledDay || settledDay.slice(0, 7) !== month) continue;
    const detail = buildSettlementSummaryForActivity(activity, settlementContext);
    const hasSaleDocs = (detail.documents || []).some((doc) => String(doc.documentType || "").toUpperCase() === "SALE");
    for (const book of detail.books || []) {
      const row = rowByBookId.get(String(book.bookId || ""));
      if (!row) continue;
      const settledSaleQty = hasSaleDocs
        ? Number(book.saleQty || 0)
        : Math.max(Number(book.issueQty || 0) - Number(book.returnQty || 0) - Number(book.complimentaryQty || 0), 0);
      if (settledSaleQty <= 0) continue;
      row.saleQty += settledSaleQty;
      row.daySalesMap[settledDay] = (row.daySalesMap[settledDay] || 0) + settledSaleQty;
    }
  }
  const rowsWithArrays = rows.map((row) => {
    const transferArray = Object.entries(row.transferMap || {}).map(([name, quantity]) => ({ name, quantity }));
    const daySalesArray = (days || []).map((day) => ({ day, quantity: Number((row.daySalesMap || {})[day] || 0) })); 
    return {
      ...row,
      transferArray,
      daySalesArray
    };
  });
  return {
    warehouseId: warehouse.warehouse_code,
    warehouseName: warehouse.warehouse_name,
    month,
    reportMode: isMain ? "main" : "branch",
    dayColumns: days,
    rows: rowsWithArrays
  };
}

async function dashboardSummary(supabase) {
  const today = nowIso().slice(0, 10);
  const { data: docs } = await supabase.from("documents").select("*").gte("created_at", `${today}T00:00:00.000Z`).lt("created_at", `${today}T23:59:59.999Z`);
  const { data: activities } = await supabase.from("activities").select("*");
  const { data: ledger } = await supabase.from("stock_ledger").select("*");
  return {
    todaySales: (docs || []).filter((doc) => doc.document_type === "SALE").length,
    todayBooks: (docs || []).reduce((sum, doc) => sum + Number(doc.total_quantity || 0), 0),
    runningActivities: (activities || []).filter((row) => row.status === "Running").length,
    totalStock: (ledger || []).reduce((sum, row) => sum + Number(row.quantity_in || 0) - Number(row.quantity_out || 0), 0),
    recentActivities: (activities || []).slice(-5).reverse().map((row) => ({ name: row.activity_name, warehouse: row.warehouse_id, status: row.status })),
    recentDocuments: (docs || []).slice(-5).reverse().map((row) => ({ type: row.document_type, ref: row.document_code, warehouse: row.from_warehouse_id || row.to_warehouse_id || "", qty: row.total_quantity || 0 }))
  };
}

async function main(request) {
  if (request.method === "GET") {
    return json(200, { ok: true, data: { status: "Supabase API is running" } });
  }
  try {
    const body = await readBody(request);
    const action = body.action;
    const payload = body.payload || {};
    const supabase = getSupabase();
    const publicActions = new Set([
      "auth.login",
      "auth.logout",
      "auth.me",
      "warehouses.list",
      "books.list",
      "stock.current",
      "onlineClasses.submit",
      "onlineClasses.warehouseBooks",
      "catalog.items",
      "catalog.profileLookup",
      "catalog.submit",
      "catalog.requestsByMobile"
    ]);
    const currentUser = await requireCurrentUser(supabase, payload, publicActions.has(action));

    switch (action) {
      case "auth.login":
        return json(200, { ok: true, data: await authLogin(supabase, payload) });
      case "auth.logout":
        return json(200, { ok: true, data: await authLogout(supabase, payload) });
      case "auth.me":
        return json(200, { ok: true, data: currentUser });
      case "users.list":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await usersList(supabase) });
      case "users.create":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await createUser(supabase, payload) });
      case "users.update":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await updateUser(supabase, payload) });
      case "dashboard.summary":
        return json(200, { ok: true, data: await dashboardSummary(supabase) });
      case "books.list":
        return json(200, { ok: true, data: await booksList(supabase) });
      case "books.adminList":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await booksAdminList(supabase) });
      case "books.create":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await booksCreate(supabase, payload) });
      case "books.update":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await booksUpdate(supabase, payload) });
      case "books.delete":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await booksDelete(supabase, payload) });
      case "books.bulkUpsert":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await booksBulkUpsert(supabase, payload) });
      case "items.list":
        return json(200, { ok: true, data: await itemsPublicList(supabase, payload) });
      case "items.adminList":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await itemsAdminList(supabase, payload) });
      case "items.create":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await itemsCreate(supabase, payload) });
      case "items.update":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await itemsUpdate(supabase, payload) });
      case "items.delete":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await itemsDelete(supabase, payload) });
      case "items.bulkUpsert":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await itemsBulkUpsert(supabase, payload) });
      case "devotionalItems.list":
        return json(200, { ok: true, data: await devotionalItemsList(supabase) });
      case "warehouses.list":
        return json(200, { ok: true, data: await warehousesList(supabase) });
      case "warehouses.create":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await createWarehouse(supabase, payload) });
      case "warehouses.update":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await updateWarehouse(supabase, payload) });
      case "warehouses.delete":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await deleteWarehouse(supabase, payload) });
      case "warehouses.bulkUpsert":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await warehousesBulkUpsert(supabase, payload) });
      case "devotees.list":
        return json(200, { ok: true, data: await devoteesList(supabase) });
      case "devotees.create":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await createDevotee(supabase, payload) });
      case "devotees.update":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await updateDevotee(supabase, payload) });
      case "activities.list":
        return json(200, { ok: true, data: await activitiesList(supabase) });
      case "activities.create":
        return json(200, { ok: true, data: await createActivity(supabase, payload) });
      case "activities.update":
        return json(200, { ok: true, data: await updateActivity(supabase, payload) });
      case "activities.delete":
        return json(200, { ok: true, data: await deleteActivity(supabase, payload) });
      case "documents.list":
        return json(200, { ok: true, data: await documentsList(supabase) });
      case "documents.detail":
        return json(200, { ok: true, data: await documentDetail(supabase, payload) });
      case "documents.create":
        return json(200, { ok: true, data: await createDocument(supabase, payload, currentUser) });
      case "documents.update":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await updateDocumentInPlace(supabase, payload, currentUser) });
      case "documents.correct":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await correctDocument(supabase, payload, currentUser) });
      case "documents.importUnsettledOpening":
        return json(200, { ok: true, data: await importUnsettledOpeningDocuments(supabase, payload, currentUser) });
      case "documents.halveWarehouseOpening":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await halveWarehouseOpeningStock(supabase, payload) });
      case "stock.current":
        return json(200, { ok: true, data: await stockCurrent(supabase) });
      case "stock.adminUpdate":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await adminUpdateCurrentStock(supabase, payload, currentUser) });
      case "documents.resetWarehouseToOpening":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await resetWarehouseToOpening(supabase, payload, currentUser) });
      case "activity.unsettled":
        return json(200, { ok: true, data: await getActivityUnsettled(supabase) });
      case "activity.complimentary":
        return json(200, { ok: true, data: await getActivityComplimentary(supabase) });
      case "activity.pendingSettlements":
        return json(200, { ok: true, data: await getPendingSettlements(supabase) });
      case "activity.pendingSettlementDetails":
        return json(200, { ok: true, data: await getPendingSettlementDetails(supabase, payload) });
      case "activity.settlementPaymentCreate":
        return json(200, { ok: true, data: await createSettlementPayment(supabase, payload, currentUser) });
      case "activity.markReturnsComplete":
        return json(200, { ok: true, data: await markReturnsComplete(supabase, payload) });
      case "activity.pendingSettlementAdjustmentsSave":
        return json(200, { ok: true, data: await savePendingSettlementAdjustments(supabase, payload, currentUser) });
      case "activity.settledActivities":
        return json(200, { ok: true, data: await getSettledActivities(supabase) });
      case "catalog.items":
        return json(200, { ok: true, data: await catalogRequestItems(supabase, payload) });
      case "catalog.profileLookup":
        return json(200, { ok: true, data: await catalogProfileLookup(supabase, payload) });
      case "catalog.submit":
        return json(200, { ok: true, data: await createCatalogRequest(supabase, payload, currentUser) });
      case "catalog.requestsByMobile":
        return json(200, { ok: true, data: await catalogRequestsByMobile(supabase, payload) });
      case "requests.list":
        return json(200, { ok: true, data: await catalogRequestsList(supabase) });
      case "requests.approve":
        return json(200, { ok: true, data: await approveCatalogRequest(supabase, payload, currentUser) });
      case "sales.entriesList":
        return json(200, { ok: true, data: await saleEntriesList(supabase, payload, currentUser) });
      case "sales.entryDetail":
        return json(200, { ok: true, data: await saleEntryDetail(supabase, payload) });
      case "sales.entryPaymentCreate":
        return json(200, { ok: true, data: await createSaleEntryPayment(supabase, payload, currentUser) });
      case "sales.dayPaymentCreate":
        return json(200, { ok: true, data: await createSaleDayPayment(supabase, payload, currentUser) });
      case "sales.submit":
        return json(200, { ok: true, data: await submitWarehouseSale(supabase, payload, currentUser) });
      case "reports.activityLedger":
        return json(200, { ok: true, data: await getActivityLedger(supabase, payload) });
      case "reports.activityMonthly":
        return json(200, { ok: true, data: await getActivityMonthlyReport(supabase, payload) });
      case "reports.warehouseMonthly":
        return json(200, { ok: true, data: await getWarehouseMonthlyReport(supabase, payload) });
      case "onlineClasses.submit":
        return json(200, { ok: true, data: await createOnlineClassRegistration(supabase, payload) });
      case "onlineClasses.warehouseBooks":
        return json(200, { ok: true, data: await onlineClassWarehouseBooks(supabase, payload) });
      case "onlineClasses.list":
        requireAdminUser(currentUser);
        return json(200, { ok: true, data: await onlineClassRegistrationsList(supabase) });
      default:
        return json(400, { ok: false, error: `Unknown action: ${action}` });
    }
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Server error" });
  }
}

export default async function handler(req, res) {
  try {
    const method = String(req.method || "GET").toUpperCase();
    const bodyBuffer = method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readNodeBody(req);
    const protocol = String(req.headers["x-forwarded-proto"] || "https");
    const host = String(req.headers.host || "localhost");
    const url = new URL(req.url || "/", `${protocol}://${host}`);
    const requestInit = {
      method,
      headers: nodeHeadersToWebHeaders(req.headers)
    };
    if (bodyBuffer.length && method !== "GET" && method !== "HEAD") {
      requestInit.body = bodyBuffer;
    }
    const webRequest = new Request(url, requestInit);
    const webResponse = await main(webRequest);
    await sendWebResponse(res, webResponse);
  } catch (error) {
    await sendWebResponse(res, json(500, { ok: false, error: error.message || "Server error" }));
  }
}
