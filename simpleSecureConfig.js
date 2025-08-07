const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

class SimpleSecureConfig {
    constructor() {
        // 설정 파일 경로
        let userDataPath;
        try {
            const { app } = require('electron');
            userDataPath = app.getPath('userData');
        } catch (e) {
            // Electron 환경이 아닌 경우 (테스트 등)
            userDataPath = path.join(require('os').homedir(), '.electron-file-monitor');
            if (!fs.existsSync(userDataPath)) {
                fs.mkdirSync(userDataPath, { recursive: true });
            }
        }
        this.configPath = path.join(userDataPath, 'api-config.enc');
        
        // 암호화 키 생성 (앱별로 고유하게 설정)
        // 실제 프로덕션에서는 더 복잡한 secret 사용 권장
        this.key = crypto.scryptSync('electron-file-monitor-secret-2025', 'unique-salt', 32);
    }

    /**
     * API 키 저장
     * @param {string} apiKey - 저장할 API 키
     * @returns {boolean} 성공 여부
     */
    setApiKey(apiKey) {
        try {
            if (!apiKey) {
                throw new Error('API key is required');
            }

            // 초기화 벡터 생성
            const iv = crypto.randomBytes(16);
            
            // 암호화
            const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
            const encrypted = Buffer.concat([
                cipher.update(apiKey, 'utf8'),
                cipher.final()
            ]);

            // 저장할 데이터
            const data = {
                iv: iv.toString('hex'),
                data: encrypted.toString('hex')
            };

            // 파일로 저장
            fs.writeFileSync(this.configPath, JSON.stringify(data), 'utf8');
            return true;
        } catch (error) {
            console.error('Error saving API key:', error);
            return false;
        }
    }

    /**
     * API 키 가져오기
     * @returns {string|null} 복호화된 API 키 또는 null
     */
    getApiKey() {
        try {
            // 파일이 없으면 null 반환
            if (!fs.existsSync(this.configPath)) {
                return null;
            }

            // 파일 읽기
            const fileContent = fs.readFileSync(this.configPath, 'utf8');
            const { iv, data } = JSON.parse(fileContent);

            // 복호화
            const decipher = crypto.createDecipheriv(
                'aes-256-cbc', 
                this.key, 
                Buffer.from(iv, 'hex')
            );
            
            const decrypted = Buffer.concat([
                decipher.update(Buffer.from(data, 'hex')),
                decipher.final()
            ]);

            return decrypted.toString('utf8');
        } catch (error) {
            console.error('Error getting API key:', error);
            return null;
        }
    }

    /**
     * API 키 삭제
     * @returns {boolean} 성공 여부
     */
    deleteApiKey() {
        try {
            if (fs.existsSync(this.configPath)) {
                fs.unlinkSync(this.configPath);
            }
            return true;
        } catch (error) {
            console.error('Error deleting API key:', error);
            return false;
        }
    }

    /**
     * API 키 존재 여부 확인
     * @returns {boolean} 존재 여부
     */
    hasApiKey() {
        try {
            if (!fs.existsSync(this.configPath)) {
                return false;
            }
            
            // 실제로 복호화 가능한지 확인
            const apiKey = this.getApiKey();
            return apiKey !== null && apiKey !== '';
        } catch (error) {
            return false;
        }
    }
}

// 싱글톤 인스턴스
let instance = null;

/**
 * SimpleSecureConfig 인스턴스 가져오기
 * @returns {SimpleSecureConfig} 싱글톤 인스턴스
 */
function getInstance() {
    if (!instance) {
        instance = new SimpleSecureConfig();
    }
    return instance;
}

module.exports = getInstance();