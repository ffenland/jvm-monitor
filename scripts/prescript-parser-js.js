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
            
            // 6. 약품 정보 파싱
            const parts = line.split('|');
            if (parts.length >= 7) {
                const drugSection = parts[6];
                const drugInfo = parseDrugInfo(drugSection, ENCODING);
                record.drugs = drugInfo;
            }
            
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
 * 약품 정보 파싱 - 10자리 역방향 로직
 * 개선된 파싱 방식:
 * 1. 약품코드(T/E + 9자리)로 정확한 분할
 * 2. 역방향에서 첫 번째 숫자 찾기
 * 3. 최대 10자리 읽어서 파싱: 처방일수(0-3) + 횟수(4) + 복용량(5+)
 * 
 * @param {string} drugSection - 약품 섹션 문자열
 * @param {string} encoding - 인코딩 (ks_c_5601-1987)
 * @returns {Array} 약품 정보 배열
 */
function parseDrugInfo(drugSection, encoding) {
    const result = [];
    
    // 약품코드 패턴으로 약품 찾기 (T/E + 9자리 숫자)
    const codePattern = /[TE]\d{9}/g;
    const matches = [...drugSection.matchAll(codePattern)];
    
    if (matches.length === 0) {
        // 약품코드 패턴을 못 찾은 경우 기존 방식으로 폴백
        return parseDrugInfoLegacy(drugSection, encoding);
    }
    
    // 각 약품별로 처리
    matches.forEach((match, i) => {
        const drugCode = match[0];
        const startPos = match.index;
        
        // 약품의 끝 위치 결정
        // 마지막 약품이면 전체 섹션 끝까지, 아니면 다음 약품 코드 직전까지
        const endPos = i + 1 < matches.length ? matches[i + 1].index : drugSection.length;
        
        // 현재 약품 텍스트 추출
        const drugText = drugSection.substring(startPos, endPos);
        const drugBytes = iconv.encode(drugText, encoding);
        
        // 약품코드 (T/E 제거)
        const drugcode = drugCode.substring(1);
        
        // 약품명 (15-65 바이트)
        let drugname = '';
        if (drugBytes.length >= 65) {
            drugname = getStringFromBuffer(drugBytes, 15, 50, encoding);
        } else if (drugBytes.length > 15) {
            drugname = getStringFromBuffer(drugBytes, 15, Math.min(50, drugBytes.length - 15), encoding);
        }
        
        // ====== 10자리 역방향 투약 정보 추출 ======
        let tday = '', thoi = '', tuse = '';
        
        // 1단계: 끝에서부터 역방향으로 첫 번째 숫자 찾기
        let firstDigitIndex = -1;
        for (let j = drugText.length - 1; j >= 0; j--) {
            if (/\d/.test(drugText[j])) {
                firstDigitIndex = j;
                break;
            }
        }
        
        if (firstDigitIndex !== -1) {
            // 2단계: 첫 번째 숫자부터 역방향으로 최대 10자리 읽기
            const start = Math.max(0, firstDigitIndex - 9); // 10자리 범위 시작점
            const end = firstDigitIndex + 1; // 첫 번째 숫자 다음까지
            
            const tenDigitBlock = drugText.substring(start, end);
            
            // 3단계: 앞에서부터 파싱
            // 첫 번째 숫자의 위치 찾기
            let firstNumberStart = -1;
            for (let k = 0; k < tenDigitBlock.length; k++) {
                if (/\d/.test(tenDigitBlock[k])) {
                    firstNumberStart = k;
                    break;
                }
            }
            
            if (firstNumberStart !== -1) {
                // 첫 번째 숫자부터 끝까지의 문자열
                const numberPart = tenDigitBlock.substring(firstNumberStart);
                
                // 처방일수 (0-3자리): 첫 숫자부터 최대 3자리
                let daysPart = '';
                let currentIndex = 0;
                
                // 처방일수 추출 (최대 3자리 숫자)
                while (currentIndex < numberPart.length && daysPart.length < 3) {
                    if (/\d/.test(numberPart[currentIndex])) {
                        daysPart += numberPart[currentIndex];
                    } else if (daysPart.length > 0) {
                        // 숫자가 시작된 후 공백을 만나면 일수 부분 종료
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
                        // 숫자가 시작된 후 공백을 만나면 복용량 부분 종료
                        break;
                    }
                    currentIndex++;
                }
                
                tuse = dosePart || '1'; // 기본값 1
            }
        }
        
        result.push({
            drugcode,
            drugname,
            tday,
            thoi,
            tuse
        });
    });
    
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