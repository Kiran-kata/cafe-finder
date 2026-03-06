const config = window.CAFE_FINDER_CONFIG || {};
const apiKey = config.MAPS_API_KEY;

const mapNode = document.getElementById("map");
const searchInput = document.getElementById("search-input");
const searchButton = document.getElementById("search-btn");
const locateButton = document.getElementById("locate-btn");
const ratingFilter = document.getElementById("rating-filter");
const sortFilter = document.getElementById("sort-filter");
const distanceUnitNode = document.getElementById("distance-unit");
const openNowFilter = document.getElementById("open-now-filter");
const statusNode = document.getElementById("status");
const resultsNode = document.getElementById("results");
const visitedResultsNode = document.getElementById("visited-results");
const savedResultsNode = document.getElementById("saved-results");
const alertDistanceNode = document.getElementById("alert-distance");
const recentSearchesNode = document.getElementById("recent-searches");
const clearRecentButton = document.getElementById("clear-recent");
const clearSavedButton = document.getElementById("clear-saved");
const onboardingCard = document.getElementById("onboarding-card");
const dismissOnboardingButton = document.getElementById("dismiss-onboarding");

const VISITED_STORAGE_KEY = "cafe_finder_visited";
const BOOKMARK_STORAGE_KEY = "cafe_finder_bookmarked";
const PROXIMITY_RESET_DISTANCE_METERS = 700;
const ALERT_DISTANCE_STORAGE_KEY = "cafe_finder_alert_distance";
const DISTANCE_UNIT_STORAGE_KEY = "cafe_finder_distance_unit";
const RECENT_SEARCHES_STORAGE_KEY = "cafe_finder_recent_searches";
const ONBOARDING_DISMISSED_KEY = "cafe_finder_onboarding_dismissed";
const MAX_RECENT_SEARCHES = 8;
const GOOGLE_REVIEW_PREVIEW_COUNT = 2;
const ALERT_DISTANCE_OPTIONS = {
  km: [
    { meters: 200, label: "0.2 km" },
    { meters: 500, label: "0.5 km" },
    { meters: 1000, label: "1 km" },
    { meters: 2000, label: "2 km" },
    { meters: 5000, label: "5 km" },
    { meters: 10000, label: "10 km" },
    { meters: 16093, label: "16.1 km (10 mi)" }
  ],
  miles: [
    { meters: 402, label: "0.25 mi" },
    { meters: 805, label: "0.5 mi" },
    { meters: 1609, label: "1 mi" },
    { meters: 3219, label: "2 mi" },
    { meters: 8047, label: "5 mi" },
    { meters: 16093, label: "10 mi" }
  ]
};

let map;
let placesService;
let geocoder;
let infoWindow;
let markers = [];
let latestPlaces = [];
let currentCenter = { lat: 40.7128, lng: -74.006 };
let visitedCafes = loadVisitedCafes();
let bookmarkedCafes = loadBookmarkedCafes();
let proximityWatchId = null;
const notifiedNearbyCafeKeys = new Set();
let alertDistanceMeters = loadAlertDistance();
let distanceUnit = loadDistanceUnit();
let recentSearches = loadRecentSearches();
let latestUserPosition = null;
let directionsService;
let directionsRenderer;

function getPlaceKey(place) {
  if (place.place_id) {
    return place.place_id;
  }

  const name = place.name || "Unnamed cafe";
  const address = place.vicinity || place.formatted_address || "Address unavailable";
  return `${name}|${address}`;
}

function createVisitedCafeRecord(place) {
  return {
    key: getPlaceKey(place),
    placeId: place.place_id || null,
    name: place.name || "Unnamed cafe",
    address: place.vicinity || place.formatted_address || "Address unavailable",
    rating: typeof place.rating === "number" ? place.rating : null,
    userReview: "",
    userRating: 0,
    googleMapUrl: "",
    googleReviews: [],
    yelpUrl: getYelpSearchUrl(place.name || "Cafe", place.vicinity || place.formatted_address || ""),
    savedAt: new Date().toISOString()
  };
}

function getYelpSearchUrl(name, address) {
  const findDesc = encodeURIComponent(name || "Cafe");
  const findLoc = encodeURIComponent(address || "");
  return `https://www.yelp.com/search?find_desc=${findDesc}&find_loc=${findLoc}`;
}

function loadVisitedCafes() {
  try {
    const saved = window.localStorage.getItem(VISITED_STORAGE_KEY);
    if (!saved) {
      return new Map();
    }

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return new Map();
    }

    return new Map(parsed.map((entry) => [entry.key, entry]));
  } catch {
    return new Map();
  }
}

function saveVisitedCafes() {
  const serialized = Array.from(visitedCafes.values());
  window.localStorage.setItem(VISITED_STORAGE_KEY, JSON.stringify(serialized));
}

