const { ipcRenderer } = require('electron');

// 전역 변수
let selectedMedicineInfo = null; // 검색으로 선택된 약품 정보
let isMedicineSelected = false; // 약품 검색으로 선택했는지 여부
let selectedTimes = new Set();
let isSpecialDosage = false;
let selectedMealRelation = null;
let userModifiedDailyDose = false;

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    initializeDatePicker();

    // 기본 날짜를 오늘로 설정
    const today = new Date();
    const dateStr = `${today.getFullYear()}년${String(today.getMonth() + 1).padStart(2, '0')}월${String(today.getDate()).padStart(2, '0')}일`;
    document.getElementById('receiptDate').value = dateStr;
});

// 이벤트 리스너 설정
function setupEventListeners() {
    // 약품검색 토글 버튼
    const searchToggle = document.getElementById('medicineSearchToggle');
    const searchDropdown = document.getElementById('medicineSearchDropdown');
    const searchInput = document.getElementById('medicineSearchInput');

    searchToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        searchToggle.classList.toggle('active');
        searchDropdown.classList.toggle('active');

        if (searchDropdown.classList.contains('active')) {
            searchInput.focus();
        }
    });

    // 드롭다운 외부 클릭 시 닫기
    document.addEventListener('click', (e) => {
        if (!searchDropdown.contains(e.target) && e.target !== searchToggle) {
            searchToggle.classList.remove('active');
            searchDropdown.classList.remove('active');
        }
    });

    // 검색 입력
    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        const searchTerm = e.target.value.trim();

        if (searchTerm.length === 0) {
            displaySearchResults([]);
            return;
        }

        // 디바운스: 300ms 후에 검색
        searchTimeout = setTimeout(() => {
            performMedicineSearch(searchTerm);
        }, 300);
    });

    // 시간 버튼 클릭
    document.querySelectorAll('.time-button:not(.meal-button)').forEach(button => {
        button.addEventListener('click', () => {
            if (isSpecialDosage) return;

            const time = button.dataset.time;
            if (button.classList.contains('active')) {
                button.classList.remove('active');
                selectedTimes.delete(time);
            } else {
                button.classList.add('active');
                selectedTimes.add(time);
            }

            // 하루 복용횟수 자동 업데이트
            const activeCount = selectedTimes.size;
            document.getElementById('dailyDose').value = activeCount;
            updateTotalAmount();
            updateDosageResult();
        });
    });

    // 식사 관계 버튼 클릭
    document.querySelectorAll('.meal-button').forEach(button => {
        button.addEventListener('click', () => {
            if (isSpecialDosage) return;

            const meal = button.dataset.meal;

            if (selectedMealRelation === meal) {
                button.classList.remove('active');
                selectedMealRelation = null;
            } else {
                document.querySelectorAll('.meal-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
                selectedMealRelation = meal;
                document.getElementById('customMealRelation').value = '';
            }
            updateDosageResult();
        });
    });

    // 커스텀 식사 관계 입력
    document.getElementById('customMealRelation').addEventListener('input', (e) => {
        if (isSpecialDosage) return;

        const customValue = e.target.value.trim();
        if (customValue) {
            document.querySelectorAll('.meal-button').forEach(btn => {
                btn.classList.remove('active');
            });
            selectedMealRelation = customValue;
        } else {
            selectedMealRelation = null;
        }
        updateDosageResult();
    });

    // 특수용법 체크박스
    document.getElementById('specialDosageCheck').addEventListener('change', (e) => {
        toggleSpecialDosage(e.target.checked);
    });

    // 특수용법 입력
    document.getElementById('specialDosageInput').addEventListener('input', () => {
        if (isSpecialDosage) {
            updateDosageResult();
        }
    });

    // 1회 투여량 변경
    document.getElementById('singleDose').addEventListener('input', () => {
        updateTotalAmount();
        updateDosageResult();
    });

    // 처방일수 변경
    document.getElementById('prescriptionDays').addEventListener('input', () => {
        updateTotalAmount();
        updateDosageResult();
    });

    // 하루 복용횟수 변경
    document.getElementById('dailyDose').addEventListener('input', () => {
        userModifiedDailyDose = true;
        updateTotalAmount();
        updateDosageResult();
    });

    // 단위 변경
    document.getElementById('medicineUnit').addEventListener('input', () => {
        const unit = document.getElementById('medicineUnit').value || '정';
        document.getElementById('totalAmountUnit').textContent = unit;
        updateDosageResult();
    });

    // 출력 버튼
    document.getElementById('printButton').addEventListener('click', async () => {
        await printLabel();
    });

    // 취소 버튼
    document.getElementById('cancelButton').addEventListener('click', () => {
        window.close();
    });
}

