// Electron preload API를 통해 접근
const { ipcRenderer } = require('electron');

// DOM 요소
const medicineList = document.getElementById('medicine-list');
const medicineDetail = document.getElementById('medicine-detail');
const medicineCount = document.getElementById('medicine-count');
const refreshListBtn = document.getElementById('refresh-list-btn');
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const showIncompleteBtn = document.getElementById('show-incomplete-btn');

let medicines = [];
let selectedMedicine = null;
let isSearchMode = false; // 검색 모드인지 미완성 목록 모드인지

/**
 * 토스트 메시지 표시 함수
 * @param {string} message - 표시할 메시지
 * @param {string} type - 'success', 'error', 'info' 중 하나
 */
function showToast(message, type = 'info') {
    // 기존 토스트가 있으면 제거
    const existingToast = document.getElementById('toast-message');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'toast-message';
    toast.style.cssText = `
        position: fixed;
        bottom: 20px;
        right: 20px;
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        max-width: 350px;
        font-size: 14px;
    `;

    // 타입별 스타일 설정
    switch(type) {
        case 'success':
            toast.style.backgroundColor = '#4CAF50';
            toast.style.color = 'white';
            break;
        case 'error':
            toast.style.backgroundColor = '#f44336';
            toast.style.color = 'white';
            break;
        default:
            toast.style.backgroundColor = '#2196F3';
            toast.style.color = 'white';
    }

    toast.textContent = message;
    document.body.appendChild(toast);

    // 3초 후 자동 제거
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => {
            toast.remove();
        }, 300);
    }, 3000);
}

