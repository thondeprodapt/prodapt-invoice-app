const storageKey = "prodapt.invoice.studio.v1";

if (["http:", "https:"].includes(window.location.protocol) && window.location.pathname.endsWith("/index.html")) {
  const cleanPath = window.location.pathname.replace(/index\.html$/, "");
  window.history.replaceState(null, "", `${cleanPath}${window.location.search}${window.location.hash}`);
}

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const moneyValue = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clone = (value) => JSON.parse(JSON.stringify(value));

const starterData = {
  settings: {
    businessName: "PRODAPT SOLUTIONS (PVT) LTD",
    businessAddress: "4 Munro Close\nCranborne Park\nHarare, Harare\nZimbabwe",
    businessPhone: "Phone: +263775412610\nMobile: +263715273544",
    businessEmail: "info@prodaptsolution.co.zw",
    businessCurrency: "$",
    businessTax: 15,
    businessTin: "2000887028",
    businessPayment: "Bank: NMB\nBranch: Avondel\nAccount Name: Prodapt Solutions\nAccount No.: 0000231469206\nAccount currency: USD Nostro",
    logoData: ""
  },
  customers: [
    {
      id: uid(),
      name: "Sample Customer",
      company: "Customer Company",
      phone: "+263",
      email: "customer@example.com",
      address: "Customer address"
    }
  ],
  items: [],
  documents: [],
  currentDocumentId: null,
  migrations: {}
};

let state = loadState();
applyBusinessDetailsMigration();
applyImportedCustomersMigration();
applyWaveItemsMigration();
let draft = emptyDocument();

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey));
    if (saved && saved.settings) return normalizeState(saved);
  } catch (error) {
    console.warn("Could not load saved data", error);
  }
  return clone(starterData);
}

function normalizeState(saved) {
  return {
    ...clone(starterData),
    ...saved,
    settings: {
      ...clone(starterData.settings),
      ...saved.settings
    },
    customers: Array.isArray(saved.customers) ? saved.customers : [],
    items: Array.isArray(saved.items) ? saved.items : [],
    documents: Array.isArray(saved.documents) ? saved.documents : [],
    migrations: saved.migrations || {}
  };
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
}

function applyBusinessDetailsMigration() {
  const genericNames = ["PRODAPT", "PRODAPT SOLUTION"];
  let changed = false;

  if (genericNames.includes(String(state.settings.businessName || "").trim().toUpperCase())) {
    state.settings.businessName = starterData.settings.businessName;
    changed = true;
  }
  if (["Your business address", ""].includes(String(state.settings.businessAddress || "").trim())) {
    state.settings.businessAddress = starterData.settings.businessAddress;
    changed = true;
  }
  if (["info@prodapt.com", ""].includes(String(state.settings.businessEmail || "").trim())) {
    state.settings.businessEmail = starterData.settings.businessEmail;
    changed = true;
  }
  if (["+263", ""].includes(String(state.settings.businessPhone || "").trim())) {
    state.settings.businessPhone = starterData.settings.businessPhone;
    changed = true;
  }
  if (["Banking or payment details", ""].includes(String(state.settings.businessPayment || "").trim())) {
    state.settings.businessPayment = starterData.settings.businessPayment;
    changed = true;
  }
  if (!state.settings.businessTin) {
    state.settings.businessTin = starterData.settings.businessTin;
    changed = true;
  }
  if (changed) saveState();
}

function customerContactKey(customer) {
  return [
    String(customer.name || "").trim().toLowerCase(),
    String(customer.email || "").trim().toLowerCase(),
    String(customer.phone || "").trim().toLowerCase()
  ].join("|");
}

function customerSourceKey(customer) {
  return String(customer.sourceId || customer.importedSourceId || "").trim();
}

function isStarterCustomer(customer) {
  return customer?.name === "Sample Customer" && customer?.email === "customer@example.com";
}

