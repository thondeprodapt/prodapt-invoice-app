const storageKey = "prodapt.invoice.studio.v1";

if (["http:", "https:"].includes(window.location.protocol) && window.location.pathname.endsWith("/index.html")) {
  const cleanPath = window.location.pathname.replace(/index\.html$/, "");
  window.history.replaceState(null, "", `${cleanPath}${window.location.search}${window.location.hash}`);
}

const today = () => new Date().toISOString().slice(0, 10);
const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const moneyValue = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const clone = (value) => JSON.parse(JSON.stringify(value));
const defaultLogo = "prodapt-logo.png";

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
    logoData: defaultLogo
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
  const logoMigrationRecorded = Boolean(state.migrations?.defaultLogo20260903);
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
  if (!state.settings.logoData && !logoMigrationRecorded) {
    state.settings.logoData = defaultLogo;
    changed = true;
  }
  if (!logoMigrationRecorded) {
    state.migrations = { ...(state.migrations || {}), defaultLogo20260903: true };
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
  const numberPattern = new RegExp(`^${prefix}-${year}-(\\d+)$`);
  const latest = state.documents
    .filter((document) => document.type === type)
    .map((document) => String(document.number || "").match(numberPattern))
    .filter(Boolean)
    .reduce((max, match) => Math.max(max, Number(match[1]) || 0), 0);
  return `${prefix}-${year}-${String(latest + 1).padStart(4, "0")}`;
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
  const receiptDocs = state.documents.filter((document) => document.type === "receipt");
  const invoiceTotals = invoiceDocs.map(calculate);
  const quoteTotals = quoteDocs.map(calculate);
  const receiptTotals = receiptDocs.map(calculate);
  const sales = invoiceTotals.reduce((sum, total) => sum + total.total, 0);
  const profit = invoiceTotals.reduce((sum, total) => sum + total.profit, 0);
  const quoted = quoteTotals.reduce((sum, total) => sum + total.total, 0);
  const received = receiptTotals.reduce((sum, total) => sum + total.total, 0);
  const outstanding = Math.max(sales - received, 0);
  const progress = sales > 0 ? Math.min((received / sales) * 100, 100) : 0;

  document.querySelector("#metricSales").textContent = formatMoney(sales);
  document.querySelector("#metricProfit").textContent = formatMoney(profit);
  document.querySelector("#metricReceipts").textContent = formatMoney(received);
  document.querySelector("#metricOutstanding").textContent = formatMoney(outstanding);
  document.querySelector("#metricInvoices").textContent = invoiceDocs.length;
  document.querySelector("#metricQuotes").textContent = quoteDocs.length;
  document.querySelector("#metricReceiptCount").textContent = receiptDocs.length;
  document.querySelector("#metricDocuments").textContent = state.documents.length;
  document.querySelector("#metricProgress").textContent = `${progress.toFixed(0)}% collected - ${formatMoney(quoted)} quoted`;
  document.querySelector("#progressFill").style.width = `${progress}%`;

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
            <div class="card-meta">${escapeHtml(customer?.name || "No customer")} - ${document.date} - ${document.status}</div>
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

function persistCurrentDocument() {
  updateDraftFromForm();
  if (!draft.lines.length) return null;
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
  return clone(draft);
}

function saveDocument() {
  if (!persistCurrentDocument()) return;
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
  const isReceipt = documentData.type === "receipt";
  const amountLabel = isReceipt ? "Amount Paid" : "Amount Due";
  const sheetClass = isReceipt ? "invoice-sheet receipt-sheet" : "invoice-sheet";
  const notesText = isReceipt
    ? String(documentData.notes || "").trim()
    : documentData.notes || state.settings.businessPayment || "";
  const logo = state.settings.logoData
    ? `<img class="invoice-logo" src="${state.settings.logoData}" alt="${escapeHtml(state.settings.businessName || "Company")} logo">`
    : `<div class="invoice-logo invoice-logo-placeholder">PRODAPT<br><span>SOLUTION</span></div>`;
  const poweredLogo = state.settings.logoData
    ? `<img class="powered-logo" src="${state.settings.logoData}" alt="${escapeHtml(state.settings.businessName || "PRODAPT SOLUTION")} logo">`
    : `<strong>PRODAPT SOLUTION</strong>`;
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
    <div class="${sheetClass}">
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
          <div><strong>Payment Due:</strong><span>${escapeHtml(documentData.date)}</span></div>
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

      ${notesText ? `
        <section class="invoice-notes">
          <strong>Notes / Terms</strong>
          <p>${lineBreaks(notesText)}</p>
        </section>
      ` : ""}

      <footer class="document-footer">
        ${state.settings.businessTin ? `<div>TIN ${escapeHtml(state.settings.businessTin)}</div>` : ""}
        <div class="powered-by"><span>Powered by</span>${poweredLogo}</div>
      </footer>
    </div>
  `;
}

function documentSummary(documentData = draft) {
  const totals = calculate(documentData);
  const customer = getCustomer(documentData.customerId);
  const label = documentLabel(documentData.type);
  return `${label} ${documentData.number || "Draft"} for ${customer?.name || "customer"}: ${formatMoney(totals.total)}`;
}

async function shareCurrentDocument() {
  const documentData = persistCurrentDocument();
  if (!documentData) return;
  renderAll();
  const text = documentSummary(documentData);
  if (navigator.share) {
    await navigator.share({ title: "PRODAPT document", text });
  } else {
    await navigator.clipboard?.writeText(text);
    alert("Document summary copied.");
  }
}

function documentFileName(documentData) {
  const label = documentLabel(documentData.type);
  const number = documentData.number || nextDocumentNumber(documentData.type);
  return `PRODAPT-${label}-${number}.pdf`.replace(/[^a-z0-9._-]+/gi, "-");
}

function pdfHex(value) {
  const text = String(value ?? "");
  let hex = "FEFF";
  for (let index = 0; index < text.length; index += 1) {
    hex += text.charCodeAt(index).toString(16).padStart(4, "0");
  }
  return `<${hex}>`;
}

function wrapText(value, maxChars) {
  const words = String(value || "").replace(/\r/g, "").split(/\s+/);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function dataUrlToBytes(dataUrl) {
  const base64 = String(dataUrl || "").split(",")[1] || "";
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function loadImage(src) {
  return new Promise((resolve) => {
    if (!src || typeof Image === "undefined" || !document.createElement) {
      resolve(null);
      return;
    }
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.crossOrigin = "anonymous";
    image.src = src;
  });
}

async function loadLogoForPdf() {
  const image = await loadImage(state.settings.logoData || defaultLogo);
  if (!image || !document.createElement) return null;
  const canvas = document.createElement("canvas");
  const maxWidth = 640;
  const scale = Math.min(1, maxWidth / image.naturalWidth);
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return {
    width: canvas.width,
    height: canvas.height,
    bytes: dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.88))
  };
}

function makePdfBlob(pageWidth, pageHeight, content, logoImage) {
  const encoder = new TextEncoder();
  const objects = [];
  const addObject = (chunks) => {
    objects.push(Array.isArray(chunks) ? chunks : [chunks]);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  const gStateId = logoImage ? 6 : null;
  const imageId = logoImage ? 7 : null;
  const contentId = logoImage ? 8 : 6;
  const imageResources = imageId ? ` /XObject << /Logo ${imageId} 0 R >> /ExtGState << /Watermark ${gStateId} 0 R >>` : "";
  addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >>${imageResources} >> /Contents ${contentId} 0 R >>`);
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>");
  if (logoImage) {
    addObject("<< /Type /ExtGState /ca 0.035 /CA 0.035 >>");
    addObject([
      `<< /Type /XObject /Subtype /Image /Width ${logoImage.width} /Height ${logoImage.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${logoImage.bytes.length} >>\nstream\n`,
      logoImage.bytes,
      "\nendstream"
    ]);
  }
  const contentBytes = encoder.encode(content);
  addObject([`<< /Length ${contentBytes.length} >>\nstream\n`, contentBytes, "\nendstream"]);

  const chunks = ["%PDF-1.7\n"];
  const offsets = [0];
  let length = encoder.encode(chunks[0]).length;
  objects.forEach((object, index) => {
    offsets.push(length);
    const prefix = `${index + 1} 0 obj\n`;
    chunks.push(prefix, ...object, "\nendobj\n");
    length += encoder.encode(prefix).length + object.reduce((sum, chunk) => sum + (typeof chunk === "string" ? encoder.encode(chunk).length : chunk.length), 0) + encoder.encode("\nendobj\n").length;
  });
  const xrefOffset = length;
  const xref = [
    `xref\n0 ${objects.length + 1}\n`,
    "0000000000 65535 f \n",
    ...offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`),
    `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`
  ].join("");
  chunks.push(xref);

  return new Blob(chunks, { type: "application/pdf" });
}

async function generateDocumentPdfBlob(documentData) {
  const isReceipt = documentData.type === "receipt";
  const pageWidth = isReceipt ? 226.77 : 595.28;
  const pageHeight = isReceipt ? 900 : 841.89;
  const margin = isReceipt ? 14 : 26;
  const logoImage = await loadLogoForPdf();
  const totals = calculate(documentData);
  const customer = getCustomer(documentData.customerId);
  const label = documentLabel(documentData.type);
  const amountLabel = isReceipt ? "Amount Paid" : "Amount Due";
  const maxChars = isReceipt ? 28 : 76;
  const commands = [];
  let y = pageHeight - margin;

  const color = (r, g, b) => commands.push(`${r} ${g} ${b} rg`);
  const stroke = (r, g, b) => commands.push(`${r} ${g} ${b} RG`);
  const text = (value, x, textY, size = 10, bold = false) => {
    commands.push(`BT /${bold || isReceipt ? "F2" : "F1"} ${size} Tf 1 0 0 1 ${x.toFixed(2)} ${textY.toFixed(2)} Tm ${pdfHex(value)} Tj ET`);
  };
  const approximateWidth = (value, size = 10) => String(value || "").length * size * 0.52;
  const rightText = (value, rightEdge, textY, size = 10, bold = false) => {
    const width = approximateWidth(value, size) * (isReceipt ? 1.08 : 1);
    text(value, rightEdge - width, textY, size, bold);
  };
  const line = (x1, y1, x2, y2) => commands.push(`${isReceipt ? 1.1 : 0.65} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
  const rect = (x, rectY, width, height) => commands.push(`${x.toFixed(2)} ${rectY.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)} re f`);
  const image = (width, x, imageY) => {
    if (!logoImage) return 0;
    const height = width * (logoImage.height / logoImage.width);
    commands.push(`q ${width.toFixed(2)} 0 0 ${height.toFixed(2)} ${x.toFixed(2)} ${imageY.toFixed(2)} cm /Logo Do Q`);
    return height;
  };
  const addWrapped = (value, x, size = 10, bold = false, chars = maxChars, leading = size + 4) => {
    wrapText(value, chars).forEach((part) => {
      text(part, x, y, size, bold);
      y -= leading;
    });
  };

  if (logoImage) {
    const watermarkWidth = isReceipt ? pageWidth * 0.68 : pageWidth * 0.46;
    const watermarkHeight = watermarkWidth * (logoImage.height / logoImage.width);
    const watermarkX = (pageWidth - watermarkWidth) / 2;
    const watermarkY = (pageHeight - watermarkHeight) / 2;
    commands.push(`q /Watermark gs ${watermarkWidth.toFixed(2)} 0 0 ${watermarkHeight.toFixed(2)} ${watermarkX.toFixed(2)} ${watermarkY.toFixed(2)} cm /Logo Do Q`);
  }

  if (!isReceipt) {
    const rightEdge = pageWidth - margin;
    const metaLeft = rightEdge - 208;
    const tableTop = 520;
    const qtyX = pageWidth - margin - 260;
    const priceRight = pageWidth - margin - 100;
    const amountRight = pageWidth - margin - 10;
    const denseRows = totals.lines.length > 10;

    image(96, margin + 36, pageHeight - margin - 78);
    color(0, 0, 0);
    rightText(label.toUpperCase(), rightEdge, pageHeight - margin - 22, 34, false);
    rightText(state.settings.businessName || "PRODAPT SOLUTION", rightEdge, pageHeight - margin - 60, 11, true);
    String(state.settings.businessAddress || "").split(/\r?\n/).filter(Boolean).slice(0, 4).forEach((part, index) => {
      rightText(part, rightEdge, pageHeight - margin - 77 - (index * 13), 10);
    });
    String(state.settings.businessPhone || "").split(/\r?\n/).filter(Boolean).slice(0, 2).forEach((part, index) => {
      rightText(part, rightEdge, pageHeight - margin - 145 - (index * 13), 10);
    });

    stroke(0.83, 0.85, 0.87);
    line(0, 640, pageWidth, 640);

    color(0.54, 0.58, 0.62);
    text("BILL TO", margin, 618, 10);
    color(0, 0, 0);
    const customerLines = [customer?.name, customer?.company, customer?.address, customer?.phone, customer?.email]
      .filter(Boolean)
      .flatMap((part) => String(part).split(/\r?\n/).filter(Boolean));
    customerLines.slice(0, 6).forEach((part, index) => {
      text(part, margin, 603 - (index * 13), index === 0 ? 10 : 9, index === 0);
    });

    const metaRows = [
      [`${label} Number:`, documentData.number || "Draft", true],
      [`${label} Date:`, documentData.date, false],
      ["Payment Due:", documentData.date, false]
    ];
    metaRows.forEach(([name, value, bold], index) => {
      const rowY = 616 - (index * 18);
      rightText(name, metaLeft + 118, rowY, 10, Boolean(bold));
      text(value, metaLeft + 128, rowY, 10);
    });
    color(0.94, 0.94, 0.94);
    rect(metaLeft - 12, 551, 220, 22);
    color(0, 0, 0);
    rightText(`${amountLabel} (${currencyLabel()}):`, metaLeft + 118, 558, 10, true);
    text(formatMoney(totals.total), metaLeft + 128, 558, 10, true);

    color(0.25, 0.25, 0.25);
    rect(0, tableTop - 24, pageWidth, 24);
    color(1, 1, 1);
    text("Items", margin, tableTop - 9, 10, true);
    text("Quantity", qtyX, tableTop - 9, 10, true);
    rightText("Price", priceRight, tableTop - 9, 10, true);
    rightText("Amount", amountRight, tableTop - 9, 10, true);

    color(0, 0, 0);
    y = tableTop - 45;
    totals.lines.slice(0, 15).forEach((itemLine) => {
      const rowStart = y;
      const name = itemLine.item?.name || "Item";
      const description = itemLine.item?.description || "";
      const itemText = denseRows && description ? `${name} - ${description}` : name;
      text(itemText, margin, rowStart, denseRows ? 8 : 9, true);
      if (!denseRows && description) text(description, margin, rowStart - 12, 8);
      text(String(itemLine.quantity), qtyX + 20, rowStart, denseRows ? 8 : 9);
      rightText(formatMoney(itemLine.price), priceRight, rowStart, denseRows ? 8 : 9);
      rightText(formatMoney(itemLine.total), amountRight, rowStart, denseRows ? 8 : 9);
      stroke(0.9, 0.91, 0.92);
      line(0, rowStart - (denseRows ? 10 : 17), pageWidth, rowStart - (denseRows ? 10 : 17));
      y -= denseRows ? 18 : 26;
    });

    y -= 10;
    const totalsLeft = pageWidth - margin - 190;
    [
      ["Subtotal:", totals.subtotal, false],
      ["Discount:", totals.discount, false],
      ["Tax:", totals.tax, false],
      ["Total:", totals.total, true],
      [`${amountLabel} (${currencyLabel()}):`, totals.total, true]
    ].forEach(([name, amount, bold], index) => {
      if (index === 4) {
        stroke(0.85, 0.87, 0.88);
        commands.push(`2 w ${totalsLeft.toFixed(2)} ${(y + 9).toFixed(2)} m ${amountRight.toFixed(2)} ${(y + 9).toFixed(2)} l S`);
        y -= 8;
      }
      rightText(name, totalsLeft + 95, y, 10, Boolean(bold));
      rightText(formatMoney(amount), amountRight, y, 10, Boolean(bold));
      y -= index === 3 ? 20 : 15;
    });

    y = Math.max(88, Math.min(y - 10, 205));
    color(0.3, 0.34, 0.37);
    text("Notes / Terms", margin, y, 10, true);
    y -= 16;
    wrapText(documentData.notes || state.settings.businessPayment || "", 96).slice(0, 7).forEach((part) => {
      text(part, margin, y, 8);
      y -= 12;
    });

    color(0.5, 0.52, 0.54);
    if (state.settings.businessTin) {
      const tinText = `TIN ${state.settings.businessTin}`;
      text(tinText, (pageWidth - approximateWidth(tinText, 9)) / 2, 54, 9);
    }
    color(0.04, 0.17, 0.47);
    text("Powered by", pageWidth / 2 - 78, 24, 13, true);
    if (logoImage) {
      image(46, pageWidth / 2 + 8, 12);
    } else {
      text("PRODAPT SOLUTION", pageWidth / 2 + 8, 24, 13, true);
    }
    return makePdfBlob(pageWidth, pageHeight, commands.join("\n"), logoImage);
  }

  if (logoImage) {
    const logoWidth = isReceipt ? 150 : 135;
    const logoHeight = logoWidth * (logoImage.height / logoImage.width);
    const logoX = isReceipt ? (pageWidth - logoWidth) / 2 : margin;
    commands.push(`q ${logoWidth.toFixed(2)} 0 0 ${logoHeight.toFixed(2)} ${logoX.toFixed(2)} ${(y - logoHeight).toFixed(2)} cm /Logo Do Q`);
    y -= logoHeight + (isReceipt ? 12 : 6);
  }

  color(0, 0, 0);
  text(label.toUpperCase(), isReceipt ? margin : pageWidth - margin - 170, isReceipt ? y : pageHeight - margin - 10, isReceipt ? 18 : 28, true);
  color(0, 0, 0);
  if (isReceipt) y -= 24;

  addWrapped(state.settings.businessName || "PRODAPT SOLUTION", margin, isReceipt ? 9 : 10, true, maxChars);
  addWrapped(state.settings.businessAddress || "", margin, isReceipt ? 8 : 9);
  addWrapped([state.settings.businessPhone, state.settings.businessEmail].filter(Boolean).join(" | "), margin, isReceipt ? 8 : 9);
  y -= isReceipt ? 6 : 12;
  line(margin, y, pageWidth - margin, y);
  y -= isReceipt ? 14 : 20;

  text(`${label} Number: ${documentData.number || "Draft"}`, margin, y, isReceipt ? 9 : 11, true);
  y -= isReceipt ? 13 : 16;
  text(`${label} Date: ${documentData.date}`, margin, y, isReceipt ? 9 : 10);
  y -= isReceipt ? 13 : 16;
  text(`Status: ${documentData.status}`, margin, y, isReceipt ? 9 : 10);
  y -= isReceipt ? 16 : 22;

  addWrapped("Bill To", margin, isReceipt ? 9 : 10, true);
  addWrapped([customer?.name, customer?.company, customer?.address, customer?.phone, customer?.email].filter(Boolean).join("\n"), margin, isReceipt ? 8 : 9);
  y -= isReceipt ? 6 : 12;

  line(margin, y, pageWidth - margin, y);
  y -= isReceipt ? 13 : 18;
  const receiptRightEdge = pageWidth - margin - 2;
  const receiptQtyRight = 110;
  const receiptPriceRight = 160;
  text("Items", margin, y, isReceipt ? 9 : 10, true);
  if (isReceipt) {
    rightText("Qty", receiptQtyRight, y, 8, true);
    rightText("Price", receiptPriceRight, y, 8, true);
    rightText("Amount", receiptRightEdge, y, 8, true);
  } else {
    text("Qty", pageWidth - margin - 150, y, 10, true);
    text("Amount", pageWidth - margin - 58, y, 10, true);
  }
  y -= isReceipt ? 12 : 16;

  totals.lines.forEach((itemLine) => {
    const rowTop = y;
    addWrapped(itemLine.item?.name || "Item", margin, isReceipt ? 8 : 9, true, isReceipt ? 15 : 48, isReceipt ? 10 : 12);
    if (itemLine.item?.description) addWrapped(itemLine.item.description, margin, isReceipt ? 7 : 8, false, isReceipt ? 24 : 64, isReceipt ? 9 : 11);
    if (isReceipt) {
      rightText(String(itemLine.quantity), receiptQtyRight, rowTop, 8, true);
      rightText(formatMoney(itemLine.price), receiptPriceRight, rowTop, 8, true);
      rightText(formatMoney(itemLine.total), receiptRightEdge, rowTop, 8, true);
    } else {
      text(String(itemLine.quantity), pageWidth - margin - 150, y + 13, 9);
      text(formatMoney(itemLine.total), pageWidth - margin - 80, y + 13, 9);
    }
    y -= isReceipt ? 4 : 6;
  });

  y -= 4;
  line(margin, y, pageWidth - margin, y);
  y -= isReceipt ? 13 : 18;
  [
    ["Subtotal", totals.subtotal],
    ["Discount", totals.discount],
    ["Tax", totals.tax],
    ["Total", totals.total],
    [amountLabel, totals.total]
  ].forEach(([name, amount], index) => {
    if (isReceipt) {
      rightText(`${name}:`, 146, y, 9, true);
      rightText(formatMoney(amount), receiptRightEdge, y, 9, true);
    } else {
      text(`${name}:`, pageWidth - margin - 180, y, 10, index >= 3);
      text(formatMoney(amount), pageWidth - margin - 80, y, 10, index >= 3);
    }
    y -= isReceipt ? 13 : 16;
  });

  const receiptNotes = isReceipt
    ? String(documentData.notes || "").trim()
    : documentData.notes || state.settings.businessPayment || "";
  if (receiptNotes) {
    y -= isReceipt ? 5 : 12;
    addWrapped("Notes / Terms", margin, isReceipt ? 8 : 9, true);
    addWrapped(receiptNotes, margin, isReceipt ? 7 : 8, false, maxChars);
  }
  y -= isReceipt ? 10 : 16;
  if (state.settings.businessTin) addWrapped(`TIN ${state.settings.businessTin}`, margin, isReceipt ? 7 : 8);
  color(0, 0, 0);
  addWrapped("Powered by", margin, isReceipt ? 8 : 12, true);
  if (logoImage) {
    image(isReceipt ? 72 : 90, margin, Math.max(8, y - 18));
  } else {
    addWrapped("PRODAPT SOLUTION", margin, isReceipt ? 8 : 12, true);
  }

  return makePdfBlob(pageWidth, pageHeight, commands.join("\n"), logoImage);
}

async function createDocumentPdfFile(documentData) {
  const blob = await generateDocumentPdfBlob(documentData);
  const fileName = documentFileName(documentData);
  if (typeof File === "function") {
    return new File([blob], fileName, { type: "application/pdf" });
  }
  blob.name = fileName;
  return blob;
}

function downloadFile(file) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name || "PRODAPT-document.pdf";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function sharePdfCurrentDocument(channel = "share") {
  const documentData = persistCurrentDocument();
  if (!documentData) return;
  renderAll();
  const file = await createDocumentPdfFile(documentData);
  const text = documentSummary(documentData);
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    await navigator.share({ title: file.name, text, files: [file] });
    return;
  }
  downloadFile(file);
  if (channel === "whatsapp") {
    window.open(`https://wa.me/?text=${encodeURIComponent(`${text}\nPDF downloaded as ${file.name}`)}`, "_blank", "noopener");
  } else {
    alert(`PDF downloaded as ${file.name}. Use Share or attach it from Downloads.`);
  }
}

