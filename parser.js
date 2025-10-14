const iconv = require('iconv-lite');

/**
 * 새로운 정확한 약품 정보 파싱 함수
 * @param {string} drugSection - JVMHEAD 섹션 내용
 * @returns {Array} 파싱된 약품 배열
 */
function parseDrugInfo(drugSection) {
    const result = [];
    
    // 1단계: 약품코드 패턴으로 분할
    const drugCodePattern = /[TE]\d{9}/g;
    const drugCodes = [...drugSection.matchAll(drugCodePattern)];
    
    if (drugCodes.length === 0) {
        return result;
    }
    
    // 2단계: 각 약품별로 분할하여 처리
    drugCodes.forEach((match, i) => {
        const startIndex = match.index;
        const endIndex = i < drugCodes.length - 1 ? drugCodes[i + 1].index : drugSection.length;
        const drugText = drugSection.substring(startIndex, endIndex).trim();
        
        // 약품코드 추출
        const drugcode = match[0].substring(1); // T/E 제거
        
        // 약품명 추출 (코드 다음부터 숫자 패턴 앞까지)
        let drugname = '';
        const afterCode = drugText.substring(10).trim(); // 약품코드(10자리) 이후
        
        // 마지막에서 역방향으로 첫 번째 숫자 찾기
        let firstDigitIndex = -1;
        for (let j = afterCode.length - 1; j >= 0; j--) {
            if (/\d/.test(afterCode[j])) {
                firstDigitIndex = j;
                break;
            }
        }
        
        if (firstDigitIndex !== -1) {
            // 약품명은 첫 번째 숫자 앞까지
            drugname = afterCode.substring(0, firstDigitIndex).trim();
            
            // 약품명 정리
            drugname = drugname.replace(/\(1일\s*\d+회\)/g, '').trim();
            drugname = drugname.replace(/\s*[^,\s]*,.*$/, '').trim();
            drugname = drugname.replace(/_+$/, '').trim();
            drugname = drugname.replace(/\s+/g, ' ');
        }
        
        // 복용정보 파싱 (10자리 역방향 읽기)
        let tday = '', thoi = '', tuse = '';
        
        if (firstDigitIndex !== -1) {
            const start = Math.max(0, firstDigitIndex - 9);
            const end = firstDigitIndex + 1;
            const tenDigitBlock = afterCode.substring(start, end);
            
            let firstNumberStart = -1;
            for (let k = 0; k < tenDigitBlock.length; k++) {
                if (/\d/.test(tenDigitBlock[k])) {
                    firstNumberStart = k;
                    break;
                }
            }
            
            if (firstNumberStart !== -1) {
                const numberPart = tenDigitBlock.substring(firstNumberStart);
                
                // 처방일수 (최대 3자리)
                let daysPart = '';
                let currentIndex = 0;
                
                while (currentIndex < numberPart.length && daysPart.length < 3) {
                    if (/\d/.test(numberPart[currentIndex])) {
                        daysPart += numberPart[currentIndex];
                    } else if (daysPart.length > 0) {
                        break;
                    }
                    currentIndex++;
                }
                
                tday = daysPart;
                
                // 공백 건너뛰기
                while (currentIndex < numberPart.length && !/\d/.test(numberPart[currentIndex])) {
                    currentIndex++;
                }
                
                // 1일 복용횟수 (4번째 자리)
                if (currentIndex < numberPart.length && /\d/.test(numberPart[currentIndex])) {
                    thoi = numberPart[currentIndex];
                    currentIndex++;
                }
                
                // 1회 복용량 (5번째 이후)
                let dosePart = '';
                while (currentIndex < numberPart.length) {
                    if (/[\d.]/.test(numberPart[currentIndex])) {
                        dosePart += numberPart[currentIndex];
                    } else if (dosePart.length > 0) {
                        break;
                    }
                    currentIndex++;
                }
                
                tuse = dosePart || '1';
            }
        }
        
        result.push({
            code: drugcode,           // 기존 필드명 사용
            name: drugname,           // 기존 필드명 사용
            prescriptionDays: tday,   // 기존 필드명 사용
            dailyDose: thoi,          // 기존 필드명 사용
            singleDose: tuse          // 기존 필드명 사용
        });
    });
    
    return result;
}

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
        
        // 새로운 정확한 파싱 로직 사용
        parsedData.medicines = parseDrugInfo(jvmHeadContent);
    }

    return parsedData;
}

module.exports = { parseFileContent };
