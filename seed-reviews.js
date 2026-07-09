const fs = require("node:fs");
const dns = require("node:dns");
const path = require("node:path");
const { MongoClient } = require("mongodb");

const rootDir = __dirname;

const seedReviews = [
  {
    name: "김하윤",
    course: "보컬 기초·발성 집중반",
    rating: 5,
    text: "호흡이랑 발성 기준을 정확히 잡아줘서 노래할 때 목이 훨씬 편해졌어요.",
    createdAt: "2026-07-07T10:30:00.000Z",
  },
  {
    name: "박서준",
    course: "오디션 보컬 트레이닝",
    rating: 5,
    text: "곡 해석부터 녹음 피드백까지 한 번에 이어져서 준비 방향이 선명해졌습니다.",
    createdAt: "2026-07-05T12:15:00.000Z",
  },
  {
    name: "정유나",
    course: "취미 보컬 1:1",
    rating: 5,
    text: "처음에는 목소리 내는 것도 어색했는데 지금은 좋아하는 곡을 끝까지 부를 수 있어요.",
    createdAt: "2026-07-03T09:20:00.000Z",
  },
  {
    name: "최민재",
    course: "고음 안정화 클래스",
    rating: 5,
    text: "고음에서 힘으로 밀던 습관을 줄이고 소리 위치를 잡는 법을 배웠습니다.",
    createdAt: "2026-07-01T19:10:00.000Z",
  },
  {
    name: "오지우",
    course: "레코딩 보컬",
    rating: 5,
    text: "녹음해서 바로 들어보니 제 문제점이 훨씬 잘 보였고, 수정 방향도 구체적이었어요.",
    createdAt: "2026-06-29T14:40:00.000Z",
  },
  {
    name: "이서연",
    course: "음정·리듬 교정",
    rating: 4,
    text: "박자를 놓치는 구간을 따로 체크해줘서 혼자 연습할 때도 기준이 생겼습니다.",
    createdAt: "2026-06-27T16:05:00.000Z",
  },
  {
    name: "강도현",
    course: "무대 퍼포먼스반",
    rating: 5,
    text: "마이크 잡는 법이랑 시선 처리까지 같이 봐줘서 발표 무대가 덜 긴장됐습니다.",
    createdAt: "2026-06-25T11:35:00.000Z",
  },
  {
    name: "윤채린",
    course: "보컬 기초·발성 집중반",
    rating: 5,
    text: "매주 연습 과제를 짧게 정리해줘서 복습하기 좋고 변화가 느껴져요.",
    createdAt: "2026-06-22T20:10:00.000Z",
  },
  {
    name: "한지민",
    course: "그룹 하모니",
    rating: 4,
    text: "다른 사람 소리를 들으면서 맞추는 연습을 해보니 음정 감각이 좋아졌습니다.",
    createdAt: "2026-06-20T13:50:00.000Z",
  },
  {
    name: "문성우",
    course: "오디션 보컬 트레이닝",
    rating: 5,
    text: "선곡부터 불안했는데 제 음역에 맞는 곡으로 바꾼 뒤 훨씬 안정적으로 들렸어요.",
    createdAt: "2026-06-18T18:20:00.000Z",
  },
  {
    name: "배수아",
    course: "취미 보컬 1:1",
    rating: 5,
    text: "분위기가 부담스럽지 않고 연습실도 현실적이라 꾸준히 다니기 편합니다.",
    createdAt: "2026-06-16T10:05:00.000Z",
  },
  {
    name: "장현우",
    course: "레코딩 보컬",
    rating: 4,
    text: "발음이 뭉개지는 부분을 녹음으로 확인하고 나니 연습 포인트가 명확해졌어요.",
    createdAt: "2026-06-14T15:25:00.000Z",
  },
  {
    name: "신예린",
    course: "고음 안정화 클래스",
    rating: 5,
    text: "목이 쉬는 일이 줄었고, 높은 음을 낼 때 몸을 어떻게 써야 하는지 알게 됐습니다.",
    createdAt: "2026-06-11T19:40:00.000Z",
  },
  {
    name: "서도윤",
    course: "음정·리듬 교정",
    rating: 5,
    text: "피아노로 바로 잡아주니까 음정이 흔들리는 이유를 귀로 이해할 수 있었습니다.",
    createdAt: "2026-06-09T12:00:00.000Z",
  },
  {
    name: "남가은",
    course: "무대 퍼포먼스반",
    rating: 5,
    text: "노래만 보는 게 아니라 시작 전 호흡, 표정, 동선까지 체크해줘서 좋았어요.",
    createdAt: "2026-06-06T17:45:00.000Z",
  },
  {
    name: "조하늘",
    course: "보컬 기초·발성 집중반",
    rating: 4,
    text: "기초부터 천천히 봐줘서 처음 배우는 사람도 따라가기 어렵지 않았습니다.",
    createdAt: "2026-06-03T09:55:00.000Z",
  },
  {
    name: "류현서",
    course: "취미 보컬 1:1",
    rating: 5,
    text: "좋아하는 곡으로 수업하니까 재미있고, 어려운 구간은 따로 잘라 연습해서 좋았어요.",
    createdAt: "2026-05-30T13:25:00.000Z",
  },
  {
    name: "임서진",
    course: "그룹 하모니",
    rating: 5,
    text: "혼자 부를 때 몰랐던 호흡 타이밍을 같이 맞추면서 많이 배웠습니다.",
    createdAt: "2026-05-27T18:30:00.000Z",
  },
  {
    name: "권민수",
    course: "오디션 보컬 트레이닝",
    rating: 5,
    text: "실전처럼 한 번에 부르고 피드백 받는 방식이 도움이 많이 됐습니다.",
    createdAt: "2026-05-24T16:15:00.000Z",
  },
  {
    name: "홍다은",
    course: "레코딩 보컬",
    rating: 4,
    text: "내 목소리가 녹음에서 어떻게 들리는지 객관적으로 들을 수 있어서 좋았습니다.",
    createdAt: "2026-05-20T11:45:00.000Z",
  },
  {
    name: "차민준",
    course: "고음 안정화 클래스",
    rating: 5,
    text: "예전에는 고음 전에 겁부터 났는데 이제는 준비 호흡부터 차근차근 접근합니다.",
    createdAt: "2026-05-16T20:00:00.000Z",
  },
];

