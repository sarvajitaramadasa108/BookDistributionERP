export const config = {
  runtime: "nodejs"
};

function json(statusCode, data) {
  return new Response(JSON.stringify(data), {
    status: statusCode,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
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

async function tryFetchImage(url) {
  const response = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0"
    }
  });
  if (!response.ok) return null;
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.startsWith("image/")) return null;
  return response;
}

export default async function handler(req) {
  const requestUrl = new URL(req.url);
  const raw = decodeUrl(requestUrl.searchParams.get("url"));
  if (!raw) {
    return json(400, { ok: false, error: "Missing url" });
  }

  const allowed = /drive\.google\.com|googleusercontent\.com/i.test(raw);
  if (!allowed) {
    return json(400, { ok: false, error: "Only Google Drive image URLs are allowed" });
  }

  for (const candidate of normalizeDriveCandidates(raw)) {
    try {
      const response = await tryFetchImage(candidate);
      if (!response) continue;
      const headers = new Headers();
      headers.set("Content-Type", response.headers.get("content-type") || "image/jpeg");
      headers.set("Cache-Control", "public, max-age=86400, s-maxage=86400");
      const buffer = await response.arrayBuffer();
      return new Response(buffer, { status: 200, headers });
    } catch {
      // Try the next candidate.
    }
  }

  return json(404, { ok: false, error: "Image not found" });
}
