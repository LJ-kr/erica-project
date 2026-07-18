/*
  =========================================================
  교통약자 이동지도 - 2단계: 장애물 사진 업로드 + 마커 표시
  =========================================================
  이번에 추가/수정된 부분:
  - 사진 선택 시 바로 업로드하지 않고, 미리보기+설명 입력 모달을 먼저 띄움
  - 업로드 전 캔버스로 리사이즈/압축해서 용량을 줄임 (최대 1280px, JPEG 80%)
  - 마커를 다시 클릭하면 열려있던 사진 팝업이 닫히도록 토글 처리
  =========================================================
*/

const API_BASE = "https://erica-project-back.vercel.app";

let map;
let userMarker;
let accuracyCircle;
let watchId;
let places;
let searchMarker;
let obstacleMarkers = [];

const statusBar = document.getElementById('status-bar');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResultsEl = document.getElementById('search-results');
const locateBtn = document.getElementById('locate-btn');

const reportBtn = document.getElementById('report-btn');
const reportPhotoInput = document.getElementById('report-photo-input');
const reportCategorySelect = document.getElementById('report-category-select');

// 제보 모달 관련 (신규)
const reportModal = document.getElementById('report-modal');
const reportPreviewImg = document.getElementById('report-preview');
const reportDescInput = document.getElementById('report-desc-input');
const reportCancelBtn = document.getElementById('report-cancel-btn');
const reportSubmitBtn = document.getElementById('report-submit-btn');

let pendingReportBlob = null;
let pendingReportPos = null;
let pendingReportCategory = 'other';

kakao.maps.load(initMap);

function initMap() {
  const defaultCenter = new kakao.maps.LatLng(37.5665, 126.978);

  map = new kakao.maps.Map(document.getElementById('map'), {
    center: defaultCenter,
    level: 4,
  });

  map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  places = new kakao.maps.services.Places();

  setupSearch();
  setupLocateButton();
  setupReportUpload();
  startWatchingPosition();
  loadObstacleReports();
}

// ---------------------------------------------------------
// 실시간 위치 (기존과 동일)
// ---------------------------------------------------------
function startWatchingPosition() {
  if (!('geolocation' in navigator)) {
    statusBar.textContent = '이 브라우저는 위치 정보를 지원하지 않습니다.';
    return;
  }

  statusBar.textContent = '위치 정보를 가져오는 중...';

  watchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    onPositionError,
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
  );
}

function onPositionUpdate(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const pos = new kakao.maps.LatLng(latitude, longitude);

  if (!userMarker) {
    map.setCenter(pos);
    map.setLevel(3);

    const dot = document.createElement('div');
    dot.className = 'user-dot';

    userMarker = new kakao.maps.CustomOverlay({
      position: pos,
      content: dot,
      map,
      yAnchor: 0.5,
      zIndex: 10,
    });

    accuracyCircle = new kakao.maps.Circle({
      map,
      center: pos,
      radius: accuracy,
      strokeWeight: 1,
      strokeColor: '#4285F4',
      strokeOpacity: 0.4,
      fillColor: '#4285F4',
      fillOpacity: 0.15,
    });
  } else {
    userMarker.setPosition(pos);
    accuracyCircle.setPosition(pos);
    accuracyCircle.setRadius(accuracy);
  }

  updateStatusForAccuracy(accuracy);
}

function updateStatusForAccuracy(accuracy) {
  const rounded = Math.round(accuracy);

  if (accuracy > 500) {
    statusBar.textContent = `⚠️ 위치 정확도 매우 낮음 (약 ${rounded}m) — 노트북이거나 실내일 경우 실제 위치와 크게 다를 수 있어요`;
    statusBar.classList.add('status-warning');
  } else if (accuracy > 100) {
    statusBar.textContent = `⚠️ 위치 정확도 낮음 (약 ${rounded}m) — 지도에서 실제 위치와 차이가 있을 수 있어요`;
    statusBar.classList.add('status-warning');
  } else {
    statusBar.textContent = `위치 정확도: 약 ${rounded}m`;
    statusBar.classList.remove('status-warning');
  }
}

