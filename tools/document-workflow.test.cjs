const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");

function openApp() {
  const seed = {
    settings: { businessName: "Existing Company", businessCurrency: "$", businessTax: 15, customSetting: "keep" },
    customers: [{ id: "c1", name: "Existing Client", extra: "keep" }],
    items: [{ id: "i1", name: "Existing Item", description: "Details", price: 30, cost: 10 }],
    documents: [{ id: "old", type: "quote", number: "QT-2026-0001", date: "2026-10-01", customerId: "c1", lines: [{ itemId: "i1", quantity: 2, price: 25 }], notes: "Existing terms", customField: "keep" }],
    migrations: { customMigration: true }
  };
  const elements = new Map();
  const storage = new Map([["prodapt.invoice.studio.v1", JSON.stringify(seed)]]);
  function element(selector) {
    if (!elements.has(selector)) elements.set(selector, {
      value: "", innerHTML: "", textContent: "", hidden: false, disabled: false, style: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {}, setAttribute() {}, removeAttribute() {},
      setCustomValidity(message) { this.validationMessage = message; },
      reportValidity() { return this.disabled || !this.validationMessage; }
    });
    return elements.get(selector);
  }
  const context = vm.createContext({
    console, Blob, TextEncoder, URL, Event,
    setTimeout: () => 1, setInterval: () => 1,
    localStorage: { getItem: (key) => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    window: { location: { protocol: "file:" }, addEventListener() {}, dispatchEvent() {}, scrollTo() {} },
    navigator: {},
    document: { querySelector: element, querySelectorAll: () => [], addEventListener() {} }
  });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../app.js"), "utf8"), context);
  return {
    run: (code) => vm.runInContext(code, context),
    state: () => JSON.parse(vm.runInContext("JSON.stringify(state)", context)),
    element,
    saved: () => JSON.parse(storage.get("prodapt.invoice.studio.v1"))
  };
}

test("new document and opening legacy records preserve every existing record and extra field", () => {
  const app = openApp();
  const before = app.state();
  app.run("openDocument('old'); startNewDocument('invoice'); startNewDocument('receipt')");
  assert.deepEqual(app.state(), before);
  assert.equal(app.run("draft.type"), "receipt");
  assert.equal(app.run("draft.id"), null);
});

test("saving and starting another quotation keeps the first saved document intact", () => {
  const app = openApp();
  const original = app.state().documents[0];
  app.run("startNewDocument('quote')");
  app.element("#docDate").value = "2026-10-13";
  app.element("#docExpiry").value = "2026-10-31";
  app.run("persistCurrentDocument(); renderAll()");
  const saved = app.saved().documents[1];
  assert.equal(saved.expiresOn, "2026-10-31");
  assert.equal(app.element("#savedDocumentActions").hidden, false);
  app.run("startNewDocument('quote'); persistCurrentDocument(); renderAll()");
  assert.equal(app.saved().documents.length, 3);
  assert.deepEqual(app.saved().documents[0], original);
  assert.deepEqual(app.saved().documents[1], saved);
  assert.notEqual(app.saved().documents[2].number, saved.number);
  app.run(`openDocument(${JSON.stringify(saved.id)})`);
  assert.equal(app.element("#docExpiry").value, "2026-10-31");
  assert.match(app.element("#printPage").innerHTML, /Expires on:.*2026-10-31/);
});

test("invalid quotation expiry is rejected without changing records; invoices do not require it", () => {
  const app = openApp();
  const before = app.state();
  app.element("#docDate").value = "2026-10-13";
  app.element("#docExpiry").value = "2026-10-12";
  assert.equal(app.run("persistCurrentDocument()"), null);
  assert.deepEqual(app.state(), before);
  app.run("startNewDocument('invoice')");
  assert.equal(app.element("#quoteExpiryRow").hidden, true);
  assert.ok(app.run("persistCurrentDocument()"));
});

test("saved document type filters and customer search do not mutate stored data", () => {
  const app = openApp();
  app.run("startNewDocument('invoice'); persistCurrentDocument(); startNewDocument('receipt'); persistCurrentDocument()");
  const before = app.state();
  app.run("documentFilter = 'invoice'; renderDocumentRecords()");
  assert.match(app.element("#documentRecordList").innerHTML, /Invoice INV-/);
  assert.doesNotMatch(app.element("#documentRecordList").innerHTML, /Quotation QT-|Receipt RCT-/);
  app.element("#recordDocumentSearch").value = "No such customer";
  app.run("renderDocumentRecords()");
  assert.match(app.element("#documentRecordList").innerHTML, /No matching documents/);
  assert.deepEqual(app.state(), before);
});
