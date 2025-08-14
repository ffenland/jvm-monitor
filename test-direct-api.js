const https = require('https');

const testUrl = 'https://apis.data.go.kr/B551182/dgamtCrtrInfoService1.2/getDgamtList?serviceKey=CO%2B6SC4kgIs5atXW%2FZDETfMu9T87tscntUhZ6cliQKjRsZM4xmiyOEfWFznoUwHkLKteqdM1e4ZpkZEopwBEMg%3D%3D&numOfRows=10&pageNo=1&mdsCd=645903750';

console.log('직접 API 테스트 시작...');
console.log('URL:', testUrl);
console.log('-'.repeat(80));

https.get(testUrl, (res) => {
    console.log('상태 코드:', res.statusCode);
    console.log('헤더:', res.headers);
    console.log('-'.repeat(80));
    
    let data = '';
    res.setEncoding('utf8');
    
    res.on('data', (chunk) => {
        data += chunk;
    });
    
    res.on('end', () => {
        console.log('응답 데이터:');
        console.log(data);
        console.log('-'.repeat(80));
        
        // XML 파싱 시도
        const xml2js = require('xml2js');
        const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true });
        
        parser.parseString(data, (err, result) => {
            if (err) {
                console.error('XML 파싱 에러:', err);
            } else {
                console.log('파싱된 결과:');
                console.log(JSON.stringify(result, null, 2));
                
                if (result && result.response) {
                    console.log('\n응답 상태:', result.response.header?.resultCode);
                    console.log('응답 메시지:', result.response.header?.resultMsg);
                    
                    if (result.response.body?.items?.item) {
                        console.log('\n조회된 약품 정보:');
                        const item = result.response.body.items.item;
                        console.log('- 품목명:', item.gnlNmCd);
                        console.log('- 제조사:', item.entpName);
                        console.log('- 주성분코드:', item.mdsCd);
                    }
                }
            }
        });
    });
}).on('error', (e) => {
    console.error('요청 에러:', e);
});