import fs from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);

if (!inputPath || !outputPath) {
  console.error("Usage: node generate-customers-import.mjs <customers.csv> <customers-import.js>");
  process.exit(1);
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === "\"" && inQuotes && next === "\"") {
      value += "\"";
      index += 1;
    } else if (char === "\"") {
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

function normalizeHeader(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function clean(value) {
  return String(value || "")
    .replace(/[\u202A-\u202E\u200E\u200F]/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanAddressPart(value) {
  return clean(value).replace(/,\s*/g, ", ");
}

function compactKey(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const rows = parseCsv(fs.readFileSync(inputPath, "utf8"));
const headers = rows.shift().map(normalizeHeader);

const customers = rows.map((row) => {
  const record = {};
  headers.forEach((header, index) => {
    record[header] = row[index] || "";
  });

  const company = clean(record.company);
  const firstName = clean(record.firstname);
  const lastName = clean(record.lastname);
  const contactName = clean([firstName, lastName].filter(Boolean).join(" "));
  const name = company || contactName || clean(record.email) || clean(record.phone) || clean(record.mobile) || "Imported Customer";
  const contact = company && contactName && compactKey(company) !== compactKey(contactName) ? contactName : "";
  const phone = clean(record.mobile || record.phone || record.tollfree);
  const address = [
    record.billingaddress1,
    record.billingaddress2,
    record.billingcity,
    record.billingprovince,
    record.billingcountry,
    record.billingpostalcode
  ].map(cleanAddressPart).filter(Boolean).join("\n");

  return {
    sourceId: clean(record.id),
    name,
    company: contact,
    phone,
    email: clean(record.email),
    address,
    balance: Number(record.balance) || 0,
    overdue: Number(record.overdue) || 0,
    createdAt: clean(record.createdat)
  };
}).filter((customer) => customer.name).sort((a, b) => a.name.localeCompare(b.name));

fs.writeFileSync(
  outputPath,
  `window.PRODAPT_IMPORTED_CUSTOMERS = ${JSON.stringify(customers, null, 2)};\n`,
  "utf8"
);

console.log(`Wrote ${customers.length} customers to ${outputPath}`);