function isPlaceVisited(place) {
  return visitedCafes.has(getPlaceKey(place));
}

function renderVisitedCafes() {
  visitedResultsNode.innerHTML = "";

  if (!visitedCafes.size) {
    const item = document.createElement("li");
    item.className = "visited-item visited-empty";
    item.textContent = "No visited cafes yet.";
    visitedResultsNode.appendChild(item);
    return;
  }

  const sortedVisited = Array.from(visitedCafes.values()).sort((a, b) => {
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });

  sortedVisited.forEach((visitedCafe) => {
    const item = document.createElement("li");
    item.className = "visited-item";

    const name = document.createElement("div");
    name.className = "visited-name";
    name.textContent = visitedCafe.name;

    const meta = document.createElement("div");
    meta.className = "visited-meta";
    const rating = typeof visitedCafe.rating === "number" ? `★ ${visitedCafe.rating}` : "No rating";
    meta.textContent = `${rating} · ${visitedCafe.address}`;

    const reviewEditor = document.createElement("div");
    reviewEditor.className = "visited-review-editor";

    const ratingSelect = document.createElement("select");
    ratingSelect.className = "visited-rating-select";
    [0, 1, 2, 3, 4, 5].forEach((score) => {
      const option = document.createElement("option");
      option.value = String(score);
      option.textContent = score === 0 ? "Your rating" : `${score} ★`;
      ratingSelect.appendChild(option);
    });
    ratingSelect.value = String(visitedCafe.userRating || 0);

    const reviewInput = document.createElement("textarea");
    reviewInput.className = "visited-review-input";
    reviewInput.placeholder = "Write your review";
    reviewInput.rows = 2;
    reviewInput.value = visitedCafe.userReview || "";

    const reviewActions = document.createElement("div");
    reviewActions.className = "visited-review-actions";

    const saveReviewButton = document.createElement("button");
    saveReviewButton.type = "button";
    saveReviewButton.className = "visited-save-review";
    saveReviewButton.textContent = "Save review";
    saveReviewButton.addEventListener("click", () => {
      saveUserVisitedReview(visitedCafe.key, Number(ratingSelect.value || 0), reviewInput.value.trim());
    });

    reviewActions.appendChild(saveReviewButton);
    reviewEditor.appendChild(ratingSelect);
    reviewEditor.appendChild(reviewInput);
    reviewEditor.appendChild(reviewActions);

    const externalLinks = document.createElement("div");
    externalLinks.className = "visited-links";

    const googleLink = document.createElement("a");
    googleLink.className = "visited-link";
    googleLink.textContent = "Google reviews";
    googleLink.target = "_blank";
    googleLink.rel = "noopener noreferrer";
    googleLink.href = visitedCafe.googleMapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(visitedCafe.name)}+${encodeURIComponent(visitedCafe.address)}`;

    const yelpLink = document.createElement("a");
    yelpLink.className = "visited-link";
    yelpLink.textContent = "Yelp reviews";
    yelpLink.target = "_blank";
    yelpLink.rel = "noopener noreferrer";
    yelpLink.href = visitedCafe.yelpUrl || getYelpSearchUrl(visitedCafe.name, visitedCafe.address);

    externalLinks.appendChild(googleLink);
    externalLinks.appendChild(yelpLink);

    const googleReviewPreview = document.createElement("div");
    googleReviewPreview.className = "google-review-preview";

    if (Array.isArray(visitedCafe.googleReviews) && visitedCafe.googleReviews.length) {
      visitedCafe.googleReviews.forEach((review) => {
        const reviewLine = document.createElement("div");
        reviewLine.className = "google-review-line";
        const previewRating = typeof review.rating === "number" ? `★ ${review.rating}` : "";
        const previewText = review.text ? review.text.slice(0, 110) : "No review text";
        reviewLine.textContent = `${review.authorName}: ${previewRating} ${previewText}`;
        googleReviewPreview.appendChild(reviewLine);
      });
    } else {
      const emptyReview = document.createElement("div");
      emptyReview.className = "google-review-line";
      emptyReview.textContent = "Google review preview unavailable for this cafe.";
      googleReviewPreview.appendChild(emptyReview);
    }

    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(reviewEditor);
    item.appendChild(externalLinks);
    item.appendChild(googleReviewPreview);
    visitedResultsNode.appendChild(item);
  });
}

function updateVisitedCafeRecord(key, updates) {
  if (!visitedCafes.has(key)) {
    return;
  }

  const existing = visitedCafes.get(key);
  visitedCafes.set(key, {
    ...existing,
    ...updates
  });
  saveVisitedCafes();
}

function saveUserVisitedReview(key, userRating, userReview) {
  updateVisitedCafeRecord(key, {
    userRating,
    userReview
  });
  renderVisitedCafes();
}

function fetchVisitedCafeExternalReviews(key) {
  if (!placesService || !visitedCafes.has(key)) {
    return;
  }

  const cafe = visitedCafes.get(key);
  if (!cafe.placeId) {
    return;
  }

  placesService.getDetails(
    {
      placeId: cafe.placeId,
      fields: ["url", "reviews"]
    },
    (details, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !details) {
        return;
      }

      const googleReviews = Array.isArray(details.reviews)
        ? details.reviews.slice(0, GOOGLE_REVIEW_PREVIEW_COUNT).map((review) => ({
            authorName: review.author_name || "Google user",
            rating: typeof review.rating === "number" ? review.rating : null,
            text: review.text || ""
          }))
        : [];

      updateVisitedCafeRecord(key, {
        googleMapUrl: details.url || cafe.googleMapUrl || "",
        googleReviews
      });
      renderVisitedCafes();
    }
  );
}

function refreshVisitedExternalReviews() {
  visitedCafes.forEach((visitedCafe, key) => {
    if (!Array.isArray(visitedCafe.googleReviews) || !visitedCafe.googleReviews.length) {
      fetchVisitedCafeExternalReviews(key);
    }
  });
}

function toggleVisitedCafe(place, shouldMarkVisited) {
  const key = getPlaceKey(place);

  if (shouldMarkVisited) {
    visitedCafes.set(key, createVisitedCafeRecord(place));
    saveVisitedCafes();
    renderVisitedCafes();
    fetchVisitedCafeExternalReviews(key);
    return;
  } else {
    visitedCafes.delete(key);
  }

  saveVisitedCafes();
  renderVisitedCafes();
}

function createBookmarkedCafeRecord(place) {
  return {
    key: getPlaceKey(place),
    placeId: place.place_id || null,
    name: place.name || "Unnamed cafe",
    address: place.vicinity || place.formatted_address || "Address unavailable",
    rating: typeof place.rating === "number" ? place.rating : null,
    lat: place.geometry?.location?.lat ? place.geometry.location.lat() : null,
    lng: place.geometry?.location?.lng ? place.geometry.location.lng() : null,
    openNow: place.opening_hours?.open_now === true,
    weekdayText: null,
    savedAt: new Date().toISOString()
  };
}

function loadBookmarkedCafes() {
  try {
    const saved = window.localStorage.getItem(BOOKMARK_STORAGE_KEY);
    if (!saved) {
      return new Map();
    }

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return new Map();
    }

    return new Map(parsed.map((entry) => [entry.key, entry]));
  } catch {
    return new Map();
  }
}

function saveBookmarkedCafes() {
  const serialized = Array.from(bookmarkedCafes.values());
  window.localStorage.setItem(BOOKMARK_STORAGE_KEY, JSON.stringify(serialized));
}

function loadAlertDistance() {
  const saved = Number(window.localStorage.getItem(ALERT_DISTANCE_STORAGE_KEY));
  if (saved > 0) {
    return saved;
  }

  return 500;
}

function saveAlertDistance(value) {
  window.localStorage.setItem(ALERT_DISTANCE_STORAGE_KEY, String(value));
}

function loadDistanceUnit() {
  const saved = window.localStorage.getItem(DISTANCE_UNIT_STORAGE_KEY);
  if (saved === "km" || saved === "miles") {
    return saved;
  }

  return "km";
}

function saveDistanceUnit(value) {
  window.localStorage.setItem(DISTANCE_UNIT_STORAGE_KEY, value);
}

function formatDistanceMeters(distanceMeters) {
  if (distanceUnit === "miles") {
    const miles = distanceMeters / 1609.344;
    if (miles < 1) {
      return `${miles.toFixed(2)} mi`;
    }

    return `${miles.toFixed(1)} mi`;
  }

  if (distanceMeters < 1000) {
    return `${Math.round(distanceMeters)} m`;
  }

  return `${(distanceMeters / 1000).toFixed(1)} km`;
}

function populateAlertDistanceOptions(selectedMeters) {
  const options = ALERT_DISTANCE_OPTIONS[distanceUnit] || ALERT_DISTANCE_OPTIONS.km;
  alertDistanceNode.innerHTML = "";

  options.forEach((option) => {
    const optionNode = document.createElement("option");
    optionNode.value = String(option.meters);
    optionNode.textContent = option.label;
    alertDistanceNode.appendChild(optionNode);
  });

  let selected = options.find((option) => option.meters === selectedMeters);
  if (!selected) {
    selected = options.reduce((closest, option) => {
      return Math.abs(option.meters - selectedMeters) < Math.abs(closest.meters - selectedMeters) ? option : closest;
    }, options[0]);
  }

  alertDistanceMeters = selected.meters;
  alertDistanceNode.value = String(selected.meters);
  saveAlertDistance(alertDistanceMeters);
}

function loadRecentSearches() {
  try {
    const saved = window.localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!saved) {
      return [];
    }

    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter((entry) => typeof entry === "string" && entry.trim()).slice(0, MAX_RECENT_SEARCHES);
  } catch {
    return [];
  }
}

function saveRecentSearches() {
  window.localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(recentSearches));
}

function shouldShowOnboarding() {
  return window.localStorage.getItem(ONBOARDING_DISMISSED_KEY) !== "true";
}

function dismissOnboarding() {
  window.localStorage.setItem(ONBOARDING_DISMISSED_KEY, "true");
  if (onboardingCard) {
    onboardingCard.classList.add("hidden");
  }
}

function renderRecentSearches() {
  recentSearchesNode.innerHTML = "";

  if (!recentSearches.length) {
    const item = document.createElement("li");
    item.className = "recent-item recent-empty";
    item.textContent = "No recent searches yet.";
    recentSearchesNode.appendChild(item);
    return;
  }

  recentSearches.forEach((query) => {
    const item = document.createElement("li");
    item.className = "recent-item";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "recent-btn";
    button.textContent = query;
    button.addEventListener("click", () => {
      searchInput.value = query;
      geocodeAndSearch(query);
    });

    item.appendChild(button);
    recentSearchesNode.appendChild(item);
  });
}

function addRecentSearch(query) {
  const normalized = query.trim();
  if (!normalized) {
    return;
  }

  recentSearches = [normalized, ...recentSearches.filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())].slice(
    0,
    MAX_RECENT_SEARCHES
  );
  saveRecentSearches();
  renderRecentSearches();
}

function clearRecentSearches() {
  recentSearches = [];
  saveRecentSearches();
  renderRecentSearches();
}

function isPlaceBookmarked(place) {
  return bookmarkedCafes.has(getPlaceKey(place));
}

function getCafeTimingSummary(cafe) {
  if (Array.isArray(cafe.weekdayText) && cafe.weekdayText.length) {
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const todayName = dayNames[new Date().getDay()];
    const todayTiming = cafe.weekdayText.find((line) => line.startsWith(`${todayName}:`));
    return todayTiming || cafe.weekdayText[0];
  }

  if (cafe.openNow === true) {
    return "Currently open";
  }

  if (cafe.openNow === false) {
    return "Currently closed";
  }

  return "Timings unavailable";
}

function getDirectionsUrl(destinationLat, destinationLng) {
  const originLat = latestUserPosition?.lat ?? currentCenter.lat;
  const originLng = latestUserPosition?.lng ?? currentCenter.lng;
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(`${originLat},${originLng}`)}&destination=${encodeURIComponent(`${destinationLat},${destinationLng}`)}&travelmode=walking`;
}

function openDirectionsToCafe(cafe) {
  if (typeof cafe.lat !== "number" || typeof cafe.lng !== "number") {
    return;
  }

  drawRouteToCoordinates(cafe.lat, cafe.lng);
  const directionsUrl = getDirectionsUrl(cafe.lat, cafe.lng);
  window.open(directionsUrl, "_blank", "noopener,noreferrer");
}

function drawRouteToCoordinates(destinationLat, destinationLng) {
  if (!map || !directionsService || !directionsRenderer) {
    return;
  }

  const origin = latestUserPosition || currentCenter;

  directionsService.route(
    {
      origin,
      destination: { lat: destinationLat, lng: destinationLng },
      travelMode: google.maps.TravelMode.WALKING
    },
    (response, status) => {
      if (status === google.maps.DirectionsStatus.OK && response) {
        directionsRenderer.setDirections(response);
      }
    }
  );
}

function showNearCafeNotification(cafe, distanceMeters) {
  const distance = formatDistanceMeters(distanceMeters);
  const timing = getCafeTimingSummary(cafe);
  const message = `${distance} away. ${timing}. Click notification for directions.`;

  if ("Notification" in window && Notification.permission === "granted") {
    const notification = new Notification(`Nearby saved cafe: ${cafe.name}`, {
      body: message
    });

    notification.onclick = () => {
      window.focus();
      openDirectionsToCafe(cafe);
    };
    return;
  }

  const shouldOpenDirections = window.confirm(
    `Nearby saved cafe: ${cafe.name}\n${distance} away. ${timing}.\n\nPress OK to open directions.`
  );
  if (shouldOpenDirections) {
    openDirectionsToCafe(cafe);
  }
}

function evaluateProximityAtCoordinates(lat, lng) {
  if (!bookmarkedCafes.size || !window.google?.maps?.geometry?.spherical) {
    return;
  }

  latestUserPosition = { lat, lng };
  const userLatLng = new google.maps.LatLng(lat, lng);

  bookmarkedCafes.forEach((cafe, key) => {
    if (typeof cafe.lat !== "number" || typeof cafe.lng !== "number") {
      return;
    }

    const cafeLatLng = new google.maps.LatLng(cafe.lat, cafe.lng);
    const distanceMeters = google.maps.geometry.spherical.computeDistanceBetween(userLatLng, cafeLatLng);

    if (distanceMeters <= alertDistanceMeters && !notifiedNearbyCafeKeys.has(key)) {
      notifiedNearbyCafeKeys.add(key);
      showNearCafeNotification(cafe, distanceMeters);
      return;
    }

    if (distanceMeters > Math.max(PROXIMITY_RESET_DISTANCE_METERS, alertDistanceMeters + 150)) {
      notifiedNearbyCafeKeys.delete(key);
    }
  });
}

function evaluateProximityAlerts(position) {
  evaluateProximityAtCoordinates(position.coords.latitude, position.coords.longitude);
}

function runImmediateProximityCheck() {
  if (!bookmarkedCafes.size || !navigator.geolocation) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      evaluateProximityAlerts(position);
    },
    () => {
      if (currentCenter?.lat && currentCenter?.lng) {
        evaluateProximityAtCoordinates(currentCenter.lat, currentCenter.lng);
      }
    },
    {
      enableHighAccuracy: true,
      timeout: 8000,
      maximumAge: 15000
    }
  );
}

