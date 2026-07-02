function doGet() {
  return json_({
    ok: true,
    data: {
      app: "HKM Visakhapatnam Book Distribution ERP",
      status: "Backend is running"
    }
  });
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || "{}");
    const data = routeRequest_(request);
    return json_({ ok: true, data: data });
  } catch (error) {
    return json_({ ok: false, error: error.message || String(error) });
  }
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}

