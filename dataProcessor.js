/**
 * 약품 라벨 데이터 가공 모듈
 */

const https = require('https');
const querystring = require('querystring');

/**
 * label1.lbx 템플릿용 데이터 가공 함수
 * @param {object} rawData 원본 데이터
 * @returns {object} label1.lbx 템플릿에 맞게 가공된 데이터
 */
function processLabel1Data(rawData) {
    // 오늘 날짜 가져오기
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    const formattedDate = `${year}.${month}.${day}`;
    
    // 가공된 데이터
    const processedData = {
        // 환자명은 그대로
        patientName: rawData.patientName || '',
        
        // 약품 종류는 "먹는약"으로 고정
        medicineType: '먹는약',
        
        // 약품명은 그대로
        medicineName: rawData.medicineName || '',
        
        // 복용법 가공: "2알씩 하루 3번 복용"
        dose: `${rawData.singleDose || ''}알씩 하루 ${rawData.dailyDose || ''}번 복용`,
        
        // 처방일수 가공: "7일분"
        prescriptionDays: `${rawData.prescriptionDays || ''}일분`,
        
        // 조제일 가공: "조제일 2025.07.23"
        madeDate: `조제일 ${formattedDate}`,
        
        // 약국명 (config에서 전달받음)
        pharmacy: rawData.pharmacyName || ''
    };
    
    return processedData;
}

/**
 * 약품 라벨 데이터를 가공하는 함수
 * @param {object} rawData 원본 데이터
 * @returns {object} 가공된 데이터
 */
function processMedicineLabel(rawData) {
    // 기본값 설정
    const data = {
        medicineName: rawData.medicineName || '',
        patientName: rawData.patientName || '',
        dailyDose: rawData.dailyDose || '',
        singleDose: rawData.singleDose || '',
        prescriptionDays: rawData.prescriptionDays || '',
        date: rawData.date || new Date().toLocaleDateString('ko-KR'),
        pharmacyName: rawData.pharmacyName || ''
    };
    
    // 가공된 텍스트 필드 추가
    const processedData = {
        ...data,
        // 복용법 텍스트
        dailyDoseText: `하루 ${data.dailyDose}회`,
        singleDoseText: `1회 ${data.singleDose}정`,
        prescriptionDaysText: `${data.prescriptionDays}일분`,
        
        // 복용 안내문
        instructions: `${data.dailyDose}회 ${data.singleDose}정씩 복용`,
        
        // 전체 설명
        fullDescription: `${data.medicineName} - 하루 ${data.dailyDose}회, 1회 ${data.singleDose}정, ${data.prescriptionDays}일분`,
        
        // 기간 계산
        endDate: calculateEndDate(data.date, data.prescriptionDays)
    };
    
    return processedData;
}

/**
 * 처방전 데이터를 가공하는 함수
 * @param {object} rawData 원본 데이터
 * @returns {object} 가공된 데이터
 */
function processPrescriptionData(rawData) {
    const data = {
        patientName: rawData.name || rawData.patientName || '',
        hospitalName: rawData.hos || rawData.hospitalName || '',
        receiptDate: rawData.recvDate || rawData.receiptDate || '',
        prepareDate: rawData.prepareDate || new Date().toLocaleDateString('ko-KR'),
        receiptNum:  rawData.receiptNum || '',
        doctorName: rawData.doc || rawData.doctorName || '',
        medicines: rawData.medicines || []
    };
    
    // 약품 목록 가공
    const processedMedicines = data.medicines.map((medicine, index) => ({
        ...medicine,
        number: index + 1,
        fullText: `${medicine.name} - ${medicine.dosage || ''} ${medicine.frequency || ''}`
    }));
    
    return {
        ...data,
        medicines: processedMedicines,
        medicineCount: processedMedicines.length,
        // 추가 가공 필드
        formattedDate: formatDate(data.prepareDate),
        patientInfo: `${data.patientName} 님`
    };
}

/**
 * 날짜 형식 변환
 * @param {string} dateStr 날짜 문자열
 * @returns {string} 포맷된 날짜
 */
