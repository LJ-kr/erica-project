/*
  =========================================================
  교통약자 이동지도 - 2단계: 장애물 사진 업로드 + 마커 표시 추가
  =========================================================
  다음 단계에서 추가될 예정인 기능 (아직 미구현):
  - 턱/계단 회피 경로 안내 (커스텀 라우팅 엔진 필요) → getAccessibleRoute()에서 준비 중
  - 데이터 대시보드
  =========================================================
*/

const API_BASE = "https://erica-project-back.vercel.app";

let map;
let userMarker;
let accuracyCircle;
let watchId;
let places;
let searchMarker;
let obstacleMarkers = []; // 장애물 마커 목록 (다시 그릴 때 정리용)

const statusBar = document.getElementById('status-bar');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResultsEl = document.getElementById('search-results');
const locateBtn = document.getElementById('locate-btn');

// 아래 4개는 새로 추가되는 UI 요소 — HTML에 대응하는 엘리먼트 필요 (안내 참고)
const reportBtn = document.getElementById('report-btn');
const reportPhotoInput = document.getElementById('report-photo-input');
const reportCategorySelect = document.getElementById('report-category-select');
const reportModal = document.getElementById('report-modal');

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
          <strong>${place.place_name}</strong>
          <span>${place.road_address_name || place.address_name}</span>
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
// 장애물 사진 업로드 (신규)
// ---------------------------------------------------------
function setupReportUpload() {
  if (!reportBtn) return; // 아직 HTML에 버튼 없으면 조용히 스킵

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

    const pos = userMarker.getPosition();
    const category = reportCategorySelect ? reportCategorySelect.value : 'other';

    await submitReport(file, pos.getLat(), pos.getLng(), category);
    reportPhotoInput.value = ''; // 같은 파일 다시 선택 가능하도록 초기화
  });
}

async function submitReport(file, lat, lng, category) {
  statusBar.textContent = '제보를 업로드하는 중...';

  const formData = new FormData();
  formData.append('photo', file);
  formData.append('lat', lat);
  formData.append('lng', lng);
  formData.append('category', category);

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
    // 목록 조회 실패는 지도 사용 자체를 막을 정도는 아니므로 상태바만 조용히 남김
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

// { [id]: { marker, infowindow } } — 삭제 시 지도에서 즉시 제거하기 위해 보관
const obstacleRecordsById = {};

function addObstacleMarker(record) {
  const pos = new kakao.maps.LatLng(record.lat, record.lng);
  const color = CATEGORY_COLORS[record.category] || CATEGORY_COLORS.other;

  // 외부 이미지 파일 없이도 항상 뜨도록 SVG를 데이터 URI로 직접 생성
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

  const infowindow = new kakao.maps.InfoWindow({
    content: `
      <div class="obstacle-popup">
        <span class="popup-label">${CATEGORY_LABELS[record.category] || '기타'}</span><br/>
        <img src="${record.photoUrl}" />
        <button
          class="popup-delete-btn"
          onclick="window.deleteObstacleReport('${record.id}')"
        >삭제</button>
      </div>
    `,
  });

  kakao.maps.event.addListener(marker, 'click', () => {
    infowindow.open(map, marker);
  });

  obstacleMarkers.push(marker);
  obstacleRecordsById[record.id] = { marker, infowindow };
}

// InfoWindow 안의 inline onclick에서 호출되므로 전역(window)에 노출
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

    statusBar.textContent = '제보가 삭제되었습니다.';
  } catch (err) {
    console.error(err);
    statusBar.textContent = '삭제 중 오류가 발생했습니다.';
  }
};

/*
  =========================================================
  경로 안내 (신규)
  =========================================================
  - 현재 위치(userMarker) → 검색해서 고른 장소까지 도보 경로 요청
  - 백엔드(/api/directions)가 OSRM으로 기본 경로를 계산하고,
    그 경로 근처 장애물 제보를 같이 찾아서 반환함
  - 아직 "장애물을 피해가는 경로"는 아니고, 경로 위 장애물을
    경고로 보여주는 수준 (다음 단계에서 실제 회피 로직 추가 예정)
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
  if (!result) return; // getAccessibleRoute 내부에서 이미 상태바 메시지 처리함

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

  // 경로 전체가 보이도록 지도 범위 조정
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
