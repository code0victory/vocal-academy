const defaultReviews = window.vocaliaDefaultReviews || [];
const reviewStorageKey = window.vocaliaReviewStorageKey || "vocaliaLessonReviews";

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

const loadReviews = () => {
  try {
    const storedReviews = JSON.parse(localStorage.getItem(reviewStorageKey) || "[]");
    return Array.isArray(storedReviews) && storedReviews.length > 0
      ? mergeReviews(storedReviews, defaultReviews)
      : defaultReviews;
  } catch {
    return defaultReviews;
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

const reviews = loadReviews();
let activeCourse = "전체";

const courses = ["전체", ...Array.from(new Set(reviews.map((review) => review.course)))];

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
