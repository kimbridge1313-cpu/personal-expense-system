import "./tailwind.css";

const $ = (id) => document.getElementById(id);

const expenseCategories = ["餐飲", "交通", "購物", "生活", "娛樂", "學習", "固定支出", "醫療照護", "其他支出", "媽媽支出"];
const incomeCategories = ["薪資", "接案收入", "獎金", "投資", "其他收入"];
const baseCategories = [...expenseCategories, ...incomeCategories];
const categoryKeywords = [
  { category: "餐飲", keywords: ["午餐", "晚餐", "早餐", "咖啡", "飲料", "便當", "餐", "吃", "宵夜", "茶", "甜點"] },
  { category: "交通", keywords: ["捷運", "公車", "高鐵", "火車", "計程車", "油錢", "停車", "交通", "加油"] },
  { category: "購物", keywords: ["買", "衣服", "鞋", "包", "用品", "網購", "蝦皮", "momo", "好市多"] },
  { category: "生活", keywords: ["日用品", "洗衣", "清潔", "生活", "家用"] },
  { category: "娛樂", keywords: ["電影", "遊戲", "唱歌", "娛樂", "展覽"] },
  { category: "學習", keywords: ["書", "課程", "教材", "學費", "上課"] },
  { category: "醫療照護", keywords: ["看護", "醫院", "診所", "藥", "醫療", "照護"] },
  { category: "固定支出", keywords: ["房租", "水電", "電費", "瓦斯", "網路", "電話", "保險", "訂閱"] }
];

let transactions = [];
let editing = null;
let pendingChatRecord = null;
let pendingVoiceRecord = null;
let deferredInstallPrompt = null;
let recognition = null;
let isListening = false;
let voiceTranscript = "";

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function month() {
  return today().slice(0, 7);
}

function money(value) {
  return `${Number(value || 0).toLocaleString()} 元`;
}

