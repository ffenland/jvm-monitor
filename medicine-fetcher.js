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
        const { searchMedicineByBohcode } = require('./scripts/medicine-api.js');
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
        const { fetchMedicineDetailByYakjungCode } = require('./scripts/medicine-api.js');
        const medicineInfo = await fetchMedicineDetailByYakjungCode(yakjungCode);

        if (!medicineInfo) {
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

        // 4. 데이터 가공 (정상 조회)
        // fetchMedicineDetailByYakjungCode가 이미 가공된 데이터 반환
        const processedData = {
            bohcode: bohcode,
            ...medicineInfo,  // yakjung_code, drug_name, drug_form, dosage_route, cls_code, upso_name, medititle, stmt, temperature, unit, api_fetched 포함
            custom_usage: null,
            usage_priority: '1324'
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
 * yakjungCode로 약품 정보 수집 및 저장 (신규약품 추가용)
 * @param {string} yakjungCode - 약학정보원 코드
 * @param {DatabaseManager} dbInstance - 데이터베이스 인스턴스 (선택적)
 * @returns {Promise<Object>} { success, medicine, bohcodes }
 */
async function fetchAndSaveMedicineByYakjungCode(yakjungCode, dbInstance = null) {
    const db = dbInstance || new DatabaseManager();

    try {
        // 1. 이미 존재하는지 확인 (yakjung_code로 조회)
        const existing = db.getMedicine(yakjungCode);
        if (existing) {
            // 이미 존재하는 약품
            return {
                success: false,
                error: '이미 등록된 약품입니다',
                alreadyExists: true,
                medicine: existing
            };
        }

        // 2. 약학정보원 API 호출
        const { fetchMedicineDetailByYakjungCode, fetchBohCodesFromYakjung } = require('./scripts/medicine-api.js');
        const medicineInfo = await fetchMedicineDetailByYakjungCode(yakjungCode);

        if (!medicineInfo) {
            return {
                success: false,
                error: '약품 정보를 가져올 수 없습니다'
            };
        }

        // 3. bohcode 목록 조회
        const bohcodes = await fetchBohCodesFromYakjung(yakjungCode);

        // 4. 데이터 가공 (bohcode 없이 저장)
        const processedData = {
            bohcode: bohcodes.length > 0 ? bohcodes[0] : null, // 첫 번째 bohcode를 기본값으로
            ...medicineInfo,
            custom_usage: null,
            usage_priority: '1324'
        };

        // 5. DB 저장 (트랜잭션 시작)
        const transaction = db.db.transaction(() => {
            // 5-1. medicine 테이블에 약품 정보 저장
            const savedMedicine = db.saveMedicine(processedData);

            // 5-2. medicine_bohcodes 테이블에 보험코드 저장
            if (bohcodes.length > 0) {
                for (const bohcode of bohcodes) {
                    try {
                        db.statements.insertBohcode.run({
                            yakjung_code: yakjungCode,
                            bohcode: bohcode
                        });
                    } catch (error) {
                        // UNIQUE 제약조건 위반 시 무시 (이미 존재하는 bohcode)
                        if (!error.message.includes('UNIQUE constraint failed')) {
                            throw error;
                        }
                    }
                }
            }

            return savedMedicine;
        });

        const savedMedicine = transaction();

        return {
            success: true,
            medicine: savedMedicine,
            bohcodes: bohcodes,
            cached: false
        };

    } catch (error) {
        console.error('약품 저장 실패:', error);
        return {
            success: false,
            error: error.message
        };
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

module.exports = { fetchAndSaveMedicine, fetchAndSaveMedicineByYakjungCode };
