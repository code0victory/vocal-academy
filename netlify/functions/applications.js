const dns = require("node:dns");
const { MongoClient } = require("mongodb");

const maxBodyBytes = 16 * 1024;
const mongoUri = String(process.env.MONGODB_URI || process.env.MONGO_URI || "").trim();
const mongoDbName = String(process.env.MONGODB_DB || "vocal_academy").trim();
const applicationsCollectionName = String(process.env.MONGODB_APPLICATIONS_COLLECTION || "lesson_applications").trim();

const dnsServers = String(process.env.DNS_SERVERS || "")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

if (dnsServers.length > 0) {
  dns.setServers(dnsServers);
}

let mongoClientPromise;
const mongoTimeoutMs = Number(process.env.MONGODB_TIMEOUT_MS || 8000);

const headers = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "accept, content-type",
  "cache-control": "no-store",
};

const json = (statusCode, payload) => ({
  statusCode,
  headers: {
    ...headers,
    "content-type": "application/json; charset=utf-8",
  },
  body: JSON.stringify(payload),
});

const trimToLength = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);

const getApplicationsCollection = async () => {
  if (!mongoUri) {
    const error = new Error("MONGODB_URI is not configured");
    error.statusCode = 503;
    throw error;
  }

  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(mongoUri, {
      connectTimeoutMS: mongoTimeoutMs,
      serverSelectionTimeoutMS: mongoTimeoutMs,
      socketTimeoutMS: mongoTimeoutMs,
    })
      .connect()
      .catch((error) => {
        mongoClientPromise = undefined;
        throw error;
      });
  }

  const client = await mongoClientPromise;
  return client.db(mongoDbName).collection(applicationsCollectionName);
};

const parseJsonBody = (event) => {
  const body = event.body || "";
  const byteLength = Buffer.byteLength(body, event.isBase64Encoded ? "base64" : "utf8");

  if (byteLength > maxBodyBytes) {
    const error = new Error("Request body is too large");
    error.statusCode = 413;
    throw error;
  }

  try {
    return body ? JSON.parse(event.isBase64Encoded ? Buffer.from(body, "base64").toString("utf8") : body) : {};
  } catch {
    const error = new Error("Invalid JSON body");
    error.statusCode = 400;
    throw error;
  }
};

const normalizeApplicationPayload = (payload) => {
  const name = trimToLength(payload.name, 24);
  const age = Number(payload.age);
  const phone = trimToLength(payload.phone, 24);
  const availableTime = trimToLength(payload.availableTime, 120);
  const privacyConsent = payload.privacyConsent === true || payload.privacyConsent === "true";

  if (!name || !Number.isInteger(age) || age < 7 || age > 80 || !phone || !availableTime) {
    const error = new Error("Name, age, phone, and available time are required");
    error.statusCode = 400;
    throw error;
  }

  if (!privacyConsent) {
    const error = new Error("Privacy consent is required");
    error.statusCode = 400;
    throw error;
  }

  if (!/^[0-9+\-\s()]{8,24}$/.test(phone)) {
    const error = new Error("Phone number format is invalid");
    error.statusCode = 400;
    throw error;
  }

  return {
    name,
    age,
    phone,
    availableTime,
    privacyConsent: true,
  };
};

const formatApplication = (application) => ({
  id: String(application._id || application.id || ""),
  name: application.name,
  age: application.age,
  phone: application.phone,
  availableTime: application.availableTime,
  privacyConsent: Boolean(application.privacyConsent),
  privacyConsentAt:
    application.privacyConsentAt instanceof Date ? application.privacyConsentAt.toISOString() : application.privacyConsentAt,
  createdAt: application.createdAt instanceof Date ? application.createdAt.toISOString() : application.createdAt,
});

const sanitizeErrorMessage = (message) =>
  String(message || "")
    .replace(String(mongoUri || ""), "[redacted-mongodb-uri]")
    .replace(/mongodb\+srv:\/\/[^@\s]+@/gi, "mongodb+srv://[redacted]@")
    .slice(0, 500);

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const payload = parseJsonBody(event);
    const application = {
      ...normalizeApplicationPayload(payload),
      status: "new",
      createdAt: new Date(),
      privacyConsentAt: new Date(),
    };
    const collection = await getApplicationsCollection();
    const result = await collection.insertOne(application);

    return json(201, {
      application: formatApplication({ ...application, _id: result.insertedId }),
    });
  } catch (error) {
    if (error.statusCode) {
      return json(error.statusCode, { error: error.message });
    }

    return json(503, {
      error: "Database connection failed",
      detail: sanitizeErrorMessage(error.message),
    });
  }
};