function applyImportedCustomersMigration() {
  const importedCustomers = Array.isArray(window.PRODAPT_IMPORTED_CUSTOMERS) ? window.PRODAPT_IMPORTED_CUSTOMERS : [];
  if (!importedCustomers.length) return;

  const migrationWasRecorded = Boolean(state.migrations?.customers20260902);
  let changed = false;
  if (state.customers.length === 1 && isStarterCustomer(state.customers[0])) {
    state.customers = [];
    changed = true;
  }

  const existingBySource = new Map();
  const existingByContact = new Map();
  state.customers.forEach((customer) => {
    const sourceKey = customerSourceKey(customer);
    const contactKey = customerContactKey(customer);
    if (sourceKey) existingBySource.set(sourceKey, customer);
    if (contactKey !== "||" && !existingByContact.has(contactKey)) existingByContact.set(contactKey, customer);
  });

  importedCustomers.forEach((customer) => {
    const sourceId = customerSourceKey(customer);
    const contactKey = customerContactKey(customer);
    const existing = sourceId ? existingBySource.get(sourceId) : existingByContact.get(contactKey);

    if (existing) {
      if (sourceId && !customerSourceKey(existing)) {
        existing.sourceId = sourceId;
        changed = true;
      }
      ["company", "phone", "email", "address"].forEach((field) => {
        if (!existing[field] && customer[field]) {
          existing[field] = customer[field];
          changed = true;
        }
      });
      return;
    }

    const imported = {
      id: uid(),
      sourceId,
      name: customer.name,
      company: customer.company || "",
      phone: customer.phone || "",
      email: customer.email || "",
      address: customer.address || "",
      balance: moneyValue(customer.balance),
      overdue: moneyValue(customer.overdue),
      createdAt: customer.createdAt || ""
    };
    state.customers.push(imported);
    if (sourceId) existingBySource.set(sourceId, imported);
    if (contactKey !== "||") existingByContact.set(contactKey, imported);
    changed = true;
  });

  state.migrations = { ...(state.migrations || {}), customers20260902: true };
  if (changed || !migrationWasRecorded) saveState();
}

function itemIdentity(item) {
  return [
    String(item.name || "").trim().toLowerCase(),
    String(item.description || "").trim().toLowerCase(),
    moneyValue(item.price).toFixed(2)
  ].join("|");
}

function itemCatalogKey(item) {
  return [
    String(item.name || "").trim().toLowerCase(),
    String(item.description || "").trim().toLowerCase()
  ].join("|");
}

function applyWaveItemsMigration() {
  const waveItems = Array.isArray(window.PRODAPT_WAVE_ITEMS) ? window.PRODAPT_WAVE_ITEMS : [];
  if (!waveItems.length) return;

  const existing = new Set(state.items.map(itemIdentity));
  const existingByCatalogKey = new Map();
  state.items.forEach((item) => {
    const key = itemCatalogKey(item);
    if (key !== "|" && !existingByCatalogKey.has(key)) {
      existingByCatalogKey.set(key, item);
    }
  });

  let changed = false;
  const imported = [];
  waveItems.forEach((item) => {
    if (!item.name) return;

    const price = moneyValue(item.price);
    const cost = moneyValue(item.cost);
    const catalogKey = itemCatalogKey(item);
    const savedItem = existingByCatalogKey.get(catalogKey);
    if (savedItem && (moneyValue(savedItem.price) !== price || moneyValue(savedItem.cost) !== cost)) {
      savedItem.price = price;
      savedItem.cost = cost;
      changed = true;
    }
    if (savedItem) return;

    if (existing.has(itemIdentity(item))) return;
    imported.push({
      id: uid(),
      name: item.name,
      description: item.description || "",
      price,
      cost
    });
  });

  if (imported.length) {
    state.items.push(...imported);
    changed = true;
  }
  state.migrations = { ...(state.migrations || {}), waveItems20260629: true };
  if (changed || !state.migrations.waveItemsWithPrices20260630) {
    state.migrations.waveItemsWithPrices20260630 = true;
    saveState();
  }
}

