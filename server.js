const fs = require("node:fs");
const fsp = require("node:fs/promises");
const dns = require("node:dns");
const http = require("node:http");
const path = require("node:path");
const { MongoClient } = require("mongodb");

const rootDir = __dirname;
const maxBodyBytes = 16 * 1024;
const maxReviews = 80;

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
]);

const loadEnvFile = () => {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const rows = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  rows.forEach((row) => {
    const line = row.trim();
    if (!line || line.startsWith("#")) {
      return;
    }

    const divider = line.indexOf("=");
    if (divider === -1) {
      return;
    }

    const key = line.slice(0, divider).trim();
    const value = line.slice(divider + 1).trim().replace(/^["']|["']$/g, "");
    if (key && process.env[key] == null) {
      process.env[key] = value;
    }
  });
};

loadEnvFile();

const dnsServers = String(process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

if (dnsServers.length > 0) {
  dns.setServers(dnsServers);
}

const port = Number(process.env.PORT || 4176);
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
const mongoDbName = process.env.MONGODB_DB || "vocal_academy";
const reviewsCollectionName = process.env.MONGODB_REVIEWS_COLLECTION || "reviews";

let mongoClientPromise;

const getReviewsCollection = async () => {
  if (!mongoUri) {
    const error = new Error("MONGODB_URI is not configured");
    error.statusCode = 503;
    throw error;
  }

  if (!mongoClientPromise) {
    mongoClientPromise = new MongoClient(mongoUri).connect();
  }

  const client = await mongoClientPromise;
  return client.db(mongoDbName).collection(reviewsCollectionName);
};

const sendJson = (response, statusCode, payload) => {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
  });
  response.end(JSON.stringify(payload));
};

const readJsonBody = (request) =>
  new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > maxBodyBytes) {
        const error = new Error("Request body is too large");
        error.statusCode = 413;
        reject(error);
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        const error = new Error("Invalid JSON body");
        error.statusCode = 400;
        reject(error);
      }
    });

    request.on("error", reject);
  });

const trimToLength = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);

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
    createdAt: new Date(),
  };
};

const formatReview = (review) => ({
  id: String(review._id || review.id || ""),
  name: review.name,
  course: review.course,
  rating: review.rating,
  text: review.text,
  createdAt: review.createdAt instanceof Date ? review.createdAt.toISOString() : review.createdAt,
});

const handleReviewsApi = async (request, response) => {
  const collection = await getReviewsCollection();

  if (request.method === "GET") {
    const reviews = await collection.find({}).sort({ createdAt: -1 }).limit(maxReviews).toArray();
    sendJson(response, 200, { reviews: reviews.map(formatReview) });
    return;
  }

  if (request.method === "POST") {
    const payload = await readJsonBody(request);
    const review = normalizeReviewPayload(payload);
    const result = await collection.insertOne(review);
    sendJson(response, 201, { review: formatReview({ ...review, _id: result.insertedId }) });
    return;
  }

  sendJson(response, 405, { error: "Method not allowed" });
};

const sendStaticFile = async (requestUrl, response) => {
  const urlPath = decodeURIComponent(requestUrl.pathname);
  const relativePath = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const requestedPath = path.resolve(rootDir, relativePath);

  if (!requestedPath.startsWith(rootDir)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  try {
    const file = await fsp.readFile(requestedPath);
    const extension = path.extname(requestedPath).toLowerCase();
    response.writeHead(200, {
      "content-type": mimeTypes.get(extension) || "application/octet-stream",
    });
    response.end(file);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
};

const server = http.createServer(async (request, response) => {
  try {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

    if (requestUrl.pathname === "/api/reviews") {
      await handleReviewsApi(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/health") {
      sendJson(response, 200, { ok: true, database: Boolean(mongoUri) });
      return;
    }

    await sendStaticFile(requestUrl, response);
  } catch (error) {
    sendJson(response, error.statusCode || 500, {
      error: error.statusCode ? error.message : "Server error",
    });
  }
});

server.listen(port, () => {
  console.log(`Vocalia server running at http://127.0.0.1:${port}`);
});
