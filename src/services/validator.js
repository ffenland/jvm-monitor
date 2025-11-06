/**
 * 파싱 결과 검증 모듈
 * 약품 정보의 유효성을 검증합니다.
 */

/**
 * 약품 정보 유효성 검증
 * @param {Object} medicine - 약품 정보
 * @param {string} medicine.code - 약품코드
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateMedicine(medicine) {
    const errors = [];

    // 약품코드 검증: 숫자로만 구성된 9자리 문자열
    if (!medicine.code) {
        errors.push('약품코드가 없습니다');
    } else if (!/^\d{9}$/.test(medicine.code)) {
        errors.push(`약품코드가 유효하지 않습니다 (코드: ${medicine.code}, 형식: 숫자 9자리 필요)`);
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * 처방전 전체 약품 검증
 * @param {Array} medicines - 약품 배열
 * @returns {Object} { valid: boolean, invalidMedicines: Array, allErrors: string[] }
 */
function validatePrescriptionMedicines(medicines) {
    if (!medicines || medicines.length === 0) {
        return {
            valid: false,
            invalidMedicines: [],
            allErrors: ['약품 정보가 없습니다']
        };
    }

    const invalidMedicines = [];
    const allErrors = [];

    medicines.forEach((medicine, index) => {
        const validation = validateMedicine(medicine);
        if (!validation.valid) {
            invalidMedicines.push({
                index: index + 1,
                medicine,
                errors: validation.errors
            });
            allErrors.push(`[약품 ${index + 1}] ${medicine.name || '이름없음'}: ${validation.errors.join(', ')}`);
        }
    });

    return {
        valid: invalidMedicines.length === 0,
        invalidMedicines,
        allErrors
    };
}

module.exports = {
    validateMedicine,
    validatePrescriptionMedicines
};