function safe(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function tempId() {
  return `temp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function setStatus(message, type = "info") {
  const banner = $("statusBanner");
  if (!banner) return;
  banner.textContent = message;
  banner.style.background = type === "success" ? "#e8efe3" : type === "error" ? "#f5e3dd" : "#fff8e8";
  banner.style.borderColor = type === "success" ? "#d2e3c9" : type === "error" ? "#e5c3bd" : "#eadab5";
  banner.style.color = type === "success" ? "#3f5637" : type === "error" ? "#7d2f2a" : "#73562a";
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || data.message || "API request failed");
  return data;
}

function allKnownCategories() {
  const fromTransactions = transactions.map(t => t.category).filter(Boolean);
  const fromSelects = Array.from(document.querySelectorAll("#manualCategory option,#statsCategory option"))
    .map(option => option.value)
    .filter(value => value && value !== "all");
  return [...new Set([...baseCategories, ...fromTransactions, ...fromSelects])].sort((a, b) => b.length - a.length);
}

function categories(type) {
  const all = allKnownCategories();
  if (type === "income") return [...new Set([...incomeCategories, ...transactions.filter(t => t.type === "income").map(t => t.category).filter(Boolean)])];
  if (type === "expense") return [...new Set([...expenseCategories, ...transactions.filter(t => t.type === "expense").map(t => t.category).filter(Boolean)])];
  return all;
}

function setOptions(id, list, all = false) {
  const select = $(id);
  if (!select) return;
  const old = select.value;
  select.innerHTML = all ? '<option value="all">全部</option>' : "";
  list.forEach(value => {
    select.innerHTML += `<option value="${safe(value)}">${safe(value)}</option>`;
  });
  if ([...select.options].some(option => option.value === old)) select.value = old;
}

function refreshOptions() {
  setOptions("manualCategory", categories($("manualType")?.value || "expense"));
  setOptions("statsCategory", categories($("statsType")?.value || "all"), true);
}

function parseDateFromText(text) {
  const normalized = String(text || "");
  if (normalized.includes("前天")) return today(-2);
  if (normalized.includes("昨天")) return today(-1);
  if (normalized.includes("明天")) return today(1);

  const full = normalized.match(/(20\d{2})[\/\-.年]\s*(\d{1,2})[\/\-.月]\s*(\d{1,2})\s*[日號]?/);
  if (full) return `${full[1]}-${full[2].padStart(2, "0")}-${full[3].padStart(2, "0")}`;

  const monthDay = normalized.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日號]?/);
  if (monthDay) return `${today().slice(0, 4)}-${monthDay[1].padStart(2, "0")}-${monthDay[2].padStart(2, "0")}`;

  const slash = normalized.match(/(^|\s)(\d{1,2})[\/\-.](\d{1,2})(\s|$)/);
  if (slash) return `${today().slice(0, 4)}-${slash[2].padStart(2, "0")}-${slash[3].padStart(2, "0")}`;

  return today();
}

function parseAmount(text) {
  const normalized = String(text || "").replace(/[,，]/g, "");
  const beforeYuan = normalized.match(/(\d+(?:\.\d+)?)\s*(元|塊|台幣|nt|NT|NTD)/);
  if (beforeYuan) return Number(beforeYuan[1]);
  const afterVerb = normalized.match(/(?:花了|花|支出|付款|付|收入|收到|入帳|進帳|匯入|賺|薪水|薪資)\s*(\d+(?:\.\d+)?)/);
  if (afterVerb) return Number(afterVerb[1]);
  const numbers = [...normalized.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
  return numbers.length ? numbers[numbers.length - 1] : 0;
}

function parseType(text) {
  if (/(收入|收到|薪水|薪資|獎金|入帳|進帳|匯入|接案|尾款|退款|退費|賺)/.test(text)) return "income";
  return "expense";
}

function explicitCategoryFromText(text) {
  const source = String(text || "");
  const markers = ["歸類", "分類", "類別", "記到", "放到", "算在"];

  for (const marker of markers) {
    const markerIndex = source.indexOf(marker);
    if (markerIndex < 0) continue;

    const afterMarker = source.slice(markerIndex + marker.length);
    const connectorMatch = afterMarker.match(/^\s*(在|為|成|到)?\s*/);
    const connectorLength = connectorMatch ? connectorMatch[0].length : 0;
    const tail = afterMarker.slice(connectorLength);

    for (const category of allKnownCategories()) {
      if (tail.startsWith(category)) {
        return {
          category,
          command: source.slice(markerIndex, markerIndex + marker.length + connectorLength + category.length)
        };
      }
    }

    const fallback = tail.match(/^[\u4e00-\u9fa5A-Za-z0-9]+/);
    if (fallback) {
      return {
        category: fallback[0],
        command: source.slice(markerIndex, markerIndex + marker.length + connectorLength + fallback[0].length)
      };
    }
  }

  return null;
}

function inferCategory(text, type) {
  const explicit = explicitCategoryFromText(text);
  if (explicit) return explicit.category;

  if (type === "income") {
    if (/(薪水|薪資|工資)/.test(text)) return "薪資";
    if (/(接案|尾款|案子|設計費)/.test(text)) return "接案收入";
    if (/(獎金|紅包)/.test(text)) return "獎金";
    if (/(投資|股息|利息)/.test(text)) return "投資";
    return "其他收入";
  }

  for (const item of categoryKeywords) {
    if (item.keywords.some(keyword => text.includes(keyword))) return item.category;
  }
  return "其他支出";
}

function parseItem(text, amount, category) {
  const explicit = explicitCategoryFromText(text);
  let item = String(text || "");
  if (explicit?.command) item = item.replace(explicit.command, " ");
  item = item.replace(/今天|昨天|前天|明天/g, "");
  item = item.replace(/20\d{2}[\/\-.年]\s*\d{1,2}[\/\-.月]\s*\d{1,2}\s*[日號]?/g, "");
  item = item.replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日號]?/g, "");
  item = item.replace(/(^|\s)\d{1,2}[\/\-.]\d{1,2}(\s|$)/g, " ");
  if (amount) item = item.replace(new RegExp(String(amount).replace(".", "\\.") + "\\s*(元|塊|台幣|nt|NT|NTD)?", "g"), "");
  item = item.replace(/收入|收到|支出|花了|花|付款|付|入帳|進帳|匯入|賺/g, "");
  item = item.replace(/[＄$]/g, "");
  item = item.replace(category, "");
  item = item.replace(/[,，。；;]/g, " ");
  item = item.replace(/\s+/g, " ").trim();
  return item || category;
}

function parseRecordText(text, source = "web-chat") {
  const normalized = String(text || "").trim();
  const type = parseType(normalized);
  const amount = parseAmount(normalized);
  const category = inferCategory(normalized, type);
  const item = parseItem(normalized, amount, category);
  return {
    date: parseDateFromText(normalized),
    type,
    category,
    item,
    amount,
    source,
    sourceText: normalized
  };
}

function previewRowsHtml(record) {
  const typeLabel = record.type === "income" ? "收入" : "支出";
  return `
    <div class="preview-row"><span>類型</span><strong>${safe(typeLabel)}</strong></div>
    <div class="preview-row"><span>日期</span><strong>${safe(record.date)}</strong></div>
    <div class="preview-row"><span>分類</span><strong>${safe(record.category)}</strong></div>
    <div class="preview-row"><span>項目</span><strong>${safe(record.item)}</strong></div>
    <div class="preview-row"><span>金額</span><strong>${money(record.amount)}</strong></div>`;
}

function summary(rows) {
  const income = rows.filter(t => t.type === "income").reduce((sum, t) => sum + Number(t.amount || 0), 0);
  const expense = rows.filter(t => t.type === "expense").reduce((sum, t) => sum + Number(t.amount || 0), 0);
  return { income, expense, balance: income - expense };
}

function filteredRows() {
  const selectedMonth = $("statsMonth")?.value;
  const start = $("statsStartDate")?.value;
  const end = $("statsEndDate")?.value;
  const type = $("statsType")?.value || "all";
  const category = $("statsCategory")?.value || "all";

  return transactions.filter(t => {
    if (start || end) {
      if (start && t.date < start) return false;
      if (end && t.date > end) return false;
    } else if (selectedMonth && !String(t.date || "").startsWith(selectedMonth)) {
      return false;
    }
    if (type !== "all" && t.type !== type) return false;
    if (category !== "all" && t.category !== category) return false;
    return true;
  });
}

function render() {
  const monthSummary = summary(transactions.filter(t => String(t.date || "").startsWith(month())));
  if ($("topMonthIncome")) $("topMonthIncome").textContent = money(monthSummary.income);
  if ($("topMonthExpense")) $("topMonthExpense").textContent = money(monthSummary.expense);
  if ($("topMonthBalance")) $("topMonthBalance").textContent = money(monthSummary.balance);

  const rows = filteredRows();
  const filterSummary = summary(rows);
  if ($("filteredIncome")) $("filteredIncome").textContent = money(filterSummary.income);
  if ($("filteredExpense")) $("filteredExpense").textContent = money(filterSummary.expense);
  if ($("filteredBalance")) $("filteredBalance").textContent = money(filterSummary.balance);
  if ($("detailCountText")) $("detailCountText").textContent = `目前顯示 ${rows.length} 筆資料`;
  if ($("statsSummaryText")) {
    $("statsSummaryText").textContent = $("statsStartDate")?.value || $("statsEndDate")?.value
      ? `日期：${$("statsStartDate")?.value || "最早"} 至 ${$("statsEndDate")?.value || "最新"}`
      : `月份：${$("statsMonth")?.value || month()}`;
  }

  renderBars(rows);
  renderList("todayList", transactions.filter(t => t.date === today()), "today");
  renderList("detailList", rows.slice().sort((a, b) => String(b.date || "").localeCompare(String(a.date || ""))), "detail");
}

function renderBars(rows) {
  const box = $("categoryBars");
  if (!box) return;
  const totals = {};
  rows.forEach(t => {
    const key = `${t.type === "income" ? "收入" : "支出"}｜${t.category}`;
    totals[key] = (totals[key] || 0) + Number(t.amount || 0);
  });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  box.innerHTML = entries.length ? "" : '<div class="empty">目前篩選範圍沒有資料。</div>';
  const max = Math.max(...entries.map(([, value]) => value), 1);
  entries.forEach(([key, value]) => {
    box.innerHTML += `<div class="bar-row"><div>${safe(key)}</div><div class="bar-bg"><div class="bar-fill" style="width:${Math.round(value / max * 100)}%"></div></div><div style="text-align:right">${money(value).replace(" 元", "")}</div></div>`;
  });
}

function renderList(id, rows, scope) {
  const box = $(id);
  if (!box) return;
  box.innerHTML = rows.length ? "" : '<div class="empty">沒有資料。</div>';
  rows.forEach(t => box.appendChild(card(t, scope)));
}

function card(t, scope) {
  const el = document.createElement("div");
  el.className = "entry-card";

  if (editing === `${scope}:${t.id}`) {
    el.innerHTML = `
      <div class="edit-grid">
        <div class="field"><label>日期</label><input id="${scope}-date-${t.id}" type="date" value="${safe(t.date)}"></div>
        <div class="filter-row">
          <div class="field"><label>類型</label><select id="${scope}-type-${t.id}"><option value="expense" ${t.type === "expense" ? "selected" : ""}>支出</option><option value="income" ${t.type === "income" ? "selected" : ""}>收入</option></select></div>
          <div class="field"><label>分類</label><select id="${scope}-category-${t.id}">${categories(t.type).map(c => `<option value="${safe(c)}" ${c === t.category ? "selected" : ""}>${safe(c)}</option>`).join("")}</select></div>
        </div>
        <div class="field"><label>項目</label><input id="${scope}-item-${t.id}" value="${safe(t.item)}"></div>
        <div class="field"><label>金額</label><input id="${scope}-amount-${t.id}" type="number" inputmode="numeric" value="${safe(t.amount)}"></div>
        <div class="edit-actions"><button class="button primary js-save" data-scope="${scope}" data-id="${t.id}">儲存</button><button class="button secondary js-cancel">取消</button></div>
      </div>`;
    return el;
  }

  const label = t.type === "income" ? "收入" : "支出";
  const sign = t.type === "income" ? "+" : "-";
  const amountClass = t.type === "income" ? "amount-income" : "amount-expense";
  el.innerHTML = `
    <div class="entry-top">
      <div style="min-width:0">
        <div class="entry-title"><span class="tag ${t.type}">${label}</span><span class="entry-title-text">${safe(t.item)}</span></div>
        <div class="entry-date">${safe(t.date)}｜${safe(t.category)}</div>
      </div>
      <div class="entry-amount ${amountClass}">${sign}${money(t.amount)}</div>
    </div>
    <div class="entry-actions"><button class="button secondary small js-edit" data-scope="${scope}" data-id="${t.id}">修改</button><button class="button danger small js-delete" data-id="${t.id}">刪除</button></div>`;
  return el;
}

async function loadTransactions(options = {}) {
  const { quiet = false } = options;
  const data = await api("/api/transactions");
  transactions = Array.isArray(data.rows) ? data.rows : [];
  refreshOptions();
  render();
  if (!quiet) setStatus("資料已同步。", "success");
}

function resetManualForm(keepTypeAndCategory = true) {
  if ($("manualDate")) $("manualDate").value = today();
  if (!keepTypeAndCategory) {
    if ($("manualType")) $("manualType").value = "expense";
    refreshOptions();
    if ($("manualCategory")) $("manualCategory").value = "餐飲";
  }
  if ($("manualItem")) $("manualItem").value = "";
  if ($("manualAmount")) $("manualAmount").value = "";
}

function openModal() {
  $("manualModal")?.classList.add("open");
}

function closeModal() {
  $("manualModal")?.classList.remove("open");
}

async function createRecordFromData(data, options = {}) {
  const { showDialog = true, clearAfter = false } = options;
  const record = data.sourceText ? { ...data, ...parseRecordText(data.sourceText, data.source || "web-chat") } : data;
  const localId = tempId();
  const optimisticRecord = { id: localId, ...record };
  transactions = [optimisticRecord, ...transactions];
  refreshOptions();
  render();
  if (showDialog) showCreateSuccess(record);

  try {
    const result = await api("/api/transactions", { method: "POST", body: JSON.stringify(record) });
    if (result.id) {
      transactions = transactions.map(item => item.id === localId ? { ...item, id: result.id } : item);
      render();
    }
    setStatus(`新增成功：${record.item}｜${money(record.amount)}`, "success");
    if (clearAfter) clearChat();
    return true;
  } catch (error) {
    transactions = transactions.filter(item => item.id !== localId);
    render();
    setStatus(`新增失敗：${error.message}`, "error");
    alert(`新增失敗：${error.message}`);
    return false;
  }
}

function ensureSuccessDialog() {
  let dialog = $("successDialog");
  if (dialog) return dialog;
  dialog = document.createElement("div");
  dialog.id = "successDialog";
  dialog.className = "modal-backdrop";
  dialog.innerHTML = `
    <div class="modal" style="border-radius:26px 26px 0 0;">
      <div class="modal-handle"></div>
      <div class="modal-body" style="text-align:center;padding-top:28px;">
        <div style="width:54px;height:54px;margin:0 auto 14px;border-radius:999px;background:#e8efe3;display:grid;place-items:center;color:#3f5637;font-size:28px;font-weight:950;">✓</div>
        <h2 class="modal-title" style="font-size:22px;">記帳成功</h2>
        <p class="section-subtitle" id="successMessage" style="margin-top:8px;">這筆收支已寫入資料庫。</p>
      </div>
      <div class="modal-footer" style="grid-template-columns:1fr 1fr;">
        <button class="button secondary" id="successContinueBtn">繼續記帳</button>
        <button class="button primary" id="successDoneBtn">結束</button>
      </div>
    </div>`;
  document.body.appendChild(dialog);
  $("successContinueBtn").addEventListener("click", () => { dialog.classList.remove("open"); $("chatInput")?.focus(); });
  $("successDoneBtn").addEventListener("click", () => { dialog.classList.remove("open"); $("todaySection")?.scrollIntoView({ behavior: "smooth" }); });
  return dialog;
}

function showCreateSuccess(record) {
  const dialog = ensureSuccessDialog();
  $("successMessage").textContent = `${record.item}｜${money(record.amount)}`;
  dialog.classList.add("open");
}

function parseChatInput() {
  const text = $("chatInput")?.value.trim() || "";
  if (!text) return alert("請輸入一句記帳內容。");
  const record = parseRecordText(text, "web-chat");
  if (!record.amount || record.amount <= 0) return alert("沒有抓到金額，請用例如「今天午餐 120」。");
  pendingChatRecord = record;
  return createRecordFromData(record, { showDialog: true, clearAfter: true });
}

function clearChat() {
  pendingChatRecord = null;
  if ($("chatInput")) $("chatInput").value = "";
  $("chatPreview")?.classList.remove("open");
}

async function createRecord() {
  const data = {
    date: $("manualDate")?.value || today(),
    type: $("manualType")?.value || "expense",
    category: $("manualCategory")?.value || "其他支出",
    item: $("manualItem")?.value.trim() || "",
    amount: Number($("manualAmount")?.value || 0),
    source: "web-manual"
  };
  if (!data.item) return alert("請輸入項目。");
  if (!data.amount || data.amount <= 0) return alert("請輸入金額。");
  closeModal();
  resetManualForm(true);
  await createRecordFromData(data, { showDialog: true });
}

async function saveRecord(scope, id) {
  const data = {
    id,
    date: $(`${scope}-date-${id}`)?.value,
    type: $(`${scope}-type-${id}`)?.value,
    category: $(`${scope}-category-${id}`)?.value,
    item: $(`${scope}-item-${id}`)?.value.trim(),
    amount: Number($(`${scope}-amount-${id}`)?.value || 0)
  };
  if (!data.item) return alert("項目不可空白。");
  if (!data.amount || data.amount <= 0) return alert("金額需大於 0。");
  const previous = transactions.find(item => item.id === id);
  transactions = transactions.map(item => item.id === id ? { ...item, ...data } : item);
  editing = null;
  render();
  try {
    await api("/api/transactions", { method: "PUT", body: JSON.stringify(data) });
    setStatus(`儲存成功：${data.item}｜${money(data.amount)}`, "success");
  } catch (error) {
    if (previous) transactions = transactions.map(item => item.id === id ? previous : item);
    render();
    alert(`儲存失敗：${error.message}`);
  }
}

async function deleteRecord(id) {
  const previousRows = transactions;
  transactions = transactions.filter(item => item.id !== id);
  render();
  try {
    await api(`/api/transactions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setStatus("已刪除。", "success");
  } catch (error) {
    transactions = previousRows;
    render();
    alert(`刪除失敗：${error.message}`);
  }
}

