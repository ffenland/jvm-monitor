/**
 * 약품 정보 수집 모듈
 * bohcode로 약학정보원에서 약품 상세정보 조회 및 DB 저장
 */

const DatabaseManager = require('./database.js');
const { extractTemperature } = require('./scripts/extract-temperature.js');
const { getUnitFromDrugForm } = require('./scripts/drug-form-unit-map.js');

/**
 * 중복되지 않는 랜덤 4자리 숫자 생성
 */
function generateUniqueFailCode(db) {
    let attempts = 0;
    const maxAttempts = 1000;

    while (attempts < maxAttempts) {
        const randomNum = Math.floor(1000 + Math.random() * 9000);
        const failCode = `fail_${randomNum}`;
        const existing = db.db.prepare('SELECT bohcode FROM medicines WHERE yakjung_code = ?').get(failCode);
        if (!existing) {
            return failCode;
        }
        attempts++;
    }

    return `fail_${Date.now().toString().slice(-4)}`;
}

/**
 * 약품 정보 수집 및 저장
 * @param {string} bohcode - 9자리 약품 코드
 * @param {string} drugNameFromParsing - 파싱에서 얻은 약품명 (API 실패 시 사용)
 * @param {DatabaseManager} dbInstance - 데이터베이스 인스턴스 (선택적)
 * @returns {Promise<Object>} { success, medicine, cached, apiFailure }
 */
async function fetchAndSaveMedicine(bohcode, drugNameFromParsing = null, dbInstance = null) {
    const db = dbInstance || new DatabaseManager();

    try {
        // 1. 이미 존재하는지 확인 (bohcode로 조회)
        const existing = db.getMedicineByBohcode(bohcode);
        if (existing) {
            return { success: true, medicine: existing, cached: true };
        }

        // 2. yakjung_code(icode) 조회
        const { searchMedicineByBohcode } = require('./scripts/parse.js');
        const searchResult = await searchMedicineByBohcode(bohcode);

        if (!searchResult || !searchResult.icode) {
            // API 실패 시 기본값으로 저장
            const failedData = {
                bohcode: bohcode,
                yakjung_code: generateUniqueFailCode(db),
                drug_name: drugNameFromParsing || '정보없음',
                drug_form: '정보없음',
                dosage_route: '정보없음',
                cls_code: '정보없음',
                upso_name: '정보없음',
                medititle: '정보없음',
                stmt: '정보없음',
                temperature: '정보없음',
                unit: '회',
                custom_usage: null,
                usage_priority: '1324',
                api_fetched: 0
            };

            const savedMedicine = db.saveMedicine(failedData);
            return { success: true, medicine: savedMedicine, cached: false, apiFailure: true };
        }

        const yakjungCode = searchResult.icode;

        // 3. 약학정보원 API 호출
        const { getMedicineInfo } = require('./scripts/getInfo.js');
        const medicineInfoArray = await getMedicineInfo(yakjungCode);

        if (!medicineInfoArray || medicineInfoArray.length === 0) {
            // API 실패 시 기본값으로 저장
            const failedData = {
                bohcode: bohcode,
                yakjung_code: generateUniqueFailCode(db),
                drug_name: drugNameFromParsing || '정보없음',
                drug_form: '정보없음',
                dosage_route: '정보없음',
                cls_code: '정보없음',
                upso_name: '정보없음',
                medititle: '정보없음',
                stmt: '정보없음',
                temperature: '정보없음',
                unit: '회',
                custom_usage: null,
                usage_priority: '1324',
                api_fetched: 0
            };

            const savedMedicine = db.saveMedicine(failedData);
            return { success: true, medicine: savedMedicine, cached: false, apiFailure: true };
        }

        const medicineInfo = medicineInfoArray[0];

        // 4. 데이터 가공 (정상 조회)
        const drugForm = medicineInfo.drug_form || null;
        const processedData = {
            bohcode: bohcode,
            yakjung_code: yakjungCode,
            drug_name: medicineInfo.drug_name || drugNameFromParsing || null,
            drug_form: drugForm,
            dosage_route: medicineInfo.dosage_route || null,
            cls_code: medicineInfo.cls_code || null,
            upso_name: parseUpsoName(medicineInfo.upso_name),
            medititle: medicineInfo.medititle || null,
            stmt: medicineInfo.stmt || null,
            temperature: medicineInfo.stmt ? extractTemperature(medicineInfo.stmt) : null,
            unit: getUnitFromDrugForm(drugForm),
            custom_usage: null,
            usage_priority: '1324',
            api_fetched: 1
        };

        // 5. DB 저장
        const savedMedicine = db.saveMedicine(processedData);

        return { success: true, medicine: savedMedicine, cached: false, apiFailure: false };

    } catch (error) {
        // 에러 발생 시에도 기본값으로 저장
        try {
            const failedData = {
                bohcode: bohcode,
                yakjung_code: generateUniqueFailCode(db),
                drug_name: drugNameFromParsing || '정보없음',
                drug_form: '정보없음',
                dosage_route: '정보없음',
                cls_code: '정보없음',
                upso_name: '정보없음',
                medititle: '정보없음',
                stmt: '정보없음',
                temperature: '정보없음',
                unit: '회',
                custom_usage: null,
                usage_priority: '1324',
                api_fetched: 0
            };

            const savedMedicine = db.saveMedicine(failedData);
            return { success: true, medicine: savedMedicine, cached: false, apiFailure: true, error: error.message };
        } catch (saveError) {
            return { success: false, error: error.message, bohcode };
        }
    }
}

/**
 * upso_name에서 제조사명만 추출
 */
function parseUpsoName(upsoName) {
    if (!upsoName) return null;
    const parts = upsoName.split('|');
    return parts[0].trim() || null;
}

module.exports = { fetchAndSaveMedicine };
