const root = document.documentElement;
const themeBtn = document.querySelector("[data-theme-toggle]");
const rtlBtn = document.querySelector("[data-rtl-toggle]");
const menuBtn = document.querySelector("[data-menu-toggle]");
const mobileMenu = document.querySelector(".mobile-menu");

const savedTheme = localStorage.getItem("vitacheck-theme");
if (savedTheme) {
  root.dataset.theme = savedTheme;
} else if (matchMedia("(prefers-color-scheme: dark)").matches) {
  root.dataset.theme = "dark";
}

function refreshIcons() {
  if (themeBtn) {
    themeBtn.innerHTML =
      root.dataset.theme === "dark"
        ? '<i class="bi bi-sun"></i>'
        : '<i class="bi bi-moon-stars"></i>';
  }
  if (rtlBtn) {
    rtlBtn.textContent = root.dir === "rtl" ? "LTR" : "RTL";
  }
}
refreshIcons();

themeBtn?.addEventListener("click", () => {
  root.classList.add("vc-toggle-switching");
  root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
  localStorage.setItem("vitacheck-theme", root.dataset.theme);
  refreshIcons();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("vc-toggle-switching")));
});

rtlBtn?.addEventListener("click", () => {
  root.classList.add("vc-toggle-switching");
  root.dir = root.dir === "rtl" ? "ltr" : "rtl";
  localStorage.setItem("vitacheck-dir", root.dir);
  refreshIcons();
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("vc-toggle-switching")));
});

const savedDir = localStorage.getItem("vitacheck-dir");
if (savedDir) {
  root.dir = savedDir;
  refreshIcons();
}

menuBtn?.addEventListener("click", () => {
  const open = mobileMenu.style.display === "grid";
  mobileMenu.style.display = open ? "none" : "grid";
  menuBtn.setAttribute("aria-expanded", String(!open));
  if (menuBtn) {
    menuBtn.innerHTML = open
      ? '<i class="bi bi-list"></i>'
      : '<i class="bi bi-x-lg"></i>';
  }
});

mobileMenu?.querySelectorAll("a").forEach((link) => {
  link.addEventListener("click", () => {
    mobileMenu.style.display = "none";
    menuBtn?.setAttribute("aria-expanded", "false");
    if (menuBtn) menuBtn.innerHTML = '<i class="bi bi-list"></i>';
  });
});

const reveal = new IntersectionObserver(
  (entries) =>
    entries.forEach((e) => {
      if (e.isIntersecting) e.target.classList.add("visible");
    }),
  { threshold: 0.12 },
);
document.querySelectorAll(".reveal").forEach((el) => reveal.observe(el));


// Tests catalogue: real text + category search and filter behavior.
const testSearch = document.querySelector("#test-search");
const testCategory = document.querySelector("#test-category");
const testSearchBtn = document.querySelector("#test-search-btn");
const testStatus = document.querySelector("#test-results-status");
const testCards = Array.from(document.querySelectorAll(".test-product-card"));

function applyTestFilters() {
  if (!testCards.length) return;
  const query = (testSearch?.value || "").trim().toLowerCase();
  const category = testCategory?.value || "all";
  let visible = 0;
  testCards.forEach((card) => {
    const text = card.textContent.toLowerCase();
    const matchesText = !query || text.includes(query);
    const matchesCategory = category === "all" || card.dataset.category === category;
    const show = matchesText && matchesCategory;
    card.hidden = !show;
    if (show) visible += 1;
  });
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.filter === category);
  });
  if (testStatus) {
    testStatus.textContent = visible
      ? `Showing ${visible} test${visible === 1 ? "" : "s"}${query ? ` matching “${query}”` : ""}.`
      : "No tests match those filters. Try another test name or category.";
  }
}

testSearch?.addEventListener("input", applyTestFilters);
testCategory?.addEventListener("change", applyTestFilters);
testSearchBtn?.addEventListener("click", applyTestFilters);

// Keep the existing filter chips connected to the search controls.
document.querySelectorAll("[data-filter]").forEach((btn) => {
  btn.addEventListener("click", () => {
    if (testCategory) testCategory.value = btn.dataset.filter;
    applyTestFilters();
  });
});

