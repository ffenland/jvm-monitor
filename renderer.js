window.addEventListener('DOMContentLoaded', () => {
    const logContainer = document.getElementById('log-container');
    const parsedDataDisplay = document.getElementById('parsed-data-display');

    window.electronAPI.onLogMessage((message) => {
        const p = document.createElement('p');
        p.className = 'log-message';
        p.textContent = message;
        logContainer.appendChild(p);
        logContainer.scrollTop = logContainer.scrollHeight; // Auto-scroll to bottom
    });

    window.electronAPI.onParsedData((data) => {
        console.log('Received parsed data:', data); // Add this log
        if (parsedDataDisplay) {
            let html = `<h3>Patient: ${data.patientName} (${data.patientId})</h3>`;
            html += `<p>Hospital: ${data.hospitalName} / Date: ${data.receiptDate}</p>`;
            html += `<h4>Medicines:</h4>`;
            html += `<ul>`;
            data.medicines.forEach(med => {
                html += `<li><strong>${med.name}</strong> (Code: ${med.code})<br>`;
                html += `  Days: ${med.prescriptionDays}, Daily: ${med.dailyDose}, Single: ${med.singleDose}</li>`;
            });
            html += `</ul>`;
            parsedDataDisplay.innerHTML = html;
        }
    });
});
