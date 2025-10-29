/**
 * 데이터베이스 암호화 키 관리 모듈
 *
 * 고정 암호구문을 사용하여 데이터베이스 암호화 키를 생성합니다.
 * 이 방식은 PC 간 데이터 이전을 간단하게 만들며,
 * 일반 SQLite 뷰어로는 데이터베이스를 열 수 없게 보호합니다.
 */

const crypto = require('crypto');

// 고정 암호구문
// "이걸 알 정도면 당신은 저를 도와줄 수 있습니다. 연락 주세요!"
const SECRET_PHRASE = 'IfYouKnowThisPleaseContactMeToHelp!';

/**
 * 데이터베이스 암호화 키를 반환합니다.
 *
 * @returns {string} 64자 hex 형식의 암호화 키
 */
function getEncryptionKey() {
    // SHA-256으로 해시하여 64자 hex 키 생성
    return crypto.createHash('sha256')
        .update(SECRET_PHRASE)
        .digest('hex');
}

module.exports = {
    getEncryptionKey
};
