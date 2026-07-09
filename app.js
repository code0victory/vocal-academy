const defaultReviews = window.vocaliaDefaultReviews || [];

const reviewForm = document.querySelector("#reviewForm");
const reviewList = document.querySelector("#reviewList");
const reviewStatus = document.querySelector("#reviewStatus");
const reviewNameInput = document.querySelector("#reviewName");
const reviewCourseInput = document.querySelector("#reviewCourse");
const reviewTextInput = document.querySelector("#reviewText");
const allReviewsLink = document.querySelector("#allReviewsLink");

const reviewStorageKey = window.vocaliaReviewStorageKey || "vocaliaLessonReviews";
const homeReviewLimit = 3;

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

const saveReviews = (reviews) => {
  try {
    localStorage.setItem(reviewStorageKey, JSON.stringify(reviews.slice(0, 40)));
  } catch {
    reviewStatus.textContent = "브라우저 저장소를 사용할 수 없습니다";
  }
};

let reviews = loadReviews();

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

if (reviewForm && reviewNameInput && reviewCourseInput && reviewTextInput) {
  reviewForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const selectedRating = reviewForm.querySelector('input[name="reviewRating"]:checked');
    const review = {
      name: reviewNameInput.value.trim(),
      course: reviewCourseInput.value.trim(),
      rating: Number(selectedRating?.value || 5),
      text: reviewTextInput.value.trim(),
      createdAt: new Date().toISOString(),
    };

    if (!review.name || !review.course || !review.text) {
      reviewStatus.textContent = "이름과 과정, 후기를 입력해 주세요";
      return;
    }

    reviews = [review, ...reviews].slice(0, 40);
    saveReviews(reviews);
    renderReviews();
    reviewStatus.textContent = "후기가 등록되었습니다";
    reviewTextInput.value = "";
  });
}

renderReviews();
