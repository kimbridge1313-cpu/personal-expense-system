const expenseCategories = ["餐飲", "交通", "購物", "生活", "娛樂", "學習", "固定支出", "醫療照護", "其他支出"];
const incomeCategories = ["薪資", "接案收入", "獎金", "投資", "其他收入"];

const categoryKeywords = [
  { category: "餐飲", keywords: ["午餐", "晚餐", "早餐", "咖啡", "飲料", "便當", "餐", "吃"] },
  { category: "交通", keywords: ["捷運", "公車", "高鐵", "火車", "計程車", "油錢", "停車", "交通"] },
  { category: "購物", keywords: ["買", "衣服", "鞋", "包", "用品", "網購"] },
  { category: "學習", keywords: ["書", "課程", "教材", "學費"] },
  { category: "醫療照護", keywords: ["看護", "醫院", "診所", "藥", "醫療", "照護"] },
  { category: "固定支出", keywords: ["房租", "水電", "電費", "瓦斯", "網路", "電話", "保險"] }
];

function taipeiDate(offset = 0) {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const date = new Date(utc + 8 * 60 * 60000);
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

function parseDate(text) {
  if (text.includes("前天")) return taipeiDate(-2);
  if (text.includes("昨天")) return taipeiDate(-1);

  const monthDay = text.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*[日號]?/);
  if (monthDay) {
    const year = taipeiDate().slice(0, 4);
    const month = monthDay[1].padStart(2, "0");
    const day = monthDay[2].padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return taipeiDate();
}

function parseAmount(text) {
  const beforeYuan = text.match(/(\d+(?:\.\d+)?)\s*元/);
  if (beforeYuan) return Number(beforeYuan[1]);

  const afterVerb = text.match(/(?:花了|花|支出|付款|付|收入|收到|入帳|進帳)\s*(\d+(?:\.\d+)?)/);
  if (afterVerb) return Number(afterVerb[1]);

  const numbers = [...text.matchAll(/\d+(?:\.\d+)?/g)].map(match => Number(match[0]));
  return numbers.length ? numbers[numbers.length - 1] : 0;
}

function parseType(text) {
  if (/(收入|收到|薪水|薪資|獎金|入帳|進帳|匯入|接案|尾款)/.test(text)) return "income";
  return "expense";
}

function parseExplicitCategory(text) {
  const match = text.match(/(?:分類|類別|歸類|記到|放到|算在)\s*([\u4e00-\u9fa5A-Za-z0-9]+)/);
  return match ? match[1].trim() : "";
}

function inferCategory(text, type) {
  const explicit = parseExplicitCategory(text);
  if (explicit) return explicit;

  for (const item of categoryKeywords) {
    if (item.keywords.some(keyword => text.includes(keyword))) return item.category;
  }

  return type === "income" ? "其他收入" : "其他支出";
}

function parseItem(text, amount, category) {
  let item = text;
  item = item.replace(/今天|昨天|前天/g, "");
  item = item.replace(/\d{1,2}\s*月\s*\d{1,2}\s*[日號]?/g, "");
  item = item.replace(new RegExp(String(amount) + "\\s*元?", "g"), "");
  item = item.replace(/收入|收到|支出|花了|花|付款|付|入帳|進帳|匯入/g, "");
  item = item.replace(/分類|類別|歸類|記到|放到|算在/g, "");
  item = item.replace(category, "");
  item = item.replace(/\s+/g, " ").trim();
  return item || category;
}

export function parseLineMessage(text) {
  const normalized = String(text || "").trim();
  const type = parseType(normalized);
  const amount = parseAmount(normalized);
  const category = inferCategory(normalized, type);
  const item = parseItem(normalized, amount, category);

  return {
    type,
    date: parseDate(normalized),
    amount,
    category,
    item,
    sourceText: normalized
  };
}

export function formatReply(record) {
  if (!record.amount || record.amount <= 0) {
    return "我沒有抓到金額，請用例如「今天午餐 120」或「6月看護費2000元」的格式再傳一次。";
  }

  const typeLabel = record.type === "income" ? "收入" : "支出";
  return `已記錄：${typeLabel}\n日期：${record.date}\n分類：${record.category}\n項目：${record.item}\n金額：${record.amount.toLocaleString()} 元`;
}
