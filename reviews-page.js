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

const reviewMergeKeys = (review) => [
  review.id ? `id:${review.id}` : "",
  `content:${reviewKey(review)}`,
].filter(Boolean);

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
    editable: Boolean(review?.editable && review?.id),
  };
};

const mergeReviews = (primaryReviews = [], fallbackReviews = []) => {
  const seen = new Set();
  const merged = [];

  [...primaryReviews, ...fallbackReviews].forEach((review) => {
    const keys = reviewMergeKeys(review);
    if (keys.some((key) => seen.has(key))) {
      return;
    }

    keys.forEach((key) => seen.add(key));
    merged.push(review);
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

const removeStoredReview = (reviewId) => {
  const storageKeys = Array.from(new Set([reviewStorageKey, legacyReviewStorageKey].filter(Boolean)));

  storageKeys.forEach((storageKey) => {
    const storedReviews = readStoredReviews(storageKey);
    const filteredReviews = storedReviews.filter((review) => String(review?.id || "") !== reviewId);

    if (filteredReviews.length !== storedReviews.length) {
      localStorage.setItem(storageKey, JSON.stringify(filteredReviews));
    }
  });
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

const updateReviewInApi = async (reviewId, payload) => {
  if (!reviewsApiEndpoint || location.protocol === "file:") {
    throw new Error("후기 수정 서버가 연결되어 있지 않습니다");
  }

  const response = await fetch(`${reviewsApiEndpoint}/${encodeURIComponent(reviewId)}`, {
    method: "PATCH",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("후기 수정에 실패했습니다");
  }

  const payloadBody = await response.json();
  return normalizeReview(payloadBody.review || payloadBody);
};

const deleteReviewFromApi = async (reviewId, payload) => {
  if (!reviewsApiEndpoint || location.protocol === "file:") {
    throw new Error("후기 삭제 서버가 연결되어 있지 않습니다");
  }

  const response = await fetch(`${reviewsApiEndpoint}/${encodeURIComponent(reviewId)}`, {
    method: "DELETE",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error("후기 삭제에 실패했습니다");
  }

  return response.json();
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
let editingReviewId = "";
let reviewPageMessage = "";

let courses = ["전체", ...Array.from(new Set(reviews.map((review) => review.course)))];

const refreshCourses = () => {
  courses = ["전체", ...Array.from(new Set(reviews.map((review) => review.course)))];

  if (!courses.includes(activeCourse)) {
    activeCourse = "전체";
  }
};

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

const renderReviewEditForm = (review, score) => `
  <form class="review-edit-form" data-review-edit-form="${escapeHTML(review.id)}">
    <label>
      작성자
      <input name="name" type="text" maxlength="24" value="${escapeHTML(review.name)}" required />
    </label>
    <label>
      레슨 과정
      <input name="course" type="text" maxlength="80" value="${escapeHTML(review.course)}" required />
    </label>
    <label>
      평점
      <select name="rating" required>
        ${[5, 4, 3, 2, 1]
          .map((rating) => `<option value="${rating}"${rating === score ? " selected" : ""}>${rating}점</option>`)
          .join("")}
      </select>
    </label>
    <label>
      후기
      <textarea name="text" maxlength="220" required>${escapeHTML(review.text)}</textarea>
    </label>
    <label>
      수정 비밀번호
      <input name="editPin" type="password" minlength="4" maxlength="32" placeholder="등록할 때 입력한 비밀번호" required />
    </label>
    <div class="review-edit-actions">
      <button class="primary-button" type="submit">수정 저장</button>
      <button class="review-delete-button" type="button" data-review-delete>후기 삭제</button>
      <button class="review-edit-button" type="button" data-review-edit-cancel>취소</button>
    </div>
  </form>
`;

const renderReviewTools = (review, score) => {
  if (editingReviewId === review.id) {
    return renderReviewEditForm(review, score);
  }

  if (!review.editable || !review.id) {
    return "";
  }

  return `
    <footer class="review-card-actions">
      <button class="review-edit-button" type="button" data-review-edit="${escapeHTML(review.id)}">후기 수정</button>
    </footer>
  `;
};

const renderReviewPage = () => {
  const filteredReviews = getFilteredReviews();
  reviewPageStatus.textContent = reviewPageMessage || `${filteredReviews.length}개의 후기를 보고 있습니다`;
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
          ${renderReviewTools(review, score)}
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
  reviewPageMessage = "";
  renderFilters();
  renderReviewPage();
});

reviewSearch.addEventListener("input", () => {
  reviewPageMessage = "";
  renderReviewPage();
});

reviewPageList.addEventListener("click", (event) => {
  const editButton = event.target.closest("button[data-review-edit]");
  const deleteButton = event.target.closest("button[data-review-delete]");
  const cancelButton = event.target.closest("button[data-review-edit-cancel]");

  if (editButton) {
    editingReviewId = editButton.dataset.reviewEdit;
    reviewPageMessage = "";
    renderReviewPage();
    return;
  }

  if (deleteButton) {
    const form = deleteButton.closest("form[data-review-edit-form]");
    if (!form) {
      return;
    }

    const reviewId = form?.dataset.reviewEditForm || "";
    const editPinInput = form?.querySelector('input[name="editPin"]');
    const editPin = editPinInput?.value.trim() || "";

    if (editPin.length < 4) {
      reviewPageStatus.textContent = "삭제하려면 수정 비밀번호를 입력해 주세요";
      editPinInput?.focus();
      return;
    }

    if (!confirm("후기를 삭제할까요? 삭제 후 되돌릴 수 없습니다.")) {
      return;
    }

    const buttons = form.querySelectorAll("button");
    buttons.forEach((button) => {
      button.disabled = true;
    });
    reviewPageStatus.textContent = "후기를 삭제하는 중입니다";

    deleteReviewFromApi(reviewId, { editPin })
      .then(() => {
        removeStoredReview(reviewId);
        reviews = reviews.filter((review) => review.id !== reviewId);
        editingReviewId = "";
        reviewPageMessage = "후기가 삭제되었습니다";
        refreshCourses();
        renderSummary();
        renderFilters();
        renderReviewPage();
      })
      .catch(() => {
        reviewPageStatus.textContent = "수정 비밀번호를 확인해 주세요";
        buttons.forEach((button) => {
          button.disabled = false;
        });
      });
    return;
  }

  if (cancelButton) {
    editingReviewId = "";
    reviewPageMessage = "";
    renderReviewPage();
  }
});

reviewPageList.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-review-edit-form]");
  if (!form) {
    return;
  }

  event.preventDefault();

  const formData = new FormData(form);
  const editPin = String(formData.get("editPin") || "").trim();
  const reviewId = form.dataset.reviewEditForm;

  if (editPin.length < 4) {
    reviewPageStatus.textContent = "수정 비밀번호를 4자 이상 입력해 주세요";
    form.querySelector('input[name="editPin"]')?.focus();
    return;
  }

  const buttons = form.querySelectorAll("button");
  buttons.forEach((button) => {
    button.disabled = true;
  });
  reviewPageStatus.textContent = "후기를 수정하는 중입니다";

  try {
    const updatedReview = await updateReviewInApi(reviewId, {
      name: String(formData.get("name") || "").trim(),
      course: String(formData.get("course") || "").trim(),
      rating: Number(formData.get("rating") || 5),
      text: String(formData.get("text") || "").trim(),
      editPin,
    });

    if (!updatedReview) {
      throw new Error("후기 수정 응답이 올바르지 않습니다");
    }

    reviews = mergeReviews(
      [updatedReview],
      reviews.filter((review) => review.id !== updatedReview.id),
    ).slice(0, maxSubmittedReviews + defaultReviews.length);
    editingReviewId = "";
    reviewPageMessage = "후기가 수정되었습니다";
    refreshCourses();
    renderSummary();
    renderFilters();
    renderReviewPage();
  } catch {
    reviewPageStatus.textContent = "수정 비밀번호를 확인해 주세요";
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
});

renderSummary();
renderFilters();
renderReviewPage();

const refreshReviewsFromApi = async () => {
  const apiReviews = await fetchApiReviews();
  if (!apiReviews) {
    return;
  }

  reviews = mergeReviews(apiReviews, reviews).slice(0, maxSubmittedReviews + defaultReviews.length);
  refreshCourses();

  renderSummary();
  renderFilters();
  renderReviewPage();
};

refreshReviewsFromApi();