function ensureProximityWatch() {
  if (!navigator.geolocation) {
    setStatus("Geolocation unavailable. Nearby alerts are disabled.");
    return;
  }

  if (!bookmarkedCafes.size) {
    if (proximityWatchId !== null) {
      navigator.geolocation.clearWatch(proximityWatchId);
      proximityWatchId = null;
    }
    return;
  }

  if (proximityWatchId !== null) {
    return;
  }

  proximityWatchId = navigator.geolocation.watchPosition(
    evaluateProximityAlerts,
    (error) => {
      proximityWatchId = null;
      if (error?.code === 1) {
        setStatus("Location permission is required for nearby cafe alerts.");
      }
    },
    {
      enableHighAccuracy: false,
      timeout: 12000,
      maximumAge: 60000
    }
  );
}

function requestNotificationPermissionIfNeeded() {
  if (!("Notification" in window) || Notification.permission !== "default") {
    return;
  }

  Notification.requestPermission().catch(() => {
    return;
  });
}

function updateBookmarkedCafeTiming(key, openingHours) {
  if (!bookmarkedCafes.has(key)) {
    return;
  }

  const existing = bookmarkedCafes.get(key);
  bookmarkedCafes.set(key, {
    ...existing,
    openNow: openingHours?.open_now === true,
    weekdayText: Array.isArray(openingHours?.weekday_text) ? openingHours.weekday_text : existing.weekdayText
  });

  saveBookmarkedCafes();
  renderBookmarkedCafes();
}

