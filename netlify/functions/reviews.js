const crypto = require("node:crypto");
const dns = require("node:dns");
const { MongoClient, ObjectId } = require("mongodb");

const maxBodyBytes = 16 * 1024;
const maxReviews = 80;
const mongoUri = String(process.env.MONGODB_URI || process.env.MONGO_URI || "").trim();
const mongoDbName = String(process.env.MONGODB_DB || "vocal_academy").trim();
const reviewsCollectionName = String(process.env.MONGODB_REVIEWS_COLLECTION || "reviews").trim();

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
  "access-control-allow-methods": "GET, POST, PATCH, DELETE, OPTIONS",
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

const sanitizeErrorMessage = (message) =>
  String(message || "")
    .replace(String(mongoUri || ""), "[redacted-mongodb-uri]")
    .replace(/mongodb\+srv:\/\/[^@\s]+@/gi, "mongodb+srv://[redacted]@")
    .slice(0, 500);

const getReviewsCollection = async () => {
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
  return client.db(mongoDbName).collection(reviewsCollectionName);
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

const normalizeEditPin = (value) => trimToLength(value, 32);

const createEditPinHash = (editPin, salt = crypto.randomBytes(16).toString("hex")) => ({
  salt,
  hash: crypto.createHash("sha256").update(`${salt}:${editPin}`).digest("hex"),
});

const isEditPinMatch = (inputHash, storedHash) => {
  const input = Buffer.from(inputHash);
  const stored = Buffer.from(String(storedHash || ""));
  return input.length === stored.length && crypto.timingSafeEqual(input, stored);
};

const assertValidEditPin = (editPin) => {
  if (editPin.length < 4) {
    const error = new Error("Review edit password must be at least 4 characters");
    error.statusCode = 400;
    throw error;
  }
};

const normalizeReviewPayload = (payload) => {
  const name = trimToLength(payload.name, 24);
  const course = trimToLength(payload.course, 80);
  const text = trimToLength(payload.text, 220);
  const rating = Math.min(5, Math.max(1, Number(payload.rating) || 5));

  if (!name || !course || !text) {
    const error = new Error("Name, course, and review text are required");
    error.statusCode = 400;
    throw error;
  }

  return {
    name,
    course,
    rating,
    text,
  };
};

const formatReview = (review) => ({
  id: String(review._id || review.id || ""),
  name: review.name,
  course: review.course,
  rating: review.rating,
  text: review.text,
  createdAt: review.createdAt instanceof Date ? review.createdAt.toISOString() : review.createdAt,
  editable: Boolean(review.editPinHash),
});

const getReviewId = (event) => {
  const path = String(event.path || "").replace(/\/+$/, "");
  const match = path.match(/(?:\/api\/reviews|\/\.netlify\/functions\/reviews)\/([^/?#]+)$/);
  return match ? decodeURIComponent(match[1]) : "";
};

const handleReviewCollection = async (event) => {
  const collection = await getReviewsCollection();

  if (event.httpMethod === "GET") {
    const reviews = await collection.find({}).sort({ createdAt: -1 }).limit(maxReviews).toArray();
    return json(200, { reviews: reviews.map(formatReview) });
  }

  if (event.httpMethod === "POST") {
    const payload = parseJsonBody(event);
    const editPin = normalizeEditPin(payload.editPin);
    assertValidEditPin(editPin);
    const editPinHash = createEditPinHash(editPin);
    const review = {
      ...normalizeReviewPayload(payload),
      createdAt: new Date(),
      editPinSalt: editPinHash.salt,
      editPinHash: editPinHash.hash,
    };
    const result = await collection.insertOne(review);

    return json(201, { review: formatReview({ ...review, _id: result.insertedId }) });
  }

  return json(405, { error: "Method not allowed" });
};

const handleReviewItem = async (event, reviewId) => {
  if (!ObjectId.isValid(reviewId)) {
    return json(400, { error: "Invalid review id" });
  }

  if (event.httpMethod !== "PATCH" && event.httpMethod !== "DELETE") {
    return json(405, { error: "Method not allowed" });
  }

  const collection = await getReviewsCollection();
  const payload = parseJsonBody(event);
  const editPin = normalizeEditPin(payload.editPin);
  assertValidEditPin(editPin);

  const objectId = new ObjectId(reviewId);
  const existingReview = await collection.findOne({ _id: objectId });

  if (!existingReview) {
    return json(404, { error: "Review not found" });
  }

  if (!existingReview.editPinSalt || !existingReview.editPinHash) {
    return json(403, { error: "This review cannot be edited" });
  }

  const editPinHash = createEditPinHash(editPin, existingReview.editPinSalt);
  if (!isEditPinMatch(editPinHash.hash, existingReview.editPinHash)) {
    return json(403, { error: "Review edit password does not match" });
  }

  if (event.httpMethod === "DELETE") {
    await collection.deleteOne({ _id: objectId });
    return json(200, { deleted: true, id: reviewId });
  }

  const review = normalizeReviewPayload(payload);
  await collection.updateOne(
    { _id: objectId },
    {
      $set: {
        ...review,
        updatedAt: new Date(),
      },
    },
  );

  const updatedReview = await collection.findOne({ _id: objectId });
  return json(200, { review: formatReview(updatedReview) });
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers,
      body: "",
    };
  }

  try {
    const reviewId = getReviewId(event);
    return reviewId ? handleReviewItem(event, reviewId) : handleReviewCollection(event);
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
