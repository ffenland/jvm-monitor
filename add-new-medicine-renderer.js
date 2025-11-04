const { ipcRenderer } = require('electron');

// DOM 요소
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsSection = document.getElementById('resultsSection');
const resultsBody = document.getElementById('resultsBody');
const resultCount = document.getElementById('resultCount');
const addBtn = document.getElementById('addBtn');
const closeBtn = document.getElementById('closeBtn');

// 전역 변수
let searchResults = [];
let selectedMedicine = null;

// 이벤트 리스너 설정
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        performSearch();
    }
});

addBtn.addEventListener('click', addMedicineToDb);
closeBtn.addEventListener('click', () => {
    window.close();
});

// 검색 수행
async function performSearch() {
    const searchTerm = searchInput.value.trim();

    if (!searchTerm) {
        showToast('검색어를 입력하세요', 'error');
        return;
    }

    try {
        // 로딩 상태 표시
        searchBtn.disabled = true;
        searchBtn.textContent = '검색 중...';
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="loading-state">
                    <div class="spinner"></div>
                    <div>약학정보원에서 검색 중...</div>
                </td>
            </tr>
        `;

        // 약학정보원 검색 API 호출
        const result = await ipcRenderer.invoke('search-medicine-by-name', searchTerm);

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
            selectedMedicine = null;
            addBtn.disabled = true;
            return;
        }

        // 검색 결과 저장 및 표시
        searchResults = result.medicines;
        displayResults(searchResults);
        resultCount.textContent = searchResults.length;
        showToast(`${searchResults.length}건의 검색 결과를 찾았습니다`, 'success');

    } catch (error) {
        console.error('검색 실패:', error);
        showToast('검색 중 오류가 발생했습니다', 'error');
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    검색 중 오류가 발생했습니다
                </td>
            </tr>
        `;
    } finally {
        searchBtn.disabled = false;
        searchBtn.textContent = '검색';
    }
}

// 검색 결과 표시
function displayResults(medicines) {
    resultCount.textContent = medicines.length;

    if (medicines.length === 0) {
        resultsBody.innerHTML = `
            <tr>
                <td colspan="5" class="empty-state">
                    검색 결과가 없습니다
                </td>
            </tr>
        `;
        return;
    }

    resultsBody.innerHTML = medicines.map((medicine, index) => `
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
            selectMedicine(index);
        });
    });
}

// 약품 선택
function selectMedicine(index) {
    selectedMedicine = searchResults[index];

    // 선택 표시
    resultsBody.querySelectorAll('tr').forEach((tr, i) => {
        if (i === index) {
            tr.classList.add('selected');
        } else {
            tr.classList.remove('selected');
        }
    });

    // 추가 버튼 활성화
    addBtn.disabled = false;
}

// DB에 약품 추가
async function addMedicineToDb() {
    if (!selectedMedicine) {
        showToast('약품을 선택하세요', 'error');
        return;
    }

    try {
        addBtn.disabled = true;
        addBtn.textContent = '추가 중...';

        // 약품 코드(yakjungCode)로 상세 정보를 가져와서 DB에 저장
        const result = await ipcRenderer.invoke('add-medicine-from-yakjung', selectedMedicine.yakjungCode);

        if (result.success) {
            showToast('약품이 성공적으로 추가되었습니다', 'success');

            // 메인 창에 약품 정보 업데이트 알림
            ipcRenderer.send('medicine-data-updated');

            // 선택 초기화
            selectedMedicine = null;
            addBtn.disabled = true;
            addBtn.textContent = 'DB에 추가';

            // 선택 해제
            document.querySelectorAll('.results-table tr.selected').forEach(tr => {
                tr.classList.remove('selected');
            });
        } else {
            showToast(result.error || '약품 추가에 실패했습니다', 'error');
            addBtn.disabled = false;
            addBtn.textContent = 'DB에 추가';
        }
    } catch (error) {
        console.error('약품 추가 실패:', error);
        showToast('약품 추가 중 오류가 발생했습니다', 'error');
        addBtn.disabled = false;
        addBtn.textContent = 'DB에 추가';
    }
}

// 토스트 메시지 표시
function showToast(message, type = 'info') {
    const existingToast = document.querySelector('.toast');
    if (existingToast) {
        existingToast.remove();
    }

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.remove();
    }, 3000);
}

console.log('[AddNewMedicine] 렌더러 로드 완료');
