/**
 * 약품 라벨 데이터 가공 모듈
 *
 * 이 모듈은 라벨 출력을 위한 데이터 가공을 담당합니다.
 */

/**
 * 처방전 데이터를 라벨 출력용으로 가공하는 함수
 * @param {object} rawData 원본 데이터
 * @returns {object} 가공된 데이터
 */
function processPrescriptionData(rawData) {
    const data = {
        patientName: rawData.name || rawData.patientName || '',
        hospitalName: rawData.hos || rawData.hospitalName || '',
        receiptDate: rawData.recvDate || rawData.receiptDate || '',
        prepareDate: rawData.prepareDate || new Date().toLocaleDateString('ko-KR'),
        receiptNum:  rawData.receiptNum || '',
        doctorName: rawData.doc || rawData.doctorName || '',
        medicines: rawData.medicines || []
    };
    
    // 약품 목록 가공
    const processedMedicines = data.medicines.map((medicine, index) => ({
        ...medicine,
        number: index + 1,
        fullText: `${medicine.name} - ${medicine.dosage || ''} ${medicine.frequency || ''}`
    }));
    
    return {
        ...data,
        medicines: processedMedicines,
        medicineCount: processedMedicines.length,
        // 추가 가공 필드
        formattedDate: formatDate(data.prepareDate),
        patientInfo: `${data.patientName} 님`
    };
}

/**
 * 날짜 형식 변환
 * @param {string} dateStr 날짜 문자열
 * @returns {string} 포맷된 날짜
 */
function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

/**
 * 종료일 계산
 * @param {string} startDate 시작일
 * @param {string} days 일수
 * @returns {string} 종료일
 */
function calculateEndDate(startDate, days) {
    try {
        const start = new Date(startDate);
        const daysNum = parseInt(days) || 0;
        const end = new Date(start);
        end.setDate(start.getDate() + daysNum - 1);
        return end.toLocaleDateString('ko-KR');
    } catch (e) {
        return '';
    }
}

module.exports = {
    processPrescriptionData,
    formatDate,
    calculateEndDate
};