function ensureVoiceDialog() {
  let dialog = $("voiceDialog");
  if (dialog) return dialog;
  dialog = document.createElement("div");
  dialog.id = "voiceDialog";
  dialog.className = "modal-backdrop";
  dialog.innerHTML = `<div class="modal" style="border-radius:26px 26px 0 0;"><div class="modal-handle"></div><div id="voiceDialogBody"></div></div>`;
  document.body.appendChild(dialog);
  return dialog;
}

function showVoiceDialog() {
  ensureVoiceDialog().classList.add("open");
}

function closeVoiceDialog() {
  $("voiceDialog")?.classList.remove("open");
  pendingVoiceRecord = null;
}

function renderVoiceListening() {
  ensureVoiceDialog();
  $("voiceDialogBody").innerHTML = `
    <div class="listening-modal">
      <div class="listening-dot">⌁</div>
      <h2 class="modal-title" style="font-size:22px;">聽取中</h2>
      <p class="section-subtitle" style="margin-top:8px;">請說出記帳內容，例如「今天午餐 120」。系統會自動辨識。</p>
    </div>`;
}

function renderVoiceConfirm(record) {
  ensureVoiceDialog();
  $("voiceDialogBody").innerHTML = `
    <div class="modal-body">
      <div style="text-align:center;margin-bottom:14px;">
        <h2 class="modal-title" style="font-size:22px;">確認這筆記帳</h2>
        <p class="section-subtitle" style="margin-top:8px;">確認解析結果正確後再儲存。</p>
      </div>
      <div class="chat-preview open"><div class="preview-grid">${previewRowsHtml(record)}</div></div>
    </div>
    <div class="modal-footer" style="grid-template-columns:1fr 1fr;">
      <button class="button secondary" id="voiceRetryBtn">重新聽取</button>
      <button class="button primary" id="voiceConfirmBtn">確認儲存</button>
    </div>`;
  $("voiceRetryBtn").addEventListener("click", () => { pendingVoiceRecord = null; if (recognition && !isListening) recognition.start(); });
  $("voiceConfirmBtn").addEventListener("click", confirmVoiceRecord);
}

