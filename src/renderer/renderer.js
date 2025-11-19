// KST 기준 현재 날짜를 YYYYMMDD 형식으로 반환
function getKSTDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

// 시간 정보만 추출하는 함수 (9시 12분 12초 형식)
function formatTimeKST(dateValue) {
    if (!dateValue) return '';

    let date;
    if (dateValue instanceof Date) {
        date = dateValue;
    } else if (typeof dateValue === 'string') {
        // ISO 문자열인 경우
        date = new Date(dateValue);
    } else {
        return '';
    }

    // KST로 변환 (UTC+9)
    const hours = date.getHours();
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    return `${hours}시 ${minutes}분 ${seconds}초`;
}

// 토스트 메시지 표시 함수
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
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 20px;
        border-radius: 4px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        z-index: 10000;
        animation: slideIn 0.3s ease-out;
        max-width: 300px;
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
const style = document.createElement('style');
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

window.addEventListener('DOMContentLoaded', () => {
    const prescriptionListContainer = document.getElementById('prescription-list-container');
    const dateSelect = document.getElementById('date-select');
    const printerSelect = document.getElementById('printer-select');
    const detailView = document.getElementById('detail-view');
    const detailPatientName = document.getElementById('detail-patient-name');
    const detailPatientId = document.getElementById('detail-patient-id');
    const detailMedicineListTableBody = document.querySelector('#detail-medicine-list tbody');
    
    // 설정 관련 요소
    const settingsBtn = document.getElementById('settings-btn');
    const settingsModal = document.getElementById('settings-modal');
    const closeBtn = document.querySelector('.close');
    const cancelBtn = document.getElementById('cancel-btn');
    const settingsForm = document.getElementById('settings-form');
    const templatePathSelect = document.getElementById('template-path');

    // 라벨정보 관련 요소
    const labelTemplateInfoBtn = document.getElementById('label-template-info-btn');
    const labelInfoModal = document.getElementById('label-info-modal');
    const labelInfoClose = document.getElementById('label-info-close');
    const labelInfoOk = document.getElementById('label-info-ok');
    
    // 템플릿 미리보기 관련 요소
    const previewTemplateBtn = document.getElementById('preview-template-btn');
    const templatePreviewDiv = document.getElementById('template-preview');
    const previewImage = document.getElementById('preview-image');
    
    // 약품설정 관련 요소
    const medicineBtn = document.getElementById('medicine-btn');

    let prescriptions = []; // This will hold the list of prescriptions for the selected date
    let selectedPrescriptionIndex = -1;
    let currentConfig = {}; // 현재 설정 저장
    let isFirstRun = false; // 첫 실행 여부
    
    // Brother 프린터 목록 로드
    async function loadBrotherPrinters() {
        try {
            const result = await window.electronAPI.getBrotherPrinters();
            printerSelect.innerHTML = '';

            if (result.success && result.printers.length > 0) {
                result.printers.forEach(printer => {
                    const option = document.createElement('option');
                    // 프린터 객체에서 이름 추출
                    const printerName = typeof printer === 'string' ? printer : printer.name;
                    option.value = printerName;

                    // 오프라인 상태 표시
                    if (typeof printer === 'object' && printer.isOffline) {
                        option.textContent = `${printerName} (오프라인)`;
                        option.style.color = '#999';
                    } else {
                        option.textContent = printerName;
                    }

                    printerSelect.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Brother 프린터를 찾을 수 없습니다';
                printerSelect.appendChild(option);
            }
        } catch (error) {
            console.error('프린터 목록 로드 실패:', error);
            printerSelect.innerHTML = '';
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '프린터 로드 실패';
            printerSelect.appendChild(option);
        }
    }

    function renderPrescriptionList() {
        prescriptionListContainer.innerHTML = ''; // Clear existing list
        if (prescriptions.length === 0) {
            prescriptionListContainer.innerHTML = '<p>표시할 데이터가 없습니다.</p>';
            return;
        }

        prescriptions.forEach((data, index) => {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('prescription-item');
            if (index === selectedPrescriptionIndex) {
                itemDiv.classList.add('selected');
            }
            itemDiv.dataset.index = index; // Store index for click handling

            if (data.isLoading) {
                itemDiv.classList.add('loading');
                itemDiv.innerHTML = '<div class="loading-overlay">약품 정보 조회 중...</div>';
            } else {
                // parsedAt을 사용하여 파싱 시간 표시
                const formattedTime = formatTimeKST(data.parsedAt);

                // 접수날짜와 파싱날짜가 다르면 아래 줄에 표시
                let dateInfoLine = '';
                if (data.receiptDateRaw && data.parsedDate && data.receiptDateRaw !== data.parsedDate) {
                    // receiptDateRaw: YYYYMMDD 형식을 YYYY년 MM월 DD일로 변환
                    const year = data.receiptDateRaw.substring(0, 4);
                    const month = data.receiptDateRaw.substring(4, 6);
                    const day = data.receiptDateRaw.substring(6, 8);
                    dateInfoLine = `<div style="font-size: 11px; color: #666; margin-top: 3px;">최초 접수일: ${year}년 ${month}월 ${day}일</div>`;
                }

                let html = `
                    <div style="flex: 1;">
                        <div><strong>환자: ${data.patientName}</strong> (${data.patientId}) / 접수번호: ${data.receiptNum} / 병원: ${data.hospitalName} / 접수시간: ${formattedTime}</div>
                        ${dateInfoLine}
                    </div>
                    <span class="delete-icon" data-index="${index}" style="cursor: pointer; font-size: 12.6px; color: #d32f2f; padding: 0 10px; user-select: none;" title="삭제">❌</span>
                `;
                itemDiv.innerHTML = html;
                itemDiv.style.display = 'flex';
                itemDiv.style.alignItems = 'flex-start';
                itemDiv.style.justifyContent = 'space-between';
            }
            prescriptionListContainer.appendChild(itemDiv); // appendChild to maintain order from DB
        });
    }

    function updateDetailView(data) {
        // Clear previous print button if it exists
        const existingPrintBtn = document.getElementById('print-btn');
        if (existingPrintBtn) {
            existingPrintBtn.remove();
        }

        if (!data) {
            detailPatientName.textContent = '';
            detailPatientId.textContent = '';
            detailMedicineListTableBody.innerHTML = '<tr><td colspan="6">선택된 처방 정보가 없습니다.</td></tr>';
            return;
        }

        detailPatientName.textContent = data.patientName;
        detailPatientId.textContent = data.patientId;

        detailMedicineListTableBody.innerHTML = ''; // Clear existing medicine list
        data.medicines.forEach((med, index) => {
            const row = detailMedicineListTableBody.insertRow();
            
            // 라벨출력 버튼 추가 (종류 필드 대체)
            const buttonCell = row.insertCell();
            const labelButton = document.createElement('button');
            labelButton.textContent = '라벨출력';
            labelButton.style.cssText = 'padding: 3px 8px; font-size: 12px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
            labelButton.onclick = async () => {
                // 라벨 편집 창 열기
                const prescriptionData = {
                    patientName: data.patientName,
                    patientId: data.patientId,
                    receiptNum: data.receiptNum,
                    receiptDate: data.receiptDate,
                    hospitalName: data.hospitalName,
                    name: med.name,
                    code: med.code,
                    prescriptionDays: med.prescriptionDays,
                    dailyDose: med.dailyDose,
                    singleDose: med.singleDose
                };
                
                try {
                    labelButton.disabled = true;
                    labelButton.textContent = '열기 중...';
                    
                    const result = await window.electronAPI.openLabelEditor(prescriptionData, med.code);
                    
                    if (!result.success) {
                        alert(`편집 창을 열 수 없습니다: ${result.error}`);
                    }
                } catch (error) {
                    console.error('편집 창 오류:', error);
                    alert('편집 창을 여는 중 오류가 발생했습니다.');
                } finally {
                    labelButton.disabled = false;
                    labelButton.textContent = '라벨출력';
                }
            };
            buttonCell.appendChild(labelButton);
            
            // 약품코드 - 이미 9자리로 저장됨
            row.insertCell().textContent = med.code;
            
            // 약품명 - DB의 drug_name 우선 사용 (medicineInfo가 있으면 사용, 없으면 name 사용)
            const medicineNameCell = row.insertCell();
            medicineNameCell.textContent = med.medicineInfo?.drug_name || med.name || '-';
            medicineNameCell.style.cursor = 'pointer';
            medicineNameCell.style.color = '#0056b3';
            medicineNameCell.style.textDecoration = 'underline';
            medicineNameCell.onclick = async () => {
                try {
                    await window.electronAPI.openMedicineSettings(med.code);
                } catch (error) {
                    console.error('약품설정 창 열기 실패:', error);
                    showToast('약품설정 창을 열 수 없습니다', 'error');
                }
            };
            
            // 전문/일반 구분 제거됨
            
            row.insertCell().textContent = med.prescriptionDays;
            row.insertCell().textContent = med.singleDose;
            row.insertCell().textContent = med.dailyDose;
        });
    }

    function sortPrescriptions(data) {
        // Sort by timestamp in descending order (newest first), then by receiptNum descending
        return data.sort((a, b) => {
            // 먼저 timestamp로 정렬 (최신이 위)
            const timeDiff = b.timestamp - a.timestamp;
            if (timeDiff !== 0) {
                return timeDiff;
            }
            // timestamp가 같으면 receiptNum으로 정렬 (큰 번호가 위)
            return b.receiptNum - a.receiptNum;
        });
    }

    function updatePrescriptionsAndDisplay(data) {
        prescriptions = sortPrescriptions(data);
        selectedPrescriptionIndex = prescriptions.length > 0 ? 0 : -1; // Select the first item by default
        renderPrescriptionList();
        updateDetailView(prescriptions[selectedPrescriptionIndex]);
    }

    // Event listener for date selection
    dateSelect.addEventListener('change', (event) => {
        const selectedDate = event.target.value;
        window.electronAPI.getDataForDate(selectedDate);
    });

    // Event listener for clicking on a prescription item in the list
    prescriptionListContainer.addEventListener('click', (event) => {
        // 삭제 아이콘 클릭 체크
        const deleteIcon = event.target.closest('.delete-icon');
        if (deleteIcon) {
            event.stopPropagation();
            const index = parseInt(deleteIcon.dataset.index, 10);
            const prescription = prescriptions[index];
            if (prescription && !prescription.isLoading) {
                showDeletePrescriptionModal(prescription, index);
            }
            return;
        }

        // 처방전 항목 클릭
        const clickedItem = event.target.closest('.prescription-item');
        if (clickedItem) {
            // Remove 'selected' class from previously selected item
            const currentSelected = prescriptionListContainer.querySelector('.prescription-item.selected');
            if (currentSelected) {
                currentSelected.classList.remove('selected');
            }

            // Add 'selected' class to the clicked item
            clickedItem.classList.add('selected');

            selectedPrescriptionIndex = parseInt(clickedItem.dataset.index, 10);
            updateDetailView(prescriptions[selectedPrescriptionIndex]);
        }
    });

    window.electronAPI.onInitialData((payload) => {
        const { data, dates, today } = payload;

        // Populate date selector
        dateSelect.innerHTML = '';
        dates.forEach(dateStr => {
            const option = document.createElement('option');
            option.value = dateStr;
            option.textContent = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
            dateSelect.appendChild(option);
        });

        // 오늘 날짜를 명시적으로 선택 (데이터 유무와 무관하게 항상 오늘 날짜 선택)
        dateSelect.value = today;

        updatePrescriptionsAndDisplay(data);
    });

    window.electronAPI.onDataForDate((data) => {
        updatePrescriptionsAndDisplay(data);
    });

    // 로딩 상태 처리
    window.electronAPI.onParsedDataLoading((data) => {
        const preparationDate = data.preparationDate;
        if (preparationDate === dateSelect.value) {
            // 임시 로딩 항목 추가
            const loadingData = {
                ...data,
                patientName: '약품 정보 조회 중...',
                patientId: '',
                receiptNum: '',
                hospitalName: '',
                receiptDate: '',
                medicines: [],
                isLoading: true
            };
            prescriptions.push(loadingData);
            updatePrescriptionsAndDisplay(prescriptions);
        }
    });

    window.electronAPI.onParsedData((data) => {
        const preparationDate = data.preparationDate; // Assuming preparationDate is now part of data
        if (preparationDate === dateSelect.value) {
            // 로딩 항목 찾아서 교체
            const loadingIndex = prescriptions.findIndex(p => 
                p.isLoading && p.timestamp === data.timestamp
            );
            
            if (loadingIndex !== -1) {
                prescriptions[loadingIndex] = data;
            } else {
                prescriptions.push(data);
            }
            updatePrescriptionsAndDisplay(prescriptions);
        }
    });

    window.electronAPI.onPrintLabelResult((result) => {
        // You can add user feedback here, e.g., an alert or a status message
        alert(result.success ? `인쇄 성공: ${result.message}` : `인쇄 실패: ${result.message}`);
    });

    window.electronAPI.onPrinterList((printers) => {
        printerSelect.innerHTML = '';
        if (printers && printers.length > 0) {
            printers.forEach(printerName => {
                const option = document.createElement('option');
                option.value = printerName;
                option.textContent = printerName;
                printerSelect.appendChild(option);
            });
        } else {
            const option = document.createElement('option');
            option.textContent = '사용 가능한 프린터 없음';
            printerSelect.appendChild(option);
        }
    });

    window.electronAPI.onUpdateDateList((updatedDates) => {
        // 현재 선택된 날짜 저장
        const currentSelectedDate = dateSelect.value;
        const today = getKSTDateString(); // KST 기준 오늘 날짜

        // Clear existing options
        dateSelect.innerHTML = '';
        // Repopulate with updated dates
        updatedDates.forEach(dateStr => {
            const option = document.createElement('option');
            option.value = dateStr;
            option.textContent = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
            dateSelect.appendChild(option);
        });

        // 오늘 날짜가 있고 현재 선택이 오늘이면 오늘 유지, 아니면 현재 선택 유지
        if (updatedDates.includes(today) && currentSelectedDate === today) {
            dateSelect.value = today;
            window.electronAPI.getDataForDate(today);
        } else if (updatedDates.includes(currentSelectedDate)) {
            // 현재 선택된 날짜가 목록에 있으면 유지
            dateSelect.value = currentSelectedDate;
        } else if (updatedDates.length > 0) {
            // 그 외의 경우 첫 번째 날짜 선택 (오늘)
            dateSelect.value = updatedDates[0];
            window.electronAPI.getDataForDate(updatedDates[0]);
        }
    });

    // 설정 관련 함수들
    async function loadConfig() {
        try {
            currentConfig = await window.electronAPI.getConfig();

            // ATC 서버 경로 설정
            const atcPathInput = document.getElementById('atc-path');
            if (atcPathInput) {
                atcPathInput.value = currentConfig.atcPath || 'C:\\ATDPS\\Data';
            }

            // 원본 파일 자동 삭제 체크박스 설정
            const deleteOriginalFileCheckbox = document.getElementById('delete-original-file');
            if (deleteOriginalFileCheckbox) {
                deleteOriginalFileCheckbox.checked = currentConfig.deleteOriginalFile || false;
            }

            // 템플릿 선택 상태 업데이트
            if (currentConfig.templatePath) {
                // 템플릿 목록이 비어있으면 먼저 로드
                if (templatePathSelect.options.length === 0) {
                    await loadTemplates();
                }

                // 템플릿 선택
                let templateFound = false;
                for (let i = 0; i < templatePathSelect.options.length; i++) {
                    if (templatePathSelect.options[i].value === currentConfig.templatePath) {
                        templatePathSelect.selectedIndex = i;
                        templateFound = true;
                        break;
                    }
                }

                // 템플릿을 찾지 못한 경우 기본 템플릿 선택
                if (!templateFound && templatePathSelect.options.length > 0) {
                    templatePathSelect.selectedIndex = 0;
                }
            } else if (templatePathSelect.options.length > 0) {
                // 템플릿이 설정되지 않은 경우 첫 번째 템플릿 선택
                templatePathSelect.selectedIndex = 0;
            }
        } catch (error) {
            console.error('설정 로드 실패:', error);
        }
    }
    
    async function loadTemplates() {
        try {
            const result = await window.electronAPI.getTemplates();
            templatePathSelect.innerHTML = '<option value="">템플릿을 선택하세요</option>';
            
            if (result.success && result.templates.length > 0) {
                result.templates.forEach(template => {
                    const option = document.createElement('option');
                    option.value = template.path;
                    option.textContent = template.name;
                    templatePathSelect.appendChild(option);
                });
            }
            
            // 현재 설정된 템플릿 선택
            if (currentConfig.templatePath) {
                templatePathSelect.value = currentConfig.templatePath;
            }
        } catch (error) {
            console.error('템플릿 목록 로드 실패:', error);
        }
    }
    
    // 폴더 선택 버튼 이벤트 리스너 (한 번만 등록)
    const selectAtcFolderBtn = document.getElementById('select-atc-folder-btn');
    if (selectAtcFolderBtn) {
        selectAtcFolderBtn.addEventListener('click', async () => {
            const atcPathInput = document.getElementById('atc-path');
            const currentPath = atcPathInput.value || 'C:\\atc';
            try {
                const result = await window.electronAPI.selectFolder(currentPath);
                if (result.success && !result.canceled) {
                    atcPathInput.value = result.folderPath;
                }
            } catch (error) {
                console.error('폴더 선택 오류:', error);
                showToast('폴더 선택 중 오류가 발생했습니다.', 'error');
            }
        });
    }
    
    // 설정 모달 열기
    settingsBtn.addEventListener('click', async () => {
        await loadConfig();
        await loadTemplates();
        await loadVersionInfo(); // 버전 정보 로드
        settingsModal.style.display = 'block';
    });
    
    // 템플릿 선택 시 필드 확인
    templatePathSelect.addEventListener('change', async () => {
        const selectedTemplate = templatePathSelect.value;
        if (selectedTemplate) {
            try {
                const result = await window.electronAPI.checkTemplateFields(selectedTemplate);
                if (!result.error && result.fields) {
                } else {
                    console.error('Failed to check template fields:', result.message);
                }
            } catch (error) {
                console.error('Error checking template:', error);
            }
        }
    });
    
    // 모달 닫기
    closeBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    cancelBtn.addEventListener('click', () => {
        settingsModal.style.display = 'none';
    });

    // 모달 외부 클릭시 닫기
    window.addEventListener('click', (event) => {
        if (event.target === settingsModal) {
            settingsModal.style.display = 'none';
        }
        if (event.target === labelInfoModal) {
            labelInfoModal.style.display = 'none';
        }
    });
    
    // 설정 저장
    settingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        const atcPathInput = document.getElementById('atc-path');
        const deleteOriginalFileCheckbox = document.getElementById('delete-original-file');
        const config = {
            templatePath: templatePathSelect.value || './templates/default.lbx',
            atcPath: atcPathInput ? atcPathInput.value : 'C:\\ATDPS\\Data',
            deleteOriginalFile: deleteOriginalFileCheckbox ? deleteOriginalFileCheckbox.checked : false
        };

        try {
            const result = await window.electronAPI.saveConfig(config);
            if (result.success) {
                currentConfig = config;

                // 첫 실행 플래그 리셋
                isFirstRun = false;

                // 경고 메시지 제거
                const warningDiv = settingsModal.querySelector('.initial-warning');
                if (warningDiv) {
                    warningDiv.remove();
                }

                alert('설정이 저장되었습니다.');
                settingsModal.style.display = 'none';
            } else {
                alert('설정 저장 실패: ' + result.error);
            }
        } catch (error) {
            console.error('설정 저장 오류:', error);
            alert('설정 저장 중 오류가 발생했습니다.');
        }
    });
    
    // 라벨템플릿정보 버튼 이벤트 (설정 모달 내부)
    labelTemplateInfoBtn.addEventListener('click', () => {
        labelInfoModal.style.display = 'block';
    });

    labelInfoClose.addEventListener('click', () => {
        labelInfoModal.style.display = 'none';
    });

    labelInfoOk.addEventListener('click', () => {
        labelInfoModal.style.display = 'none';
    });
    
    // 템플릿 미리보기 버튼 이벤트
    previewTemplateBtn.addEventListener('click', async () => {
        const templatePath = templatePathSelect.value;
        if (!templatePath) {
            alert('템플릿을 먼저 선택해주세요.');
            return;
        }
        
        // 로딩 표시
        previewTemplateBtn.disabled = true;
        previewTemplateBtn.textContent = '로딩...';
        templatePreviewDiv.style.display = 'none';
        
        try {
            const result = await window.electronAPI.previewTemplate(templatePath);
            if (result.success && result.data) {
                // Base64 이미지 표시
                previewImage.src = `data:image/bmp;base64,${result.data}`;
                templatePreviewDiv.style.display = 'block';
            } else {
                alert(`미리보기 생성 실패: ${result.error || '알 수 없는 오류'}`);
            }
        } catch (error) {
            console.error('미리보기 오류:', error);
            alert('미리보기 생성 중 오류가 발생했습니다.');
        } finally {
            // 버튼 복원
            previewTemplateBtn.disabled = false;
            previewTemplateBtn.textContent = '미리보기';
        }
    });

    // 약품설정 버튼 이벤트 - 새 창 열기로 변경
    medicineBtn.addEventListener('click', async () => {
        try {
            const result = await window.electronAPI.openMedicineSettings();
            if (!result.success) {
                alert('약품설정 창을 열 수 없습니다: ' + result.error);
            }
        } catch (error) {
            console.error('약품설정 창 열기 실패:', error);
            alert('약품설정 창을 열 수 없습니다');
        }
    });

    // 커스텀라벨 버튼 이벤트
    const customLabelBtn = document.getElementById('custom-label-btn');
    if (customLabelBtn) {
        customLabelBtn.addEventListener('click', async () => {
            try {
                const result = await window.electronAPI.openCustomLabelEditor();
                if (!result.success) {
                    alert('커스텀라벨 창을 열 수 없습니다: ' + result.error);
                }
            } catch (error) {
                console.error('커스텀라벨 창 열기 실패:', error);
                alert('커스텀라벨 창을 열 수 없습니다');
            }
        });
    }

    
    // 미완성 약품 개수 뱃지 업데이트
    async function updateMedicineFailBadge() {
        try {
            const result = await window.electronAPI.getMedicineFailCount();
            if (result.success && result.count > 0) {
                // 뱃지가 없으면 생성
                let badge = medicineBtn.querySelector('.fail-badge');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'fail-badge';
                    badge.style.cssText = `
                        position: absolute;
                        top: -8px;
                        right: -8px;
                        background: red;
                        color: white;
                        border-radius: 50%;
                        padding: 2px 6px;
                        font-size: 12px;
                        font-weight: bold;
                        min-width: 20px;
                        text-align: center;
                    `;
                    medicineBtn.style.position = 'relative';
                    medicineBtn.appendChild(badge);
                }
                badge.textContent = result.count;
                badge.style.display = 'block';
            } else {
                // 개수가 0이면 뱃지 숨김
                const badge = medicineBtn.querySelector('.fail-badge');
                if (badge) {
                    badge.style.display = 'none';
                }
            }
        } catch (error) {
            console.error('미완성 약품 개수 조회 실패:', error);
        }
    }
    
    // b-PAC 설치 안내 버튼 이벤트 처리
    const installBpacBtn = document.getElementById('installBpac');
    if (installBpacBtn) {
        installBpacBtn.addEventListener('click', () => {
            // Brother 다운로드 페이지 열기
            window.electronAPI.openExternal('https://support.brother.com/g/s/es/dev/en/bpac/download/index.html');
            
            // 설치 안내 메시지
            showToast('Brother 다운로드 페이지가 열렸습니다. b-PAC Client Component (32-bit)를 다운로드하여 설치해주세요.', 'info');
        });
    }
    
    // b-PAC 상태 수신 처리
    window.electronAPI.onBpacStatus((status) => {
        const statusDiv = document.getElementById('bpacStatus');
        if (statusDiv) {
            if (!status.installed) {
                // b-PAC이 설치되지 않은 경우 경고 표시
                statusDiv.style.display = 'block';
            } else {
                // b-PAC이 설치된 경우 경고 숨김
                statusDiv.style.display = 'none';
            }
        }
    });
    
    // 초기 설정 표시 함수 (설정 버튼 클릭 시에만 사용)
    async function showInitialSetup() {
        await loadConfig();
        await loadTemplates();
        settingsModal.style.display = 'block';
    }
    
    // API 에러 메시지 수신 처리
    window.electronAPI.onApiError((error) => {
        const errorMessageDiv = document.getElementById('api-error-message');
        if (errorMessageDiv) {
            errorMessageDiv.classList.add('show');

            // 10초 후 자동으로 숨김
            setTimeout(() => {
                errorMessageDiv.classList.remove('show');
            }, 10000);
        }
    });

    // 약품 정보 업데이트 이벤트 처리
    window.electronAPI.onMedicineDataUpdated(() => {
        console.log('[renderer] 약품 정보가 업데이트되었습니다. 뱃지와 화면을 갱신합니다.');

        // 뱃지 업데이트
        updateMedicineFailBadge();

        // 현재 선택된 처방전이 있으면 다시 로드
        if (selectedPrescriptionIndex >= 0 && prescriptions[selectedPrescriptionIndex]) {
            const currentPrescription = prescriptions[selectedPrescriptionIndex];

            // 현재 선택된 날짜의 데이터를 다시 요청
            const selectedDate = dateSelect.value;
            window.electronAPI.getDataForDate(selectedDate);

            // 토스트 메시지 표시
            showToast('약품 정보가 업데이트되었습니다.', 'success');
        }
    });

    // 자동 인쇄 이벤트 처리
    window.electronAPI.onAutoPrintMedicines(async (data) => {
        const { prescription, medicines } = data;
        const selectedPrinter = printerSelect.value;

        if (!selectedPrinter) {
            showToast('자동 인쇄 실패: 프린터를 선택해주세요', 'error');
            return;
        }

        try {
            let successCount = 0;
            let failCount = 0;

            // 각 약품에 대해 순차적으로 인쇄
            for (const medicine of medicines) {
                try {
                    const medicineName = medicine.drug_name || medicine.name || '약품명 없음';

                    // 복용법 텍스트 생성 (용법 우선순위 기반)
                    const dailyDose = parseInt(medicine.dailyDose) || 0;
                    const singleDose = medicine.singleDose || '1';
                    const prescriptionDays = medicine.prescriptionDays || '0';
                    const unit = medicine.unit || '정';

                    // 용법 우선순위에서 시간 추출
                    const usagePriority = medicine.usage_priority || '1324';
                    const timeMapping = { '1': '아침', '2': '점심', '3': '저녁', '4': '취침전' };
                    const times = usagePriority.substring(0, dailyDose).split('').map(t => timeMapping[t]).join(',');

                    const dosageText = `하루 ${dailyDose}번 ${times} 식후 ${singleDose}${unit}씩`;

                    // print-from-editor 방식으로 데이터 구성
                    const printData = {
                        patientName: prescription.patientName,
                        name: medicineName,
                        receiptDate: prescription.receiptDate,
                        prescriptionDays: prescriptionDays,
                        singleDose: singleDose,
                        dailyDose: dailyDose.toString(),
                        totalAmount: (parseInt(singleDose) * dailyDose * parseInt(prescriptionDays)).toString(),
                        unit: unit,
                        medicineInfo: {
                            drug_name: medicineName,
                            cls_code: medicine.cls_code || medicine.drug_form || '정제',
                            unit: unit,
                            temperature: medicine.temperature || '실온',
                            custom_usage: medicine.custom_usage
                        },
                        dosageText: dosageText,
                        medicineType: medicine.cls_code || medicine.drug_form || '정제',
                        medicineCode: medicine.bohcode || medicine.medicineCode
                    };

                    const result = await window.electronAPI.printFromEditor(printData);

                    if (result.success) {
                        successCount++;
                    } else {
                        failCount++;
                    }
                } catch (error) {
                    failCount++;
                }
            }

            // 결과 토스트 메시지
            if (failCount === 0) {
                showToast(`자동 인쇄 완료: ${successCount}개 약품`, 'success');
            } else if (successCount > 0) {
                showToast(`자동 인쇄 일부 완료: 성공 ${successCount}개, 실패 ${failCount}개`, 'info');
            } else {
                showToast(`자동 인쇄 실패: ${failCount}개 약품`, 'error');
            }
        } catch (error) {
            console.error('[자동인쇄] 처리 오류:', error);
            showToast('자동 인쇄 중 오류가 발생했습니다.', 'error');
        }
    });

    // 처방전 삭제 확인 모달 표시
    function showDeletePrescriptionModal(prescription, index) {
        // 모달 생성
        const modal = document.createElement('div');
        modal.id = 'delete-prescription-modal';
        modal.style.cssText = `
            display: block;
            position: fixed;
            z-index: 10001;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0,0,0,0.5);
        `;

        const modalContent = document.createElement('div');
        modalContent.style.cssText = `
            background-color: #fefefe;
            margin: 15% auto;
            padding: 20px;
            border: 1px solid #888;
            border-radius: 8px;
            width: 400px;
            max-width: 90%;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        `;

        const title = document.createElement('h3');
        title.textContent = '처방전 삭제';
        title.style.cssText = 'margin-top: 0; color: #333;';

        const message = document.createElement('p');
        message.innerHTML = `
            해당 처방을 삭제하시겠습니까?<br><br>
            <strong>환자명:</strong> ${prescription.patientName}<br>
            <strong>접수번호:</strong> ${prescription.receiptNum}<br>
            <strong>병원:</strong> ${prescription.hospitalName}<br><br>
            <p style="color: #d32f2f;">※처방전에 대한 내용이 완전히 삭제되며,<br>&nbsp;&nbsp;&nbsp;&nbsp;삭제된 데이터는 복구할 수 없습니다.</p>
        `;
        message.style.cssText = 'margin: 20px 0; line-height: 1.6;';

        const buttonContainer = document.createElement('div');
        buttonContainer.style.cssText = 'text-align: right; margin-top: 20px;';

        const yesButton = document.createElement('button');
        yesButton.textContent = '예';
        yesButton.style.cssText = `
            padding: 10px 20px;
            margin-left: 10px;
            background-color: #d32f2f;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;
        yesButton.onclick = async () => {
            modal.remove();
            await deletePrescription(prescription.id, index);
        };

        const noButton = document.createElement('button');
        noButton.textContent = '아니오';
        noButton.style.cssText = `
            padding: 10px 20px;
            background-color: #757575;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        `;
        noButton.onclick = () => {
            modal.remove();
        };

        buttonContainer.appendChild(noButton);
        buttonContainer.appendChild(yesButton);

        modalContent.appendChild(title);
        modalContent.appendChild(message);
        modalContent.appendChild(buttonContainer);
        modal.appendChild(modalContent);

        document.body.appendChild(modal);

        // 모달 외부 클릭 시 닫기
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        });
    }

    // 날짜별 처방전 데이터 재로드 함수
    function reloadPrescriptionsForDate(date) {
        return new Promise((resolve) => {
            // 한 번만 실행되는 이벤트 핸들러 등록
            const handleDataReload = (data) => {
                updatePrescriptionsAndDisplay(data);
                resolve();
            };

            // 데이터 수신 대기
            window.electronAPI.onDataForDate(handleDataReload);

            // 데이터 요청
            window.electronAPI.getDataForDate(date);
        });
    }

    // 처방전 삭제 실행
    async function deletePrescription(prescriptionId, index) {
        try {
            const result = await window.electronAPI.deletePrescription(prescriptionId);

            if (result.success) {
                showToast('처방전이 삭제되었습니다.', 'success');

                // DB에서 현재 선택된 날짜의 데이터를 다시 불러옴
                const currentDate = dateSelect.value;
                await reloadPrescriptionsForDate(currentDate);

                // 선택 인덱스 초기화
                selectedPrescriptionIndex = -1;

                // 상세 보기 초기화
                updateDetailView(null);
            } else {
                showToast('처방전 삭제 실패: ' + result.message, 'error');
            }
        } catch (error) {
            console.error('처방전 삭제 오류:', error);
            showToast('처방전 삭제 중 오류가 발생했습니다.', 'error');
        }
    }

    // OCS 경로 경고 메시지 수신 처리
    window.electronAPI.onOcsPathWarning((message) => {
        showToast(message, 'error');
        // 설정 모달 자동 열기 (선택사항)
        setTimeout(async () => {
            await loadConfig();
            await loadTemplates();
            settingsModal.style.display = 'block';
        }, 1000);
    });

    // 검증 실패 경고 모달 처리
    window.electronAPI.onValidationWarning((data) => {
        const modal = document.getElementById('validation-warning-modal');
        const errorDetails = document.getElementById('validation-error-details');

        // 에러 메시지 표시
        if (data.errors && data.errors.length > 0) {
            errorDetails.innerHTML = '<ul style="margin: 0; padding-left: 20px;">' +
                data.errors.map(error => `<li>${error}</li>`).join('') +
                '</ul>';
        } else {
            errorDetails.innerHTML = '<p>알 수 없는 오류가 발생했습니다.</p>';
        }

        // 모달 표시
        modal.style.display = 'block';
    });

    // 검증 경고 모달 닫기 버튼
    const validationWarningClose = document.getElementById('validation-warning-close');
    const validationWarningOk = document.getElementById('validation-warning-ok');
    const validationWarningModal = document.getElementById('validation-warning-modal');

    if (validationWarningClose) {
        validationWarningClose.onclick = () => {
            validationWarningModal.style.display = 'none';
        };
    }

    if (validationWarningOk) {
        validationWarningOk.onclick = () => {
            validationWarningModal.style.display = 'none';
        };
    }

    // ===== 에러 로그 뷰어 =====
    const errorLogBtn = document.getElementById('error-log-btn');
    const errorLogModal = document.getElementById('error-log-modal');
    const errorLogClose = document.getElementById('error-log-close');
    const errorLogCancel = document.getElementById('error-log-cancel');
    const logLevelFilter = document.getElementById('log-level-filter');
    const logListContainer = document.getElementById('log-list-container');
    const logCopyBtn = document.getElementById('log-copy-btn');
    const logExportBtn = document.getElementById('log-export-btn');
    const logSendFirebaseBtn = document.getElementById('log-send-firebase-btn');
    const logDeleteAllBtn = document.getElementById('log-delete-all-btn');

    let currentLogs = [];

    // 에러기록 버튼 클릭
    if (errorLogBtn) {
        errorLogBtn.onclick = async () => {
            errorLogModal.style.display = 'block';
            await loadLogs();
        };
    }

    // 모달 닫기
    if (errorLogClose) {
        errorLogClose.onclick = () => {
            errorLogModal.style.display = 'none';
        };
    }

    if (errorLogCancel) {
        errorLogCancel.onclick = () => {
            errorLogModal.style.display = 'none';
        };
    }

    // 로그 레벨 필터 변경
    if (logLevelFilter) {
        logLevelFilter.onchange = () => {
            renderLogs();
        };
    }

    // 로그 불러오기
    async function loadLogs() {
        try {
            logListContainer.innerHTML = '<p style="color: #999;">로그를 불러오는 중...</p>';
            const logs = await window.electronAPI.getAppLogs();
            currentLogs = logs;
            renderLogs();
        } catch (error) {
            logListContainer.innerHTML = '<p style="color: #dc3545;">로그를 불러오는데 실패했습니다.</p>';
            console.error('Failed to load logs:', error);
        }
    }

    // 로그 렌더링
    function renderLogs() {
        const selectedLevel = logLevelFilter.value;
        const filteredLogs = selectedLevel === 'all'
            ? currentLogs
            : currentLogs.filter(log => log.level === selectedLevel);

        if (filteredLogs.length === 0) {
            logListContainer.innerHTML = '<p style="color: #999;">로그가 없습니다.</p>';
            return;
        }

        const logsHtml = filteredLogs.map(log => {
            const levelColor = log.level === 'error' ? '#dc3545' : log.level === 'warning' ? '#ffc107' : '#28a745';
            const timestamp = new Date(log.timestamp).toLocaleString('ko-KR');
            const details = log.details ? `\n상세: ${JSON.stringify(log.details, null, 2)}` : '';
            const stack = log.stack ? `\n스택: ${log.stack}` : '';

            return `
                <div style="margin-bottom: 15px; padding: 10px; background-color: white; border-left: 4px solid ${levelColor}; border-radius: 4px;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span style="font-weight: bold; color: ${levelColor};">[${log.level.toUpperCase()}]</span>
                        <span style="color: #666; font-size: 11px;">${timestamp}</span>
                    </div>
                    <div style="margin-bottom: 3px;">
                        ${log.category ? `<span style="background-color: #e9ecef; padding: 2px 6px; border-radius: 3px; font-size: 11px; margin-right: 8px;">${log.category}</span>` : ''}
                        <span>${log.message}</span>
                    </div>
                    ${details ? `<pre style="margin: 5px 0; padding: 8px; background-color: #f8f9fa; border-radius: 3px; overflow-x: auto; font-size: 11px;">${details}</pre>` : ''}
                    ${stack ? `<pre style="margin: 5px 0; padding: 8px; background-color: #fff3cd; border-radius: 3px; overflow-x: auto; font-size: 11px; color: #856404;">${stack}</pre>` : ''}
                </div>
            `;
        }).join('');

        logListContainer.innerHTML = logsHtml;
    }

    // 로그 복사
    if (logCopyBtn) {
        logCopyBtn.onclick = () => {
            const selectedLevel = logLevelFilter.value;
            const filteredLogs = selectedLevel === 'all'
                ? currentLogs
                : currentLogs.filter(log => log.level === selectedLevel);

            const logText = filteredLogs.map(log => {
                const timestamp = new Date(log.timestamp).toLocaleString('ko-KR');
                const details = log.details ? `\n상세: ${JSON.stringify(log.details, null, 2)}` : '';
                const stack = log.stack ? `\n스택: ${log.stack}` : '';
                return `[${timestamp}] [${log.level.toUpperCase()}] ${log.category ? `[${log.category}] ` : ''}${log.message}${details}${stack}`;
            }).join('\n\n');

            navigator.clipboard.writeText(logText).then(() => {
                showToast('로그가 클립보드에 복사되었습니다.', 'success');
            }).catch(err => {
                showToast('로그 복사에 실패했습니다.', 'error');
                console.error('Failed to copy logs:', err);
            });
        };
    }

    // 로그 내보내기
    if (logExportBtn) {
        logExportBtn.onclick = async () => {
            try {
                const result = await window.electronAPI.exportAppLogs();
                if (result.success) {
                    showToast(`로그가 ${result.filePath}에 저장되었습니다.`, 'success');
                } else {
                    showToast('로그 내보내기에 실패했습니다.', 'error');
                }
            } catch (error) {
                showToast('로그 내보내기에 실패했습니다.', 'error');
                console.error('Failed to export logs:', error);
            }
        };
    }

    // 오류보고 (Firebase로 전송)
    if (logSendFirebaseBtn) {
        logSendFirebaseBtn.onclick = async () => {
            if (!confirm('에러 로그를 개발자에게 전송하시겠습니까?\n\n약국명과 에러 정보가 전송됩니다.\n(개인정보는 포함되지 않습니다)')) {
                return;
            }

            try {
                logSendFirebaseBtn.disabled = true;
                logSendFirebaseBtn.textContent = '전송 중...';

                const result = await window.electronAPI.sendErrorsToFirebase();

                if (result.success) {
                    if (result.total === 0) {
                        showToast('전송할 에러 로그가 없습니다.', 'info');
                    } else {
                        showToast(`${result.successCount}개의 에러 로그를 전송했습니다.`, 'success');
                    }
                } else {
                    showToast(`전송 실패: ${result.message || result.error}`, 'error');
                }
            } catch (error) {
                showToast('전송 중 오류가 발생했습니다.', 'error');
                console.error('Failed to send errors to Firebase:', error);
            } finally {
                logSendFirebaseBtn.disabled = false;
                logSendFirebaseBtn.textContent = '오류보고';
            }
        };
    }

    // 로그 전체 삭제
    if (logDeleteAllBtn) {
        logDeleteAllBtn.onclick = async () => {
            if (!confirm('모든 로그를 삭제하시겠습니까?\n이 작업은 되돌릴 수 없습니다.')) {
                return;
            }

            try {
                const result = await window.electronAPI.deleteAllAppLogs();
                if (result.success) {
                    currentLogs = [];
                    renderLogs();
                    showToast('모든 로그가 삭제되었습니다.', 'success');
                } else {
                    showToast('로그 삭제에 실패했습니다.', 'error');
                }
            } catch (error) {
                showToast('로그 삭제에 실패했습니다.', 'error');
                console.error('Failed to delete logs:', error);
            }
        };
    }

    /**
     * 버전 정보 로드 및 표시
     */
    async function loadVersionInfo() {
        try {
            // 현재 버전 표시
            const currentVersion = await window.electronAPI.getAppVersion();
            const currentVersionElement = document.getElementById('current-version');
            if (currentVersionElement) {
                currentVersionElement.textContent = currentVersion;
            }

            // 최신 버전 확인 (비동기, 5초 타임아웃)
            const latestVersionElement = document.getElementById('latest-version');
            const latestVersionBadge = document.getElementById('latest-version-badge');
            const downloadBtn = document.getElementById('download-latest-btn');

            if (latestVersionElement && latestVersionBadge) {
                latestVersionElement.textContent = '확인중...';

                const latestVersion = await window.electronAPI.getLatestVersion();
                const downloadUrl = await window.electronAPI.getDownloadUrl();

                if (latestVersion) {
                    latestVersionElement.textContent = latestVersion;

                    // 버전 비교
                    if (compareVersions(currentVersion, latestVersion) < 0) {
                        // 최신 버전이 더 높음 (업데이트 필요)
                        latestVersionBadge.classList.add('outdated');

                        // 다운로드 버튼 표시
                        if (downloadBtn && downloadUrl) {
                            downloadBtn.style.display = 'inline-flex';
                            downloadBtn.onclick = async () => {
                                try {
                                    await window.electronAPI.openExternal(downloadUrl);
                                    showToast('다운로드 페이지를 열었습니다.', 'success');
                                } catch (error) {
                                    console.error('Failed to open download page:', error);
                                    showToast('다운로드 페이지를 열 수 없습니다.', 'error');
                                }
                            };
                        }
                    } else {
                        // 최신 버전임
                        latestVersionBadge.classList.remove('outdated');
                        if (downloadBtn) {
                            downloadBtn.style.display = 'none';
                        }
                    }
                } else {
                    // 확인 실패
                    latestVersionElement.textContent = '확인 실패';
                    latestVersionBadge.classList.remove('outdated');
                    if (downloadBtn) {
                        downloadBtn.style.display = 'none';
                    }
                }
            }
        } catch (error) {
            console.error('Failed to load version info:', error);
        }
    }

    /**
     * 버전 비교 함수
     * @param {string} v1 - 버전 1 (예: "1.0.1")
     * @param {string} v2 - 버전 2 (예: "1.0.2")
     * @returns {number} - v1 < v2이면 -1, v1 === v2이면 0, v1 > v2이면 1
     */
    function compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);

        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const num1 = parts1[i] || 0;
            const num2 = parts2[i] || 0;

            if (num1 < num2) return -1;
            if (num1 > num2) return 1;
        }

        return 0;
    }

    // Request initial data when the app loads
    window.electronAPI.getInitialData();
    loadBrotherPrinters();
    loadConfig(); // 설정 로드
    updateMedicineFailBadge(); // 미완성 약품 뱃지 업데이트
});