function emptyDocument(type = "quote") {
  return {
    id: null,
    type,
    number: "",
    date: today(),
    customerId: state?.customers?.[0]?.id || "",
    lines: [{ itemId: state?.items?.[0]?.id || "", quantity: 1, price: state?.items?.[0]?.price || 0 }],
    discount: 0,
    discountType: "percent",
    tax: state?.settings?.businessTax || 0,
    status: "draft",
    notes: ""
  };
}

function formatMoney(value) {
  return `${state.settings.businessCurrency || "$"}${moneyValue(value).toFixed(2)}`;
}

function currencyLabel() {
  const currency = String(state.settings.businessCurrency || "$").trim();
  return currency === "$" ? "USD" : currency.toUpperCase();
}

function documentLabel(type) {
  const labels = {
    invoice: "Invoice",
    quote: "Quotation",
    receipt: "Receipt"
  };
  return labels[type] || "Document";
}

function documentPrefix(type) {
  const prefixes = {
    invoice: "INV",
    quote: "QT",
    receipt: "RCT"
  };
  return prefixes[type] || "DOC";
}

function lineBreaks(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && inQuotes && next === '"') {
      value += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
    } else if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value.trim());
      if (row.some((cell) => cell !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }

  row.push(value.trim());
  if (row.some((cell) => cell !== "")) rows.push(row);
  return rows;
}

function firstMatchingValue(record, names) {
  for (const name of names) {
    if (record[name] !== undefined && record[name] !== "") return record[name];
  }
  return "";
}

function importItemsFromCsv(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return 0;

  const headers = rows[0].map(normalizeHeader);
  const imported = rows.slice(1).map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = row[index] || "";
    });
    const fallbackName = row[0] || "";
    const fallbackDescription = row[1] || "";
    const fallbackPrice = row[2] || 0;
    const fallbackCost = row[3] || 0;

    return {
      id: uid(),
      name: firstMatchingValue(record, ["name", "item", "itemname", "product", "productname", "servicename"]) || fallbackName,
      description: firstMatchingValue(record, ["description", "details", "notes", "salesdescription"]) || fallbackDescription,
      price: moneyValue(firstMatchingValue(record, ["price", "rate", "unitprice", "sellingprice", "salesprice", "amount"]) || fallbackPrice),
      cost: moneyValue(firstMatchingValue(record, ["cost", "costprice", "purchaseprice", "expense"]) || fallbackCost)
    };
  }).filter((item) => item.name);

  state.items.push(...imported);
  saveState();
  renderAll();
  return imported.length;
}

function getCustomer(id) {
  return state.customers.find((customer) => customer.id === id) || state.customers[0] || null;
}

function getItem(id) {
  return state.items.find((item) => item.id === id) || null;
}

function itemOptionLabel(item) {
  if (!item) return "Item";
  return item.description ? `${item.name} - ${item.description}` : item.name;
}

function nextDocumentNumber(type) {
  const prefix = documentPrefix(type);
  const year = new Date().getFullYear();
  const count = state.documents.filter((document) => document.type === type).length + 1;
  return `${prefix}-${year}-${String(count).padStart(4, "0")}`;
}

function calculate(document) {
  const lines = document.lines.map((line) => {
    const item = getItem(line.itemId);
    const quantity = moneyValue(line.quantity);
    const price = moneyValue(line.price || item?.price);
    const cost = moneyValue(item?.cost);
    return {
      item,
      quantity,
      price,
      cost,
      total: quantity * price,
      profit: quantity * (price - cost)
    };
  });

  const subtotal = lines.reduce((sum, line) => sum + line.total, 0);
  const rawProfit = lines.reduce((sum, line) => sum + line.profit, 0);
  const discount = document.discountType === "percent"
    ? subtotal * (moneyValue(document.discount) / 100)
    : moneyValue(document.discount);
  const safeDiscount = Math.min(discount, subtotal);
  const taxable = Math.max(subtotal - safeDiscount, 0);
  const tax = taxable * (moneyValue(document.tax) / 100);
  const total = taxable + tax;
  const profit = rawProfit - safeDiscount;

  return { lines, subtotal, discount: safeDiscount, taxable, tax, total, profit };
}

