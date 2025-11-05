const { ipcRenderer } = require('electron');

// 전역 변수
let prescriptionData = null;
let medicineInfo = null;
let selectedTimes = new Set();
let isSpecialDosage = false;
let selectedMealRelation = null; // 선택된 식사 관계
let userModifiedDailyDose = false; // 사용자가 하루 복용횟수를 직접 수정했는지 여부

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
    document.getElementById('medicineName').value = medicineInfo?.drug_name || prescriptionData.name || '';
    document.getElementById('medicineType').value =
        medicineInfo?.cls_code || medicineInfo?.drug_form || '먹는약';
    document.getElementById('medicineUnit').value = medicineInfo?.unit || '정';

    // 처방일수와 1회 투여량, 하루 복용횟수는 숫자만 표시
    document.getElementById('prescriptionDays').value = prescriptionData.prescriptionDays || '';
    document.getElementById('singleDose').value = prescriptionData.singleDose || '';
    document.getElementById('dailyDose').value = prescriptionData.dailyDose || '';

    // 총량 단위 업데이트
    const unit = medicineInfo?.unit || '정';
    document.getElementById('totalAmountUnit').textContent = unit;

    // 자동출력 체크박스 설정
    const autoPrintCheck = document.getElementById('autoPrintCheck');
    if (autoPrintCheck && medicineInfo) {
        autoPrintCheck.checked = medicineInfo.autoPrint === 1;
    }

    // 총량 초기 계산
    updateTotalAmount();
}

// 총량 자동 계산 함수
function updateTotalAmount() {
    const prescriptionDays = parseInt(document.getElementById('prescriptionDays').value) || 0;
    const singleDose = parseFloat(document.getElementById('singleDose').value) || 0;
    const dailyDose = parseInt(document.getElementById('dailyDose').value) || 0;
    
    if (prescriptionDays && singleDose && dailyDose) {
        const total = prescriptionDays * singleDose * dailyDose;
        document.getElementById('totalAmount').value = total;
    }
}

