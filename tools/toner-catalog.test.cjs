const test = require("node:test");
const assert = require("node:assert/strict");
const catalog = require("../toner-catalog.js");
const { mergeInitial } = require("../sync-core.js");

test("bundled catalogue has 22 unique website cartridges and prices", () => {
  assert.equal(catalog.snapshot.length, 22);
  assert.equal(new Set(catalog.snapshot.map((item) => item.sku)).size, 22);
  assert.equal(catalog.snapshot.find((item) => item.sku === "CF281A").price, 195);
  assert.equal(catalog.snapshot.find((item) => item.sku === "CF301A").price, 485);
});

test("website items are additive and a live price change keeps their IDs", () => {
  const manual = { id: "manual-hp", name: "HP", description: "Original 30A", price: 85, cost: 40 };
  const items = [manual];
  assert.deepEqual(catalog.upsert(items, catalog.snapshot), { added: 22, updated: 0 });
  assert.equal(items.length, 23);
  assert.deepEqual(items[0], manual);
  const toner = items.find((item) => item.websiteSku === "CF230A");
  const changed = catalog.snapshot.map((item) => item.sku === "CF230A" ? { ...item, price: 72 } : item);
  assert.deepEqual(catalog.upsert(items, changed, true), { added: 0, updated: 1 });
  assert.equal(toner.id, "website-toner-cf230a");
  assert.equal(toner.price, 72);
  assert.equal(items[0].price, 85);
});

test("same website SKU from another device does not duplicate the item", () => {
  const remote = { settings: {}, customers: [], items: [], documents: [], migrations: {} };
  const local = structuredClone(remote);
  catalog.upsert(remote.items, catalog.snapshot);
  catalog.upsert(local.items, catalog.snapshot.map((item) => item.sku === "CF230A" ? { ...item, price: 72 } : item));
  assert.equal(mergeInitial(remote, local).items.length, 22);
});

test("website parser reads a cartridge model and USD price", () => {
  const card = {
    querySelector(selector) {
      const values = { ".pd-title": "HP 81A Original Toner Cartridge", ".pd-meta": "Model: HP 81A (CF281A)", ".pd-price": "USD 195.00" };
      return { textContent: values[selector] };
    }
  };
  const originalParser = global.DOMParser;
  global.DOMParser = class { parseFromString() { return { querySelectorAll: () => [card] }; } };
  try {
    assert.deepEqual(catalog.parseWebsiteHtml("<article></article>"), [catalog.snapshot[0]]);
  } finally {
    global.DOMParser = originalParser;
  }
});
