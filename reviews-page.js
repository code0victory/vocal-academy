const defaultReviews = window.vocaliaDefaultReviews || [];
const reviewStorageKey = window.vocaliaReviewStorageKey || "vocaliaLessonReviews";
const legacyReviewStorageKey = window.vocaliaLegacyReviewStorageKey || "vocaliaLessonReviews";
const reviewsApiEndpoint = window.vocaliaReviewsApiEndpoint || "";
const maxSubmittedReviews = 80;

const reviewPageList = document.querySelector("#reviewPageList");
const reviewPageStatus = document.querySelector("#reviewPageStatus");
const reviewFilterBar = document.querySelector("#reviewFilterBar");
const reviewSearch = document.querySelector("#reviewSearch");
const reviewPageCount = document.querySelector("#reviewPageCount");
const reviewPageAverage = document.querySelector("#reviewPageAverage");

const escapeHTML = (value) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

const maskReviewerName = (name) => {
  const characters = Array.from(String(name ?? "").trim());

  if (characters.length <= 1) {
    return characters.join("");
  }

  if (characters.length === 2) {
    return `${characters[0]}ㅇ`;
  }

  return `${characters[0]}${"ㅇ".repeat(characters.length - 2)}${characters.at(-1)}`;
};

const reviewKey = (review) => `${review.name}|${review.course}|${review.text}`;
const defaultReviewKeys = new Set(defaultReviews.map(reviewKey));

const trimToLength = (value, maxLength) => String(value ?? "").trim().slice(0, maxLength);

const normalizeReview = (review) => {
  const name = trimToLength(review?.name, 24);
  const course = trimToLength(review?.course, 80);
  const text = trimToLength(review?.text, 220);

  if (!name || !course || !text) {
    return null;
  }

  const createdAt = new Date(review?.createdAt);
  const rating = Math.min(5, Math.max(1, Number(review?.rating) || 5));

  return {
    id: review?.id ? String(review.id) : "",
    name,
    course,
    rating,
    text,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
  };
};

const mergeReviews = (primaryReviews = [], fallbackReviews = []) => {
  const seen = new Set();
  const merged = [];

  [...primaryReviews, ...fallbackReviews].forEach((review) => {
    const key = reviewKey(review);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(review);
    }
  });

  return merged.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
};

const readStoredReviews = (storageKey) => {
  try {
    const storedReviews = JSON.parse(localStorage.getItem(storageKey) || "[]");
    return Array.isArray(storedReviews) ? storedReviews : [];
  } catch {
    return [];
  }
};

const loadSubmittedReviews = () => {
  const storedReviews = readStoredReviews(reviewStorageKey);
  const legacyReviews = storedReviews.length > 0 ? [] : readStoredReviews(legacyReviewStorageKey);

  return mergeReviews(
    [...storedReviews, ...legacyReviews]
      .map(normalizeReview)
      .filter(Boolean)
      .filter((review) => !defaultReviewKeys.has(reviewKey(review))),
    [],
  ).slice(0, maxSubmittedReviews);
};

const loadReviews = () => mergeReviews(loadSubmittedReviews(), defaultReviews);

const fetchApiReviews = async () => {
  if (!reviewsApiEndpoint || location.protocol === "file:") {
    return null;
  }

  try {
    const response = await fetch(reviewsApiEndpoint, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    const payload = await response.json();
    const apiReviews = Array.isArray(payload) ? payload : payload.reviews;
    if (!Array.isArray(apiReviews)) {
      return null;
    }

    return mergeReviews(
      apiReviews
        .map(normalizeReview)
        .filter(Boolean)
        .filter((review) => !defaultReviewKeys.has(reviewKey(review))),
      [],
    ).slice(0, maxSubmittedReviews);
  } catch {
    return null;
  }
};

const renderRating = (rating) => {
  const score = Math.min(5, Math.max(1, Number(rating) || 5));
  return "★".repeat(score) + "☆".repeat(5 - score);
};

const formatReviewDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "날짜 없음";
  }

  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
};

let reviews = loadReviews();
let activeCourse = "전체";

let courses = ["전체", ...Array.from(new Set(reviews.map((review) => review.course)))];

const getFilteredReviews = () => {
  const query = reviewSearch.value.trim().toLowerCase();

  return reviews.filter((review) => {
    const matchesCourse = activeCourse === "전체" || review.course === activeCourse;
    const searchTarget = `${maskReviewerName(review.name)} ${review.course} ${review.text}`.toLowerCase();
    const matchesQuery = !query || searchTarget.includes(query);
    return matchesCourse && matchesQuery;
  });
};

const renderSummary = () => {
  const average = reviews.reduce((sum, review) => sum + Number(review.rating || 0), 0) / Math.max(reviews.length, 1);
  reviewPageCount.textContent = String(reviews.length);
  reviewPageAverage.textContent = average.toFixed(1);
};

const renderFilters = () => {
  reviewFilterBar.innerHTML = courses
    .map(
      (course) => `
        <button class="review-filter${course === activeCourse ? " is-active" : ""}" type="button" data-course="${escapeHTML(course)}">
          ${escapeHTML(course)}
        </button>
      `,
    )
    .join("");
};

const renderReviewPage = () => {
  const filteredReviews = getFilteredReviews();
  reviewPageStatus.textContent = `${filteredReviews.length}개의 후기를 보고 있습니다`;
  reviewPageList.innerHTML = filteredReviews
    .map((review) => {
      const score = Math.min(5, Math.max(1, Number(review.rating) || 5));
      return `
        <article class="review-card review-page-card">
          <header>
            <div>
              <strong>${escapeHTML(maskReviewerName(review.name))}</strong>
              <span class="review-course">${escapeHTML(review.course)}</span>
              <time datetime="${escapeHTML(review.createdAt)}">${formatReviewDate(review.createdAt)}</time>
            </div>
            <span class="review-rating" aria-label="5점 만점 중 ${score}점">${renderRating(score)}</span>
          </header>
          <p>${escapeHTML(review.text)}</p>
        </article>
      `;
    })
    .join("");
};

reviewFilterBar.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-course]");
  if (!button) {
    return;
  }

  activeCourse = button.dataset.course;
  renderFilters();
  renderReviewPage();
});

reviewSearch.addEventListener("input", renderReviewPage);

renderSummary();
renderFilters();
renderReviewPage();

const refreshReviewsFromApi = async () => {
  const apiReviews = await fetchApiReviews();
  if (!apiReviews) {
    return;
  }

  reviews = mergeReviews(apiReviews, reviews).slice(0, maxSubmittedReviews + defaultReviews.length);
  courses = ["전체", ...Array.from(new Set(reviews.map((review) => review.course)))];

  if (!courses.includes(activeCourse)) {
    activeCourse = "전체";
  }

  renderSummary();
  renderFilters();
  renderReviewPage();
};

refreshReviewsFromApi();