function renderVoiceSaving() {
  $("voiceDialogBody").innerHTML = `<div class="listening-modal"><div class="listening-dot">✓</div><h2 class="modal-title" style="font-size:22px;">儲存中</h2><p class="section-subtitle" style="margin-top:8px;">正在寫入記帳資料。</p></div>`;
}

function renderVoiceSuccess(record) {
  $("voiceDialogBody").innerHTML = `
    <div class="modal-body" style="text-align:center;padding-top:28px;">
      <div style="width:54px;height:54px;margin:0 auto 14px;border-radius:999px;background:#e8efe3;display:grid;place-items:center;color:#3f5637;font-size:28px;font-weight:950;">✓</div>
      <h2 class="modal-title" style="font-size:22px;">記帳成功</h2>
      <p class="section-subtitle" style="margin-top:8px;">${safe(record.item)}｜${money(record.amount)}</p>
    </div>
    <div class="modal-footer" style="grid-template-columns:1fr 1fr;">
      <button class="button secondary" id="voiceContinueBtn">繼續記帳</button>
      <button class="button primary" id="voiceDoneBtn">結束</button>
    </div>`;
  $("voiceContinueBtn").addEventListener("click", () => { pendingVoiceRecord = null; if (recognition && !isListening) recognition.start(); });
  $("voiceDoneBtn").addEventListener("click", () => { closeVoiceDialog(); $("todaySection")?.scrollIntoView({ behavior: "smooth" }); });
}

