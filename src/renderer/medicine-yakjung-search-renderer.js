const { ipcRenderer } = require('electron');

// 전역 변수
let searchResults = [];
let selectedResult = null;
let currentDrugInfo = null; // { drugName, bohcode, yakjungCode }

// DOM 요소
const drugNameInput = document.getElementById('drugNameInput');
const searchBtn = document.getElementById('searchBtn');
const resultsBody = document.getElementById('resultsBody');
const resultCount = document.getElementById('resultCount');
const selectBtn = document.getElementById('selectBtn');
const cancelBtn = document.getElementById('cancelBtn');
const currentDrugInfoDiv = document.getElementById('currentDrugInfo');

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    // URL 파라미터에서 현재 약품 정보 받기
    const params = new URLSearchParams(window.location.search);
    const drugName = params.get('drugName');
    const bohcode = params.get('bohcode');
    const yakjungCode = params.get('yakjungCode');

    if (drugName && bohcode && yakjungCode) {
        currentDrugInfo = { drugName, bohcode, yakjungCode };
        drugNameInput.value = drugName;
        currentDrugInfoDiv.innerHTML = `
            <strong>현재 약품:</strong> ${drugName} (보험코드: ${bohcode})
        `;
    }

    setupEventListeners();
});

// 이벤트 리스너 설정
function setupEventListeners() {
    // 검색 버튼
    searchBtn.addEventListener('click', performSearch);

    // Enter 키로 검색
    drugNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    });

    // 선택 버튼
    selectBtn.addEventListener('click', async () => {
        if (!selectedResult || !currentDrugInfo) return;

        await updateMedicineFromYakjung();
    });

    // 취소 버튼
    cancelBtn.addEventListener('click', () => {
        window.close();
    });
}

// 검색 수행
async function performSearch() {
    const drugName = drugNameInput.value.trim();

    if (!drugName) {
        showToast('약품명을 입력하세요', 'error');
        return;
    }

    try {
        // 로딩 상태 표시
        searchBtn.disabled = true;
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-state">
                    <div class="spinner"></div>
                    <div>약학정보원에서 검색 중...</div>
                </td>
            </tr>
        `;

        // 약학정보원 검색 API 호출
        const result = await ipcRenderer.invoke('search-medicine-by-name', drugName);

        if (!result.success || !result.medicines || result.medicines.length === 0) {
            resultsBody.innerHTML = `
                <tr>
                    <td colspan="5" class="empty-state">
                        검색 결과가 없습니다
                    </td>
                </tr>
            `;
            resultCount.textContent = '0';
            searchResults = [];
            return;
        }

        // 검색 결과 저장 및 표시
        searchResults = result.medicines;
        displayResults(searchResults);
        showToast(`${searchResults.length}건의 검색 결과를 찾았습니다`, 'success');

    } catch (error) {
        console.error('검색 오류:', error);
        showToast('검색 중 오류가 발생했습니다', 'error');
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    오류가 발생했습니다: ${error.message}
                </td>
            </tr>
        `;
    } finally {
        searchBtn.disabled = false;
    }
}

// 검색 결과 표시
function displayResults(results) {
    resultCount.textContent = results.length;

    if (results.length === 0) {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    검색 결과가 없습니다
                </td>
            </tr>
        `;
        return;
    }

    resultsBody.innerHTML = results.map((medicine, index) => `
        <tr data-index="${index}" data-yakjung-code="${medicine.yakjungCode || ''}">
            <td class="col-image">
                ${medicine.imageUrl ? `<img src="${medicine.imageUrl}" class="drug-image" alt="약품 이미지" />` : '-'}
            </td>
            <td class="col-name">${medicine.name || '-'}</td>
            <td class="col-company">${medicine.company || '-'}</td>
            <td class="col-form">${medicine.formulation || '-'}</td>
            <td class="col-type">${medicine.classification || '-'}</td>
        </tr>
    `).join('');

    // 행 클릭 이벤트
    resultsBody.querySelectorAll('tr').forEach(tr => {
        tr.addEventListener('click', () => {
            const index = parseInt(tr.dataset.index);
            selectResult(index);
        });
    });
}

// 결과 선택
function selectResult(index) {
    selectedResult = searchResults[index];

    // 선택 표시
    resultsBody.querySelectorAll('tr').forEach((tr, i) => {
        if (i === index) {
            tr.classList.add('selected');
        } else {
            tr.classList.remove('selected');
        }
    });

    // 선택 버튼 활성화
    selectBtn.disabled = false;
}

// 선택한 약품으로 DB 업데이트
async function updateMedicineFromYakjung() {
    if (!selectedResult || !currentDrugInfo) return;

    try {
        selectBtn.disabled = true;
        selectBtn.textContent = '업데이트 중...';

        const newYakjungCode = selectedResult.yakjungCode;
        const oldYakjungCode = currentDrugInfo.yakjungCode;

        // DB 업데이트 (기존 IPC 핸들러 사용)
        const result = await ipcRenderer.invoke(
            'fetch-medicine-detail-from-yakjungwon',
            oldYakjungCode,
            newYakjungCode
        );

        if (result.success) {
            showToast('약품 정보가 성공적으로 업데이트되었습니다!', 'success');

            // 부모 창(약품설정)과 메인 창에 알림
            ipcRenderer.send('yakjung-search-complete');

            // 1초 후 창 닫기
            setTimeout(() => {
                window.close();
            }, 1000);
        } else {
            throw new Error(result.error || '업데이트 실패');
        }

    } catch (error) {
        console.error('업데이트 오류:', error);
        showToast('업데이트 중 오류가 발생했습니다: ' + error.message, 'error');
        selectBtn.disabled = false;
        selectBtn.textContent = '선택한 약품으로 업데이트';
    }
}

// Toast 메시지 표시
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}