// Test-specific detail content. The page stays reusable while each test has its own information.
const testCatalog = {
  cbc: { title: "Complete Blood Count (CBC)", heading: "Complete Blood Count", sample: "Blood", prep: "No fasting", turnaround: "6–12 hours", price: "₹399", description: "Measures key red-cell, white-cell and platelet markers commonly used for routine health assessment." },
  lipid: { title: "Lipid Profile", heading: "Lipid Profile", sample: "Blood", prep: "9–12 hour fast", turnaround: "12 hours", price: "₹649", description: "Measures cholesterol and triglyceride markers used to understand cardiovascular risk factors." },
  hba1c: { title: "HbA1c", heading: "HbA1c", sample: "Blood", prep: "No fasting", turnaround: "12 hours", price: "₹549", description: "Estimates average blood glucose over the previous two to three months and is commonly used for diabetes monitoring." },
  thyroid: { title: "Thyroid Profile", heading: "Thyroid Profile", sample: "Blood", prep: "Usually no fasting", turnaround: "12–18 hours", price: "₹699", description: "Checks common thyroid markers to support evaluation and routine monitoring of thyroid function." },
  liver: { title: "Liver Function Test", heading: "Liver Function", sample: "Blood", prep: "Follow clinician guidance", turnaround: "12 hours", price: "₹749", description: "Measures a group of liver-related markers that can help clinicians assess liver function and monitor known conditions." },
  "heart-risk": { title: "Heart Risk Panel", heading: "Heart Risk Panel", sample: "Blood", prep: "9–12 hour fast", turnaround: "18 hours", price: "₹1,299", description: "Combines commonly used lipid and cardiovascular markers to support a broader heart-health assessment." }
};
const detailKey = new URLSearchParams(window.location.search).get("test") || "cbc";
const detail = testCatalog[detailKey];
if (detail && document.querySelector("#test-detail-title")) {
  document.querySelector("#test-detail-title").textContent = detail.title;
  document.querySelector("#test-detail-heading").textContent = detail.heading;
  document.querySelector("#test-detail-sample").textContent = detail.sample;
  document.querySelector("#test-detail-prep").textContent = detail.prep;
  document.querySelector("#test-detail-turnaround").textContent = detail.turnaround;
  document.querySelector("#test-detail-price").textContent = detail.price;
  const lead = document.querySelector(".page-hero .lead");
  if (lead) lead.textContent = `${detail.description} Review preparation, collection and report timing before booking.`;
  const book = document.querySelector("#test-detail-book");
  if (book) book.href = `home-collection.html?test=${encodeURIComponent(detailKey)}`;
}


// Authenticated patient access.
const authForm = document.querySelector('[data-auth-form]');
if (authForm) {
  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = authForm.querySelector('[data-form-message]');
    const submit = authForm.querySelector('button[type="submit"],button');
    if (submit) { submit.disabled = true; submit.dataset.originalText = submit.textContent; submit.textContent = 'Please wait…'; }
    try {
      const payload = Object.fromEntries(new FormData(authForm).entries());
      const endpoint = authForm.dataset.authForm === 'register' ? '/api/auth/register' : '/api/auth/login';
      const response = await fetch(endpoint, {method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(payload)});
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Authentication failed.');
      if (msg) msg.textContent = authForm.dataset.authForm === 'register' ? 'Account created. You can now sign in.' : 'Signed in successfully.';
      if (authForm.dataset.authForm === 'login') window.location.href = data.user?.role === 'admin' ? 'admin-dashboard.html' : 'patient-dashboard.html';
      else setTimeout(() => { window.location.href = 'login.html'; }, 500);
    } catch (err) { if (msg) msg.textContent = err.message; }
    finally { if (submit) { submit.disabled = false; submit.textContent = submit.dataset.originalText || 'Continue'; } }
  });
}

// Server-backed home collection booking flow.
const bookingForm = document.querySelector("[data-booking-form]");
if (bookingForm) {
  const params = new URLSearchParams(window.location.search);
  const bookingTest = params.get("test");
  const bookingSelect = bookingForm.querySelector("[name='test']");
  if (bookingTest && bookingSelect && [...bookingSelect.options].some((o) => o.value === bookingTest)) bookingSelect.value = bookingTest;
  const dateInput = bookingForm.querySelector("[name='date']");
  if (dateInput) {
    const today = new Date();
    dateInput.min = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0,10);
  }
  bookingForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const required = [...bookingForm.querySelectorAll("[required]")];
    const message = bookingForm.querySelector("[data-booking-message]");
    const valid = required.every((input) => input.value.trim());
    if (!valid) { if (message) message.textContent = "Please complete all required booking details."; return; }
    const submit = bookingForm.querySelector("[type='submit']");
    if (submit) { submit.disabled = true; submit.dataset.originalText = submit.textContent; submit.textContent = "Submitting…"; }
    try {
      const response = await fetch("/api/bookings", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(Object.fromEntries(new FormData(bookingForm).entries())) });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || "Booking could not be submitted.");
      const data = result.booking;
      if (message) message.innerHTML = `<strong>Booking request received: ${data.reference}</strong><br>We have your ${String(data.test).replace(/-/g," ")} request for ${data.date} at ${data.time}. Our team can now process the appointment from the booking queue.`;
      bookingForm.reset();
      if (bookingTest && bookingSelect) bookingSelect.value = bookingTest;
      window.dispatchEvent(new CustomEvent("vitacheck:booking-created", { detail:data }));
    } catch (err) {
      if (message) message.textContent = "The booking service is currently unavailable. Please start the VitaCheck server with `npm start` and try again.";
    } finally {
      if (submit) { submit.disabled = false; submit.textContent = submit.dataset.originalText || "Submit"; }
    }
  });
}