function switchView(view) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.view === view);
  });
  document.querySelectorAll(".view").forEach((section) => {
    section.classList.toggle("active", section.id === `${view}View`);
  });
}

function fillSelects() {
  const customerSelect = document.querySelector("#docCustomer");
  customerSelect.innerHTML = state.customers
    .map((customer) => `<option value="${customer.id}">${escapeHtml(customer.name)}</option>`)
    .join("");
}

function renderLineItems() {
  const lineItems = document.querySelector("#lineItems");
  lineItems.innerHTML = draft.lines.map((line, index) => {
    const selectedItem = getItem(line.itemId);
    const itemOptions = state.items.map((item) => {
      const selected = item.id === line.itemId ? "selected" : "";
      return `<option value="${item.id}" ${selected}>${escapeHtml(itemOptionLabel(item))}</option>`;
    }).join("");
    return `
      <div class="line-card" data-index="${index}">
        <div class="line-item-field">
          <label>Item
            <select class="line-item">${itemOptions}</select>
          </label>
          <p class="line-description">${escapeHtml(selectedItem?.description || "No description saved for this item")}</p>
        </div>
        <label>Qty
          <input class="line-qty" type="number" min="0" step="0.01" value="${line.quantity}">
        </label>
        <label>Price
          <input class="line-price" type="number" min="0" step="0.01" value="${line.price}">
        </label>
        <button type="button" class="danger-button remove-line" title="Remove line" aria-label="Remove line">X</button>
      </div>
    `;
  }).join("");
}

function renderDocumentForm() {
  fillSelects();
  document.querySelector("#docType").value = draft.type;
  document.querySelector("#docDate").value = draft.date;
  document.querySelector("#docCustomer").value = draft.customerId;
  document.querySelector("#docDiscount").value = draft.discount;
  document.querySelector("#docDiscountType").value = draft.discountType;
  document.querySelector("#docTax").value = draft.tax;
  document.querySelector("#docStatus").value = draft.status;
  document.querySelector("#docNotes").value = draft.notes;
  renderLineItems();
  renderTotals();
}

function renderTotals() {
  const totals = calculate(draft);
  document.querySelector("#totalSubtotal").textContent = formatMoney(totals.subtotal);
  document.querySelector("#totalDiscount").textContent = formatMoney(totals.discount);
  document.querySelector("#totalTax").textContent = formatMoney(totals.tax);
  document.querySelector("#totalGrand").textContent = formatMoney(totals.total);
  document.querySelector("#totalProfit").textContent = formatMoney(totals.profit);
  renderPrintPage(draft);
}

