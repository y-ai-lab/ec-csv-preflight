import { analyzeCsv, parseCsv } from "./csv-engine.mjs";

export const FIXER_VERSION = "0.2.0";

const COLUMN_ALIASES = {
  shopify: {
    handle: ["Handle"],
    title: ["Title"],
    optionName: ["Option1 Name"],
    optionValue: ["Option1 Value"],
    sku: ["Variant SKU"],
    price: ["Variant Price"],
    image: ["Image Src"],
    status: ["Status"],
  },
  generic: {
    handle: ["handle", "商品ID", "商品コード", "product_id", "product code"],
    title: ["商品名", "商品タイトル", "商品名称", "product_name", "product name", "name", "title"],
    optionName: ["option1 name", "オプション名", "バリエーション名"],
    optionValue: ["option1 value", "オプション値", "バリエーション値"],
    sku: ["sku", "商品SKU", "商品スku", "variant sku", "型番"],
    price: ["価格", "販売価格", "price", "selling_price", "販売金額"],
    image: ["画像URL", "画像 URL", "image_url", "image url", "image src"],
    status: ["公開状態", "status", "ステータス"],
  },
};

function text(value) {
  return value == null ? "" : String(value);
}

function normalizeHeader(value) {
  return text(value).replace(/^\uFEFF/, "").normalize("NFKC").trim().toLowerCase().replace(/\s+/g, " ");
}

function resolveColumns(headers, profileId) {
  const profile = COLUMN_ALIASES[profileId] || COLUMN_ALIASES.shopify;
  const normalized = headers.map(normalizeHeader);
  return Object.fromEntries(Object.entries(profile).map(([key, aliases]) => {
    const candidates = aliases.map(normalizeHeader);
    return [key, normalized.findIndex((header) => candidates.includes(header))];
  }));
}

function csvCell(value) {
  const source = text(value);
  if (/[",\r\n]/.test(source)) return `"${source.replaceAll('"', '""')}"`;
  return source;
}

export function serializeCsv(rows) {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}

function normalizePrice(value) {
  const source = text(value).trim();
  if (!source) return null;
  const normalized = source.replace(/[¥￥,，\s]/g, "").replace(/^\+/, "");
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return null;
  return normalized.startsWith(".") ? `0${normalized}` : normalized;
}

function normalizeStatus(value, profileId) {
  const source = text(value).trim();
  if (!source) return source;
  const lower = source.toLowerCase();
  if (["active", "draft", "archived"].includes(lower)) return lower;
  if (profileId !== "shopify") return source;
  if (source === "公開") return "active";
  if (["非公開", "下書き"].includes(source)) return "draft";
  if (source === "アーカイブ") return "archived";
  return source;
}

function recordChange(changes, row, column, before, after, reason) {
  if (before === after) return;
  changes.push({ row, column, before, after, reason });
}

function setSafeValue(row, index, rowNumber, column, transform, reason, changes) {
  if (index < 0 || index >= row.length) return;
  const before = text(row[index]);
  const after = transform(before);
  if (after == null || before === after) return;
  row[index] = after;
  recordChange(changes, rowNumber, column, before, after, reason);
}

export function createCorrectedCsv(input, profileId = "shopify") {
  const source = text(input);
  let rows;
  try {
    rows = parseCsv(source);
  } catch (error) {
    return {
      canExport: false,
      csv: "",
      changes: [],
      changeCount: 0,
      unresolved: analyzeCsv(source, profileId).issues,
      reason: error.message,
    };
  }

  if (!rows.length || !(rows[0] || []).length) {
    return {
      canExport: false,
      csv: "",
      changes: [],
      changeCount: 0,
      unresolved: analyzeCsv(source, profileId).issues,
      reason: "CSVのヘッダー行がありません。",
    };
  }

  const width = rows[0].length;
  if (rows.slice(1).some((row) => row.some((value) => text(value).trim() !== "") && row.length !== width)) {
    return {
      canExport: false,
      csv: "",
      changes: [],
      changeCount: 0,
      unresolved: analyzeCsv(source, profileId).issues,
      reason: "列数が一致しない行があるため、自動修正は停止しました。",
    };
  }

  const fixed = rows.map((row) => [...row]);
  fixed[0][0] = text(fixed[0][0]).replace(/^\uFEFF/, "");
  const headers = fixed[0].map(text);
  const columns = resolveColumns(headers, profileId);
  const changes = [];

  for (let index = 1; index < fixed.length; index += 1) {
    const row = fixed[index];
    if (!row.some((value) => text(value).trim() !== "")) continue;
    const rowNumber = index + 1;

    for (const [key, label] of [
      ["handle", "Handle／商品ID"],
      ["title", "Title／商品名"],
      ["optionName", "Option1 Name"],
      ["optionValue", "Option1 Value"],
      ["sku", "SKU"],
      ["image", "Image Src／画像URL"],
    ]) {
      setSafeValue(row, columns[key], rowNumber, label, (value) => value.trim(), "前後の空白を除去", changes);
    }

    setSafeValue(row, columns.price, rowNumber, "Variant Price／価格", normalizePrice, "通貨記号・桁区切り・余分な空白を除去", changes);
    setSafeValue(row, columns.status, rowNumber, "Status／公開状態", (value) => normalizeStatus(value, profileId), "Shopifyで受け付ける状態値へ正規化", changes);
  }

  const csv = serializeCsv(fixed);
  const result = analyzeCsv(csv, profileId);
  return {
    canExport: true,
    csv,
    changes,
    changeCount: changes.length,
    unresolved: result.issues.filter((issue) => issue.severity !== "info"),
    unresolvedCount: result.errors + result.warnings,
    result,
    reason: changes.length ? `${changes.length}件の安全な自動修正を適用しました。` : "安全に自動修正できる箇所はありませんでした。",
  };
}
