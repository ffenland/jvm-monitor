const { doc, getDoc } = require('firebase/firestore');
const bcrypt = require('bcryptjs');
const { getDb } = require('./firebaseService');

/**
 * 라이선스 인증 서비스
 */

const OFFLINE_DAYS = 5; // 오프라인 허용 기간 (일)

/**
 * Firestore에서 라이선스 검증
 * @param {string} pharmacyName - 약국명
 * @param {string} ownerName - 약국장명
 * @param {string} email - 이메일
 * @param {string} licenseKey - 6자리 인증키
 * @returns {Promise<Object>} { success: boolean, message: string, data?: Object }
 */
async function verifyLicense(pharmacyName, ownerName, email, licenseKey) {
    try {
        const db = getDb();
        const docRef = doc(db, 'licenses', email);
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) {
            return {
                success: false,
                message: '등록되지 않은 이메일입니다.'
            };
        }

        const licenseData = docSnap.data();

        // 약국명 확인
        if (licenseData.pharmacyName !== pharmacyName) {
            return {
                success: false,
                message: '약국명이 일치하지 않습니다.'
            };
        }

        // 약국장명 확인
        if (licenseData.ownerName !== ownerName) {
            return {
                success: false,
                message: '약국장명이 일치하지 않습니다.'
            };
        }

        // 활성화 여부 확인
        if (!licenseData.isActive) {
            return {
                success: false,
                message: '비활성화된 라이선스입니다.'
            };
        }

        // 인증키 검증
        const isValid = await bcrypt.compare(licenseKey, licenseData.licenseKeyHash);

        if (!isValid) {
            return {
                success: false,
                message: '인증키가 일치하지 않습니다.'
            };
        }

        return {
            success: true,
            message: '인증 성공',
            data: {
                pharmacyName: licenseData.pharmacyName,
                ownerName: licenseData.ownerName,
                email: email,
                licenseKey: licenseKey
            }
        };
    } catch (error) {
        console.error('[AuthService] 인증 실패:', error);
        return {
            success: false,
            message: '인증 중 오류가 발생했습니다: ' + error.message
        };
    }
}

/**
 * 로컬 DB에 라이선스 저장
 * @param {Object} db - DatabaseManager 인스턴스
 * @param {Object} data - 라이선스 데이터
 * @returns {boolean} 성공 여부
 */
function saveLicenseToLocal(db, data) {
    try {
        return db.saveLicense({
            pharmacyName: data.pharmacyName,
            ownerName: data.ownerName,
            email: data.email,
            licenseKey: data.licenseKey,
            isActivated: 1,
            lastVerifiedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('[AuthService] 로컬 저장 실패:', error);
        return false;
    }
}

/**
 * 로컬 DB에서 라이선스 조회
 * @param {Object} db - DatabaseManager 인스턴스
 * @returns {Object|null} 라이선스 데이터
 */
function getLocalLicense(db) {
    try {
        return db.getLicense();
    } catch (error) {
        console.error('[AuthService] 로컬 조회 실패:', error);
        return null;
    }
}

/**
 * 프로그램 시작 시 라이선스 체크
 * @param {Object} db - DatabaseManager 인스턴스
 * @returns {Promise<Object>} { needsAuth: boolean, license?: Object, message: string }
 */
async function checkLicenseOnStartup(db) {
    try {
        const license = getLocalLicense(db);

        // 라이선스가 없으면 인증 필요
        if (!license) {
            return {
                needsAuth: true,
                message: '라이선스가 등록되지 않았습니다.'
            };
        }

        // 마지막 인증 시간 확인
        const lastVerified = new Date(license.lastVerifiedAt);
        const now = new Date();
        const daysSinceVerified = (now - lastVerified) / (1000 * 60 * 60 * 24);

        // 5일 이내면 오프라인 허용
        if (daysSinceVerified <= OFFLINE_DAYS) {
            return {
                needsAuth: false,
                license: license,
                message: '로컬 인증 성공'
            };
        }

        // 5일 초과 - Firestore 재인증 시도
        console.log('[AuthService] 5일 초과, Firestore 재인증 시도...');
        const result = await verifyLicense(
            license.pharmacyName,
            license.ownerName,
            license.email,
            license.licenseKey
        );

        if (result.success) {
            // 재인증 성공 - lastVerifiedAt 업데이트
            db.updateLastVerified();
            return {
                needsAuth: false,
                license: license,
                message: 'Firestore 재인증 성공'
            };
        } else {
            // 재인증 실패 - 인증 필요
            return {
                needsAuth: true,
                message: '재인증이 필요합니다: ' + result.message
            };
        }
    } catch (error) {
        console.error('[AuthService] 시작 시 인증 체크 실패:', error);

        // 네트워크 오류인 경우 로컬 라이선스 사용
        const license = getLocalLicense(db);
        if (license) {
            const lastVerified = new Date(license.lastVerifiedAt);
            const now = new Date();
            const daysSinceVerified = (now - lastVerified) / (1000 * 60 * 60 * 24);

            if (daysSinceVerified <= OFFLINE_DAYS) {
                return {
                    needsAuth: false,
                    license: license,
                    message: '네트워크 오류, 로컬 인증 사용'
                };
            }
        }

        return {
            needsAuth: true,
            message: '인증 체크 중 오류 발생'
        };
    }
}

module.exports = {
    verifyLicense,
    saveLicenseToLocal,
    getLocalLicense,
    checkLicenseOnStartup
};
