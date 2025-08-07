// 새로운 필드 추가 테스트
const drugInfoManager = require('./druginfo');

// 테스트용 약품 데이터
const testMedicines = [
    { code: '656000260', name: '록사펜정' },  // 정제
    { code: '649401610', name: '에도스캡슐' }  // 캡슐
];

async function testNewFields() {
    console.log('=== 새로운 필드 추가 테스트 ===\n');
    console.log('price, mfg, formulation 필드가 추가되었는지 확인합니다.\n');
    
    // 약품 처리
    console.log('약품 정보를 API에서 가져오는 중...\n');
    await drugInfoManager.processPrescriptionMedicines(testMedicines);
    
    // 결과 확인
    console.log('\n=== 저장된 약품 정보 확인 ===\n');
    
    for (const medicine of testMedicines) {
        const info = drugInfoManager.getMedicineInfo(medicine.code);
        
        if (info) {
            console.log(`📦 약품코드: ${medicine.code}`);
            console.log(`  약품명: ${info.title}`);
            console.log(`  ------ 새로운 필드 ------`);
            console.log(`  💰 가격(price): ${info.price}원`);
            console.log(`  🏭 제조사(mfg): ${info.mfg}`);
            console.log(`  💊 제형(formulation): ${info.formulation}`);
            console.log(`  ------ 기존 필드 ------`);
            console.log(`  단위: ${info.unit}`);
            console.log(`  투여경로: ${info.injectPath}`);
            console.log(`  급여구분: ${info.payType}`);
            console.log(`  전문/일반: ${info.isETC ? '전문' : '일반'}`);
            console.log(`  약효분류: ${info.mdfsCodeName.join(', ')}`);
            console.log('');
        } else {
            console.log(`❌ ${medicine.code}: 정보를 가져올 수 없음\n`);
        }
    }
    
    // JSON 파일 직접 확인
    const fs = require('fs');
    const path = require('path');
    const medicineJsonPath = path.join(__dirname, 'db', 'medicine.json');
    
    if (fs.existsSync(medicineJsonPath)) {
        const medicineData = JSON.parse(fs.readFileSync(medicineJsonPath, 'utf8'));
        console.log('=== medicine.json 파일 구조 확인 ===\n');
        
        // 첫 번째 항목만 확인
        const firstKey = Object.keys(medicineData)[0];
        if (firstKey) {
            console.log(`첫 번째 약품(${firstKey})의 전체 데이터 구조:`);
            console.log(JSON.stringify(medicineData[firstKey], null, 2));
        }
    }
    
    console.log('\n=== 테스트 완료 ===');
}

testNewFields().catch(console.error);