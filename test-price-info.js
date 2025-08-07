// API 가격 정보 확인
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

async function checkPriceInfo() {
    console.log('=== 약가정보 API 가격 필드 확인 ===\n');
    
    const apiKey = getApiKey();
    if (!apiKey) {
        console.error('API key not found');
        return;
    }
    
    // 테스트할 약품 코드 (록사펜정)
    const testCode = '656000260';
    console.log(`테스트 약품코드: ${testCode} (록사펜정)\n`);
    
    // 약가정보 API 호출
    const priceApiUrl = 'http://apis.data.go.kr/B551182/dgamtCrtrInfoService1.2/getDgamtList';
    let queryParams = '?' + encodeURIComponent('serviceKey') + '=' + apiKey;
    queryParams += '&' + encodeURIComponent('numOfRows') + '=' + encodeURIComponent('10');
    queryParams += '&' + encodeURIComponent('pageNo') + '=' + encodeURIComponent('1');
    queryParams += '&' + encodeURIComponent('mdsCd') + '=' + encodeURIComponent(testCode);
    
    const priceUrl = priceApiUrl + queryParams;
    
    try {
        const xmlResponse = await new Promise((resolve, reject) => {
            http.get(priceUrl, (res) => {
                let data = '';
                res.setEncoding('utf8');
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve(data));
            }).on('error', reject);
        });
        
        // XML을 JSON으로 파싱
        const result = await parseStringPromise(xmlResponse, {
            explicitArray: false,
            ignoreAttrs: true
        });
        
        if (result.response && result.response.header && result.response.header.resultCode === '00') {
            const priceInfo = result.response.body?.items?.item;
            
            if (priceInfo) {
                console.log('=== 약가정보 API 응답 필드 ===\n');
                
                // 모든 필드 출력
                for (const [key, value] of Object.entries(priceInfo)) {
                    console.log(`${key}: ${value}`);
                }
                
                console.log('\n=== 가격 관련 필드 분석 ===\n');
                
                // 가격 관련 필드 확인
                const priceFields = ['mxCprc', 'adtPrc', 'cprc', 'prc', 'price'];
                for (const field of priceFields) {
                    if (priceInfo[field]) {
                        console.log(`✓ ${field}: ${priceInfo[field]}`);
                    }
                }
                
                // mxCprc 필드 상세 분석
                if (priceInfo.mxCprc) {
                    console.log(`\n주요 가격 정보:`);
                    console.log(`  상한가(mxCprc): ${priceInfo.mxCprc}원`);
                    console.log(`  품목명: ${priceInfo.itmNm}`);
                    console.log(`  제조사: ${priceInfo.mnfEntpNm}`);
                    console.log(`  급여구분: ${priceInfo.payTpNm}`);
                    console.log(`  단위: ${priceInfo.unit}`);
                }
                
                // druginfo.js에 가격 필드 추가를 위한 제안
                console.log('\n=== druginfo.js 수정 제안 ===');
                console.log('drugInfo 객체에 다음 필드 추가 가능:');
                console.log('  price: priceInfo.mxCprc || "",  // 상한가');
                console.log('  manufacturer: priceInfo.mnfEntpNm || "",  // 제조사');
                
            } else {
                console.log('약가정보를 찾을 수 없습니다.');
            }
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

checkPriceInfo();