function renderVoiceError(message) {
  ensureVoiceDialog();
  $("voiceDialogBody").innerHTML = `
    <div class="modal-body" style="text-align:center;padding-top:28px;">
      <div style="width:54px;height:54px;margin:0 auto 14px;border-radius:999px;background:#f5e3dd;display:grid;place-items:center;color:#7d2f2a;font-size:28px;font-weight:950;">!</div>
      <h2 class="modal-title" style="font-size:22px;">無法解析</h2>
      <p class="section-subtitle" style="margin-top:8px;">${safe(message)}</p>
    </div>
    <div class="modal-footer" style="grid-template-columns:1fr 1fr;">
      <button class="button secondary" id="voiceCancelBtn">取消</button>
      <button class="button primary" id="voiceTryAgainBtn">重新聽取</button>
    </div>`;
  $("voiceCancelBtn").addEventListener("click", closeVoiceDialog);
  $("voiceTryAgainBtn").addEventListener("click", () => { if (recognition && !isListening) recognition.start(); });
}

function handleVoiceTranscript(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return renderVoiceError("沒有聽到內容，請再試一次。");
  const record = parseRecordText(normalized, "web-voice");
  if (!record.amount || record.amount <= 0) return renderVoiceError("語音沒有抓到金額，請再說一次，例如「今天午餐 120」。");
  pendingVoiceRecord = record;
  renderVoiceConfirm(record);
  setStatus("語音已解析，請在彈窗內確認儲存。", "info");
}

