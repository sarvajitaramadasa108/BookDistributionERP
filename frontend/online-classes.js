(function () {
  const root = document.getElementById("onlineClassesRoot");
  const overlay = document.getElementById("loadingOverlay");
  const toastStack = document.getElementById("toastStack");
  const params = new URLSearchParams(window.location.search);

  const state = {
    language: params.get("lang") === "te" || String(params.get("language") || "").toLowerCase() === "telugu" ? "Telugu" : "English",
    warehouses: [],
    books: [],
    selectedWarehouseId: "",
    warehouseSource: String(params.get("warehouse") || params.get("warehouseId") || params.get("utm_source") || "").trim(),
    utmSource: String(params.get("utm_source") || "").trim(),
    utmCampaign: String(params.get("utm_campaign") || "").trim(),
    bookSearch: "",
    selectedBookId: "",
    name: "",
    whatsappNumber: "",
    age: "",
    occupation: "",
    stayArea: "",
    interestedInClasses: "yes",
    submitting: false,
    submitted: false,
    successMessage: ""
  };

  const copy = {
    English: {
      title: "Online Bhagavad Gita Classes",
      subtitle: "Please submit your details to register for online Bhagavad Gita classes.",
      language: "Language",
      warehouse: "Warehouse",
      warehouseHint: "This link is tied to a warehouse source.",
      name: "Name",
      mobile: "WhatsApp Mobile Number",
      age: "Age",
      occupation: "Working / Student",
      stayArea: "Where do you stay?",
      book: "Which book have you taken?",
      bookHint: "Choose a book from this warehouse only.",
      bookSearch: "Search book name or ERP code",
      interest: "Are you interested in online Bhagavad Gita classes?",
      yes: "Yes",
      no: "No",
      submit: "Submit Registration",
      another: "Submit another response",
      successTitle: "Registration successful",
      successBody: "Thank you. Your details have been saved.",
      selectWarehouse: "Select a warehouse to view the available books.",
      noBooks: "No active books are available in this warehouse.",
      searchEmpty: "No matching books found.",
      loading: "Loading...",
      requiredWarehouse: "Warehouse is required",
      requiredBook: "Please choose a book",
      requiredName: "Name is required",
      requiredMobile: "WhatsApp number is required",
      requiredOccupation: "Working / Student is required",
      requiredArea: "Area of stay is required"
    },
    Telugu: {
      title: "ఆన్‌లైన్ భగవద్గీత తరగతులు",
      subtitle: "ఆన్‌లైన్ భగవద్గీత తరగతుల కోసం దయచేసి మీ వివరాలు పంపండి.",
      language: "భాష",
      warehouse: "గిడ్డంగి",
      warehouseHint: "ఈ లింక్ ఒక ప్రత్యేక గిడ్డంగికి సంబంధించినది.",
      name: "పేరు",
      mobile: "వాట్సాప్ మొబైల్ నంబర్",
      age: "వయసు",
      occupation: "పని / విద్యార్థి",
      stayArea: "ఎక్కడ ఉంటారు?",
      book: "మీరు తీసుకున్న పుస్తకం ఏది?",
      bookHint: "ఈ గిడ్డంగిలో ఉన్న పుస్తకాలను మాత్రమే ఎంచుకోండి.",
      bookSearch: "పుస్తకం పేరు లేదా ERP కోడ్ తో వెతకండి",
      interest: "ఆన్‌లైన్ భగవద్గీత తరగతులు కావాలా?",
      yes: "అవును",
      no: "కాదు",
      submit: "నమోదు పంపండి",
      another: "మరొక నమోదు చేయండి",
      successTitle: "నమోదు విజయవంతం",
      successBody: "ధన్యవాదాలు. మీ వివరాలు సేవ్ అయ్యాయి.",
      selectWarehouse: "అందుబాటులో ఉన్న పుస్తకాలను చూడడానికి గిడ్డంగిని ఎంచుకోండి.",
      noBooks: "ఈ గిడ్డంగిలో క్రియాశీల పుస్తకాలు లేవు.",
      searchEmpty: "సరిపోలిన పుస్తకాలు లభించలేదు.",
      loading: "లోడ్ అవుతోంది...",
      requiredWarehouse: "గిడ్డంగి అవసరం",
      requiredBook: "దయచేసి పుస్తకం ఎంచుకోండి",
      requiredName: "పేరు అవసరం",
      requiredMobile: "వాట్సాప్ నంబర్ అవసరం",
      requiredOccupation: "పని / విద్యార్థి సమాచారం అవసరం",
      requiredArea: "ఎక్కడ ఉంటారో పేర్కొనండి"
    }
  };

  function t() {
    return copy[state.language] || copy.English;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function escapeAttr(value) {
    return escapeHtml(value).replace(/`/g, "&#96;");
  }

  function normalizeText(value) {
    return String(value || "").trim().toLowerCase();
  }

  function normalizeWarehouseKey(value) {
    return normalizeText(value).replace(/[^a-z0-9]/g, "");
  }

  function setLoading(value) {
    overlay.classList.toggle("hidden", !value);
  }

  function showToast(message) {
    const item = document.createElement("div");
    item.className = "toast";
    item.textContent = message;
    toastStack.appendChild(item);
    setTimeout(() => {
      item.classList.add("hide");
      setTimeout(() => item.remove(), 220);
    }, 2200);
  }

  function rerenderPreservingFocus(inputId, renderFn) {
    const previous = document.getElementById(inputId);
    const start = previous && typeof previous.selectionStart === "number" ? previous.selectionStart : null;
    const end = previous && typeof previous.selectionEnd === "number" ? previous.selectionEnd : null;
    const value = previous ? previous.value : "";
    root.innerHTML = renderFn();
    const next = document.getElementById(inputId);
    if (next) {
      next.value = value;
      next.focus();
      if (start !== null && end !== null && typeof next.setSelectionRange === "function") {
        next.setSelectionRange(start, end);
      }
    }
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-IN", {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function getWarehouseDisplay(row) {
    return row ? (row.name || row.warehouseName || row.warehouseId || "-") : "-";
  }

  function getItemCode(book) {
    return String(book.erpCode || book.bookId || "").trim();
  }

  function getItemName(book) {
    return String(book.name || book.bookName || getItemCode(book) || "").trim();
  }

  function resolveInitialWarehouse() {
    if (!state.warehouseSource) return "";
    const raw = normalizeWarehouseKey(state.warehouseSource);
    const match = state.warehouses.find((warehouse) => {
      const candidates = [
        warehouse.warehouseId,
        warehouse.warehouseCode,
        warehouse.name,
        warehouse.warehouseName
      ].map(normalizeWarehouseKey);
      return candidates.includes(raw);
    });
    if (match) {
      return match.warehouseId;
    }
    return "";
  }

  function availableBooks() {
    const activeBooks = state.books
      .filter((book) => book && Number(book.active) !== 0 && book.active !== false)
      .sort((a, b) => getItemName(a).localeCompare(getItemName(b)) || getItemCode(a).localeCompare(getItemCode(b)));
    const query = normalizeText(state.bookSearch);
    return activeBooks
      .filter((book) => {
        const code = getItemCode(book);
        const name = getItemName(book);
        const qty = Number(book.availableQty || book.availableQuantity || book.stockQty || 0);
        if (!code) return false;
        if (qty <= 0) return false;
        if (!query) return true;
        return normalizeText(code).includes(query) || normalizeText(name).includes(query) || normalizeText(String(book.bookType || book.itemType || "")).includes(query);
      })
      .sort((a, b) => getItemName(a).localeCompare(getItemName(b)) || getItemCode(a).localeCompare(getItemCode(b)));
  }

  function selectedBook() {
    return state.books.find((book) => getItemCode(book) === state.selectedBookId) || null;
  }

  function setLanguage(language) {
    state.language = language === "Telugu" ? "Telugu" : "English";
    render();
  }

  function setWarehouse(value) {
    state.selectedWarehouseId = value;
    state.selectedBookId = "";
    state.bookSearch = "";
    render();
  }

  function setBookSearch(value) {
    state.bookSearch = value;
    state.selectedBookId = "";
    rerenderPreservingFocus("bookSearchInput", renderPage);
  }

  function chooseBook(bookId) {
    state.selectedBookId = bookId;
    const book = selectedBook();
    state.bookSearch = book ? getItemName(book) : "";
    render();
  }

  function clearBookSelection() {
    state.selectedBookId = "";
    state.bookSearch = "";
    render();
  }

  function resetForm() {
    state.name = "";
    state.whatsappNumber = "";
    state.age = "";
    state.occupation = "";
    state.stayArea = "";
    state.interestedInClasses = "yes";
    state.selectedBookId = "";
    state.bookSearch = "";
    state.submitted = false;
    state.successMessage = "";
    render();
  }

  function validateForm() {
    const copyText = t();
    if (!state.selectedWarehouseId) {
      throw new Error(copyText.requiredWarehouse);
    }
    if (!state.selectedBookId) {
      throw new Error(copyText.requiredBook);
    }
    if (!String(state.name || "").trim()) {
      throw new Error(copyText.requiredName);
    }
    const digits = String(state.whatsappNumber || "").replace(/\D/g, "");
    if (digits.length !== 10) {
      throw new Error(copyText.requiredMobile);
    }
    if (!String(state.occupation || "").trim()) {
      throw new Error(copyText.requiredOccupation);
    }
    if (!String(state.stayArea || "").trim()) {
      throw new Error(copyText.requiredArea);
    }
  }

  async function submitForm(event) {
    event.preventDefault();
    try {
      validateForm();
    } catch (error) {
      showToast(error.message || "Please fill all required fields");
      return;
    }

    const book = selectedBook();
    const warehouse = state.warehouses.find((row) => row.warehouseId === state.selectedWarehouseId);
    if (!book || !warehouse) {
      showToast("Selection is incomplete");
      return;
    }

    const payload = {
      language: state.language,
      sourceWarehouseId: warehouse.warehouseId,
      utmSource: state.utmSource || warehouse.warehouseId || warehouse.name || "",
      utmCampaign: state.utmCampaign || "",
      name: String(state.name || "").trim(),
      whatsappNumber: String(state.whatsappNumber || "").replace(/\D/g, ""),
      age: state.age ? Number(state.age) : "",
      occupation: String(state.occupation || "").trim(),
      stayArea: String(state.stayArea || "").trim(),
      itemId: getItemCode(book),
      interestedInClasses: state.interestedInClasses === "yes"
    };

    setLoading(true);
    state.submitting = true;
    try {
      const result = await window.erpApi.request("onlineClasses.submit", payload);
      state.submitted = true;
      state.successMessage = result && result.registrationId ? `Saved as ${result.registrationId}` : "Saved successfully";
      showToast(t().successTitle);
      render();
    } catch (error) {
      showToast(error.message || "Could not submit the form");
    } finally {
      state.submitting = false;
      setLoading(false);
    }
  }

  function renderLanguageSwitch() {
    return `
      <div class="segmented">
        <button class="segment ${state.language === "English" ? "active" : ""}" type="button" onclick="window.onlineClassesApp.setLanguage('English')">English</button>
        <button class="segment ${state.language === "Telugu" ? "active" : ""}" type="button" onclick="window.onlineClassesApp.setLanguage('Telugu')">తెలుగు</button>
      </div>
    `;
  }

  function renderWarehouseField() {
    return `<input type="hidden" name="warehouseId" value="${escapeAttr(state.selectedWarehouseId)}">`;
  }

  function renderBookPicker() {
    const copyText = t();
    const books = availableBooks();
    const selected = selectedBook();
    if (!state.selectedWarehouseId) {
      return `<div class="empty-note">${escapeHtml(copyText.selectWarehouse)}</div>`;
    }
    return `
      <div class="field">
        <span>${escapeHtml(copyText.book)}</span>
        <div class="picker-shell">
          <input
            id="bookSearchInput"
            type="search"
            value="${escapeAttr(state.bookSearch)}"
            placeholder="${escapeAttr(copyText.bookSearch)}"
            oninput="window.onlineClassesApp.setBookSearch(this.value)"
          >
          ${selected ? `
            <div class="selected-chip">
              <strong>${escapeHtml(getItemName(selected))}</strong>
              <button type="button" class="chip-clear" onclick="window.onlineClassesApp.clearBookSelection()">×</button>
            </div>
          ` : ""}
          <div class="picker-results">
            ${books.length ? books.slice(0, 12).map((book) => {
              const code = getItemCode(book);
              const name = getItemName(book);
              const active = state.selectedBookId === code;
              return `
                <button class="picker-option ${active ? "active" : ""}" type="button" onclick="window.onlineClassesApp.chooseBook('${escapeAttr(code)}')">
                  <span>${escapeHtml(name)}</span>
                </button>
              `;
            }).join("") : `<div class="empty-note">${escapeHtml(state.bookSearch ? copyText.searchEmpty : copyText.noBooks)}</div>`}
          </div>
        </div>
        <div class="hint">${escapeHtml(copyText.bookHint)}</div>
      </div>
    `;
  }

  function renderPage() {
    const copyText = t();
    if (state.submitted) {
      return `
        <section class="public-card success-card">
          <div class="success-badge">HKM</div>
          <h1>${escapeHtml(copyText.successTitle)}</h1>
          <p>${escapeHtml(copyText.successBody)}</p>
          <div class="success-meta">${escapeHtml(state.successMessage || "")}</div>
          <button class="button" type="button" onclick="window.onlineClassesApp.resetForm()">${escapeHtml(copyText.another)}</button>
        </section>
      `;
    }

    const warehouse = state.warehouses.find((row) => row.warehouseId === state.selectedWarehouseId);
    const available = state.selectedWarehouseId ? availableBooks() : [];
    return `
      <section class="public-shell">
        <header class="public-hero">
          <div class="public-brand">
            <div class="public-mark">HKM</div>
            <div>
              <div class="public-title">${escapeHtml(copyText.title)}</div>
              <div class="public-subtitle">${escapeHtml(copyText.subtitle)}</div>
            </div>
          </div>
          ${renderLanguageSwitch()}
        </header>

        <section class="public-card">
          <div class="public-card-header">
            <h2>${escapeHtml(copyText.language)}</h2>
            <div class="public-tag">${escapeHtml(state.language)}</div>
          </div>
          <form id="onlineClassesForm" class="public-form">
            ${renderWarehouseField()}

            <div class="grid-two">
              <label class="field">
                <span>${escapeHtml(copyText.name)}</span>
                <input name="name" type="text" value="${escapeAttr(state.name)}" placeholder="${escapeAttr(copyText.name)}" oninput="window.onlineClassesApp.setField('name', this.value)" required>
              </label>
              <label class="field">
                <span>${escapeHtml(copyText.mobile)}</span>
                <input name="whatsappNumber" type="tel" value="${escapeAttr(state.whatsappNumber)}" placeholder="10-digit number" oninput="window.onlineClassesApp.setField('whatsappNumber', this.value)" required>
              </label>
            </div>

            <div class="grid-three">
              <label class="field">
                <span>${escapeHtml(copyText.age)}</span>
                <input name="age" type="number" min="1" step="1" value="${escapeAttr(state.age)}" placeholder="${escapeAttr(copyText.age)}" oninput="window.onlineClassesApp.setField('age', this.value)">
              </label>
              <label class="field">
                <span>${escapeHtml(copyText.occupation)}</span>
                <select name="occupation" onchange="window.onlineClassesApp.setField('occupation', this.value)" required>
                  <option value="">Select</option>
                  <option value="Student" ${state.occupation === "Student" ? "selected" : ""}>Student / విద్యార్థి</option>
                  <option value="Working" ${state.occupation === "Working" ? "selected" : ""}>Working / ఉద్యోగం</option>
                </select>
              </label>
              <label class="field">
                <span>${escapeHtml(copyText.stayArea)}</span>
                <input name="stayArea" type="text" value="${escapeAttr(state.stayArea)}" placeholder="${escapeAttr(copyText.stayArea)}" oninput="window.onlineClassesApp.setField('stayArea', this.value)" required>
              </label>
            </div>

            ${renderBookPicker()}

            <div class="field">
              <span>${escapeHtml(copyText.interest)}</span>
              <div class="radio-row">
                <label><input type="radio" name="interestedInClasses" value="yes" ${state.interestedInClasses === "yes" ? "checked" : ""} onchange="window.onlineClassesApp.setInterest(this.value)"> ${escapeHtml(copyText.yes)}</label>
                <label><input type="radio" name="interestedInClasses" value="no" ${state.interestedInClasses === "no" ? "checked" : ""} onchange="window.onlineClassesApp.setInterest(this.value)"> ${escapeHtml(copyText.no)}</label>
              </div>
            </div>

            <div class="form-actions public-actions">
              <button class="button" type="submit" ${state.submitting ? "disabled" : ""}>${escapeHtml(copyText.submit)}</button>
            </div>
          </form>
        </section>
      </section>
    `;
  }

  function render() {
    root.innerHTML = renderPage();
    const form = document.getElementById("onlineClassesForm");
    if (form) {
      form.addEventListener("submit", submitForm);
    }
    document.title = t().title;
  }

  async function loadInitialData() {
    setLoading(true);
    try {
      const warehouses = await window.erpApi.request("warehouses.list");
      state.warehouses = Array.isArray(warehouses) ? warehouses.filter((row) => row.active !== false) : [];
      state.selectedWarehouseId = resolveInitialWarehouse() || state.warehouses[0]?.warehouseId || "";
      const books = await window.erpApi.request("onlineClasses.warehouseBooks", {
        sourceWarehouseId: state.selectedWarehouseId,
        warehouseId: state.selectedWarehouseId,
        warehouseCode: state.selectedWarehouseId,
        warehouseName: state.selectedWarehouseId
      });
      state.books = Array.isArray(books) ? books : [];
      render();
    } catch (error) {
      root.innerHTML = `
        <section class="public-card success-card">
          <h1>Could not load the form</h1>
          <p>${escapeHtml(error.message || "Something went wrong")}</p>
        </section>
      `;
      showToast(error.message || "Could not load data");
    } finally {
      setLoading(false);
    }
  }

  window.onlineClassesApp = {
    setLanguage,
    setWarehouse,
    setBookSearch,
    chooseBook,
    clearBookSelection,
    setField(field, value) {
      state[field] = value;
      if (field === "whatsappNumber") {
        state[field] = String(value || "").replace(/\D/g, "").slice(0, 10);
        const input = document.querySelector('input[name="whatsappNumber"]');
        if (input) input.value = state[field];
      }
    },
    setInterest(value) {
      state.interestedInClasses = value === "no" ? "no" : "yes";
      render();
    },
    resetForm,
    render
  };

  loadInitialData();
})();
