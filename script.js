/*
  =========================================================
  교통약자 이동지도 - 1단계: 카카오맵 로드 + 실시간 위치 표시
  =========================================================
  다음 단계에서 추가될 예정인 기능 (아직 미구현):
  - 장애물 사진 업로드 + 마커 표시 (백엔드 연동 필요)
  - 턱/계단 회피 경로 안내 (커스텀 라우팅 엔진 필요) → getAccessibleRoute()에서 준비 중
  - 데이터 대시보드
  =========================================================
*/

// 백엔드(Vercel) API 주소 — 저장소 B 배포 도메인
const API_BASE = "https://erica-project-back.vercel.app";

let map;
let userMarker;
let accuracyCircle;
let watchId;
let places;
let searchMarker;

const statusBar = document.getElementById('status-bar');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const searchResultsEl = document.getElementById('search-results');
const locateBtn = document.getElementById('locate-btn');

// autoload=false 로 SDK를 불러왔기 때문에 kakao.maps.load로 직접 초기화 시점을 제어
kakao.maps.load(initMap);

function initMap() {
  // 기본 중심 좌표: 위치 못 받아올 경우를 대비한 서울시청
  const defaultCenter = new kakao.maps.LatLng(37.5665, 126.978);

  map = new kakao.maps.Map(document.getElementById('map'), {
    center: defaultCenter,
    level: 4, // 카카오맵은 숫자가 작을수록 확대(줌인)
  });

  map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT);

  places = new kakao.maps.services.Places();

  setupSearch();
  setupLocateButton();
  startWatchingPosition();
}

// 실시간 위치 추적 시작
function startWatchingPosition() {
  if (!('geolocation' in navigator)) {
    statusBar.textContent = '이 브라우저는 위치 정보를 지원하지 않습니다.';
    return;
  }

  statusBar.textContent = '위치 정보를 가져오는 중...';

  watchId = navigator.geolocation.watchPosition(
    onPositionUpdate,
    onPositionError,
    {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    }
  );
}

function onPositionUpdate(position) {
  const { latitude, longitude, accuracy } = position.coords;
  const pos = new kakao.maps.LatLng(latitude, longitude);

  if (!userMarker) {
    // 최초 1회: 지도 중심을 내 위치로 이동
    map.setCenter(pos);
    map.setLevel(3);

    // 내 위치를 나타내는 파란 점 (커스텀 오버레이로 CSS 원 표시)
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

// 정확도 수치에 따라 상태바 문구/스타일을 다르게 표시
// (GPS 칩이 없는 노트북이나 실내에서는 Wi-Fi 기반 위치라 오차가 커질 수 있음)
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

// 내 위치로 이동 버튼
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

// 장소 검색 (카카오 로컬 키워드 검색)
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
    li.innerHTML = `<strong>${place.place_name}</strong><span>${place.road_address_name || place.address_name}</span>`;
    li.addEventListener('click', () => moveToPlace(place));
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
  searchMarker = new kakao.maps.Marker({
    position: pos,
    map,
  });

  statusBar.textContent = place.place_name;
  searchResultsEl.style.display = 'none';
  searchInput.value = place.place_name;
}

/*
  =========================================================
  백엔드 연동 준비: 턱/계단 회피 경로 API 호출 스텁
  =========================================================
  아직 화면에서 호출하는 곳은 없음. 다음 단계에서
  "경로 안내" 버튼/기능을 만들 때 이 함수를 연결하면 됨.
  origin/destination은 { lat, lng } 형태로 전달.
*/
async function getAccessibleRoute(origin, destination) {
  try {
    const res = await fetch(`${API_BASE}/api/directions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin, destination }),
    });

    if (!res.ok) {
      throw new Error(`API 오류: ${res.status}`);
    }

    return await res.json();
  } catch (err) {
    statusBar.textContent = '경로 정보를 가져오는 데 실패했습니다.';
    console.error(err);
    return null;
  }
}