function onPositionError(error) {
  const messages = {
    1: '위치 정보 접근 권한이 거부되었습니다. 브라우저 설정에서 위치 권한을 허용해주세요.',
    2: '위치 정보를 사용할 수 없습니다.',
    3: '위치 정보 요청이 시간 초과되었습니다.',
  };
  statusBar.textContent = messages[error.code] || '위치 정보를 가져오는 데 실패했습니다.';
}

function setupLocateButton() {
  locateBtn.addEventListener('click', () => {
    if (userMarker) {
      map.panTo(userMarker.getPosition());
      map.setLevel(3);
    } else {
      statusBar.textContent = '아직 위치 정보를 가져오지 못했습니다.';
    }
  });
}

// ---------------------------------------------------------
// 검색 (기존과 동일)
// ---------------------------------------------------------
function setupSearch() {
  function doSearch() {
    const query = searchInput.value.trim();
    if (!query) return;

    places.keywordSearch(query, (data, status) => {
      if (status !== kakao.maps.services.Status.OK) {
        statusBar.textContent = '검색 결과를 찾을 수 없습니다.';
        renderResults([]);
        return;
      }
      renderResults(data);
    });
  }

  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

function renderResults(list) {
  searchResultsEl.innerHTML = '';

  if (list.length === 0) {
    searchResultsEl.style.display = 'none';
    return;
  }

  list.slice(0, 5).forEach((place) => {
    const li = document.createElement('li');
    li.innerHTML = `
      <div class="result-row">
        <div class="result-text">
          <strong>${escapeHtml(place.place_name)}</strong>
          <span>${escapeHtml(place.road_address_name || place.address_name)}</span>
        </div>
        <button class="route-to-btn">길찾기</button>
      </div>
    `;

    li.addEventListener('click', (e) => {
      if (e.target.classList.contains('route-to-btn')) {
        requestRoute(place);
      } else {
        moveToPlace(place);
      }
    });

    searchResultsEl.appendChild(li);
  });

  searchResultsEl.style.display = 'block';
}

function moveToPlace(place) {
  const pos = new kakao.maps.LatLng(place.y, place.x);
  map.panTo(pos);
  map.setLevel(3);

  if (searchMarker) {
    searchMarker.setMap(null);
  }
  searchMarker = new kakao.maps.Marker({ position: pos, map });

  statusBar.textContent = place.place_name;
  searchResultsEl.style.display = 'none';
  searchInput.value = place.place_name;
}

// ---------------------------------------------------------
// 공통 유틸
// ---------------------------------------------------------
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ---------------------------------------------------------
// 장애물 사진 업로드
// ---------------------------------------------------------
function setupReportUpload() {
  if (!reportBtn) return;

  reportBtn.addEventListener('click', () => {
    reportPhotoInput.click();
  });

  reportPhotoInput.addEventListener('change', async () => {
    const file = reportPhotoInput.files[0];
    if (!file) return;

    if (!userMarker) {
      statusBar.textContent = '현재 위치를 확인할 수 없어 제보를 등록할 수 없습니다.';
      reportPhotoInput.value = '';
      return;
    }

    statusBar.textContent = '사진을 처리하는 중...';

    try {
      // 업로드 전 리사이즈/압축 — 최대 가로/세로 1280px, JPEG 품질 80%
      const resizedBlob = await resizeImage(file, 1280, 0.8);

      pendingReportBlob = resizedBlob;
      pendingReportPos = userMarker.getPosition();
      pendingReportCategory = reportCategorySelect ? reportCategorySelect.value : 'other';

      openReportModal(resizedBlob);
      statusBar.textContent = '설명을 입력하고 등록해주세요.';
    } catch (err) {
      console.error(err);
      statusBar.textContent = '사진 처리 중 오류가 발생했습니다.';
    }

    reportPhotoInput.value = ''; // 같은 파일 다시 선택 가능하도록 초기화
  });

  reportCancelBtn.addEventListener('click', closeReportModal);

  reportSubmitBtn.addEventListener('click', async () => {
    if (!pendingReportBlob || !pendingReportPos) return;

    const description = reportDescInput.value.trim();
    reportSubmitBtn.disabled = true;

    await submitReport(
      pendingReportBlob,
      pendingReportPos.getLat(),
      pendingReportPos.getLng(),
      pendingReportCategory,
      description
    );

    reportSubmitBtn.disabled = false;
    closeReportModal();
  });
}

function openReportModal(blob) {
  reportPreviewImg.src = URL.createObjectURL(blob);
  reportDescInput.value = '';
  reportModal.classList.add('active');
}

function closeReportModal() {
  reportModal.classList.remove('active');
  pendingReportBlob = null;
  pendingReportPos = null;
}

// 이미지 리사이즈/압축: 캔버스에 다시 그려서 JPEG로 압축 → 업로드 용량 절감
function resizeImage(file, maxDimension = 1280, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      let { width, height } = img;

      if (width > height && width > maxDimension) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else if (height >= width && height > maxDimension) {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          URL.revokeObjectURL(objectUrl);
          if (blob) resolve(blob);
          else reject(new Error('이미지 압축에 실패했습니다.'));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('이미지를 불러올 수 없습니다.'));
    };

    img.src = objectUrl;
  });
}

