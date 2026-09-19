/* ==========================================================================
   KLX 150 DASHBOARD SPEEDOMETER - JAVASCRIPT LOGIC
   Kawasaki Theme & MDP Design
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  // State & Data
  let state = {
    currentSpeed: 0,
    maxSpeed: parseFloat(localStorage.getItem('klx_maxSpeed')) || 0,
    totalDistance: parseFloat(localStorage.getItem('klx_totalDist')) || 0,
    tripA: parseFloat(localStorage.getItem('klx_tripA')) || 0,
    tripB: parseFloat(localStorage.getItem('klx_tripB')) || 0,
    altitude: 120, // default fallback altitude mdpl
    heading: 0,
    gpsAccuracy: 0,
    lastPosition: null,
    totalSpeedSum: 0,
    speedReadingCount: 0,
    isAutoRecenter: true,
    isDemoMode: false,
    demoInterval: null,
    mapTileIndex: 0,
    wakeLock: null,
    overspeedThreshold: 100
  };

  // DOM Elements
  const elSpeedValue = document.getElementById('speed-value');
  const elGaugeBar = document.getElementById('gauge-bar');
  const elSpeedAlert = document.getElementById('speed-alert');
  const elClock = document.getElementById('clock');
  const elGpsStatus = document.getElementById('gps-status');
  const elGpsText = document.getElementById('gps-text');
  
  const elValAltitude = document.getElementById('val-altitude');
  const elValHeading = document.getElementById('val-heading');
  const elValMaxSpeed = document.getElementById('val-max-speed');
  const elValAvgSpeed = document.getElementById('val-avg-speed');
  
  const elValTripA = document.getElementById('val-trip-a');
  const elValTripB = document.getElementById('val-trip-b');
  const elValTotalDist = document.getElementById('val-total-dist');
  const elValGpsAcc = document.getElementById('val-gps-acc');
  
  const elCompassArrow = document.getElementById('compass-arrow');
  const elCompassDirText = document.getElementById('compass-dir-text');
  const btnDemoSim = document.getElementById('btn-demo-sim');

  // 1. Digital Clock
  function updateClock() {
    const now = new Date();
    const hrs = String(now.getHours()).padStart(2, '0');
    const mins = String(now.getMinutes()).padStart(2, '0');
    const secs = String(now.getSeconds()).padStart(2, '0');
    elClock.textContent = `${hrs}:${mins}:${secs}`;
  }
  setInterval(updateClock, 1000);
  updateClock();

  // 2. SVG Arc Gauge Update (0 - 140 km/h)
  const GAUGE_MAX_SPEED = 140;
  const CIRCUMFERENCE = 2 * Math.PI * 120;
  const MAX_ARC_RATIO = 0.75;

  function updateGauge(speedKmH) {
    const clampedSpeed = Math.min(Math.max(speedKmH, 0), GAUGE_MAX_SPEED);
    const speedRatio = clampedSpeed / GAUGE_MAX_SPEED;
    const dashOffset = CIRCUMFERENCE * (1 - (speedRatio * MAX_ARC_RATIO));
    elGaugeBar.style.strokeDashoffset = dashOffset;
    
    elSpeedValue.textContent = Math.round(clampedSpeed);

    if (clampedSpeed >= state.overspeedThreshold) {
      elSpeedAlert.classList.remove('hidden');
    } else {
      elSpeedAlert.classList.add('hidden');
    }
  }

  updateGauge(0);
  renderMetrics();

  // 3. Leaflet Map Setup - 100% Free OpenStreetMap & Esri (NO API Key Needed!)
  const tileProviders = [
    {
      name: 'OpenStreetMap Dark Filter',
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '&copy; OpenStreetMap contributors'
    },
    {
      name: 'Esri Satellite',
      url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      attribution: 'Tiles &copy; Esri'
    }
  ];

  // Default coordinate: Jakarta / Indonesia
  const initialLat = -6.2088;
  const initialLng = 106.8456;

  const map = L.map('map', {
    zoomControl: false,
    attributionControl: false
  }).setView([initialLat, initialLng], 16);

  let currentTileLayer = L.tileLayer(tileProviders[0].url, { maxZoom: 19 }).addTo(map);
  setTimeout(() => map.invalidateSize(), 500);

  const riderIcon = L.divIcon({
    className: 'rider-marker-wrapper',
    html: `<div id="map-rider-icon" class="rider-marker"><i class="fa-solid fa-location-arrow"></i></div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

  let riderMarker = L.marker([initialLat, initialLng], { icon: riderIcon }).addTo(map);

  // 4. GPS Geolocation Tracking
  if ('geolocation' in navigator) {
    navigator.geolocation.watchPosition(
      onPositionSuccess,
      onPositionError,
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000
      }
    );
  } else {
    updateGpsStatus('error', 'GPS Tidak Didukung');
  }

  function onPositionSuccess(pos) {
    if (state.isDemoMode) return; // Skip real GPS if demo simulation is running

    const crd = pos.coords;
    
    state.gpsAccuracy = crd.accuracy;
    if (crd.accuracy <= 25) {
      updateGpsStatus('active', `GPS Aktif (${Math.round(crd.accuracy)}m)`);
    } else {
      updateGpsStatus('searching', `GPS Lemah (${Math.round(crd.accuracy)}m)`);
    }

    let speedKmH = 0;
    if (crd.speed !== null && crd.speed !== undefined && crd.speed > 0) {
      speedKmH = crd.speed * 3.6;
    }
    state.currentSpeed = speedKmH;
    updateGauge(speedKmH);

    if (speedKmH > state.maxSpeed) {
      state.maxSpeed = speedKmH;
      localStorage.setItem('klx_maxSpeed', state.maxSpeed.toFixed(1));
    }

    if (speedKmH > 2) {
      state.totalSpeedSum += speedKmH;
      state.speedReadingCount++;
    }

    if (crd.altitude !== null && crd.altitude !== undefined) {
      state.altitude = Math.round(crd.altitude);
    }

    if (state.lastPosition) {
      const distKm = calculateHaversineDistance(
        state.lastPosition.latitude,
        state.lastPosition.longitude,
        crd.latitude,
        crd.longitude
      );

      if (distKm > 0.001 && distKm < 0.5) {
        state.tripA += distKm;
        state.tripB += distKm;
        state.totalDistance += distKm;

        localStorage.setItem('klx_tripA', state.tripA.toFixed(2));
        localStorage.setItem('klx_tripB', state.tripB.toFixed(2));
        localStorage.setItem('klx_totalDist', state.totalDistance.toFixed(2));
      }
    }
    state.lastPosition = { latitude: crd.latitude, longitude: crd.longitude };

    if (crd.heading !== null && crd.heading !== undefined && !isNaN(crd.heading)) {
      updateCompass(crd.heading);
    }

    const newLatLng = [crd.latitude, crd.longitude];
    riderMarker.setLatLng(newLatLng);

    if (state.isAutoRecenter) {
      map.panTo(newLatLng, { animate: true, duration: 0.5 });
    }

    renderMetrics();
  }

  function onPositionError(err) {
    if (!state.isDemoMode) {
      updateGpsStatus('searching', 'Mencari GPS (Buka Mode Demo di Laptop)');
    }
  }

  function updateGpsStatus(type, text) {
    elGpsStatus.className = `status-indicator ${type}`;
    elGpsText.textContent = text;
  }

  function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  // 5. Compass & Heading
  if (window.DeviceOrientationEvent) {
    window.addEventListener('deviceorientation', (e) => {
      let compassHeading = null;
      if (e.webkitCompassHeading) {
        compassHeading = e.webkitCompassHeading;
      } else if (e.alpha !== null) {
        compassHeading = 360 - e.alpha;
      }
      
      if (state.currentSpeed < 3 && compassHeading !== null && !state.isDemoMode) {
        updateCompass(compassHeading);
      }
    }, true);
  }

  function updateCompass(headingDeg) {
    const deg = Math.round(headingDeg) % 360;
    state.heading = deg;
    
    elCompassArrow.style.transform = `rotate(${deg}deg)`;
    const mapIcon = document.getElementById('map-rider-icon');
    if (mapIcon) {
      mapIcon.style.transform = `rotate(${deg}deg)`;
    }

    const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    const dirIndex = Math.round(deg / 45) % 8;
    elCompassDirText.textContent = dirs[dirIndex];
    elValHeading.innerHTML = `${deg}° <small>${dirs[dirIndex]}</small>`;
  }

  // 6. Metrics Render
  function renderMetrics() {
    elValAltitude.innerHTML = `${state.altitude} <small>mdpl</small>`;
    elValMaxSpeed.innerHTML = `${Math.round(state.maxSpeed)} <small>km/h</small>`;
    
    const avgSpeed = state.speedReadingCount > 0 ? (state.totalSpeedSum / state.speedReadingCount) : state.currentSpeed;
    elValAvgSpeed.innerHTML = `${Math.round(avgSpeed)} <small>km/h</small>`;

    elValTripA.innerHTML = `${state.tripA.toFixed(1)} <small>km</small>`;
    elValTripB.innerHTML = `${state.tripB.toFixed(1)} <small>km</small>`;
    elValTotalDist.innerHTML = `${state.totalDistance.toFixed(1)} <small>km</small>`;
    elValGpsAcc.innerHTML = `${Math.round(state.gpsAccuracy)} <small>m</small>`;
  }

  // Trip Reset Handlers
  document.querySelectorAll('.btn-reset-trip').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tripTarget = e.currentTarget.getAttribute('data-trip');
      if (tripTarget === 'a') {
        state.tripA = 0;
        localStorage.setItem('klx_tripA', '0');
      } else if (tripTarget === 'b') {
        state.tripB = 0;
        localStorage.setItem('klx_tripB', '0');
      }
      renderMetrics();
    });
  });

  // 7. Demo Riding Simulation (For testing in Chrome Laptop!)
  btnDemoSim.addEventListener('click', () => {
    state.isDemoMode = !state.isDemoMode;
    btnDemoSim.classList.toggle('active', state.isDemoMode);

    if (state.isDemoMode) {
      updateGpsStatus('active', 'Simulasi Riding Demo');
      let simLat = initialLat;
      let simLng = initialLng;
      let targetSpeed = 45;
      let angle = 45; // NE direction

      state.demoInterval = setInterval(() => {
        // Vary speed smoothly (35 - 75 km/h)
        targetSpeed += (Math.random() * 8 - 4);
        targetSpeed = Math.min(Math.max(targetSpeed, 30), 85);
        state.currentSpeed = targetSpeed;
        updateGauge(targetSpeed);

        if (targetSpeed > state.maxSpeed) {
          state.maxSpeed = targetSpeed;
        }
        state.totalSpeedSum += targetSpeed;
        state.speedReadingCount++;

        // Move position
        angle += (Math.random() * 6 - 3);
        const rad = angle * Math.PI / 180;
        simLat += (Math.cos(rad) * 0.00012);
        simLng += (Math.sin(rad) * 0.00012);

        // Distance step
        const stepDist = 0.012; 
        state.tripA += stepDist;
        state.tripB += stepDist;
        state.totalDistance += stepDist;
        state.gpsAccuracy = 4;
        state.altitude = 125 + Math.round(Math.sin(Date.now() / 2000) * 15);

        updateCompass(angle);
        const newLatLng = [simLat, simLng];
        riderMarker.setLatLng(newLatLng);
        if (state.isAutoRecenter) {
          map.panTo(newLatLng, { animate: true, duration: 0.3 });
        }

        renderMetrics();
      }, 500);
    } else {
      clearInterval(state.demoInterval);
      updateGpsStatus('searching', 'GPS Idle');
      state.currentSpeed = 0;
      updateGauge(0);
    }
  });

  // 8. Screen Keep-Awake
  async function requestWakeLock() {
    try {
      if ('wakeLock' in navigator) {
        state.wakeLock = await navigator.wakeLock.request('screen');
        document.getElementById('btn-wakelock').classList.add('active');
      }
    } catch (err) {}
  }
  requestWakeLock();

  document.getElementById('btn-wakelock').addEventListener('click', () => {
    if (state.wakeLock) {
      state.wakeLock.release();
      state.wakeLock = null;
      document.getElementById('btn-wakelock').classList.remove('active');
    } else {
      requestWakeLock();
    }
  });

  // 9. Map Controls
  document.getElementById('btn-recenter').addEventListener('click', (e) => {
    state.isAutoRecenter = !state.isAutoRecenter;
    e.currentTarget.classList.toggle('active', state.isAutoRecenter);
  });

  document.getElementById('btn-map-mode').addEventListener('click', () => {
    state.mapTileIndex = (state.mapTileIndex + 1) % tileProviders.length;
    map.removeLayer(currentTileLayer);
    currentTileLayer = L.tileLayer(tileProviders[state.mapTileIndex].url, { maxZoom: 19 }).addTo(map);
  });

  // 10. Theme Switcher & Fullscreen
  const themes = ['theme-kawasaki', 'theme-orange', 'theme-cyber'];
  let currentThemeIdx = 0;

  document.getElementById('btn-theme').addEventListener('click', () => {
    document.body.classList.remove(themes[currentThemeIdx]);
    currentThemeIdx = (currentThemeIdx + 1) % themes.length;
    document.body.classList.add(themes[currentThemeIdx]);
  });

  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  });

  // 11. Service Worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
});
