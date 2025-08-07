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
            return itmNm;
        } else if (underscoreIndex === -1) {
            splitIndex = parenIndex;
        } else if (parenIndex === -1) {
            splitIndex = underscoreIndex;
        } else {
            splitIndex = Math.min(underscoreIndex, parenIndex);
        }
        
        return itmNm.substring(0, splitIndex).trim();
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
                            console.log(`API returned error for ${mdsCd}: ${result.response?.header?.resultCode || 'Unknown error'}`);
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
     * 처방전의 모든 약품 처리
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
                console.log(`Medicine ${medicineKey} already exists in database`);
                continue;
            }
            
            // 이미 실패 목록에 있는지 확인
            const existingFail = this.failData.find(item => item.code === medicineKey);
            if (existingFail) {
                console.log(`Medicine ${medicineKey} already marked as failed`);
                continue;
            }
            
            // console.log(`Processing new medicine: ${medicineKey}`)
            
            try {
                // 1단계: 약가정보 조회 (9자리 코드 사용)
                const mdsCd = medicine.code;
                const priceInfo = await this.fetchDrugPriceInfo(mdsCd);
                
                if (!priceInfo) {
                    console.log(`No price info found for ${mdsCd}, saving to fail list`);
                    // medicineFail.json에 저장
                    const failEntry = {
                        code: medicineKey,
                        name: medicine.name || '알 수 없음',
                        apiUrl: this.priceApiUrl + '?' + encodeURIComponent('mdsCd') + '=' + encodeURIComponent(mdsCd),
                        failedAt: new Date().toISOString(),
                        reason: 'No price info found'
                    };
                    
                    // 중복 체크 후 추가
                    const existingIndex = this.failData.findIndex(item => item.code === medicineKey);
                    if (existingIndex === -1) {
                        this.failData.push(failEntry);
                    } else {
                        this.failData[existingIndex] = failEntry;
                    }
                    
                    continue;
                }
                
                // console.log(`Price info found for ${mdsCd}: ${priceInfo.itmNm}`);
                
                // 2단계: 약효정보 조회
                const efficacyInfoList = await this.fetchDrugEfficacyInfo(priceInfo.gnlNmCd);
                
                if (efficacyInfoList.length === 0) {
                    console.log(`No efficacy info found for ${mdsCd}, saving to fail list`);
                    // medicineFail.json에 저장
                    const failEntry = {
                        code: medicineKey,
                        name: medicine.name || '알 수 없음',
                        apiUrl: this.efficacyApiUrl + '?' + encodeURIComponent('gnlNmCd') + '=' + encodeURIComponent(priceInfo.gnlNmCd),
                        failedAt: new Date().toISOString(),
                        reason: 'No efficacy info found'
                    };
                    
                    // 중복 체크 후 추가
                    const existingIndex = this.failData.findIndex(item => item.code === medicineKey);
                    if (existingIndex === -1) {
                        this.failData.push(failEntry);
                    } else {
                        this.failData[existingIndex] = failEntry;
                    }
                    
                    continue;
                }
                
                // 필드 매핑 및 변환
                // 중복 제거를 위해 Set 사용
                const mdfsCodeNames = efficacyInfoList
                    .map(item => item.divNm || '')
                    .filter(name => name);
                const uniqueMdfsCodeNames = [...new Set(mdfsCodeNames)];
                
                const drugInfo = {
                    title: this.extractTitle(priceInfo.itmNm),
                    mfdsCode: priceInfo.meftDivNo || '',  // meftDivNo → mfdsCode
                    payType: priceInfo.payTpNm || '',
                    isETC: priceInfo.spcGnlTpNm === '전문',
                    unit: priceInfo.unit || '',
                    gnlNmCd: priceInfo.gnlNmCd || '',
                    injectPath: priceInfo.injcPthNm || efficacyInfoList[0]?.injcPthCdNm || '',  // 약가정보 또는 약효정보에서 가져오기
                    mdfsCodeName: uniqueMdfsCodeNames,
                    price: priceInfo.mxCprc || '',  // 상한가
                    mfg: priceInfo.mnfEntpNm || '',  // 제조업체명
                    formulation: efficacyInfoList[0]?.fomnTpCdNm || ''  // 제형
                };
                
                this.medicineData[medicineKey] = drugInfo;
                updateCount++;
                // console.log(`Successfully saved medicine ${medicineKey}: ${drugInfo.title}`);
                
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
            // console.log(`Saving ${updateCount} new medicines to medicine.json`);
            const saved = this.saveMedicineData();
            // console.log(`Save result: ${saved ? 'Success' : 'Failed'}`);
        }
        
        // fail 데이터가 있으면 저장
        if (this.failData.length > 0) {
            // console.log(`Saving ${this.failData.length} failed medicines to medicineFail.json`);
            const saved = this.saveFailData();
            // console.log(`Fail save result: ${saved ? 'Success' : 'Failed'}`);
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
            console.log(`Medicine ${medicineKey} is in failed list: ${failedMedicine.reason}`);
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