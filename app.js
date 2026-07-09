const reviewForm = document.querySelector("#reviewForm");
const reviewList = document.querySelector("#reviewList");
const reviewStatus = document.querySelector("#reviewStatus");
const reviewNameInput = document.querySelector("#reviewName");
const reviewCourseInput = document.querySelector("#reviewCourse");
const reviewTextInput = document.querySelector("#reviewText");
const reviewEditPinInput = document.querySelector("#reviewEditPin");
const allReviewsLink = document.querySelector("#allReviewsLink");
const reviewSubmitButton = reviewForm?.querySelector('button[type="submit"]');
const lessonApplicationForm = document.querySelector("#lessonApplicationForm");
const applicationStatus = document.querySelector("#applicationStatus");
const applicationNameInput = document.querySelector("#applicationName");
const applicationAgeInput = document.querySelector("#applicationAge");
const applicationPhoneInput = document.querySelector("#applicationPhone");
const applicationTimeInput = document.querySelector("#applicationTime");
const applicationSubmitButton = lessonApplicationForm?.querySelector('button[type="submit"]');
const applicationRequiredMessage = "이름, 나이, 전화번호, 가능시간을 확인해 주세요";

const reviewsApiEndpoint = window.vocaliaReviewsApiEndpoint || "";
const applicationsApiEndpoint = window.vocaliaApplicationsApiEndpoint || "";
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
    id: review?.id ? String(review.id) : `review-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        .filter(Boolean),
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

const submitApplicationToApi = async (application) => {
  if (!applicationsApiEndpoint || location.protocol === "file:") {
    const error = new Error("레슨 신청 서버가 연결되어 있지 않습니다");
    error.code = "APPLICATION_ENDPOINT_UNAVAILABLE";
    throw error;
  }

  const response = await fetch(applicationsApiEndpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(application),
  });

  if (!response.ok) {
    throw new Error("레슨 신청에 실패했습니다");
  }

  return response.json();
};

let reviews = [];
let reviewsLoaded = false;

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

  if (!reviewsLoaded && reviews.length === 0) {
    reviewStatus.textContent = "후기 불러오는 중";
    if (allReviewsLink) {
      allReviewsLink.textContent = "전체 후기 보기";
    }

    reviewList.innerHTML = `
      <article class="review-card">
        <p>후기를 불러오고 있습니다.</p>
      </article>
    `;
    return;
  }

  if (reviews.length === 0) {
    reviewStatus.textContent = "등록된 후기 0개";
    if (allReviewsLink) {
      allReviewsLink.textContent = "전체 후기 보기";
    }

    reviewList.innerHTML = `
      <article class="review-card">
        <p>아직 등록된 후기가 없습니다.</p>
      </article>
    `;
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
  reviewsLoaded = true;
  if (!apiReviews) {
    reviewStatus.textContent = "후기를 불러오지 못했습니다";
    reviewList.innerHTML = `
      <article class="review-card">
        <p>DB 후기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</p>
      </article>
    `;
    return;
  }

  reviews = apiReviews;
  renderReviews();
};

if (reviewForm && reviewNameInput && reviewCourseInput && reviewTextInput && reviewEditPinInput) {
  reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const selectedRating = reviewForm.querySelector('input[name="reviewRating"]:checked');
    const editPin = reviewEditPinInput.value.trim();
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

    if (editPin.length < 4) {
      reviewStatus.textContent = "수정 비밀번호를 4자 이상 입력해 주세요";
      reviewEditPinInput.focus();
      return;
    }

    reviewStatus.textContent = "후기를 저장하는 중입니다";
    if (reviewSubmitButton) {
      reviewSubmitButton.disabled = true;
    }

    try {
      const savedReview = await submitReviewToApi({ ...review, editPin });
      if (!savedReview) {
        throw new Error("후기 저장 응답이 올바르지 않습니다");
      }

      reviewsLoaded = true;
      reviews = mergeReviews([savedReview], reviews).slice(0, maxSubmittedReviews);
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

if (
  lessonApplicationForm &&
  applicationStatus &&
  applicationNameInput &&
  applicationAgeInput &&
  applicationPhoneInput &&
  applicationTimeInput
) {
  [applicationNameInput, applicationAgeInput, applicationPhoneInput, applicationTimeInput].forEach((input) => {
    input.addEventListener("invalid", () => {
      applicationStatus.textContent = applicationRequiredMessage;
    });
  });

  lessonApplicationForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const ageValue = applicationAgeInput.value.trim();
    const application = {
      name: applicationNameInput.value.trim(),
      age: Number(ageValue),
      phone: applicationPhoneInput.value.trim(),
      availableTime: applicationTimeInput.value.trim(),
    };

    if (!application.name || !ageValue || !application.phone || !application.availableTime) {
      applicationStatus.textContent = applicationRequiredMessage;
      return;
    }

    if (!Number.isInteger(application.age) || application.age < 7 || application.age > 80) {
      applicationStatus.textContent = "나이는 7세부터 80세까지 입력할 수 있습니다";
      applicationAgeInput.focus();
      return;
    }

    if (!/^[0-9+\-\s()]{8,24}$/.test(application.phone)) {
      applicationStatus.textContent = "전화번호를 다시 확인해 주세요";
      applicationPhoneInput.focus();
      return;
    }

    applicationStatus.textContent = "신청을 보내는 중입니다";
    if (applicationSubmitButton) {
      applicationSubmitButton.disabled = true;
    }

    try {
      await submitApplicationToApi(application);
      applicationStatus.textContent = "신청이 접수되었습니다. 가능한 시간 확인 후 연락드릴게요";
      lessonApplicationForm.reset();
    } catch (error) {
      applicationStatus.textContent =
        error?.code === "APPLICATION_ENDPOINT_UNAVAILABLE"
          ? "서버 주소에서 다시 열어 주세요. 파일로 열면 신청이 저장되지 않습니다"
          : "신청 저장에 실패했습니다. 잠시 후 다시 시도해 주세요";
    } finally {
      if (applicationSubmitButton) {
        applicationSubmitButton.disabled = false;
      }
    }
  });
}

renderReviews();
refreshReviewsFromApi();
