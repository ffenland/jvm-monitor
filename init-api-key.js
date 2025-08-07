/**
 * API 키 초기화 스크립트
 * 건강보험심사평가원 API 키를 암호화하여 저장합니다.
 * 
 * 사용법: node init-api-key.js
 */

const path = require('path');
const os = require('os');

// Electron app 모듈이 없을 때를 위한 대체 경로
const appDataPath = process.env.APPDATA || 
    (process.platform === 'darwin' ? path.join(os.homedir(), 'Library/Application Support') : 
    path.join(os.homedir(), '.config'));

const configPath = path.join(appDataPath, 'electron-file-monitor');

// simpleSecureConfig의 로직을 직접 구현 (app 모듈 없이)
const crypto = require('crypto');
const fs = require('fs');

class InitSecureConfig {
    constructor() {
        // 설정 디렉토리 생성
        if (!fs.existsSync(configPath)) {
            fs.mkdirSync(configPath, { recursive: true });
        }
        
        this.configPath = path.join(configPath, 'api-config.enc');
        this.key = crypto.scryptSync('electron-file-monitor-secret-2025', 'unique-salt', 32);
    }

    setApiKey(apiKey) {
        try {
            const iv = crypto.randomBytes(16);
            const cipher = crypto.createCipheriv('aes-256-cbc', this.key, iv);
            const encrypted = Buffer.concat([
                cipher.update(apiKey, 'utf8'),
                cipher.final()
            ]);

            const data = {
                iv: iv.toString('hex'),
                data: encrypted.toString('hex')
            };

            fs.writeFileSync(this.configPath, JSON.stringify(data), 'utf8');
            return true;
        } catch (error) {
            console.error('Error saving API key:', error);
            return false;
        }
    }

    hasApiKey() {
        return fs.existsSync(this.configPath);
    }
}

// 실행
const config = new InitSecureConfig();
const API_KEY = 'CO+6SC4kgIs5atXW/ZDETfMu9T87tscntUhZ6cliQKjRsZM4xmiyOEfWFznoUwHkLKteqdM1e4ZpkZEopwBEMg==';

if (config.hasApiKey()) {
    console.log('✅ API 키가 이미 저장되어 있습니다.');
    console.log(`📁 위치: ${config.configPath}`);
} else {
    if (config.setApiKey(API_KEY)) {
        console.log('✅ API 키가 성공적으로 저장되었습니다!');
        console.log(`📁 위치: ${config.configPath}`);
    } else {
        console.log('❌ API 키 저장에 실패했습니다.');
    }
}