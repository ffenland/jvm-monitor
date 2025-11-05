const fs = require('fs');
const path = require('path');

/**
 * 난독화 전 원본 파일 복구 스크립트
 */

const backupDir = path.join(__dirname, 'originFiles', 'js-backup');

function restoreFiles(dir) {
    if (!fs.existsSync(dir)) {
        console.log('❌ 백업 폴더가 없습니다:', dir);
        return;
    }

    let restoredCount = 0;

    function scanDir(currentDir) {
        const items = fs.readdirSync(currentDir);

        for (const item of items) {
            const fullPath = path.join(currentDir, item);
            const stat = fs.statSync(fullPath);

            if (stat.isDirectory()) {
                scanDir(fullPath);
            } else if (item.endsWith('.js')) {
                // 원본 경로 계산
                const relativePath = path.relative(backupDir, fullPath);
                const targetPath = path.join(__dirname, relativePath);

                // 원본 파일 복원
                fs.copyFileSync(fullPath, targetPath);
                console.log(`✅ Restored: ${relativePath}`);
                restoredCount++;
            }
        }
    }

    console.log('🔄 Restoring original files from backup...\n');
    scanDir(backupDir);

    console.log('\n' + '═'.repeat(60));
    console.log('📊 Restore Summary:');
    console.log(`   ✅ Restored: ${restoredCount} files`);
    console.log('═'.repeat(60));
    console.log('\n✨ Original files restored successfully!');
}

restoreFiles(backupDir);
