const { ipcMain } = require('electron');

/**
 * 처방전 관련 IPC 핸들러
 */
function registerPrescriptionHandlers(dbManager, getMainWindow) {
    // 초기 데이터 가져오기 (오늘 날짜 처방전)
    ipcMain.on('get-initial-data', (event) => {
        const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

        // 파싱 이력 기반으로 오늘 날짜의 처방전 가져오기
        const todayPrescriptions = dbManager.getPrescriptionsByParsingDate(today);

        // timestamp 추가 및 약품 정보 매핑
        const todayData = todayPrescriptions.map((prescription, index) => ({
            ...prescription,
            medicines: prescription.medicines.map(med => ({
                code: med.medicineCode,
                name: med.drug_name,
                prescriptionDays: med.prescriptionDays,
                dailyDose: med.dailyDose,
                singleDose: med.singleDose,
                medicineInfo: dbManager.getMedicineByBohcode(med.medicineCode)
            })),
            timestamp: prescription.parsedAt ? new Date(prescription.parsedAt).getTime() : Date.now() - (1000 * index)
        }));

        // 사용 가능한 날짜 목록 가져오기 (파싱 이력 기반)
        const dbDatesQuery = dbManager.db.prepare('SELECT DISTINCT parsedDate FROM parsing_history ORDER BY parsedDate DESC').all();
        let allDates = dbDatesQuery.map(row => row.parsedDate);

        // 오늘 날짜가 목록에 없으면 추가 (항상 첫 번째 위치에)
        if (!allDates.includes(today)) {
            allDates.unshift(today);
        } else {
            // 오늘 날짜가 있으면 첫 번째 위치로 이동
            allDates = allDates.filter(date => date !== today);
            allDates.unshift(today);
        }

        // 오늘 날짜의 데이터가 없어도 오늘 날짜를 선택하고 빈 배열 전송
        event.sender.send('initial-data', { data: todayData, dates: allDates, today: today });
    });

    // 특정 날짜 데이터 가져오기
    ipcMain.on('get-data-for-date', (event, date) => {
        // 파싱 이력 기반으로 데이터 가져오기
        const dbData = dbManager.getPrescriptionsByParsingDate(date);

        // 약품 정보 매핑 및 timestamp 추가
        const data = dbData.map((prescription, index) => ({
            ...prescription,
            medicines: prescription.medicines.map(med => ({
                code: med.medicineCode,
                name: med.drug_name,
                prescriptionDays: med.prescriptionDays,
                dailyDose: med.dailyDose,
                singleDose: med.singleDose,
                medicineInfo: dbManager.getMedicineByBohcode(med.medicineCode)
            })),
            timestamp: prescription.parsedAt ? new Date(prescription.parsedAt).getTime() : Date.now() - (1000 * index)
        }));

        event.sender.send('data-for-date', data);
    });
}

module.exports = { registerPrescriptionHandlers };
