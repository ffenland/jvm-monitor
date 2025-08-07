// API에서 받을 수 있는 모든 필드 확인
const http = require('http');
const { parseStringPromise } = require('xml2js');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// API 키 로드
function getApiKey() {
    try {
        const configPath = path.join(process.env.APPDATA || process.env.HOME, 'electron-file-monitor', 'api-config.enc');
        
        if (!fs.existsSync(configPath)) {
            const altPath = path.join(require('os').homedir(), '.electron-file-monitor', 'api-config.enc');
            if (fs.existsSync(altPath)) {
                const key = crypto.scryptSync('electron-file-monitor-secret-2025', 'unique-salt', 32);
                const fileContent = fs.readFileSync(altPath, 'utf8');
                const { iv, data } = JSON.parse(fileContent);
                const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
                const decrypted = Buffer.concat([
                    decipher.update(Buffer.from(data, 'hex')),
                    decipher.final()
                ]);
                return decrypted.toString('utf8');
            }
            return null;
        }
        
        const key = crypto.scryptSync('electron-file-monitor-secret-2025', 'unique-salt', 32);
        const fileContent = fs.readFileSync(configPath, 'utf8');
        const { iv, data } = JSON.parse(fileContent);
        const decipher = crypto.createDecipheriv('aes-256-cbc', key, Buffer.from(iv, 'hex'));
        const decrypted = Buffer.concat([
            decipher.update(Buffer.from(data, 'hex')),
            decipher.final()
        ]);
        return decrypted.toString('utf8');
    } catch (error) {
        console.error('Error loading API key:', error.message);
        return null;
    }
}