document.querySelectorAll("[data-form]").forEach((form) => {
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let ok = true;
    form.querySelectorAll("[required]").forEach((input) => {
      const err = input.closest(".field")?.querySelector(".error");
      if (!input.value.trim()) {
        ok = false;
        if (err) err.textContent = "Please complete this field.";
      } else if (err) {
        err.textContent = "";
      }
    });
    if (ok) {
      const msg = form.querySelector("[data-form-message]");
      if (msg)
        msg.textContent =
          "Thanks — your enquiry has been received. Our team will contact you shortly.";
    }
  });
});

// Service-specific detail pages.
const serviceCatalog = {
  biochemistry: { title:"Biochemistry Testing", heading:"Biochemistry", type:"Laboratory diagnostics", sample:"Blood / urine", booking:"Individual test", next:"Choose a test", description:"Measures glucose, HbA1c, kidney, liver and other metabolic markers according to the selected panel." },
  hematology: { title:"Hematology Testing", heading:"Hematology", type:"Blood diagnostics", sample:"Blood", booking:"Individual test", next:"Choose a test", description:"Covers blood counts and related markers used for routine screening and clinical monitoring." },
  serology: { title:"Serology Testing", heading:"Serology", type:"Targeted diagnostics", sample:"Blood", booking:"Test-specific", next:"Review preparation", description:"Supports targeted testing for selected conditions with clear sample and reporting guidance." },
  hormone: { title:"Hormone Testing", heading:"Hormone Testing", type:"Specialized diagnostics", sample:"Blood", booking:"Test-specific", next:"Choose a test", description:"Measures selected hormone markers with preparation guidance tailored to the test ordered." },
  pathology: { title:"Pathology Services", heading:"Pathology", type:"Diagnostic evaluation", sample:"Test-specific", booking:"Consult team", next:"Discuss requirement", description:"Provides diagnostic evaluation with clear specimen requirements and organized reporting." },
  electrolytes: { title:"Electrolyte Testing", heading:"Electrolytes", type:"Blood diagnostics", sample:"Blood", booking:"Individual test", next:"Choose a test", description:"Measures key electrolyte and fluid-balance markers to support routine assessment." },
  ecg: { title:"ECG Screening", heading:"ECG", type:"Cardiac screening", sample:"Non-blood test", booking:"Appointment", next:"Book screening", description:"Records the heart's electrical activity during a guided ECG appointment." },
  eeg: { title:"EEG Testing", heading:"EEG", type:"Neurological testing", sample:"Non-blood test", booking:"Appointment", next:"Book screening", description:"Records brain electrical activity during a guided EEG appointment with preparation instructions." }
};
const serviceKey = new URLSearchParams(window.location.search).get("service");
const service = serviceCatalog[serviceKey];
if (service && document.querySelector("#service-detail-title")) {
  document.querySelector("#service-detail-title").textContent = service.title;
  document.querySelector("#service-detail-heading").textContent = service.heading;
  document.querySelector("#service-detail-type").textContent = service.type;
  document.querySelector("#service-detail-sample").textContent = service.sample;
  document.querySelector("#service-detail-booking").textContent = service.booking;
  document.querySelector("#service-detail-next").textContent = service.next;
  const heroLead = document.querySelector(".page-hero .lead");
  if (heroLead) heroLead.textContent = service.description;
  const cta = document.querySelector("#service-detail-cta");
  if (cta) cta.href = serviceKey === "ecg" || serviceKey === "eeg" ? "contact.html" : "tests.html";
}


// Dashboard counters respond to booking activity stored by the booking flow.
if (document.body.classList.contains("page-patientdash")) {
  const count = storedBookings.length;
  const upcoming = document.querySelector("#patient-upcoming");
  const active = document.querySelector("#patient-active");
  if (upcoming) upcoming.textContent = String(count);
  if (active) active.textContent = String(count);
  document.querySelectorAll(".metric .status").forEach((el) => { el.textContent = count ? `${count} local booking${count === 1 ? "" : "s"}` : "No local bookings yet"; });
}
if (document.body.classList.contains("page-admindash")) {
  const count = storedBookings.length;
  const bookings = document.querySelector("#admin-bookings");
  const tests = document.querySelector("#admin-tests");
  const pending = document.querySelector("#admin-pending");
  const revenue = document.querySelector("#admin-revenue");
  if (bookings) bookings.textContent = String(1284 + count);
  if (tests) tests.textContent = String(186 + count);
  if (pending) pending.textContent = String(Math.max(0, 43 - Math.min(count, 20)));
  if (revenue) revenue.textContent = `₹${(2.8 + count * 0.004).toFixed(2)}L`;
}
