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
                console.log(`${result.printers.length}개의 Brother 프린터를 찾았습니다.`);
            } else {
                const option = document.createElement('option');
                option.value = '';
                option.textContent = 'Brother 프린터를 찾을 수 없습니다';
                printerSelect.appendChild(option);
                
                // 진단 실행
                try {
                    const diagnosis = await window.electronAPI.diagnoseBPac();
                    if (diagnosis.success) {
                        console.log('b-PAC 진단 결과:', diagnosis.diagnosis);
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

            let html = `<span><strong>환자: ${data.patientName}</strong> (${data.patientId}) / 접수번호: ${data.medicationNumber} / 병원: ${data.hospitalName} / 처방일: ${data.receiptDate}</span>`;
            itemDiv.innerHTML = html;
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

        // Add Print Button
        const printButton = document.createElement('button');
        printButton.id = 'print-btn';
        printButton.textContent = '라벨 출력';
        printButton.addEventListener('click', async () => {
            const selectedPrinter = printerSelect.value;
            if (!selectedPrinter) {
                alert('프린터를 선택해주세요.');
                return;
            }
            
            if (selectedPrescriptionIndex > -1) {
                const prescriptionToPrint = prescriptions[selectedPrescriptionIndex];
                
                try {
                    // 상태 표시
                    printButton.disabled = true;
                    printButton.textContent = '출력 중...';
                    
                    // 새로운 API 사용
                    const result = await window.electronAPI.printPrescription(prescriptionToPrint, selectedPrinter);
                    
                    if (result.success) {
                        alert('라벨이 성공적으로 출력되었습니다.');
                    } else {
                        alert(`출력 실패: ${result.error}`);
                    }
                } catch (error) {
                    console.error('출력 오류:', error);
                    alert('출력 중 오류가 발생했습니다.');
                } finally {
                    printButton.disabled = false;
                    printButton.textContent = '라벨 출력';
                }
            } else {
                alert('출력할 처방전을 선택해주세요.');
            }
        });
        detailView.insertBefore(printButton, detailView.firstChild);


        detailMedicineListTableBody.innerHTML = ''; // Clear existing medicine list
        data.medicines.forEach((med, index) => {
            const row = detailMedicineListTableBody.insertRow();
            
            // 라벨출력 버튼 추가 (종류 필드 대체)
            const buttonCell = row.insertCell();
            const labelButton = document.createElement('button');
            labelButton.textContent = '라벨출력';
            labelButton.style.cssText = 'padding: 3px 8px; font-size: 12px; background-color: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
            labelButton.onclick = async () => {
                const selectedPrinter = printerSelect.value;
                if (!selectedPrinter) {
                    alert('프린터를 선택해주세요.');
                    return;
                }
                
                // 오늘 날짜
                const today = new Date();
                const dateStr = `${today.getFullYear()}년${String(today.getMonth() + 1).padStart(2, '0')}월${String(today.getDate()).padStart(2, '0')}일`;
                
                // 라벨 데이터 준비
                const labelData = {
                    medicineName: med.name,
                    dailyDose: med.dailyDose,
                    singleDose: med.singleDose,
                    prescriptionDays: med.prescriptionDays,
                    patientName: data.patientName,
                    date: dateStr
                };
                
                try {
                    labelButton.disabled = true;
                    labelButton.textContent = '출력 중...';
                    
                    const result = await window.electronAPI.printMedicineLabel(labelData, selectedPrinter);
                    
                    if (result.success) {
                        alert('라벨이 성공적으로 출력되었습니다.');
                    } else {
                        alert(`라벨 출력 실패: ${result.error}`);
                    }
                } catch (error) {
                    console.error('라벨 출력 오류:', error);
                    alert('라벨 출력 중 오류가 발생했습니다.');
                } finally {
                    labelButton.disabled = false;
                    labelButton.textContent = '라벨출력';
                }
            };
            buttonCell.appendChild(labelButton);
            
            row.insertCell().textContent = med.code;
            row.insertCell().textContent = med.name;
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

    window.electronAPI.onParsedData((data) => {
        const preparationDate = data.preparationDate; // Assuming preparationDate is now part of data
        if (preparationDate === dateSelect.value) {
             // Check if this data already exists (e.g., if the file was re-processed)
             // Add new entry, allowing duplicates as requested
             prescriptions.push(data);
             updatePrescriptionsAndDisplay(prescriptions);
        }
    });

    window.electronAPI.onPrintLabelResult((result) => {
        console.log('Print result:', result);
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
                    console.log('Template fields:', result.fields);
                    console.log('Available fields in template:', result.fields.map(f => f.name).join(', '));
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

    // Request initial data when the app loads
    window.electronAPI.getInitialData();
    loadBrotherPrinters();
    loadConfig(); // 설정 로드
});