// 약품 검색
async function performMedicineSearch(searchTerm) {
    try {
        const result = await ipcRenderer.invoke('search-all-medicines', searchTerm);

        if (result.success && result.medicines) {
            displaySearchResults(result.medicines);
        } else {
            displaySearchResults([]);
        }
    } catch (error) {
        console.error('약품 검색 오류:', error);
        displaySearchResults([]);
    }
}

// 검색 결과 표시
function displaySearchResults(medicines) {
    const resultsContainer = document.getElementById('medicineSearchResults');

    if (medicines.length === 0) {
        resultsContainer.innerHTML = '<div class="medicine-search-empty">검색 결과가 없습니다</div>';
        return;
    }

    resultsContainer.innerHTML = medicines.map(medicine => `
        <div class="medicine-search-item" data-bohcode="${medicine.bohcode || ''}" data-yakjung="${medicine.yakjung_code || ''}">
            ${medicine.drug_name || '약품명 없음'}
        </div>
    `).join('');

    // 검색 결과 클릭 이벤트
    resultsContainer.querySelectorAll('.medicine-search-item').forEach(item => {
        item.addEventListener('click', async () => {
            const bohcode = item.dataset.bohcode;
            const yakjungCode = item.dataset.yakjung;

            // 약품 정보 가져오기
            await selectMedicineAndFill(bohcode || yakjungCode);

            // 드롭다운 닫기
            document.getElementById('medicineSearchToggle').classList.remove('active');
            document.getElementById('medicineSearchDropdown').classList.remove('active');
        });
    });
}

// 약품 선택 및 필드 채우기
async function selectMedicineAndFill(medicineCode) {
    try {
        // DB에서 약품 정보 조회
        const result = await ipcRenderer.invoke('get-medicine-detail', medicineCode);

        if (!result.success || !result.medicine) {
            console.error('약품 정보를 가져올 수 없습니다');
            return;
        }

        selectedMedicineInfo = result.medicine;
        isMedicineSelected = true; // 약품 선택됨

        // 약품명 입력
        document.getElementById('medicineName').value = selectedMedicineInfo.drug_name || '';

        // 약품유형 입력 (cls_code 사용, 없으면 빈칸)
        document.getElementById('medicineType').value = selectedMedicineInfo.cls_code || '';

        // 단위 입력
        document.getElementById('medicineUnit').value = selectedMedicineInfo.unit || '정';
        document.getElementById('totalAmountUnit').textContent = selectedMedicineInfo.unit || '정';

        // 자동출력 체크박스 설정
        const autoPrintCheck = document.getElementById('autoPrintCheck');
        if (autoPrintCheck && selectedMedicineInfo) {
            autoPrintCheck.checked = selectedMedicineInfo.autoPrint === 1;
        }

        // 체크박스 표시
        showCheckboxes();

        // 검색 입력창 초기화
        document.getElementById('medicineSearchInput').value = '';

        updateDosageResult();
    } catch (error) {
        console.error('약품 정보 조회 오류:', error);
    }
}

// 체크박스 표시
function showCheckboxes() {
    document.getElementById('medicineNameCheckboxContainer').classList.remove('hidden');
    document.getElementById('medicineTypeCheckboxContainer').classList.remove('hidden');
    document.getElementById('medicineUnitCheckboxContainer').classList.remove('hidden');
    document.getElementById('customUsageCheckboxContainer').classList.remove('hidden');
    document.getElementById('autoPrintCheckboxContainer').classList.remove('hidden');
}