// CSS 애니메이션 추가
if (!document.getElementById('toast-styles')) {
    const style = document.createElement('style');
    style.id = 'toast-styles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(100%);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(100%);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// 초기화
async function init() {
    // URL에서 medicineCode 파라미터 확인
    const urlParams = new URLSearchParams(window.location.search);
    const preSelectedMedicineCode = urlParams.get('medicineCode');

    await loadMedicines();

    // 이벤트 리스너
    refreshListBtn.addEventListener('click', loadMedicines);
    searchBtn.addEventListener('click', performSearch);
    showIncompleteBtn.addEventListener('click', showIncompleteMedicines);

    // Enter 키로 검색
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // 선택된 약품 코드가 있으면 자동 검색 및 선택
    if (preSelectedMedicineCode) {
        await searchAndSelectMedicine(preSelectedMedicineCode);
    }
}

/**
 * 약품 검색 및 자동 선택
 * @param {string} medicineCode - 검색할 약품 코드 (bohcode)
 */
async function searchAndSelectMedicine(medicineCode) {
    try {
        // 검색어 입력란에 코드 표시
        searchInput.value = medicineCode;

        // 약품 검색 (bohcode로 검색)
        const result = await ipcRenderer.invoke('search-all-medicines', medicineCode);

        if (result.success && result.medicines.length > 0) {
            medicines = result.medicines;
            isSearchMode = true;
            renderMedicineList();

            // 첫 번째 결과 자동 선택
            selectMedicine(0);

            showToast(`약품 "${medicineCode}"를 찾았습니다.`, 'success');
        } else {
            showToast(`약품 "${medicineCode}"를 찾을 수 없습니다.`, 'error');
        }
    } catch (error) {
        console.error('자동 검색 실패:', error);
        showToast('약품 검색 중 오류가 발생했습니다.', 'error');
    }
}

/**
 * 검색 수행
 */
async function performSearch() {
    const keyword = searchInput.value.trim();
    if (!keyword) {
        showToast('검색어를 입력하세요', 'info');
        return;
    }

    try {
        const result = await ipcRenderer.invoke('search-all-medicines', keyword);

        if (result.success) {
            medicines = result.medicines;
            isSearchMode = true;
            renderMedicineList();
        } else {
            console.error('Failed to search medicines:', result.error);
            medicineList.innerHTML = '<div class="no-data">검색 중 오류가 발생했습니다</div>';
        }
    } catch (error) {
        console.error('Error searching medicines:', error);
        medicineList.innerHTML = '<div class="no-data">검색 중 오류가 발생했습니다</div>';
    }
}

/**
 * 미완성 약품 목록 보기
 */
async function showIncompleteMedicines() {
    searchInput.value = ''; // 검색어 초기화
    isSearchMode = false;
    await loadMedicines();
}

/**
 * api_fetched = 0인 약품 목록 로드
 */
async function loadMedicines() {
    try {
        const result = await ipcRenderer.invoke('get-incomplete-medicines');

        if (result.success) {
            medicines = result.medicines;
            isSearchMode = false;
            renderMedicineList();
        } else {
            console.error('Failed to load medicines:', result.error);
            medicineList.innerHTML = '<div class="no-data">약품 목록을 불러오는 데 실패했습니다</div>';
        }
    } catch (error) {
        console.error('Error loading medicines:', error);
        medicineList.innerHTML = '<div class="no-data">오류가 발생했습니다</div>';
    }
}

/**
 * 약품 목록 렌더링
 */
function renderMedicineList() {
    const listTitle = isSearchMode ? '검색 결과' : '약품 정보 미완성 약품 목록';
    document.querySelector('.medicine-list-section h2').textContent = listTitle;

    medicineCount.textContent = `총 ${medicines.length}개`;

    if (medicines.length === 0) {
        const message = isSearchMode ? '검색 결과가 없습니다' : '약품 정보 미완성 약품이 없습니다';
        medicineList.innerHTML = `<div class="no-data">${message}</div>`;
        return;
    }

    medicineList.innerHTML = medicines.map((medicine, index) => {
        const isComplete = medicine.api_fetched === 1;
        const statusClass = isComplete ? 'status-complete' : 'status-incomplete';
        const statusText = isComplete ? '정보 완성' : '정보 미완성';

        return `
            <div class="medicine-item" data-index="${index}">
                <div>
                    <div class="medicine-name">${medicine.drug_name || '정보없음'}</div>
                    <div class="medicine-code">
                        ${medicine.bohcode ? `보험코드: ${medicine.bohcode}` : '보험코드 없음'}
                    </div>
                </div>
                <div class="medicine-status ${statusClass}">${statusText}</div>
            </div>
        `;
    }).join('');

    // 클릭 이벤트 추가
    const items = medicineList.querySelectorAll('.medicine-item');
    items.forEach(item => {
        item.addEventListener('click', () => {
            const index = parseInt(item.dataset.index);
            selectMedicine(index);
        });
    });
}

/**
 * 약품 선택
 */
function selectMedicine(index) {
    selectedMedicine = medicines[index];

    // 선택 상태 UI 업데이트
    const items = medicineList.querySelectorAll('.medicine-item');
    items.forEach((item, i) => {
        if (i === index) {
            item.classList.add('selected');
        } else {
            item.classList.remove('selected');
        }
    });

    // 상세 정보 표시
    renderMedicineDetail(selectedMedicine);
}

/**
 * 약품 상세 정보 렌더링
 */
function renderMedicineDetail(medicine) {
    medicineDetail.innerHTML = `
        <div class="form-group">
            <label>약학정보원 코드 (yakjung_code):</label>
            <input type="text" value="${medicine.yakjung_code}" readonly>
        </div>

        <div class="form-group">
            <label>보험코드 (bohcode):</label>
            <input type="text" value="${medicine.bohcode || '없음'}" readonly>
        </div>

        <div class="form-group">
            <label>약품명 (drug_name):</label>
            <input type="text" id="edit-drug-name" value="${medicine.drug_name || ''}">
        </div>

        <div class="form-group">
            <label>제형 (drug_form):</label>
            <input type="text" id="edit-drug-form" value="${medicine.drug_form || ''}">
            <small style="color: #666; font-size: 12px;">예: 정제, 캡슐제, 시럽제, 주사제</small>
        </div>

        <div class="form-group">
            <label>투여경로 (dosage_route):</label>
            <input type="text" id="edit-dosage-route" value="${medicine.dosage_route || ''}">
            <small style="color: #666; font-size: 12px;">예: 경구, 주사, 외용</small>
        </div>

        <div class="form-group">
            <label>약효분류 (cls_code):</label>
            <input type="text" id="edit-cls-code" value="${medicine.cls_code || ''}">
            <small style="color: #666; font-size: 12px;">예: 해열진통소염제, 소화기관용약</small>
        </div>

        <div class="form-group">
            <label>제조사 (upso_name):</label>
            <input type="text" id="edit-upso-name" value="${medicine.upso_name || ''}">
        </div>

        <div class="form-group">
            <label>의약품목 (medititle):</label>
            <input type="text" id="edit-medititle" value="${medicine.medititle || ''}">
        </div>

        <div class="form-group">
            <label>보관온도 (temperature):</label>
            <input type="text" id="edit-temperature" value="${medicine.temperature || ''}">
            <small style="color: #666; font-size: 12px;">예: 실온, 냉장보관(2-8℃)</small>
        </div>

        <div class="form-group">
            <label>단위 (unit):</label>
            <input type="text" id="edit-unit" value="${medicine.unit || ''}">
            <small style="color: #666; font-size: 12px;">예: 정, 캡슐, ml, 포</small>
        </div>

        <div class="form-group">
            <label>사용자 정의 용법 (custom_usage):</label>
            <textarea id="edit-custom-usage">${medicine.custom_usage || ''}</textarea>
            <small style="color: #666; font-size: 12px;">선택사항: 특별한 복용 방법이 있다면 입력</small>
        </div>

        <div class="form-group">
            <label>용법 우선순위 (usage_priority):</label>
            <input type="text" id="edit-usage-priority" value="${medicine.usage_priority || '1324'}" maxlength="4">
            <small style="color: #666; font-size: 12px;">4자리 숫자로 복용 시간 우선순위 (예: 1324 = 아침/점심/저녁/취침 전)</small>
        </div>

        <div class="detail-buttons">
            <button class="btn btn-primary" id="search-medicine-btn">약품 검색으로 정보 찾기</button>
            <button class="btn btn-success" id="save-medicine-btn">저장</button>
        </div>
    `;

    // 버튼 이벤트 리스너
    document.getElementById('save-medicine-btn').addEventListener('click', saveMedicine);
    document.getElementById('search-medicine-btn').addEventListener('click', searchMedicine);
}

/**
 * 약품 정보 저장
 */
async function saveMedicine() {
    if (!selectedMedicine) return;

    const updatedData = {
        yakjung_code: selectedMedicine.yakjung_code,
        drug_name: document.getElementById('edit-drug-name').value.trim(),
        drug_form: document.getElementById('edit-drug-form').value.trim(),
        dosage_route: document.getElementById('edit-dosage-route').value.trim(),
        cls_code: document.getElementById('edit-cls-code').value.trim(),
        upso_name: document.getElementById('edit-upso-name').value.trim(),
        medititle: document.getElementById('edit-medititle').value.trim(),
        temperature: document.getElementById('edit-temperature').value.trim(),
        unit: document.getElementById('edit-unit').value.trim(),
        custom_usage: document.getElementById('edit-custom-usage').value.trim() || null,
        usage_priority: document.getElementById('edit-usage-priority').value.trim(),
        api_fetched: 1  // 수동으로 입력했으므로 완성으로 표시
    };

    try {
        const result = await ipcRenderer.invoke('update-medicine-info', updatedData);

        if (result.success) {
            showToast('약품 정보가 저장되었습니다!', 'success');
            // 목록 새로고침
            await loadMedicines();
            // 상세 정보 초기화
            medicineDetail.innerHTML = '<div class="detail-empty">왼쪽 목록에서 약품을 선택하세요</div>';
        } else {
            showToast('저장 실패: ' + result.error, 'error');
        }
    } catch (error) {
        console.error('Error saving medicine:', error);
        showToast('저장 중 오류가 발생했습니다', 'error');
    }
}

/**
 * 약품 검색 (약품명으로 검색하여 정보 찾기)
 */
async function searchMedicine() {
    if (!selectedMedicine) return;

    const drugName = selectedMedicine.drug_name;
    if (!drugName || drugName === '정보없음') {
        showToast('약품명이 없어서 검색할 수 없습니다', 'error');
        return;
    }

    try {
        // 약학정보원 검색 창 열기
        await ipcRenderer.invoke('open-yakjung-search', {
            drugName: drugName,
            bohcode: selectedMedicine.bohcode || '',
            yakjungCode: selectedMedicine.yakjung_code
        });

        // 검색 완료 이벤트 리스너 등록
        ipcRenderer.once('yakjung-search-complete', async () => {
            showToast('약품 정보가 업데이트되었습니다!', 'success');
            // 목록 새로고침
            await loadMedicines();
            // 상세 정보 초기화
            medicineDetail.innerHTML = '<div class="detail-empty">왼쪽 목록에서 약품을 선택하세요</div>';
        });
    } catch (error) {
        console.error('약품 검색 창 열기 실패:', error);
        showToast('약품 검색 창을 열 수 없습니다', 'error');
    }
}


// 초기화 실행
init();
