const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

// 테스트용 데이터 생성
function generateTestData() {
    return {
        patientId: '12345678901',
        receiptNum: 'RX' + Date.now(),
        receiptDateRaw: '20250814',
        receiptDate: '2025년08월14일',
        patientName: '테스트환자',
        hospitalName: '테스트병원',
        medicines: [
            { code: '645903750', name: '약품1', prescriptionDays: '7', dailyDose: '3', singleDose: '1' },
            { code: '678600240', name: '약품2', prescriptionDays: '7', dailyDose: '2', singleDose: '2' },
            { code: '646203690', name: '약품3', prescriptionDays: '14', dailyDose: '1', singleDose: '1' },
            { code: '123456789', name: '약품4', prescriptionDays: '30', dailyDose: '3', singleDose: '2' },
            { code: '987654321', name: '약품5', prescriptionDays: '7', dailyDose: '2', singleDose: '1' }
        ]
    };
}

// SQLite 성능 테스트
function testSQLitePerformance() {
    const db = new Database(path.join(__dirname, 'db', 'pharmacy.db'));
    
    // WAL 모드 설정 (성능 향상)
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = NORMAL'); // FULL 대신 NORMAL 사용
    
    const data = generateTestData();
    
    console.log('\n=== SQLite 성능 테스트 ===');
    
    // 1. 일반 트랜잭션 방식
    const start1 = Date.now();
    const transaction = db.transaction((prescriptionData) => {
        const stmt1 = db.prepare(`
            INSERT INTO prescriptions (patientId, receiptNum, receiptDateRaw, receiptDate, patientName, hospitalName)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt1.run(
            prescriptionData.patientId,
            prescriptionData.receiptNum + '_1',
            prescriptionData.receiptDateRaw,
            prescriptionData.receiptDate,
            prescriptionData.patientName,
            prescriptionData.hospitalName
        );
        
        const prescriptionId = result.lastInsertRowid;
        
        const stmt2 = db.prepare(`
            INSERT INTO prescription_medicines (prescriptionId, medicineCode, prescriptionDays, dailyDose, singleDose)
            VALUES (?, ?, ?, ?, ?)
        `);
        
        for (const med of prescriptionData.medicines) {
            stmt2.run(prescriptionId, med.code, med.prescriptionDays, med.dailyDose, med.singleDose);
        }
    });
    
    transaction(data);
    const time1 = Date.now() - start1;
    console.log(`일반 트랜잭션: ${time1}ms`);
    
    // 2. 배치 INSERT 방식 (성능 개선)
    const start2 = Date.now();
    const batchTransaction = db.transaction((prescriptionData) => {
        const stmt1 = db.prepare(`
            INSERT INTO prescriptions (patientId, receiptNum, receiptDateRaw, receiptDate, patientName, hospitalName)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        
        const result = stmt1.run(
            prescriptionData.patientId,
            prescriptionData.receiptNum + '_2',
            prescriptionData.receiptDateRaw,
            prescriptionData.receiptDate,
            prescriptionData.patientName,
            prescriptionData.hospitalName
        );
        
        const prescriptionId = result.lastInsertRowid;
        
        // 배치 INSERT 사용
        const placeholders = prescriptionData.medicines.map(() => '(?, ?, ?, ?, ?)').join(', ');
        const batchStmt = db.prepare(`
            INSERT INTO prescription_medicines (prescriptionId, medicineCode, prescriptionDays, dailyDose, singleDose)
            VALUES ${placeholders}
        `);
        
        const values = [];
        for (const med of prescriptionData.medicines) {
            values.push(prescriptionId, med.code, med.prescriptionDays, med.dailyDose, med.singleDose);
        }
        
        batchStmt.run(...values);
    });
    
    batchTransaction(data);
    const time2 = Date.now() - start2;
    console.log(`배치 INSERT: ${time2}ms`);
    
    db.close();
}

// JSON 성능 테스트
function testJSONPerformance() {
    const data = generateTestData();
    const jsonPath = path.join(__dirname, 'test-data.json');
    
    console.log('\n=== JSON 성능 테스트 ===');
    
    // 쓰기 테스트
    const start1 = Date.now();
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));
    const time1 = Date.now() - start1;
    console.log(`JSON 쓰기: ${time1}ms`);
    
    // 읽기 테스트
    const start2 = Date.now();
    const readData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const time2 = Date.now() - start2;
    console.log(`JSON 읽기: ${time2}ms`);
    
    // 정리
    fs.unlinkSync(jsonPath);
}

// 성능 개선 제안
function suggestOptimizations() {
    console.log('\n=== SQLite 성능 개선 방법 ===');
    console.log('1. WAL 모드 사용: db.pragma("journal_mode = WAL")');
    console.log('2. 동기화 수준 조정: db.pragma("synchronous = NORMAL")');
    console.log('3. 캐시 크기 증가: db.pragma("cache_size = 10000")');
    console.log('4. 배치 INSERT 사용');
    console.log('5. Prepared statements 재사용');
    console.log('6. 인덱스 최적화');
    console.log('7. VACUUM 정기 실행');
}

// 테스트 실행
console.log('성능 테스트 시작...');
testSQLitePerformance();
testJSONPerformance();
suggestOptimizations();

console.log('\n=== 결론 ===');
console.log('SQLite는 초기 설정과 트랜잭션 오버헤드가 있지만,');
console.log('적절한 최적화로 JSON과 유사한 성능을 낼 수 있습니다.');
console.log('또한 데이터 무결성, 동시성 제어, 쿼리 기능 등의 장점이 있습니다.');