function renderDashboard() {
  const invoiceDocs = state.documents.filter((document) => document.type === "invoice");
  const quoteDocs = state.documents.filter((document) => document.type === "quote");
  const invoiceTotals = invoiceDocs.map(calculate);
  const sales = invoiceTotals.reduce((sum, total) => sum + total.total, 0);
  const profit = invoiceTotals.reduce((sum, total) => sum + total.profit, 0);

  document.querySelector("#metricSales").textContent = formatMoney(sales);
  document.querySelector("#metricProfit").textContent = formatMoney(profit);
  document.querySelector("#metricInvoices").textContent = invoiceDocs.length;
  document.querySelector("#metricQuotes").textContent = quoteDocs.length;

  const list = document.querySelector("#documentList");
  if (!state.documents.length) {
    list.innerHTML = `<div class="empty-state">No documents yet</div>`;
    return;
  }

  list.innerHTML = [...state.documents].reverse().map((document) => {
    const customer = getCustomer(document.customerId);
    const totals = calculate(document);
    const label = documentLabel(document.type);
    return `
      <article class="document-card">
        <div class="card-row">
          <div>
            <div class="card-title">${label} ${escapeHtml(document.number)}</div>
            <div class="card-meta">${escapeHtml(customer?.name || "No customer")} · ${document.date} · ${document.status}</div>
          </div>
          <strong>${formatMoney(totals.total)}</strong>
        </div>
        <div class="card-actions">
          <button class="secondary-button load-document" data-id="${document.id}">Open</button>
          <button class="secondary-button duplicate-document" data-id="${document.id}">Duplicate</button>
          <button class="danger-button delete-document" data-id="${document.id}">Delete</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderCustomers() {
  const list = document.querySelector("#customerList");
  const count = document.querySelector("#customerCount");
  if (count) {
    count.textContent = `${state.customers.length} customers loaded`;
  }
  list.innerHTML = state.customers.map((customer) => `
    <article class="record-card">
      <div class="card-row">
        <div>
          <div class="card-title">${escapeHtml(customer.name)}</div>
          <div class="card-meta">${escapeHtml(customer.company || customer.phone || customer.email || "")}</div>
        </div>
      </div>
      <div class="card-meta">${escapeHtml(customer.address || "")}</div>
      <div class="card-actions">
        <button class="danger-button delete-customer" data-id="${customer.id}">Delete</button>
      </div>
    </article>
  `).join("") || `<div class="empty-state">No customers yet</div>`;
}

function renderItems() {
  const list = document.querySelector("#itemList");
  const count = document.querySelector("#itemCount");
  if (count) {
    count.textContent = `${state.items.length} products loaded`;
  }
  list.innerHTML = state.items.map((item) => `
    <article class="record-card">
      <div class="card-row">
        <div>
          <div class="card-title">${escapeHtml(item.name)}</div>
          <div class="card-meta">Cost ${formatMoney(item.cost)}</div>
        </div>
        <strong>${formatMoney(item.price)}</strong>
      </div>
      <div class="card-meta">${escapeHtml(item.description || "")}</div>
      <div class="card-actions">
        <button class="danger-button delete-item" data-id="${item.id}">Delete</button>
      </div>
    </article>
  `).join("") || `<div class="empty-state">No items yet</div>`;
}

function renderSettings() {
  Object.entries(state.settings).forEach(([key, value]) => {
    const input = document.querySelector(`#${key}`);
    if (input) input.value = value;
  });
  const preview = document.querySelector("#logoPreview");
  if (!state.settings.logoData) {
    preview.innerHTML = "No logo selected";
    preview.classList.remove("has-logo");
    return;
  }
  preview.innerHTML = `<img src="${state.settings.logoData}" alt="Company logo preview">`;
  preview.classList.add("has-logo");
}

function renderAll() {
  renderDocumentForm();
  renderDashboard();
  renderCustomers();
  renderItems();
  renderSettings();
}

function updateDraftFromForm() {
  draft.type = document.querySelector("#docType").value;
  draft.date = document.querySelector("#docDate").value;
  draft.customerId = document.querySelector("#docCustomer").value;
  draft.discount = moneyValue(document.querySelector("#docDiscount").value);
  draft.discountType = document.querySelector("#docDiscountType").value;
  draft.tax = moneyValue(document.querySelector("#docTax").value);
  draft.status = document.querySelector("#docStatus").value;
  draft.notes = document.querySelector("#docNotes").value;
}

function saveDocument() {
  updateDraftFromForm();
  if (!draft.lines.length) return;
  if (!draft.number) draft.number = nextDocumentNumber(draft.type);
  if (!draft.id) {
    draft.id = uid();
    state.documents.push(clone(draft));
  } else {
    const index = state.documents.findIndex((document) => document.id === draft.id);
    if (index >= 0) state.documents[index] = clone(draft);
  }
  state.currentDocumentId = draft.id;
  saveState();
  renderAll();
}

function convertDraftToInvoice() {
  updateDraftFromForm();
  draft.type = "invoice";
  draft.number = nextDocumentNumber("invoice");
  draft.id = null;
  draft.status = "draft";
  saveDocument();
  switchView("builder");
}

