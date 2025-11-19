const Database = require('better-sqlite3-multiple-ciphers');
const path = require('path');
const fs = require('fs');
const { getEncryptionKey } = require('../utils/encryptionKey');
const logger = require('./logger');
const { getKSTDateString } = require('../utils/dateUtils');

/**
 * 새로운 데이터베이스 구조
 *
 * 테이블:
 * - patients: 환자 정보
 * - prescriptions: 처방전 정보
 * - medicines: 약품 정보
 * - prescription_medicines: 처방전-약품 관계
 */

class DatabaseManager {
    /**
     * 앱 데이터 디렉토리 경로를 반환합니다.
     * 모든 앱 데이터(DB, 설정, 템플릿 등)는 이 디렉토리 아래에 저장됩니다.
     * @returns {string} 앱 데이터 디렉토리 경로 (예: C:\Users\username\Documents\Labelix)
     */
    static getAppDataDir() {
        try {
            const { app } = require('electron');
            return path.join(app.getPath('documents'), 'Labelix');
        } catch (e) {
            // 개발 환경이나 Electron 컨텍스트가 없는 경우
            return path.join(__dirname);
        }
    }

    /**
     * DB 디렉토리 경로를 반환합니다.
     * @returns {string} DB 디렉토리 경로 (예: C:\Users\username\Documents\Labelix\db)
     */
    static getDbDir() {
        return path.join(DatabaseManager.getAppDataDir(), 'db');
    }

    /**
     * 템플릿 디렉토리 경로를 반환합니다.
     * @returns {string} 템플릿 디렉토리 경로 (예: C:\Users\username\Documents\Labelix\templates)
     */
    static getTemplatesDir() {
        return path.join(DatabaseManager.getAppDataDir(), 'templates');
    }

    /**
     * 설정 파일 경로를 반환합니다.
     * @returns {string} 설정 파일 경로 (예: C:\Users\username\Documents\Labelix\config.json)
     */
    static getConfigPath() {
        return path.join(DatabaseManager.getAppDataDir(), 'config.json');
    }

    /**
     * 임시 파일 디렉토리 경로를 반환합니다.
     * @returns {string} 임시 파일 디렉토리 경로 (예: C:\Users\username\Documents\Labelix\temp)
     */
    static getTempDir() {
        return path.join(DatabaseManager.getAppDataDir(), 'temp');
    }

    constructor() {
        // DB 디렉토리 생성
        const dbDir = DatabaseManager.getDbDir();
        if (!fs.existsSync(dbDir)) {
            fs.mkdirSync(dbDir, { recursive: true });
        }

        this.dbPath = path.join(dbDir, 'pharmacy.db');
        this.db = new Database(this.dbPath);

        // 데이터베이스 암호화 적용
        const encryptionKey = getEncryptionKey();
        this.db.pragma(`key = '${encryptionKey}'`);
        this.db.pragma('cipher = chacha20');

        // 성능 최적화 설정
        this.db.pragma('journal_mode = WAL');
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('cache_size = 10000');
        this.db.pragma('temp_store = MEMORY');
        this.db.pragma('foreign_keys = ON');

        // DB 마이그레이션 및 초기화
        this.runDatabaseMigrations();
        this.prepareStatements();
    }

    /**
     * KST 시간을 ISO 문자열로 반환
     * @returns {string} YYYY-MM-DD HH:mm:ss 형식의 KST 시간
     */
    getKSTTimestamp() {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    }

    /**
     * DB 마이그레이션 및 초기화
     */
    runDatabaseMigrations() {
        const CURRENT_SCHEMA_VERSION = 2;
        const currentVersion = this.db.pragma('user_version', { simple: true });

        console.log(`[DatabaseManager] Current DB version: ${currentVersion}`);

        if (currentVersion === 0) {
            // 버전 0: 새 DB 또는 기존 DB (버전 관리 안 했던 것)
            const tablesExist = this.db.prepare(`
                SELECT COUNT(*) as count FROM sqlite_master
                WHERE type='table' AND name='medicines'
            `).get();

            if (tablesExist.count > 0) {
                // 기존 DB: 테이블 있음, 마이그레이션 필요
                console.log('[DatabaseManager] Existing DB detected, running migrations from v0...');
                this.migrateFromV0ToV1();
                this.migrateFromV1ToV2();
            } else {
                // 완전히 새로운 DB: 최신 스키마로 생성
                console.log('[DatabaseManager] New DB detected, creating all tables with latest schema...');
                this.createAllTables();
            }
        } else if (currentVersion < CURRENT_SCHEMA_VERSION) {
            // 부분 마이그레이션 실행
            console.log(`[DatabaseManager] Upgrading DB from v${currentVersion} to v${CURRENT_SCHEMA_VERSION}...`);

            if (currentVersion < 1) {
                this.migrateFromV0ToV1();
            }
            if (currentVersion < 2) {
                this.migrateFromV1ToV2();
            }
        } else {
            console.log('[DatabaseManager] DB is up to date.');
        }

        // 최종 버전 설정
        this.db.pragma(`user_version = ${CURRENT_SCHEMA_VERSION}`);
        console.log(`[DatabaseManager] DB version set to ${CURRENT_SCHEMA_VERSION}`);
    }

