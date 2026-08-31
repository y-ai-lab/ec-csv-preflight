export const ENGINE_VERSION = "0.1.0";

const SHOPIFY_COLUMNS = {
  handle: ["Handle"],
  title: ["Title"],
  optionName: ["Option1 Name"],
  optionValue: ["Option1 Value"],
  sku: ["Variant SKU"],
  price: ["Variant Price"],
  image: ["Image Src"],
  status: ["Status"],
};

const GENERIC_COLUMNS = {
  handle: ["handle", "商品ID", "商品コード", "product_id", "product code"],
  title: ["商品名", "商品タイトル", "商品名称", "product_name", "product name", "name", "title"],
  optionName: ["option1 name", "オプション名", "バリエーション名"],
  optionValue: ["option1 value", "オプション値", "バリエーション値"],
  sku: ["sku", "商品SKU", "商品スku", "variant sku", "型番"],
  price: ["価格", "販売価格", "price", "selling_price", "販売金額"],
  image: ["画像URL", "画像 URL", "image_url", "image url", "image src"],
  status: ["公開状態", "status", "ステータス"],
};

export const PROFILES = Object.freeze({
  shopify: Object.freeze({
    id: "shopify",
    label: "Shopify商品CSV（MVPチェック）",
    columns: SHOPIFY_COLUMNS,
    required: ["handle", "title"],
    note: "Shopify公式CSVの代表的な列名を対象に、取込前の構造・値の不整合を確認します。",
  }),
  generic: Object.freeze({
    id: "generic",
    label: "汎用EC商品CSV",
    columns: GENERIC_COLUMNS,
    required: ["title", "price"],
    note: "日本語・英語のよくある商品名／価格列を推定し、EC登録前の基本的な欠損・重複を確認します。",
  }),
});

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function text(value) {
  return value == null ? "" : String(value);
}

function normalizeHeader(value) {
  return text(value)
    .replace(/^\uFEFF/, "")
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function cleanValue(value) {
  return text(value).replace(/^\uFEFF/, "").trim();
}

function isBlank(value) {
  return cleanValue(value) === "";
}

function isNonEmptyRow(values) {
  return values.some((value) => !isBlank(value));
}

function rowLabel(rows) {
  if (!rows?.length) return "行番号なし";
  const shown = rows.slice(0, 8).join(", ");
  return rows.length > 8 ? `${shown}ほか${rows.length - 8}行` : shown;
}

function addIssue(issues, severity, code, title, detail, rows = []) {
  const key = `${severity}:${code}`;
  const existing = issues.find((issue) => issue.key === key);
  if (existing) {
    existing.rows = [...new Set([...existing.rows, ...rows])].sort((a, b) => a - b);
    existing.rowCount = existing.rows.length;
    return existing;
  }
  const issue = {
    key,
    severity,
    code,
    title,
    detail,
    rows: [...new Set(rows)].sort((a, b) => a - b),
    rowCount: rows.length,
  };
  issues.push(issue);
  return issue;
}

/**
 * Small CSV parser for local browser use. It supports commas, quoted cells,
 * escaped quotes, CRLF/LF line endings, and newlines inside quoted cells.
 */
export function parseCsv(input) {
  const source = text(input);
  if (source === "") return [];

  const rows = [];
  let row = [];
  let cell = "";
  let inQuotes = false;
  let justClosedQuote = false;

  const pushCell = () => {
    row.push(cell);
    cell = "";
  };

  const pushRow = () => {
    pushCell();
    rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (inQuotes) {
      if (character === '"') {
        if (next === '"') {
          cell += '"';
          index += 1;
        } else {
          inQuotes = false;
          justClosedQuote = true;
        }
      } else {
        cell += character;
      }
      continue;
    }

    if (justClosedQuote) {
      if (character === ",") {
        pushCell();
        justClosedQuote = false;
        continue;
      }
      if (character === "\n" || character === "\r") {
        if (character === "\r" && next === "\n") index += 1;
        pushRow();
        justClosedQuote = false;
        continue;
      }
      // Be forgiving of a space or other text after a quoted cell. The
      // resulting cell is still reported by the value-level checks if needed.
      cell += character;
      justClosedQuote = false;
      continue;
    }

    if (character === '"' && cell === "") {
      inQuotes = true;
    } else if (character === ",") {
      pushCell();
    } else if (character === "\n" || character === "\r") {
      if (character === "\r" && next === "\n") index += 1;
      pushRow();
    } else {
      cell += character;
    }
  }

  if (inQuotes) {
    throw new Error("CSVの引用符が閉じられていません。");
  }

  if (cell !== "" || row.length > 0 || justClosedQuote) {
    pushRow();
  }

  return rows;
}

function getProfile(profileId) {
  return PROFILES[profileId] || PROFILES.shopify;
}

function resolveColumns(headers, profile) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const columns = {};
  for (const [key, aliases] of Object.entries(profile.columns)) {
    const normalizedAliases = aliases.map(normalizeHeader);
    columns[key] = normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
  }
  return columns;
}

