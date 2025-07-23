/**
 * 약품 라벨 데이터 가공 모듈
 */

/**
 * label1.lbx 템플릿용 데이터 가공 함수
 * @param {object} rawData 원본 데이터
 * @returns {object} label1.lbx 템플릿에 맞게 가공된 데이터
 */
function processLabel1Data(rawData) {
    // 오늘 날짜 가져오기
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const formattedDate = `${year}.${month}.${day}`;
    
    // 가공된 데이터
    const processedData = {
        // 환자명은 그대로
        patientName: rawData.patientName || '',
        
        // 약품 종류는 "먹는약"으로 고정
        medicineType: '먹는약',
        
        // 약품명은 그대로
        medicineName: rawData.medicineName || '',
        
        // 복용법 가공: "2알씩 하루 3번 복용"
        dose: `${rawData.singleDose || ''}알씩 하루 ${rawData.dailyDose || ''}번 복용`,
        
        // 처방일수 가공: "7일분"
        prescriptonDays: `${rawData.prescriptionDays || ''}일분`,  // 템플릿 필드명 오타 그대로 사용
        
        // 조제일 가공: "조제일 2025.07.23"
        madeDate: `조제일 ${formattedDate}`,
        
        // 약국명 (config에서 전달받음)
        phamacy: rawData.pharmacyName || ''  // 템플릿 필드명 오타 그대로 사용
    };
    
    return processedData;
}

/**
 * 약품 라벨 데이터를 가공하는 함수
 * @param {object} rawData 원본 데이터
 * @returns {object} 가공된 데이터
 */
function processMedicineLabel(rawData) {
    // 기본값 설정
    const data = {
        medicineName: rawData.medicineName || '',
        patientName: rawData.patientName || '',
        dailyDose: rawData.dailyDose || '',
        singleDose: rawData.singleDose || '',
        prescriptionDays: rawData.prescriptionDays || '',
        date: rawData.date || new Date().toLocaleDateString('ko-KR'),
        pharmacyName: rawData.pharmacyName || ''
    };
    
    // 가공된 텍스트 필드 추가
    const processedData = {
        ...data,
        // 복용법 텍스트
        dailyDoseText: `하루 ${data.dailyDose}회`,
        singleDoseText: `1회 ${data.singleDose}정`,
        prescriptionDaysText: `${data.prescriptionDays}일분`,
        
        // 복용 안내문
        instructions: `${data.dailyDose}회 ${data.singleDose}정씩 복용`,
        
        // 전체 설명
        fullDescription: `${data.medicineName} - 하루 ${data.dailyDose}회, 1회 ${data.singleDose}정, ${data.prescriptionDays}일분`,
        
        // 기간 계산
        endDate: calculateEndDate(data.date, data.prescriptionDays)
    };
    
    return processedData;
}

/**
 * 처방전 데이터를 가공하는 함수
 * @param {object} rawData 원본 데이터
 * @returns {object} 가공된 데이터
 */
function processPrescriptionData(rawData) {
    const data = {
        patientName: rawData.name || rawData.patientName || '',
        hospitalName: rawData.hos || rawData.hospitalName || '',
        receiptDate: rawData.recvDate || rawData.receiptDate || '',
        prepareDate: rawData.prepareDate || new Date().toLocaleDateString('ko-KR'),
        prescriptionNo: rawData.receiptNo || rawData.medicationNumber || '',
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
    processLabel1Data,
    processMedicineLabel,
    processPrescriptionData,
    formatDate,
    calculateEndDate
};