// 초기 용법 설정
function initializeDosage() {
    const dailyDose = parseInt(prescriptionData.dailyDose) || 1;
    const usagePriority = medicineInfo?.usage_priority || '1324';
    const customUsage = medicineInfo?.custom_usage;

    // custom_usage가 있으면 특수용법으로 표시
    if (customUsage) {
        document.getElementById('specialDosageCheck').checked = true;
        document.getElementById('specialDosageInput').value = customUsage;
        toggleSpecialDosage(true);
        updateDosageResult();
        return;
    }

    // dailyDose에 따라 초기 시간 선택
    const timeButtons = document.querySelectorAll('.time-button');
    timeButtons.forEach(btn => btn.classList.remove('active'));
    selectedTimes.clear();

    // 5회 이상인 경우 특수용법
    if (dailyDose >= 5) {
        document.getElementById('specialDosageCheck').checked = true;
        toggleSpecialDosage(true);
        document.getElementById('specialDosageInput').value = `하루 ${dailyDose}번`;
        updateDosageResult();
        return;
    }

    // usage_priority 기반 시간 매핑
    const timeMap = {
        '1': 'morning',
        '2': 'lunch',
        '3': 'evening',
        '4': 'bedtime'
    };

    // dailyDose만큼 usagePriority의 앞 글자들을 추출하여 시간 선택
    const priorityChars = usagePriority.substring(0, dailyDose).split('');
    priorityChars.forEach(char => {
        const time = timeMap[char];
        if (time) {
            selectTime(time);
        }
    });

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
            
            // 하루 복용횟수 강제 업데이트 (복용 시간 버튼 클릭 시 항상 업데이트)
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
    
    // 1회 투여량 변경 시 용법 업데이트 및 총량 재계산
    document.getElementById('singleDose').addEventListener('input', () => {
        updateTotalAmount();
        updateDosageResult();
    });

    // 처방일수 변경 시 총량 재계산
    document.getElementById('prescriptionDays').addEventListener('input', () => {
        updateTotalAmount();
        updateDosageResult();
    });

    // 하루 복용횟수 수동 수정 감지
    document.getElementById('dailyDose').addEventListener('input', () => {
        userModifiedDailyDose = true;
        updateTotalAmount();
        updateDosageResult();
    });

    // 단위 변경 시 용법 업데이트 및 총량 단위 업데이트
    document.getElementById('medicineUnit').addEventListener('input', () => {
        const unit = document.getElementById('medicineUnit').value || '정';
        document.getElementById('totalAmountUnit').textContent = unit;
        updateDosageResult();
    });

    // 총량 수동 입력 시에는 자동 계산 비활성화 (향후 확장 가능)
    document.getElementById('totalAmount').addEventListener('input', () => {
        // 총량을 직접 수정한 경우 추가 로직 구현 가능
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
    const unit = document.getElementById('medicineUnit').value || '정';

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
            // 복용시간이 선택되지 않은 경우 하루 복용횟수로 처리
            const dailyDose = document.getElementById('dailyDose').value;
            if (dailyDose && singleDose) {
                dosageText = `하루 ${dailyDose}번 ${singleDose}${unit}씩`;
                // 식사 관계가 있으면 추가
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
    const dailyDose = document.getElementById('dailyDose').value;
    
    // 복용시간 선택 또는 하루 복용횟수 입력 시 출력 허용
    if (dosageText === '-' && !dailyDose) {
        alert('복용시간을 선택하거나 하루 복용횟수를 입력해주세요.');
        return;
    }
    
    // input 필드에서 수정된 값 가져오기
    const medicineNameValue = document.getElementById('medicineName').value;
    const medicineTypeValue = document.getElementById('medicineType').value;
    const medicineUnitValue = document.getElementById('medicineUnit').value;
    const shouldUpdateMedicineName = document.getElementById('updateMedicineName').checked;
    const shouldUpdateMedicineType = document.getElementById('updateMedicineType').checked;
    const shouldUpdateUnit = document.getElementById('updateMedicineUnit').checked;

    // 특수용법 저장 체크
    const shouldSaveCustomUsage = document.getElementById('saveCustomUsageCheck').checked;
    const specialDosageInput = document.getElementById('specialDosageInput').value.trim();
    const customUsageValue = (isSpecialDosage && shouldSaveCustomUsage && specialDosageInput) ? specialDosageInput : null;

    // 자동출력 체크
    const autoPrintCheckbox = document.getElementById('autoPrintCheck');
    const autoPrintValue = autoPrintCheckbox ? autoPrintCheckbox.checked : false;
    const shouldUpdateAutoPrint = medicineInfo && (autoPrintValue !== (medicineInfo.autoPrint === 1));

    const updatedData = {
        ...prescriptionData,
        patientName: document.getElementById('patientName').value,
        name: medicineNameValue,
        receiptDate: document.getElementById('receiptDate').value, // 수정된 처방일 포함
        prescriptionDays: document.getElementById('prescriptionDays').value,
        singleDose: document.getElementById('singleDose').value,
        dailyDose: document.getElementById('dailyDose').value, // 하루 복용횟수 추가
        totalAmount: document.getElementById('totalAmount').value, // 총량 추가
        unit: medicineUnitValue,
        medicineInfo: {
            ...medicineInfo,
            drug_name: medicineNameValue,
            cls_code: medicineTypeValue,
            unit: medicineUnitValue
        },
        dosageText: dosageText,
        medicineType: medicineTypeValue,
        // 약품 유형 업데이트 플래그 추가
        updateMedicineType: shouldUpdateMedicineType,
        // 약품명 업데이트 플래그 추가
        updateMedicineName: shouldUpdateMedicineName,
        // 단위 업데이트 플래그 추가
        updateUnit: shouldUpdateUnit,
        // 특수용법 저장
        saveCustomUsage: shouldSaveCustomUsage && customUsageValue !== null,
        customUsage: customUsageValue,
        // 자동출력 저장
        updateAutoPrint: shouldUpdateAutoPrint,
        autoPrint: autoPrintValue,
        medicineCode: prescriptionData.code
    };

    // Fire-and-forget: 메인 프로세스에 출력 요청을 보내고 바로 창 닫기
    // 인쇄는 백그라운드에서 처리됨
    ipcRenderer.invoke('print-from-editor', updatedData).catch(error => {
        console.error('Print error:', error);
        // 에러는 로그만 남기고 사용자에게는 알리지 않음 (이미 창이 닫힌 후일 수 있음)
    });

    // 즉시 창 닫기 (인쇄 완료를 기다리지 않음)
    window.close();
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