function fetchBookmarkedCafeTimings(place, key) {
  if (!place.place_id) {
    return;
  }

  placesService.getDetails(
    {
      placeId: place.place_id,
      fields: ["opening_hours"]
    },
    (details, status) => {
      if (status !== google.maps.places.PlacesServiceStatus.OK || !details) {
        return;
      }

      updateBookmarkedCafeTiming(key, details.opening_hours);
    }
  );
}

function renderBookmarkedCafes() {
  savedResultsNode.innerHTML = "";

  if (!bookmarkedCafes.size) {
    const item = document.createElement("li");
    item.className = "saved-item saved-empty";
    item.textContent = "No cafes bookmarked yet.";
    savedResultsNode.appendChild(item);
    return;
  }

  const sortedSaved = Array.from(bookmarkedCafes.values()).sort((a, b) => {
    return new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime();
  });

  sortedSaved.forEach((savedCafe) => {
    const item = document.createElement("li");
    item.className = "saved-item";

    const name = document.createElement("div");
    name.className = "saved-name";
    name.textContent = savedCafe.name;

    const meta = document.createElement("div");
    meta.className = "saved-meta";
    const rating = typeof savedCafe.rating === "number" ? `★ ${savedCafe.rating}` : "No rating";
    meta.textContent = `${rating} · ${savedCafe.address}`;

    const timing = document.createElement("div");
    timing.className = "saved-timing";
    timing.textContent = getCafeTimingSummary(savedCafe);

    const directionsButton = document.createElement("button");
    directionsButton.type = "button";
    directionsButton.className = "saved-directions";
    directionsButton.textContent = "Directions";
    directionsButton.addEventListener("click", () => {
      openDirectionsToCafe(savedCafe);
    });

    item.appendChild(name);
    item.appendChild(meta);
    item.appendChild(timing);
    item.appendChild(directionsButton);
    savedResultsNode.appendChild(item);
  });
}