function openDocument(id) {
  const documentToOpen = state.documents.find((document) => document.id === id);
  if (!documentToOpen) return;
  draft = clone(documentToOpen);
  renderAll();
  switchView("builder");
}

function duplicateDocument(id) {
  const original = state.documents.find((document) => document.id === id);
  if (!original) return;
  draft = clone(original);
  draft.id = null;
  draft.number = "";
  draft.date = today();
  renderAll();
  switchView("builder");
}

function deleteDocument(id) {
  state.documents = state.documents.filter((document) => document.id !== id);
  if (draft.id === id) draft = emptyDocument();
  saveState();
  renderAll();
}

function renderPrintPage(documentData) {
  const totals = calculate(documentData);
  const customer = getCustomer(documentData.customerId);
  const label = documentLabel(documentData.type);
  const amountLabel = documentData.type === "receipt" ? "Amount Paid" : "Amount Due";
  const logo = state.settings.logoData
    ? `<img class="invoice-logo" src="${state.settings.logoData}" alt="${escapeHtml(state.settings.businessName || "Company")} logo">`
    : `<div class="invoice-logo invoice-logo-placeholder">PRODAPT<br><span>SOLUTION</span></div>`;
  const watermark = state.settings.logoData
    ? `<img class="invoice-watermark" src="${state.settings.logoData}" alt="">`
    : "";
  const rows = totals.lines.map((line) => `
    <tr>
      <td>
        <strong>${escapeHtml(line.item?.name || "Item")}</strong><br>
        <span>${escapeHtml(line.item?.description || "")}</span>
      </td>
      <td class="numeric">${line.quantity}</td>
      <td>${formatMoney(line.price)}</td>
      <td>${formatMoney(line.total)}</td>
    </tr>
  `).join("");
  const customerLines = [
    customer?.name,
    customer?.company,
    customer?.address,
    customer?.phone,
    customer?.email
  ].filter(Boolean).map(lineBreaks).join("<br>");
  const contactLine = [state.settings.businessPhone, state.settings.businessEmail]
    .filter(Boolean)
    .map(lineBreaks)
    .join("<br>");

  document.querySelector("#printPage").innerHTML = `
    <div class="invoice-sheet">
      ${watermark}
      <header class="invoice-header">
        <div class="invoice-logo-wrap">${logo}</div>
        <div class="invoice-company">
          <h2>${label}</h2>
          <strong>${escapeHtml(state.settings.businessName || "PRODAPT SOLUTION")}</strong>
          <p>${lineBreaks(state.settings.businessAddress || "")}</p>
          <p>${contactLine}</p>
        </div>
      </header>

      <section class="invoice-info-grid">
        <div class="invoice-bill-to">
          <span>Bill To</span>
          <p>${customerLines || "Customer"}</p>
        </div>
        <div class="invoice-meta-card">
          <div><strong>${label} Number:</strong><span>${escapeHtml(documentData.number || "Draft")}</span></div>
          <div><strong>${label} Date:</strong><span>${escapeHtml(documentData.date)}</span></div>
          <div><strong>Status:</strong><span>${escapeHtml(documentData.status)}</span></div>
          <div class="amount-due"><strong>${amountLabel} (${currencyLabel()}):</strong><span>${formatMoney(totals.total)}</span></div>
        </div>
      </section>

      <table class="invoice-items-table">
        <thead>
          <tr><th>Items</th><th>Quantity</th><th>Price</th><th>Amount</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>

      <section class="invoice-totals">
        <div class="invoice-total-row"><strong>Subtotal:</strong><span>${formatMoney(totals.subtotal)}</span></div>
        <div class="invoice-total-row"><strong>Discount:</strong><span>${formatMoney(totals.discount)}</span></div>
        <div class="invoice-total-row"><strong>Tax:</strong><span>${formatMoney(totals.tax)}</span></div>
        <div class="invoice-total-row strong"><strong>Total:</strong><span>${formatMoney(totals.total)}</span></div>
        <div class="invoice-total-row due"><strong>${amountLabel} (${currencyLabel()}):</strong><span>${formatMoney(totals.total)}</span></div>
      </section>

      <section class="invoice-notes">
        <strong>Notes / Terms</strong>
        <p>${lineBreaks(documentData.notes || state.settings.businessPayment || "")}</p>
      </section>

      <footer class="document-footer">
        ${state.settings.businessTin ? `<div>TIN ${escapeHtml(state.settings.businessTin)}</div>` : ""}
        <strong>Powered by PRODAPT SOLUTION</strong>
      </footer>
    </div>
  `;
}