async function confirmVoiceRecord() {
  if (!pendingVoiceRecord) return;
  const record = pendingVoiceRecord.sourceText ? parseRecordText(pendingVoiceRecord.sourceText, "web-voice") : pendingVoiceRecord;
  pendingVoiceRecord = record;
  renderVoiceSaving();
  const ok = await createRecordFromData(record, { showDialog: false, clearAfter: false });
  if (ok) {
    pendingVoiceRecord = null;
    renderVoiceSuccess(record);
  }
}

function setupVoiceInput() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const voiceBtn = $("voiceBtn");
  if (!voiceBtn) return;
  if (!SpeechRecognition) {
    voiceBtn.disabled = true;
    voiceBtn.textContent = "不支援語音";
    if ($("installHint")) {
      $("installHint").classList.add("open");
      $("installHint").textContent = "這個瀏覽器不支援語音辨識；仍可使用文字對話記帳。";
    }
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "zh-TW";
  recognition.interimResults = true;
  recognition.continuous = false;
  recognition.onstart = () => {
    isListening = true;
    voiceTranscript = "";
    voiceBtn.textContent = "🎙️ 正在聽...";
    voiceBtn.classList.add("voice-active");
    renderVoiceListening();
    showVoiceDialog();
  };
  recognition.onresult = (event) => {
    voiceTranscript = Array.from(event.results).map(result => result[0].transcript).join("");
  };
  recognition.onerror = (event) => {
    isListening = false;
    voiceBtn.textContent = "🎙️ 語音輸入";
    voiceBtn.classList.remove("voice-active");
    renderVoiceError(`語音輸入失敗：${event.error}`);
  };
  recognition.onend = () => {
    isListening = false;
    voiceBtn.textContent = "🎙️ 語音輸入";
    voiceBtn.classList.remove("voice-active");
    handleVoiceTranscript(voiceTranscript);
  };
  voiceBtn.addEventListener("click", () => {
    if (isListening) return;
    recognition.start();
  });
}

