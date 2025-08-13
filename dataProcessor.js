/**
 * 약품 라벨 데이터 가공 모듈
 * 
 * 이 모듈은 라벨 출력을 위한 데이터 가공을 담당합니다.
 * 약품 정보 조회 및 파싱은 druginfo.js 모듈을 활용합니다.
 */

const drugInfoManager = require('./druginfo');

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

/**
 * 약품 상세정보 조회 및 라벨용 데이터 가공
 * drugInfoManager의 기능을 활용하여 약품 정보를 조회하고
 * 라벨 출력에 필요한 형태로 가공합니다.
 * 
 * @param {string} drugCode 약품코드 (EDI 코드)
 * @returns {Promise<object>} 라벨용으로 가공된 약품 정보
 */
async function fetchAndParseDrugDetail(drugCode) {
    try {
        // drugInfoManager의 기능을 활용하여 상세정보 조회
        const detailInfo = await drugInfoManager.fetchDrugDetailInfo('code', drugCode);
        
        if (!detailInfo || detailInfo.multipleItems) {
            return null;
        }
        
        // drugInfoManager의 파싱 함수들 활용
        const storage = drugInfoManager.parseStorageMethod(detailInfo.STORAGE_METHOD);
        const effects = drugInfoManager.parseEffects(detailInfo.EE_DOC_DATA);
        const processedTitle = drugInfoManager.extractTitle(detailInfo.ITEM_NAME);
        
        // 라벨 출력용 데이터 구조로 반환
        return {
            code: detailInfo.ITEM_SEQ || '',
            title: processedTitle || '',
            manufacturer: detailInfo.ENTP_NAME || '',
            storageContainer: storage.container || '',
            storageTemp: storage.temperature || '',
            effects: effects,
            rawStorageMethod: detailInfo.STORAGE_METHOD || '',
            updateDate: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('약품 상세정보 조회 실패:', error);
        return null;
    }
}

module.exports = {
    processPrescriptionData,
    formatDate,
    calculateEndDate,
    fetchAndParseDrugDetail
};