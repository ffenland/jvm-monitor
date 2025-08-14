const { ipcRenderer } = require('electron');

// 전역 변수
let prescriptionData = null;
let medicineInfo = null;
let selectedTimes = new Set();
let isSpecialDosage = false;
let selectedMealRelation = null; // 선택된 식사 관계

// 페이지 로드 시 초기화
document.addEventListener('DOMContentLoaded', async () => {
    // URL 파라미터에서 데이터 받기
    const params = new URLSearchParams(window.location.search);
    const dataStr = params.get('data');
    
    if (dataStr) {
        try {
            const data = JSON.parse(decodeURIComponent(dataStr));
            prescriptionData = data.prescription;
            medicineInfo = data.medicineInfo;
            
            // 화면에 정보 표시
            displayInfo();
            
            // 초기 용법 설정
            initializeDosage();
            
            // 이벤트 리스너 설정
            setupEventListeners();
            
            // Flatpickr 날짜 선택기 초기화
            initializeDatePicker();
        } catch (error) {
            console.error('Error parsing data:', error);
        }
    }
});

// 정보 표시
function displayInfo() {
    // input 필드에 값 설정
    document.getElementById('patientName').value = prescriptionData.patientName || '';
    // receiptDate는 Flatpickr가 처리하므로 여기서는 설정하지 않음
    document.getElementById('medicineName').value = medicineInfo?.title || prescriptionData.name || '';
    document.getElementById('medicineType').value = 
        medicineInfo?.mdfsCodeName || medicineInfo?.type || '먹는약';
    
    // 처방일수와 1회 투여량은 숫자만 표시
    document.getElementById('prescriptionDays').value = prescriptionData.prescriptionDays || '';
    document.getElementById('singleDose').value = prescriptionData.singleDose || '';
}

// 초기 용법 설정
function initializeDosage() {
    const dailyDose = parseInt(prescriptionData.dailyDose) || 1;
    
    // dailyDose에 따라 초기 시간 선택
    const timeButtons = document.querySelectorAll('.time-button');
    timeButtons.forEach(btn => btn.classList.remove('active'));
    selectedTimes.clear();
    
    switch(dailyDose) {
        case 1:
            selectTime('morning');
            break;
        case 2:
            selectTime('morning');
            selectTime('evening');
            break;
        case 3:
            selectTime('morning');
            selectTime('lunch');
            selectTime('evening');
            break;
        case 4:
            selectTime('morning');
            selectTime('lunch');
            selectTime('evening');
            selectTime('bedtime');
            break;
        default:
            // 5회 이상인 경우 특수용법
            document.getElementById('specialDosageCheck').checked = true;
            toggleSpecialDosage(true);
            document.getElementById('specialDosageInput').value = `하루 ${dailyDose}번`;
    }
    
    updateDosageResult();
}

// 시간 선택
function selectTime(time) {
    const button = document.querySelector(`.time-button[data-time="${time}"]`);
    if (button && !button.classList.contains('disabled')) {
        button.classList.add('active');
        selectedTimes.add(time);
    }
}