// 체크박스 숨김
function hideCheckboxes() {
    document.getElementById('medicineNameCheckboxContainer').classList.add('hidden');
    document.getElementById('medicineTypeCheckboxContainer').classList.add('hidden');
    document.getElementById('medicineUnitCheckboxContainer').classList.add('hidden');
    document.getElementById('customUsageCheckboxContainer').classList.add('hidden');
    document.getElementById('autoPrintCheckboxContainer').classList.add('hidden');
}

// 총량 계산
function updateTotalAmount() {
    const prescriptionDays = parseInt(document.getElementById('prescriptionDays').value) || 0;
    const singleDose = parseFloat(document.getElementById('singleDose').value) || 0;
    const dailyDose = parseInt(document.getElementById('dailyDose').value) || 0;

    if (prescriptionDays && singleDose && dailyDose) {
        const total = prescriptionDays * singleDose * dailyDose;
        document.getElementById('totalAmount').value = total;
    }
}

// 특수용법 토글
function toggleSpecialDosage(enabled) {
    isSpecialDosage = enabled;
    const specialInput = document.getElementById('specialDosageInput');
    const timeButtons = document.querySelectorAll('.time-button:not(.meal-button)');
    const mealButtons = document.querySelectorAll('.meal-button');
    const customMealInput = document.getElementById('customMealRelation');

    if (enabled) {
        specialInput.disabled = false;
        timeButtons.forEach(btn => {
            btn.classList.add('disabled');
            btn.classList.remove('active');
        });
        mealButtons.forEach(btn => {
            btn.classList.add('disabled');
            btn.classList.remove('active');
        });
        customMealInput.disabled = true;
        customMealInput.value = '';
        selectedTimes.clear();
        selectedMealRelation = null;
    } else {
        specialInput.disabled = true;
        specialInput.value = '';
        timeButtons.forEach(btn => {
            btn.classList.remove('disabled');
        });
        mealButtons.forEach(btn => {
            btn.classList.remove('disabled');
        });
        customMealInput.disabled = false;
    }

    updateDosageResult();
}

// 용법 결과 업데이트
function updateDosageResult() {
    const resultElement = document.getElementById('dosageResult');
    const singleDose = document.getElementById('singleDose').value || '';
    const unit = document.getElementById('medicineUnit').value || '정';

    let dosageText = '';

    if (isSpecialDosage) {
        let specialText = document.getElementById('specialDosageInput').value.trim();
        if (specialText) {
            const doseWithUnit = `${singleDose}${unit}`;
            dosageText = specialText.replace(/\$x/g, doseWithUnit);
        } else {
            dosageText = '-';
        }
    } else {
        if (selectedTimes.size > 0) {
            const timeMap = {
                'morning': '아침',
                'lunch': '점심',
                'evening': '저녁',
                'bedtime': '취침전'
            };

            const timesArray = ['morning', 'lunch', 'evening', 'bedtime']
                .filter(time => selectedTimes.has(time))
                .map(time => timeMap[time]);

            let baseDosage = '';
            if (timesArray.length === 1) {
                baseDosage = `하루 1번`;
            } else {
                baseDosage = `하루 ${timesArray.length}번`;
            }

            if (timesArray.length === 1) {
                dosageText = `${baseDosage} ${timesArray[0]}`;
            } else {
                dosageText = `${baseDosage} ${timesArray.join(',')}`;
            }

            if (selectedMealRelation) {
                dosageText += ` ${selectedMealRelation}`;
            }

            dosageText += ` ${singleDose}${unit}씩`;

        } else if (selectedMealRelation) {
            dosageText = `${selectedMealRelation} ${singleDose}${unit}씩`;
        } else {
            const dailyDose = document.getElementById('dailyDose').value;
            if (dailyDose && singleDose) {
                dosageText = `하루 ${dailyDose}번 ${singleDose}${unit}씩`;
                if (selectedMealRelation) {
                    dosageText = `하루 ${dailyDose}번 ${selectedMealRelation} ${singleDose}${unit}씩`;
                }
            } else {
                dosageText = '-';
            }
        }
    }

    resultElement.textContent = dosageText;
}