function valueAt(values, index) {
  return index >= 0 ? cleanValue(values[index]) : "";
}

function parsePrice(value) {
  const normalized = cleanValue(value)
    .replace(/[¥￥,，\s]/g, "")
    .replace(/^\+/, "");
  if (!normalized) return null;
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

function valueLooksSuspicious(value) {
  return /^(#(?:N\/A|REF!|VALUE!|DIV\/0!)|undefined|null)$/i.test(cleanValue(value));
}

function makeResult({ profile, source, headers = [], columns = {}, dataRows = [], issues = [], parseError = false }) {
  const sortedIssues = [...issues].sort((a, b) => {
    const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    return severity || a.code.localeCompare(b.code);
  });
  const errors = sortedIssues.filter((issue) => issue.severity === "error");
  const warnings = sortedIssues.filter((issue) => issue.severity === "warning");
  const status = errors.length || parseError ? "HOLD" : warnings.length ? "REVIEW" : "PASS";
  const handles = new Set();
  for (const row of dataRows) {
    const handle = valueAt(row.values, columns.handle ?? -1);
    if (handle) handles.add(handle);
  }

  return {
    engineVersion: ENGINE_VERSION,
    generatedAt: new Date().toISOString(),
    profileId: profile.id,
    profileLabel: profile.label,
    profileNote: profile.note,
    status,
    summary: status === "PASS"
      ? "取込前に検出すべき問題はありません。"
      : status === "REVIEW"
        ? "取込前に確認したい注意点があります。"
        : "このままの取込は止め、問題を修正してから再確認してください。",
    source: {
      characters: source.length,
      hasReplacementCharacter: source.includes("\uFFFD"),
      localOnly: true,
    },
    headers,
    columns,
    rows: dataRows.length,
    productGroups: handles.size,
    errors: errors.length,
    warnings: warnings.length,
    issues: sortedIssues,
  };
}

export function analyzeCsv(input, profileId = "shopify") {
  const source = text(input);
  const profile = getProfile(profileId);
  const issues = [];

  if (!source.trim()) {
    addIssue(issues, "error", "EMPTY_INPUT", "CSVが空です", "CSVファイルを選択するか、テキストを貼り付けてください。");
    return makeResult({ profile, source, issues });
  }

  if (source.includes("\uFFFD")) {
    addIssue(issues, "warning", "ENCODING_SUSPECTED", "文字コードを確認してください", "置換文字（�）を検出しました。Shopifyの商品CSVはUTF-8で保存してから再確認してください。");
  }

  let rows;
  try {
    rows = parseCsv(source);
  } catch (error) {
    addIssue(issues, "error", "CSV_PARSE_ERROR", "CSVを解析できません", error.message);
    return makeResult({ profile, source, issues, parseError: true });
  }

  const headers = (rows[0] || []).map((header, index) => index === 0 ? text(header).replace(/^\uFEFF/, "") : text(header));
  if (!headers.length || headers.every(isBlank)) {
    addIssue(issues, "error", "EMPTY_HEADER", "ヘッダー行がありません", "1行目に列名を置いたCSVを指定してください。");
    return makeResult({ profile, source, headers, issues });
  }

  const seenHeaders = new Map();
  headers.forEach((header, index) => {
    const normalized = normalizeHeader(header);
    if (!normalized) {
      addIssue(issues, "warning", "BLANK_HEADER", "空の列名があります", `列${index + 1}の列名が空です。`);
      return;
    }
    if (seenHeaders.has(normalized)) {
      addIssue(issues, "error", "DUPLICATE_HEADER", "列名が重複しています", `「${text(header).trim()}」が複数あります。列名を一意にしてください。`, [1]);
    } else {
      seenHeaders.set(normalized, index);
    }
  });

  const columns = resolveColumns(headers, profile);
  for (const required of profile.required) {
    if (columns[required] < 0) {
      addIssue(issues, "error", `MISSING_COLUMN_${required.toUpperCase()}`, "必要な列がありません", `${profile.label}で確認する「${required === "handle" ? "Handle／商品ID" : required === "title" ? "Title／商品名" : "Price／価格"}」列が見つかりません。`);
    }
  }

  const expectedWidth = headers.length;
  const dataRows = rows.slice(1)
    .map((values, offset) => ({ values, rowNumber: offset + 2 }))
    .filter((row) => isNonEmptyRow(row.values));

  const malformedRows = dataRows.filter((row) => row.values.length !== expectedWidth);
  if (malformedRows.length) {
    addIssue(
      issues,
      "error",
      "ROW_WIDTH_MISMATCH",
      "列数が合わない行があります",
      `ヘッダーは${expectedWidth}列ですが、${malformedRows.length}行で列数が異なります。価格の桁区切りやカンマを含む値は引用符で囲んでください。`,
      malformedRows.map((row) => row.rowNumber),
    );
  }

  const seenSkus = new Map();
  const seenHandles = new Set();
  const missingHandles = [];
  const missingTitles = [];
  const missingPrices = [];
  const invalidPrices = [];
  const negativePrices = [];
  const invalidImages = [];
  const suspiciousValues = [];
  const incompleteOptions = [];
  const invalidStatuses = [];

  for (const row of dataRows) {
    const handle = valueAt(row.values, columns.handle ?? -1);
    const title = valueAt(row.values, columns.title ?? -1);
    const sku = valueAt(row.values, columns.sku ?? -1);
    const price = valueAt(row.values, columns.price ?? -1);
    const optionName = valueAt(row.values, columns.optionName ?? -1);
    const optionValue = valueAt(row.values, columns.optionValue ?? -1);
    const image = valueAt(row.values, columns.image ?? -1);
    const status = valueAt(row.values, columns.status ?? -1).toLowerCase();

    if (columns.handle >= 0 && !handle) missingHandles.push(row.rowNumber);

    const isFirstProductRow = handle ? !seenHandles.has(handle) : true;
    if (columns.title >= 0 && !title && (profile.id === "generic" || isFirstProductRow)) {
      missingTitles.push(row.rowNumber);
    }
    if (handle) seenHandles.add(handle);

    if (columns.price >= 0) {
      if (!price) {
        missingPrices.push(row.rowNumber);
      } else {
        const parsedPrice = parsePrice(price);
        if (Number.isNaN(parsedPrice)) invalidPrices.push(row.rowNumber);
        else if (parsedPrice < 0) negativePrices.push(row.rowNumber);
      }
    }

    if (sku) {
      if (seenSkus.has(sku)) {
        seenSkus.get(sku).push(row.rowNumber);
      } else {
        seenSkus.set(sku, [row.rowNumber]);
      }
    }

    if ((optionName && !optionValue) || (!optionName && optionValue)) {
      incompleteOptions.push(row.rowNumber);
    }

    if (image && !/^https?:\/\/[^\s]+$/i.test(image)) {
      invalidImages.push(row.rowNumber);
    }

    if (status && !["active", "draft", "archived", "公開", "非公開", "下書き"].includes(status)) {
      invalidStatuses.push(row.rowNumber);
    }

    if ([handle, title, sku, price, optionName, optionValue, image, status].some(valueLooksSuspicious)) {
      suspiciousValues.push(row.rowNumber);
    }
  }

  if (missingHandles.length) addIssue(issues, "error", "MISSING_HANDLE_VALUE", "商品ID／Handleが空の行があります", "各商品・バリエーション行を同じ商品ID／Handleで結び、空欄を残さないでください。", missingHandles);
  if (missingTitles.length) addIssue(issues, "error", "MISSING_TITLE_VALUE", "商品名／Titleが空の先頭行があります", "新しい商品グループの先頭行には商品名／Titleを入れてください。バリエーション行のTitle空欄は許容しています。", missingTitles);
  if (missingPrices.length) addIssue(issues, "warning", "MISSING_PRICE_VALUE", "価格が空の行があります", "無料商品など意図した空欄でなければ、販売価格を補ってください。", missingPrices);
  if (invalidPrices.length) addIssue(issues, "error", "INVALID_PRICE_VALUE", "価格を数値として読めない行があります", "通貨記号や桁区切りは確認し、文字列・数式エラー・余計な文字を除去してください。", invalidPrices);
  if (negativePrices.length) addIssue(issues, "error", "NEGATIVE_PRICE_VALUE", "負の価格があります", "価格が0未満です。値を確認してください。", negativePrices);

  const duplicateSkuRows = [...seenSkus.values()].filter((rowsForSku) => rowsForSku.length > 1).flat();
  if (duplicateSkuRows.length) addIssue(issues, "warning", "DUPLICATE_SKU", "SKUが重複しています", "SKUは在庫・受注連携で識別子になるため、同じSKUを意図しているか確認してください。", duplicateSkuRows);
  if (incompleteOptions.length) addIssue(issues, "warning", "INCOMPLETE_OPTION_PAIR", "バリエーション列が片方だけ埋まっています", "Option1 Name／Option1 Value（またはオプション名／値）はペアで入力してください。", incompleteOptions);
  if (invalidImages.length) addIssue(issues, "warning", "INVALID_IMAGE_URL", "画像URLの形式を確認してください", "画像URLはhttpまたはhttpsで始まる完全なURLにしてください。", invalidImages);
  if (invalidStatuses.length) addIssue(issues, "warning", "UNKNOWN_STATUS", "公開状態の値を確認してください", "想定外の公開状態が含まれています。取込先の許容値に合わせてください。", invalidStatuses);
  if (suspiciousValues.length) addIssue(issues, "warning", "SPREADSHEET_ERROR_VALUE", "表計算ソフトのエラー値らしき文字があります", "#N/A・#REF!・undefined・nullなどを検出しました。意図した文字でなければ修正してください。", suspiciousValues);

  if (profile.id === "shopify" && columns.sku >= 0 && columns.optionName < 0 && columns.optionValue < 0) {
    addIssue(issues, "info", "VARIANT_CONTEXT_NOTE", "バリエーション列の前提を確認してください", "SKUや価格を含む場合、Option1 Name／Option1 Valueなど、取込先のバリエーション構造と対応しているか確認してください。");
  }

  return makeResult({ profile, source, headers, columns, dataRows, issues });
}

export function createMarkdownReport(result) {
  const lines = [
    "# EC商品CSV 取込前チェックレポート",
    "",
    `- 判定: **${result.status}**`,
    `- プロファイル: ${result.profileLabel}`,
    `- 対象行数: ${result.rows}`,
    `- 商品グループ数: ${result.productGroups}`,
    `- エラー: ${result.errors}`,
    `- 注意: ${result.warnings}`,
    `- 実行日時: ${result.generatedAt}`,
    "",
    "> このレポートはCSVをブラウザ内だけで処理して作成しています。CSVの内容は送信・保存していません。",
    "",
    "## 検出事項",
    "",
  ];

  if (!result.issues.length) {
    lines.push("問題は検出されませんでした。取込先の最新テンプレートと運用ルールも確認してください。", "");
  } else {
    for (const issue of result.issues) {
      const rows = issue.rows.length ? ` 対象行: ${rowLabel(issue.rows)}。` : "";
      lines.push(`- **${issue.severity.toUpperCase()} / ${issue.code}** ${issue.title}: ${issue.detail}${rows}`);
    }
    lines.push("");
  }

  lines.push(
    "## 制約",
    "",
    "- このMVPは取込の成功を保証せず、事前確認の論点を抽出します。",
    "- CSVの文字コードはUTF-8を推奨します。ブラウザだけでは元ファイルの文字コードを完全には判定できません。",
    "- 個人情報・顧客情報を含むCSVは、利用者の組織ルールに従って取り扱ってください。",
  );
  return lines.join("\n");
}

export const SAMPLE_CSV_SHOPIFY = [
  "Handle,Title,Option1 Name,Option1 Value,Variant SKU,Variant Price,Image Src",
  "coffee-mug,Coffee Mug,Color,White,CM-WHT,1980,https://example.com/coffee-white.jpg",
  "coffee-mug,,Color,Black,CM-WHT,1980,https://example.com/coffee-black.jpg",
  "coffee-plate,Ceramic Plate,,,CP-01,not-a-price,not-a-url",
].join("\n");

export const SAMPLE_CSV_GENERIC = [
  "商品ID,商品名,SKU,販売価格,画像URL",
  "A-001,ノート,NOTE-001,980,https://example.com/note.jpg",
  "A-002,ペン,PEN-001,150,https://example.com/pen.jpg",
].join("\n");

