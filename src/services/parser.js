/**
 * 통합 파서
 * TXT 파일에서 환자, 처방전, 약품 정보를 파싱
 */

/**
 * TXT 파일 파싱
 * @param {string} filePath - TXT 파일 경로
 * @returns {Promise<Object>} { success, patient, prescription, medicines }
 */
async function parseFile(filePath) {
    try {
        const { parseTxtFile } = await import('../../scripts/prescript-parser-js.js');
        const parseResult = parseTxtFile(filePath);

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
