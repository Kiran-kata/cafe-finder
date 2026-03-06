# Cafe Finder

Modern café discovery web app built with vanilla JavaScript and Google Maps Platform.

Cafe Finder helps users search nearby cafés, filter/sort results, save visit plans, get proximity alerts, and open walking directions directly on the map.

## Table of contents

- Overview
- Features
- Tech stack
- Project structure
- Google Cloud setup
- Local setup
- Screenshots / demo
- Usage guide
- Permissions and notifications
- Data storage
- Limitations
- Troubleshooting
- Future improvements

## Overview

Cafe Finder is a client-side web application designed for fast location-based discovery. It combines Google Maps, Places, Geocoding, and Directions features with a smooth UI and user productivity tools:

- Search by address, locality, or city
- Save cafés as visited or plan-to-visit
- Trigger alerts when near saved cafés
- Open route and turn-by-turn directions quickly

## Features

### Discovery and map interaction

- Search by city/address/place text
- Use current location to find nearby cafés
- Show map markers and synchronized result cards
- Focus map and info window by clicking a result card
- Display place photos (when available)

### Filtering, sorting, and distance

- Minimum rating filter
- Open-now filter
- Sort by nearest or highest rated
- Smart preset:
  - City-like searches default to highest rated
  - My Location defaults to nearest
- Distance unit switch: kilometers or miles
- Unit-aware distance display in cards, map info, and notifications

### Saved state and productivity

- Recent searches list with one-click re-run
- Mark cafés as visited
- Mark cafés as want-to-visit (bookmarks)
- Dedicated sections for:
  - Past visited cafés
  - Cafés to visit
- Clear actions for recent searches and bookmarks

### Proximity alerts and navigation

- Configurable proximity threshold with options up to 10 miles
- Near-café notifications (or alert fallback)
- Includes timing summary in alert text when available
- Direction action from notifications/alerts
- Directions button for bookmarked cafés
- Route line rendered on map

### Reviews workflow

- Add personal rating/review notes for visited cafés
- Show Google review preview snippets (when available)
- Open Google reviews and Yelp pages for each visited café

## Tech stack

- HTML5
- CSS3
- Vanilla JavaScript (ES modules)
- Google Maps JavaScript API
- Places API
- Geocoding API
- Directions API (via Maps JS services)

## Project structure

- `index.html` – App layout and UI controls
- `styles.css` – Visual theme and responsive styling
- `app.js` – Core map logic, search, filters, storage, notifications, routing
- `config.js` – base configuration (no secrets)
- `config.local.js` – local API key override (gitignored)
- `config.example.js` – API key template

## Google Cloud setup

1. Create a Google Cloud project.
2. Enable billing.
3. Enable APIs:
   - Maps JavaScript API
   - Places API
   - Geocoding API
4. Create API key.
5. Restrict the key (strongly recommended):
   - Application restrictions: HTTP referrers
   - API restrictions: only the APIs above

Set your key in `config.local.js` (recommended and gitignored):

1. Copy `config.example.js` to `config.local.js`
2. Add your API key in `config.local.js`

```js
window.CAFE_FINDER_CONFIG = {
  MAPS_API_KEY: "YOUR_GOOGLE_MAPS_API_KEY"
};
```

`config.js` is kept in the repo without secrets:

```js
window.CAFE_FINDER_CONFIG = {
  MAPS_API_KEY: ""
};
```

## Screenshots / demo

Add project screenshots or short GIF previews in this section.

Suggested captures:

- Home + map view
- Search results with filters/sorting
- Bookmarked cafes + proximity controls
- Route rendering and directions flow

Example markdown image usage:

```md
![Home View](./docs/home.png)
![Route Demo](./docs/route.gif)
```

## Local setup

Use any local static server.

### Option 1: Python

```bash
python -m http.server 5500
```

Open:

```text
http://localhost:5500
```

### Option 2: VS Code Live Server

- Install Live Server extension
- Open `index.html`
- Run Open with Live Server

## Usage guide

1. Search an area or click Use My Location.
2. Apply filters/sorting and unit preferences.
3. Mark cafés:
   - Visited for history + personal notes
   - Want to visit for proximity alerts and directions
4. Configure alert distance (up to 10 miles).
5. When near a saved café, open directions from the notification/alert.

## Permissions and notifications

For full functionality, allow:

- Location access (required for nearby alerts and route origin)
- Notification permission (optional, but recommended)

If notification permission is blocked, the app falls back to in-browser confirm alerts.

## Data storage

All user data is stored locally in browser `localStorage`:

- Recent searches
- Visited cafés
- Bookmarked cafés
- Distance unit preference
- Proximity alert threshold
- User review notes and ratings

No backend database is used in this version.

## Limitations

- This app cannot directly post user-generated reviews to Google or Yelp.
- It provides:
  - local personal review notes
  - Google review previews (read-only)
  - direct links to Google/Yelp pages for manual posting
- Availability of place photos/reviews/hours depends on Places API response.

## Troubleshooting

### Map not loading

- Verify API key in `config.js`
- Confirm billing is enabled
- Confirm required APIs are enabled
- Check key restrictions match your local host/referrer

### No proximity notifications

- Allow location permission
- Allow notifications (or use alert fallback)
- Make sure at least one café is bookmarked
- Ensure your selected alert distance is large enough

### Distances seem incorrect

- Verify Distance unit selection (km vs miles)
- Refresh the page after changing preferences if needed

## Future improvements

- Dark mode toggle
- Export/import saved cafés
- Multi-stop route planning
- Shareable café lists
- Optional backend for cross-device sync
