/**
 * 버전 체크 서비스
 * Firestore에서 최소 요구 버전을 가져와서 현재 앱 버전과 비교
 */

const semver = require('semver');
const { app } = require('electron');
const { doc, getDoc } = require('firebase/firestore');
const { getDb } = require('./firebaseService');

/**
 * 현재 앱 버전 가져오기
 * @returns {string} 현재 버전 (예: "1.0.0")
 */
function getCurrentVersion() {
    return app.getVersion();
}

/**
 * Firestore에서 버전 정보 조회
 * @returns {Promise<Object|null>} 버전 정보
 */
async function getVersionConfig() {
    try {
        const db = getDb();
        const docRef = doc(db, 'app_settings', 'version_control');
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            console.log('[VersionService] Version config not found in Firestore');
            return null;
        }

        const data = docSnap.data();
        console.log('[VersionService] Version config from Firestore:', data);
        return data;
    } catch (error) {
        console.error('[VersionService] Failed to fetch version config:', error);
        throw error;
    }
}

/**
 * 버전 비교 및 업데이트 필요 여부 확인
 * @param {string} currentVersion - 현재 버전
 * @param {string} minRequiredVersion - 최소 요구 버전
 * @returns {boolean} 업데이트 필요 여부
 */
function isUpdateRequired(currentVersion, minRequiredVersion) {
    try {
        // semver.lt: currentVersion < minRequiredVersion
        const needsUpdate = semver.lt(currentVersion, minRequiredVersion);
        console.log(`[VersionService] Version check: current=${currentVersion}, required=${minRequiredVersion}, needsUpdate=${needsUpdate}`);
        return needsUpdate;
    } catch (error) {
        console.error('[VersionService] Version comparison error:', error);
        // 비교 실패 시 안전하게 업데이트 불필요로 처리
        return false;
    }
}

/**
 * 버전 체크 및 결과 반환
 * @returns {Promise<Object>} { needsUpdate: boolean, versionInfo?: Object, currentVersion: string }
 */
async function checkVersion() {
    try {
        const currentVersion = getCurrentVersion();
        console.log(`[VersionService] Current app version: ${currentVersion}`);

        // Firebase에서 버전 설정 가져오기
        const versionConfig = await getVersionConfig();

        if (!versionConfig) {
            console.log('[VersionService] No version config found, allowing app to run');
            return {
                needsUpdate: false,
                currentVersion: currentVersion,
                message: '버전 정보를 확인할 수 없습니다.'
            };
        }

        // forceUpdate가 false면 버전 체크 건너뛰기
        if (versionConfig.forceUpdate === false) {
            console.log('[VersionService] Force update disabled, allowing app to run');
            return {
                needsUpdate: false,
                currentVersion: currentVersion,
                versionInfo: versionConfig,
                message: '강제 업데이트가 비활성화되어 있습니다.'
            };
        }

        // 버전 비교
        const needsUpdate = isUpdateRequired(currentVersion, versionConfig.minRequiredVersion);

        if (needsUpdate) {
            console.log('[VersionService] Update required!');
            return {
                needsUpdate: true,
                currentVersion: currentVersion,
                versionInfo: versionConfig,
                message: `업데이트가 필요합니다. (현재: ${currentVersion}, 최소 요구: ${versionConfig.minRequiredVersion})`
            };
        } else {
            console.log('[VersionService] Version is up to date');
            return {
                needsUpdate: false,
                currentVersion: currentVersion,
                versionInfo: versionConfig,
                message: '최신 버전입니다.'
            };
        }
    } catch (error) {
        console.error('[VersionService] Version check failed:', error);
        // 네트워크 오류 등의 경우 앱 사용 허용 (업데이트 체크 실패는 치명적이지 않음)
        return {
            needsUpdate: false,
            currentVersion: getCurrentVersion(),
            message: '버전 체크 중 오류가 발생했습니다.',
            error: error.message
        };
    }
}

module.exports = {
    getCurrentVersion,
    getVersionConfig,
    isUpdateRequired,
    checkVersion
};