async function checkAllApiFields() {
    console.log('=== API에서 받을 수 있는 모든 정보 ===\n');
    
    const apiKey = getApiKey();
    if (!apiKey) {
        console.error('API key not found');
        return;
    }
    
    // 여러 약품으로 테스트하여 모든 필드 확인
    const testCodes = [
        '656000260',  // 록사펜정 (정제)
        '649401610',  // 에도스캡슐 (캡슐)
        '671807171'   // 코대원에스시럽 (시럽)
    ];
    
    const allFields = new Set();
    const fieldDescriptions = {};
    
    for (const testCode of testCodes) {
        console.log(`\n테스트 약품코드: ${testCode}`);
        console.log('='.repeat(50));
        
        // 1. 약가정보 API
        const priceApiUrl = 'http://apis.data.go.kr/B551182/dgamtCrtrInfoService1.2/getDgamtList';
        let queryParams = '?' + encodeURIComponent('serviceKey') + '=' + apiKey;
        queryParams += '&' + encodeURIComponent('numOfRows') + '=' + encodeURIComponent('10');
        queryParams += '&' + encodeURIComponent('pageNo') + '=' + encodeURIComponent('1');
        queryParams += '&' + encodeURIComponent('mdsCd') + '=' + encodeURIComponent(testCode);
        
        try {
            const xmlResponse = await new Promise((resolve, reject) => {
                http.get(priceApiUrl + queryParams, (res) => {
                    let data = '';
                    res.setEncoding('utf8');
                    res.on('data', (chunk) => { data += chunk; });
                    res.on('end', () => resolve(data));
                }).on('error', reject);
            });
            
            const result = await parseStringPromise(xmlResponse, {
                explicitArray: false,
                ignoreAttrs: true
            });
            
            if (result.response?.body?.items?.item) {
                const priceInfo = result.response.body.items.item;
                
                console.log('\n[약가정보 API 필드]');
                for (const [key, value] of Object.entries(priceInfo)) {
                    allFields.add(`price_${key}`);
                    fieldDescriptions[`price_${key}`] = value;
                    console.log(`  ${key}: ${value}`);
                }
                
                // 2. 약효정보 API
                if (priceInfo.gnlNmCd) {
                    const efficacyApiUrl = 'http://apis.data.go.kr/B551182/msupCmpnMeftInfoService/getMajorCmpnNmCdList';
                    let queryParams2 = '?' + encodeURIComponent('serviceKey') + '=' + apiKey;
                    queryParams2 += '&' + encodeURIComponent('numOfRows') + '=' + encodeURIComponent('10');
                    queryParams2 += '&' + encodeURIComponent('pageNo') + '=' + encodeURIComponent('1');
                    queryParams2 += '&' + encodeURIComponent('gnlNmCd') + '=' + encodeURIComponent(priceInfo.gnlNmCd);
                    
                    const xmlResponse2 = await new Promise((resolve, reject) => {
                        http.get(efficacyApiUrl + queryParams2, (res) => {
                            let data = '';
                            res.setEncoding('utf8');
                            res.on('data', (chunk) => { data += chunk; });
                            res.on('end', () => resolve(data));
                        }).on('error', reject);
                    });
                    
                    const result2 = await parseStringPromise(xmlResponse2, {
                        explicitArray: false,
                        ignoreAttrs: true
                    });
                    
                    if (result2.response?.body?.items?.item) {
                        const efficacyInfo = Array.isArray(result2.response.body.items.item) 
                            ? result2.response.body.items.item[0] 
                            : result2.response.body.items.item;
                        
                        console.log('\n[약효정보 API 필드]');
                        for (const [key, value] of Object.entries(efficacyInfo)) {
                            allFields.add(`efficacy_${key}`);
                            fieldDescriptions[`efficacy_${key}`] = value;
                            console.log(`  ${key}: ${value}`);
                        }
                    }
                }
            }
        } catch (error) {
            console.error(`Error for ${testCode}:`, error.message);
        }
    }
    
    // 전체 필드 요약
    console.log('\n\n' + '='.repeat(70));
    console.log('=== 전체 API 필드 요약 ===');
    console.log('='.repeat(70));
    
    console.log('\n📋 약가정보 API (getDgamtList)에서 제공하는 필드:');
    console.log('----------------------------------------');
    const priceFields = {
        'adtStaDd': '적용시작일자',
        'chgBfMdsCd': '변경전 약품코드',
        'gnlNmCd': '일반명코드',
        'injcPthNm': '투여경로명 (내복/외용 등)',
        'itmNm': '품목명 (약품명 전체)',
        'mdsCd': '약품코드',
        'meftDivNo': '약효분류번호',
        'mnfEntpNm': '제조업체명',
        'mxCprc': '상한가격 (원)',
        'nomNm': '규격',
        'payTpNm': '급여구분 (급여/비급여)',
        'sbstPsblTpNm': '대체가능구분',
        'spcGnlTpNm': '전문/일반 구분',
        'unit': '단위 (정/캡슐/mL 등)'
    };
    
    for (const [field, desc] of Object.entries(priceFields)) {
        if (fieldDescriptions[`price_${field}`]) {
            console.log(`  • ${field}: ${desc}`);
            console.log(`    예시: ${fieldDescriptions[`price_${field}`]}`);
        }
    }
    
    console.log('\n💊 약효정보 API (getMajorCmpnNmCdList)에서 제공하는 필드:');
    console.log('----------------------------------------');
    const efficacyFields = {
        'divNm': '약효분류명',
        'fomnTpCdNm': '제형구분명',
        'gnlNm': '일반명 (영문)',
        'gnlNmCd': '일반명코드',
        'injcPthCdNm': '투여경로코드명',
        'iqtyTxt': '함량',
        'meftDivNo': '약효분류번호',
        'unit': '단위'
    };
    
    for (const [field, desc] of Object.entries(efficacyFields)) {
        if (fieldDescriptions[`efficacy_${field}`]) {
            console.log(`  • ${field}: ${desc}`);
            console.log(`    예시: ${fieldDescriptions[`efficacy_${field}`]}`);
        }
    }
    
    console.log('\n\n🔍 현재 medicine.json에 저장 중인 필드:');
    console.log('----------------------------------------');
    console.log('  ✓ title: 품목명 (추출된 약품명)');
    console.log('  ✓ mfdsCode: 약효분류번호');
    console.log('  ✓ payType: 급여구분');
    console.log('  ✓ isETC: 전문의약품 여부');
    console.log('  ✓ unit: 단위');
    console.log('  ✓ gnlNmCd: 일반명코드');
    console.log('  ✓ injectPath: 투여경로');
    console.log('  ✓ mdfsCodeName: 약효분류명 배열');
    
    console.log('\n\n💡 추가 가능한 유용한 필드:');
    console.log('----------------------------------------');
    console.log('  ➕ price: 상한가격 (mxCprc)');
    console.log('  ➕ manufacturer: 제조업체명 (mnfEntpNm)');
    console.log('  ➕ fullName: 전체 품목명 (itmNm)');
    console.log('  ➕ standard: 규격 (nomNm)');
    console.log('  ➕ englishName: 영문 일반명 (gnlNm)');
    console.log('  ➕ content: 함량 (iqtyTxt)');
    console.log('  ➕ formType: 제형구분 (fomnTpCdNm)');
    console.log('  ➕ startDate: 적용시작일 (adtStaDd)');
}

checkAllApiFields();