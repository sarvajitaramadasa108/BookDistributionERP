import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

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

async function readBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function getSessionUser(supabase, sessionToken) {
  if (!sessionToken) return null;
  const { data, error } = await supabase
    .from("user_sessions")
    .select("id,user_id,expires_at,revoked_at,users(id,name,username,role,active)")
    .eq("session_token_hash", tokenHash(sessionToken))
    .is("revoked_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (error || !data || !data.users) return null;
  return {
    userId: data.users.id,
    name: data.users.name,
    username: data.users.username,
    role: data.users.role,
    active: data.users.active
  };
}

function mapUser(row) {
  return {
    userId: row.id,
    name: row.name,
    username: row.username,
    role: row.role,
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapItem(row) {
  return {
    bookId: row.erp_code,
    erpCode: row.erp_code,
    name: row.item_name,
    bookType: row.item_type,
    category: row.item_type,
    salePrice: row.sale_price,
    mrp: row.sale_price,
    purchasePrice: row.purchase_price,
    distributorPrice: row.purchase_price,
    active: row.active
  };
}

async function authLogin(supabase, payload) {
  const username = String(payload.username || "").trim().toLowerCase();
  const password = String(payload.password || "");
  if (!username || !password) {
    throw new Error("Username and password are required");
  }
  const { data: user, error } = await supabase
    .from("users")
    .select("*")
    .ilike("username", username)
    .maybeSingle();
  if (error || !user || !user.active) {
    throw new Error("Invalid username or password");
  }
  if (user.password_hash !== sha256(password)) {
    throw new Error("Invalid username or password");
  }
  const sessionToken = createSessionToken();
  const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000).toISOString();
  const { error: sessionError } = await supabase.from("user_sessions").insert({
    user_id: user.id,
    session_token_hash: tokenHash(sessionToken),
    expires_at: expiresAt
  });
  if (sessionError) {
    throw sessionError;
  }
  return { sessionToken, user: mapUser(user) };
}

async function authLogout(supabase, payload) {
  if (!payload.sessionToken) return { ok: true };
  await supabase.from("user_sessions").update({ revoked_at: new Date().toISOString() }).eq("session_token_hash", tokenHash(payload.sessionToken));
  return { ok: true };
}

async function usersList(supabase) {
  const { data, error } = await supabase.from("users").select("*").order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(mapUser);
}

async function main(request) {
  if (request.method === "GET") {
    return json(200, { ok: true, data: { status: "Supabase API is running" } });
  }
  const body = await readBody(request);
  const action = body.action;
  const payload = body.payload || {};
  const supabase = getSupabase();
  const publicActions = new Set(["auth.login", "auth.logout", "system.setup", "auth.me"]);
  const currentUser = publicActions.has(action) ? null : await getSessionUser(supabase, payload.sessionToken);
  if (!publicActions.has(action) && !currentUser) {
    return json(401, { ok: false, error: "Please log in to continue" });
  }

  try {
    switch (action) {
      case "auth.login":
        return json(200, { ok: true, data: await authLogin(supabase, payload) });
      case "auth.logout":
        return json(200, { ok: true, data: await authLogout(supabase, payload) });
      case "auth.me":
        return json(200, { ok: true, data: currentUser });
      case "users.list":
        return json(200, { ok: true, data: await usersList(supabase) });
      case "books.list":
      case "books.adminList": {
        const { data, error } = await supabase.from("books").select("*").order("book_name", { ascending: true });
        if (error) throw error;
        return json(200, { ok: true, data: (data || []).map(mapItem) });
      }
      default:
        return json(400, { ok: false, error: `Unknown action: ${action}` });
    }
  } catch (error) {
    return json(500, { ok: false, error: error.message || "Server error" });
  }
}

export default main;
