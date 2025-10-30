import fs from 'fs';
import iconv from 'iconv-lite';

/**
 * TXT 파일 파서 - C# 로직을 JavaScript로 재구현
 * 설치 필요: npm install iconv-lite
 * package.json에 "type": "module" 추가 필요
 * 
 * 중요: ks_c_5601-1987 인코딩 사용 (고정 길이 형식 바이트 정확도 필수)
 */

function parseTxtFile(filePath) {
    const result = {
        success: false,
        filePath: filePath,
        fileName: null,
        preserial: null,
        records: [],
        error: null
    };
    
    try {
        // 1. ks_c_5601-1987 (EUC-KR) 인코딩으로 파일 읽기
        // 원본 C#: Encoding.GetEncoding("ks_c_5601-1987")
        const ENCODING = 'ks_c_5601-1987'; // 또는 'euc-kr'
        const fileBuffer = fs.readFileSync(filePath);
        const fileContent = iconv.decode(fileBuffer, ENCODING);
        
        // 2. 파일명에서 확장자 제거 (preserial로 사용)
        const fileName = filePath.split(/[/\\]/).pop();
        const preserial = fileName.split('.')[0];
        
        result.fileName = fileName;
        result.preserial = preserial;
        
        // 3. 라인별로 처리
        const lines = fileContent.split('\n').filter(line => line.trim());
        
        lines.forEach((line, index) => {
            const record = {
                recordIndex: index + 1,
                patientData: null,
                drugs: []
            };
            
            // 바이트 배열로 변환 (고정 길이 파싱용)
            // 원본 C#: byte[] bytes = encoding.GetBytes(text3);
            const lineBuffer = iconv.encode(line, ENCODING);
            
            // 4. 기본 정보 파싱 (고정 위치)
            // 원본 C#: encoding.GetString(bytes, offset, length).Trim()
            const patientData = {
                cuscode: getStringFromBuffer(lineBuffer, 10, 10, ENCODING),      // 환자 코드
                pname: getStringFromBuffer(lineBuffer, 186, 15, ENCODING),       // 환자 이름
                birthDate: getStringFromBuffer(lineBuffer, 103, 8, ENCODING),    // 생년월일
                tdate: getStringFromBuffer(lineBuffer, 50, 8, ENCODING),         // 처방일
                tnumber: getStringFromBuffer(lineBuffer, 25, 3, ENCODING),       // 처방번호
                doctor_name: getStringFromBuffer(lineBuffer, 270, 20, ENCODING), // 의사명
                hospital_code: getStringFromBuffer(lineBuffer, 238, 30, ENCODING), // 병원코드
                sexCode: getStringFromBuffer(lineBuffer, 206, 1, ENCODING),      // 성별코드
                preserial: preserial                          // 파일명
            };
            
            // 성별 처리
            patientData.sex = patientData.sexCode === '1' ? '남' : '여';
            
            // 나이 계산
            patientData.age = calculateAge(patientData.birthDate);
            
            // 처방일 포맷팅 (YYYYMMDD -> YYYY-MM-DD)
            patientData.tdateFormatted = formatDate(patientData.tdate);
            
            record.patientData = patientData;
            
            // 6. 약품 정보 파싱 (전체 라인 전달)
            const drugInfo = parseDrugInfo(line, ENCODING);
            record.drugs = drugInfo;
            
            result.records.push(record);
        });
        
        result.success = true;
        
    } catch (error) {
        result.error = error.message;
        console.error('파일 처리 오류:', error);
    }
    
    return result;
}

/**
 * 바이트 버퍼에서 지정된 위치의 문자열 추출
 * 원본 C#: encoding.GetString(bytes, offset, length).Trim()
 * @param {Buffer} buffer - 바이트 버퍼
 * @param {number} offset - 시작 위치 (바이트 단위)
 * @param {number} length - 길이 (바이트 단위)
 * @param {string} encoding - 인코딩 (ks_c_5601-1987)
 * @returns {string} 추출된 문자열 (trim 적용)
 */
