const defaultReviews = window.vocaliaDefaultReviews || [];

const reviewForm = document.querySelector("#reviewForm");
const reviewList = document.querySelector("#reviewList");
const reviewStatus = document.querySelector("#reviewStatus");
const reviewNameInput = document.querySelector("#reviewName");
const reviewCourseInput = document.querySelector("#reviewCourse");
const reviewTextInput = document.querySelector("#reviewText");
const allReviewsLink = document.querySelector("#allReviewsLink");
const reviewSubmitButton = reviewForm?.querySelector('button[type="submit"]');

const reviewStorageKey = window.vocaliaReviewStorageKey || "vocaliaLessonReviews";
const legacyReviewStorageKey = window.vocaliaLegacyReviewStorageKey || "vocaliaLessonReviews";
const reviewsApiEndpoint = window.vocaliaReviewsApiEndpoint || "";
const homeReviewLimit = 3;
const maxSubmittedReviews = 80;

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
    id: review?.id ? String(review.id) : `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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

const buildReviews = (submittedReviews) => mergeReviews(submittedReviews, defaultReviews);

const saveSubmittedReviews = (submittedReviews) => {
  try {
    localStorage.setItem(reviewStorageKey, JSON.stringify(submittedReviews.slice(0, maxSubmittedReviews)));
    return true;
  } catch {
    reviewStatus.textContent = "브라우저 저장소를 사용할 수 없습니다";
    return false;
  }
};

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

const submitReviewToApi = async (review) => {
  if (!reviewsApiEndpoint || location.protocol === "file:") {
    throw new Error("후기 저장 서버가 연결되어 있지 않습니다");
  }

  const response = await fetch(reviewsApiEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(review),
  });

  if (!response.ok) {
    throw new Error("후기 저장에 실패했습니다");
  }

  const payload = await response.json();
  return normalizeReview(payload.review || payload);
};

let submittedReviews = loadSubmittedReviews();
let reviews = buildReviews(submittedReviews);

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

const renderReviews = () => {
  if (!reviewList || !reviewStatus) {
    return;
  }

  const previewCount = Math.min(homeReviewLimit, reviews.length);
  reviewStatus.textContent = `최근 후기 ${previewCount}개`;
  if (allReviewsLink) {
    allReviewsLink.textContent = `전체 후기 ${reviews.length}개 보기`;
  }

  reviewList.innerHTML = reviews
    .slice(0, homeReviewLimit)
    .map((review) => {
      const score = Math.min(5, Math.max(1, Number(review.rating) || 5));
      const createdAt = formatReviewDate(review.createdAt);
      return `
        <article class="review-card">
          <header>
            <div>
              <strong>${escapeHTML(maskReviewerName(review.name))}</strong>
              <span class="review-course">${escapeHTML(review.course)}</span>
              <time datetime="${escapeHTML(review.createdAt)}">${createdAt}</time>
            </div>
            <span class="review-rating" aria-label="5점 만점 중 ${score}점">${renderRating(score)}</span>
          </header>
          <p>${escapeHTML(review.text)}</p>
        </article>
      `;
    })
    .join("");
};

const refreshReviewsFromApi = async () => {
  const apiReviews = await fetchApiReviews();
  if (!apiReviews) {
    return;
  }

  submittedReviews = mergeReviews(apiReviews, submittedReviews).slice(0, maxSubmittedReviews);
  saveSubmittedReviews(submittedReviews);
  reviews = buildReviews(submittedReviews);
  renderReviews();
};

if (reviewForm && reviewNameInput && reviewCourseInput && reviewTextInput) {
  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedRating = reviewForm.querySelector('input[name="reviewRating"]:checked');
    const review = normalizeReview({
      id: `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: reviewNameInput.value.trim(),
      course: reviewCourseInput.value.trim(),
      rating: Number(selectedRating?.value || 5),
      text: reviewTextInput.value.trim(),
      createdAt: new Date().toISOString(),
    });

    if (!review) {
      reviewStatus.textContent = "이름과 과정, 후기를 입력해 주세요";
      return;
    }

    reviewStatus.textContent = "후기를 저장하는 중입니다";
    if (reviewSubmitButton) {
      reviewSubmitButton.disabled = true;
    }

    try {
      const savedReview = await submitReviewToApi(review);
      if (!savedReview) {
        throw new Error("후기 저장 응답이 올바르지 않습니다");
      }

      submittedReviews = [
        savedReview,
        ...submittedReviews.filter((storedReview) => reviewKey(storedReview) !== reviewKey(savedReview)),
      ].slice(0, maxSubmittedReviews);

      if (!saveSubmittedReviews(submittedReviews)) {
        return;
      }

      reviews = buildReviews(submittedReviews);
      renderReviews();
      reviewStatus.textContent = `등록 완료 · 전체 후기 ${reviews.length}개`;
      reviewForm.reset();
    } catch {
      reviewStatus.textContent = "서버 저장에 실패했습니다. 잠시 후 다시 시도해 주세요";
    } finally {
      if (reviewSubmitButton) {
        reviewSubmitButton.disabled = false;
      }
    }
  });
}

renderReviews();
refreshReviewsFromApi();