async function submitReport(fileBlob, lat, lng, category, description) {
  statusBar.textContent = '제보를 업로드하는 중...';

  const formData = new FormData();
  formData.append('photo', fileBlob, 'report.jpg');
  formData.append('lat', lat);
  formData.append('lng', lng);
  formData.append('category', category);
  formData.append('description', description || '');

  try {
    const res = await fetch(`${API_BASE}/api/report`, {
      method: 'POST',
      body: formData,
    });

    if (!res.ok) throw new Error(`업로드 실패: ${res.status}`);

    const record = await res.json();
    statusBar.textContent = '제보가 등록되었습니다.';
    addObstacleMarker(record);
  } catch (err) {
    console.error(err);
    statusBar.textContent = '제보 업로드 중 오류가 발생했습니다.';
  }
}

// 서버에 저장된 모든 제보를 불러와 마커로 표시
async function loadObstacleReports() {
  try {
    const res = await fetch(`${API_BASE}/api/reports`);
    if (!res.ok) throw new Error(`목록 조회 실패: ${res.status}`);

    const records = await res.json();
    records.forEach(addObstacleMarker);
  } catch (err) {
    console.error(err);
    statusBar.textContent = '장애물 제보 목록을 불러오지 못했습니다.';
  }
}

const CATEGORY_LABELS = {
  curb: '턱',
  stairs: '계단',
  other: '기타 장애물',
};

const CATEGORY_COLORS = {
  curb: '#FF6B35',
  stairs: '#E63946',
  other: '#6C757D',
};

// { [id]: { marker, infowindow } }
const obstacleRecordsById = {};
// 현재 팝업이 열려있는 제보 id (한 번에 하나만 열리도록, 토글용)
let currentOpenReportId = null;