    /**
     * v0 -> v1 마이그레이션
     * 템플릿 시스템 추가
     */
    migrateFromV0ToV1() {
        console.log('[Migration] Running v0 -> v1 migration...');

        // label_templates 테이블 생성
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS label_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                filePath TEXT NOT NULL UNIQUE,
                description TEXT,
                isDefault INTEGER DEFAULT 0,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // patient_template_preferences 테이블 생성
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS patient_template_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patientId TEXT NOT NULL UNIQUE,
                templateId INTEGER NOT NULL,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patientId) REFERENCES patients(patientId) ON DELETE CASCADE,
                FOREIGN KEY (templateId) REFERENCES label_templates(id) ON DELETE CASCADE
            )
        `);

        // 인덱스 추가
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_label_templates_isDefault ON label_templates(isDefault);
            CREATE INDEX IF NOT EXISTS idx_patient_template_preferences_patientId ON patient_template_preferences(patientId);
        `);

        console.log('[Migration] v0 -> v1 migration completed.');
    }

    /**
     * v1 -> v2 마이그레이션
     * medicines 테이블에 templateId 컬럼 추가
     */
    migrateFromV1ToV2() {
        console.log('[Migration] Running v1 -> v2 migration...');

        // templateId 컬럼이 이미 있는지 확인
        const columnExists = this.db.prepare(`
            SELECT COUNT(*) as count FROM pragma_table_info('medicines')
            WHERE name='templateId'
        `).get();

        if (columnExists.count === 0) {
            // 컬럼이 없으면 추가
            this.db.exec('ALTER TABLE medicines ADD COLUMN templateId INTEGER');
            console.log('[Migration] Added templateId column to medicines table');
        } else {
            console.log('[Migration] templateId column already exists, skipping');
        }

        console.log('[Migration] v1 -> v2 migration completed.');
    }

    /**
     * 최신 스키마로 모든 테이블 생성 (새 DB용)
     */
    createAllTables() {
        console.log('[DatabaseManager] Creating all tables with latest schema...');

        // 1. patients 테이블 (환자)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS patients (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patientId TEXT UNIQUE NOT NULL,
                patientName TEXT,
                birthDate TEXT,
                age INTEGER,
                gender TEXT,
                memo TEXT,
                style TEXT,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 2. prescriptions 테이블 (처방전)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS prescriptions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patientId TEXT NOT NULL,
                receiptDateRaw TEXT NOT NULL,
                receiptDate TEXT,
                receiptNum INTEGER NOT NULL,
                hospitalName TEXT,
                doctorName TEXT,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(patientId, receiptDateRaw, receiptNum),
                FOREIGN KEY (patientId) REFERENCES patients(patientId)
            )
        `);

        // 3. medicines 테이블 (약품 - yakjung_code 기준) - templateId 포함
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS medicines (
                yakjung_code TEXT PRIMARY KEY,
                drug_name TEXT,
                drug_form TEXT,
                dosage_route TEXT,
                cls_code TEXT,
                upso_name TEXT,
                medititle TEXT,
                stmt TEXT,
                temperature TEXT,
                unit TEXT,
                custom_usage TEXT,
                usage_priority TEXT DEFAULT '1324',
                autoPrint INTEGER DEFAULT 0,
                templateId INTEGER,
                api_fetched INTEGER DEFAULT 0,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 4. medicine_bohcodes 테이블 (bohcode 매핑 - 1:N 관계)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS medicine_bohcodes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                yakjung_code TEXT NOT NULL,
                bohcode TEXT UNIQUE NOT NULL,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (yakjung_code) REFERENCES medicines(yakjung_code)
            )
        `);

        // 5. prescription_medicines 테이블 (처방전-약품 관계)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS prescription_medicines (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prescriptionId INTEGER NOT NULL,
                medicineCode TEXT NOT NULL,
                prescriptionDays TEXT,
                dailyDose TEXT,
                singleDose TEXT,
                FOREIGN KEY (prescriptionId) REFERENCES prescriptions(id) ON DELETE CASCADE,
                FOREIGN KEY (medicineCode) REFERENCES medicine_bohcodes(bohcode)
            )
        `);

        // 6. parsing_history 테이블 (파싱 이력)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS parsing_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                prescriptionId INTEGER NOT NULL,
                parsedDate TEXT NOT NULL,
                parsedAt TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (prescriptionId) REFERENCES prescriptions(id) ON DELETE CASCADE
            )
        `);

        // 인덱스 생성
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_patients_patientId ON patients(patientId);
            CREATE INDEX IF NOT EXISTS idx_prescriptions_patientId ON prescriptions(patientId);
            CREATE INDEX IF NOT EXISTS idx_prescriptions_receiptDate ON prescriptions(receiptDateRaw);
            CREATE INDEX IF NOT EXISTS idx_medicines_yakjung_code ON medicines(yakjung_code);
            CREATE INDEX IF NOT EXISTS idx_medicine_bohcodes_yakjung_code ON medicine_bohcodes(yakjung_code);
            CREATE INDEX IF NOT EXISTS idx_medicine_bohcodes_bohcode ON medicine_bohcodes(bohcode);
            CREATE INDEX IF NOT EXISTS idx_prescription_medicines_prescriptionId ON prescription_medicines(prescriptionId);
            CREATE INDEX IF NOT EXISTS idx_prescription_medicines_medicineCode ON prescription_medicines(medicineCode);
            CREATE INDEX IF NOT EXISTS idx_parsing_history_parsedDate ON parsing_history(parsedDate);
            CREATE INDEX IF NOT EXISTS idx_parsing_history_prescriptionId ON parsing_history(prescriptionId);
        `);

        // 7. license 테이블 (라이선스 정보)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS license (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                pharmacyName TEXT NOT NULL,
                ownerName TEXT NOT NULL,
                email TEXT NOT NULL,
                licenseKey TEXT NOT NULL,
                isActivated INTEGER DEFAULT 0,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                lastVerifiedAt TEXT
            )
        `);

        // 8. app_settings 테이블 (앱 설정 정보)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS app_settings (
                id INTEGER PRIMARY KEY CHECK (id = 1),
                atcPath TEXT DEFAULT 'C:\\ATDPS\\Data',
                templatePath TEXT,
                deleteOriginalFile INTEGER DEFAULT 0,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 9. app_logs 테이블 (에러 로그)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS app_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                level TEXT NOT NULL CHECK(level IN ('info', 'warning', 'error')),
                category TEXT,
                message TEXT NOT NULL,
                details TEXT,
                stack TEXT,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // app_logs 인덱스 추가
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs(level);
            CREATE INDEX IF NOT EXISTS idx_app_logs_category ON app_logs(category);
            CREATE INDEX IF NOT EXISTS idx_app_logs_timestamp ON app_logs(timestamp DESC);
        `);

        // 10. label_templates 테이블 (라벨 템플릿)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS label_templates (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                filePath TEXT NOT NULL UNIQUE,
                description TEXT,
                isDefault INTEGER DEFAULT 0,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // 11. patient_template_preferences 테이블 (환자별 템플릿 설정)
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS patient_template_preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                patientId TEXT NOT NULL UNIQUE,
                templateId INTEGER NOT NULL,
                createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
                updatedAt TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (patientId) REFERENCES patients(patientId) ON DELETE CASCADE,
                FOREIGN KEY (templateId) REFERENCES label_templates(id) ON DELETE CASCADE
            )
        `);

        // label_templates 인덱스 추가
        this.db.exec(`
            CREATE INDEX IF NOT EXISTS idx_label_templates_isDefault ON label_templates(isDefault);
            CREATE INDEX IF NOT EXISTS idx_patient_template_preferences_patientId ON patient_template_preferences(patientId);
        `);

        console.log('[DatabaseManager] All tables created successfully.');
    }

    prepareStatements() {
        this.statements = {
            // === 환자 관련 ===
            getPatient: this.db.prepare(`
                SELECT * FROM patients WHERE patientId = ?
            `),

            insertPatient: this.db.prepare(`
                INSERT INTO patients (patientId, patientName, birthDate, age, gender, memo, style)
                VALUES (@patientId, @patientName, @birthDate, @age, @gender, @memo, @style)
            `),

            updatePatient: this.db.prepare(`
                UPDATE patients
                SET patientName = @patientName,
                    birthDate = @birthDate,
                    age = @age,
                    gender = @gender,
                    memo = @memo,
                    style = @style,
                    updatedAt = CURRENT_TIMESTAMP
                WHERE patientId = @patientId
            `),

            // === 약품 관련 ===
            getMedicine: this.db.prepare(`
                SELECT * FROM medicines WHERE yakjung_code = ?
            `),

            getMedicineByBohcode: this.db.prepare(`
                SELECT m.* FROM medicines m
                INNER JOIN medicine_bohcodes mb ON m.yakjung_code = mb.yakjung_code
                WHERE mb.bohcode = ?
            `),

            insertMedicine: this.db.prepare(`
                INSERT INTO medicines (
                    yakjung_code, drug_name, drug_form, dosage_route,
                    cls_code, upso_name, medititle,
                    stmt, temperature, unit, custom_usage, usage_priority, autoPrint, api_fetched
                ) VALUES (
                    @yakjung_code, @drug_name, @drug_form, @dosage_route,
                    @cls_code, @upso_name, @medititle,
                    @stmt, @temperature, @unit, @custom_usage, @usage_priority, @autoPrint, @api_fetched
                )
            `),

            // === bohcode 매핑 관련 ===
            getBohcode: this.db.prepare(`
                SELECT * FROM medicine_bohcodes WHERE bohcode = ?
            `),

            insertBohcode: this.db.prepare(`
                INSERT INTO medicine_bohcodes (yakjung_code, bohcode)
                VALUES (@yakjung_code, @bohcode)
            `),

            getBohcodesByYakjungCode: this.db.prepare(`
                SELECT bohcode FROM medicine_bohcodes WHERE yakjung_code = ?
            `),

            // === 처방전 관련 ===
            checkPrescriptionExists: this.db.prepare(`
                SELECT id FROM prescriptions
                WHERE patientId = ? AND receiptDateRaw = ? AND receiptNum = ?
            `),

            insertPrescription: this.db.prepare(`
                INSERT INTO prescriptions (
                    patientId, receiptDateRaw, receiptDate, receiptNum,
                    hospitalName, doctorName
                ) VALUES (
                    @patientId, @receiptDateRaw, @receiptDate, @receiptNum,
                    @hospitalName, @doctorName
                )
            `),

            getPrescriptionById: this.db.prepare(`
                SELECT * FROM prescriptions WHERE id = ?
            `),

            // === 처방전-약품 관계 ===
            insertPrescriptionMedicine: this.db.prepare(`
                INSERT INTO prescription_medicines (
                    prescriptionId, medicineCode, prescriptionDays,
                    dailyDose, singleDose
                ) VALUES (
                    @prescriptionId, @medicineCode, @prescriptionDays,
                    @dailyDose, @singleDose
                )
            `),

            // === 파싱 이력 관련 ===
            insertParsingHistory: this.db.prepare(`
                INSERT INTO parsing_history (prescriptionId, parsedDate, parsedAt)
                VALUES (@prescriptionId, @parsedDate, @parsedAt)
            `),

            // === 앱 설정 관련 ===
            getAppSettings: this.db.prepare('SELECT * FROM app_settings WHERE id = 1'),

            // === 로그 관련 ===
            insertLog: this.db.prepare(`
                INSERT INTO app_logs (timestamp, level, category, message, details, stack)
                VALUES (@timestamp, @level, @category, @message, @details, @stack)
            `),

            getLogsByLevel: this.db.prepare(`
                SELECT * FROM app_logs
                WHERE level = ?
                ORDER BY timestamp DESC
                LIMIT ?
            `),

            getAllLogs: this.db.prepare(`
                SELECT * FROM app_logs
                ORDER BY timestamp DESC
                LIMIT ?
            `),

            deleteOldLogs: this.db.prepare(`
                DELETE FROM app_logs
                WHERE datetime(createdAt) < datetime('now', '-30 days')
            `),

            deleteAllLogs: this.db.prepare(`
                DELETE FROM app_logs
            `)
        };
    }

    // ========== 환자 관련 메서드 ==========

    /**
     * 환자 정보 저장 또는 업데이트
     * @param {Object} patientData - { patientId, patientName, birthDate, age, gender, memo?, style? }
     * @returns {Object} 저장된 환자 정보
     */
    saveOrUpdatePatient(patientData) {
        const existing = this.statements.getPatient.get(patientData.patientId);

        // memo와 style이 없으면 null로 설정
        const data = {
            ...patientData,
            memo: patientData.memo || null,
            style: patientData.style || null
        };

        if (existing) {
            // 기존 환자 정보 업데이트
            this.statements.updatePatient.run(data);
            return this.statements.getPatient.get(data.patientId);
        } else {
            // 새 환자 추가
            this.statements.insertPatient.run(data);
            return this.statements.getPatient.get(data.patientId);
        }
    }

    /**
     * 환자 정보 조회
     * @param {string} patientId - 환자 ID
     * @returns {Object|null} 환자 정보
     */
    getPatient(patientId) {
        return this.statements.getPatient.get(patientId);
    }

    // ========== 약품 관련 메서드 ==========

    /**
     * 약품 정보 조회 (yakjung_code로)
     * @param {string} yakjungCode - 약학정보원 코드
     * @returns {Object|null} 약품 정보
     */
    getMedicine(yakjungCode) {
        return this.statements.getMedicine.get(yakjungCode);
    }

    /**
     * 약품 정보 조회 (bohcode로)
     * @param {string} bohcode - 9자리 약품 코드
     * @returns {Object|null} 약품 정보 (bohcode 포함)
     */
    getMedicineByBohcode(bohcode) {
        const medicine = this.statements.getMedicineByBohcode.get(bohcode);
        if (medicine) {
            // bohcode 정보도 함께 반환
            const bohcodeInfo = this.statements.getBohcode.get(bohcode);
            return { ...medicine, bohcode: bohcodeInfo?.bohcode };
        }
        return null;
    }

    /**
     * bohcode 매핑 조회
     * @param {string} bohcode - 9자리 약품 코드
     * @returns {Object|null} { id, yakjung_code, bohcode, createdAt }
     */
    getBohcode(bohcode) {
        return this.statements.getBohcode.get(bohcode);
    }

    /**
     * yakjung_code에 연결된 모든 bohcode 조회
     * @param {string} yakjungCode - 약학정보원 코드
     * @returns {Array<string>} bohcode 배열
     */
    getBohcodesByYakjungCode(yakjungCode) {
        return this.statements.getBohcodesByYakjungCode.all(yakjungCode).map(row => row.bohcode);
    }

    /**
     * 약품 정보 저장
     * @param {Object} medicineData - { bohcode, yakjung_code, drug_name, ... }
     * @returns {Object} 저장된 약품 정보 (bohcode 포함)
     */
    saveMedicine(medicineData) {
        const { bohcode, yakjung_code, ...medicineFields } = medicineData;

        // 트랜잭션으로 처리
        const transaction = this.db.transaction(() => {
            // 1. 약품 정보 저장/업데이트
            const existingMedicine = this.statements.getMedicine.get(yakjung_code);
            if (!existingMedicine) {
                this.statements.insertMedicine.run({ yakjung_code, ...medicineFields });
            }

            // 2. bohcode 매핑 저장 (중복 체크)
            const existingBohcode = this.statements.getBohcode.get(bohcode);
            if (!existingBohcode) {
                this.statements.insertBohcode.run({ yakjung_code, bohcode });
            }
        });

        transaction();

        // 저장된 데이터 반환
        return this.getMedicineByBohcode(bohcode);
    }

    /**
     * 약품의 custom_usage 업데이트
     * @param {string} yakjungCode - 약학정보원 코드
     * @param {string|null} customUsage - 커스텀 용법 (null이면 제거)
     * @returns {Object} 업데이트된 약품 정보
     */
    updateMedicineCustomUsage(yakjungCode, customUsage) {
        const updateStmt = this.db.prepare(`
            UPDATE medicines
            SET custom_usage = ?,
                updatedAt = CURRENT_TIMESTAMP
            WHERE yakjung_code = ?
        `);
        updateStmt.run(customUsage, yakjungCode);
        return this.statements.getMedicine.get(yakjungCode);
    }

    /**
     * 약품의 usage_priority 업데이트
     * @param {string} yakjungCode - 약학정보원 코드
     * @param {string} usagePriority - 4자리 우선순위 문자열 (예: "1324")
     * @returns {Object} 업데이트된 약품 정보
     */
    updateMedicineUsagePriority(yakjungCode, usagePriority) {
        // 입력 검증
        if (!/^\d{4}$/.test(usagePriority)) {
            throw new Error('usage_priority는 4자리 숫자여야 합니다 (예: "1324")');
        }

        const updateStmt = this.db.prepare(`
            UPDATE medicines
            SET usage_priority = ?,
                updatedAt = CURRENT_TIMESTAMP
            WHERE yakjung_code = ?
        `);
        updateStmt.run(usagePriority, yakjungCode);
        return this.statements.getMedicine.get(yakjungCode);
    }

    /**
     * 약품의 unit(단위) 업데이트
     * @param {string} yakjungCode - 약학정보원 코드
     * @param {string} unit - 단위 (예: "정", "캡슐", "ml")
     * @returns {Object} 업데이트된 약품 정보
     */
    updateMedicineUnit(yakjungCode, unit) {
        const updateStmt = this.db.prepare(`
            UPDATE medicines
            SET unit = ?,
                updatedAt = CURRENT_TIMESTAMP
            WHERE yakjung_code = ?
        `);
        updateStmt.run(unit, yakjungCode);
        return this.statements.getMedicine.get(yakjungCode);
    }

    /**
     * 약품의 autoPrint(자동인쇄 여부) 업데이트
     * @param {string} yakjungCode - 약학정보원 코드
     * @param {number} autoPrint - 자동인쇄 여부 (0: false, 1: true)
     * @returns {Object} 업데이트된 약품 정보
     */
    updateMedicineAutoPrint(yakjungCode, autoPrint) {
        const updateStmt = this.db.prepare(`
            UPDATE medicines
            SET autoPrint = ?,
                updatedAt = CURRENT_TIMESTAMP
            WHERE yakjung_code = ?
        `);
        updateStmt.run(autoPrint ? 1 : 0, yakjungCode);
        return this.statements.getMedicine.get(yakjungCode);
    }

    /**
     * 약품 정보 전체 업데이트 (약학정보원에서 데이터 재조회 시 사용)
     * @param {string} yakjungCode - 약학정보원 코드
     * @param {Object} medicineData - 업데이트할 약품 정보
     * @returns {Object} 업데이트된 약품 정보
     */
    updateMedicineFromYakjungwon(yakjungCode, medicineData) {
        const updateStmt = this.db.prepare(`
            UPDATE medicines
            SET drug_name = ?,
                drug_form = ?,
                dosage_route = ?,
                cls_code = ?,
                upso_name = ?,
                medititle = ?,
                stmt = ?,
                temperature = ?,
                unit = ?,
                api_fetched = 1,
                updatedAt = CURRENT_TIMESTAMP
            WHERE yakjung_code = ?
        `);

        updateStmt.run(
            medicineData.drug_name,
            medicineData.drug_form,
            medicineData.dosage_route,
            medicineData.cls_code,
            medicineData.upso_name,
            medicineData.medititle,
            medicineData.stmt,
            medicineData.temperature,
            medicineData.unit,
            yakjungCode
        );

        return this.statements.getMedicine.get(yakjungCode);
    }

    /**
     * 약품 정보 수동 업데이트 (사용자가 직접 입력한 데이터 저장)
     * 사용자가 입력한 값을 그대로 저장하며, custom_usage와 usage_priority도 포함
     * @param {string} yakjungCode - 약학정보원 코드
     * @param {Object} medicineData - 사용자가 입력한 약품 정보
     * @returns {Object} 업데이트된 약품 정보
     */
    updateMedicineManually(yakjungCode, medicineData) {
        const updateStmt = this.db.prepare(`
            UPDATE medicines
            SET drug_name = ?,
                drug_form = ?,
                dosage_route = ?,
                cls_code = ?,
                upso_name = ?,
                medititle = ?,
                temperature = ?,
                unit = ?,
                custom_usage = ?,
                autoPrint = ?,
                templateId = ?,
                api_fetched = 1,
                updatedAt = CURRENT_TIMESTAMP
            WHERE yakjung_code = ?
        `);

        updateStmt.run(
            medicineData.drug_name || null,
            medicineData.drug_form || null,
            medicineData.dosage_route || null,
            medicineData.cls_code || null,
            medicineData.upso_name || null,
            medicineData.medititle || null,
            medicineData.temperature || null,
            medicineData.unit || '회',
            medicineData.custom_usage || null,
            medicineData.autoPrint !== undefined ? medicineData.autoPrint : 0,
            medicineData.templateId !== undefined ? medicineData.templateId : null,
            yakjungCode
        );

        return this.statements.getMedicine.get(yakjungCode);
    }

    /**
     * yakjung_code를 변경하면서 약품 정보 업데이트
     * (검색으로 정확한 약품을 찾았을 때 사용)
     *
     * @param {string} oldYakjungCode - 기존 yakjung_code (fail_xxxx)
     * @param {string} newYakjungCode - 새로운 yakjung_code (검색으로 찾은 정확한 코드)
     * @param {Object} medicineData - 새로운 약품 정보
     * @returns {Object} 업데이트된 약품 정보
     */
    replaceMedicineWithNewYakjungCode(oldYakjungCode, newYakjungCode, medicineData) {
        const transaction = this.db.transaction(() => {
            // 1. 기존 약품 정보 조회
            const oldMedicine = this.statements.getMedicine.get(oldYakjungCode);
            if (!oldMedicine) {
                throw new Error(`기존 약품을 찾을 수 없습니다: ${oldYakjungCode}`);
            }

            // 2. yakjung_code가 동일한 경우: 기존 약품 정보만 업데이트
            if (oldYakjungCode === newYakjungCode) {
                this.updateMedicineFromYakjungwon(oldYakjungCode, medicineData);
                return this.statements.getMedicine.get(oldYakjungCode);
            }

            // 3. 새 yakjung_code로 약품이 이미 존재하는지 확인
            const existingNewMedicine = this.statements.getMedicine.get(newYakjungCode);

            if (existingNewMedicine) {
                // 새 약품이 이미 존재하면 bohcode 매핑만 업데이트
                // 기존 bohcode들을 새 yakjung_code로 연결
                const oldBohcodes = this.getBohcodesByYakjungCode(oldYakjungCode);

                const updateBohcodeSt = this.db.prepare(`
                    UPDATE medicine_bohcodes
                    SET yakjung_code = ?
                    WHERE bohcode = ?
                `);

                for (const bohcode of oldBohcodes) {
                    updateBohcodeSt.run(newYakjungCode, bohcode);
                }

                // 기존 약품 삭제
                this.db.prepare('DELETE FROM medicines WHERE yakjung_code = ?').run(oldYakjungCode);

                // 기존 약품 정보 업데이트
                this.updateMedicineFromYakjungwon(newYakjungCode, medicineData);
            } else {
                // 새 약품이 없으면 새로 생성하고 bohcode 매핑 업데이트
                // 1) 새 약품 추가
                this.statements.insertMedicine.run({
                    yakjung_code: newYakjungCode,
                    drug_name: medicineData.drug_name || '',
                    drug_form: medicineData.drug_form || '',
                    dosage_route: medicineData.dosage_route || '',
                    cls_code: medicineData.cls_code || '',
                    upso_name: medicineData.upso_name || '',
                    medititle: medicineData.medititle || '',
                    stmt: medicineData.stmt || '',
                    temperature: medicineData.temperature || '',
                    unit: medicineData.unit || oldMedicine.unit || '회',
                    custom_usage: oldMedicine.custom_usage,  // 기존 custom_usage 유지
                    usage_priority: oldMedicine.usage_priority || '1324',  // 기존 usage_priority 유지
                    autoPrint: oldMedicine.autoPrint || 0,  // 기존 autoPrint 유지
                    api_fetched: 1
                });

                // 2) bohcode 매핑 업데이트
                const oldBohcodes = this.getBohcodesByYakjungCode(oldYakjungCode);

                const updateBohcodeSt = this.db.prepare(`
                    UPDATE medicine_bohcodes
                    SET yakjung_code = ?
                    WHERE bohcode = ?
                `);

                for (const bohcode of oldBohcodes) {
                    updateBohcodeSt.run(newYakjungCode, bohcode);
                }

                // 3) 기존 약품 삭제
                this.db.prepare('DELETE FROM medicines WHERE yakjung_code = ?').run(oldYakjungCode);
            }

            return this.statements.getMedicine.get(newYakjungCode);
        });

        return transaction();
    }

    /**
     * 전체 약품 목록 조회
     * @returns {Array} 약품 목록
     */
    getAllMedicines() {
        return this.db.prepare('SELECT * FROM medicines ORDER BY bohcode').all();
    }

    /**
     * 약학정보원 조회 실패한 약품 목록 조회
     * @returns {Array} api_fetched = 0인 약품 목록
     */
    getAllMedicineFails() {
        return this.db.prepare('SELECT * FROM medicines WHERE api_fetched = 0 ORDER BY yakjung_code').all();
    }

    /**
     * 약학정보원 조회 실패한 약품 개수 조회
     * @returns {number} api_fetched = 0인 약품 개수
     */
    getMedicineFailCount() {
        return this.db.prepare('SELECT COUNT(*) as count FROM medicines WHERE api_fetched = 0').get().count;
    }

    /**
     * 약품 실패 기록 삭제 (api_fetched를 1로 변경)
     * @param {string} bohcode - 약품 코드
     */
    deleteMedicineFail(bohcode) {
        const updateStmt = this.db.prepare(`
            UPDATE medicines
            SET api_fetched = 1,
                updatedAt = CURRENT_TIMESTAMP
            WHERE bohcode = ?
        `);
        updateStmt.run(bohcode);
    }

    // ========== 처방전 관련 메서드 ==========

    /**
     * 처방전 저장 (트랜잭션)
     * @param {Object} prescriptionData - { patientId, receiptDateRaw, receiptDate, receiptNum, hospitalName, doctorName, medicines: [], parsedDate?: string }
     * @returns {Object} { success: boolean, id: number, isDuplicate: boolean }
     */
    savePrescription(prescriptionData) {
        const transaction = this.db.transaction((data) => {
            // 0. 처방전 저장 전에 모든 bohcode가 medicine_bohcodes에 존재하는지 확인
            if (data.medicines && Array.isArray(data.medicines)) {
                for (const medicine of data.medicines) {
                    const bohcode = medicine.code;
                    const medicineName = medicine.name || '정보없음';  // 파싱한 약품명 사용

                    // bohcode 매핑 확인
                    const existingBohcode = this.statements.getBohcode.get(bohcode);

                    if (!existingBohcode) {
                        // bohcode가 없으면 임시 약품 데이터 생성

                        // fail_xxxx 형식의 임의 yakjung_code 생성
                        let failCode;
                        let attempts = 0;
                        while (attempts < 1000) {
                            const randomNum = Math.floor(1000 + Math.random() * 9000);
                            failCode = `fail_${randomNum}`;
                            const existing = this.statements.getMedicine.get(failCode);
                            if (!existing) break;
                            attempts++;
                        }
                        if (attempts >= 1000) {
                            failCode = `fail_${Date.now().toString().slice(-4)}`;
                        }

                        // medicines 테이블에 저장 (파싱한 약품명 사용)
                        this.statements.insertMedicine.run({
                            yakjung_code: failCode,
                            drug_name: medicineName,  // 파싱한 약품명 사용
                            drug_form: '정보없음',
                            dosage_route: '정보없음',
                            cls_code: '정보없음',
                            upso_name: '정보없음',
                            medititle: '정보없음',
                            stmt: '정보없음',
                            temperature: '정보없음',
                            unit: '회',
                            custom_usage: null,
                            usage_priority: '1324',
                            autoPrint: 0,
                            api_fetched: 0
                        });

                        // medicine_bohcodes 테이블에 매핑 저장
                        this.statements.insertBohcode.run({
                            yakjung_code: failCode,
                            bohcode: bohcode
                        });
                    }
                }
            }

            // 1. 중복 체크
            const existing = this.statements.checkPrescriptionExists.get(
                data.patientId,
                data.receiptDateRaw,
                data.receiptNum
            );

            if (existing) {
                // 중복 처방전이지만 파싱 이력 추가
                const parsedDate = data.parsedDate || getKSTDateString(); // KST 기준 오늘 날짜
                const parsedAt = this.getKSTTimestamp();
                this.statements.insertParsingHistory.run({
                    prescriptionId: existing.id,
                    parsedDate: parsedDate,
                    parsedAt: parsedAt
                });

                return {
                    success: true,
                    id: existing.id,
                    isDuplicate: true,
                    message: 'Prescription already exists, parsing history added'
                };
            }

            // 2. 처방전 저장
            const prescriptionResult = this.statements.insertPrescription.run({
                patientId: data.patientId,
                receiptDateRaw: data.receiptDateRaw,
                receiptDate: data.receiptDate,
                receiptNum: data.receiptNum,
                hospitalName: data.hospitalName,
                doctorName: data.doctorName
            });

            const prescriptionId = prescriptionResult.lastInsertRowid;

            // 3. 처방전-약품 관계 저장 (배치 INSERT)
            if (data.medicines && Array.isArray(data.medicines) && data.medicines.length > 0) {
                const placeholders = data.medicines.map(() => '(?, ?, ?, ?, ?)').join(', ');
                const batchInsertSql = `
                    INSERT INTO prescription_medicines (
                        prescriptionId, medicineCode, prescriptionDays,
                        dailyDose, singleDose
                    ) VALUES ${placeholders}
                `;

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

                this.db.prepare(batchInsertSql).run(...params);
            }

            // 4. 파싱 이력 추가
            const parsedDate = data.parsedDate || getKSTDateString(); // KST 기준 오늘 날짜
            const parsedAt = this.getKSTTimestamp();
            this.statements.insertParsingHistory.run({
                prescriptionId: prescriptionId,
                parsedDate: parsedDate,
                parsedAt: parsedAt
            });

            return { success: true, id: prescriptionId, isDuplicate: false };
        });

        return transaction(prescriptionData);
    }

    /**
     * 처방전 조회 (ID로)
     * @param {number} id - 처방전 ID
     * @returns {Object|null} 처방전 정보
     */
    getPrescriptionById(id) {
        return this.statements.getPrescriptionById.get(id);
    }

    /**
     * 날짜별 처방전 조회 (접수번호 역순 정렬)
     * @param {string} dateStr - YYYYMMDD 형식
     * @returns {Array} 처방전 목록 (약품 정보 포함)
     */
    getPrescriptionsByDate(dateStr) {
        const query = `
            SELECT p.*,
                   pt.patientName,
                   pt.age,
                   pt.gender
            FROM prescriptions p
            LEFT JOIN patients pt ON p.patientId = pt.patientId
            WHERE p.receiptDateRaw = ?
            ORDER BY p.receiptNum DESC
        `;
        const prescriptions = this.db.prepare(query).all(dateStr);

        // 각 처방전에 약품 정보 추가
        return prescriptions.map(prescription => ({
            ...prescription,
            medicines: this.getPrescriptionMedicines(prescription.id)
        }));
    }

    /**
     * 파싱 날짜별 처방전 조회 (파싱 이력 기반)
     * @param {string} parsedDateStr - YYYYMMDD 형식
     * @returns {Array} 처방전 목록 (약품 정보 포함, parsedAt 포함)
     */
    getPrescriptionsByParsingDate(parsedDateStr) {
        const query = `
            SELECT p.*,
                   pt.patientName,
                   pt.age,
                   pt.gender,
                   ph.parsedAt,
                   ph.parsedDate
            FROM parsing_history ph
            INNER JOIN prescriptions p ON ph.prescriptionId = p.id
            LEFT JOIN patients pt ON p.patientId = pt.patientId
            WHERE ph.parsedDate = ?
            ORDER BY ph.parsedAt ASC, p.receiptNum ASC
        `;
        const prescriptions = this.db.prepare(query).all(parsedDateStr);

        // 각 처방전에 약품 정보 추가
        return prescriptions.map(prescription => ({
            ...prescription,
            medicines: this.getPrescriptionMedicines(prescription.id)
        }));
    }

    /**
     * 환자별 처방전 조회
     * @param {string} patientId - 환자 ID
     * @returns {Array} 처방전 목록
     */
    getPrescriptionsByPatient(patientId) {
        const query = `
            SELECT * FROM prescriptions
            WHERE patientId = ?
            ORDER BY receiptDateRaw DESC, receiptNum DESC
        `;
        return this.db.prepare(query).all(patientId);
    }

    /**
     * 처방전의 약품 목록 조회
     * @param {number} prescriptionId - 처방전 ID
     * @returns {Array} 약품 목록 (약품 상세정보 포함, bohcode 포함)
     */
    getPrescriptionMedicines(prescriptionId) {
        const query = `
            SELECT
                pm.*,
                mb.bohcode,
                m.yakjung_code,
                m.drug_name,
                m.drug_form,
                m.cls_code,
                m.upso_name,
                m.temperature,
                m.unit,
                m.custom_usage,
                m.usage_priority,
                m.autoPrint
            FROM prescription_medicines pm
            LEFT JOIN medicine_bohcodes mb ON pm.medicineCode = mb.bohcode
            LEFT JOIN medicines m ON mb.yakjung_code = m.yakjung_code
            WHERE pm.prescriptionId = ?
        `;
        return this.db.prepare(query).all(prescriptionId);
    }

    // ========== 유틸리티 메서드 ==========

    /**
     * 약품 삭제 (트랜잭션)
     * 약품 삭제 시:
     * 1. 해당 약품과 연결된 모든 bohcode 조회
     * 2. 해당 bohcode를 사용하는 모든 처방전 조회
     * 3. 해당 처방전들 삭제 (prescription_medicines, parsing_history는 CASCADE로 자동 삭제)
     * 4. bohcode 매핑 삭제
     * 5. 약품 정보 삭제
     *
     * @param {string} yakjungCode - 약학정보원 코드
     * @returns {Object} { success: boolean, message?: string, deletedPrescriptionCount?: number }
     */
    deleteMedicine(yakjungCode) {
        try {
            const transaction = this.db.transaction((code) => {
                // 1. 약품 존재 확인
                const medicine = this.statements.getMedicine.get(code);
                if (!medicine) {
                    return { success: false, message: '약품을 찾을 수 없습니다.' };
                }

                // 2. 해당 약품과 연결된 모든 bohcode 조회
                const bohcodes = this.getBohcodesByYakjungCode(code);

                // 3. 해당 bohcode를 사용하는 모든 처방전 ID 조회
                let prescriptionIds = [];
                if (bohcodes.length > 0) {
                    const placeholders = bohcodes.map(() => '?').join(', ');
                    const query = `
                        SELECT DISTINCT prescriptionId
                        FROM prescription_medicines
                        WHERE medicineCode IN (${placeholders})
                    `;
                    const result = this.db.prepare(query).all(...bohcodes);
                    prescriptionIds = result.map(row => row.prescriptionId);
                }

                // 4. 처방전 삭제 (prescription_medicines, parsing_history는 CASCADE로 자동 삭제)
                if (prescriptionIds.length > 0) {
                    const deletePrescriptionStmt = this.db.prepare('DELETE FROM prescriptions WHERE id = ?');
                    for (const id of prescriptionIds) {
                        deletePrescriptionStmt.run(id);
                    }
                }

                // 5. bohcode 매핑 삭제
                const deleteBohcodeStmt = this.db.prepare('DELETE FROM medicine_bohcodes WHERE yakjung_code = ?');
                deleteBohcodeStmt.run(code);

                // 6. 약품 정보 삭제
                const deleteMedicineStmt = this.db.prepare('DELETE FROM medicines WHERE yakjung_code = ?');
                const result = deleteMedicineStmt.run(code);

                if (result.changes > 0) {
                    return {
                        success: true,
                        message: `약품이 삭제되었습니다. (연결된 처방전 ${prescriptionIds.length}개도 함께 삭제됨)`,
                        deletedPrescriptionCount: prescriptionIds.length,
                        deletedBohcodeCount: bohcodes.length
                    };
                } else {
                    return { success: false, message: '약품 삭제에 실패했습니다.' };
                }
            });

            return transaction(yakjungCode);
        } catch (error) {
            logger.error('약품 삭제 오류', {
                category: 'database',
                error: error,
                details: { yakjungCode }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 처방전 삭제 (트랜잭션)
     * prescription_medicines와 parsing_history는 ON DELETE CASCADE로 자동 삭제됨
     * @param {number} prescriptionId - 처방전 ID
     * @returns {Object} { success: boolean, message?: string }
     */
    deletePrescription(prescriptionId) {
        try {
            const transaction = this.db.transaction((id) => {
                // 처방전 존재 확인
                const prescription = this.statements.getPrescriptionById.get(id);
                if (!prescription) {
                    return { success: false, message: '처방전을 찾을 수 없습니다.' };
                }

                // 처방전 삭제 (prescription_medicines와 parsing_history는 ON DELETE CASCADE로 자동 삭제)
                const deleteStmt = this.db.prepare('DELETE FROM prescriptions WHERE id = ?');
                const result = deleteStmt.run(id);

                if (result.changes > 0) {
                    return { success: true, message: '처방전이 삭제되었습니다.' };
                } else {
                    return { success: false, message: '처방전 삭제에 실패했습니다.' };
                }
            });

            return transaction(prescriptionId);
        } catch (error) {
            logger.error('처방전 삭제 오류', {
                category: 'database',
                error: error,
                details: { prescriptionId }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 데이터베이스 통계
     * @returns {Object} { patients, prescriptions, medicines }
     */
    getStats() {
        return {
            patients: this.db.prepare('SELECT COUNT(*) as count FROM patients').get().count,
            prescriptions: this.db.prepare('SELECT COUNT(*) as count FROM prescriptions').get().count,
            medicines: this.db.prepare('SELECT COUNT(*) as count FROM medicines').get().count,
            prescription_medicines: this.db.prepare('SELECT COUNT(*) as count FROM prescription_medicines').get().count
        };
    }

    /**
     * 라이선스 정보 저장
     */
    saveLicense(data) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO license (id, pharmacyName, ownerName, email, licenseKey, isActivated, lastVerifiedAt)
                VALUES (1, @pharmacyName, @ownerName, @email, @licenseKey, @isActivated, @lastVerifiedAt)
            `);

            stmt.run({
                pharmacyName: data.pharmacyName,
                ownerName: data.ownerName,
                email: data.email,
                licenseKey: data.licenseKey,
                isActivated: data.isActivated || 1,
                lastVerifiedAt: data.lastVerifiedAt || this.getKSTTimestamp()
            });

            return true;
        } catch (error) {
            logger.error('라이선스 저장 실패', {
                category: 'database',
                error: error,
                details: {
                    pharmacyName: data.pharmacyName,
                    email: data.email
                }
            });
            return false;
        }
    }

    /**
     * 라이선스 정보 조회
     */
    getLicense() {
        try {
            const stmt = this.db.prepare('SELECT * FROM license WHERE id = 1');
            return stmt.get();
        } catch (error) {
            logger.error('라이선스 조회 실패', {
                category: 'database',
                error: error
            });
            return null;
        }
    }

    /**
     * 마지막 인증 시간 업데이트
     */
    updateLastVerified() {
        try {
            const stmt = this.db.prepare('UPDATE license SET lastVerifiedAt = ? WHERE id = 1');
            stmt.run(this.getKSTTimestamp());
            return true;
        } catch (error) {
            logger.error('마지막 인증 시간 업데이트 실패', {
                category: 'database',
                error: error
            });
            return false;
        }
    }

    /**
     * 앱 설정 저장
     * @param {Object} settings - { atcPath, templatePath, deleteOriginalFile }
     * @returns {boolean} 성공 여부
     */
    saveAppSettings(settings) {
        try {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO app_settings (id, atcPath, templatePath, deleteOriginalFile, updatedAt)
                VALUES (1, @atcPath, @templatePath, @deleteOriginalFile, CURRENT_TIMESTAMP)
            `);

            stmt.run({
                atcPath: settings.atcPath || 'C:\\ATDPS\\Data',
                templatePath: settings.templatePath || null,
                deleteOriginalFile: settings.deleteOriginalFile ? 1 : 0
            });

            return true;
        } catch (error) {
            logger.error('앱 설정 저장 실패', {
                category: 'database',
                error: error,
                details: {
                    atcPath: settings.atcPath,
                    templatePath: settings.templatePath
                }
            });
            return false;
        }
    }

    /**
     * 앱 설정 조회
     * @returns {Object} { id, atcPath, templatePath, deleteOriginalFile, createdAt, updatedAt }
     */
    getAppSettings() {
        try {
            const settings = this.statements.getAppSettings.get();

            // 설정이 없으면 기본값으로 초기화
            if (!settings) {
                const defaultSettings = {
                    atcPath: 'C:\\ATDPS\\Data',
                    templatePath: null,
                    deleteOriginalFile: 0
                };
                this.saveAppSettings(defaultSettings);
                return { ...defaultSettings, id: 1 };
            }

            return settings;
        } catch (error) {
            logger.error('앱 설정 조회 실패', {
                category: 'database',
                error: error
            });
            return {
                id: 1,
                atcPath: 'C:\\ATDPS\\Data',
                templatePath: null,
                deleteOriginalFile: 0
            };
        }
    }

    // ========== 로그 관련 메서드 ==========

    /**
     * 로그 저장
     * @param {string} level - 'info', 'warning', 'error'
     * @param {string} message - 로그 메시지
     * @param {Object} options - { category, details, stack }
     */
    saveLog(level, message, options = {}) {
        const timestamp = new Date().toISOString();
        const { category = null, details = null, stack = null } = options;

        this.statements.insertLog.run({
            timestamp,
            level,
            category,
            message,
            details: details ? JSON.stringify(details) : null,
            stack
        });
    }

    /**
     * 로그 조회 (레벨별)
     * @param {string} level - 'info', 'warning', 'error'
     * @param {number} limit - 조회할 로그 개수 (기본 100)
     * @returns {Array} 로그 목록
     */
    getLogsByLevel(level, limit = 100) {
        return this.statements.getLogsByLevel.all(level, limit).map(log => ({
            ...log,
            details: log.details ? JSON.parse(log.details) : null
        }));
    }

    /**
     * 모든 로그 조회
     * @param {number} limit - 조회할 로그 개수 (기본 100)
     * @returns {Array} 로그 목록
     */
    getAllLogs(limit = 100) {
        return this.statements.getAllLogs.all(limit).map(log => ({
            ...log,
            details: log.details ? JSON.parse(log.details) : null
        }));
    }

    /**
     * 30일 이상 된 로그 삭제
     * @returns {Object} { changes: 삭제된 로그 수 }
     */
    deleteOldLogs() {
        return this.statements.deleteOldLogs.run();
    }

    /**
     * 모든 로그 삭제
     * @returns {Object} { changes: 삭제된 로그 수 }
     */
    deleteAllLogs() {
        return this.statements.deleteAllLogs.run();
    }

    // ==================== 템플릿 관련 메서드 ====================

    /**
     * 모든 템플릿 조회
     * @returns {Array} 템플릿 목록
     */
    getAllTemplates() {
        const stmt = this.db.prepare(`
            SELECT * FROM label_templates ORDER BY isDefault DESC, name ASC
        `);
        return stmt.all();
    }

    /**
     * 템플릿 조회 (ID로)
     * @param {number} id - 템플릿 ID
     * @returns {Object|null} 템플릿 정보
     */
    getTemplateById(id) {
        const stmt = this.db.prepare(`
            SELECT * FROM label_templates WHERE id = ?
        `);
        return stmt.get(id);
    }

    /**
     * 기본 템플릿 조회
     * @returns {Object|null} 기본 템플릿 정보
     */
    getDefaultTemplate() {
        const stmt = this.db.prepare(`
            SELECT * FROM label_templates WHERE isDefault = 1 LIMIT 1
        `);
        return stmt.get();
    }

    /**
     * 템플릿 추가
     * @param {string} name - 템플릿 이름
     * @param {string} filePath - 템플릿 파일 경로
     * @param {string} description - 템플릿 설명
     * @returns {Object} { success: boolean, id?: number, message?: string }
     */
    addTemplate(name, filePath, description = '') {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO label_templates (name, filePath, description)
                VALUES (?, ?, ?)
            `);
            const result = stmt.run(name, filePath, description);
            return { success: true, id: result.lastInsertRowid };
        } catch (error) {
            logger.error('템플릿 추가 실패', {
                category: 'database',
                error: error,
                details: { name, filePath }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 템플릿 수정 (이름, 설명만)
     * @param {number} id - 템플릿 ID
     * @param {Object} data - { name?, description? }
     * @returns {Object} { success: boolean, message?: string }
     */
    updateTemplate(id, data) {
        try {
            const { name, description } = data;
            const stmt = this.db.prepare(`
                UPDATE label_templates
                SET name = COALESCE(?, name),
                    description = COALESCE(?, description),
                    updatedAt = CURRENT_TIMESTAMP
                WHERE id = ?
            `);
            stmt.run(name, description, id);
            return { success: true };
        } catch (error) {
            logger.error('템플릿 수정 실패', {
                category: 'database',
                error: error,
                details: { id, data }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 템플릿 삭제
     * @param {number} id - 템플릿 ID
     * @returns {Object} { success: boolean, message?: string }
     */
    deleteTemplate(id) {
        try {
            // 기본 템플릿은 삭제 불가
            const template = this.getTemplateById(id);
            if (!template) {
                return { success: false, message: '템플릿을 찾을 수 없습니다.' };
            }
            if (template.isDefault === 1) {
                return { success: false, message: '기본 템플릿은 삭제할 수 없습니다.' };
            }

            const stmt = this.db.prepare(`
                DELETE FROM label_templates WHERE id = ?
            `);
            stmt.run(id);

            // ON DELETE CASCADE로 patient_template_preferences와 medicines.templateId는 자동 처리됨
            return { success: true };
        } catch (error) {
            logger.error('템플릿 삭제 실패', {
                category: 'database',
                error: error,
                details: { id }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 기본 템플릿 설정
     * @param {number} id - 템플릿 ID
     * @returns {Object} { success: boolean, message?: string }
     */
    setDefaultTemplate(id) {
        try {
            // 트랜잭션 시작
            const transaction = this.db.transaction(() => {
                // 모든 템플릿의 isDefault를 0으로 설정
                this.db.prepare(`UPDATE label_templates SET isDefault = 0`).run();

                // 선택한 템플릿의 isDefault를 1로 설정
                this.db.prepare(`UPDATE label_templates SET isDefault = 1 WHERE id = ?`).run(id);
            });

            transaction();
            return { success: true };
        } catch (error) {
            logger.error('기본 템플릿 설정 실패', {
                category: 'database',
                error: error,
                details: { id }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 환자별 템플릿 조회
     * @param {string} patientId - 환자 ID
     * @returns {Object|null} 템플릿 정보
     */
    getPatientTemplate(patientId) {
        const stmt = this.db.prepare(`
            SELECT lt.* FROM label_templates lt
            INNER JOIN patient_template_preferences ptp ON lt.id = ptp.templateId
            WHERE ptp.patientId = ?
        `);
        return stmt.get(patientId);
    }

    /**
     * 환자별 템플릿 설정
     * @param {string} patientId - 환자 ID
     * @param {number} templateId - 템플릿 ID
     * @returns {Object} { success: boolean, message?: string }
     */
    setPatientTemplate(patientId, templateId) {
        try {
            const stmt = this.db.prepare(`
                INSERT INTO patient_template_preferences (patientId, templateId)
                VALUES (?, ?)
                ON CONFLICT(patientId) DO UPDATE SET
                    templateId = excluded.templateId,
                    updatedAt = CURRENT_TIMESTAMP
            `);
            stmt.run(patientId, templateId);
            return { success: true };
        } catch (error) {
            logger.error('환자별 템플릿 설정 실패', {
                category: 'database',
                error: error,
                details: { patientId, templateId }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 환자별 템플릿 설정 삭제
     * @param {string} patientId - 환자 ID
     * @returns {Object} { success: boolean, message?: string }
     */
    deletePatientTemplate(patientId) {
        try {
            const stmt = this.db.prepare(`
                DELETE FROM patient_template_preferences WHERE patientId = ?
            `);
            stmt.run(patientId);
            return { success: true };
        } catch (error) {
            logger.error('환자별 템플릿 설정 삭제 실패', {
                category: 'database',
                error: error,
                details: { patientId }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 약품별 템플릿 조회
     * @param {string} medicineCode - 약품 코드 (bohcode)
     * @returns {Object|null} 템플릿 정보
     */
    getMedicineTemplate(medicineCode) {
        const stmt = this.db.prepare(`
            SELECT lt.* FROM label_templates lt
            INNER JOIN medicines m ON lt.id = m.templateId
            INNER JOIN medicine_bohcodes mb ON m.yakjung_code = mb.yakjung_code
            WHERE mb.bohcode = ?
        `);
        return stmt.get(medicineCode);
    }

    /**
     * 약품별 템플릿 설정
     * @param {string} medicineCode - 약품 코드 (bohcode)
     * @param {number|null} templateId - 템플릿 ID (null이면 설정 해제)
     * @returns {Object} { success: boolean, message?: string }
     */
    setMedicineTemplate(medicineCode, templateId) {
        try {
            // bohcode로 yakjung_code 찾기
            const bohcodeStmt = this.db.prepare(`
                SELECT yakjung_code FROM medicine_bohcodes WHERE bohcode = ?
            `);
            const bohcodeResult = bohcodeStmt.get(medicineCode);

            if (!bohcodeResult) {
                return { success: false, message: '약품을 찾을 수 없습니다.' };
            }

            const stmt = this.db.prepare(`
                UPDATE medicines SET templateId = ? WHERE yakjung_code = ?
            `);
            stmt.run(templateId, bohcodeResult.yakjung_code);
            return { success: true };
        } catch (error) {
            logger.error('약품별 템플릿 설정 실패', {
                category: 'database',
                error: error,
                details: { medicineCode, templateId }
            });
            return { success: false, message: error.message };
        }
    }

    /**
     * 출력용 템플릿 조회 (우선순위: 환자 > 약품 > 기본)
     * @param {string} patientId - 환자 ID
     * @param {string} medicineCode - 약품 코드 (bohcode)
     * @returns {Object|null} 템플릿 정보
     */
    getTemplateForPrint(patientId, medicineCode) {
        // 1. 환자별 템플릿 확인
        const patientTemplate = this.getPatientTemplate(patientId);
        if (patientTemplate) {
            return patientTemplate;
        }

        // 2. 약품별 템플릿 확인
        const medicineTemplate = this.getMedicineTemplate(medicineCode);
        if (medicineTemplate) {
            return medicineTemplate;
        }

        // 3. 기본 템플릿 반환
        return this.getDefaultTemplate();
    }

    /**
     * 템플릿 사용 통계 조회
     * @param {number} templateId - 템플릿 ID
     * @returns {Object} { patientCount: number, medicineCount: number }
     */
    getTemplateUsageStats(templateId) {
        const patientStmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM patient_template_preferences WHERE templateId = ?
        `);
        const medicineStmt = this.db.prepare(`
            SELECT COUNT(*) as count FROM medicines WHERE templateId = ?
        `);

        return {
            patientCount: patientStmt.get(templateId).count,
            medicineCount: medicineStmt.get(templateId).count
        };
    }

    /**
     * 데이터베이스 닫기
     */
    close() {
        this.db.close();
    }
}

module.exports = DatabaseManager;
