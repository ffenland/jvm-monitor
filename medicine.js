/**
 * medicine.js - 약품 마스터 데이터 관리 모듈
 * 
 * 이 모듈은 하이브리드 방식으로 약품 정보를 관리합니다:
 * - 기본 데이터: medicine-master.json 파일에서 로드
 * - 처리 로직: 이 파일에서 구현
 * 
 * 주요 기능:
 * 1. 약품 코드별 마스터 데이터 관리
 * 2. 약품명 커스터마이징 (마스터에 지정된 이름으로 대체)
 * 3. 용법/용량 문구 커스터마이징 (조건별 맞춤 문구 생성)
 * 4. 약품별 특수 처리 로직
 * 
 * 사용 예시:
 * const { processMedicineData } = require('./medicine');
 * const processedMedicine = processMedicineData(parsedMedicine);
 */

const fs = require('fs');
const path = require('path');

// 마스터 데이터를 저장할 변수
let masterData = null;

/**
 * medicine-master.json 파일에서 마스터 데이터를 로드합니다.
 * @returns {Object} 로드된 마스터 데이터
 */
function loadMasterData() {
    if (masterData) {
        return masterData;
    }
    
    try {
        const masterFilePath = path.join(__dirname, 'medicine-master.json');
        const jsonData = fs.readFileSync(masterFilePath, 'utf8');
        masterData = JSON.parse(jsonData);
        console.log('Medicine master data loaded successfully');
        return masterData;
    } catch (error) {
        console.error('Error loading medicine master data:', error.message);
        // 기본 구조 반환
        masterData = {
            medicines: {},
            doseTemplates: {
                default: "{singleDose}알씩 하루 {dailyDose}번 {prescriptionDays}일분"
            },
            defaultUnits: {
                tablet: "정",
                capsule: "캡슐",
                liquid: "mL"
            }
        };
        return masterData;
    }
}

/**
 * 약품 코드로 마스터 정보를 조회합니다.
 * @param {string} medicineCode - 약품 코드
 * @returns {Object|null} 약품 마스터 정보
 */
function getMedicineInfo(medicineCode) {
    const data = loadMasterData();
    return data.medicines[medicineCode] || null;
}

/**
 * 커스터마이즈된 약품명을 반환합니다.
 * 마스터에 customName이 있으면 사용하고, 없으면 원래 이름을 반환합니다.
 * @param {Object} medicine - 파싱된 약품 객체
 * @returns {string} 커스터마이즈된 약품명
 */
function getCustomizedName(medicine) {
    const masterInfo = getMedicineInfo(medicine.code);
    
    if (masterInfo && masterInfo.customName) {
        return masterInfo.customName;
    }
    
    // 기본 이름 정리 (언더스코어 제거 등)
    return medicine.name.replace(/_+$/, '').trim();
}

/**
 * 약품의 단위를 결정합니다.
 * @param {Object} medicine - 파싱된 약품 객체
 * @param {Object} masterInfo - 마스터 정보
 * @returns {string} 단위 (정, 캡슐, mL 등)
 */
function determineUnit(medicine, masterInfo) {
    // 마스터에 unit이 지정되어 있으면 사용
    if (masterInfo && masterInfo.unit) {
        return masterInfo.unit;
    }
    
    // 약품명에서 단위 추출
    const name = medicine.name.toLowerCase();
    if (name.includes('캡슐')) return '캡슐';
    if (name.includes('시럽') || name.includes('ml')) return 'mL';
    if (name.includes('정')) return '정';
    
    // 기본값
    return '정';
}

/**
 * 용법/용량 문구를 생성합니다.
 * @param {Object} medicine - 파싱된 약품 객체
 * @returns {string} 생성된 용법/용량 문구
 */
function generateDoseInstruction(medicine) {
    const data = loadMasterData();
    const masterInfo = getMedicineInfo(medicine.code);
    
    // 템플릿 선택
    let template = data.doseTemplates.default;
    
    // 특수 템플릿 선택 로직
    if (masterInfo) {
        // 시럽류는 liquid 템플릿 사용
        if (masterInfo.unit === 'mL' && data.doseTemplates.liquid) {
            template = data.doseTemplates.liquid;
        }
        // 식전 복용약은 beforeMeal 템플릿 사용
        else if (masterInfo.usageInstruction && data.doseTemplates.beforeMeal) {
            template = data.doseTemplates.beforeMeal;
        }
    }
    
    // 단위 결정
    const unit = determineUnit(medicine, masterInfo);
    const doseUnit = (masterInfo && masterInfo.doseUnit) || unit;
    
    // singleDose 특수 처리
    let singleDoseText = medicine.singleDose;
    if (masterInfo && masterInfo.specialDose && masterInfo.specialDose[medicine.singleDose]) {
        singleDoseText = masterInfo.specialDose[medicine.singleDose];
    }
    
    // 템플릿 변수 치환
    let instruction = template
        .replace('{singleDose}', singleDoseText)
        .replace('{unit}', unit)
        .replace('{doseUnit}', doseUnit)
        .replace('{dailyDose}', medicine.dailyDose)
        .replace('{prescriptionDays}', medicine.prescriptionDays)
        .replace('{usageInstruction}', (masterInfo && masterInfo.usageInstruction) || '');
    
    // 연속된 공백 제거
    return instruction.replace(/\s+/g, ' ').trim();
}

/**
 * 파싱된 약품 데이터를 가공합니다.
 * @param {Object} medicine - 파싱된 약품 객체
 * @returns {Object} 가공된 약품 객체
 */
function processMedicineData(medicine) {
    // 마스터 데이터 로드
    loadMasterData();
    
    // 가공된 약품 객체 생성
    const processedMedicine = {
        ...medicine,
        customName: getCustomizedName(medicine),
        doseInstruction: generateDoseInstruction(medicine)
    };
    
    // 마스터 정보에서 카테고리 추가
    const masterInfo = getMedicineInfo(medicine.code);
    if (masterInfo && masterInfo.category) {
        processedMedicine.category = masterInfo.category;
    }
    
    return processedMedicine;
}

/**
 * 약품 목록을 일괄 가공합니다.
 * @param {Array} medicines - 파싱된 약품 배열
 * @returns {Array} 가공된 약품 배열
 */
function processMedicineList(medicines) {
    if (!Array.isArray(medicines)) {
        return [];
    }
    
    return medicines.map(medicine => processMedicineData(medicine));
}

/**
 * 마스터 데이터를 다시 로드합니다.
 * (파일이 수정된 경우 사용)
 */
function reloadMasterData() {
    masterData = null;
    return loadMasterData();
}

// 모듈 내보내기
module.exports = {
    loadMasterData,
    getMedicineInfo,
    getCustomizedName,
    generateDoseInstruction,
    processMedicineData,
    processMedicineList,
    reloadMasterData
};