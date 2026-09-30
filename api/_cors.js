// CORS for the separately hosted frontend. Set ALLOWED_ORIGINS to a comma-separated
// list (e.g. https://bdfrontend.vercel.app,https://books.example.org); "*" if unset.
const ALLOWED = String(process.env.ALLOWED_ORIGINS || "*")
  .split(",")
  .map((value) => value.trim().replace(/\/$/, ""))
  .filter(Boolean);

// Returns true when the request was a preflight and has been fully answered.
export function applyCors(req, res) {
  const origin = String(req.headers.origin || "").replace(/\/$/, "");
  if (ALLOWED.includes("*")) {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (origin && ALLOWED.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
  if (String(req.method || "").toUpperCase() === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }
  return false;
}
