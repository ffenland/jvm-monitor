/**
 * 에러 로깅 시스템
 *
 * 프로덕션 환경에서 개발자 도구를 비활성화한 상태에서도
 * 오류를 추적하고 사용자가 개발자에게 리포트할 수 있도록 합니다.
 *
 * 사용법:
 * const logger = require('./src/services/logger');
 *
 * logger.info('약품 정보 조회 시작', { category: 'api', details: { code: '123456789' } });
 * logger.warning('API 응답 지연', { category: 'api', details: { responseTime: 5000 } });
 * logger.error('API 호출 실패', { category: 'api', error: error, details: { url: apiUrl } });
 */

let dbManager = null;

/**
 * DatabaseManager 인스턴스 설정
 * @param {DatabaseManager} db - DatabaseManager 인스턴스
 */
function setDatabaseManager(db) {
    dbManager = db;
}

/**
 * 로그 저장 (내부 함수)
 * @param {string} level - 'info', 'warning', 'error'
 * @param {string} message - 로그 메시지
 * @param {Object} options - { category, error, details }
 */
function log(level, message, options = {}) {
    // DatabaseManager가 설정되지 않은 경우 콘솔에만 출력
    if (!dbManager) {
        console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`, options);
        return;
    }

    const { category = null, error = null, details = null } = options;

    // Error 객체에서 스택 트레이스 추출
    let stack = null;
    if (error instanceof Error) {
        stack = error.stack;
    }

    try {
        dbManager.saveLog(level, message, {
            category,
            details,
            stack
        });
    } catch (err) {
        // DB 저장 실패 시 콘솔에 출력
        console.error('[Logger] Failed to save log to database:', err);
        console[level === 'error' ? 'error' : 'log'](`[${level.toUpperCase()}] ${message}`, options);
    }
}

/**
 * 정보 로그
 * @param {string} message - 로그 메시지
 * @param {Object} options - { category, details }
 *
 * @example
 * logger.info('약품 정보 조회 시작', {
 *     category: 'api',
 *     details: { medicineCode: '123456789' }
 * });
 */
function info(message, options = {}) {
    log('info', message, options);
}

/**
 * 경고 로그
 * @param {string} message - 로그 메시지
 * @param {Object} options - { category, details }
 *
 * @example
 * logger.warning('API 응답 지연', {
 *     category: 'api',
 *     details: { responseTime: 5000, url: 'https://...' }
 * });
 */
function warning(message, options = {}) {
    log('warning', message, options);
}

/**
 * 에러 로그
 * @param {string} message - 로그 메시지
 * @param {Object} options - { category, error, details, sendToFirebase }
 *
 * @example
 * logger.error('API 호출 실패', {
 *     category: 'api',
 *     error: error,  // Error 객체 (스택 트레이스 자동 추출)
 *     details: { url: apiUrl, code: '123456789' },
 *     sendToFirebase: true  // Firebase로 자동 전송 (선택)
 * });
 */
function error(message, options = {}) {
    log('error', message, options);

    // 심각한 에러는 자동으로 Firebase에 전송 (옵션)
    if (options.sendToFirebase) {
        sendToFirebaseAsync(message, options);
    }
}

/**
 * Firebase로 에러 전송 (비동기, 블로킹 없음)
 * @param {string} message - 에러 메시지
 * @param {Object} options - 옵션
 */
async function sendToFirebaseAsync(message, options) {
    try {
        const { sendErrorToFirebase } = require('./errorReporter');
        const { category = null, error = null, details = null } = options;

        const logData = {
            level: 'error',
            message,
            category,
            details,
            stack: error instanceof Error ? error.stack : null,
            timestamp: new Date().toISOString()
        };

        // 라이선스 정보 가져오기
        let licenseInfo = {};
        if (dbManager) {
            try {
                const license = dbManager.getLicense();
                if (license) {
                    licenseInfo = {
                        pharmacyName: license.pharmacyName,
                        licenseKey: license.licenseKey
                    };
                }
            } catch (err) {
                // 라이선스 정보 가져오기 실패해도 에러 전송은 계속
            }
        }

        // Firebase 전송 (비동기, await 없음)
        sendErrorToFirebase(logData, licenseInfo).then(result => {
            if (result.success) {
                console.log('[Logger] Error sent to Firebase:', result.docId);
            } else {
                console.error('[Logger] Failed to send error to Firebase:', result.error);
            }
        }).catch(err => {
            console.error('[Logger] Firebase send error:', err);
        });

    } catch (err) {
        // Firebase 전송 실패해도 앱은 계속 실행
        console.error('[Logger] Failed to send to Firebase:', err);
    }
}

/**
 * 30일 이상 된 로그 자동 정리
 * 앱 시작 시 호출됩니다.
 */
function cleanupOldLogs() {
    if (!dbManager) {
        console.warn('[Logger] DatabaseManager not set, cannot cleanup old logs');
        return;
    }

    try {
        const result = dbManager.deleteOldLogs();
        if (result.changes > 0) {
            console.log(`[Logger] Cleaned up ${result.changes} old log(s)`);
        }
    } catch (err) {
        console.error('[Logger] Failed to cleanup old logs:', err);
    }
}

module.exports = {
    setDatabaseManager,
    info,
    warning,
    error,
    cleanupOldLogs
};
