// ============================================================================
// ACHARYA CAMPUS NAVIGATOR v7 — Bulletproof Navigation
// ============================================================================

// ── STATE ────────────────────────────────────────────────────────────────────
let db = [], map = null, markers = {}, selBldg = null, filter = "all";
let userLoc = { lat: 13.0858, lng: 77.4825 }, userMarker = null;
let navActive = false, navTarget = null, routeLayers = [];
let simActive = false, watchId = null;
let isAddingBldg = false, newBldgLoc = null;
let isLocked = true;

// Routing state
let routeRequestId = 0;
let routeDebounceTimer = null;

// Custom roads state
let customRoads = [];
let customRoadLayers = {};
let isDrawingRoad = false;
let isDeletingRoad = false;
let drawPoints = [];
let drawPreviewLine = null;
let drawWaypointMarkers = [];

// Dark mode
let isDark = false;

const CAMPUS_CENTER = [13.084, 77.4838];

// ── INIT ─────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  initDB(); initDarkMode(); seedDefaultRoads(); loadCustomRoads(); initMap(); initEvents(); updateUserMarker(); renderIndex(); renderCustomRoads();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(e => console.log('SW:', e));
  }
});

function loadCustomRoads() {
  const d = localStorage.getItem("acnav_roads");
  if (d) customRoads = JSON.parse(d);
}
function saveCustomRoads() { localStorage.setItem("acnav_roads", JSON.stringify(customRoads)); }

function initDarkMode() {
  isDark = localStorage.getItem("acnav_dark") === "true";
  if (isDark) {
    document.documentElement.setAttribute("data-theme", "dark");
    document.querySelector('meta[name="theme-color"]').content = "#1c1c1e";
  }
  // Set correct icon after DOM is ready
  setTimeout(() => {
    const btn = document.getElementById("btn-dark-mode");
    if (btn) btn.innerHTML = isDark ? `<i class="fa-solid fa-sun"></i>` : `<i class="fa-solid fa-moon"></i>`;
  }, 0);
}

function initDB() {
  const d = localStorage.getItem("acnav_v4");
  if (d) { db = JSON.parse(d); }
  else {
    const old = localStorage.getItem("acnav_v3");
    if (old) { db = JSON.parse(old); saveDB(); }
    else {
      db = [
        { id:"gate", name:"Main Entrance Gateway", type:"gate", lat:13.0860, lng:77.4830, icon:"fa-door-open", desc:"The grand main entrance to Acharya Institutes campus.", depts:[] },
        { id:"admin", name:"Central Administrative Block", type:"facility", lat:13.0855, lng:77.4842, icon:"fa-building-columns", desc:"Administrative offices and registrar.", depts:[] },
        { id:"asd", name:"Acharya School of Design", type:"academic", lat:13.0852, lng:77.4832, icon:"fa-palette", desc:"Design school offering Communication, Fashion, and Product Design.", depts:[] },
        { id:"aigs", name:"Acharya Institute of Graduate Studies", type:"academic", lat:13.0848, lng:77.4840, icon:"fa-graduation-cap", desc:"Science, Arts, Commerce, and Management programmes.", depts:[] },
        { id:"ait", name:"Acharya Institute of Technology", type:"academic", lat:13.0841, lng:77.4837, icon:"fa-laptop-code", desc:"Flagship engineering institution — CSE, ISE, ECE, Mech, Civil.", depts:[] },
        { id:"canteen", name:"Central Food Court", type:"facility", lat:13.0843, lng:77.4828, icon:"fa-utensils", desc:"Campus dining hub with multiple cuisine counters.", depts:[] },
        { id:"library", name:"Learning Resource Centre", type:"facility", lat:13.0837, lng:77.4845, icon:"fa-book-open", desc:"Three-storey knowledge hub with 1,00,000+ volumes.", depts:[] },
        { id:"pharmacy", name:"College of Pharmacy", type:"academic", lat:13.0832, lng:77.4848, icon:"fa-file-prescription", desc:"PCI-approved pharmacy programmes.", depts:[] },
        { id:"stadium", name:"Acharya Stadium", type:"sports", lat:13.0825, lng:77.4828, icon:"fa-futbol", desc:"10,000+ seating capacity, FIFA-standard turf.", depts:[] },
        { id:"lake", name:"Acharya Eco Lake", type:"nature", lat:13.0820, lng:77.4845, icon:"fa-water", desc:"4-acre artificial lake and eco-preserve.", depts:[] }
      ];
      saveDB();
    }
  }
}
function saveDB() { localStorage.setItem("acnav_v4", JSON.stringify(db)); }

// Short names
const SHORT = {
  "Main Entrance Gateway":"Main Gate","Central Administrative Block":"Admin Block",
  "Acharya School of Design":"Design School","Acharya Institute of Graduate Studies":"AIGS",
  "Acharya Institute of Technology":"AIT","Learning Resource Centre":"Library",
  "Central Food Court":"Food Court","College of Pharmacy":"Pharmacy",
  "Acharya Stadium":"Stadium","Acharya Eco Lake":"Eco Lake"
};

// ── MAP ──────────────────────────────────────────────────────────────────────
let tileLayer = null;
const TILE_LIGHT = "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png";
const TILE_DARK = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

