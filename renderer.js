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
    const pharmacyNameInput = document.getElementById('pharmacy-name');
    const templatePathSelect = document.getElementById('template-path');
    
    // 라벨정보 관련 요소
    const labelInfoBtn = document.getElementById('label-info-btn');
    const labelInfoModal = document.getElementById('label-info-modal');
    const labelInfoClose = document.getElementById('label-info-close');
    const labelInfoOk = document.getElementById('label-info-ok');
    
    // 템플릿 미리보기 관련 요소
    const previewTemplateBtn = document.getElementById('preview-template-btn');
    const templatePreviewDiv = document.getElementById('template-preview');
    const previewImage = document.getElementById('preview-image');
    
    // 약품설정 관련 요소
    const medicineBtn = document.getElementById('medicine-btn');
    const medicineModal = document.getElementById('medicine-modal');
    const medicineModalClose = document.getElementById('medicine-modal-close');
    const medicineSearchInput = document.getElementById('medicine-search');
    const medicineSearchBtn = document.getElementById('medicine-search-btn');
    const medicineSearchResults = document.getElementById('medicine-search-results');
    const medicineEditForm = document.getElementById('medicine-edit-form');
    const medicineCancelBtn = document.getElementById('medicine-cancel-btn');
    const medicineSaveBtn = document.getElementById('medicine-save-btn');
    
    // 약품 편집 폼 필드
    const editMedicineCode = document.getElementById('edit-medicine-code');
    const editMedicineName = document.getElementById('edit-medicine-name');
    const editMedicineType = document.getElementById('edit-medicine-type');
    const editMedicineEfficacy = document.getElementById('edit-medicine-efficacy');
    const editMedicineUnit = document.getElementById('edit-medicine-unit');
    const editMedicineStorageTemp = document.getElementById('edit-medicine-storage-temp');
    const editMedicineStorageContainer = document.getElementById('edit-medicine-storage-container');
    const editMedicineAutoPrint = document.getElementById('edit-medicine-auto-print');

    let prescriptions = []; // This will hold the list of prescriptions for the selected date
    let selectedPrescriptionIndex = -1;
    let currentConfig = {}; // 현재 설정 저장
    
    // Brother 프린터 목록 로드
    async function loadBrotherPrinters() {
        try {
            const result = await window.electronAPI.getBrotherPrinters();
            printerSelect.innerHTML = '';
            
            if (result.success && result.printers.length > 0) {
                result.printers.forEach(printer => {
                    const option = document.createElement('option');
                    option.value = printer;
                    option.textContent = printer;
                    printerSelect.appendChild(option);
                });
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Brother 프린터를 찾을 수 없습니다';
                printerSelect.appendChild(option);
                
                // 진단 실행
                try {
                    const diagnosis = await window.electronAPI.diagnoseBPac();
                    if (diagnosis.success) {
                    }
                } catch (diagError) {
                    console.error('진단 실행 실패:', diagError);
                }
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
                let html = `<span><strong>환자: ${data.patientName}</strong> (${data.patientId}) / 접수번호: ${data.receiptNum} / 병원: ${data.hospitalName} / 처방일: ${data.receiptDate}</span>`;
                itemDiv.innerHTML = html;
            }
            prescriptionListContainer.prepend(itemDiv); // Prepend to display newest at top
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
            
            // 약품명 - medicine.json의 title 우선 사용 (medicineInfo가 있으면 사용, 없으면 name 사용)
            const medicineNameCell = row.insertCell();
            medicineNameCell.textContent = med.medicineInfo?.title || med.name || '-';
            medicineNameCell.style.cursor = 'pointer';
            medicineNameCell.style.color = '#0056b3';
            medicineNameCell.style.textDecoration = 'underline';
            medicineNameCell.onclick = () => showMedicineDetail(med.code);
            
            // 전문/일반 구분 제거됨
            
            row.insertCell().textContent = med.prescriptionDays;
            row.insertCell().textContent = med.singleDose;
            row.insertCell().textContent = med.dailyDose;
        });
    }

    function sortPrescriptions(data) {
        // Sort by timestamp in ascending order (oldest first)
        return data.sort((a, b) => a.timestamp - b.timestamp);
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
            if (dateStr === today) {
                option.selected = true;
            }
            dateSelect.appendChild(option);
        });

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
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        
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
            pharmacyNameInput.value = currentConfig.pharmacyName || '';
            
            // ATC 서버 경로 설정
            const atcPathInput = document.getElementById('atc-path');
            if (atcPathInput) {
                atcPathInput.value = currentConfig.atcPath || 'C:\\atc';
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
        if (event.target === medicineModal) {
            medicineModal.style.display = 'none';
        }
    });
    
    // 설정 저장
    settingsForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        
        // 약국명 확인
        if (!pharmacyNameInput.value || pharmacyNameInput.value.trim() === '') {
            alert('약국명을 반드시 입력해주세요.');
            pharmacyNameInput.focus();
            return;
        }
        
        const atcPathInput = document.getElementById('atc-path');
        const config = {
            pharmacyName: pharmacyNameInput.value.trim(),
            templatePath: templatePathSelect.value || './templates/default.lbx',
            atcPath: atcPathInput ? atcPathInput.value : 'C:\\atc'
        };
        
        try {
            const result = await window.electronAPI.saveConfig(config);
            if (result.success) {
                currentConfig = config;
                
                // 경고 메시지 제거
                const warningDiv = settingsModal.querySelector('.initial-warning');
                if (warningDiv) {
                    warningDiv.remove();
                }
                pharmacyNameInput.style.borderColor = '';
                pharmacyNameInput.style.borderWidth = '';
                
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
    
    // 라벨정보 버튼 이벤트
    labelInfoBtn.addEventListener('click', () => {
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

    // 약품설정 버튼 이벤트
    medicineBtn.addEventListener('click', () => {
        medicineModal.style.display = 'block';
        medicineSearchInput.value = '';
        medicineSearchResults.style.display = 'none';
        medicineEditForm.style.display = 'none';
        updateMedicineFailBadge(); // 미완성 약품 개수 업데이트
        addFailedMedicineButton(); // 미완성 약품 목록 버튼 추가
    });
    
    // 약품설정 모달 닫기
    medicineModalClose.addEventListener('click', () => {
        medicineModal.style.display = 'none';
    });
    
    medicineCancelBtn.addEventListener('click', () => {
        medicineModal.style.display = 'none';
    });
    
    // 약품 상세정보 모달 관련 요소
    const medicineDetailModal = document.getElementById('medicine-detail-modal');
    const medicineDetailClose = document.getElementById('medicine-detail-close');
    const medicineDetailOk = document.getElementById('medicine-detail-ok');
    
    // 약품 상세정보 모달 닫기
    medicineDetailClose.addEventListener('click', () => {
        medicineDetailModal.style.display = 'none';
    });
    
    medicineDetailOk.addEventListener('click', () => {
        medicineDetailModal.style.display = 'none';
    });
    
    // 모달 외부 클릭 시 닫기
    window.addEventListener('click', (event) => {
        if (event.target === medicineDetailModal) {
            medicineDetailModal.style.display = 'none';
        }
    });
    
    // 약품 상세정보 표시 함수
    async function showMedicineDetail(medicineCode) {
        try {
            const result = await window.electronAPI.getMedicineDetail(medicineCode);
            
            if (!result.success) {
                showToast(result.error || '약품 정보를 불러올 수 없습니다.', 'error');
                return;
            }
            
            const medicine = result.medicine;
            
            // 모달 제목 설정
            document.getElementById('medicine-detail-title').textContent = `약품 상세정보 - ${medicine.title || medicine.code}`;
            
            // 기본 정보
            document.getElementById('detail-code').textContent = medicine.code || '-';
            document.getElementById('detail-name').textContent = medicine.title || '-';
            document.getElementById('detail-mfg').textContent = medicine.mfg || '-';
            document.getElementById('detail-type').textContent = medicine.type || '-';
            document.getElementById('detail-efficacy').textContent = medicine.mdfsCodeName || '-';
            document.getElementById('detail-formulation').textContent = medicine.formulation || '-';
            document.getElementById('detail-unit').textContent = medicine.unit || '-';
            document.getElementById('detail-inject-path').textContent = medicine.injectPath || '-';
            
            // 보관방법
            document.getElementById('detail-storage-temp').textContent = medicine.storageTemp || '-';
            document.getElementById('detail-storage-container').textContent = medicine.storageContainer || '-';
            
            // 급여정보
            document.getElementById('detail-pay-type').textContent = medicine.payType || '-';
            document.getElementById('detail-price').textContent = medicine.price ? `${medicine.price}원` : '-';
            
            // 효능효과
            const effectsDiv = document.getElementById('detail-effects');
            if (medicine.effects) {
                try {
                    const effects = JSON.parse(medicine.effects);
                    if (Array.isArray(effects) && effects.length > 0) {
                        effectsDiv.innerHTML = effects.map(effect => `<div style="margin-bottom: 5px;">• ${effect}</div>`).join('');
                    } else {
                        effectsDiv.textContent = '-';
                    }
                } catch (e) {
                    effectsDiv.textContent = medicine.effects || '-';
                }
            } else {
                effectsDiv.textContent = '-';
            }
            
            // 기타정보
            document.getElementById('detail-is-etc').textContent = medicine.isETC === 1 ? '전문의약품' : '일반의약품';
            document.getElementById('detail-api-fetched').textContent = medicine.api_fetched === 1 ? '완료' : '미완료';
            document.getElementById('detail-auto-print').textContent = medicine.autoPrint === 1 ? '사용' : '미사용';
            // 업데이트일 - 날짜만 표시 (YYYY-MM-DD)
            const updateDate = medicine.updateDate ? medicine.updateDate.split(' ')[0] : '-';
            document.getElementById('detail-update-date').textContent = updateDate;
            
            // 모달 표시
            medicineDetailModal.style.display = 'block';
            
        } catch (error) {
            console.error('약품 상세정보 조회 오류:', error);
            showToast('약품 정보를 불러오는 중 오류가 발생했습니다.', 'error');
        }
    }
    
    // 전역에서 사용할 수 있도록 window 객체에 추가
    window.showMedicineDetail = showMedicineDetail;
    
    // 약품 검색
    async function searchMedicine() {
        const searchTerm = medicineSearchInput.value.trim();
        if (!searchTerm) {
            alert('검색어를 입력해주세요.');
            return;
        }
        
        try {
            const result = await window.electronAPI.searchMedicine(searchTerm);
            if (result.success && result.medicines.length > 0) {
                displaySearchResults(result.medicines);
            } else {
                medicineSearchResults.innerHTML = '<div style="padding: 10px; text-align: center; color: #666;">검색 결과가 없습니다.</div>';
                medicineSearchResults.style.display = 'block';
            }
        } catch (error) {
            console.error('약품 검색 오류:', error);
            alert('약품 검색 중 오류가 발생했습니다.');
        }
    }
    
    // 검색 결과 표시
    function displaySearchResults(medicines) {
        medicineSearchResults.innerHTML = '';
        medicines.forEach(medicine => {
            const item = document.createElement('div');
            item.style.cssText = 'padding: 8px; border-bottom: 1px solid #eee; cursor: pointer; hover: background-color: #f5f5f5;';
            item.innerHTML = `
                <strong>${medicine.code}</strong> - ${medicine.title || '약품명 없음'}<br>
                <small style="color: #666;">${medicine.mdfsCodeName || '유형 없음'}</small>
            `;
            item.addEventListener('mouseenter', () => {
                item.style.backgroundColor = '#f5f5f5';
            });
            item.addEventListener('mouseleave', () => {
                item.style.backgroundColor = 'white';
            });
            item.addEventListener('click', () => loadMedicineForEdit(medicine.code));
            medicineSearchResults.appendChild(item);
        });
        medicineSearchResults.style.display = 'block';
    }
    
    // 약품 편집을 위해 로드
    async function loadMedicineForEdit(code, isFailedMedicine = false) {
        try {
            const result = await window.electronAPI.getSingleMedicine(code);
            if (result.success && result.medicine) {
                const medicine = result.medicine;
                editMedicineCode.value = medicine.code;
                editMedicineName.value = medicine.title || '';
                
                // type 필드와 mdfsCodeName 필드 사용
                editMedicineType.value = medicine.type || '';
                editMedicineEfficacy.value = medicine.mdfsCodeName || '';
                editMedicineUnit.value = medicine.unit || '정';
                editMedicineStorageTemp.value = medicine.storageTemp || '';
                editMedicineStorageContainer.value = medicine.storageContainer || '';
                editMedicineAutoPrint.checked = medicine.autoPrint || false;
                
                medicineEditForm.style.display = 'block';
                medicineSearchResults.style.display = 'none';
                
                // 모든 약품에 대해 자동입력 버튼 표시
                showAutoFillButton(true);
            }
        } catch (error) {
            console.error('약품 정보 로드 오류:', error);
            alert('약품 정보를 불러오는 중 오류가 발생했습니다.');
        }
    }
    
    // 약품 검색 버튼 클릭
    medicineSearchBtn.addEventListener('click', searchMedicine);
    
    // 약품 검색 엔터키
    medicineSearchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            searchMedicine();
        }
    });
    
    // 약품 정보 저장
    medicineSaveBtn.addEventListener('click', async () => {
        const medicineData = {
            code: editMedicineCode.value,
            title: editMedicineName.value,
            type: editMedicineType.value,
            mdfsCodeName: editMedicineEfficacy.value,
            unit: editMedicineUnit.value,
            storageTemp: editMedicineStorageTemp.value,
            storageContainer: editMedicineStorageContainer.value,
            autoPrint: editMedicineAutoPrint.checked
        };
        
        try {
            const result = await window.electronAPI.updateMedicine(medicineData);
            if (result.success) {
                showToast('약품 정보가 업데이트되었습니다.', 'success');
                medicineModal.style.display = 'none';
                updateMedicineFailBadge(); // 뱃지 업데이트
            } else {
                showToast('약품 정보 업데이트 실패: ' + result.error, 'error');
            }
        } catch (error) {
            console.error('약품 저장 오류:', error);
            showToast('약품 정보 저장 중 오류가 발생했습니다.', 'error');
        }
    });
    
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
    
    // 미완성 약품 목록 보기 버튼 추가
    function addFailedMedicineButton() {
        const buttonContainer = document.querySelector('.medicine-fail-button-container');
        if (!buttonContainer) return;
        
        // 이미 버튼이 있으면 추가하지 않음
        if (document.getElementById('show-failed-medicines')) return;
        
        const failBtn = document.createElement('button');
        failBtn.id = 'show-failed-medicines';
        failBtn.textContent = '약품 정보 미완성 약품목록 보기';
        failBtn.style.cssText = `
            margin-bottom: 10px;
            padding: 8px 16px;
            background: #ff6b6b;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            width: 100%;
        `;
        failBtn.addEventListener('click', showFailedMedicines);
        
        buttonContainer.appendChild(failBtn);
    }
    
    // 미완성 약품 목록 표시
    async function showFailedMedicines() {
        const buttonContainer = document.querySelector('.medicine-fail-button-container');
        if (!buttonContainer) return;
        
        // 이미 목록이 표시되어 있으면 제거
        const existingList = document.getElementById('failed-medicines-list');
        if (existingList) {
            existingList.remove();
            return;
        }
        
        try {
            const result = await window.electronAPI.getMedicineFails();
            if (result.success && result.data.length > 0) {
                const listContainer = document.createElement('div');
                listContainer.id = 'failed-medicines-list';
                listContainer.style.cssText = `
                    background: white;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    padding: 15px;
                    margin-bottom: 15px;
                    max-height: 300px;
                    overflow-y: auto;
                `;
                
                const title = document.createElement('h4');
                title.textContent = '미완성 약품 목록';
                title.style.cssText = `
                    margin-top: 0;
                    margin-bottom: 10px;
                    color: #333;
                `;
                listContainer.appendChild(title);
                
                const list = document.createElement('div');
                result.data.forEach(fail => {
                    const item = document.createElement('div');
                    item.style.cssText = `
                        padding: 8px;
                        border-bottom: 1px solid #eee;
                        cursor: pointer;
                        transition: background-color 0.2s;
                    `;
                    item.innerHTML = `
                        <strong>${fail.code}</strong> - ${fail.name || '약품명 없음'}<br>
                        <small style="color: #666;">실패 사유: ${fail.reason}</small><br>
                        <small style="color: #999;">실패 시간: ${new Date(fail.failedAt).toLocaleString()}</small>
                    `;
                    item.addEventListener('mouseenter', () => {
                        item.style.backgroundColor = '#f5f5f5';
                    });
                    item.addEventListener('mouseleave', () => {
                        item.style.backgroundColor = 'white';
                    });
                    item.addEventListener('click', () => {
                        listContainer.remove();
                        loadMedicineForEdit(fail.code, true);
                    });
                    list.appendChild(item);
                });
                listContainer.appendChild(list);
                
                const closeBtn = document.createElement('button');
                closeBtn.textContent = '닫기';
                closeBtn.style.cssText = `
                    margin-top: 10px;
                    padding: 6px 12px;
                    background: #666;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                `;
                closeBtn.addEventListener('click', () => {
                    listContainer.remove();
                });
                listContainer.appendChild(closeBtn);
                
                // 버튼 아래에 목록 추가
                const failBtn = document.getElementById('show-failed-medicines');
                if (failBtn) {
                    failBtn.parentNode.insertBefore(listContainer, failBtn.nextSibling);
                }
            } else {
                // alert 대신 DOM에 메시지 표시
                const messageDiv = document.createElement('div');
                messageDiv.style.cssText = `
                    background: #f8f9fa;
                    border: 1px solid #dee2e6;
                    border-radius: 4px;
                    padding: 10px;
                    margin-bottom: 10px;
                    color: #6c757d;
                    text-align: center;
                `;
                messageDiv.textContent = '미완성 약품이 없습니다.';
                
                const failBtn = document.getElementById('show-failed-medicines');
                if (failBtn) {
                    failBtn.parentNode.insertBefore(messageDiv, failBtn.nextSibling);
                    // 3초 후 자동으로 제거
                    setTimeout(() => {
                        messageDiv.remove();
                    }, 3000);
                }
            }
        } catch (error) {
            console.error('미완성 약품 목록 조회 실패:', error);
            // alert 대신 DOM에 에러 메시지 표시
            const errorDiv = document.createElement('div');
            errorDiv.style.cssText = `
                background: #f8d7da;
                border: 1px solid #f5c6cb;
                border-radius: 4px;
                padding: 10px;
                margin-bottom: 10px;
                color: #721c24;
                text-align: center;
            `;
            errorDiv.textContent = '미완성 약품 목록을 불러오는 중 오류가 발생했습니다.';
            
            const failBtn = document.getElementById('show-failed-medicines');
            if (failBtn) {
                failBtn.parentNode.insertBefore(errorDiv, failBtn.nextSibling);
                // 5초 후 자동으로 제거
                setTimeout(() => {
                    errorDiv.remove();
                }, 5000);
            }
        }
    }
    
    // 자동입력 버튼 표시/숨김
    function showAutoFillButton(show) {
        let autoFillBtn = document.getElementById('auto-fill-btn');
        
        if (show) {
            if (!autoFillBtn) {
                autoFillBtn = document.createElement('button');
                autoFillBtn.id = 'auto-fill-btn';
                autoFillBtn.textContent = '자동입력';
                autoFillBtn.style.cssText = `
                    padding: 8px 16px;
                    background: #4CAF50;
                    color: white;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    margin-right: 10px;
                `;
                autoFillBtn.addEventListener('click', autoFillMedicine);
                
                const buttonContainer = medicineSaveBtn.parentElement;
                buttonContainer.insertBefore(autoFillBtn, medicineSaveBtn);
            }
            autoFillBtn.style.display = 'inline-block';
        } else {
            if (autoFillBtn) {
                autoFillBtn.style.display = 'none';
            }
        }
    }
    
    // 약품 정보 자동입력
    async function autoFillMedicine() {
        const code = editMedicineCode.value;
        if (!code) {
            showToast('약품 코드가 없습니다.', 'error');
            return;
        }
        
        const autoFillBtn = document.getElementById('auto-fill-btn');
        autoFillBtn.disabled = true;
        autoFillBtn.textContent = '처리 중...';
        
        try {
            const result = await window.electronAPI.autoFillMedicine(code);
            if (result.success) {
                showToast(result.message, 'success');
                // 약품 정보 다시 로드
                await loadMedicineForEdit(code, false);
                updateMedicineFailBadge(); // 뱃지 업데이트
            } else {
                showToast(result.error, 'error');
            }
        } catch (error) {
            console.error('자동입력 실패:', error);
            showToast('자동 입력에 실패했습니다. 직접 입력하던가 나중에 다시 시도하세요.', 'error');
        } finally {
            autoFillBtn.disabled = false;
            autoFillBtn.textContent = '자동입력';
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
    
    // 초기 설정 표시 이벤트 리스너
    window.electronAPI.onShowInitialSetup(() => {
        showInitialSetup();
    });
    
    // 초기 설정 표시 함수
    async function showInitialSetup() {
        await loadConfig();
        await loadTemplates();
        
        // 약국명이 없으면 경고 메시지 표시
        if (!currentConfig.pharmacyName || currentConfig.pharmacyName === "") {
            // 설정 모달에 경고 메시지 추가
            const warningDiv = document.createElement('div');
            warningDiv.style.cssText = `
                background-color: #fff3cd;
                border: 1px solid #ffc107;
                color: #856404;
                padding: 10px;
                margin-bottom: 15px;
                border-radius: 4px;
                font-weight: bold;
            `;
            warningDiv.innerHTML = '⚠️ 처음 실행하셨습니다. 약국명을 반드시 입력해주세요.';
            
            const modalContent = settingsModal.querySelector('.modal-content');
            const existingWarning = modalContent.querySelector('.initial-warning');
            if (existingWarning) {
                existingWarning.remove();
            }
            warningDiv.className = 'initial-warning';
            modalContent.insertBefore(warningDiv, modalContent.firstChild);
            
            // 약국명 입력 필드에 포커스
            pharmacyNameInput.focus();
            pharmacyNameInput.style.borderColor = '#ffc107';
            pharmacyNameInput.style.borderWidth = '2px';
        }
        
        settingsModal.style.display = 'block';
    }
    
    // 첫 실행 체크
    async function checkFirstRun() {
        const isFirstRun = await window.electronAPI.checkFirstRun();
        if (isFirstRun) {
            setTimeout(() => {
                showInitialSetup();
            }, 500); // 화면이 완전히 로드된 후 표시
        }
    }
    
    // Request initial data when the app loads
    window.electronAPI.getInitialData();
    loadBrotherPrinters();
    loadConfig(); // 설정 로드
    updateMedicineFailBadge(); // 미완성 약품 뱃지 업데이트
    checkFirstRun(); // 첫 실행 체크
});