function documentSummary() {
  updateDraftFromForm();
  const totals = calculate(draft);
  const customer = getCustomer(draft.customerId);
  const label = documentLabel(draft.type);
  return `${label} ${draft.number || "Draft"} for ${customer?.name || "customer"}: ${formatMoney(totals.total)}`;
}

async function shareCurrentDocument() {
  const text = documentSummary();
  if (navigator.share) {
    await navigator.share({ title: "PRODAPT document", text });
  } else {
    await navigator.clipboard?.writeText(text);
    alert("Document summary copied.");
  }
}

function emailCurrentDocument() {
  const customer = getCustomer(draft.customerId);
  const subject = encodeURIComponent(`PRODAPT ${documentLabel(draft.type)} ${draft.number || "Draft"}`);
  const body = encodeURIComponent(`${documentSummary()}\n\nRegards,\n${state.settings.businessName}`);
  window.location.href = `mailto:${encodeURIComponent(customer?.email || "")}?subject=${subject}&body=${body}`;
}

function whatsappCurrentDocument() {
  const text = encodeURIComponent(documentSummary());
  window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
}

function downloadCurrentDocument() {
  updateDraftFromForm();
  renderPrintPage(draft);
  window.print();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => switchView(tab.dataset.view));
});

document.querySelector("#newDocumentFromDashboard").addEventListener("click", () => {
  draft = emptyDocument();
  renderAll();
  switchView("builder");
});

document.querySelector("#documentForm").addEventListener("input", () => {
  updateDraftFromForm();
  renderTotals();
});

document.querySelector("#documentForm").addEventListener("change", () => {
  updateDraftFromForm();
  renderTotals();
});

document.querySelector("#documentForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveDocument();
});

document.querySelector("#lineItems").addEventListener("input", (event) => {
  const card = event.target.closest(".line-card");
  if (!card) return;
  const index = Number(card.dataset.index);
  draft.lines[index].itemId = card.querySelector(".line-item").value;
  draft.lines[index].quantity = moneyValue(card.querySelector(".line-qty").value);
  draft.lines[index].price = moneyValue(card.querySelector(".line-price").value);
  renderTotals();
});

document.querySelector("#lineItems").addEventListener("change", (event) => {
  const card = event.target.closest(".line-card");
  if (!card) return;
  const index = Number(card.dataset.index);
  if (event.target.classList.contains("line-item")) {
    const item = getItem(event.target.value);
    draft.lines[index].itemId = event.target.value;
    draft.lines[index].price = item?.price || 0;
    renderLineItems();
  }
  renderTotals();
});

document.querySelector("#lineItems").addEventListener("click", (event) => {
  if (!event.target.classList.contains("remove-line")) return;
  const index = Number(event.target.closest(".line-card").dataset.index);
  draft.lines.splice(index, 1);
  if (!draft.lines.length) draft.lines.push({ itemId: state.items[0]?.id || "", quantity: 1, price: state.items[0]?.price || 0 });
  renderLineItems();
  renderTotals();
});

document.querySelector("#addLine").addEventListener("click", () => {
  draft.lines.push({ itemId: state.items[0]?.id || "", quantity: 1, price: state.items[0]?.price || 0 });
  renderLineItems();
  renderTotals();
});

document.querySelector("#convertToInvoice").addEventListener("click", convertDraftToInvoice);
document.querySelector("#clearDocument").addEventListener("click", () => {
  draft = emptyDocument();
  renderAll();
});