// 이벤트 리스너 설정
function setupEventListeners() {
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
            updateDosageResult();
        });
    });
    
    // 식사 관계 버튼 클릭
    document.querySelectorAll('.meal-button').forEach(button => {
        button.addEventListener('click', () => {
            if (isSpecialDosage) return;
            
            const meal = button.dataset.meal;
            
            // 이미 선택된 버튼을 다시 클릭하면 선택 해제
            if (selectedMealRelation === meal) {
                button.classList.remove('active');
                selectedMealRelation = null;
            } else {
                // 다른 버튼 선택 시 기존 선택 해제
                document.querySelectorAll('.meal-button').forEach(btn => {
                    btn.classList.remove('active');
                });
                button.classList.add('active');
                selectedMealRelation = meal;
                // 커스텀 입력 초기화
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
            // 입력 시 모든 버튼 선택 해제
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
    
    // 1회 투여량 변경 시 용법 업데이트
    document.getElementById('singleDose').addEventListener('input', () => {
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

// 특수용법 토글
function toggleSpecialDosage(enabled) {
    isSpecialDosage = enabled;
    const specialInput = document.getElementById('specialDosageInput');
    const timeButtons = document.querySelectorAll('.time-button:not(.meal-button)');
    const mealButtons = document.querySelectorAll('.meal-button');
    const customMealInput = document.getElementById('customMealRelation');
    
    if (enabled) {
        // 특수용법 활성화
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
        // 일반 용법 활성화
        specialInput.disabled = true;
        specialInput.value = '';
        timeButtons.forEach(btn => {
            btn.classList.remove('disabled');
        });
        mealButtons.forEach(btn => {
            btn.classList.remove('disabled');
        });
        customMealInput.disabled = false;
        // 초기 용법 다시 설정
        initializeDosage();
    }
    
    updateDosageResult();
}

// 용법 결과 업데이트
function updateDosageResult() {
    const resultElement = document.getElementById('dosageResult');
    const singleDose = document.getElementById('singleDose').value || prescriptionData.singleDose;
    const unit = medicineInfo?.unit || '정';
    
    let dosageText = '';
    
    if (isSpecialDosage) {
        // 특수용법
        let specialText = document.getElementById('specialDosageInput').value.trim();
        if (specialText) {
            // $x를 실제 복용량으로 치환
            const doseWithUnit = `${singleDose}${unit}`;
            dosageText = specialText.replace(/\$x/g, doseWithUnit);
        } else {
            dosageText = '-';
        }
    } else {
        // 일반 용법
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
            
            // 하루 N번
            let baseDosage = '';
            if (timesArray.length === 1) {
                baseDosage = `하루 1번`;
            } else {
                baseDosage = `하루 ${timesArray.length}번`;
            }
            
            // 순서: 하루 N번 + 시간 + 식사관계 + 복용량
            // 예: "하루 2번 아침,저녁 식후 1정씩"
            if (timesArray.length === 1) {
                dosageText = `${baseDosage} ${timesArray[0]}`;
            } else {
                dosageText = `${baseDosage} ${timesArray.join(',')}`;
            }
            
            // 식사 관계 추가
            if (selectedMealRelation) {
                dosageText += ` ${selectedMealRelation}`;
            }
            
            // 복용량 추가
            dosageText += ` ${singleDose}${unit}씩`;
            
        } else if (selectedMealRelation) {
            // 시간은 선택하지 않고 식사 관계만 선택한 경우
            dosageText = `${selectedMealRelation} ${singleDose}${unit}씩`;
        } else {
            dosageText = '-';
        }
    }
    
    resultElement.textContent = dosageText;
}

// 라벨 출력
async function printLabel() {
    const dosageText = document.getElementById('dosageResult').textContent;
    
    if (dosageText === '-') {
        alert('용법을 선택해주세요.');
        return;
    }
    
    // 로딩 표시
    document.getElementById('loading').classList.add('active');
    document.getElementById('printButton').disabled = true;
    
    try {
        // input 필드에서 수정된 값 가져오기
        const medicineNameValue = document.getElementById('medicineName').value;
        const medicineTypeValue = document.getElementById('medicineType').value;
        const shouldUpdateMedicineName = document.getElementById('updateMedicineName').checked;
        const shouldUpdateMedicineType = document.getElementById('updateMedicineType').checked;
        
        const updatedData = {
            ...prescriptionData,
            patientName: document.getElementById('patientName').value,
            name: medicineNameValue,
            receiptDate: document.getElementById('receiptDate').value, // 수정된 처방일 포함
            prescriptionDays: document.getElementById('prescriptionDays').value,
            singleDose: document.getElementById('singleDose').value,
            medicineInfo: {
                ...medicineInfo,
                title: medicineNameValue,
                mdfsCodeName: medicineTypeValue
            },
            dosageText: dosageText,
            medicineType: medicineTypeValue,
            // 약품 유형 업데이트 플래그 추가
            updateMedicineType: shouldUpdateMedicineType,
            // 약품명 업데이트 플래그 추가
            updateMedicineName: shouldUpdateMedicineName,
            medicineCode: prescriptionData.code
        };
        
        // 메인 프로세스에 출력 요청
        const result = await ipcRenderer.invoke('print-from-editor', updatedData);
        
        if (result.success) {
            // 출력 성공 시 창 닫기
            window.close();
        } else {
            throw new Error(result.error || '출력 실패');
        }
    } catch (error) {
        console.error('Print error:', error);
        alert(`출력 중 오류가 발생했습니다: ${error.message}`);
    } finally {
        // 로딩 숨기기
        document.getElementById('loading').classList.remove('active');
        document.getElementById('printButton').disabled = false;
    }
}

// 날짜 선택기 초기화
function initializeDatePicker() {
    // 처방일 입력 필드에 Flatpickr 적용
    flatpickr("#receiptDate", {
        locale: "ko", // 한국어 설정
        dateFormat: "Y년m월d일", // 날짜 형식
        altInput: true, // 대체 입력 표시
        altFormat: "Y년 m월 d일", // 대체 형식 (더 읽기 쉽게)
        defaultDate: prescriptionData.receiptDate || new Date(), // 기본값
        disableMobile: true, // 모바일에서도 커스텀 달력 사용
        onReady: function(selectedDates, dateStr, instance) {
            // 초기 값 설정
            if (prescriptionData.receiptDate) {
                // "2025년08월07일" 형식을 Date 객체로 변환
                const match = prescriptionData.receiptDate.match(/(\d{4})년(\d{2})월(\d{2})일/);
                if (match) {
                    const date = new Date(match[1], match[2] - 1, match[3]);
                    instance.setDate(date);
                }
            }
        },
        onChange: function(selectedDates, dateStr, instance) {
            // 날짜가 변경될 때 처리
        }
    });
}