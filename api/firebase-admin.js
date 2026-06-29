import admin from "firebase-admin";

function cleanEnv(value) {
  return String(value || "").trim().replace(/^['"]|['"]$/g, "");
}

function getPrivateKey() {
  const privateKey = cleanEnv(process.env.FIREBASE_PRIVATE_KEY);
  if (!privateKey) return "";
  return privateKey.replace(/\\n/g, "\n");
}

function getFirebaseAdminConfig() {
  const projectId = cleanEnv(process.env.FIREBASE_PROJECT_ID);
  const clientEmail = cleanEnv(process.env.FIREBASE_CLIENT_EMAIL);
  const privateKey = getPrivateKey();

  const missing = [];
  if (!projectId) missing.push("FIREBASE_PROJECT_ID");
  if (!clientEmail) missing.push("FIREBASE_CLIENT_EMAIL");
  if (!privateKey) missing.push("FIREBASE_PRIVATE_KEY");
  if (missing.length) {
    throw new Error(`Missing environment variables: ${missing.join(", ")}`);
  }

  if (!clientEmail.includes("@")) {
    throw new Error("FIREBASE_CLIENT_EMAIL format is invalid.");
  }

  if (!privateKey.includes("-----BEGIN PRIVATE KEY-----") || !privateKey.includes("-----END PRIVATE KEY-----")) {
    throw new Error("FIREBASE_PRIVATE_KEY format is invalid. It must include BEGIN PRIVATE KEY and END PRIVATE KEY.");
  }

  return { projectId, clientEmail, privateKey };
}

export function getAdminDb() {
  if (!admin.apps.length) {
    const { projectId, clientEmail, privateKey } = getFirebaseAdminConfig();

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey
      })
    });
  }

  return admin.firestore();
}

export { admin };