async function emailCurrentDocument() {
  const documentData = persistCurrentDocument();
  if (!documentData) return;
  renderAll();
  const file = await createDocumentPdfFile(documentData);
  downloadFile(file);
  const customer = getCustomer(documentData.customerId);
  const subject = encodeURIComponent(`PRODAPT ${documentLabel(documentData.type)} ${documentData.number || "Draft"}`);
  const body = encodeURIComponent(`${documentSummary(documentData)}\n\nThe PDF file has downloaded as ${file.name}. Please attach it to this email.\n\nRegards,\n${state.settings.businessName}`);
  window.location.href = `mailto:${encodeURIComponent(customer?.email || "")}?subject=${subject}&body=${body}`;
}

function whatsappCurrentDocument() {
  sharePdfCurrentDocument("whatsapp");
}

async function downloadCurrentDocument() {
  const documentData = persistCurrentDocument();
  if (!documentData) return;
  renderAll();
  const file = await createDocumentPdfFile(documentData);
  downloadFile(file);
}

function printCurrentDocument() {
  const documentData = persistCurrentDocument();
  if (!documentData) return;
  renderAll();
  renderPrintPage(documentData);
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
document.querySelector("#printReceipt").addEventListener("click", () => {
  printCurrentDocument();
});
document.querySelector("#shareDocument").addEventListener("click", () => {
  sharePdfCurrentDocument("share");
});
document.querySelector("#sharePdfDocument").addEventListener("click", () => {
  sharePdfCurrentDocument("share");
});
document.querySelector("#emailDocument").addEventListener("click", emailCurrentDocument);
document.querySelector("#whatsappDocument").addEventListener("click", whatsappCurrentDocument);

if ("serviceWorker" in navigator) {
  let refreshing = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
  navigator.serviceWorker.register("service-worker.js?v=20260917-receipt-print-fix").then((registration) => {
    registration.update();
  }).catch(() => {});
}

renderAll();
