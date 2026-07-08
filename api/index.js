import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

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
  return {
    userId: row.id,
    name: row.name,
    username: row.username,
    role: row.role === "store_incharge" ? "storeIncharge" : "mainAdmin",
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapDevotee(row) {
  return {
    devoteeId: row.devotee_code,
    devoteeName: row.devotee_name,
    active: row.active
  };
}

function mapWarehouse(row) {
  return {
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
    bookId: row.erp_code,
    erpCode: row.erp_code,
    name: row.item_name,
    bookType: row.item_type,
    category: row.item_type,
    salePrice: Number(row.sale_price || 0),
    mrp: Number(row.sale_price || 0),
    purchasePrice: Number(row.purchase_price || 0),
    distributorPrice: Number(row.purchase_price || 0),
    active: row.active
  };
}

function mapActivity(row, devoteesById = {}, warehousesById = {}) {
  const devotee = devoteesById[row.devotee_id] || {};
  const warehouse = warehousesById[row.warehouse_id] || {};
  return {
    activityId: row.activity_code,
    name: row.activity_name,
    type: row.activity_type,
    devoteeId: row.devotee_id || "",
    devoteeName: devotee.devotee_name || "",
    startDate: row.start_date,
    endDate: row.end_date,
    warehouseId: row.warehouse_id || "",
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
  const { data: user } = await supabase.from("users").select("*").eq("id", session.user_id).maybeSingle();
  return user ? mapUser(user) : null;
}

async function requireCurrentUser(supabase, payload, publicAction) {
  if (publicAction) return null;
  const currentUser = await getSessionUser(supabase, payload.sessionToken);
  if (!currentUser) throw new Error("Please log in to continue");
  return currentUser;
}

async function listTable(supabase, tableName, mapper) {
  const { data, error } = await supabase.from(tableName).select("*");
  if (error) throw error;
  return (data || []).map(mapper);
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
  if (!erpCode || !name) throw new Error("ERP Code and book name are required");
  const itemGroup = String(payload.itemGroup || payload.group || "BOOK").trim().toUpperCase();
  const { data, error } = await supabase.from("items").insert({
    erp_code: erpCode,
    item_name: name,
    item_group: ["BOOK", "PARAPHERNALIA", "OTHER"].includes(itemGroup) ? itemGroup : "BOOK",
    item_type: String(payload.bookType || payload.category || "").trim(),
    unit: payload.unit || "pcs",
    purchase_price: Number(payload.purchasePrice || payload.distributorPrice || 0),
    sale_price: Number(payload.salePrice || payload.mrp || 0),
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
  if (!name) throw new Error("Book name is required for purchase input");
  const itemGroup = String(line.itemGroup || line.group || "BOOK").trim().toUpperCase();
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

async function createActivity(supabase, payload) {
  const activityCode = payload.activityId || payload.activityCode || await nextCode(supabase, "activities", "activity_code", "ACT");
  const { data, error } = await supabase.from("activities").insert({
    activity_code: activityCode,
    activity_name: String(payload.name || "").trim(),
    activity_type: String(payload.type || "Stall").trim(),
    devotee_id: payload.devoteeId || null,
    warehouse_id: payload.warehouseId || null,
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
  const updates = {
    activity_name: String(payload.name || "").trim(),
    activity_type: String(payload.type || "Stall").trim(),
    devotee_id: payload.devoteeId || null,
    warehouse_id: payload.warehouseId || null,
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
  const { data: users, error } = await supabase.from("users").select("*");
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
    return { sessionToken, user: mapUser(user) };
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
  return listTable(supabase, "users", mapUser);
}

async function createUser(supabase, payload) {
  const username = String(payload.username || "").trim().toLowerCase();
  const name = String(payload.name || "").trim();
  if (!name || !username || !String(payload.password || "").trim()) throw new Error("Name, username, and password are required");
  const { data: existing } = await supabase.from("users").select("id").ilike("username", username).maybeSingle();
  if (existing) throw new Error("Username already exists");
  const { data, error } = await supabase.from("users").insert({
    name,
    username,
    password_hash: sha256(payload.password),
    role: payload.role === "admin" ? "admin" : "store_incharge",
    active: payload.active !== false
  }).select("*").single();
  if (error) throw error;
  return mapUser(data);
}

async function updateUser(supabase, payload) {
  const id = payload.userId;
  if (!id) throw new Error("User ID is required");
  const updates = {};
  if (payload.name !== undefined) updates.name = String(payload.name || "").trim();
  if (payload.username !== undefined) updates.username = String(payload.username || "").trim().toLowerCase();
  if (payload.password !== undefined && String(payload.password || "").trim()) updates.password_hash = sha256(payload.password);
  if (payload.role !== undefined) updates.role = payload.role === "admin" ? "admin" : "store_incharge";
  if (payload.active !== undefined) updates.active = Boolean(payload.active);
  const { data, error } = await supabase.from("users").update(updates).eq("id", id).select("*").single();
  if (error) throw error;
  return mapUser(data);
}

async function booksList(supabase) {
  return itemsList(supabase, { itemGroup: "BOOK" });
}

async function booksAdminList(supabase) {
  return booksList(supabase);
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
  return itemsList(supabase, { itemGroup: "PARAPHERNALIA" });
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

function documentTypeRequiresActivity(documentType) {
  return ["ISSUE", "COMPLIMENTARY", "RETURN", "UNSETTLED_OPENING", "SALE"].includes(documentType);
}

async function createDocument(supabase, payload, currentUser) {
  const documentType = String(payload.documentType || "").trim();
  const allowed = ["OPENING", "ISSUE", "COMPLIMENTARY", "RECEIVE", "PURCHASE", "SALE", "RETURN", "TRANSFER", "ADJUSTMENT", "UNSETTLED_OPENING"];
  if (!allowed.includes(documentType)) throw new Error("Invalid document type");
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  const itemGroup = String(payload.itemGroup || "BOOK").trim().toUpperCase();
  if (!lines.length) throw new Error("At least one document line is required");
  if (documentTypeRequiresActivity(documentType) && !payload.activityId) throw new Error("Activity is required for this document");
  if ((documentType === "OPENING" || documentType === "UNSETTLED_OPENING" || documentType === "PURCHASE") && !payload.toWarehouseId && !payload.fromWarehouseId) {
    throw new Error("Warehouse is required");
  }
  if (documentType === "TRANSFER" && (!payload.fromWarehouseId || !payload.toWarehouseId)) {
    throw new Error("Both warehouses are required for transfer");
  }
  if (documentType === "RETURN") {
    const { data: existingIssue } = await supabase.from("documents").select("id").eq("activity_id", payload.activityId).in("document_type", ["ISSUE", "UNSETTLED_OPENING"]).limit(1);
    if (!existingIssue || !existingIssue.length) throw new Error("Return can be posted only for an activity that already has issue or unsettled opening entries");
  }

  const docCode = await nextCode(supabase, "documents", "document_code", "DOC");
  const documentDate = toDateOnly(payload.documentDate || nowIso());
  const { data: doc, error: docError } = await supabase.from("documents").insert({
    document_code: docCode,
    document_type: documentType,
    document_date: documentDate,
    from_warehouse_id: payload.fromWarehouseId || null,
    to_warehouse_id: payload.toWarehouseId || null,
    activity_id: payload.activityId || null,
    created_by_user_id: currentUser && isUuidLike(currentUser.userId) ? currentUser.userId : null,
    status: payload.status || "Posted",
    notes: payload.notes || ""
  }).select("*").single();
  if (docError) throw docError;

  const warehouseId = payload.toWarehouseId || payload.fromWarehouseId || null;
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
      if (item && itemGroup && String(item.item_group || "").toUpperCase() !== itemGroup) {
        throw new Error(`Item category mismatch for ${erpCode}`);
      }
      if (item && documentType === "PURCHASE" && rawLine.bookName) {
        item = await upsertItemIfMissing(supabase, { ...rawLine, itemGroup });
      }
    }
    const qty = Number(rawLine.quantity || 0);
    const rate = Number(rawLine.rate || rawLine.purchasePrice || 0);
    const amount = qty * rate;
    const { data: line, error: lineError } = await supabase.from("document_lines").insert({
      document_id: doc.id,
      line_no: lineNo,
      item_id: item.id,
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
        warehouse_id: payload.fromWarehouseId || null,
        activity_id: payload.activityId || null,
        item_id: item.id,
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
        warehouse_id: payload.toWarehouseId || null,
        activity_id: payload.activityId || null,
        item_id: item.id,
        movement_type: "TRANSFER_IN",
        quantity_in: qty,
        quantity_out: 0,
        rate,
        amount
      });
    } else if (documentType === "OPENING" || documentType === "RECEIVE" || documentType === "RETURN" || documentType === "PURCHASE") {
      ledgerRows.push({
        document_id: doc.id,
        document_line_id: line.id,
        ledger_date: documentDate,
        warehouse_id: warehouseId,
        activity_id: payload.activityId || null,
        item_id: item.id,
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
        activity_id: payload.activityId || null,
        item_id: item.id,
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

  if (documentType === "RETURN" && String(payload.status || "").trim().toLowerCase() === "settled") {
    const { error: activityError } = await supabase.from("activities").update({
      status: "Completed",
      settled_at: nowIso()
    }).eq("id", payload.activityId);
    if (activityError) throw activityError;
  }

  return { documentId: doc.document_code };
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

async function stockCurrent(supabase) {
  const { data: ledger, error } = await supabase.from("stock_ledger").select("warehouse_id,item_id,quantity_in,quantity_out,movement_type");
  if (error) throw error;
  const index = new Map();
  for (const row of ledger || []) {
    const key = `${row.warehouse_id || ""}|${row.item_id || ""}`;
    const prev = index.get(key) || { warehouseId: row.warehouse_id || "", bookId: row.item_id || "", quantity: 0 };
    prev.quantity += Number(row.quantity_in || 0) - Number(row.quantity_out || 0);
    index.set(key, prev);
  }
  const items = await listTable(supabase, "items", mapItem);
  const itemsById = Object.fromEntries(items.map((item) => [item.bookId, item]));
  return Array.from(index.values()).map((row) => ({
    warehouseId: row.warehouseId,
    bookId: itemsById[row.bookId]?.erpCode || row.bookId,
    quantity: row.quantity
  }));
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
  const docsById = Object.fromEntries((documents || []).map((row) => [row.id, row]));
  const index = new Map();
  for (const line of lines || []) {
    const doc = docsById[line.document_id];
    if (!doc || !doc.activity_id) continue;
    const type = doc.document_type;
    if (!["ISSUE", "RETURN", "SALE", "COMPLIMENTARY", "UNSETTLED_OPENING"].includes(type)) continue;
    const activity = activityById[doc.activity_id] || {};
    const item = itemById[line.item_id] || {};
    const key = `${doc.activity_id}|${line.item_id}`;
    const existing = index.get(key) || {
      devoteeId: activity.devotee_id || "",
      devoteeName: devoteeById[activity.devotee_id]?.devotee_name || "",
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
  const warehouseById = Object.fromEntries((warehouses || []).map((row) => [row.id, row]));
  const docsById = Object.fromEntries((documents || []).map((row) => [row.id, row]));
  const index = new Map();
  for (const line of lines || []) {
    const doc = docsById[line.document_id];
    if (!doc || !doc.activity_id) continue;
    const activity = activityById[doc.activity_id] || {};
    const item = itemById[line.item_id] || {};
    const key = `${doc.activity_id}|${line.item_id}`;
    const existing = index.get(key) || {
      devoteeId: activity.devotee_id || "",
      devoteeName: devoteeById[activity.devotee_id]?.devotee_name || "",
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
  const activity = (activities || []).find((row) => row.activity_code === activityId || (!activityId && row.devotee_id === devoteeId)) || null;
  if (!activity) {
    return { month, rows: [], documents: [], totals: {} };
  }
  const docs = (documents || []).filter((doc) => doc.activity_id === activity.id);
  const docsById = Object.fromEntries(docs.map((doc) => [doc.id, doc]));
  const itemById = Object.fromEntries((items || []).map((row) => [row.id, row]));
  const devoteeById = Object.fromEntries((devotees || []).map((row) => [row.id, row]));
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
      if (doc.document_type === "ISSUE" || doc.document_type === "UNSETTLED_OPENING") { existing.issueQty += qty; existing.unsettledQty += qty; docBucket.issueQty += qty; docBucket.unsettledQty += qty; }
      else if (doc.document_type === "RETURN") { existing.returnQty += qty; existing.unsettledQty -= qty; docBucket.returnQty += qty; docBucket.unsettledQty -= qty; }
      else if (doc.document_type === "SALE") { existing.saleQty += qty; existing.unsettledQty -= qty; docBucket.saleQty += qty; docBucket.unsettledQty -= qty; }
      else if (doc.document_type === "COMPLIMENTARY") { existing.complimentaryQty += qty; docBucket.complimentaryQty += qty; }
      existing.worth += qty * Number(item.sale_price || 0);
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
  return {
    month,
    devoteeId: activity.devotee_id || "",
    devoteeName: devoteeById[activity.devotee_id]?.devotee_name || "",
    activityId: activity.activity_code,
    activityName: activity.activity_name,
    activityStatus: activity.status,
    warehouseId: activity.warehouse_id || "",
    warehouseName: warehouseById[activity.warehouse_id]?.warehouse_name || "",
    documents: documentsArray,
    rows: rowsWithDocArray,
    totals: rowsWithDocArray.reduce((acc, row) => {
      acc.issueQty += Number(row.issueQty || 0);
      acc.returnQty += Number(row.returnQty || 0);
      acc.saleQty += Number(row.saleQty || 0);
      acc.complimentaryQty += Number(row.complimentaryQty || 0);
      acc.unsettledQty += Number(row.unsettledQty || 0);
      acc.worth += Number(row.worth || 0);
      return acc;
    }, { issueQty: 0, returnQty: 0, saleQty: 0, complimentaryQty: 0, unsettledQty: 0, worth: 0 })
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
  const { data: items } = await supabase.from("items").select("*");
  const { data: documents } = await supabase.from("documents").select("*").gte("document_date", `${month}-01`).lt("document_date", monthEnd(month));
  const { data: lines } = await supabase.from("document_lines").select("*");
  const itemsById = Object.fromEntries((items || []).map((row) => [row.id, row]));
  const warehousesById = Object.fromEntries((allWarehouses || []).map((row) => [row.id, row]));
  const startDocs = (documents || []).filter((doc) => doc.document_date && doc.document_date.slice(0, 7) === month);
  const index = new Map();
  const days = Array.from(new Set(startDocs.map((doc) => doc.document_date))).sort();
  const isMain = String(warehouse.warehouse_name || "").toLowerCase().startsWith("gmb");
  for (const doc of startDocs) {
    const docLines = (lines || []).filter((line) => line.document_id === doc.id);
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
        openingQty: 0,
        issueQty: 0,
        returnQty: 0,
        transferInQty: 0,
        transferOutQty: 0,
        saleQty: 0,
        complimentaryQty: 0,
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
        row.complimentaryQty += qty;
        row.closingQty -= qty;
      } else if (doc.document_type === "PURCHASE") {
        row.openingQty += qty;
        row.closingQty += qty;
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
    reportMode: String(warehouse.warehouse_name || "").toLowerCase().startsWith("gmb") ? "main" : "branch",
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
    const publicActions = new Set(["auth.login", "auth.logout", "auth.me"]);
    const currentUser = await requireCurrentUser(supabase, payload, publicActions.has(action));

    switch (action) {
      case "auth.login":
        return json(200, { ok: true, data: await authLogin(supabase, payload) });
      case "auth.logout":
        return json(200, { ok: true, data: await authLogout(supabase, payload) });
      case "auth.me":
        return json(200, { ok: true, data: currentUser });
      case "users.list":
        return json(200, { ok: true, data: await usersList(supabase) });
      case "users.create":
        return json(200, { ok: true, data: await createUser(supabase, payload) });
      case "users.update":
        return json(200, { ok: true, data: await updateUser(supabase, payload) });
      case "dashboard.summary":
        return json(200, { ok: true, data: await dashboardSummary(supabase) });
      case "books.list":
      case "books.adminList":
        return json(200, { ok: true, data: await booksList(supabase) });
      case "books.create":
        return json(200, { ok: true, data: await booksCreate(supabase, payload) });
      case "books.update":
        return json(200, { ok: true, data: await booksUpdate(supabase, payload) });
      case "books.delete":
        return json(200, { ok: true, data: await booksDelete(supabase, payload) });
      case "books.bulkUpsert":
        return json(200, { ok: true, data: await booksBulkUpsert(supabase, payload) });
      case "items.list":
        return json(200, { ok: true, data: await itemsList(supabase, payload) });
      case "items.create":
        return json(200, { ok: true, data: await itemsCreate(supabase, payload) });
      case "items.update":
        return json(200, { ok: true, data: await itemsUpdate(supabase, payload) });
      case "items.delete":
        return json(200, { ok: true, data: await itemsDelete(supabase, payload) });
      case "items.bulkUpsert":
        return json(200, { ok: true, data: await itemsBulkUpsert(supabase, payload) });
      case "devotionalItems.list":
        return json(200, { ok: true, data: await devotionalItemsList(supabase) });
      case "warehouses.list":
        return json(200, { ok: true, data: await warehousesList(supabase) });
      case "warehouses.create":
        return json(200, { ok: true, data: await createWarehouse(supabase, payload) });
      case "warehouses.update":
        return json(200, { ok: true, data: await updateWarehouse(supabase, payload) });
      case "warehouses.delete":
        return json(200, { ok: true, data: await deleteWarehouse(supabase, payload) });
      case "warehouses.bulkUpsert":
        return json(200, { ok: true, data: await warehousesBulkUpsert(supabase, payload) });
      case "devotees.list":
        return json(200, { ok: true, data: await devoteesList(supabase) });
      case "devotees.create":
        return json(200, { ok: true, data: await createDevotee(supabase, payload) });
      case "devotees.update":
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
      case "documents.create":
        return json(200, { ok: true, data: await createDocument(supabase, payload, currentUser) });
      case "documents.importUnsettledOpening":
        return json(200, { ok: true, data: await importUnsettledOpeningDocuments(supabase, payload, currentUser) });
      case "stock.current":
        return json(200, { ok: true, data: await stockCurrent(supabase) });
      case "activity.unsettled":
        return json(200, { ok: true, data: await getActivityUnsettled(supabase) });
      case "activity.complimentary":
        return json(200, { ok: true, data: await getActivityComplimentary(supabase) });
      case "reports.activityLedger":
        return json(200, { ok: true, data: await getActivityLedger(supabase, payload) });
      case "reports.activityMonthly":
        return json(200, { ok: true, data: await getActivityMonthlyReport(supabase, payload) });
      case "reports.warehouseMonthly":
        return json(200, { ok: true, data: await getWarehouseMonthlyReport(supabase, payload) });
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
