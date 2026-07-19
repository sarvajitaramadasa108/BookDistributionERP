(function () {
  const mobileSearch = document.getElementById("mobileSearch");
  const lookupButton = document.getElementById("lookupButton");
  const statusMessage = document.getElementById("statusMessage");
  const registrationForm = document.getElementById("registrationForm");
  const resultCard = document.getElementById("resultCard");
  const submitButton = document.getElementById("submitButton");
  const resetButton = document.getElementById("resetButton");
  const nameInput = document.getElementById("nameInput");
  const genderInput = document.getElementById("genderInput");
  const ageInput = document.getElementById("ageInput");
  const collegeInput = document.getElementById("collegeInput");
  const areaInput = document.getElementById("areaInput");

  const EVENT_TITLE = "Jagannatha Bahuda Ratha Yatra";
  const REPORT_TEXT = "Please report at the volunteer reception desk at Sri Vaibhava Venkateswara Swamy Temple, Madhavadhara on 24th July 2026 at 3:00 PM.";

  const state = {
    mobileNumber: "",
    lookup: null,
    mode: "idle",
    searching: false,
    saving: false
  };

  function normalizeMobile(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return "";
    return digits.length > 10 ? digits.slice(-10) : digits;
  }

  function setStatus(message, tone) {
    statusMessage.className = "vr-message" + (tone ? ` ${tone}` : "");
    statusMessage.textContent = message || "";
  }

  function setResult(html) {
    resultCard.innerHTML = html || "";
    resultCard.classList.toggle("hidden", !html);
  }

  function clearForm() {
    state.lookup = null;
    state.mode = "idle";
    state.mobileNumber = "";
    mobileSearch.value = "";
    registrationForm.classList.add("hidden");
    setStatus("");
    setResult("");
    nameInput.value = "";
    genderInput.value = "";
    ageInput.value = "";
    collegeInput.value = "";
    areaInput.value = "";
    mobileSearch.focus();
  }

  function fillFormFromVolunteer(volunteer) {
    nameInput.value = volunteer?.name || "";
    genderInput.value = volunteer?.gender || "";
    ageInput.value = volunteer?.age !== null && volunteer?.age !== undefined ? String(volunteer.age) : "";
    collegeInput.value = volunteer?.collegeWorking || "";
    areaInput.value = volunteer?.areaOfStay || "";
  }

  function renderMissingFields(missingFields) {
    const labels = {
      name: "Name",
      gender: "Gender",
      age: "Age",
      collegeWorking: "College / Working",
      areaOfStay: "Area of Stay"
    };
    if (!missingFields || !missingFields.length) return "";
    return `
      <div class="vr-result">
        <strong>Please complete your registration</strong>
        <div>Missing fields: ${missingFields.map((field) => labels[field] || field).join(", ")}</div>
      </div>
    `;
  }

  function renderLookupComplete(volunteer) {
    const serviceName = volunteer?.allocatedServiceName ? `<div><strong>Allocated Service:</strong> ${escapeHtml(volunteer.allocatedServiceName)}</div>` : "";
    setResult(`
      <div class="vr-result">
        <strong>You have already registered for the services.</strong>
        <div>${escapeHtml(REPORT_TEXT)}</div>
        ${serviceName}
      </div>
    `);
    registrationForm.classList.add("hidden");
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function lookupVolunteer() {
    const mobileNumber = normalizeMobile(mobileSearch.value);
    if (mobileNumber.length !== 10) {
      setStatus("Please enter a valid mobile number.", "warn");
      setResult("");
      registrationForm.classList.add("hidden");
      mobileSearch.focus();
      return;
    }

    state.searching = true;
    lookupButton.disabled = true;
    setStatus("Searching...", "");
    setResult("");
    registrationForm.classList.add("hidden");

    try {
      const lookup = await window.erpApi.request("volunteers.lookup", { mobileNumber });
      state.lookup = lookup;
      state.mobileNumber = mobileNumber;

      if (lookup.found && lookup.complete) {
        setStatus("Mobile number found.", "ok");
        renderLookupComplete(lookup.volunteer);
        return;
      }

      state.mode = "form";
      fillFormFromVolunteer(lookup.volunteer);
      registrationForm.classList.remove("hidden");
      if (lookup.found) {
        setStatus("Please complete your registration.", "warn");
        setResult(renderMissingFields(lookup.missingFields));
      } else {
        setStatus("Mobile number not found. Please register first.", "warn");
        setResult("");
      }
    } catch (error) {
      setStatus(error.message || "Could not search the mobile number.", "warn");
    } finally {
      state.searching = false;
      lookupButton.disabled = false;
    }
  }

  function validateForm() {
    const fields = {
      name: String(nameInput.value || "").trim(),
      gender: String(genderInput.value || "").trim(),
      age: String(ageInput.value || "").trim(),
      collegeWorking: String(collegeInput.value || "").trim(),
      areaOfStay: String(areaInput.value || "").trim()
    };
    const missing = [];
    if (!fields.name) missing.push("Name");
    if (!fields.gender) missing.push("Gender");
    if (!fields.age || Number.isNaN(Number(fields.age))) missing.push("Age");
    if (!fields.collegeWorking) missing.push("College / Working");
    if (!fields.areaOfStay) missing.push("Area of Stay");
    if (missing.length) {
      throw new Error(`Please fill: ${missing.join(", ")}`);
    }
    return fields;
  }

  async function submitRegistration(event) {
    event.preventDefault();
    if (!state.mobileNumber) {
      setStatus("Search a mobile number first.", "warn");
      return;
    }

    let fields;
    try {
      fields = validateForm();
    } catch (error) {
      setStatus(error.message || "Please complete the form.", "warn");
      return;
    }

    state.saving = true;
    submitButton.disabled = true;
    setStatus("Saving registration...", "");

    try {
      const result = await window.erpApi.request("volunteers.upsertRegistration", {
        mobileNumber: state.mobileNumber,
        name: fields.name,
        gender: fields.gender,
        age: Number(fields.age),
        collegeWorking: fields.collegeWorking,
        areaOfStay: fields.areaOfStay
      });

      state.lookup = result.volunteer;
      state.mode = "complete";
      registrationForm.classList.add("hidden");
      setStatus("Registration successful.", "ok");
      setResult(`
        <div class="vr-result">
          <strong>Thank you for registering for volunteer services.</strong>
          <div>${escapeHtml(REPORT_TEXT)}</div>
        </div>
      `);
    } catch (error) {
      setStatus(error.message || "Could not save the registration.", "warn");
      registrationForm.classList.remove("hidden");
    } finally {
      state.saving = false;
      submitButton.disabled = false;
    }
  }

  lookupButton.addEventListener("click", lookupVolunteer);
  resetButton.addEventListener("click", clearForm);
  registrationForm.addEventListener("submit", submitRegistration);
  mobileSearch.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      lookupVolunteer();
    }
  });

  mobileSearch.focus();
})();
