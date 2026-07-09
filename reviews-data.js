window.vocaliaReviewStorageKey = "vocaliaSubmittedLessonReviews";
window.vocaliaLegacyReviewStorageKey = "vocaliaLessonReviews";
window.vocaliaLocalApiOrigin = (() => {
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  if (window.location.protocol === "file:") {
    return "http://127.0.0.1:4180";
  }

  if (localHosts.has(window.location.hostname) && window.location.port !== "4180") {
    return "http://127.0.0.1:4180";
  }

  return "";
})();
window.vocaliaReviewsApiEndpoint = `${window.vocaliaLocalApiOrigin}/api/reviews`;
window.vocaliaApplicationsApiEndpoint = `${window.vocaliaLocalApiOrigin}/api/applications`;
window.vocaliaDefaultReviews = [];
