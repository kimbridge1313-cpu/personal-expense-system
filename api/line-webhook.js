import crypto from "crypto";
import { getAdminDb, admin } from "./firebase-admin.js";
import { parseLineMessage, formatReply } from "./line-parser.js";

async function getRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function verifyLineSignature(rawBody, signature) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret || !signature) return false;

  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");

  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

async function replyToLine(replyToken, text) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token || !replyToken) return;

  await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }]
    })
  });
}

async function handleMessageEvent(event) {
  if (event.type !== "message") return;
  if (!event.message || event.message.type !== "text") return;

  const record = parseLineMessage(event.message.text);
  const replyText = formatReply(record);

  if (!record.amount || record.amount <= 0) {
    await replyToLine(event.replyToken, replyText);
    return;
  }

  const db = getAdminDb();
  await db.collection("transactions").add({
    ...record,
    userId: event.source?.userId || "unknown",
    source: "line",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  });

  await replyToLine(event.replyToken, replyText);
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    res.status(200).send("LINE webhook is running.");
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const rawBody = await getRawBody(req);
  const signature = req.headers["x-line-signature"];

  if (!verifyLineSignature(rawBody, signature)) {
    res.status(401).json({ error: "Invalid LINE signature" });
    return;
  }

  const body = JSON.parse(rawBody || "{}");
  const events = Array.isArray(body.events) ? body.events : [];

  await Promise.all(events.map(handleMessageEvent));

  res.status(200).json({ ok: true });
}
