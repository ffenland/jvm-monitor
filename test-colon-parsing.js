const https = require('https');

// API 키
const API_KEY = 'CO%2B6SC4kgIs5atXW%2FZDETfMu9T87tscntUhZ6cliQKjRsZM4xmiyOEfWFznoUwHkLKteqdM1e4ZpkZEopwBEMg%3D%3D';

// 약품코드
const drugCode = '643103730';

console.log(`Fetching data for drug code: ${drugCode}`);
console.log('---');

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
                    console.log('약품명:', item.ITEM_NAME);
                    console.log('\n=== 원본 EE_DOC_DATA ===');
                    console.log(item.EE_DOC_DATA);
                    
                    console.log('\n=== 현재 파싱 결과 ===');
                    const currentEffects = parseEffectsCurrent(item.EE_DOC_DATA);
                    currentEffects.forEach((effect, i) => {
                        console.log(`${i + 1}. ${effect}`);
                    });
                    
                    console.log('\n=== 개선된 파싱 결과 (콜론 앞부분만) ===');
                    const improvedEffects = parseEffectsImproved(item.EE_DOC_DATA);
                    improvedEffects.forEach((effect, i) => {
                        console.log(`${i + 1}. ${effect}`);
                    });
                }
            } else {
                console.log('API Error:', result.header?.resultMsg);
            }
        } catch (error) {
            console.error('Error:', error);
        }
    });
}).on('error', console.error);

// 현재 파싱 로직
function parseEffectsCurrent(eeDocData) {
    if (!eeDocData) {
        return [];
    }
    
    const effects = [];
    
    try {
        // CDATA 섹션 내용 추출
        const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
        const cdataMatches = eeDocData.matchAll(cdataPattern);
        for (const match of cdataMatches) {
            let text = match[1].trim();
            text = text.replace(/\s+/g, ' ').trim();
            
            if (text && text.length > 0 && !text.includes('다음 환자') && !text.includes('이상반응')) {
                effects.push(text);
            }
        }
        
        // ARTICLE title 추출
        const articleTitlePattern = /<ARTICLE\s+title="([^"]+)"/gi;
        const titleMatches = eeDocData.matchAll(articleTitlePattern);
        for (const match of titleMatches) {
            let title = match[1].trim();
            
            if (title.startsWith('(') && title.endsWith(')')) {
                continue;
            }
            if (title.startsWith('*')) {
                continue;
            }
            
            title = title.replace(/^\d+\.\s+/, '');
            
            if (title && !effects.includes(title)) {
                effects.push(title);
            }
        }
    } catch (error) {
        console.error('파싱 오류:', error);
    }
    
    return [...new Set(effects)];
}

// 개선된 파싱 로직 (콜론 앞부분만 추출)
function parseEffectsImproved(eeDocData) {
    if (!eeDocData) {
        return [];
    }
    
    const effects = [];
    
    try {
        // CDATA 섹션 내용 추출
        const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
        const cdataMatches = eeDocData.matchAll(cdataPattern);
        for (const match of cdataMatches) {
            let text = match[1].trim();
            text = text.replace(/\s+/g, ' ').trim();
            
            if (text && text.length > 0 && !text.includes('다음 환자') && !text.includes('이상반응')) {
                // 콜론이 있으면 앞부분만 추출
                if (text.includes(':')) {
                    text = text.split(':')[0].trim();
                }
                
                // 괄호 내용 제거 (선택사항)
                // text = text.replace(/\([^)]*\)/g, '').trim();
                
                if (text) {
                    effects.push(text);
                }
            }
        }
        
        // ARTICLE title 추출
        const articleTitlePattern = /<ARTICLE\s+title="([^"]+)"/gi;
        const titleMatches = eeDocData.matchAll(articleTitlePattern);
        for (const match of titleMatches) {
            let title = match[1].trim();
            
            if (title.startsWith('(') && title.endsWith(')')) {
                continue;
            }
            if (title.startsWith('*')) {
                continue;
            }
            
            // 숫자 리스트 제거
            title = title.replace(/^\d+\.\s+/, '');
            
            // 콜론이 있으면 앞부분만 추출
            if (title.includes(':')) {
                title = title.split(':')[0].trim();
            }
            
            if (title && !effects.includes(title)) {
                effects.push(title);
            }
        }
    } catch (error) {
        console.error('파싱 오류:', error);
    }
    
    return [...new Set(effects)];
}