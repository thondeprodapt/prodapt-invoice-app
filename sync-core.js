(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  root.ProdaptSyncCore = core;
})(typeof window === "undefined" ? globalThis : window, function () {
  const copy = (value) => JSON.parse(JSON.stringify(value));
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const lower = (value) => String(value || "").trim().toLocaleLowerCase();

  function customerKey(customer) {
    const source = String(customer.sourceId || customer.importedSourceId || "").trim();
    if (source) return `source:${source}`;
    const name = lower(customer.name);
    const email = lower(customer.email);
    const phone = lower(customer.phone);
    return name && (email || phone) ? `contact:${name}|${email}|${phone}` : "";
  }

  function itemKey(item) {
    if (item.websiteSku) return `website:${String(item.websiteSku).toUpperCase()}`;
    return `${lower(item.name)}|${lower(item.description)}|${Number(item.price || 0).toFixed(2)}`;
  }

  function nextNumber(documents, documentData) {
    const original = String(documentData.number || "");
    if (!original || !documents.some((entry) => entry.type === documentData.type && entry.number === original)) {
      return original;
    }
    const parts = original.match(/^([A-Z]+)-(\d{4})-(\d+)$/);
    if (!parts) return `${original}-${documentData.id.slice(0, 6)}`;
    const prefix = `${parts[1]}-${parts[2]}-`;
    const max = documents.reduce((value, entry) => {
      if (entry.type !== documentData.type || !String(entry.number || "").startsWith(prefix)) return value;
      return Math.max(value, Number(String(entry.number).slice(prefix.length)) || 0);
    }, 0);
    return `${prefix}${String(max + 1).padStart(Math.max(4, parts[3].length), "0")}`;
  }

  function mergeInitial(remoteState, localState) {
    const merged = copy(remoteState);
    const customerIds = new Map();
    const itemIds = new Map();
    const customerByKey = new Map(merged.customers.map((entry) => [customerKey(entry), entry]).filter(([key]) => key));
    const itemByKey = new Map(merged.items.map((entry) => [itemKey(entry), entry]));

    for (const customer of localState.customers) {
      const existing = merged.customers.find((entry) => entry.id === customer.id) || customerByKey.get(customerKey(customer));
      if (existing) {
        customerIds.set(customer.id, existing.id);
        for (const [key, value] of Object.entries(customer)) {
          if (!existing[key] && value) existing[key] = value;
        }
      } else {
        const added = copy(customer);
        merged.customers.push(added);
        customerIds.set(customer.id, added.id);
        if (customerKey(added)) customerByKey.set(customerKey(added), added);
      }
    }

    for (const item of localState.items) {
      const existing = merged.items.find((entry) => entry.id === item.id) || itemByKey.get(itemKey(item));
      if (existing) {
        itemIds.set(item.id, existing.id);
        if (!existing.cost && item.cost) existing.cost = item.cost;
      } else {
        const added = copy(item);
        merged.items.push(added);
        itemIds.set(item.id, added.id);
        itemByKey.set(itemKey(added), added);
      }
    }

    for (const documentData of localState.documents) {
      if (merged.documents.some((entry) => entry.id === documentData.id)) continue;
      const added = copy(documentData);
      added.customerId = customerIds.get(added.customerId) || added.customerId;
      added.lines = added.lines.map((line) => ({ ...line, itemId: itemIds.get(line.itemId) || line.itemId }));
      added.number = nextNumber(merged.documents, added);
      merged.documents.push(added);
    }
    merged.migrations = { ...merged.migrations, ...localState.migrations };
    return merged;
  }

  function mergeChanges(remoteState, baseState, localState) {
    const merged = copy(remoteState);
    for (const name of ["customers", "items", "documents"]) {
      const base = new Map((baseState[name] || []).map((entry) => [entry.id, entry]));
      const local = new Map((localState[name] || []).map((entry) => [entry.id, entry]));
      merged[name] = merged[name].filter((entry) => !base.has(entry.id) || local.has(entry.id));
      for (const entry of localState[name] || []) {
        if (base.has(entry.id) && same(base.get(entry.id), entry)) continue;
        const index = merged[name].findIndex((saved) => saved.id === entry.id);
        const changed = copy(entry);
        if (index >= 0) merged[name][index] = changed;
        else {
          if (name === "documents") changed.number = nextNumber(merged.documents, changed);
          merged[name].push(changed);
        }
      }
    }
    for (const [key, value] of Object.entries(localState.settings || {})) {
      if (!same(baseState.settings?.[key], value)) merged.settings[key] = copy(value);
    }
    merged.migrations = { ...merged.migrations, ...localState.migrations };
    return merged;
  }

  return { mergeInitial, mergeChanges, same };
});
