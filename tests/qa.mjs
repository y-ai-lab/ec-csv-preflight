import assert from "node:assert/strict";
import { analyzeCsv, createMarkdownReport, parseCsv } from "../src/csv-engine.mjs";

const validShopify = [
  "Handle,Title,Option1 Name,Option1 Value,Variant SKU,Variant Price,Image Src",
  "mug,Cup,Color,White,MUG-W,1980,https://example.com/mug.jpg",
  "mug,,Color,Black,MUG-B,1980,https://example.com/mug-black.jpg",
].join("\r\n");

const valid = analyzeCsv(validShopify, "shopify");
assert.equal(valid.status, "PASS");
assert.equal(valid.rows, 2);
assert.equal(valid.productGroups, 1);
assert.equal(valid.errors, 0);

const quoted = parseCsv('id,name,price\n1,"ノート,青",980\n');
assert.deepEqual(quoted[1], ["1", "ノート,青", "980"]);

const bad = analyzeCsv([
  "Handle,Title,Option1 Name,Option1 Value,Variant SKU,Variant Price,Image Src",
  "mug,Cup,Color,,DUP,1,980,https://example.com/mug.jpg",
  "plate,Plate,,,DUP,broken,bad-url",
].join("\n"), "shopify");
assert.equal(bad.status, "HOLD");
for (const code of ["ROW_WIDTH_MISMATCH", "INCOMPLETE_OPTION_PAIR", "DUPLICATE_SKU", "INVALID_PRICE_VALUE", "INVALID_IMAGE_URL"]) {
  assert.ok(bad.issues.some((issue) => issue.code === code), `missing ${code}`);
}

const generic = analyzeCsv([
  "商品ID,商品名,SKU,販売価格,画像URL",
  "A-1,ボールペン,BP-1,120,https://example.com/pen.jpg",
].join("\n"), "generic");
assert.equal(generic.status, "PASS");
assert.equal(generic.productGroups, 1);

const missingColumn = analyzeCsv("Handle,Variant Price\na,100\n", "shopify");
assert.equal(missingColumn.status, "HOLD");
assert.ok(missingColumn.issues.some((issue) => issue.code === "MISSING_COLUMN_TITLE"));

const empty = analyzeCsv("", "shopify");
assert.equal(empty.status, "HOLD");
assert.ok(empty.issues.some((issue) => issue.code === "EMPTY_INPUT"));

const report = createMarkdownReport(bad);
assert.match(report, /EC商品CSV/);
assert.match(report, /ROW_WIDTH_MISMATCH/);
assert.doesNotMatch(report, /<script>/i);

console.log("ec-csv-preflight QA: PASS");
