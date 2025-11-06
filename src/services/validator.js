/**
 * 파싱 결과 검증 모듈
 * 약품 정보의 유효성을 검증합니다.
 */

/**
 * 약품 정보 유효성 검증
 * @param {Object} medicine - 약품 정보
 * @param {string} medicine.code - 약품코드
 * @param {string} medicine.name - 약품명
 * @param {string} medicine.prescriptionDays - 처방일수
 * @param {string} medicine.dailyDose - 1일복용횟수
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateMedicine(medicine) {
    const errors = [];

    // 1. 약품코드 검증: 숫자로만 구성된 9자리 문자열
    if (!medicine.code) {
        errors.push('약품코드가 없습니다');
    } else if (!/^\d{9}$/.test(medicine.code)) {
        errors.push(`약품코드가 유효하지 않습니다 (코드: ${medicine.code}, 형식: 숫자 9자리 필요)`);
    }

    // 2. 약품명 검증: 공백이 없어야 함
    if (!medicine.name) {
        errors.push('약품명이 없습니다');
    } else if (medicine.name.includes(' ')) {
        errors.push(`약품명에 공백이 포함되어 있습니다 (약품명: ${medicine.name})`);
    }

    // 3. 처방일수 검증:
    // - 파싱 로직에서 3자리만 읽으므로 범위 초과 불가능
    // - 처방일수는 왼쪽 정렬 (숫자 뒤에 공백 가능, 앞에는 불가능)
    // - 허용 형태: "1  ", "11 ", "111"
    // - 오류 형태: " 11", "  1", "1 1", "   " (숫자 앞에 공백 또는 숫자 사이 공백)
    if (!medicine.prescriptionDays || medicine.prescriptionDays.trim() === '') {
        errors.push('처방일수가 없습니다');
    } else if (!/^\d+\s*$/.test(medicine.prescriptionDays)) {
        // 정규식 설명: ^\d+ (숫자로 시작) \s* (뒤에 공백 0개 이상) $
        // 숫자로 시작하고 뒤에만 공백이 올 수 있음
        errors.push(`처방일수가 유효하지 않습니다 (처방일수: "${medicine.prescriptionDays}", 형식: 숫자 + 뒤 공백만 가능)`);
    } else {
        const days = parseInt(medicine.prescriptionDays.trim(), 10);
        if (days < 1) {
            errors.push(`처방일수가 0 이하입니다 (처방일수: ${medicine.prescriptionDays.trim()})`);
        }
    }

    // 4. 1일복용횟수 검증:
    // - 파싱 로직에서 1자리만 읽으므로 2자리 이상 불가능
    // - 실패 케이스: 공백인 경우, 또는 0인 경우
    if (!medicine.dailyDose || medicine.dailyDose.trim() === '') {
        errors.push('1일복용횟수가 없습니다');
    } else if (!/^\d$/.test(medicine.dailyDose)) {
        errors.push(`1일복용횟수가 유효하지 않습니다 (복용횟수: "${medicine.dailyDose}", 형식: 1자리 숫자 필요)`);
    } else if (medicine.dailyDose === '0') {
        errors.push(`1일복용횟수가 0입니다 (복용횟수: ${medicine.dailyDose})`);
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