function initMap() {
  map = L.map("map", {
    zoomControl: false, attributionControl: false,
    minZoom: 4, maxZoom: 19,
    zoomAnimation: true, fadeAnimation: true, markerZoomAnimation: true
  }).setView(CAMPUS_CENTER, 17);

  L.control.zoom({ position: "bottomright" }).addTo(map);

  // Set tile layer based on dark mode
  tileLayer = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { maxZoom: 19 }).addTo(map);

  // 3D perspective tilt on the map container
  applyMapPerspective();

  drawCampus();
  renderMarkers();

  // Map click handler
  map.on("click", (e) => {
    // Road drawing mode
    if (isDrawingRoad) {
      addDrawPoint(e.latlng.lat, e.latlng.lng);
      return;
    }
    if (isAddingBldg) {
      newBldgLoc = { lat: +e.latlng.lat.toFixed(6), lng: +e.latlng.lng.toFixed(6) };
      const coordsEl = document.getElementById("new-bldg-coords");
      coordsEl.textContent = `📍 ${newBldgLoc.lat}, ${newBldgLoc.lng}`;
      coordsEl.classList.add("has-coords");
      document.getElementById("btn-save-bldg").disabled = false;
    }
    if (simActive && !isAddingBldg) {
      userLoc = { lat: e.latlng.lat, lng: e.latlng.lng };
      updateUserMarker();
      if (navActive) requestRouteUpdate();
    }
  });
}

function applyMapPerspective() {
  const mapEl = document.getElementById("map");
  mapEl.style.perspective = "1200px";
  mapEl.style.perspectiveOrigin = "50% 30%";
  // The tile pane gets a subtle 3D tilt
  setTimeout(() => {
    const pane = map.getPane("tilePane");
    if (pane) {
      pane.style.transform = pane.style.transform + " rotateX(2deg)";
      pane.style.transformOrigin = "center bottom";
    }
  }, 300);
}

// ── DEFAULT CAMPUS ROADS (seeded into customRoads on first use) ─────────────
const DEFAULT_ROADS = [
  { id:"main_road_1", points:[[13.087,77.483],[13.0856,77.4835],[13.0844,77.4836],[13.0838,77.4838],[13.0828,77.4838],[13.0823,77.4842],[13.0815,77.4845]] },
  { id:"main_road_2", points:[[13.0856,77.4835],[13.0855,77.4842],[13.0848,77.484]] },
  { id:"main_road_3", points:[[13.0844,77.4836],[13.0843,77.4828]] },
  { id:"main_road_4", points:[[13.0838,77.4838],[13.0837,77.4845]] },
  { id:"main_road_5", points:[[13.0828,77.4838],[13.0832,77.4848]] },
  { id:"main_road_6", points:[[13.0828,77.4838],[13.0825,77.4828]] },
  { id:"main_road_7", points:[[13.0823,77.4842],[13.0825,77.4828]] }
];

function seedDefaultRoads() {
  // Seed defaults if: no roads key exists, OR roads array is empty AND user hasn't manually cleared them
  const stored = localStorage.getItem("acnav_roads");
  const userCleared = localStorage.getItem("acnav_roads_cleared");
  if (!stored || (stored === "[]" && !userCleared)) {
    customRoads = [...DEFAULT_ROADS];
    saveCustomRoads();
  }
}

function drawCampus() {
  // Campus boundary
  L.polygon([[13.0875,77.48],[13.0875,77.487],[13.0805,77.487],[13.0805,77.48]], {
    color:'#007aff', weight:2, opacity:.15, fillColor:'#007aff', fillOpacity:.02, dashArray:'6,4', interactive:false
  }).addTo(map);

  // Green patches
  [[[13.0824,77.484],[13.0824,77.485],[13.0816,77.485],[13.0816,77.484]],
   [[13.0862,77.4826],[13.0862,77.4834],[13.0858,77.4834],[13.0858,77.4826]],
   [[13.0846,77.4833],[13.0846,77.4839],[13.0842,77.4839],[13.0842,77.4833]]
  ].forEach(a => L.polygon(a, {color:'#34c759',weight:1,opacity:.25,fillColor:'#34c759',fillOpacity:.08,interactive:false}).addTo(map));

  // Lake
  L.circle([13.082,77.4845], {radius:45,color:'#32ade6',weight:1.5,opacity:.35,fillColor:'#32ade6',fillOpacity:.12,interactive:false}).addTo(map);
}

