const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

exports.default = async function(context) {
    console.log('AfterPack: Setting icon and metadata for executable...');
    
    const { appOutDir, packager } = context;
    const productName = packager.appInfo.productName;
    const version = packager.appInfo.version;
    const exePath = path.join(appOutDir, `${productName}.exe`);
    const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
    const rceditPath = path.join(__dirname, '..', 'node_modules', 'rcedit', 'bin', 'rcedit-x64.exe');
    
    // 템플릿 파일을 resources 폴더로 복사
    const templatesSource = path.join(__dirname, '..', 'templates');
    const templatesTarget = path.join(appOutDir, 'resources', 'templates');
    
    console.log('Copying templates from:', templatesSource);
    console.log('Copying templates to:', templatesTarget);
    
    // resources/templates 폴더 생성
    if (!fs.existsSync(templatesTarget)) {
        fs.mkdirSync(templatesTarget, { recursive: true });
    }
    
    // 템플릿 파일 복사
    if (fs.existsSync(templatesSource)) {
        const files = fs.readdirSync(templatesSource);
        files.forEach(file => {
            if (file.endsWith('.lbx')) {
                const sourceFile = path.join(templatesSource, file);
                const targetFile = path.join(templatesTarget, file);
                fs.copyFileSync(sourceFile, targetFile);
                console.log(`Copied template: ${file}`);
            }
        });
        console.log('Templates copied successfully!');
    } else {
        console.warn('Templates folder not found:', templatesSource);
    }
    
    console.log(`Executable path: ${exePath}`);
    console.log(`Icon path: ${iconPath}`);
    console.log(`Rcedit path: ${rceditPath}`);
    console.log(`Product Name: ${productName}`);
    console.log(`Version: ${version}`);
    
    try {
        // rcedit를 사용하여 아이콘 및 메타데이터 설정
        const commands = [
            `"${rceditPath}" "${exePath}" --set-icon "${iconPath}"`,
            `"${rceditPath}" "${exePath}" --set-version-string "ProductName" "${productName}"`,
            `"${rceditPath}" "${exePath}" --set-version-string "FileDescription" "PM프로그램과 연동된 약품 라벨 출력 시스템"`,
            `"${rceditPath}" "${exePath}" --set-version-string "CompanyName" "CleaReach System"`,
            `"${rceditPath}" "${exePath}" --set-version-string "LegalCopyright" "Copyright © 2024 CleaReach System"`,
            `"${rceditPath}" "${exePath}" --set-version-string "FileVersion" "${version}"`,
            `"${rceditPath}" "${exePath}" --set-version-string "ProductVersion" "${version}"`,
            `"${rceditPath}" "${exePath}" --set-file-version "${version}.0"`
        ];
        
        for (const command of commands) {
            console.log(`Running: ${command}`);
            execSync(command, { stdio: 'inherit' });
        }
        
        console.log('Icon and metadata set successfully!');
    } catch (error) {
        console.error('Failed to set icon or metadata:', error.message);
    }
};