/**
 * 약품 보관방법(stmt) 필드에서 온도 정보만 추출하는 로직
 *
 * 개선된 로직:
 * 1. 콤마(,)를 기준으로 분리
 * 2. 각 부분에서 온도 키워드("온", "℃", "도", "냉")를 포함하는 부분만 선택
 * 3. 선택된 부분에서 용기 관련 단어("기밀용기", "차광", "밀봉용기" 등) 제거
 * 4. "보관" 단어 제거
 * 5. 정리된 온도 정보 반환
 */

/**
 * 온도 정보 추출 함수
 * @param {string} stmt - 보관방법 문자열
 * @returns {string} - 추출된 온도 정보 (없으면 빈 문자열)
 */
function extractTemperature(stmt) {
    if (!stmt || typeof stmt !== 'string') {
        return '';
    }

    // 온도 관련 키워드
    const tempKeywords = ['온', '℃', '도', '°', '냉'];

    // 1. 먼저 콤마로 분리
    const commaParts = stmt.split(',').map(part => part.trim());

    const temperatureParts = [];

    commaParts.forEach(part => {
        // 온도 키워드가 있는지 확인
        const hasTempKeyword = tempKeywords.some(keyword => part.includes(keyword));

        if (!hasTempKeyword) {
            return; // 온도 키워드 없으면 스킵
        }

        // 용기 관련 단어 제거 (정규식 사용)
        let cleaned = part
            .replace(/차광/g, '')
            .replace(/기밀용기/g, '')
            .replace(/밀봉용기/g, '')
            .replace(/용기/g, '')
            .replace(/보관/g, '')
            .trim();

        // 빈 문자열이 아니면 추가
        if (cleaned) {
            temperatureParts.push(cleaned);
        }
    });

    // 온도 정보가 여러 개면 콤마로 합치기
    return temperatureParts.join(', ');
}

// Export
module.exports = {
    extractTemperature
};

// ========== 테스트 (직접 실행 시에만) ==========
if (require.main === module) {
    // 테스트 데이터
    const testData = [
    { stmt: "기밀용기, 실온보관(2 ~ 25℃)", expected: "실온(2 ~ 25℃)" },
    { stmt: "기밀용기, 상온(15-25℃)보관", expected: "상온(15-25℃)" },
    { stmt: "차광기밀용기, 실온보관", expected: "실온" },
    { stmt: "차광기밀용기, 상온(15-25℃)보관", expected: "상온(15-25℃)" },
    { stmt: "기밀용기, 실온(1～30℃) 보관", expected: "실온(1～30℃)" },
    { stmt: "밀봉용기, 실온(30℃이하)보관", expected: "실온(30℃이하)" },
    { stmt: "차광 기밀용기, 20도이하보관", expected: "20도이하" },
    { stmt: "건냉암소 보관", expected: "건냉암소" },
    { stmt: "차광기밀용기, 냉소보관", expected: "냉소" },
    { stmt: "기밀용기 실온(1~30℃) 보관", expected: "실온(1~30℃)" },  // 콤마 없는 경우
    { stmt: "차광기밀용기 상온보관", expected: "상온" },  // 콤마 없는 경우
    { stmt: "기밀용기", expected: "" } // 온도 정보 없음
];

console.log('='.repeat(80));
console.log('온도 정보 추출 테스트');
console.log('='.repeat(80));
console.log();

let passCount = 0;
let failCount = 0;

testData.forEach((test, index) => {
    const result = extractTemperature(test.stmt);
    const pass = result === test.expected;

    console.log(`[테스트 ${index + 1}] ${pass ? '✅ PASS' : '❌ FAIL'}`);
    console.log(`  입력: ${test.stmt}`);
    console.log(`  결과: ${result || '(없음)'}`);
    console.log(`  예상: ${test.expected || '(없음)'}`);
    console.log();

    if (pass) passCount++;
    else failCount++;
});

console.log('='.repeat(80));
console.log(`테스트 결과: ${passCount}/${testData.length} 통과`);
console.log('='.repeat(80));
console.log();

// 실제 약품 데이터로 테스트
console.log('='.repeat(80));
console.log('실제 약품 데이터 테스트');
console.log('='.repeat(80));
console.log();

const medicineData = [
    { name: "나조넥스나잘스프레이", stmt: "기밀용기, 실온보관(2 ~ 25℃)" },
    { name: "알파간피점안액0.15%", stmt: "기밀용기, 상온(15-25℃)보관" },
    { name: "소아용프리마란시럽", stmt: "차광기밀용기, 실온보관" },
    { name: "맥시부펜시럽(50mL)", stmt: "차광기밀용기, 상온(15-25℃)보관" },
    { name: "히알루미니점안액0.1%(1회용)", stmt: "기밀용기, 실온(1～30℃) 보관" },
    { name: "노테몬패취1mg", stmt: "밀봉용기, 실온(30℃이하)보관" },
    { name: "에도스캡슐", stmt: "기밀용기, 실온보관(1-30℃)" },
    { name: "명문니트로글리세린설하정0.6mg", stmt: "차광 기밀용기, 20도이하보관" }
];

medicineData.forEach((medicine, index) => {
    const temp = extractTemperature(medicine.stmt);

    console.log(`[${index + 1}] ${medicine.name}`);
    console.log(`  입력: ${medicine.stmt}`);
    console.log(`  온도: ${temp || '(미지정)'}`);
    console.log();
});
}