function toggleBookmarkedCafe(place, shouldBookmark) {
  const key = getPlaceKey(place);

  if (shouldBookmark) {
    bookmarkedCafes.set(key, createBookmarkedCafeRecord(place));
    saveBookmarkedCafes();
    renderBookmarkedCafes();
    ensureProximityWatch();
    requestNotificationPermissionIfNeeded();
    fetchBookmarkedCafeTimings(place, key);
    runImmediateProximityCheck();
    return;
  }

  bookmarkedCafes.delete(key);
  notifiedNearbyCafeKeys.delete(key);
  saveBookmarkedCafes();
  renderBookmarkedCafes();
  ensureProximityWatch();
}

function clearBookmarkedCafes() {
  bookmarkedCafes.clear();
  notifiedNearbyCafeKeys.clear();
  saveBookmarkedCafes();
  renderBookmarkedCafes();
  ensureProximityWatch();

  if (directionsRenderer) {
    directionsRenderer.setDirections({ routes: [] });
  }
}

function setStatus(text) {
  statusNode.textContent = text;
}

function setResultsEmptyState(text) {
  resultsNode.innerHTML = "";
  const item = document.createElement("li");
  item.className = "result-item";
  item.textContent = text;
  resultsNode.appendChild(item);
}

function clearMarkers() {
  markers.forEach((marker) => marker.setMap(null));
  markers = [];
}