function getStringFromBuffer(buffer, offset, length, encoding) {
    try {
        // 버퍼 범위 체크
        if (offset + length > buffer.length) {
            return '';
        }
        
        // 지정된 바이트 범위 추출
        const slice = buffer.slice(offset, offset + length);
        
        // ks_c_5601-1987로 디코딩 후 trim
        return iconv.decode(slice, encoding).trim();
    } catch (error) {
        console.error(`바이트 추출 오류 (offset: ${offset}, length: ${length}):`, error.message);
        return '';
    }
}

/**
 * 약품 정보 파싱 - 새로운 엄격한 역방향 로직
 *
 * 파싱 규칙:
 * - |JVMHEAD| 이후부터 |JVMEND| 이전까지 약품 정보 파싱
 * - 약품코드: T 또는 E로 시작하는 10자리
 * - 복용정보: 뒤에서부터 역방향으로 읽기
 *   - 맨 마지막 약품: |JVMEND| 문구의 40칸 앞에서부터 10자리
 *   - 중간 약품: 다음 약품코드의 42칸 앞에서부터 10자리
 * - 10자리 구조:
 *   - 앞 3자리: 처방일수 (숫자+공백+공백, 숫자+숫자+공백, 숫자+숫자+숫자)
 *   - 4번째 자리: 1일복용횟수 (1~9)
 *   - 5~10자리: 1회복용량 (숫자 또는 온점1개+숫자, 최대 6자리, 앞에서부터 채움)
 *
 * @param {string} drugSection - 약품 섹션 문자열 (전체 라인 또는 JVMHEAD 섹션)
 * @param {string} encoding - 인코딩 (ks_c_5601-1987)
 * @returns {Array} 약품 정보 배열
 */
function parseDrugInfo(drugSection, encoding) {
    const result = [];

    // JVMHEAD와 JVMEND 위치 찾기
    const jvmheadStart = drugSection.indexOf('|JVMHEAD|');
    const jvmendPos = drugSection.indexOf('|JVMEND|');

    if (jvmheadStart === -1 || jvmendPos === -1) {
        // JVMHEAD/JVMEND가 없으면 레거시 방식으로 폴백
        return parseDrugInfoLegacy(drugSection, encoding);
    }

    // 약품 섹션만 추출
    const medicineSection = drugSection.substring(jvmheadStart + 9, jvmendPos);

    // 약품코드 패턴 찾기: T 또는 E로 시작하는 10자리
    const codePattern = /[TE]\d{9}/g;
    const matches = [...medicineSection.matchAll(codePattern)];

    if (matches.length === 0) {
        return [];
    }

    // 각 약품 처리
    for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const medicineCode = match[0];
        const medicineStartPos = jvmheadStart + 9 + match.index;

        // 약품명 추출 (약품코드 뒤 50자)
        const medicineNameStart = medicineStartPos + 10;
        let drugname = drugSection.substring(medicineNameStart, medicineNameStart + 50).trim();

        // 약품명에서 특수문자나 불필요한 부분 제거
        drugname = drugname.split(/[\n\r|]/)[0].trim();

        // 복용정보 추출 위치 계산
        let usageInfoStart;

        if (i === matches.length - 1) {
            // 마지막 약품: |JVMEND|의 40칸 앞
            usageInfoStart = jvmendPos - 40;
        } else {
            // 중간 약품: 다음 약품코드의 42칸 앞
            const nextMedicinePos = jvmheadStart + 9 + matches[i + 1].index;
            usageInfoStart = nextMedicinePos - 42;
        }

        // 10자리 복용정보 추출
        const usageInfo10Chars = drugSection.substring(usageInfoStart, usageInfoStart + 10);

        // 복용정보 파싱
        const usageData = parseUsageInfo10Chars(usageInfo10Chars);

        result.push({
            drugcode: medicineCode.substring(1), // T/E 제거
            drugname: drugname,
            tday: usageData.tday,
            thoi: usageData.thoi,
            tuse: usageData.tuse
        });
    }

    return result;
}

/**
 * 10자리 복용정보 파싱
 * @param {string} chars10 - 10자리 문자열
 * @returns {Object} { tday, thoi, tuse }
 */
