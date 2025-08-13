const drugInfoManager = require('./druginfo');

async function testEdosUpdate() {
    console.log('Testing Edos medicine update with fixed parsing logic...\n');
    
    // 에도스캡슐 코드로 테스트
    const medicineCode = '649401610';
    
    // 기존 데이터 확인
    let existingInfo = drugInfoManager.getMedicineInfo(medicineCode);
    console.log('Before update:');
    console.log('Medicine:', existingInfo?.title || 'Not found');
    console.log('Effects:', existingInfo?.effects || 'Not found');
    console.log('---\n');
    
    // API에서 새로 조회
    console.log('Fetching from API with fixed parsing...');
    const detailInfo = await drugInfoManager.fetchDrugDetailInfo('code', medicineCode);
    
    if (detailInfo && !detailInfo.multipleItems) {
        // 수정된 파싱 함수로 효능효과 추출
        const effects = drugInfoManager.parseEffects(detailInfo.EE_DOC_DATA);
        console.log('Parsed effects:', effects);
        
        // medicine.json 업데이트
        if (existingInfo) {
            // 기존 데이터가 있으면 effects만 업데이트
            drugInfoManager.medicineData[medicineCode].effects = effects;
            console.log('\nUpdating existing medicine data...');
        } else {
            // 새로운 데이터 추가
            const storage = drugInfoManager.parseStorageMethod(detailInfo.STORAGE_METHOD);
            const processedTitle = drugInfoManager.extractTitle(detailInfo.ITEM_NAME);
            
            drugInfoManager.medicineData[medicineCode] = {
                title: processedTitle,
                mfg: detailInfo.ENTP_NAME || '',
                isETC: detailInfo.ETC_OTC_CODE === '전문의약품',
                storageContainer: storage.container,
                storageTemp: storage.temperature,
                effects: effects,
                rawStorageMethod: detailInfo.STORAGE_METHOD || '',
                updateDate: new Date().toISOString()
            };
            console.log('\nAdding new medicine data...');
        }
        
        // 저장
        const saved = drugInfoManager.saveMedicineData();
        console.log('Save result:', saved ? 'Success' : 'Failed');
        
        // 저장 후 다시 확인
        drugInfoManager.medicineData = drugInfoManager.loadMedicineData();
        const updatedInfo = drugInfoManager.getMedicineInfo(medicineCode);
        console.log('\nAfter update:');
        console.log('Medicine:', updatedInfo?.title || 'Not found');
        console.log('Effects:', updatedInfo?.effects || 'Not found');
    } else {
        console.log('Failed to fetch medicine detail');
    }
}

testEdosUpdate().catch(console.error);