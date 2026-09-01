export const DELIVERY_PACK_VERSION = "0.3.0";

function text(value) {
  return value == null ? "" : String(value);
}

function rowsLabel(rows = []) {
  if (!rows.length) return "—";
  return rows.slice(0, 30).join(", ") + (rows.length > 30 ? ` ほか${rows.length - 30}行` : "");
}

export function createNeedsReviewMarkdown(result, correction) {
  const unresolved = correction?.unresolved || result?.issues?.filter((issue) => issue.severity !== "info") || [];
  const lines = [
    "# Shopify CSV NEEDS_REVIEW一覧",
    "",
    `- 最終判定: **${correction?.result?.status || result?.status || "HOLD"}**`,
    `- 未解決件数: ${unresolved.length}`,
    `- 作成日時: ${correction?.result?.generatedAt || result?.generatedAt || new Date().toISOString()}`,
    "",
    "> 商品名・Handle・SKU・欠損価格・画像URL・Variant内容など、推測すると誤登録につながる項目は自動修正していません。",
    "",
  ];
  if (!unresolved.length) {
    lines.push("NEEDS_REVIEWはありません。Shopifyの検証環境で最終確認してください。", "");
  } else {
    lines.push("| 判定 | コード | 内容 | 対象行 |", "|---|---|---|---|");
    for (const issue of unresolved) {
      lines.push(`| ${text(issue.severity).toUpperCase()} | ${text(issue.code)} | ${text(issue.title).replaceAll("|", "／")} | ${rowsLabel(issue.rows)} |`);
    }
    lines.push("");
  }
  lines.push("## 人間確認ルール", "", "- 商品の意味が変わる判断は顧客へ確認する", "- 値を創作しない", "- Shopify本番インポート前にバックアップと少数テストを行う");
  return lines.join("\n");
}

export function createChangeLogMarkdown(correction) {
  const changes = correction?.changes || [];
  const lines = [
    "# Shopify CSV 安全修正ログ",
    "",
    `- 安全修正件数: ${changes.length}`,
    "- 自動修正範囲: 前後空白、BOM、明確な価格表記、Shopify Status、安全な文字列正規化",
    "",
  ];
  if (!changes.length) {
    lines.push("適用した自動修正はありません。", "");
  } else {
    lines.push("| 行 | 列 | 修正理由 | 修正前 | 修正後 |", "|---:|---|---|---|---|");
    for (const change of changes) {
      lines.push(`| ${change.row} | ${text(change.column).replaceAll("|", "／")} | ${text(change.reason).replaceAll("|", "／")} | ${text(change.before).replaceAll("|", "／")} | ${text(change.after).replaceAll("|", "／")} |`);
    }
  }
  return lines.join("\n");
}

export function createDeliveryBundle(result, correction) {
  return {
    schemaVersion: "1.0",
    deliveryPackVersion: DELIVERY_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    status: correction?.result?.status || result?.status || "HOLD",
    summary: {
      rows: result?.rows || 0,
      productGroups: result?.productGroups || 0,
      safeChanges: correction?.changeCount || 0,
      unresolved: correction?.unresolvedCount ?? ((result?.errors || 0) + (result?.warnings || 0)),
    },
    changes: correction?.changes || [],
    needsReview: correction?.unresolved || [],
    safeguards: {
      localOnly: true,
      guessedValues: false,
      externalApi: false,
      paidDependency: false,
    },
    humanFinalCheck: [
      "商品CSVであり顧客・注文・認証情報を含まない",
      "自動修正で商品の意味が変わっていない",
      "NEEDS_REVIEWを顧客へ明示した",
      "本番前に少数テストとバックアップを行う",
    ],
  };
}
