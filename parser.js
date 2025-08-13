const iconv = require('iconv-lite');

function parseFileContent(buffer) {
    const content = iconv.decode(buffer, 'euc-kr');
    const parsedData = {};

    // --- JVPHEAD Parsing ---
    const jvpHeadMatch = content.match(/\|JVPHEAD\|(.*?)\|JVPEND\|/);
    if (jvpHeadMatch && jvpHeadMatch[1]) {
        const jvpHeadContent = jvpHeadMatch[1];

        // Use regex to extract fields based on patterns of non-space characters and spaces
        // This regex is carefully crafted based on the sample to capture specific fields
        // Updated to handle time info (HH:MM) after date for prescriptions received before 9am
        const headRegex = /^(\d{11})\s+(\d+)\s+(\d+)\s+(\d{8})(?:\s{5}|\d{2}:\d{2})(\d{13})\s+(\d{8})\s+(.*?)(?:\s+(\d))?\s+(.*?)\s+.*$/;
        const headFields = jvpHeadContent.match(headRegex);

        if (headFields) {
            parsedData.patientId = headFields[1].trim();
            parsedData.receiptNum = headFields[2].trim();
            // headFields[3] is '54' - not used in parsed output
            parsedData.receiptDateRaw = headFields[4].trim();
            // headFields[5] and headFields[6] are other numbers - not used in parsed output
            parsedData.patientName = headFields[7].trim();
            // headFields[8] is '1' - not used in parsed output
            parsedData.hospitalName = headFields[9].trim();

            // Format date
            if (parsedData.receiptDateRaw) {
                const year = parsedData.receiptDateRaw.substring(0, 4);
                const month = parsedData.receiptDateRaw.substring(4, 6);
                const day = parsedData.receiptDateRaw.substring(6, 8);
                parsedData.receiptDate = `${year}년${month}월${day}일`;
            }
        } else {
            throw new Error("JVPHEAD parsing failed: Could not match expected pattern.");
        }
    }

    // --- JVMHEAD Parsing ---
    const jvmHeadMatch = content.match(/\|JVMHEAD\|(.*?)\|JVMEND\|/);
    parsedData.medicines = [];
    if (jvmHeadMatch && jvmHeadMatch[1]) {
        const jvmHeadContent = jvmHeadMatch[1];

        // Split medicine entries using a regex lookahead to find 'T' or 'E' followed by 9 digits.
        // This prevents splitting on characters within a medicine's name.
        const medicineEntries = jvmHeadContent.trim().split(/(?=[TE]\d{9})/).filter(entry => entry.trim().length > 0);

        medicineEntries.forEach(entry => {
            // 패턴: 약품코드(T/E+9자리) 약품명 처방일수 하루투여횟수 1회투여량
            // 예: T643100080 약품명 5 3 1 -> 5일분, 하루3번, 1회1알
            // 예: T649404690 약품명 5 3 0.5 -> 5일분, 하루3번, 1회0.5알
            
            // 숫자들을 개별적으로 캡처하도록 수정
            const medicineRegex = /^([TE]\d{9})\s+(.*?)\s+(\d+)\s+(\d)(\d+(?:\.\d+)?)\s*.*$/;
            const match = entry.match(medicineRegex);
            
            if (match) {
                const medicine = {
                    code: match[1].trim().substring(1), // Remove 'T' or 'E' prefix, use only 9-digit code
                    name: match[2].trim().replace(/_$/, ''), // Clean trailing underscores
                    prescriptionDays: match[3].trim(),  // 처방일수 (예: 5)
                    dailyDose: match[4].trim(),         // 하루투여횟수 (예: 3)
                    singleDose: match[5].trim()         // 1회투여량 (예: 1 또는 0.5)
                };
                parsedData.medicines.push(medicine);
            } else {
                // 매치 실패 시 로그
            }
        });

        if (parsedData.medicines.length === 0) {
            // No medicine entries found
        }
    }

    return parsedData;
}

module.exports = { parseFileContent };
