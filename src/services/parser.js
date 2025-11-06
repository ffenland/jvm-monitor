/**
 * 통합 파서
 * TXT 파일에서 환자, 처방전, 약품 정보를 파싱
 */

const { validatePrescriptionMedicines } = require('./validator');

/**
 * TXT 파일 파싱 (메모리 버퍼 기반)
 * @param {Buffer} fileBuffer - 파일 내용 버퍼 (EUC-KR 인코딩)
 * @param {string} fileName - 파일명 (예: Copy1-20251106000043.txt)
 * @returns {Promise<Object>} { success, patient, prescription, medicines, validationErrors }
 */
async function parseFile(fileBuffer, fileName) {
    try {
        const { parseTxtFile } = await import('../../scripts/prescript-parser-js.js');
        const parseResult = parseTxtFile(fileBuffer, fileName);

        if (!parseResult.success || !parseResult.records || parseResult.records.length === 0) {
            return { success: false, error: parseResult.error || 'No records found' };
        }

        const record = parseResult.records[0];
        if (!record.patientData) {
            return { success: false, error: 'No patient data found' };
        }

        // 환자 정보
        const patient = {
            patientId: record.patientData.cuscode,
            patientName: record.patientData.pname,
            birthDate: record.patientData.birthDate,
            age: record.patientData.age,
            gender: record.patientData.sexCode
        };

        // 처방전 정보
        const prescription = {
            receiptDateRaw: record.patientData.tdate,
            receiptDate: new Date().toISOString(),
            receiptNum: parseInt(record.patientData.tnumber, 10),
            hospitalName: record.patientData.hospital_code,
            doctorName: record.patientData.doctor_name
        };

        // 약품 정보
        const medicines = record.drugs.map(drug => ({
            code: drug.drugcode,
            name: drug.drugname,
            prescriptionDays: drug.tday,
            dailyDose: drug.thoi,
            singleDose: drug.tuse
        }));

        // ===== 약품 정보 검증 =====
        const validation = validatePrescriptionMedicines(medicines);

        if (!validation.valid) {
            // 검증 실패 시 상세 오류 정보 반환
            return {
                success: false,
                validationFailed: true,
                error: 'Medicine validation failed',
                validationErrors: validation.allErrors,
                invalidMedicines: validation.invalidMedicines
            };
        }

        // 검증 성공 시 정상 반환
        return {
            success: true,
            patient,
            prescription,
            medicines
        };

    } catch (error) {
        return { success: false, error: error.message };
    }
}

module.exports = { parseFile };
