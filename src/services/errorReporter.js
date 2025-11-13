/**
 * Firebase 에러 리포팅 시스템
 *
 * 로컬 DB의 에러 로그를 Firebase로 전송하여
 * 원격에서 사용자의 에러를 모니터링할 수 있도록 합니다.
 */

const { getDb } = require('./firebaseService');
const { collection, addDoc, serverTimestamp } = require('firebase/firestore');
const { app } = require('electron');
const os = require('os');

/**
 * Firebase에 에러 로그 전송
 * @param {Object} log - 로그 객체
 * @param {string} log.level - 로그 레벨 (info, warning, error)
 * @param {string} log.message - 로그 메시지
 * @param {string} log.category - 로그 카테고리
 * @param {Object} log.details - 상세 정보
 * @param {string} log.stack - 스택 트레이스
 * @param {Object} licenseInfo - 라이선스 정보 (약국명, 라이선스 키 등)
 * @returns {Promise<Object>} { success: boolean, error?: string, docId?: string }
 */
async function sendErrorToFirebase(log, licenseInfo = {}) {
    try {
        const db = getDb();

        // 시스템 정보 수집
        const systemInfo = {
            appVersion: app.getVersion(),
            platform: process.platform,
            arch: process.arch,
            osVersion: os.release(),
            nodeVersion: process.versions.node,
            electronVersion: process.versions.electron
        };

        // Firebase에 저장할 문서 생성
        const errorReport = {
            // 로그 정보
            level: log.level,
            message: log.message,
            category: log.category || 'unknown',
            details: log.details ? JSON.stringify(log.details) : null,
            stack: log.stack || null,
            timestamp: log.timestamp || new Date().toISOString(),

            // 약국 정보
            pharmacyName: licenseInfo.pharmacyName || 'Unknown',
            licenseKey: licenseInfo.licenseKey || 'Unknown',

            // 시스템 정보
            systemInfo: systemInfo,

            // 서버 타임스탬프
            reportedAt: serverTimestamp(),

            // 처리 상태
            status: 'new',  // new, investigating, resolved
            priority: log.level === 'error' ? 'high' : 'normal'
        };

        // Firebase Firestore에 저장
        const docRef = await addDoc(collection(db, 'error_reports'), errorReport);

        console.log('[ErrorReporter] Error reported to Firebase:', docRef.id);

        return {
            success: true,
            docId: docRef.id
        };

    } catch (error) {
        console.error('[ErrorReporter] Failed to send error to Firebase:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

/**
 * 여러 로그를 일괄 전송
 * @param {Array} logs - 로그 배열
 * @param {Object} licenseInfo - 라이선스 정보
 * @returns {Promise<Object>} { success: boolean, successCount: number, failCount: number }
 */
async function sendBatchErrorsToFirebase(logs, licenseInfo = {}) {
    try {
        const results = await Promise.allSettled(
            logs.map(log => sendErrorToFirebase(log, licenseInfo))
        );

        const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        const failCount = results.length - successCount;

        console.log(`[ErrorReporter] Batch upload complete: ${successCount} success, ${failCount} failed`);

        return {
            success: true,
            successCount,
            failCount,
            total: results.length
        };

    } catch (error) {
        console.error('[ErrorReporter] Failed to send batch errors:', error);
        return {
            success: false,
            error: error.message,
            successCount: 0,
            failCount: logs.length,
            total: logs.length
        };
    }
}

/**
 * 에러 레벨만 필터링하여 전송
 * @param {Array} logs - 로그 배열
 * @param {Object} licenseInfo - 라이선스 정보
 * @returns {Promise<Object>} 전송 결과
 */
async function sendErrorLogsOnly(logs, licenseInfo = {}) {
    const errorLogs = logs.filter(log => log.level === 'error');

    if (errorLogs.length === 0) {
        return {
            success: true,
            message: 'No error logs to send',
            successCount: 0,
            failCount: 0,
            total: 0
        };
    }

    return sendBatchErrorsToFirebase(errorLogs, licenseInfo);
}

module.exports = {
    sendErrorToFirebase,
    sendBatchErrorsToFirebase,
    sendErrorLogsOnly
};
