import {
  PROFILES,
  SAMPLE_CSV_GENERIC,
  SAMPLE_CSV_SHOPIFY,
  analyzeCsv,
  createMarkdownReport,
} from "./src/csv-engine.mjs";
import { createCorrectedCsv } from "./src/csv-fixer.mjs";

const elements = {
  profile: document.querySelector("#profile"),
  file: document.querySelector("#csv-file"),
  input: document.querySelector("#csv-input"),
  sampleShopify: document.querySelector("#sample-shopify"),
  sampleGeneric: document.querySelector("#sample-generic"),
  analyze: document.querySelector("#analyze"),
  status: document.querySelector("#status-message"),
  result: document.querySelector("#result"),
  resultBadge: document.querySelector("#result-badge"),
  resultSummary: document.querySelector("#result-summary"),
  rowCount: document.querySelector("#row-count"),
  productCount: document.querySelector("#product-count"),
  issueCount: document.querySelector("#issue-count"),
  checkedAt: document.querySelector("#checked-at"),
  issueList: document.querySelector("#issue-list"),
  correctionSummary: document.querySelector("#correction-summary"),
  downloadCorrected: document.querySelector("#download-corrected"),
  downloadMarkdown: document.querySelector("#download-markdown"),
  downloadJson: document.querySelector("#download-json"),
};

let latestResult = null;
let latestCorrection = null;

function setStatus(message, kind = "") {
  elements.status.textContent = message;
  elements.status.dataset.kind = kind;
}

function formatTime(iso) {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function addText(parent, tag, value, className = "") {
  const child = document.createElement(tag);
  child.textContent = value;
  if (className) child.className = className;
  parent.append(child);
  return child;
}

function renderIssues(result) {
  elements.issueList.replaceChildren();
  if (!result.issues.length) {
    const empty = document.createElement("li");
    empty.className = "issue issue--empty";
    addText(empty, "strong", "検出事項なし");
    addText(empty, "p", "取込先の最新テンプレートと運用ルールも確認したうえで、検証環境へ進めてください。");
    elements.issueList.append(empty);
    return;
  }

  for (const issue of result.issues) {
    const item = document.createElement("li");
    item.className = `issue issue--${issue.severity}`;
    const heading = document.createElement("div");
    heading.className = "issue__heading";
    addText(heading, "span", issue.severity === "error" ? "停止" : issue.severity === "warning" ? "確認" : "参考", "issue__severity");
    addText(heading, "strong", issue.title);
    addText(heading, "code", issue.code);
    item.append(heading);
    addText(item, "p", issue.detail);
    if (issue.rows.length) addText(item, "small", `対象行: ${issue.rows.slice(0, 8).join(", ")}${issue.rows.length > 8 ? ` ほか${issue.rows.length - 8}行` : ""}`);
    elements.issueList.append(item);
  }
}

function renderCorrection(correction) {
  latestCorrection = correction;
  elements.downloadCorrected.disabled = !correction.canExport;
  if (!correction.canExport) {
    elements.correctionSummary.textContent = `自動修正は停止: ${correction.reason}`;
    elements.correctionSummary.dataset.kind = "error";
    elements.downloadCorrected.textContent = "修正版CSVを書き出す";
    return;
  }

  elements.downloadCorrected.textContent = correction.changeCount
    ? `修正版CSVを書き出す（${correction.changeCount}件修正）`
    : "正規化済みCSVを書き出す";
  elements.correctionSummary.textContent = correction.changeCount
    ? `${correction.changeCount}件を安全に自動修正。未解決のエラー・注意は${correction.unresolvedCount}件です。`
    : `自動修正できる箇所はありません。未解決のエラー・注意は${correction.unresolvedCount}件です。`;
  elements.correctionSummary.dataset.kind = correction.unresolvedCount ? "warning" : "pass";
}

function renderResult(result, correction) {
  latestResult = result;
  elements.result.hidden = false;
  elements.resultBadge.textContent = result.status;
  elements.resultBadge.dataset.status = result.status;
  elements.resultSummary.textContent = result.summary;
  elements.rowCount.textContent = String(result.rows);
  elements.productCount.textContent = String(result.productGroups);
  elements.issueCount.textContent = String(result.errors + result.warnings);
  elements.checkedAt.textContent = formatTime(result.generatedAt);
  renderIssues(result);
  renderCorrection(correction);
  elements.downloadMarkdown.disabled = false;
  elements.downloadJson.disabled = false;
  setStatus(`${result.status}: ${result.summary}`, result.status.toLowerCase());
  elements.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function analyze() {
  const profileId = elements.profile.value;
  const source = elements.input.value;
  if (!source.trim()) setStatus("CSVを選択するか、テキストを貼り付けてください。", "error");
  const result = analyzeCsv(source, profileId);
  const correction = createCorrectedCsv(source, profileId);
  renderResult(result, correction);
}

function loadSample(profileId) {
  elements.profile.value = profileId;
  elements.input.value = profileId === "generic" ? SAMPLE_CSV_GENERIC : SAMPLE_CSV_SHOPIFY;
  elements.file.value = "";
  latestCorrection = null;
  elements.downloadCorrected.disabled = true;
  setStatus("サンプルを読み込みました。チェックを実行してください。", "info");
  elements.input.focus();
}

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

elements.file.addEventListener("change", async () => {
  const [file] = elements.file.files || [];
  if (!file) return;
  if (file.size > 15 * 1024 * 1024) {
    setStatus("ファイルが15MBを超えています。小さく分割してから再試行してください。", "error");
    elements.file.value = "";
    return;
  }
  try {
    elements.input.value = await file.text();
    latestCorrection = null;
    elements.downloadCorrected.disabled = true;
    setStatus(`${file.name}を読み込みました。内容はこのブラウザ内にあります。`, "info");
  } catch {
    setStatus("ファイルを読み込めませんでした。テキストを貼り付けてください。", "error");
  }
});

elements.analyze.addEventListener("click", analyze);
elements.sampleShopify.addEventListener("click", () => loadSample("shopify"));
elements.sampleGeneric.addEventListener("click", () => loadSample("generic"));

elements.downloadCorrected.addEventListener("click", () => {
  if (!latestCorrection?.canExport) return;
  const profile = elements.profile.value === "shopify" ? "shopify" : "ec";
  download(`${profile}-products-corrected.csv`, `\uFEFF${latestCorrection.csv}\r\n`, "text/csv;charset=utf-8");
  setStatus(`修正版CSVを書き出しました。未解決項目${latestCorrection.unresolvedCount}件はレポートで確認してください。`, latestCorrection.unresolvedCount ? "review" : "pass");
});

elements.downloadMarkdown.addEventListener("click", () => {
  if (!latestResult) return;
  download("ec-csv-preflight-report.md", createMarkdownReport(latestResult), "text/markdown;charset=utf-8");
});

elements.downloadJson.addEventListener("click", () => {
  if (!latestResult) return;
  download("ec-csv-preflight-report.json", `${JSON.stringify(latestResult, null, 2)}\n`, "application/json;charset=utf-8");
});

for (const [id, profile] of Object.entries(PROFILES)) {
  const option = document.createElement("option");
  option.value = id;
  option.textContent = profile.label;
  elements.profile.append(option);
}
elements.profile.value = "shopify";
setStatus("CSVを選択するか、サンプルを読み込んでください。", "info");