const loadEnvFile = () => {
  const envPath = path.join(rootDir, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  fs.readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .forEach((row) => {
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

const configureDns = () => {
  const servers = String(process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean);

  if (servers.length > 0) {
    dns.setServers(servers);
  }
};

const run = async () => {
  loadEnvFile();
  configureDns();

  const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!mongoUri) {
    throw new Error("MONGODB_URI is not configured");
  }

  const client = new MongoClient(mongoUri);
  await client.connect();

  const dbName = process.env.MONGODB_DB || "vocal_academy";
  const collectionName = process.env.MONGODB_REVIEWS_COLLECTION || "reviews";
  const collection = client.db(dbName).collection(collectionName);

  await collection.createIndex({ seedKey: 1 }, { unique: true, sparse: true });

  let inserted = 0;
  let updated = 0;

  for (const [index, review] of seedReviews.entries()) {
    const result = await collection.updateOne(
      { seedKey: `vocalia-default-review-${index + 1}` },
      {
        $set: {
          ...review,
          createdAt: new Date(review.createdAt),
          source: "seed",
        },
        $setOnInsert: {
          seedKey: `vocalia-default-review-${index + 1}`,
        },
      },
      { upsert: true },
    );

    inserted += result.upsertedCount || 0;
    updated += result.modifiedCount || 0;
  }

  const totalSeeded = await collection.countDocuments({ source: "seed" });
  await client.close();

  console.log(JSON.stringify({ inserted, updated, totalSeeded }));
};

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