document.querySelector("#documentList").addEventListener("click", (event) => {
  const id = event.target.dataset.id;
  if (!id) return;
  if (event.target.classList.contains("load-document")) openDocument(id);
  if (event.target.classList.contains("duplicate-document")) duplicateDocument(id);
  if (event.target.classList.contains("delete-document")) deleteDocument(id);
});

document.querySelector("#customerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.customers.push({
    id: uid(),
    name: document.querySelector("#customerName").value,
    company: document.querySelector("#customerCompany").value,
    phone: document.querySelector("#customerPhone").value,
    email: document.querySelector("#customerEmail").value,
    address: document.querySelector("#customerAddress").value
  });
  event.target.reset();
  if (!draft.customerId) draft.customerId = state.customers[state.customers.length - 1].id;
  saveState();
  renderAll();
});

document.querySelector("#customerList").addEventListener("click", (event) => {
  const id = event.target.dataset.id;
  if (!event.target.classList.contains("delete-customer")) return;
  state.customers = state.customers.filter((customer) => customer.id !== id);
  if (draft.customerId === id) draft.customerId = state.customers[0]?.id || "";
  saveState();
  renderAll();
});

document.querySelector("#itemForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.items.push({
    id: uid(),
    name: document.querySelector("#itemName").value,
    description: document.querySelector("#itemDescription").value,
    price: moneyValue(document.querySelector("#itemPrice").value),
    cost: moneyValue(document.querySelector("#itemCost").value)
  });
  event.target.reset();
  saveState();
  renderAll();
});

document.querySelector("#itemList").addEventListener("click", (event) => {
  const id = event.target.dataset.id;
  if (!event.target.classList.contains("delete-item")) return;
  state.items = state.items.filter((item) => item.id !== id);
  draft.lines = draft.lines.map((line) => line.itemId === id ? { itemId: state.items[0]?.id || "", quantity: 1, price: state.items[0]?.price || 0 } : line);
  saveState();
  renderAll();
});

document.querySelector("#itemImport").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    const count = importItemsFromCsv(String(reader.result || ""));
    event.target.value = "";
    alert(count ? `Imported ${count} items.` : "No items were imported. Check the CSV file.");
  });
  reader.readAsText(file);
});

document.querySelector("#settingsForm").addEventListener("submit", (event) => {
  event.preventDefault();
  state.settings = {
    businessName: document.querySelector("#businessName").value,
    businessAddress: document.querySelector("#businessAddress").value,
    businessPhone: document.querySelector("#businessPhone").value,
    businessEmail: document.querySelector("#businessEmail").value,
    businessCurrency: document.querySelector("#businessCurrency").value,
    businessTax: moneyValue(document.querySelector("#businessTax").value),
    businessTin: document.querySelector("#businessTin").value,
    businessPayment: document.querySelector("#businessPayment").value,
    logoData: state.settings.logoData || ""
  };
  draft.tax = state.settings.businessTax;
  saveState();
  renderAll();
});

document.querySelector("#businessLogo").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    state.settings.logoData = String(reader.result || "");
    saveState();
    renderAll();
  });
  reader.readAsDataURL(file);
});

document.querySelector("#removeLogo").addEventListener("click", () => {
  state.settings.logoData = "";
  document.querySelector("#businessLogo").value = "";
  saveState();
  renderAll();
});

document.querySelector("#printDocument").addEventListener("click", () => {
  downloadCurrentDocument();
});
document.querySelector("#previewPrint").addEventListener("click", () => {
  downloadCurrentDocument();
});
document.querySelector("#shareDocument").addEventListener("click", shareCurrentDocument);
document.querySelector("#emailDocument").addEventListener("click", emailCurrentDocument);
document.querySelector("#whatsappDocument").addEventListener("click", whatsappCurrentDocument);

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("service-worker.js?v=20260902-customers-download").then((registration) => {
    registration.update();
  }).catch(() => {});
}

renderAll();
