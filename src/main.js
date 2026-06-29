const $ = (id) => document.getElementById(id);
const expenseCategories = ["餐飲", "交通", "購物", "生活", "娛樂", "學習", "固定支出", "醫療照護", "其他支出"];
const incomeCategories = ["薪資", "接案收入", "獎金", "投資", "其他收入"];

let transactions = [];
let editing = null;

function today(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}
function month() { return today().slice(0, 7); }
function money(value) { return Number(value || 0).toLocaleString() + " 元"; }
function safe(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}
function setStatus(message, type = "info") {
  const banner = $("statusBanner");
  banner.textContent = message;
  banner.style.background = type === "success" ? "#e8efe3" : type === "error" ? "#f5e3dd" : "#fff8e8";
  banner.style.borderColor = type === "success" ? "#d2e3c9" : type === "error" ? "#e5c3bd" : "#eadab5";
  banner.style.color = type === "success" ? "#3f5637" : type === "error" ? "#7d2f2a" : "#73562a";
}
function resetManualForm(keepTypeAndCategory = true) {
  $("manualDate").value = today();
  if (!keepTypeAndCategory) {
    $("manualType").value = "expense";
    refreshOptions();
    $("manualCategory").value = "餐飲";
  }
  $("manualItem").value = "";
  $("manualAmount").value = "";
}
function showCreateSuccess(record) {
  setStatus(`新增成功：${record.item}｜${money(record.amount)}`, "success");
  const addAnother = window.confirm("新增成功。\n\n按「確定」再記一筆。\n按「取消」回首頁查看今日明細。");
  if (addAnother) {
    resetManualForm(true);
    openModal();
    setTimeout(() => $("manualItem")?.focus(), 80);
  } else {
    $("todaySection").scrollIntoView({ behavior: "smooth" });
  }
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
async function loadTransactions() {
  const data = await api("/api/transactions");
  transactions = Array.isArray(data.rows) ? data.rows : [];
  refreshOptions();
  render();
}
function categories(type) {
  if (type === "income") return [...new Set([...incomeCategories, ...transactions.filter(t => t.type === "income").map(t => t.category)])];
  if (type === "expense") return [...new Set([...expenseCategories, ...transactions.filter(t => t.type === "expense").map(t => t.category)])];
  return [...new Set([...expenseCategories, ...incomeCategories, ...transactions.map(t => t.category)])];
}
function setOptions(id, list, all = false) {
  const select = $(id);
  const old = select.value;
  select.innerHTML = all ? '<option value="all">全部</option>' : "";
  list.forEach(value => select.innerHTML += `<option value="${safe(value)}">${safe(value)}</option>`);
  if ([...select.options].some(option => option.value === old)) select.value = old;
}
function refreshOptions() {
  setOptions("manualCategory", categories($("manualType").value));
  setOptions("statsCategory", categories($("statsType").value), true);
}
function summary(rows) {
  const income = rows.filter(t => t.type === "income").reduce((s, t) => s + Number(t.amount || 0), 0);
  const expense = rows.filter(t => t.type === "expense").reduce((s, t) => s + Number(t.amount || 0), 0);
  return { income, expense, balance: income - expense };
}
function filteredRows() {
  const m = $("statsMonth").value;
  const start = $("statsStartDate").value;
  const end = $("statsEndDate").value;
  const type = $("statsType").value;
  const category = $("statsCategory").value;
  return transactions.filter(t => {
    if (start || end) {
      if (start && t.date < start) return false;
      if (end && t.date > end) return false;
    } else if (m && !t.date.startsWith(m)) return false;
    if (type !== "all" && t.type !== type) return false;
    if (category !== "all" && t.category !== category) return false;
    return true;
  });
}
function render() {
  const monthSummary = summary(transactions.filter(t => t.date.startsWith(month())));
  $("topMonthIncome").textContent = money(monthSummary.income);
  $("topMonthExpense").textContent = money(monthSummary.expense);
  $("topMonthBalance").textContent = money(monthSummary.balance);
  const rows = filteredRows();
  const fs = summary(rows);
  $("filteredIncome").textContent = money(fs.income);
  $("filteredExpense").textContent = money(fs.expense);
  $("filteredBalance").textContent = money(fs.balance);
  $("detailCountText").textContent = `目前顯示 ${rows.length} 筆資料`;
  $("statsSummaryText").textContent = $("statsStartDate").value || $("statsEndDate").value ? `日期：${$("statsStartDate").value || "最早"} 至 ${$("statsEndDate").value || "最新"}` : `月份：${$("statsMonth").value || month()}`;
  renderBars(rows);
  renderList("todayList", transactions.filter(t => t.date === today()), "today");
  renderList("detailList", rows.slice().sort((a, b) => b.date.localeCompare(a.date)), "detail");
}
function renderBars(rows) {
  const totals = {};
  rows.forEach(t => {
    const key = `${t.type === "income" ? "收入" : "支出"}｜${t.category}`;
    totals[key] = (totals[key] || 0) + Number(t.amount || 0);
  });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  $("categoryBars").innerHTML = entries.length ? "" : '<div class="empty">目前篩選範圍沒有資料。</div>';
  const max = Math.max(...entries.map(([, v]) => v), 1);
  entries.forEach(([key, value]) => $("categoryBars").innerHTML += `<div class="bar-row"><div>${safe(key)}</div><div class="bar-bg"><div class="bar-fill" style="width:${Math.round(value / max * 100)}%"></div></div><div style="text-align:right">${money(value).replace(" 元", "")}</div></div>`);
}
function renderList(id, rows, scope) {
  const box = $(id);
  box.innerHTML = rows.length ? "" : '<div class="empty">沒有資料。</div>';
  rows.forEach(t => box.appendChild(card(t, scope)));
}
function card(t, scope) {
  const el = document.createElement("div");
  el.className = "entry-card";
  if (editing === `${scope}:${t.id}`) {
    el.innerHTML = `<div class="edit-grid"><div class="field"><label>日期</label><input id="${scope}-date-${t.id}" type="date" value="${t.date}"></div><div class="filter-row"><div class="field"><label>類型</label><select id="${scope}-type-${t.id}"><option value="expense" ${t.type === "expense" ? "selected" : ""}>支出</option><option value="income" ${t.type === "income" ? "selected" : ""}>收入</option></select></div><div class="field"><label>分類</label><select id="${scope}-category-${t.id}">${categories(t.type).map(c => `<option value="${safe(c)}" ${c === t.category ? "selected" : ""}>${safe(c)}</option>`).join("")}</select></div></div><div class="field"><label>項目</label><input id="${scope}-item-${t.id}" value="${safe(t.item)}"></div><div class="field"><label>金額</label><input id="${scope}-amount-${t.id}" type="number" inputmode="numeric" value="${t.amount}"></div><div class="edit-actions"><button class="button primary js-save" data-scope="${scope}" data-id="${t.id}">儲存</button><button class="button secondary js-cancel">取消</button></div></div>`;
    return el;
  }
  const label = t.type === "income" ? "收入" : "支出";
  const sign = t.type === "income" ? "+" : "-";
  const amountClass = t.type === "income" ? "amount-income" : "amount-expense";
  el.innerHTML = `<div class="entry-top"><div style="min-width:0"><div class="entry-title"><span class="tag ${t.type}">${label}</span><span class="entry-title-text">${safe(t.item)}</span></div><div class="entry-date">${safe(t.date)}｜${safe(t.category)}</div></div><div class="entry-amount ${amountClass}">${sign}${money(t.amount)}</div></div><div class="entry-actions"><button class="button secondary small js-edit" data-scope="${scope}" data-id="${t.id}">修改</button><button class="button danger small js-delete" data-id="${t.id}">刪除</button></div>`;
  return el;
}
function openModal() { $("manualModal").classList.add("open"); }
function closeModal() { $("manualModal").classList.remove("open"); }
async function createRecord() {
  const data = { date: $("manualDate").value || today(), type: $("manualType").value, category: $("manualCategory").value, item: $("manualItem").value.trim(), amount: Number($("manualAmount").value), source: "web" };
  if (!data.item) return alert("請輸入項目。");
  if (!data.amount || data.amount <= 0) return alert("請輸入金額。");
  await api("/api/transactions", { method: "POST", body: JSON.stringify(data) });
  closeModal();
  await loadTransactions();
  showCreateSuccess(data);
}
async function saveRecord(scope, id) {
  const data = { id, date: $(`${scope}-date-${id}`).value, type: $(`${scope}-type-${id}`).value, category: $(`${scope}-category-${id}`).value, item: $(`${scope}-item-${id}`).value.trim(), amount: Number($(`${scope}-amount-${id}`).value) };
  if (!data.item) return alert("項目不可空白。");
  if (!data.amount || data.amount <= 0) return alert("金額需大於 0。");
  await api("/api/transactions", { method: "PUT", body: JSON.stringify(data) });
  editing = null;
  await loadTransactions();
}
async function deleteRecord(id) {
  await api(`/api/transactions?id=${encodeURIComponent(id)}`, { method: "DELETE" });
  await loadTransactions();
}
function bind() {
  ["openManualModalBtn", "openManualModalBtn2", "bottomAddBtn"].forEach(id => $(id).addEventListener("click", openModal));
  $("closeManualModalBtn").addEventListener("click", closeModal);
  $("manualModal").addEventListener("click", e => { if (e.target.id === "manualModal") closeModal(); });
  $("createManualBtn").addEventListener("click", () => createRecord().catch(err => alert(err.message)));
  $("clearManualBtn").addEventListener("click", () => resetManualForm(false));
  $("resetStatsBtn").addEventListener("click", () => { $("statsMonth").value = month(); $("statsStartDate").value = ""; $("statsEndDate").value = ""; $("statsType").value = "all"; refreshOptions(); $("statsCategory").value = "all"; render(); });
  $("applyStatsBtn").addEventListener("click", render);
  $("manualType").addEventListener("change", refreshOptions);
  $("statsType").addEventListener("change", () => { refreshOptions(); render(); });
  ["statsMonth", "statsStartDate", "statsEndDate", "statsCategory"].forEach(id => $(id).addEventListener("change", render));
  $("jumpTodayBtn").addEventListener("click", () => $("todaySection").scrollIntoView({ behavior: "smooth" }));
  $("jumpStatsBtn").addEventListener("click", () => { $("queryDetails").open = true; $("queryDetails").scrollIntoView({ behavior: "smooth" }); });
  document.body.addEventListener("click", e => {
    const edit = e.target.closest(".js-edit"), del = e.target.closest(".js-delete"), save = e.target.closest(".js-save"), cancel = e.target.closest(".js-cancel");
    if (edit) { editing = `${edit.dataset.scope}:${edit.dataset.id}`; render(); }
    if (del) deleteRecord(del.dataset.id).catch(err => alert(err.message));
    if (save) saveRecord(save.dataset.scope, save.dataset.id).catch(err => alert(err.message));
    if (cancel) { editing = null; render(); }
  });
}
async function init() {
  $("manualDate").value = today();
  $("statsMonth").value = month();
  refreshOptions();
  $("manualCategory").value = "餐飲";
  $("statsCategory").value = "all";
  bind();
  setStatus("正式模式：前端透過 Vercel API 讀寫 Firestore。", "success");
  try {
    await loadTransactions();
  } catch (error) {
    console.error(error);
    setStatus(`API 連線失敗：${error.message}`, "error");
    render();
  }
}
init();
