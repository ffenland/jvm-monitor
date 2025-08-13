const fs = require('fs');
const path = require('path');
const http = require('http');
const { parseStringPromise } = require('xml2js');
const simpleSecureConfig = require('./simpleSecureConfig');

class DrugInfoManager {
    constructor() {
        this.dbPath = path.join(__dirname, 'db', 'medicine.json');
        this.failPath = path.join(__dirname, 'db', 'medicineFail.json');
        this.priceApiUrl = 'http://apis.data.go.kr/B551182/dgamtCrtrInfoService1.2/getDgamtList';
        this.efficacyApiUrl = 'http://apis.data.go.kr/B551182/msupCmpnMeftInfoService/getMajorCmpnNmCdList';
        this.drugDetailApiUrl = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService06/getDrugPrdtPrmsnDtlInq05';
        this.medicineData = this.loadMedicineData();
        this.failData = this.loadFailData();
    }

    /**
     * medicine.json 파일 로드
     */
    loadMedicineData() {
        try {
            if (fs.existsSync(this.dbPath)) {
                const data = fs.readFileSync(this.dbPath, 'utf8');
                // 빈 파일이거나 공백만 있는 경우 처리
                if (!data || data.trim() === '') {
                    return {};
                }
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading medicine data:', error);
        }
        return {};
    }

    /**
     * medicine.json 파일 저장
     */
    saveMedicineData() {
        try {
            const dbDir = path.dirname(this.dbPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            fs.writeFileSync(this.dbPath, JSON.stringify(this.medicineData, null, 2), 'utf8');
            // 파일 시스템 동기화 강제
            fs.fsyncSync(fs.openSync(this.dbPath, 'r+'));
            return true;
        } catch (error) {
            console.error('Error saving medicine data:', error);
            return false;
        }
    }


    /**
     * medicineFail.json 파일 로드
     */
    loadFailData() {
        try {
            if (fs.existsSync(this.failPath)) {
                const data = fs.readFileSync(this.failPath, 'utf8');
                if (!data || data.trim() === '') {
                    return [];
                }
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading fail data:', error);
        }
        return [];
    }

    /**
     * medicineFail.json 파일 저장
     */
    saveFailData() {
        try {
            const dbDir = path.dirname(this.failPath);
            if (!fs.existsSync(dbDir)) {
                fs.mkdirSync(dbDir, { recursive: true });
            }
            fs.writeFileSync(this.failPath, JSON.stringify(this.failData, null, 2), 'utf8');
            return true;
        } catch (error) {
            console.error('Error saving fail data:', error);
            return false;
        }
    }

    /**
     * 품목명에서 제목 추출 (첫 번째 _ 또는 ( 이전까지)
     */
    extractTitle(itmNm) {
        if (!itmNm) return '';
        
        const underscoreIndex = itmNm.indexOf('_');
        const parenIndex = itmNm.indexOf('(');
        
        let splitIndex;
        if (underscoreIndex === -1 && parenIndex === -1) {
            splitIndex = itmNm.length;
        } else if (underscoreIndex === -1) {
            splitIndex = parenIndex;
        } else if (parenIndex === -1) {
            splitIndex = underscoreIndex;
        } else {
            splitIndex = Math.min(underscoreIndex, parenIndex);
        }
        
        let title = itmNm.substring(0, splitIndex).trim();
        
        // 한글 mg 표현을 영문 mg로 변환
        // 밀리그램, 밀리그람 → mg
        title = title.replace(/(\d+)\s?(밀리그램|밀리그람)/g, '$1mg');
        
        return title;
    }

    /**
     * 약품 상세정보 API 호출 (DrugPrdtPrmsnDtlInq05)
     * @param {string} searchType 'code' 또는 'name'
     * @param {string} searchValue 검색값 (코드 또는 약품명)
     */
    async fetchDrugDetailInfo(searchType, searchValue) {
        const apiKey = simpleSecureConfig.getApiKey();
        if (!apiKey) {
            throw new Error('API key not found');
        }

        const https = require('https');
        
        // URL 인코딩 처리 - % 문자 등 특수문자 처리
        let encodedValue = encodeURIComponent(searchValue);
        
        let queryParams = '?serviceKey=' + apiKey;
        queryParams += '&pageNo=1';
        queryParams += '&numOfRows=10';
        queryParams += '&type=json';
        
        if (searchType === 'code') {
            queryParams += '&edi_code=' + encodedValue;
        } else {
            queryParams += '&item_name=' + encodedValue;
        }

        const url = this.drugDetailApiUrl + queryParams;
        
        return new Promise((resolve, reject) => {
            https.get(url, (res) => {
                let data = '';
                res.setEncoding('utf8');
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', () => {
                    try {
                        const result = JSON.parse(data);
                        
                        if (result.header && result.header.resultCode === '00') {
                            const items = result.body?.items;
                            if (!items || items.length === 0) {
                                resolve(null);
                            } else if (items.length === 1) {
                                resolve(items[0]);
                            } else {
                                // 여러 개 조회된 경우
                                resolve({ multipleItems: true, count: items.length });
                            }
                        } else {
                            resolve(null);
                        }
                    } catch (error) {
                        console.error('Error parsing drug detail response:', error);
                        resolve(null);
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * STORAGE_METHOD 파싱 함수 (dataProcessor.js에서 가져옴)
     */
    parseStorageMethod(storageMethod) {
        if (!storageMethod) {
            return { container: null, temperature: null };
        }
        
        let normalized = storageMethod
            .replace(/��/g, '℃')
            .replace(/도(?=\s*이하|\s*이상|$)/g, '℃')
            .replace(/보관/g, '')
            .trim();
        
        // 먼저 쉼표로 분리 시도
        let parts = normalized.split(',').map(s => s.trim());
        
        // 쉼표가 없고 공백이 있는 경우, 온도 패턴 앞에서 분리
        if (parts.length === 1 && parts[0].includes(' ')) {
            // 온도 관련 패턴들
            const tempStartPatterns = [
                /\s+실온[\s\(]/,
                /\s+냉장/,
                /\s+냉동/,
                /\s+\d+\s*℃/,
                /\s+\d+\s*~\s*\d+\s*℃/,
                /\s+\d+\s*이하/,
                /\s+\d+\s*이상/,
                /\s+습기/
            ];
            
            // 온도 패턴을 찾아서 그 위치에서 분리
            for (const pattern of tempStartPatterns) {
                const match = parts[0].match(pattern);
                if (match) {
                    const index = match.index;
                    const containerPart = parts[0].substring(0, index).trim();
                    const tempPart = parts[0].substring(index).trim();
                    if (containerPart && tempPart) {
                        parts = [containerPart, tempPart];
                        break;
                    }
                }
            }
        }
        
        let container = [];
        let temperature = [];
        
        parts.forEach(part => {
            // 온도 패턴을 더 엄격하게 체크
            const tempPatterns = [
                /^실온[\s\(]/,  // 실온으로 시작
                /실온\s*\(/,     // 실온(
                /^\d+\s*℃/,     // 숫자+℃로 시작
                /^\d+\s*~\s*\d+\s*℃/,  // 온도 범위
                /^냉장/,
                /^냉동/,
                /^\d+\s*이하/,
                /^\d+\s*이상/,
                /^습기/          // 습기로 시작
            ];
            
            const isTemperature = tempPatterns.some(pattern => pattern.test(part));
            
            if (isTemperature || part.includes('℃') || part.includes('실온') || part.includes('냉장') || part.includes('냉동')) {
                let temp = part;
                if (/^\d+\s*(이하|이상)$/.test(temp)) {
                    temp = temp.replace(/(\d+)\s*(이하|이상)/, '$1℃$2');
                }
                temperature.push(temp);
            } else if (part && !part.match(/^\s*$/)) {
                // 용기 관련 키워드 확인
                const containerKeywords = ['용기', '차광', '밀폐', '기밀', '얼리지'];
                const hasContainerKeyword = containerKeywords.some(keyword => part.includes(keyword));
                
                if (hasContainerKeyword) {
                    container.push(part);
                } else {
                    // 키워드가 없으면 온도로 분류
                    temperature.push(part);
                }
            }
        });
        
        return { 
            container: container.length > 0 ? container.join(', ') : null,
            temperature: temperature.length > 0 ? temperature.join(', ') : null
        };
    }

    /**
     * EE_DOC_DATA에서 효능효과 추출 (dataProcessor.js에서 가져옴)
     */
    parseEffects(eeDocData) {
        if (!eeDocData) {
            return [];
        }
        
        const effects = [];
        
        try {
            // 1. ARTICLE title 추출 (메인 효능효과 항목)
            const articleTitlePattern = /<ARTICLE\s+title="([^"]+)"/gi;
            const titleMatches = eeDocData.matchAll(articleTitlePattern);
            
            for (const match of titleMatches) {
                let title = match[1].trim();
                
                // 별표(*)로 시작하는 항목 제외 (제품 정보)
                if (title.startsWith('*')) {
                    continue;
                }
                
                // 괄호로 둘러싸인 항목 제외
                if (title.startsWith('(') && title.endsWith(')')) {
                    continue;
                }
                
                // 하위 번호 패턴 제외
                if (/^\d+\)/.test(title) || /^\(\d+\)/.test(title) || 
                    /^[가-하]\./.test(title) || /^[a-z]\)/.test(title)) {
                    continue;
                }
                
                // 숫자 및 문자 순번 제거 (1., 2., a., b. 등)
                title = title.replace(/^[0-9a-zA-Z]+\.\s+/, '');
                
                // 콜론이 있으면 앞부분만 추출
                if (title.includes(':')) {
                    title = title.split(':')[0].trim();
                }
                
                // 너무 긴 텍스트는 간략화 (80자 제한)
                if (title.length > 80) {
                    // 주요 부분만 남김
                    const cutIndex = title.lastIndexOf(')', 80);
                    if (cutIndex > 40) {
                        title = title.substring(0, cutIndex + 1);
                    } else {
                        title = title.substring(0, 77) + '...';
                    }
                }
                
                if (title && !effects.includes(title)) {
                    effects.push(title);
                }
            }
            
            // 2. ARTICLE이 없는 경우만 CDATA 확인 (폴백)
            if (effects.length === 0) {
                const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
                const cdataMatches = eeDocData.matchAll(cdataPattern);
                
                for (const match of cdataMatches) {
                    let text = match[1].trim();
                    text = text.replace(/\s+/g, ' ').trim();
                    
                    // 하위 항목 표시로 시작하는 경우 제외
                    if (/^[\-•◦]/.test(text) || /^\d+\)/.test(text) || 
                        /^\(\d+\)/.test(text) || text.includes('&#x')) {
                        continue;
                    }
                    
                    // 효능효과가 아닌 다른 섹션 제외
                    if (text.includes('다음 환자') || text.includes('이상반응')) {
                        continue;
                    }
                    
                    // 숫자 및 문자 순번 제거
                    text = text.replace(/^[0-9a-zA-Z]+\.\s+/, '');
                    
                    // 콜론이 있으면 앞부분만 추출
                    if (text.includes(':')) {
                        text = text.split(':')[0].trim();
                    }
                    
                    if (text && text.length > 0 && !effects.includes(text)) {
                        effects.push(text);
                        break; // 첫 번째 유효한 항목만 사용
                    }
                }
            }
            
        } catch (error) {
            console.error('효능효과 파싱 중 오류:', error);
        }
        
        return [...new Set(effects)];
    }

    /**
     * 1단계: 제품코드로 약가정보 조회
     */
    async fetchDrugPriceInfo(mdsCd) {
        const apiKey = simpleSecureConfig.getApiKey();
        if (!apiKey) {
            throw new Error('API key not found');
        }

        let queryParams = '?' + encodeURIComponent('serviceKey') + '=' + apiKey;
        queryParams += '&' + encodeURIComponent('numOfRows') + '=' + encodeURIComponent('10');
        queryParams += '&' + encodeURIComponent('pageNo') + '=' + encodeURIComponent('1');
        queryParams += '&' + encodeURIComponent('mdsCd') + '=' + encodeURIComponent(mdsCd);

        const url = this.priceApiUrl + queryParams;
        
        return new Promise((resolve, reject) => {
            http.get(url, (res) => {
                let data = '';
                
                // UTF-8 인코딩 설정
                res.setEncoding('utf8');
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', async () => {
                    try {
                        // XML을 JSON으로 변환
                        const result = await parseStringPromise(data, { 
                            explicitArray: false,
                            ignoreAttrs: true 
                        });
                        
                        if (result.response && result.response.header && result.response.header.resultCode === '00') {
                            const item = result.response.body?.items?.item;
                            resolve(item || null);
                        } else {
                            resolve(null);
                        }
                    } catch (error) {
                        console.error('Error parsing API response:', error);
                        console.error('Raw data that failed to parse:', data);
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * 2단계: 일반명코드로 약효정보 조회
     */
    async fetchDrugEfficacyInfo(gnlNmCd) {
        const apiKey = simpleSecureConfig.getApiKey();
        if (!apiKey) {
            throw new Error('API key not found');
        }

        let queryParams = '?' + encodeURIComponent('serviceKey') + '=' + apiKey;
        queryParams += '&' + encodeURIComponent('numOfRows') + '=' + encodeURIComponent('10');
        queryParams += '&' + encodeURIComponent('pageNo') + '=' + encodeURIComponent('1');
        queryParams += '&' + encodeURIComponent('gnlNmCd') + '=' + encodeURIComponent(gnlNmCd);

        const url = this.efficacyApiUrl + queryParams;
        
        return new Promise((resolve, reject) => {
            http.get(url, (res) => {
                let data = '';
                
                // UTF-8 인코딩 설정
                res.setEncoding('utf8');
                
                res.on('data', (chunk) => {
                    data += chunk;
                });
                
                res.on('end', async () => {
                    try {
                        const result = await parseStringPromise(data, { 
                            explicitArray: false,
                            ignoreAttrs: true 
                        });
                        
                        if (result.response && result.response.header && result.response.header.resultCode === '00') {
                            const items = result.response.body?.items?.item;
                            if (items) {
                                const itemArray = Array.isArray(items) ? items : [items];
                                resolve(itemArray);
                            } else {
                                resolve([]);
                            }
                        } else {
                            resolve([]);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }).on('error', reject);
        });
    }

    /**
     * 처방전의 모든 약품 처리 (새로운 로직)
     */
    async processPrescriptionMedicines(medicines) {
        if (!medicines || !Array.isArray(medicines)) {
            return;
        }

        let updateCount = 0;
        
        for (const medicine of medicines) {
            if (!medicine.code) continue;
            
            // 9자리 코드를 그대로 키로 사용
            const medicineKey = medicine.code;
            
            // 이미 존재하는지 확인
            if (this.medicineData[medicineKey]) {
                continue;
            }
            
            // 이미 실패 목록에 있는지 확인
            const existingFail = this.failData.find(item => item.code === medicineKey);
            if (existingFail) {
                continue;
            }
            
            
            try {
                // 1단계: getDrugPrdtPrmsnDtlInq05 API로 약품 상세정보 조회
                let detailInfo = await this.fetchDrugDetailInfo('code', medicineKey);
                
                // 코드로 조회 실패 시 약품명으로 재시도
                if (!detailInfo && medicine.name) {
                    detailInfo = await this.fetchDrugDetailInfo('name', medicine.name);
                }
                
                // 조회 실패 또는 여러 개 조회된 경우 처리
                if (!detailInfo) {
                    const failEntry = {
                        code: medicineKey,
                        name: medicine.name || '알 수 없음',
                        failedAt: new Date().toISOString(),
                        reason: '코드 또는 약품명으로 조회되지 않음'
                    };
                    this.failData.push(failEntry);
                    continue;
                }
                
                if (detailInfo.multipleItems) {
                    const failEntry = {
                        code: medicineKey,
                        name: medicine.name || '알 수 없음',
                        failedAt: new Date().toISOString(),
                        reason: `해당 약품명으로 복수의 약품이 존재합니다 (${detailInfo.count}개). 사용자 확인이 필요`
                    };
                    this.failData.push(failEntry);
                    continue;
                }
                
                // 상세정보에서 데이터 추출
                const storage = this.parseStorageMethod(detailInfo.STORAGE_METHOD);
                const effects = this.parseEffects(detailInfo.EE_DOC_DATA);
                
                // 약품명 가공 (extractTitle 함수 적용)
                const processedTitle = this.extractTitle(detailInfo.ITEM_NAME);
                
                // 2단계: 기존 API로 추가 정보 조회 (가격, 약효정보)
                const priceInfo = await this.fetchDrugPriceInfo(medicineKey);
                let payType = '';
                let unit = '';
                let gnlNmCd = '';
                let injectPath = '';
                let mdfsCodeName = [];
                let price = '';
                let formulation = '';
                let mfdsCode = '';
                
                if (priceInfo) {
                    payType = priceInfo.payTpNm || '';
                    unit = priceInfo.unit || '';
                    gnlNmCd = priceInfo.gnlNmCd || '';
                    injectPath = priceInfo.injcPthNm || '';
                    price = priceInfo.mxCprc || '';
                    mfdsCode = priceInfo.mfdsCd || '';  // mfdsCode 추출
                    
                    // 3단계: 약효정보 조회
                    if (gnlNmCd) {
                        const efficacyInfoList = await this.fetchDrugEfficacyInfo(gnlNmCd);
                        if (efficacyInfoList.length > 0) {
                            const mdfsCodeNames = efficacyInfoList
                                .map(item => item.divNm || '')
                                .filter(name => name);
                            mdfsCodeName = [...new Set(mdfsCodeNames)];
                            
                            if (!injectPath && efficacyInfoList[0]?.injcPthCdNm) {
                                injectPath = efficacyInfoList[0].injcPthCdNm;
                            }
                            formulation = efficacyInfoList[0]?.fomnTpCdNm || '';
                            
                            // mfdsCode가 없고 efficacyInfoList에서 찾을 수 있다면 추출
                            if (!mfdsCode && efficacyInfoList[0]?.meftDivNo) {
                                mfdsCode = efficacyInfoList[0].meftDivNo;
                            }
                        }
                    }
                } else {
                }
                
                // 최종 약품 정보 구성
                const drugInfo = {
                    title: processedTitle,  // getDrugPrdtPrmsnDtlInq05에서 가져온 약품명 사용
                    mfg: detailInfo.ENTP_NAME || '',  // 제조사
                    isETC: detailInfo.ETC_OTC_CODE === '전문의약품',  // 전문/일반 구분
                    storageContainer: storage.container,
                    storageTemp: storage.temperature,
                    effects: effects,
                    rawStorageMethod: detailInfo.STORAGE_METHOD || '',
                    // 기존 API에서 가져온 정보
                    payType: payType,
                    unit: unit,
                    gnlNmCd: gnlNmCd,
                    injectPath: injectPath,
                    mdfsCodeName: mdfsCodeName,
                    price: price,
                    formulation: formulation,
                    mfdsCode: mfdsCode,  // API에서 가져온 mfdsCode 사용
                    updateDate: new Date().toISOString()
                };
                
                this.medicineData[medicineKey] = drugInfo;
                updateCount++;
                
                // API 호출 간격을 두어 과부하 방지 (0.5초)
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`Error processing medicine ${medicineKey}:`, error.message);
                // API 호출 중 에러 발생 시 medicineFail.json에 저장
                const failEntry = {
                    code: medicineKey,
                    name: medicine.name || '알 수 없음',
                    apiUrl: this.priceApiUrl + '?' + encodeURIComponent('mdsCd') + '=' + encodeURIComponent(medicine.code),
                    failedAt: new Date().toISOString(),
                    reason: `API Error: ${error.message}`
                };
                
                // 중복 체크 후 추가
                const existingIndex = this.failData.findIndex(item => item.code === medicineKey);
                if (existingIndex === -1) {
                    this.failData.push(failEntry);
                } else {
                    this.failData[existingIndex] = failEntry;
                }
            }
        }
        
        // 업데이트된 내용이 있으면 저장
        if (updateCount > 0) {
            const saved = this.saveMedicineData();
        }
        
        // fail 데이터가 있으면 저장
        if (this.failData.length > 0) {
            const saved = this.saveFailData();
        }
    }

    /**
     * 단일 약품 코드 조회
     */
    getMedicineInfo(medicineCode) {
        // 데이터가 업데이트되었을 수 있으므로 다시 로드
        this.medicineData = this.loadMedicineData();
        this.failData = this.loadFailData();
        
        // 9자리 코드를 그대로 사용
        const medicineKey = medicineCode;
        
        // 실패 목록에 있는지 확인
        const failedMedicine = this.failData.find(item => item.code === medicineKey);
        if (failedMedicine) {
        }
        
        return this.medicineData[medicineKey] || null;
    }
}

// xml2js가 없으면 설치 필요
try {
    require('xml2js');
} catch (e) {
    console.error('xml2js module not found. Please run: npm install xml2js');
}

// 싱글톤 인스턴스
const drugInfoManager = new DrugInfoManager();

module.exports = drugInfoManager;