function addObstacleMarker(record) {
  const pos = new kakao.maps.LatLng(record.lat, record.lng);
  const color = CATEGORY_COLORS[record.category] || CATEGORY_COLORS.other;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">
      <circle cx="16" cy="16" r="13" fill="${color}" stroke="#ffffff" stroke-width="3"/>
    </svg>
  `;
  const markerImage = new kakao.maps.MarkerImage(
    `data:image/svg+xml;base64,${btoa(svg)}`,
    new kakao.maps.Size(32, 32)
  );

  const marker = new kakao.maps.Marker({
    position: pos,
    map,
    image: markerImage,
  });

  const descHtml = record.description
    ? `<p class="popup-desc">${escapeHtml(record.description)}</p>`
    : '';

  const infowindow = new kakao.maps.InfoWindow({
    content: `
      <div class="obstacle-popup">
        <span class="popup-label">${CATEGORY_LABELS[record.category] || '기타'}</span><br/>
        <img src="${record.photoUrl}" />
        ${descHtml}
        <button
          class="popup-delete-btn"
          onclick="window.deleteObstacleReport('${record.id}')"
        >삭제</button>
      </div>
    `,
  });

  // 마커 클릭 시 열림/닫힘 토글
  kakao.maps.event.addListener(marker, 'click', () => {
    toggleObstaclePopup(record.id);
  });

  obstacleMarkers.push(marker);
  obstacleRecordsById[record.id] = { marker, infowindow };
}

// 같은 마커를 다시 누르면 닫히고, 다른 마커를 누르면 이전 팝업은 닫고 새로 염
function toggleObstaclePopup(id) {
  const entry = obstacleRecordsById[id];
  if (!entry) return;

  if (currentOpenReportId === id) {
    entry.infowindow.close();
    currentOpenReportId = null;
    return;
  }

  if (currentOpenReportId && obstacleRecordsById[currentOpenReportId]) {
    obstacleRecordsById[currentOpenReportId].infowindow.close();
  }

  entry.infowindow.open(map, entry.marker);
  currentOpenReportId = id;
}

window.deleteObstacleReport = async function (id) {
  const entry = obstacleRecordsById[id];
  if (!entry) return;

  if (!confirm('이 제보를 삭제할까요?')) return;

  try {
    const res = await fetch(`${API_BASE}/api/delete-report?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });

    if (!res.ok) throw new Error(`삭제 실패: ${res.status}`);

    entry.infowindow.close();
    entry.marker.setMap(null);
    delete obstacleRecordsById[id];
    if (currentOpenReportId === id) currentOpenReportId = null;

    statusBar.textContent = '제보가 삭제되었습니다.';
  } catch (err) {
    console.error(err);
    statusBar.textContent = '삭제 중 오류가 발생했습니다.';
  }
};

/*
  =========================================================
  경로 안내
  =========================================================
*/
let routePolyline;

async function requestRoute(destinationPlace) {
  if (!userMarker) {
    statusBar.textContent = '현재 위치를 확인할 수 없어 경로를 계산할 수 없습니다.';
    return;
  }

  const originPos = userMarker.getPosition();
  const origin = { lat: originPos.getLat(), lng: originPos.getLng() };
  const destination = { lat: parseFloat(destinationPlace.y), lng: parseFloat(destinationPlace.x) };

  statusBar.textContent = '경로를 계산하는 중...';
  searchResultsEl.style.display = 'none';

  const result = await getAccessibleRoute(origin, destination);
  if (!result) return;

  drawRoute(result);
}

function drawRoute(result) {
  if (routePolyline) {
    routePolyline.setMap(null);
  }

  const linePath = result.path.map((p) => new kakao.maps.LatLng(p.lat, p.lng));

  routePolyline = new kakao.maps.Polyline({
    path: linePath,
    strokeWeight: 6,
    strokeColor: '#4285F4',
    strokeOpacity: 0.9,
    strokeStyle: 'solid',
    map,
  });

  const bounds = new kakao.maps.LatLngBounds();
  linePath.forEach((p) => bounds.extend(p));
  map.setBounds(bounds);

  const minutes = Math.round(result.durationSeconds / 60);
  const meters = Math.round(result.distanceMeters);

  if (result.warnings && result.warnings.length > 0) {
    const labels = result.warnings
      .map((w) => CATEGORY_LABELS[w.category] || '장애물')
      .join(', ');
    statusBar.textContent = `약 ${meters}m · ${minutes}분 — 경로 주변에 ${labels} 있음 ⚠️`;
    statusBar.classList.add('status-warning');
  } else {
    statusBar.textContent = `약 ${meters}m · ${minutes}분 — 경로에 등록된 장애물 없음`;
    statusBar.classList.remove('status-warning');
  }
}

async function getAccessibleRoute(origin, destination) {
  try {
    const res = await fetch(`${API_BASE}/api/directions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination }),
    });

    if (!res.ok) throw new Error(`API 오류: ${res.status}`);

    return await res.json();
  } catch (err) {
    statusBar.textContent = '경로 정보를 가져오는 데 실패했습니다.';
    console.error(err);
    return null;
  }
}
