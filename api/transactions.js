import { getAdminDb, admin } from "./firebase-admin.js";

function send(res, status, body) {
  res.status(status).json(body);
}

function normalizeRecord(data = {}) {
  return {
    date: String(data.date || ""),
    type: data.type === "income" ? "income" : "expense",
    category: String(data.category || "其他支出"),
    item: String(data.item || ""),
    amount: Number(data.amount || 0),
    source: String(data.source || "web")
  };
}

function validateRecord(record) {
  if (!record.date) return "date is required";
  if (!record.item) return "item is required";
  if (!record.amount || record.amount <= 0) return "amount must be greater than 0";
  return "";
}

export default async function handler(req, res) {
  try {
    const db = getAdminDb();
    const collectionRef = db.collection("transactions");

    if (req.method === "GET") {
      const snapshot = await collectionRef.orderBy("date", "desc").limit(500).get();
      const rows = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      send(res, 200, { rows });
      return;
    }

    if (req.method === "POST") {
      const record = normalizeRecord(req.body);
      const error = validateRecord(record);
      if (error) return send(res, 400, { error });

      const ref = await collectionRef.add({
        ...record,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      send(res, 200, { id: ref.id });
      return;
    }

    if (req.method === "PUT") {
      const { id, ...data } = req.body || {};
      if (!id) return send(res, 400, { error: "id is required" });
      const record = normalizeRecord(data);
      const error = validateRecord(record);
      if (error) return send(res, 400, { error });

      await collectionRef.doc(id).update({
        ...record,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      send(res, 200, { ok: true });
      return;
    }

    if (req.method === "DELETE") {
      const id = req.query.id || req.body?.id;
      if (!id) return send(res, 400, { error: "id is required" });
      await collectionRef.doc(String(id)).delete();
      send(res, 200, { ok: true });
      return;
    }

    send(res, 405, { error: "Method not allowed" });
  } catch (error) {
    console.error(error);
    send(res, 500, { error: error.message || "Internal server error" });
  }
}
