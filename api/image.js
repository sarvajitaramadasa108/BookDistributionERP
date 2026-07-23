import { Buffer } from "node:buffer";

export const config = {
  runtime: "nodejs"
};

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}

function decodeUrl(value) {
  try {
    return decodeURIComponent(String(value || "").trim());
  } catch {
    return String(value || "").trim();
  }
}

function extractDriveId(raw) {
  const match = raw.match(/\/file\/d\/([^/]+)/i) || raw.match(/[?&]id=([^&]+)/i);
  return match ? match[1] : "";
}

function normalizeDriveCandidates(raw) {
  const fileId = extractDriveId(raw);
  const candidates = [];
  if (raw) candidates.push(raw);
  if (fileId) {
    candidates.push(`https://drive.google.com/uc?export=view&id=${fileId}`);
    candidates.push(`https://drive.google.com/thumbnail?id=${fileId}&sz=w1600`);
    candidates.push(`https://lh3.googleusercontent.com/d/${fileId}=w1600`);
  }
  return [...new Set(candidates)];
}

async function fetchImage(candidate) {
  const response = await fetch(candidate, {
    headers: {
      "User-Agent": "Mozilla/5.0",
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8"
    }
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;
  const buffer = Buffer.from(await response.arrayBuffer());
  return { buffer, contentType };
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `https://${req.headers.host || "localhost"}`);
    const raw = decodeUrl(url.searchParams.get("url"));
    if (!raw) {
      return sendJson(res, 400, { ok: false, error: "Missing url" });
    }
    if (!/drive\.google\.com|googleusercontent\.com/i.test(raw)) {
      return sendJson(res, 400, { ok: false, error: "Only Google Drive image URLs are allowed" });
    }

    for (const candidate of normalizeDriveCandidates(raw)) {
      try {
        const image = await fetchImage(candidate);
        if (!image) continue;
        res.statusCode = 200;
        res.setHeader("Content-Type", image.contentType);
        res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400");
        res.end(image.buffer);
        return;
      } catch {
        // Try the next candidate.
      }
    }

    return sendJson(res, 404, { ok: false, error: "Image not found" });
  } catch (error) {
    return sendJson(res, 500, { ok: false, error: error.message || "Server error" });
  }
}
