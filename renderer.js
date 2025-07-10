window.addEventListener('DOMContentLoaded', () => {
    const parsedDataDisplay = document.getElementById('parsed-data-display');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const pageInfo = document.getElementById('page-info');
    const dateSelect = document.getElementById('date-select');

    let history = [];
    let currentIndex = -1;

    function updateDisplay(data) {
        if (!data) {
            parsedDataDisplay.innerHTML = '<p>표시할 데이터가 없습니다.</p>';
            return;
        }
        let html = `<div class="patient-info">`;
        html += `<h3>환자: ${data.patientName} (${data.patientId})</h3>`;
        html += `<p>병원: ${data.hospitalName} / 처방일: ${data.receiptDate}</p>`;
        html += `</div>`;
        html += `<div class="medicine-list">`;
        html += `<h4>처방 약품:</h4>`;
        html += `<ul>`;
        data.medicines.forEach(med => {
            html += `<li><strong>${med.name}</strong> (코드: ${med.code})<br>`;
            html += `  투약일수: ${med.prescriptionDays}일, 1일 투여량: ${med.dailyDose}, 1회 투여량: ${med.singleDose}</li>`;
        });
        html += `</ul>`;
        html += `</div>`;
        parsedDataDisplay.innerHTML = html;
    }

    function updatePagination() {
        if (history.length === 0) {
            pageInfo.textContent = '기록 없음';
            prevBtn.disabled = true;
            nextBtn.disabled = true;
            return;
        }
        pageInfo.textContent = `${currentIndex + 1} / ${history.length}`;
        prevBtn.disabled = currentIndex <= 0;
        nextBtn.disabled = currentIndex >= history.length - 1;
    }
    
    function sortHistory(data) {
        return data.sort((a, b) => {
            const dateComparison = b.receiptDateRaw.localeCompare(a.receiptDateRaw);
            if (dateComparison !== 0) return dateComparison;
            return b.medicationNumber - a.medicationNumber;
        });
    }

    function updateHistoryAndDisplay(data) {
        history = sortHistory(data);
        currentIndex = history.length > 0 ? 0 : -1;
        updateDisplay(history[currentIndex]);
        updatePagination();
    }

    prevBtn.addEventListener('click', () => {
        if (currentIndex > 0) {
            currentIndex--;
            updateDisplay(history[currentIndex]);
            updatePagination();
        }
    });

    nextBtn.addEventListener('click', () => {
        if (currentIndex < history.length - 1) {
            currentIndex++;
            updateDisplay(history[currentIndex]);
            updatePagination();
        }
    });

    dateSelect.addEventListener('change', (event) => {
        const selectedDate = event.target.value;
        window.electronAPI.getDataForDate(selectedDate);
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

        updateHistoryAndDisplay(data);
    });

    window.electronAPI.onDataForDate((data) => {
        updateHistoryAndDisplay(data);
    });

    window.electronAPI.onParsedData((data) => {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
        const match = data.fileName.match(/Copy\d+-(\d{8})(\d{6})\.txt/);
        const preparationDate = match ? match[1] : null;

        if (preparationDate === dateSelect.value) {
             history.push(data);
             updateHistoryAndDisplay(history);
        }
    });

    // Request initial data when the app loads
    window.electronAPI.getInitialData();
});