function setupPwa() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    });
  }
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    if ($("installPwaBtn")) $("installPwaBtn").style.display = "inline-block";
    $("installHint")?.classList.add("open");
  });
  $("installPwaBtn")?.addEventListener("click", async () => {
    if (!deferredInstallPrompt) {
      $("installHint")?.classList.add("open");
      if ($("installHint")) $("installHint").textContent = "iPhone 請用 Safari 分享按鈕 → 加入主畫面。";
      return;
    }
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
  });
}

function bind() {
  ["openManualModalBtn", "openManualModalBtn2", "bottomAddBtn"].forEach(id => $(id)?.addEventListener("click", openModal));
  $("closeManualModalBtn")?.addEventListener("click", closeModal);
  $("manualModal")?.addEventListener("click", e => { if (e.target.id === "manualModal") closeModal(); });
  $("createManualBtn")?.addEventListener("click", () => createRecord().catch(err => alert(err.message)));
  $("clearManualBtn")?.addEventListener("click", () => resetManualForm(false));
  $("chatSubmitBtn")?.addEventListener("click", () => parseChatInput().catch?.(err => alert(err.message)));
  $("chatConfirmBtn")?.addEventListener("click", () => createRecordFromData(pendingChatRecord, { showDialog: true, clearAfter: true }).catch(err => alert(err.message)));
  $("chatClearBtn")?.addEventListener("click", clearChat);
  $("chatInput")?.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") parseChatInput();
  });
  document.querySelectorAll(".js-example").forEach(btn => {
    btn.addEventListener("click", () => {
      if ($("chatInput")) $("chatInput").value = btn.dataset.text || "";
      $("chatPreview")?.classList.remove("open");
    });
  });
  $("resetStatsBtn")?.addEventListener("click", () => {
    if ($("statsMonth")) $("statsMonth").value = month();
    if ($("statsStartDate")) $("statsStartDate").value = "";
    if ($("statsEndDate")) $("statsEndDate").value = "";
    if ($("statsType")) $("statsType").value = "all";
    refreshOptions();
    if ($("statsCategory")) $("statsCategory").value = "all";
    render();
  });
  $("applyStatsBtn")?.addEventListener("click", render);
  $("manualType")?.addEventListener("change", refreshOptions);
  $("statsType")?.addEventListener("change", () => { refreshOptions(); render(); });
  ["statsMonth", "statsStartDate", "statsEndDate", "statsCategory"].forEach(id => $(id)?.addEventListener("change", render));
  document.body.addEventListener("click", e => {
    const edit = e.target.closest(".js-edit");
    const del = e.target.closest(".js-delete");
    const save = e.target.closest(".js-save");
    const cancel = e.target.closest(".js-cancel");
    if (edit) { editing = `${edit.dataset.scope}:${edit.dataset.id}`; render(); }
    if (del) deleteRecord(del.dataset.id).catch(err => alert(err.message));
    if (save) saveRecord(save.dataset.scope, save.dataset.id).catch(err => alert(err.message));
    if (cancel) { editing = null; render(); }
  });
}

async function init() {
  if ($("manualDate")) $("manualDate").value = today();
  if ($("statsMonth")) $("statsMonth").value = month();
  refreshOptions();
  if ($("manualCategory")) $("manualCategory").value = "餐飲";
  if ($("statsCategory")) $("statsCategory").value = "all";
  bind();
  setupVoiceInput();
  setupPwa();
  setStatus("正式模式：Web App 對話記帳，透過 Vercel API 讀寫 Firestore。", "success");
  try {
    await loadTransactions({ quiet: true });
  } catch (error) {
    console.error(error);
    setStatus(`API 連線失敗：${error.message}`, "error");
    render();
  }
}

init();
