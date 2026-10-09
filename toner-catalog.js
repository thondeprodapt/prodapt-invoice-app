(function (root, factory) {
  const catalog = factory();
  if (typeof module === "object" && module.exports) module.exports = catalog;
  root.ProdaptTonerCatalog = catalog;
})(typeof window === "undefined" ? globalThis : window, function () {
  const sourceUrl = "https://prodaptsolution.co.zw/original-hp-toner-cartridges-harare/";
  const apiUrl = "https://www.prodaptsolution.co.zw/wp-json/wp/v2/pages/396?_fields=content,modified";
  const snapshot = [
    { sku: "CF281A", name: "HP 81A Original Toner Cartridge", price: 195 },
    { sku: "CF283A", name: "HP 83A Original Toner Cartridge", price: 70 },
    { sku: "CE505A", name: "HP 05A Original Toner Cartridge", price: 80 },
    { sku: "CF230A", name: "HP 30A Original Toner Cartridge", price: 70 },
    { sku: "CF259A", name: "HP 59A Original Toner Cartridge", price: 70 },
    { sku: "CE285A", name: "HP 85A Original Toner Cartridge", price: 70 },
    { sku: "L0S07AE", name: "HP 973X Original PageWide Cartridge", price: 120 },
    { sku: "CF372AM", name: "HP 304A Original Colour Toner 3-Pack", price: 120 },
    { sku: "CF410A", name: "HP 410A Black Original Toner Cartridge", price: 50 },
    { sku: "W1106A", name: "HP 106A Original Toner Cartridge", price: 50 },
    { sku: "CF237A", name: "HP 37A Original Toner Cartridge", price: 200 },
    { sku: "CF289A", name: "HP 89A Original Toner Cartridge", price: 170 },
    { sku: "CE390A", name: "HP 90A Original Toner Cartridge", price: 200 },
    { sku: "CF540A", name: "HP 203A Black Original Toner Cartridge", price: 75 },
    { sku: "CF541A", name: "HP 203A Cyan Original Toner Cartridge", price: 90 },
    { sku: "CF226A", name: "HP 26A Original Toner Cartridge", price: 100 },
    { sku: "CC364A", name: "HP 64A Original Toner Cartridge", price: 185 },
    { sku: "W1470A", name: "HP 147A Original Toner Cartridge", price: 190 },
    { sku: "CE340A", name: "HP 651A Black Original Toner Cartridge", price: 180 },
    { sku: "CE343A", name: "HP 651A Magenta Original Toner Cartridge", price: 500 },
    { sku: "CF301A", name: "HP 827A Cyan Original Toner Cartridge", price: 485 },
    { sku: "CF210A", name: "HP 131A Black Original Toner Cartridge", price: 90 }
  ].map((entry) => ({ ...entry, description: `Original HP cartridge. Part number: ${entry.sku}` }));

  function parseWebsiteHtml(markup) {
    const page = new DOMParser().parseFromString(markup, "text/html");
    const products = [...page.querySelectorAll(".pd-product")].map((card) => {
      const name = card.querySelector(".pd-title")?.textContent.trim() || "";
      const model = card.querySelector(".pd-meta")?.textContent.trim() || "";
      const priceText = card.querySelector(".pd-price")?.textContent.trim() || "";
      const sku = model.match(/\(([A-Z0-9]+)\)/i)?.[1] || model.match(/part number:\s*([A-Z0-9]+)/i)?.[1];
      const amount = priceText.match(/^USD\s+([\d,]+\.\d{2})$/i)?.[1];
      const price = amount ? Number(amount.replace(/,/g, "")) : NaN;
      if (!name.startsWith("HP ") || !sku || !Number.isFinite(price)) return null;
      return { sku: sku.toUpperCase(), name, description: `Original HP cartridge. Part number: ${sku.toUpperCase()}`, price };
    }).filter(Boolean);
    if (!products.length) throw new Error("No toner prices found on the website");
    return products;
  }

  function upsert(items, products, updateExisting = false) {
    let added = 0;
    let updated = 0;
    const bySku = new Map(items.filter((item) => item.websiteSku).map((item) => [item.websiteSku, item]));
    for (const product of products) {
      const sku = String(product.sku || "").toUpperCase();
      if (!/^[A-Z0-9]{5,12}$/.test(sku) || !Number.isFinite(product.price) || product.price < 0) continue;
      const existing = bySku.get(sku);
      if (existing) {
        if (updateExisting && (existing.name !== product.name || existing.description !== product.description || existing.price !== product.price)) {
          existing.name = product.name;
          existing.description = product.description;
          existing.price = product.price;
          updated += 1;
        }
        continue;
      }
      const item = {
        id: `website-toner-${sku.toLowerCase()}`,
        name: product.name,
        description: product.description,
        price: product.price,
        cost: 0,
        websiteSku: sku
      };
      items.push(item);
      bySku.set(sku, item);
      added += 1;
    }
    return { added, updated };
  }

  return { sourceUrl, apiUrl, snapshot, parseWebsiteHtml, upsert };
});
