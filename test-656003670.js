const https = require('https');

// API 키
const API_KEY = 'CO%2B6SC4kgIs5atXW%2FZDETfMu9T87tscntUhZ6cliQKjRsZM4xmiyOEfWFznoUwHkLKteqdM1e4ZpkZEopwBEMg%3D%3D';

// 약품코드
const drugCode = '656003670';

console.log(`Fetching data for drug code: ${drugCode}`);
console.log('=' .repeat(60));

const url = `https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService06/getDrugPrdtPrmsnDtlInq05?serviceKey=${API_KEY}&pageNo=1&numOfRows=10&type=json&edi_code=${drugCode}`;

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
                const item = result.body?.items?.[0];
                if (item) {
                    console.log('\n약품명:', item.ITEM_NAME);
                    console.log('제조사:', item.ENTP_NAME);
                    console.log('EDI 코드:', item.EDI_CODE);
                    
                    console.log('\n=== EE_DOC_DATA (효능효과 원본) ===');
                    console.log(item.EE_DOC_DATA);
                    
                    // EE_DOC_DATA 구조 분석
                    console.log('\n=== 효능효과 구조 분석 ===');
                    
                    // ARTICLE title 추출
                    const articlePattern = /<ARTICLE\s+title="([^"]*)"[^>]*>/gi;
                    const articles = [];
                    let match;
                    while ((match = articlePattern.exec(item.EE_DOC_DATA)) !== null) {
                        if (match[1].trim()) {
                            articles.push(match[1].trim());
                        }
                    }
                    
                    console.log('\nARTICLE titles 목록:');
                    articles.forEach((article, i) => {
                        console.log(`  ${i + 1}. ${article}`);
                    });
                    
                    // PARAGRAPH 내용 추출
                    const paragraphPattern = /<PARAGRAPH[^>]*>(?:<!\[CDATA\[([\s\S]*?)\]\]>)?([^<]*)<\/PARAGRAPH>/gi;
                    const paragraphs = [];
                    while ((match = paragraphPattern.exec(item.EE_DOC_DATA)) !== null) {
                        const content = (match[1] || match[2] || '').trim();
                        if (content && !content.includes('CDATA')) {
                            paragraphs.push(content);
                        }
                    }
                    
                    console.log('\nPARAGRAPH 내용:');
                    paragraphs.forEach((para, i) => {
                        console.log(`  ${i + 1}. ${para.substring(0, 100)}${para.length > 100 ? '...' : ''}`);
                    });
                    
                    // CDATA 섹션 추출
                    const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
                    const cdataContents = [];
                    while ((match = cdataPattern.exec(item.EE_DOC_DATA)) !== null) {
                        const content = match[1].trim();
                        if (content) {
                            cdataContents.push(content);
                        }
                    }
                    
                    console.log('\nCDATA 내용:');
                    cdataContents.forEach((cdata, i) => {
                        console.log(`  ${i + 1}. ${cdata.substring(0, 100)}${cdata.length > 100 ? '...' : ''}`);
                    });
                    
                    // 현재 medicine.json에 저장된 effects
                    console.log('\n=== 현재 medicine.json의 effects ===');
                    const fs = require('fs');
                    const path = require('path');
                    try {
                        const medicinePath = path.join(__dirname, 'db', 'medicine.json');
                        const medicineData = JSON.parse(fs.readFileSync(medicinePath, 'utf8'));
                        if (medicineData[drugCode]) {
                            console.log('저장된 effects:');
                            medicineData[drugCode].effects.forEach((effect, i) => {
                                console.log(`  ${i + 1}. ${effect}`);
                            });
                        } else {
                            console.log('medicine.json에 없음');
                        }
                    } catch (e) {
                        console.log('medicine.json 읽기 실패:', e.message);
                    }
                    
                } else {
                    console.log('No item found');
                }
            } else {
                console.log('API Error:', result.header?.resultMsg);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });
}).on('error', console.error);