function formatDate(dateStr) {
    try {
        const date = new Date(dateStr);
        return date.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (e) {
        return dateStr;
    }
}

/**
 * 종료일 계산
 * @param {string} startDate 시작일
 * @param {string} days 일수
 * @returns {string} 종료일
 */
function calculateEndDate(startDate, days) {
    try {
        const start = new Date(startDate);
        const daysNum = parseInt(days) || 0;
        const end = new Date(start);
        end.setDate(start.getDate() + daysNum - 1);
        return end.toLocaleDateString('ko-KR');
    } catch (e) {
        return '';
    }
}

/**
 * 약품 상세정보 API 호출
 * @param {string} drugCode 약품코드 (EDI 코드)
 * @returns {Promise<object>} API 응답 데이터
 */
async function fetchDrugDetailFromAPI(drugCode) {
    const API_KEY = 'CO+6SC4kgIs5atXW/ZDETfMu9T87tscntUhZ6cliQKjRsZM4xmiyOEfWFznoUwHkLKteqdM1e4ZpkZEopwBEMg==';
    const API_URL = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService06/getDrugPrdtPrmsnDtlInq05';
    
    const params = {
        serviceKey: API_KEY,
        pageNo: '1',
        numOfRows: '10',
        type: 'json',
        edi_code: drugCode  // EDI 코드로 요청 (medicine.json의 code 값)
    };
    
    const queryString = querystring.stringify(params);
    const fullUrl = `${API_URL}?${queryString}`;
    
    return new Promise((resolve, reject) => {
        https.get(fullUrl, (response) => {
            let data = '';
            
            response.on('data', (chunk) => {
                data += chunk;
            });
            
            response.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    if (result.header && result.header.resultCode === '00') {
                        resolve(result);
                    } else {
                        reject(new Error('API 응답 오류'));
                    }
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

/**
 * STORAGE_METHOD 파싱 함수
 * @param {string} storageMethod 원본 보관방법 문자열
 * @returns {object} {container, temperature} 형태로 파싱된 객체
 */
function parseStorageMethod(storageMethod) {
    if (!storageMethod) {
        return { container: null, temperature: null };
    }
    
    // 깨진 섭씨 기호 복구 및 정규화
    let normalized = storageMethod
        .replace(/��/g, '℃')  // 깨진 문자 복구
        .replace(/도(?=\s*이하|\s*이상|$)/g, '℃')  // "도이하" → "℃이하"
        .replace(/보관/g, '')  // "보관" 제거
        .trim();
    
    // 쉼표로 분리
    const parts = normalized.split(',').map(s => s.trim());
    
    let container = [];
    let temperature = [];
    
    parts.forEach(part => {
        // 온도 관련 패턴 확인
        const tempPatterns = [
            /\d+\s*℃/,  // 숫자+℃
            /\d+\s*~\s*\d+\s*℃/,  // 범위 온도
            /실온/,
            /냉장/,
            /냉동/,
            /\d+\s*이하/,  // "20이하" 같은 패턴
            /\d+\s*이상/
        ];
        
        const isTemperature = tempPatterns.some(pattern => pattern.test(part));
        
        if (isTemperature) {
            // 온도 정보 정규화
            let temp = part;
            // 숫자만 있고 ℃가 없으면 추가
            if (/^\d+\s*(이하|이상)$/.test(temp)) {
                temp = temp.replace(/(\d+)\s*(이하|이상)/, '$1℃$2');
            }
            temperature.push(temp);
        } else if (part && !part.match(/^\s*$/)) {
            // 용기 정보 (빈 문자열이 아닌 경우)
            container.push(part);
        }
    });
    
    return { 
        container: container.length > 0 ? container.join(', ') : null,
        temperature: temperature.length > 0 ? temperature.join(', ') : null
    };
}

/**
 * EE_DOC_DATA에서 효능효과 추출
 * @param {string} eeDocData XML 형태의 효능효과 데이터
 * @returns {array} 효능효과 배열
 */
function parseEffects(eeDocData) {
    if (!eeDocData) {
        return [];
    }
    
    const effects = [];
    
    try {
        // ARTICLE title 속성에서 효능효과 추출 (괄호로 묶인 제형 정보는 제외)
        const articleTitlePattern = /<ARTICLE\s+title="([^"]+)"/gi;
        const titleMatches = eeDocData.matchAll(articleTitlePattern);
        for (const match of titleMatches) {
            const title = match[1].trim();
            
            // 괄호로 시작하고 끝나는 패턴 제외
            if (title && title.length > 0 && !(/^\([^)]+\)$/.test(title))) {
                // 번호와 점 제거
                const cleaned = title.replace(/^\d+\.\s*/, '');
                if (cleaned && !effects.includes(cleaned)) {
                    effects.push(cleaned);
                }
            }
        }
        
        // CDATA 내용에서 효능효과 추출
        const cdataPattern = /<!\[CDATA\[([^\]]+)\]\]>/gi;
        const cdataMatches = eeDocData.matchAll(cdataPattern);
        for (const match of cdataMatches) {
            let content = match[1].trim();
            
            // HTML 엔티티 디코딩
            content = content.replace(/&lt;/g, '<')
                            .replace(/&gt;/g, '>')
                            .replace(/&quot;/g, '"')
                            .replace(/&apos;/g, "'")
                            .replace(/&amp;/g, '&')
                            .replace(/&nbsp;/g, ' ')
                            .replace(/&middot;/g, '·');
            
            // 태그 제거
            content = content.replace(/<[^>]*>/g, '');
            
            // 번호 제거
            content = content.replace(/^\d+\.\s*/, '');
            
            // 콜론(:)이 있는 경우 무조건 콜론 앞 내용만 사용
            if (content.includes(':') || content.includes('：')) {
                const colonChar = content.includes(':') ? ':' : '：';
                const parts = content.split(colonChar);
                const beforeColon = parts[0].trim();
                
                // 콜론 앞에 내용이 있으면 사용, 없으면 스킵
                if (beforeColon.length > 0) {
                    content = beforeColon;
                } else {
                    continue;
                }
            }
            
            if (content && content.length > 2 && content.length < 200) {
                // 중복 확인 후 추가
                const isDuplicate = effects.some(e => {
                    return e === content || 
                           e.includes(content) || 
                           content.includes(e);
                });
                
                if (!isDuplicate) {
                    effects.push(content);
                }
            }
        }
        
        // 효능효과가 너무 많으면 제한
        if (effects.length > 10) {
            return effects.slice(0, 10);
        }
        
    } catch (error) {
        console.error('효능효과 파싱 오류:', error);
    }
    
    return effects;
}

/**
 * 약품 상세정보 조회 및 파싱
 * @param {string} drugCode 약품코드 (EDI 코드)
 * @returns {Promise<object>} 파싱된 약품 정보
 */
async function fetchAndParseDrugDetail(drugCode) {
    try {
        const apiResponse = await fetchDrugDetailFromAPI(drugCode);
        
        if (!apiResponse.body || !apiResponse.body.items || apiResponse.body.items.length === 0) {
            return null;
        }
        
        // 첫 번째 검색 결과 사용
        const item = apiResponse.body.items[0];
        
        // 보관방법 파싱
        const storage = parseStorageMethod(item.STORAGE_METHOD);
        
        // 효능효과 파싱
        const effects = parseEffects(item.EE_DOC_DATA);
        
        return {
            code: item.ITEM_SEQ || '',
            title: item.ITEM_NAME || '',  // name 대신 title 사용
            manufacturer: item.ENTP_NAME || '',
            storageContainer: storage.container || '',
            storageTemp: storage.temperature || '',
            effects: effects,
            rawStorageMethod: item.STORAGE_METHOD || '',
            updateDate: new Date().toISOString()
        };
        
    } catch (error) {
        console.error('약품 상세정보 조회 실패:', error);
        return null;
    }
}

module.exports = {
    processLabel1Data,
    processMedicineLabel,
    processPrescriptionData,
    formatDate,
    calculateEndDate,
    fetchAndParseDrugDetail,
    parseStorageMethod,
    parseEffects
};