function parseUsageInfo10Chars(chars10) {
    const result = {
        tday: '',
        thoi: '',
        tuse: ''
    };

    if (!chars10 || chars10.length < 10) {
        return result;
    }

    // 앞 3자리: 처방일수
    const days3Chars = chars10.substring(0, 3);

    // 4번째 자리: 1일복용횟수
    const dailyDoseChar = chars10.charAt(3);

    // 5~10자리: 1회복용량 (6자리)
    const singleDose6Chars = chars10.substring(4, 10);

    // 처방일수 파싱 (공백 제거)
    const prescriptionDays = days3Chars.trim();

    // 1일복용횟수 검증 (1~9 사이의 숫자)
    if (!/^[1-9]$/.test(dailyDoseChar)) {
        return result;
    }

    // 1회복용량 파싱 (공백 제거)
    const singleDose = singleDose6Chars.trim();

    // 1회복용량 검증 (숫자 또는 온점 포함 숫자)
    if (!/^[\d.]+$/.test(singleDose) || singleDose === '') {
        return result;
    }

    // 처방일수 검증 (1~999)
    const daysNum = parseInt(prescriptionDays);
    if (isNaN(daysNum) || daysNum < 1 || daysNum > 999) {
        return result;
    }

    // 1회복용량 검증 (양수, 온점 최대 1개)
    const dotCount = (singleDose.match(/\./g) || []).length;
    if (dotCount > 1) {
        return result;
    }

    const doseNum = parseFloat(singleDose);
    if (isNaN(doseNum) || doseNum <= 0) {
        return result;
    }

    result.tday = prescriptionDays;
    result.thoi = dailyDoseChar;
    result.tuse = singleDose;

    return result;
}

/**
 * 약품 정보 파싱 (레거시 방식 - 폴백용)
 * 원본 C# 로직과 동일
 */
function parseDrugInfoLegacy(drugSection, encoding) {
    const drugBuffer = iconv.encode(drugSection, encoding);
    const drugSectionStr = iconv.decode(drugBuffer, encoding);
    
    // 원본: Regex.Split(encoding.GetString(bytes2), "01t")
    let drugs = drugSectionStr.split('01t');
    
    // 원본: if (array4.Length < 2) array4 = Regex.Split(encoding.GetString(bytes2), ".{2}[tpljeTPLJE]")
    if (drugs.length < 2) {
        drugs = drugSectionStr.split(/..[@tpljeTPLJE]/);
    }
    
    const result = [];
    
    // 첫 번째 요소는 헤더이므로 제외
    for (let i = 1; i < drugs.length; i++) {
        const drugStr = drugs[i];
        if (!drugStr || drugStr.trim() === '') continue;
        
        const drugBytes = iconv.encode(drugStr, encoding);
        const drugcode = drugStr.substring(0, 9).trim();
        const drugname = getStringFromBuffer(drugBytes, 15, 50, encoding);
        
        const lastBytes = getStringFromBuffer(drugBytes, Math.max(0, drugBytes.length - 40), 40, encoding);
        const tday = lastBytes.substring(0, 3).trim();
        const thoi = lastBytes.substring(3, 1).trim();
        const tuse = lastBytes.length >= 10 ? lastBytes.substring(4, 6).trim() : '';
        
        result.push({
            drugcode,
            drugname,
            tday,
            thoi,
            tuse
        });
    }
    
    return result;
}

/**
 * 나이 계산 (생년월일 기준)
 * @param {string} birthDate - YYYYMMDD 형식
 * @returns {number} 나이
 */
function calculateAge(birthDate) {
    if (!birthDate || birthDate.length !== 8) return 0;
    
    const year = parseInt(birthDate.substring(0, 4));
    const month = parseInt(birthDate.substring(4, 6));
    const day = parseInt(birthDate.substring(6, 8));
    
    const today = new Date();
    const birth = new Date(year, month - 1, day);
    
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    
    return age;
}

/**
 * 날짜 포맷팅 (YYYYMMDD -> YYYY-MM-DD)
 * @param {string} dateStr - YYYYMMDD 형식
 * @returns {string} YYYY-MM-DD 형식
 */
function formatDate(dateStr) {
    if (!dateStr || dateStr.length !== 8) return '';
    return `${dateStr.substring(0, 4)}-${dateStr.substring(4, 6)}-${dateStr.substring(6, 8)}`;
}

// 사용 예시
// parseTxtFile('./sample.txt');

export { parseTxtFile };