// ── MARKERS ──────────────────────────────────────────────────────────────────
function renderMarkers() {
  Object.values(markers).forEach(m => map.removeLayer(m));
  markers = {};
  db.forEach(b => {
    if (filter !== "all" && b.type !== filter) return;
    const icon = L.divIcon({
      className: "",
      html: `<div class="campus-marker" id="cm-${b.id}">
        <div class="marker-dot type-${b.type}"><i class="fa-solid ${b.icon}"></i></div>
        <div class="marker-label">${SHORT[b.name]||b.name}</div>
      </div>`,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
    const m = L.marker([b.lat, b.lng], { icon, draggable: !isLocked }).addTo(map);
    m.on("click", () => selectBuilding(b.id));
    m.on("dragend", (e) => {
      if (isLocked) return;
      const p = e.target.getLatLng();
      const i = db.findIndex(x => x.id === b.id);
      if (i !== -1) {
        db[i].lat = +p.lat.toFixed(6);
        db[i].lng = +p.lng.toFixed(6);
        saveDB();
        if (navTarget && navTarget.id === b.id) {
          navTarget.lat = db[i].lat;
          navTarget.lng = db[i].lng;
          requestRouteUpdate();
        }
      }
    });
    markers[b.id] = m;
  });
}

function toggleLock() {
  isLocked = !isLocked;
  const btn = document.getElementById("btn-lock-map");
  btn.innerHTML = isLocked ? `<i class="fa-solid fa-lock"></i>` : `<i class="fa-solid fa-lock-open"></i>`;
  btn.classList.toggle("locked", isLocked);
  renderMarkers();
}

// ── USER LOCATION ────────────────────────────────────────────────────────────
function updateUserMarker() {
  if (userMarker) {
    userMarker.setLatLng([userLoc.lat, userLoc.lng]);
  } else {
    const icon = L.divIcon({
      className: "",
      html: `<div class="user-dot-wrap" id="user-dot">
               <div class="user-heading-cone"></div>
               <div class="user-dot-pulse"></div>
               <div class="user-dot-inner"></div>
             </div>`,
      iconSize: [40, 40], iconAnchor: [20, 20]
    });
    userMarker = L.marker([userLoc.lat, userLoc.lng], { icon, interactive: false, zIndexOffset: 1000 }).addTo(map);
  }
}

// Compass heading
window.addEventListener("deviceorientationabsolute", (e) => {
  if (e.alpha !== null) {
    const dot = document.getElementById("user-dot");
    if (dot) {
      dot.classList.add("has-heading");
      const cone = dot.querySelector(".user-heading-cone");
      if (cone) cone.style.transform = `rotate(${360 - e.alpha}deg)`;
    }
  }
}, true);

// ── BUILDING SELECTION ───────────────────────────────────────────────────────
function selectBuilding(id) {
  if (navActive) { stopNav(); }

  if (selBldg) { const el = document.getElementById(`cm-${selBldg.id}`); if (el) el.classList.remove("selected"); }
  selBldg = db.find(b => b.id === id);
  if (!selBldg) return;
  const el = document.getElementById(`cm-${id}`);
  if (el) el.classList.add("selected");
  map.flyTo([selBldg.lat - 0.0008, selBldg.lng], 18, { duration: 1.2, easeLinearity: 0.25 });
  document.getElementById("sheet-name").textContent = selBldg.name;
  document.getElementById("sheet-desc").textContent = selBldg.desc;
  document.getElementById("detail-sheet").classList.add("open");
  // Switch to map
  document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
  document.querySelector("[data-target='screen-map']").classList.add("active");
  document.getElementById("screen-index").classList.remove("active");
  document.getElementById("screen-map").classList.add("active");
}

function closeSheet() {
  document.getElementById("detail-sheet").classList.remove("open");
  if (selBldg && !navActive) {
    const el = document.getElementById(`cm-${selBldg.id}`); if (el) el.classList.remove("selected");
    selBldg = null;
  }
}

function deleteBuilding() {
  if (!selBldg) return;
  const name = selBldg.name;
  if (!confirm(`Are you sure you want to delete "${name}"?\n\nThis action cannot be undone.`)) return;
  if (markers[selBldg.id]) { map.removeLayer(markers[selBldg.id]); delete markers[selBldg.id]; }
  if (navTarget && navTarget.id === selBldg.id) { stopNav(); }
  db = db.filter(b => b.id !== selBldg.id);
  saveDB();
  selBldg = null;
  document.getElementById("detail-sheet").classList.remove("open");
  renderMarkers();
  renderIndex();
}

// ── A-Z INDEX ────────────────────────────────────────────────────────────────
function renderIndex() {
  const c = document.getElementById("index-list-container"); c.innerHTML = "";
  const sorted = [...db].sort((a,b) => a.name.localeCompare(b.name));
  let letter = "";
  sorted.forEach(b => {
    const f = b.name.charAt(0).toUpperCase();
    if (f !== letter) { letter = f; const h = document.createElement("div"); h.className="index-letter"; h.textContent=letter; c.appendChild(h); }
    const item = document.createElement("div"); item.className="index-item";
    item.innerHTML = `<div class="index-info"><span class="index-name">${b.name}</span><span class="index-sub">${b.type}</span></div><i class="fa-solid fa-chevron-right index-arrow"></i>`;
    item.onclick = () => selectBuilding(b.id);
    c.appendChild(item);
  });
}

// ── ROUTING ENGINE (BULLETPROOF) ─────────────────────────────────────────────

function clearRoute() {
  routeLayers.forEach(l => { try { map.removeLayer(l); } catch(e) {} });
  routeLayers = [];
}

// Debounced route update — prevents GPS flooding
function requestRouteUpdate() {
  if (routeDebounceTimer) clearTimeout(routeDebounceTimer);
  routeDebounceTimer = setTimeout(() => {
    fetchAndDrawRoute();
  }, 800); // Wait 800ms of GPS silence before re-routing
}

// Fetch with timeout helper
function fetchWithTimeout(url, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { signal: controller.signal }).finally(() => clearTimeout(timer));
}

async function fetchAndDrawRoute() {
  if (!navTarget) return;

  const thisRequestId = ++routeRequestId;
  const hud = document.getElementById("hud-nav-instruction");
  hud.textContent = "Calculating route…";

  clearRoute();

  const fromLng = userLoc.lng, fromLat = userLoc.lat;
  const toLng = navTarget.lng, toLat = navTarget.lat;

  // ── TRY CUSTOM ROADS FIRST (Dijkstra) ──
  const campusRoute = tryCustomRoadRoute(userLoc, { lat: toLat, lng: toLng });
  if (campusRoute && thisRequestId === routeRequestId) {
    const coords = campusRoute.path;
    const distMeters = campusRoute.distance;
    const mins = Math.max(1, Math.round(distMeters / 80)); // ~80m/min walking

    drawRouteLines(coords);
    drawRouteMarkers(coords);
    map.fitBounds(L.latLngBounds(coords), { padding: [80, 100], maxZoom: 18 });
    updateHUD(distMeters, mins);

    if (distMeters < 25) {
      hud.textContent = "🎉 You've arrived at " + (SHORT[navTarget.name] || navTarget.name);
    } else {
      hud.textContent = `Walk to ${SHORT[navTarget.name] || navTarget.name} via campus roads`;
    }
    return;
  }

  // ── FALL BACK TO OSRM ──
  // Try OSRM profiles in order: foot → driving → straight line fallback
  const profiles = ["foot", "driving"];
  let routeData = null;

  for (const profile of profiles) {
    const url = `https://router.project-osrm.org/route/v1/${profile}/${fromLng},${fromLat};${toLng},${toLat}?overview=full&geometries=geojson&steps=true`;
    try {
      const res = await fetchWithTimeout(url, 8000);
      if (!res.ok) continue;
      const data = await res.json();
      if (data.code === "Ok" && data.routes && data.routes.length > 0) {
        routeData = data.routes[0];
        // For driving profile, recalculate duration as walking speed (~80m/min)
        if (profile === "driving") {
          routeData._walkingDuration = routeData.distance / 1.33; // 80m/min = 1.33m/s
        }
        break;
      }
    } catch (err) {
      console.warn(`OSRM ${profile} failed:`, err.message);
      continue;
    }
  }

  // Check if this request is still the latest (prevents stale draws)
  if (thisRequestId !== routeRequestId) return;

  if (routeData) {
    // ── SUCCESS: Draw the OSRM route ──
    const coords = routeData.geometry.coordinates.map(c => [c[1], c[0]]);
    const distMeters = routeData.distance;
    const durationSecs = routeData._walkingDuration || routeData.duration;
    const mins = Math.max(1, Math.round(durationSecs / 60));

    drawRouteLines(coords);
    drawRouteMarkers(coords);

    // Fit map to route
    map.fitBounds(L.latLngBounds(coords), { padding: [80, 100], maxZoom: 18 });

    // Update HUD
    updateHUD(distMeters, mins);

    // Navigation instruction
    if (distMeters < 25) {
      hud.textContent = "🎉 You've arrived at " + (SHORT[navTarget.name] || navTarget.name);
    } else {
      const steps = routeData.legs[0].steps;
      if (steps.length > 1 && steps[0].maneuver) {
        const dir = steps[0].maneuver.modifier || "";
        const road = steps[0].name || "the path";
        hud.textContent = `Head ${dir} on ${road}`;
      } else {
        hud.textContent = `Walk to ${SHORT[navTarget.name] || navTarget.name}`;
      }
    }

  } else {
    // ── FALLBACK: Straight line when OSRM is completely unavailable ──
    console.warn("All OSRM profiles failed, using straight-line fallback");
    const coords = [[fromLat, fromLng], [toLat, toLng]];

    routeLayers.push(
      L.polyline(coords, { color: '#007aff', opacity: 0.5, weight: 5, dashArray: '10,8', lineCap: 'round' }).addTo(map)
    );
    map.fitBounds(L.latLngBounds(coords), { padding: [80, 80] });

    const d = haversine(userLoc, navTarget);
    const mins = Math.max(1, Math.ceil(d / 80));
    updateHUD(d, mins);
    hud.textContent = `Walk towards ${SHORT[navTarget.name] || navTarget.name}`;
  }
}

// ── Draw the multi-layer Apple Maps route ──
function drawRouteLines(coords) {
  // Layer 1: Wide glow shadow
  routeLayers.push(
    L.polyline(coords, { color: '#007aff', opacity: 0.12, weight: 18, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map)
  );
  // Layer 2: White border (road-casing effect)
  routeLayers.push(
    L.polyline(coords, { color: '#ffffff', opacity: 0.95, weight: 10, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map)
  );
  // Layer 3: Main blue route
  routeLayers.push(
    L.polyline(coords, { color: '#007aff', opacity: 0.9, weight: 7, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map)
  );
  // Layer 4: Animated direction dashes
  routeLayers.push(
    L.polyline(coords, { color: '#4da6ff', opacity: 0.6, weight: 3, lineCap: 'round', dashArray: '2,12', className: 'route-arrow-anim', interactive: false }).addTo(map)
  );
}

// ── Start/End markers ──
function drawRouteMarkers(coords) {
  // Start marker (green dot)
  const startIcon = L.divIcon({
    className: '',
    html: `<div class="route-endpoint start"><i class="fa-solid fa-circle"></i></div>`,
    iconSize: [20, 20], iconAnchor: [10, 10]
  });
  routeLayers.push(L.marker(coords[0], { icon: startIcon, interactive: false }).addTo(map));

  // End marker (blue pin with label)
  const endIcon = L.divIcon({
    className: '',
    html: `<div class="route-endpoint end"><i class="fa-solid fa-location-dot"></i><span class="route-end-label">${SHORT[navTarget.name] || navTarget.name}</span></div>`,
    iconSize: [24, 24], iconAnchor: [12, 24]
  });
  routeLayers.push(L.marker(coords[coords.length - 1], { icon: endIcon, interactive: false }).addTo(map));
}

// ── Update HUD distance/time ──
function updateHUD(distMeters, mins) {
  document.getElementById("hud-nav-distance").textContent =
    distMeters > 1000 ? (distMeters / 1000).toFixed(1) + " km" : Math.round(distMeters) + " m";
  document.getElementById("hud-nav-eta").textContent = mins + " min";
}

function haversine(a, b) {
  const R = 6371e3, p1 = a.lat*Math.PI/180, p2 = b.lat*Math.PI/180;
  const dp = (b.lat-a.lat)*Math.PI/180, dl = (b.lng-a.lng)*Math.PI/180;
  const x = Math.sin(dp/2)**2 + Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return R*2*Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

// ── START / STOP NAVIGATION ──────────────────────────────────────────────────

function startNav() {
  if (!selBldg) return;
  navTarget = { ...selBldg }; // Save target BEFORE closing sheet
  navActive = true;
  document.getElementById("nav-hud").classList.add("active");
  closeSheet();
  fetchAndDrawRoute(); // First route: no debounce, draw immediately
}

function stopNav() {
  navActive = false;
  navTarget = null;
  if (routeDebounceTimer) { clearTimeout(routeDebounceTimer); routeDebounceTimer = null; }
  document.getElementById("nav-hud").classList.remove("active");
  clearRoute();
  map.flyTo(CAMPUS_CENTER, 17, { duration: 1.2, easeLinearity: 0.25 });
}

// ── GPS ──────────────────────────────────────────────────────────────────────
function toggleGps() {
  const btn = document.getElementById("my-location-btn");
  if (btn.classList.contains("active")) {
    if (watchId !== null) { navigator.geolocation.clearWatch(watchId); watchId = null; }
    btn.classList.remove("active");
    btn.style.color = "";
    return;
  }
  btn.classList.add("active");
  btn.style.color = "var(--emerald)";

  if (!("geolocation" in navigator)) { alert("Your device does not support GPS."); return; }

  // One-shot for immediate position
  navigator.geolocation.getCurrentPosition(
    p => {
      userLoc = { lat: p.coords.latitude, lng: p.coords.longitude };
      updateUserMarker();
      map.flyTo([userLoc.lat, userLoc.lng], 17, { duration: 1 });
      if (navActive) requestRouteUpdate();
    },
    err => console.warn("Initial GPS:", err),
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
  );

  // Continuous tracking
  watchId = navigator.geolocation.watchPosition(
    p => {
      userLoc = { lat: p.coords.latitude, lng: p.coords.longitude };
      updateUserMarker();
      if (navActive) {
        // Smooth follow without jarring setView
        map.panTo([userLoc.lat, userLoc.lng], { animate: true, duration: 0.5 });
        requestRouteUpdate(); // Debounced — won't flood OSRM
      }
    },
    err => {
      console.warn("GPS error:", err.code, err.message);
      if (err.code === 1) { // PERMISSION_DENIED
        alert("GPS access denied. Please enable Location in your phone Settings > Privacy > Location Services, and also allow it in your browser.");
        btn.classList.remove("active"); btn.style.color = "";
      }
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 3000 }
  );
}

// ── SEARCH ───────────────────────────────────────────────────────────────────
function handleSearch(q) {
  const dd = document.getElementById("search-results"), cb = document.getElementById("search-clear");
  dd.innerHTML = "";
  if (!q.trim()) { dd.classList.remove("active"); cb.style.display = "none"; return; }
  cb.style.display = "grid";
  const lq = q.toLowerCase(), matches = [];
  db.forEach(b => {
    if (b.name.toLowerCase().includes(lq) || b.desc.toLowerCase().includes(lq))
      matches.push({ title: b.name, sub: b.type, id: b.id, icon: b.icon });
    // Also search departments and teachers
    if (b.depts) {
      b.depts.forEach(d => {
        if (d.name && d.name.toLowerCase().includes(lq))
          matches.push({ title: d.name, sub: `Dept in ${SHORT[b.name]||b.name}`, id: b.id, icon: "fa-building" });
        if (d.teachers) {
          d.teachers.forEach(t => {
            if (t.toLowerCase().includes(lq))
              matches.push({ title: t, sub: `Faculty at ${SHORT[b.name]||b.name}`, id: b.id, icon: "fa-user-tie" });
          });
        }
      });
    }
  });

  // Deduplicate by building id for same building matches
  const seen = new Set();
  const unique = matches.filter(m => {
    const key = m.title + m.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (unique.length) {
    dd.classList.add("active");
    unique.slice(0,8).forEach(m => {
      const el = document.createElement("div"); el.className = "sr-item";
      el.innerHTML = `<div class="sr-icon"><i class="fa-solid ${m.icon}"></i></div><div><span class="sr-title">${m.title}</span><br><span class="sr-sub">${m.sub}</span></div>`;
      el.onclick = () => { selectBuilding(m.id); dd.classList.remove("active"); document.getElementById("search-input").value=""; cb.style.display="none"; };
      dd.appendChild(el);
    });
  } else {
    dd.classList.add("active");
    dd.innerHTML = `<div class="sr-item" style="justify-content:center;color:var(--text3)">No results</div>`;
  }
}

// ── EVENTS ───────────────────────────────────────────────────────────────────
function initEvents() {
  document.getElementById("sheet-close").onclick = closeSheet;
  document.getElementById("btn-navigate").onclick = startNav;
  document.getElementById("btn-stop-nav").onclick = stopNav;
  document.getElementById("btn-delete-bldg").onclick = deleteBuilding;
  document.getElementById("my-location-btn").onclick = toggleGps;
  document.getElementById("btn-lock-map").onclick = toggleLock;
  document.getElementById("search-input").oninput = e => handleSearch(e.target.value);
  document.getElementById("search-clear").onclick = () => { document.getElementById("search-input").value=""; handleSearch(""); };
  document.addEventListener("click", e => { if (!e.target.closest(".search-panel")) document.getElementById("search-results").classList.remove("active"); });

  document.getElementById("btn-drag-hint").onclick = () => {
    if (isLocked) toggleLock();
    closeSheet();
    alert("Map unlocked! Drag any building marker to move it. Tap the lock icon to save positions.");
  };

  document.getElementById("sim-toggle-btn").onclick = () => {
    simActive = !simActive;
    document.getElementById("sim-toggle-btn").classList.toggle("active", simActive);
    document.getElementById("simulator-panel").classList.toggle("hidden", !simActive);
  };

  // Dark Mode Toggle
  document.getElementById("btn-dark-mode").onclick = toggleDarkMode;

  // Road Drawing
  document.getElementById("btn-draw-road").onclick = startDrawingRoad;
  document.getElementById("btn-road-cancel").onclick = cancelDrawingRoad;
  document.getElementById("btn-road-done").onclick = saveDrawnRoad;
  document.getElementById("btn-road-undo").onclick = undoDrawPoint;

  // Road Deleting
  document.getElementById("btn-delete-road-mode").onclick = toggleDeleteRoadMode;
  document.getElementById("btn-exit-road-delete").onclick = () => exitDeleteRoadMode();

  // Add Building
  document.getElementById("nav-add-bldg").onclick = () => {
    isAddingBldg = true;
    document.getElementById("add-bldg-modal").style.display = "block";
    document.getElementById("new-bldg-name").value = "";
    document.getElementById("new-bldg-desc").value = "";
    const coordsEl = document.getElementById("new-bldg-coords");
    coordsEl.textContent = "📍 Not set — tap the map!";
    coordsEl.classList.remove("has-coords");
    document.getElementById("btn-save-bldg").disabled = true;
    newBldgLoc = null; closeSheet();
  };
  document.getElementById("btn-cancel-bldg").onclick = () => { isAddingBldg = false; document.getElementById("add-bldg-modal").style.display = "none"; };
  document.getElementById("btn-save-bldg").onclick = () => {
    if (!newBldgLoc) return;
    const t = document.getElementById("new-bldg-type").value;
    const icons = {academic:"fa-graduation-cap",facility:"fa-gear",sports:"fa-medal",nature:"fa-leaf",gate:"fa-door-open"};
    const newBldg = {
      id: "b_" + Date.now(), name: document.getElementById("new-bldg-name").value || "New Place",
      type: t, lat: newBldgLoc.lat, lng: newBldgLoc.lng, icon: icons[t]||"fa-location-dot",
      desc: document.getElementById("new-bldg-desc").value || "A campus location.", depts: []
    };
    db.push(newBldg); saveDB(); renderMarkers(); renderIndex();
    isAddingBldg = false; document.getElementById("add-bldg-modal").style.display = "none";
    selectBuilding(newBldg.id);
  };

  // Bottom Nav
  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.addEventListener("click", () => {
      if (btn.id === "nav-add-bldg") return;
      document.querySelectorAll(".nav-item").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
      document.getElementById(btn.dataset.target).classList.add("active");
    });
  });

  // Filters
  document.getElementById("filter-bar").onclick = e => {
    const ch = e.target.closest(".chip");
    if (!ch) return;
    document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
    ch.classList.add("active");
    filter = ch.dataset.type;
    renderMarkers();
  };

  // Swipe to dismiss detail sheet
  const sheet = document.getElementById("detail-sheet"); let sy = 0;
  sheet.addEventListener("touchstart", e => { sy = e.touches[0].clientY; }, { passive: true });
  sheet.addEventListener("touchend", e => { if (e.changedTouches[0].clientY - sy > 100) closeSheet(); }, { passive: true });

  // Index search
  const idxSearch = document.getElementById("index-search-input");
  if (idxSearch) {
    idxSearch.oninput = e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll(".index-item").forEach(el => {
        el.style.display = el.textContent.toLowerCase().includes(q) ? "" : "none";
      });
    };
  }
}

// ── DARK MODE ────────────────────────────────────────────────────────────────
function toggleDarkMode() {
  isDark = !isDark;
  document.documentElement.setAttribute("data-theme", isDark ? "dark" : "");
  localStorage.setItem("acnav_dark", isDark);
  const btn = document.getElementById("btn-dark-mode");
  btn.innerHTML = isDark ? `<i class="fa-solid fa-sun"></i>` : `<i class="fa-solid fa-moon"></i>`;
  document.querySelector('meta[name="theme-color"]').content = isDark ? "#1c1c1e" : "#ffffff";

  // Swap actual map tiles
  if (tileLayer && map) {
    map.removeLayer(tileLayer);
    tileLayer = L.tileLayer(isDark ? TILE_DARK : TILE_LIGHT, { maxZoom: 19 }).addTo(map);
  }
}

// ── CUSTOM ROAD DRAWING ─────────────────────────────────────────────────────

function renderCustomRoads() {
  // Clear existing road layers
  Object.values(customRoadLayers).forEach(layers => {
    layers.forEach(l => { try { map.removeLayer(l); } catch(e){} });
  });
  customRoadLayers = {};

  customRoads.forEach(road => {
    const layers = [];
    // Border (wider white)
    layers.push(L.polyline(road.points, {
      color: '#aaaaaa', weight: 12, opacity: 0.6, lineCap: 'round', lineJoin: 'round', interactive: isDeletingRoad
    }).addTo(map));
    // Fill (orange for custom roads)
    const mainLine = L.polyline(road.points, {
      color: '#ff9500', weight: 6, opacity: 0.85, lineCap: 'round', lineJoin: 'round', interactive: isDeletingRoad,
      className: isDeletingRoad ? 'custom-road-line' : ''
    }).addTo(map);
    layers.push(mainLine);

    if (isDeletingRoad) {
      mainLine.on('click', () => deleteCustomRoad(road.id));
      layers[0].on('click', () => deleteCustomRoad(road.id));
    }

    customRoadLayers[road.id] = layers;
  });
}

function startDrawingRoad() {
  if (isDrawingRoad) return;
  isDrawingRoad = true;
  drawPoints = [];
  drawWaypointMarkers = [];
  drawPreviewLine = null;
  closeSheet();

  document.getElementById("road-draw-toolbar").style.display = "block";
  document.getElementById("btn-draw-road").classList.add("active");
  document.getElementById("road-point-count").textContent = "0 points";
  document.getElementById("btn-road-done").disabled = true;
  document.getElementById("map").style.cursor = "crosshair";
}

function addDrawPoint(lat, lng) {
  const pt = [+lat.toFixed(6), +lng.toFixed(6)];
  drawPoints.push(pt);

  // Add a waypoint dot marker
  const dotIcon = L.divIcon({ className: '', html: '<div class="road-waypoint"></div>', iconSize: [12, 12], iconAnchor: [6, 6] });
  const dotMarker = L.marker(pt, { icon: dotIcon, interactive: false }).addTo(map);
  drawWaypointMarkers.push(dotMarker);

  // Update or create preview line
  if (drawPreviewLine) {
    drawPreviewLine.setLatLngs(drawPoints);
  } else {
    drawPreviewLine = L.polyline(drawPoints, {
      color: '#ff9500', weight: 5, opacity: 0.7, dashArray: '8,6', lineCap: 'round', lineJoin: 'round'
    }).addTo(map);
  }

  // Update UI
  document.getElementById("road-point-count").textContent = drawPoints.length + (drawPoints.length === 1 ? " point" : " points");
  document.getElementById("btn-road-done").disabled = drawPoints.length < 2;
}

function undoDrawPoint() {
  if (!drawPoints.length) return;
  drawPoints.pop();
  const lastDot = drawWaypointMarkers.pop();
  if (lastDot) map.removeLayer(lastDot);
  if (drawPreviewLine) drawPreviewLine.setLatLngs(drawPoints);
  document.getElementById("road-point-count").textContent = drawPoints.length + (drawPoints.length === 1 ? " point" : " points");
  document.getElementById("btn-road-done").disabled = drawPoints.length < 2;
}

function cancelDrawingRoad() {
  // Clean up preview
  if (drawPreviewLine) { map.removeLayer(drawPreviewLine); drawPreviewLine = null; }
  drawWaypointMarkers.forEach(m => map.removeLayer(m));
  drawWaypointMarkers = [];
  drawPoints = [];
  isDrawingRoad = false;
  document.getElementById("road-draw-toolbar").style.display = "none";
  document.getElementById("btn-draw-road").classList.remove("active");
  document.getElementById("map").style.cursor = "";
}

function saveDrawnRoad() {
  if (drawPoints.length < 2) return;
  const road = { id: "road_" + Date.now(), points: [...drawPoints] };
  customRoads.push(road);
  saveCustomRoads();

  // Clean up preview
  if (drawPreviewLine) { map.removeLayer(drawPreviewLine); drawPreviewLine = null; }
  drawWaypointMarkers.forEach(m => map.removeLayer(m));
  drawWaypointMarkers = [];
  drawPoints = [];
  isDrawingRoad = false;
  document.getElementById("road-draw-toolbar").style.display = "none";
  document.getElementById("btn-draw-road").classList.remove("active");
  document.getElementById("map").style.cursor = "";

  renderCustomRoads();
}

function toggleDeleteRoadMode() {
  if (isDeletingRoad) {
    exitDeleteRoadMode();
  } else {
    isDeletingRoad = true;
    document.getElementById("road-delete-toolbar").style.display = "block";
    document.getElementById("btn-delete-road-mode").classList.add("active");
    renderCustomRoads(); // Re-render with click handlers
  }
}

function exitDeleteRoadMode() {
  isDeletingRoad = false;
  document.getElementById("road-delete-toolbar").style.display = "none";
  document.getElementById("btn-delete-road-mode").classList.remove("active");
  renderCustomRoads(); // Re-render without click handlers
}

let lastDeletedRoad = null;
let undoTimer = null;

function deleteCustomRoad(id) {
  const road = customRoads.find(r => r.id === id);
  if (!road) return;

  // Remove the road
  lastDeletedRoad = { ...road };
  customRoads = customRoads.filter(r => r.id !== id);
  saveCustomRoads();
  localStorage.setItem("acnav_roads_cleared", "true");
  renderCustomRoads();

  // Show undo toast
  showUndoToast("Road deleted");
}

function showUndoToast(msg) {
  // Remove existing toast
  const old = document.getElementById("undo-toast");
  if (old) old.remove();
  if (undoTimer) clearTimeout(undoTimer);

  const toast = document.createElement("div");
  toast.id = "undo-toast";
  toast.className = "undo-toast show";
  toast.innerHTML = `<span>${msg}</span><button id="btn-undo-road">Undo</button>`;
  document.body.appendChild(toast);

  toast.querySelector("#btn-undo-road").onclick = () => {
    if (lastDeletedRoad) {
      customRoads.push(lastDeletedRoad);
      saveCustomRoads();
      renderCustomRoads();
      lastDeletedRoad = null;
    }
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
    if (undoTimer) clearTimeout(undoTimer);
  };

  // Auto-dismiss after 6 seconds
  undoTimer = setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
    lastDeletedRoad = null;
  }, 6000);
}

// ── DIJKSTRA ROUTING ON CUSTOM ROADS ─────────────────────────────────────────

function findNearestPointOnRoads(loc) {
  let minDist = Infinity, nearest = null;
  customRoads.forEach(road => {
    road.points.forEach(pt => {
      const d = haversine({ lat: loc.lat || loc[0], lng: loc.lng || loc[1] }, { lat: pt[0], lng: pt[1] });
      if (d < minDist) { minDist = d; nearest = pt; }
    });
  });
  return { point: nearest, dist: minDist };
}

function buildRoadGraph() {
  // Build adjacency list from all custom roads
  const adj = new Map(); // key: "lat,lng" → [{node, weight}]
  const key = (pt) => pt[0] + "," + pt[1];

  customRoads.forEach(road => {
    for (let i = 0; i < road.points.length - 1; i++) {
      const a = road.points[i], b = road.points[i + 1];
      const ka = key(a), kb = key(b);
      const w = haversine({ lat: a[0], lng: a[1] }, { lat: b[0], lng: b[1] });
      if (!adj.has(ka)) adj.set(ka, []);
      if (!adj.has(kb)) adj.set(kb, []);
      adj.get(ka).push({ node: kb, weight: w, pt: b });
      adj.get(kb).push({ node: ka, weight: w, pt: a });
    }
  });
  return { adj, key };
}

function dijkstra(adj, startKey, endKey) {
  const dist = new Map(), prev = new Map(), visited = new Set();
  const pq = [{ node: startKey, d: 0 }];
  dist.set(startKey, 0);

  while (pq.length) {
    pq.sort((a, b) => a.d - b.d);
    const { node: u, d } = pq.shift();
    if (visited.has(u)) continue;
    visited.add(u);
    if (u === endKey) break;

    const neighbors = adj.get(u) || [];
    for (const { node: v, weight } of neighbors) {
      const alt = d + weight;
      if (alt < (dist.get(v) ?? Infinity)) {
        dist.set(v, alt);
        prev.set(v, u);
        pq.push({ node: v, d: alt });
      }
    }
  }

  if (!dist.has(endKey)) return null;

  // Reconstruct path
  const path = [];
  let cur = endKey;
  while (cur) {
    const parts = cur.split(",");
    path.unshift([+parts[0], +parts[1]]);
    cur = prev.get(cur);
  }
  return { path, distance: dist.get(endKey) };
}

function tryCustomRoadRoute(fromLoc, toLoc) {
  if (customRoads.length === 0) return null;

  const nearFrom = findNearestPointOnRoads(fromLoc);
  const nearTo = findNearestPointOnRoads(toLoc);

  // Only use custom roads if both endpoints are within 200m of a road
  if (!nearFrom.point || !nearTo.point || nearFrom.dist > 200 || nearTo.dist > 200) return null;

  const { adj, key } = buildRoadGraph();
  const startKey = key(nearFrom.point);
  const endKey = key(nearTo.point);

  if (startKey === endKey) return null;

  const result = dijkstra(adj, startKey, endKey);
  if (!result) return null;

  // Add walking segments from actual location to nearest road point
  const fullPath = [];
  fullPath.push([fromLoc.lat || fromLoc[0], fromLoc.lng || fromLoc[1]]);
  fullPath.push(...result.path);
  fullPath.push([toLoc.lat || toLoc[0], toLoc.lng || toLoc[1]]);

  const totalDist = nearFrom.dist + result.distance + nearTo.dist;
  return { path: fullPath, distance: totalDist };
}
