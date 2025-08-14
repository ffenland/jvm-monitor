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
            row.insertCell().textContent = med.medicineInfo?.title || med.name || '-';
            
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
        // Clear existing options
        dateSelect.innerHTML = '';
        // Repopulate with updated dates
        updatedDates.forEach(dateStr => {
            const option = document.createElement('option');
            option.value = dateStr;
            option.textContent = `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
            dateSelect.appendChild(option);
        });
        // Optionally, select the newest date or keep the current selection if it still exists
        if (updatedDates.length > 0) {
            dateSelect.value = updatedDates[0]; // Select the newest date
            window.electronAPI.getDataForDate(updatedDates[0]); // Load data for the newly selected date
        }
    });

    // 설정 관련 함수들
    async function loadConfig() {
        try {
            currentConfig = await window.electronAPI.getConfig();
            pharmacyNameInput.value = currentConfig.pharmacyName || '';
            
            // 템플릿 선택 상태 업데이트
            if (currentConfig.templatePath && templatePathSelect.options.length > 0) {
                for (let i = 0; i < templatePathSelect.options.length; i++) {
                    if (templatePathSelect.options[i].value === currentConfig.templatePath) {
                        templatePathSelect.selectedIndex = i;
                        break;
                    }
                }
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
        
        const config = {
            pharmacyName: pharmacyNameInput.value,
            templatePath: templatePathSelect.value || './templates/testTemplate.lbx'
        };
        
        try {
            const result = await window.electronAPI.saveConfig(config);
            if (result.success) {
                currentConfig = config;
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
    });
    
    // 약품설정 모달 닫기
    medicineModalClose.addEventListener('click', () => {
        medicineModal.style.display = 'none';
    });
    
    medicineCancelBtn.addEventListener('click', () => {
        medicineModal.style.display = 'none';
    });
    
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
    async function loadMedicineForEdit(code) {
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
                alert('약품 정보가 업데이트되었습니다.');
                medicineModal.style.display = 'none';
            } else {
                alert('약품 정보 업데이트 실패: ' + result.error);
            }
        } catch (error) {
            console.error('약품 저장 오류:', error);
            alert('약품 정보 저장 중 오류가 발생했습니다.');
        }
    });
    
    // Request initial data when the app loads
    window.electronAPI.getInitialData();
    loadBrotherPrinters();
    loadConfig(); // 설정 로드
});