function getPlacePhotoUrl(place) {
  if (!place.photos || !place.photos.length) {
    return "";
  }

  return place.photos[0].getUrl({
    maxWidth: 640,
    maxHeight: 420
  });
}

function getDistanceLabel(place) {
  if (!place.geometry || !place.geometry.location || !window.google?.maps?.geometry?.spherical) {
    return "Distance unavailable";
  }

  const distanceMeters = getDistanceMeters(place);
  if (distanceMeters === null) {
    return "Distance unavailable";
  }

  return `${formatDistanceMeters(distanceMeters)} away`;
}

function getDistanceMeters(place) {
  if (!place.geometry || !place.geometry.location || !window.google?.maps?.geometry?.spherical) {
    return null;
  }

  const center = new google.maps.LatLng(currentCenter.lat, currentCenter.lng);
  return google.maps.geometry.spherical.computeDistanceBetween(center, place.geometry.location);
}

function loadMapsScript() {
  return new Promise((resolve, reject) => {
    if (window.google && window.google.maps) {
      resolve();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places,geometry`;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Google Maps JavaScript API."));
    document.head.appendChild(script);
  });
}

function focusPlace(place, marker) {
  map.panTo(place.geometry.location);
  map.setZoom(16);

  const rating = place.rating ? `Rating: ${place.rating}` : "No rating";
  const address = place.vicinity || place.formatted_address || "Address unavailable";
  const distance = getDistanceLabel(place);
  const photoUrl = getPlacePhotoUrl(place);
  const photoMarkup = photoUrl
    ? `<img src="${photoUrl}" alt="${place.name || "Cafe"}" style="width:100%;max-width:220px;height:120px;object-fit:cover;border-radius:8px;margin-bottom:8px;"/>`
    : "";

  infoWindow.setContent(`
    <div>
      ${photoMarkup}
      <strong>${place.name}</strong><br/>
      ${address}<br/>
      ${rating}<br/>
      ${distance}
    </div>
  `);
  infoWindow.open({ map, anchor: marker });
}

function renderResults(places, markerById) {
  resultsNode.innerHTML = "";

  if (!places.length) {
    setResultsEmptyState("No cafes found in this area.");
    return;
  }

  places.forEach((place) => {
    const item = document.createElement("li");
    item.className = "result-item";

    const button = document.createElement("button");
    button.type = "button";

    const name = document.createElement("div");
    name.className = "result-name";
    name.textContent = place.name || "Unnamed cafe";

    const meta = document.createElement("div");
    meta.className = "result-meta";
    const ratingText = place.rating ? `★ ${place.rating}` : "No rating";
    const distanceText = getDistanceLabel(place);
    const addressText = place.vicinity || place.formatted_address || "Address unavailable";
    meta.textContent = `${ratingText} · ${distanceText} · ${addressText}`;

    const image = document.createElement("img");
    image.className = "result-image";
    const photoUrl = getPlacePhotoUrl(place);
    if (photoUrl) {
      image.src = photoUrl;
      image.alt = `${place.name || "Cafe"} photo`;
    } else {
      image.alt = "No cafe photo available";
      image.classList.add("is-placeholder");
    }

    const imageWrap = document.createElement("div");
    imageWrap.className = "result-image-wrap";
    imageWrap.appendChild(image);

    const content = document.createElement("div");
    content.className = "result-content";
    content.appendChild(name);
    content.appendChild(meta);

    button.appendChild(imageWrap);
    button.appendChild(content);

    button.addEventListener("click", () => {
      const marker = markerById.get(place.place_id);
      if (marker) {
        focusPlace(place, marker);
      }
    });

    const controls = document.createElement("div");
    controls.className = "result-controls";

    const visitLabel = document.createElement("label");
    visitLabel.className = "result-visit";

    const visitCheckbox = document.createElement("input");
    visitCheckbox.type = "checkbox";
    visitCheckbox.checked = isPlaceVisited(place);

    const visitText = document.createElement("span");
    visitText.textContent = "Visited";

    visitCheckbox.addEventListener("change", () => {
      toggleVisitedCafe(place, visitCheckbox.checked);
    });

    visitLabel.appendChild(visitCheckbox);
    visitLabel.appendChild(visitText);
    controls.appendChild(visitLabel);

    const saveLabel = document.createElement("label");
    saveLabel.className = "result-save";

    const saveCheckbox = document.createElement("input");
    saveCheckbox.type = "checkbox";
    saveCheckbox.checked = isPlaceBookmarked(place);

    const saveText = document.createElement("span");
    saveText.textContent = "Want to visit";

    saveCheckbox.addEventListener("change", () => {
      toggleBookmarkedCafe(place, saveCheckbox.checked);
    });

    saveLabel.appendChild(saveCheckbox);
    saveLabel.appendChild(saveText);
    controls.appendChild(saveLabel);

    item.appendChild(button);
    item.appendChild(controls);
    resultsNode.appendChild(item);
  });
}

function getFilteredPlaces() {
  const minRating = Number(ratingFilter.value || 0);
  const onlyOpenNow = openNowFilter.checked;
  const sortBy = sortFilter.value || "nearest";

  const filtered = latestPlaces.filter((place) => {
    const rating = Number(place.rating || 0);
    if (rating < minRating) {
      return false;
    }

    if (onlyOpenNow && (!place.opening_hours || place.opening_hours.open_now !== true)) {
      return false;
    }

    return true;
  });

  filtered.sort((firstPlace, secondPlace) => {
    if (sortBy === "rating") {
      const firstRating = Number(firstPlace.rating || 0);
      const secondRating = Number(secondPlace.rating || 0);

      if (secondRating !== firstRating) {
        return secondRating - firstRating;
      }

      const firstDistance = getDistanceMeters(firstPlace) ?? Number.POSITIVE_INFINITY;
      const secondDistance = getDistanceMeters(secondPlace) ?? Number.POSITIVE_INFINITY;
      return firstDistance - secondDistance;
    }

    const firstDistance = getDistanceMeters(firstPlace) ?? Number.POSITIVE_INFINITY;
    const secondDistance = getDistanceMeters(secondPlace) ?? Number.POSITIVE_INFINITY;
    return firstDistance - secondDistance;
  });

  return filtered;
}

function updateDisplayedPlaces() {
  clearMarkers();

  const filteredPlaces = getFilteredPlaces();
  const markerById = new Map();
  const bounds = new google.maps.LatLngBounds();

  filteredPlaces.forEach((place) => {
    if (!place.geometry || !place.geometry.location) {
      return;
    }

    const marker = new google.maps.Marker({
      map,
      position: place.geometry.location,
      title: place.name
    });

    marker.addListener("click", () => focusPlace(place, marker));
    markers.push(marker);

    if (place.place_id) {
      markerById.set(place.place_id, marker);
    }

    bounds.extend(place.geometry.location);
  });

  if (!bounds.isEmpty()) {
    map.fitBounds(bounds);
  }

  renderResults(filteredPlaces, markerById);

  if (!latestPlaces.length) {
    setStatus("No cafes found in this area.");
    return;
  }

  if (!filteredPlaces.length) {
    setStatus("No cafes match your filters.");
    return;
  }

  setStatus(`Showing ${filteredPlaces.length} of ${latestPlaces.length} cafes.`);
}

function searchNearbyCafes(center) {
  setStatus("Searching for nearby cafes...");

  const request = {
    location: center,
    radius: 2500,
    type: "cafe"
  };

  placesService.nearbySearch(request, (results, status) => {
    if (status !== google.maps.places.PlacesServiceStatus.OK || !results) {
      setStatus("Could not find cafes for this location. Try another area.");
      setResultsEmptyState("No results to show.");
      latestPlaces = [];
      clearMarkers();
      return;
    }

    latestPlaces = results;
    updateDisplayedPlaces();
  });
}

function isCityWideGeocodeResult(result) {
  if (!result || !Array.isArray(result.types)) {
    return false;
  }

  const cityWideTypes = new Set([
    "locality",
    "administrative_area_level_1",
    "administrative_area_level_2",
    "country",
    "postal_town"
  ]);

  return result.types.some((type) => cityWideTypes.has(type));
}

function applySortPreset(mode) {
  if (!sortFilter) {
    return;
  }

  if (sortFilter.value !== mode) {
    sortFilter.value = mode;
  }
}

function geocodeAndSearch(query) {
  if (!query.trim()) {
    setStatus("Type a location before searching.");
    return;
  }

  geocoder.geocode({ address: query }, (results, status) => {
    if (status !== google.maps.GeocoderStatus.OK || !results || !results[0]) {
      setStatus("Location not found. Try a different search term.");
      return;
    }

    currentCenter = {
      lat: results[0].geometry.location.lat(),
      lng: results[0].geometry.location.lng()
    };

    addRecentSearch(query);

    if (isCityWideGeocodeResult(results[0])) {
      applySortPreset("rating");
    } else {
      applySortPreset("nearest");
    }

    map.setCenter(currentCenter);
    map.setZoom(14);
    searchNearbyCafes(currentCenter);
  });
}

function useMyLocation() {
  if (!navigator.geolocation) {
    setStatus("Geolocation is not supported by this browser.");
    return;
  }

  setStatus("Getting your current location...");

  navigator.geolocation.getCurrentPosition(
    (position) => {
      currentCenter = {
        lat: position.coords.latitude,
        lng: position.coords.longitude
      };
      latestUserPosition = { ...currentCenter };
      applySortPreset("nearest");
      map.setCenter(currentCenter);
      map.setZoom(14);
      searchNearbyCafes(currentCenter);
    },
    () => {
      setStatus("Could not access your location. You can still search manually.");
    },
    {
      enableHighAccuracy: true,
      timeout: 8000
    }
  );
}

async function init() {
  if (onboardingCard) {
    if (shouldShowOnboarding()) {
      onboardingCard.classList.remove("hidden");
    } else {
      onboardingCard.classList.add("hidden");
    }
  }

  renderVisitedCafes();
  renderBookmarkedCafes();
  renderRecentSearches();
  distanceUnit = loadDistanceUnit();
  distanceUnitNode.value = distanceUnit;
  alertDistanceMeters = loadAlertDistance();
  populateAlertDistanceOptions(alertDistanceMeters);

  if (!apiKey || apiKey === "YOUR_GOOGLE_MAPS_API_KEY") {
    setStatus("Add your Google Maps API key in config.js to start.");
    setResultsEmptyState("Waiting for API key setup.");
    return;
  }

  try {
    await loadMapsScript();

    map = new google.maps.Map(mapNode, {
      center: currentCenter,
      zoom: 13,
      mapTypeControl: false,
      streetViewControl: false
    });

    placesService = new google.maps.places.PlacesService(map);
    geocoder = new google.maps.Geocoder();
    infoWindow = new google.maps.InfoWindow();
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
      map,
      suppressMarkers: true,
      polylineOptions: {
        strokeColor: "#6f4e37",
        strokeWeight: 5
      }
    });
    refreshVisitedExternalReviews();
    ensureProximityWatch();

    searchButton.addEventListener("click", () => geocodeAndSearch(searchInput.value));
    locateButton.addEventListener("click", useMyLocation);
    ratingFilter.addEventListener("change", updateDisplayedPlaces);
    sortFilter.addEventListener("change", updateDisplayedPlaces);
    distanceUnitNode.addEventListener("change", () => {
      distanceUnit = distanceUnitNode.value === "miles" ? "miles" : "km";
      saveDistanceUnit(distanceUnit);
      populateAlertDistanceOptions(alertDistanceMeters);
      notifiedNearbyCafeKeys.clear();
      updateDisplayedPlaces();
    });
    openNowFilter.addEventListener("change", updateDisplayedPlaces);
    alertDistanceNode.addEventListener("change", () => {
      alertDistanceMeters = Number(alertDistanceNode.value || 500);
      saveAlertDistance(alertDistanceMeters);
      notifiedNearbyCafeKeys.clear();
      runImmediateProximityCheck();
    });
    dismissOnboardingButton.addEventListener("click", dismissOnboarding);
    clearRecentButton.addEventListener("click", clearRecentSearches);
    clearSavedButton.addEventListener("click", clearBookmarkedCafes);
    searchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        geocodeAndSearch(searchInput.value);
      }
    });

    setStatus("Map ready. Search a location or use your current location.");
    setResultsEmptyState("No search yet.");
  } catch (error) {
    setStatus(error.message || "Failed to initialize map.");
    setResultsEmptyState("Initialization failed.");
  }
}

init();
