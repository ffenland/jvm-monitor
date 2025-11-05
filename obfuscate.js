const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

/**
 * JavaScript Obfuscator 스크립트
 *
 * 핵심 소스 파일들을 난독화합니다.
 * 원본 .js 파일은 백업하고, 난독화된 코드로 대체합니다.
 */

// 난독화할 파일 목록
const filesToObfuscate = [
    // 핵심 비즈니스 로직
    'src/services/database.js',
    'src/services/medicine-fetcher.js',
    'src/services/parser.js',
    'src/services/dataProcessor.js',
    'src/services/authService.js',
    'src/services/versionService.js',
    'src/services/print_brother.js',

    // 암호화 키 및 보안
    'src/utils/encryptionKey.js',

    // API 및 데이터 처리
    'scripts/medicine-api.js',
    'scripts/extract-temperature.js',
    'scripts/drug-form-unit-map.js',

    // IPC 핸들러
    'src/main/ipc-handlers/index.js',
    'src/main/ipc-handlers/medicineHandlers.js',
    'src/main/ipc-handlers/printHandlers.js',
    'src/main/ipc-handlers/prescriptionHandlers.js',

    // 인증 관련
    'src/ipc/authHandlers.js',
    'src/ipc/updateHandlers.js'
];

// 백업 디렉토리
const backupDir = path.join(__dirname, 'originFiles', 'js-backup');

// 난독화 옵션
const obfuscatorOptions = {
    // 기본 설정
    compact: true,                           // 공백 제거
    simplify: true,                          // 코드 간소화

    // 변수명 난독화
    identifierNamesGenerator: 'hexadecimal', // 변수명을 16진수로
    renameGlobals: false,                    // 전역 변수는 유지 (require, module 등)

    // 문자열 난독화
    stringArray: true,                       // 문자열을 배열로 분산
    stringArrayEncoding: ['base64'],         // Base64 인코딩
    stringArrayThreshold: 0.75,              // 75% 문자열 난독화
    rotateStringArray: true,                 // 문자열 배열 회전

    // 제어 흐름 난독화 (성능 고려하여 약하게)
    controlFlowFlattening: true,             // 제어 흐름 평탄화
    controlFlowFlatteningThreshold: 0.5,     // 50%만 적용 (성능 고려)

    // Dead Code Injection (성능 고려하여 약하게)
    deadCodeInjection: true,                 // 가짜 코드 삽입
    deadCodeInjectionThreshold: 0.2,         // 20%만 적용 (성능 고려)

    // 보안 설정 (프로덕션 환경)
    selfDefending: false,                    // 코드 자체 방어 (디버깅 어려워짐, false 권장)
    debugProtection: false,                  // 디버그 방지 (false 권장)
    disableConsoleOutput: false,             // console.log 유지

    // 환경 설정
    target: 'node',                          // Node.js 환경
    sourceMap: false,                        // 소스맵 생성 안 함
};

/**
 * 디렉토리가 없으면 생성
 */
function ensureDir(dirPath) {
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
    }
}

/**
 * 파일을 난독화하고 원본을 백업
 */
function obfuscateFile(filePath) {
    const fullPath = path.join(__dirname, filePath);

    // 파일 존재 확인
    if (!fs.existsSync(fullPath)) {
        console.log(`⚠️  Skip: ${filePath} (파일 없음)`);
        return false;
    }

    try {
        console.log(`🔒 Obfuscating: ${filePath}`);

        // 원본 코드 읽기
        const code = fs.readFileSync(fullPath, 'utf8');

        // 백업 경로
        const relativePath = path.relative(__dirname, fullPath);
        const backupPath = path.join(backupDir, relativePath);
        const backupDirPath = path.dirname(backupPath);

        // 백업 디렉토리 생성
        ensureDir(backupDirPath);

        // 원본 파일 백업
        fs.copyFileSync(fullPath, backupPath);
        console.log(`   📦 Backup: ${path.relative(__dirname, backupPath)}`);

        // 난독화
        const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscatorOptions);

        // 난독화된 코드로 덮어쓰기
        fs.writeFileSync(fullPath, obfuscated.getObfuscatedCode(), 'utf8');
        console.log(`   ✅ Obfuscated: ${filePath}`);

        return true;
    } catch (error) {
        console.error(`   ❌ Error obfuscating ${filePath}:`, error.message);
        return false;
    }
}

/**
 * 메인 난독화 프로세스
 */
function main() {
    console.log('🔒 Starting JavaScript Obfuscation...\n');

    // 백업 디렉토리 생성
    ensureDir(backupDir);

    let successCount = 0;
    let failCount = 0;
    let skipCount = 0;

    // 각 파일 난독화
    for (const filePath of filesToObfuscate) {
        const result = obfuscateFile(filePath);
        if (result === true) {
            successCount++;
        } else if (result === false) {
            const fullPath = path.join(__dirname, filePath);
            if (!fs.existsSync(fullPath)) {
                skipCount++;
            } else {
                failCount++;
            }
        }
        console.log(''); // 빈 줄 추가
    }

    // 결과 요약
    console.log('═'.repeat(60));
    console.log('📊 Obfuscation Summary:');
    console.log(`   ✅ Success: ${successCount} files`);
    console.log(`   ❌ Failed: ${failCount} files`);
    console.log(`   ⚠️  Skipped: ${skipCount} files`);
    console.log(`   📦 Backup location: ${path.relative(__dirname, backupDir)}`);
    console.log('═'.repeat(60));

    if (failCount > 0) {
        console.log('\n⚠️  Some files failed to obfuscate. Check the errors above.');
        process.exit(1);
    } else {
        console.log('\n🎉 All files obfuscated successfully!');
        console.log('💡 원본 복구: node restore.js');
        console.log('💡 빌드: pnpm run dist');
    }
}

// 실행
main();
