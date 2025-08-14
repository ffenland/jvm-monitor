const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

class DatabaseManager {
    constructor() {
        const dbDir = path.join(__dirname, 'db');
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }
        
        this.dbPath = path.join(dbDir, 'pharmacy.db');
        this.db = new Database(this.dbPath);
        
        // 성능 최적화 설정
        this.db.pragma('journal_mode = WAL');     // Write-Ahead Logging 모드
        this.db.pragma('synchronous = NORMAL');   // 동기화 수준 (FULL보다 빠름)
        this.db.pragma('cache_size = 10000');     // 캐시 크기 증가 (기본: 2000)
        this.db.pragma('temp_store = MEMORY');    // 임시 데이터를 메모리에 저장
        this.db.pragma('mmap_size = 30000000000'); // 메모리 맵 I/O 사용 (30GB)
        this.db.pragma('foreign_keys = ON');
        
        this.initDatabase();
        this.prepareStatements();
    }

    initDatabase() {
        // medicines 테이블: 약품 정보
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS medicines (
                code TEXT PRIMARY KEY,
                title TEXT,
                mfg TEXT,
                isETC INTEGER,
                storageContainer TEXT,
                storageTemp TEXT,
                effects TEXT,
                rawStorageMethod TEXT,
                payType TEXT,
                unit TEXT,
                gnlNmCd TEXT,
                injectPath TEXT,
                mdfsCodeName TEXT,
                price TEXT,
                formulation TEXT,
                type TEXT,
                mfdsCode TEXT,
                updateDate TEXT,
                api_fetched INTEGER DEFAULT 0,
                autoPrint INTEGER DEFAULT 0
            )
        `);

        // prescriptions 테이블: 처방전 정보
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS prescriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patientId TEXT NOT NULL,
                receiptNum TEXT NOT NULL,
                receiptDateRaw TEXT NOT NULL,
                receiptDate TEXT,
                patientName TEXT,
                hospitalName TEXT,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(receiptNum, patientId, receiptDateRaw)
            )
        `);

        // prescription_medicines 테이블: 처방전-약품 관계
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS prescription_medicines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prescriptionId INTEGER NOT NULL,
                medicineCode TEXT NOT NULL,
                prescriptionDays TEXT,
                dailyDose TEXT,
                singleDose TEXT,
                FOREIGN KEY (prescriptionId) REFERENCES prescriptions(id) ON DELETE CASCADE,
                FOREIGN KEY (medicineCode) REFERENCES medicines(code)
            )
        `);

        // parsing_logs 테이블: 파싱 이력
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS parsing_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prescriptionId INTEGER,
                patientId TEXT,
                receiptNum TEXT,
                receiptDateRaw TEXT,
                patientName TEXT,
                hospitalName TEXT,
                medicines TEXT,
                parsedAt TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (prescriptionId) REFERENCES prescriptions(id)
            )
        `);

        // medicine_fails 테이블: 실패한 약품 조회
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS medicine_fails (
                code TEXT PRIMARY KEY,
                name TEXT,
                failedAt TEXT,
                reason TEXT,
                apiUrl TEXT
            )
        `);

        // 인덱스 생성 (성능 최적화)
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_prescriptions_receiptDateRaw ON prescriptions(receiptDateRaw);
            CREATE INDEX IF NOT EXISTS idx_prescriptions_patientId ON prescriptions(patientId);
            CREATE INDEX IF NOT EXISTS idx_prescriptions_composite ON prescriptions(receiptNum, patientId, receiptDateRaw);
            CREATE INDEX IF NOT EXISTS idx_prescription_medicines_prescriptionId ON prescription_medicines(prescriptionId);
            CREATE INDEX IF NOT EXISTS idx_prescription_medicines_medicineCode ON prescription_medicines(medicineCode);
            CREATE INDEX IF NOT EXISTS idx_medicines_api_fetched ON medicines(api_fetched);
            CREATE INDEX IF NOT EXISTS idx_parsing_logs_parsedAt ON parsing_logs(parsedAt DESC);
        `);
    }

    prepareStatements() {
        // 약품 관련 statements
        this.statements = {
            insertMedicine: this.db.prepare(`
                INSERT OR REPLACE INTO medicines (
                    code, title, mfg, isETC, storageContainer, storageTemp, 
                    effects, rawStorageMethod, payType, unit, gnlNmCd, 
                    injectPath, mdfsCodeName, price, formulation, type, mfdsCode, updateDate, api_fetched, autoPrint
                ) VALUES (
                    @code, @title, @mfg, @isETC, @storageContainer, @storageTemp, 
                    @effects, @rawStorageMethod, @payType, @unit, @gnlNmCd, 
                    @injectPath, @mdfsCodeName, @price, @formulation, @type, @mfdsCode, @updateDate, @api_fetched, @autoPrint
                )
            `),
            
            getMedicine: this.db.prepare(`
                SELECT * FROM medicines WHERE code = ?
            `),
            
            // 처방전 관련
            insertPrescription: this.db.prepare(`
                INSERT INTO prescriptions (
                    patientId, receiptNum, receiptDateRaw, receiptDate, 
                    patientName, hospitalName
                ) VALUES (
                    @patientId, @receiptNum, @receiptDateRaw, @receiptDate, 
                    @patientName, @hospitalName
                )
            `),
            
            checkPrescriptionExists: this.db.prepare(`
                SELECT id FROM prescriptions 
                WHERE receiptNum = ? AND patientId = ? AND receiptDateRaw = ?
            `),
            
            // 처방약품 관련
            insertPrescriptionMedicine: this.db.prepare(`
                INSERT INTO prescription_medicines (
                    prescriptionId, medicineCode, prescriptionDays, 
                    dailyDose, singleDose
                ) VALUES (
                    @prescriptionId, @medicineCode, @prescriptionDays, 
                    @dailyDose, @singleDose
                )
            `),
            
            // 파싱 로그 관련
            insertParsingLog: this.db.prepare(`
                INSERT INTO parsing_logs (
                    prescriptionId, patientId, receiptNum, receiptDateRaw, 
                    patientName, hospitalName, medicines
                ) VALUES (
                    @prescriptionId, @patientId, @receiptNum, @receiptDateRaw, 
                    @patientName, @hospitalName, @medicines
                )
            `),
            
            // 실패 약품 관련
            insertMedicineFail: this.db.prepare(`
                INSERT OR REPLACE INTO medicine_fails (
                    code, name, failedAt, reason, apiUrl
                ) VALUES (
                    @code, @name, @failedAt, @reason, @apiUrl
                )
            `),
            
            getMedicineFail: this.db.prepare(`
                SELECT * FROM medicine_fails WHERE code = ?
            `)
        };
    }

    // 약품 정보 저장
    saveMedicine(medicineData) {
        const data = {
            ...medicineData,
            isETC: medicineData.isETC ? 1 : 0,
            effects: JSON.stringify(medicineData.effects || []),
            // mdfsCodeName은 이제 문자열로 저장 (JSON.stringify 제거)
            api_fetched: medicineData.api_fetched !== undefined ? medicineData.api_fetched : 1,
            autoPrint: medicineData.autoPrint ? 1 : 0
        };
        return this.statements.insertMedicine.run(data);
    }

    // 약품 정보 조회
    getMedicine(code) {
        const result = this.statements.getMedicine.get(code);
        if (result) {
            result.isETC = result.isETC === 1;
            result.effects = JSON.parse(result.effects || '[]');
            // mdfsCodeName은 이제 문자열로 반환 (JSON.parse 제거)
            result.autoPrint = result.autoPrint === 1;
        }
        return result;
    }

    // 처방전 저장 (트랜잭션 사용)
    savePrescription(prescriptionData) {
        const startTime = Date.now();
        const transaction = this.db.transaction((data) => {
            // 중복 체크
            const existing = this.statements.checkPrescriptionExists.get(
                data.receiptNum, 
                data.patientId, 
                data.receiptDateRaw
            );
            
            if (existing) {
                return { success: false, message: 'Prescription already exists', id: existing.id };
            }
            
            // 처방전 저장
            const prescriptionResult = this.statements.insertPrescription.run({
                patientId: data.patientId,
                receiptNum: data.receiptNum,
                receiptDateRaw: data.receiptDateRaw,
                receiptDate: data.receiptDate,
                patientName: data.patientName,
                hospitalName: data.hospitalName
            });
            
            const prescriptionId = prescriptionResult.lastInsertRowid;
            
            // 처방약품 저장 - 배치 INSERT 사용
            if (data.medicines && Array.isArray(data.medicines) && data.medicines.length > 0) {
                // 배치 INSERT를 위한 동적 SQL 생성
                const placeholders = data.medicines.map(() => '(?, ?, ?, ?, ?)').join(', ');
                const batchInsertSql = `
                    INSERT INTO prescription_medicines (
                        prescriptionId, medicineCode, prescriptionDays, 
                        dailyDose, singleDose
                    ) VALUES ${placeholders}
                `;
                
                // 파라미터 배열 생성
                const params = [];
                for (const medicine of data.medicines) {
                    params.push(
                        prescriptionId,
                        medicine.code,
                        medicine.prescriptionDays,
                        medicine.dailyDose,
                        medicine.singleDose
                    );
                }
                
                // 배치 실행
                this.db.prepare(batchInsertSql).run(...params);
            }
            
            // 파싱 로그 저장
            this.statements.insertParsingLog.run({
                prescriptionId,
                patientId: data.patientId,
                receiptNum: data.receiptNum,
                receiptDateRaw: data.receiptDateRaw,
                patientName: data.patientName,
                hospitalName: data.hospitalName,
                medicines: JSON.stringify(data.medicines || [])
            });
            
            return { success: true, id: prescriptionId };
        });
        
        const result = transaction(prescriptionData);
        
        // 성능 로깅
        const elapsed = Date.now() - startTime;
        if (elapsed > 50) {
            console.log(`[성능] 처방전 저장 시간: ${elapsed}ms (약품 ${prescriptionData.medicines?.length || 0}개)`);
        }
        
        return result;
    }

    // 날짜별 처방전 조회
    getPrescriptionsByDate(dateStr) {
        const query = `
            SELECT p.*, 
                   '[' || GROUP_CONCAT(
                       json_object(
                           'code', pm.medicineCode,
                           'prescriptionDays', pm.prescriptionDays,
                           'dailyDose', pm.dailyDose,
                           'singleDose', pm.singleDose
                       )
                   ) || ']' as medicines
            FROM prescriptions p
            LEFT JOIN prescription_medicines pm ON p.id = pm.prescriptionId
            WHERE p.receiptDateRaw = ?
            GROUP BY p.id
        `;
        
        const results = this.db.prepare(query).all(dateStr);
        
        return results.map(row => {
            const medicines = row.medicines ? 
                JSON.parse(row.medicines) : [];
            return {
                ...row,
                medicines
            };
        });
    }

    // 최근 파싱 로그 조회
    getRecentParsingLogs(limit = 100) {
        const query = `
            SELECT * FROM parsing_logs 
            ORDER BY parsedAt DESC 
            LIMIT ?
        `;
        
        const results = this.db.prepare(query).all(limit);
        return results.map(row => ({
            ...row,
            medicines: JSON.parse(row.medicines || '[]')
        }));
    }

    // 약품 실패 저장
    saveMedicineFail(failData) {
        return this.statements.insertMedicineFail.run(failData);
    }

    // 약품 실패 조회
    getMedicineFail(code) {
        return this.statements.getMedicineFail.get(code);
    }

    // 전체 약품 목록 조회
    getAllMedicines() {
        const query = `SELECT * FROM medicines ORDER BY code`;
        const results = this.db.prepare(query).all();
        
        return results.map(result => {
            result.isETC = result.isETC === 1;
            result.effects = JSON.parse(result.effects || '[]');
            // mdfsCodeName은 이제 문자열로 반환 (JSON.parse 제거)
            result.autoPrint = result.autoPrint === 1;
            return result;
        });
    }

    // 데이터베이스 닫기
    close() {
        this.db.close();
    }
}

module.exports = DatabaseManager;