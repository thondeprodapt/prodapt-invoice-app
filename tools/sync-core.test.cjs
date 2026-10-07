const test = require("node:test");
const assert = require("node:assert/strict");
const { mergeInitial, mergeChanges } = require("../sync-core.js");

const empty = () => ({ settings: { businessName: "PRODAPT" }, customers: [], items: [], documents: [], migrations: {} });

test("initial import keeps all laptop records", () => {
  const local = empty();
  local.settings.businessTax = 15;
  local.customers.push({ id: "c1", name: "Client" });
  local.items.push({ id: "i1", name: "Service", description: "Work", price: 30 });
  local.documents.push({ id: "d1", type: "quote", number: "QT-2026-0001", customerId: "c1", lines: [{ itemId: "i1", quantity: 1, price: 30 }] });
  assert.deepEqual(mergeInitial(empty(), local).documents, local.documents);
});

test("second device does not duplicate imported items or customers", () => {
  const remote = empty();
  remote.customers.push({ id: "c1", name: "Client", email: "a@example.com" });
  remote.items.push({ id: "i1", name: "Service", description: "Work", price: 30 });
  const local = empty();
  local.customers.push({ id: "c2", name: "Client", email: "a@example.com" });
  local.items.push({ id: "i2", name: "Service", description: "Work", price: 30 });
  local.documents.push({ id: "d2", type: "invoice", number: "INV-2026-0001", customerId: "c2", lines: [{ itemId: "i2" }] });
  const result = mergeInitial(remote, local);
  assert.equal(result.customers.length, 1);
  assert.equal(result.items.length, 1);
  assert.equal(result.documents[0].customerId, "c1");
  assert.equal(result.documents[0].lines[0].itemId, "i1");
});

test("concurrent device changes preserve both additions", () => {
  const base = empty();
  const remote = empty();
  remote.customers.push({ id: "c1", name: "Remote" });
  const local = empty();
  local.items.push({ id: "i1", name: "Local", price: 5 });
  const result = mergeChanges(remote, base, local);
  assert.equal(result.customers.length, 1);
  assert.equal(result.items.length, 1);
});

test("explicit local deletion syncs without dropping a remote addition", () => {
  const base = empty();
  base.customers.push({ id: "c1", name: "Old" });
  const remote = structuredClone(base);
  remote.customers.push({ id: "c2", name: "New" });
  const local = empty();
  assert.deepEqual(mergeChanges(remote, base, local).customers.map((entry) => entry.id), ["c2"]);
});

test("a new document gets a unique number after a collision", () => {
  const remote = empty();
  remote.documents.push({ id: "d1", type: "quote", number: "QT-2026-0001", lines: [] });
  const local = empty();
  local.documents.push({ id: "d2", type: "quote", number: "QT-2026-0001", lines: [] });
  assert.equal(mergeInitial(remote, local).documents[1].number, "QT-2026-0002");
});