// 라벨 출력
async function printLabel() {
    const dosageText = document.getElementById('dosageResult').textContent;
    const patientName = document.getElementById('patientName').value.trim();
    const medicineName = document.getElementById('medicineName').value.trim();

    if (!patientName) {
        alert('환자명을 입력해주세요.');
        return;
    }

    if (!medicineName) {
        alert('약품명을 입력해주세요.');
        return;
    }

    if (dosageText === '-') {
        alert('복용법을 입력해주세요.');
        return;
    }

    const medicineNameValue = document.getElementById('medicineName').value;
    const medicineTypeValue = document.getElementById('medicineType').value;
    const medicineUnitValue = document.getElementById('medicineUnit').value;
    const shouldUpdateMedicineName = document.getElementById('updateMedicineName').checked;
    const shouldUpdateMedicineType = document.getElementById('updateMedicineType').checked;
    const shouldUpdateUnit = document.getElementById('updateMedicineUnit').checked;

    const shouldSaveCustomUsage = document.getElementById('saveCustomUsageCheck').checked;
    const specialDosageInput = document.getElementById('specialDosageInput').value.trim();
    const customUsageValue = (isSpecialDosage && shouldSaveCustomUsage && specialDosageInput) ? specialDosageInput : null;

    // 자동출력 체크
    const autoPrintCheckbox = document.getElementById('autoPrintCheck');
    const autoPrintValue = autoPrintCheckbox ? autoPrintCheckbox.checked : false;
    const shouldUpdateAutoPrint = selectedMedicineInfo && (autoPrintValue !== (selectedMedicineInfo.autoPrint === 1));

    const printData = {
        patientName: document.getElementById('patientName').value,
        name: medicineNameValue,
        receiptDate: document.getElementById('receiptDate').value,
        prescriptionDays: document.getElementById('prescriptionDays').value,
        singleDose: document.getElementById('singleDose').value,
        dailyDose: document.getElementById('dailyDose').value,
        totalAmount: document.getElementById('totalAmount').value,
        unit: medicineUnitValue,
        medicineInfo: selectedMedicineInfo || {
            drug_name: medicineNameValue,
            cls_code: medicineTypeValue,
            unit: medicineUnitValue
        },
        dosageText: dosageText,
        medicineType: medicineTypeValue,
        updateMedicineType: shouldUpdateMedicineType,
        updateMedicineName: shouldUpdateMedicineName,
        updateUnit: shouldUpdateUnit,
        saveCustomUsage: shouldSaveCustomUsage && customUsageValue !== null,
        customUsage: customUsageValue,
        updateAutoPrint: shouldUpdateAutoPrint,
        autoPrint: autoPrintValue,
        medicineCode: selectedMedicineInfo?.bohcode || selectedMedicineInfo?.yakjung_code || null
    };

    // Fire-and-forget: 메인 프로세스에 출력 요청을 보내고 바로 창 닫기
    // 인쇄는 백그라운드에서 처리됨
    ipcRenderer.invoke('print-from-editor', printData).catch(error => {
        console.error('Print error:', error);
        // 에러는 로그만 남기고 사용자에게는 알리지 않음 (이미 창이 닫힌 후일 수 있음)
    });

    // 즉시 창 닫기 (인쇄 완료를 기다리지 않음)
    window.close();
}

// 날짜 선택기 초기화
function initializeDatePicker() {
    flatpickr("#receiptDate", {
        locale: "ko",
        dateFormat: "Y년m월d일",
        altInput: true,
        altFormat: "Y년 m월 d일",
        defaultDate: new Date(),
        disableMobile: true
    });
}
