const https = require('https');

// API URL 그대로 사용
const url = 'https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService06/getDrugPrdtPrmsnDtlInq05?serviceKey=CO%2B6SC4kgIs5atXW%2FZDETfMu9T87tscntUhZ6cliQKjRsZM4xmiyOEfWFznoUwHkLKteqdM1e4ZpkZEopwBEMg%3D%3D&pageNo=1&numOfRows=3&type=xml&item_name=%EC%97%90%EB%8F%84%EC%8A%A4%EC%BA%A1%EC%8A%90';

console.log('Fetching data from API...');
console.log('URL:', url);
console.log('---');

https.get(url, (res) => {
    let data = '';
    res.setEncoding('utf8');
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('=== Raw XML Response ===');
        console.log(data);
        console.log('\n=== Analyzing EE_DOC_DATA ===');
        
        // EE_DOC_DATA 부분만 추출
        const eeDocMatch = data.match(/<EE_DOC_DATA>([\s\S]*?)<\/EE_DOC_DATA>/);
        if (eeDocMatch) {
            const eeDocData = eeDocMatch[0];
            console.log('EE_DOC_DATA found:');
            console.log(eeDocData);
            console.log('\n=== Testing Current Parsing Logic ===');
            
            // 현재 파싱 로직 테스트
            testCurrentParsingLogic(eeDocData);
            
            console.log('\n=== Testing Improved Parsing Logic ===');
            // 개선된 파싱 로직 테스트
            testImprovedParsingLogic(eeDocData);
        } else {
            console.log('EE_DOC_DATA not found in response');
        }
    });
}).on('error', (err) => {
    console.error('Error:', err);
});

// 현재 파싱 로직 (druginfo.js의 parseEffects 함수)
function testCurrentParsingLogic(eeDocData) {
    const effects = [];
    
    try {
        // ARTICLE title 추출
        const articleTitlePattern = /<ARTICLE\s+title="([^"]+)"/gi;
        const titleMatches = eeDocData.matchAll(articleTitlePattern);
        for (const match of titleMatches) {
            let title = match[1].trim();
            
            // 괄호로 둘러싸인 항목 제외
            if (title.startsWith('(') && title.endsWith(')')) {
                continue;
            }
            
            // 별표(*)로 시작하는 항목 제외
            if (title.startsWith('*')) {
                continue;
            }
            
            // 숫자 리스트 제거
            title = title.replace(/^\d+\.\s+/, '');
            
            if (title) {
                effects.push(title);
                console.log('Found from ARTICLE title:', title);
            }
        }
        
        // PARAGRAPH 내용 추출
        const paragraphPattern = /<PARAGRAPH>([^<]+)<\/PARAGRAPH>/gi;
        const paragraphMatches = eeDocData.matchAll(paragraphPattern);
        for (const match of paragraphMatches) {
            let text = match[1].trim();
            
            // HTML 엔티티 디코딩
            text = text.replace(/&lt;/g, '<')
                      .replace(/&gt;/g, '>')
                      .replace(/&amp;/g, '&')
                      .replace(/&quot;/g, '"')
                      .replace(/&#x[0-9a-fA-F]+;/g, '');
            
            // 괄호로 둘러싸인 항목 제외
            if (text.match(/^\(.*\)$/)) {
                continue;
            }
            
            // 별표(*)로 시작하는 항목 제외
            if (text.startsWith('*')) {
                continue;
            }
            
            // 숫자 리스트 제거
            text = text.replace(/^\d+\.\s+/, '');
            
            if (text) {
                effects.push(text);
                console.log('Found from PARAGRAPH:', text);
            }
        }
    } catch (error) {
        console.error('Error in current parsing logic:', error);
    }
    
    console.log('Current logic result:', effects.length > 0 ? effects : 'EMPTY ARRAY');
    return [...new Set(effects)];
}

// 개선된 파싱 로직
function testImprovedParsingLogic(eeDocData) {
    const effects = [];
    
    try {
        // 1. CDATA 섹션 내용 추출 (새로 추가)
        const cdataPattern = /<!\[CDATA\[([\s\S]*?)\]\]>/gi;
        const cdataMatches = eeDocData.matchAll(cdataPattern);
        for (const match of cdataMatches) {
            let text = match[1].trim();
            
            // 공백 및 특수문자 정리
            text = text.replace(/\s+/g, ' ').trim();
            
            if (text && text.length > 0) {
                effects.push(text);
                console.log('Found from CDATA:', text);
            }
        }
        
        // 2. PARAGRAPH 태그의 내용 (CDATA 포함)
        const paragraphWithCDataPattern = /<PARAGRAPH[^>]*>[\s\S]*?<!\[CDATA\[([\s\S]*?)\]\]>[\s\S]*?<\/PARAGRAPH>/gi;
        const paragraphCDataMatches = eeDocData.matchAll(paragraphWithCDataPattern);
        for (const match of paragraphCDataMatches) {
            let text = match[1].trim();
            text = text.replace(/\s+/g, ' ').trim();
            
            if (text && text.length > 0 && !effects.includes(text)) {
                effects.push(text);
                console.log('Found from PARAGRAPH with CDATA:', text);
            }
        }
        
        // 3. 기존 ARTICLE title 추출 (빈 title 제외)
        const articleTitlePattern = /<ARTICLE\s+title="([^"]+)"/gi;
        const titleMatches = eeDocData.matchAll(articleTitlePattern);
        for (const match of titleMatches) {
            let title = match[1].trim();
            
            if (title && title.length > 0) {
                // 괄호로 둘러싸인 항목이나 별표로 시작하는 항목도 포함
                // (실제 효능효과일 수 있음)
                effects.push(title);
                console.log('Found from ARTICLE title:', title);
            }
        }
        
    } catch (error) {
        console.error('Error in improved parsing logic:', error);
    }
    
    // 중복 제거
    const uniqueEffects = [...new Set(effects)];
    console.log('Improved logic result:', uniqueEffects.length > 0 ? uniqueEffects : 'EMPTY ARRAY');
    return uniqueEffects;
}