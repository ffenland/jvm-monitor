/**
 * 날짜 관련 유틸리티 함수
 */

/**
 * KST 기준 현재 날짜를 YYYYMMDD 형식으로 반환
 * @returns {string} YYYYMMDD 형식의 날짜 문자열 (예: "20251001")
 */
function getKSTDateString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * KST 기준 현재 시간을 ISO 문자열로 반환
 * @returns {string} ISO 8601 형식의 시간 문자열 (예: "2025-10-01T02:30:45.123+09:00")
 */
function getKSTISOString() {
    const now = new Date();
    const offset = 9 * 60; // KST는 UTC+9
    const kstTime = new Date(now.getTime() + offset * 60 * 1000);

    // ISO 문자열 생성 (Z를 +09:00으로 변경)
    const isoString = kstTime.toISOString();
    return isoString.replace('Z', '+09:00');
}

/**
 * Date 객체를 KST 기준 YYYYMMDD 형식으로 변환
 * @param {Date} date - 변환할 Date 객체
 * @returns {string} YYYYMMDD 형식의 날짜 문자열
 */
function formatDateToYYYYMMDD(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}${month}${day}`;
}

/**
 * YYYYMMDD 형식의 문자열을 "YYYY년 MM월 DD일" 형식으로 변환
 * @param {string} dateStr - YYYYMMDD 형식의 날짜 문자열
 * @returns {string} "YYYY년 MM월 DD일" 형식의 문자열
 */
function formatYYYYMMDDToKorean(dateStr) {
    if (!dateStr || dateStr.length !== 8) return '';
    const year = dateStr.substring(0, 4);
    const month = dateStr.substring(4, 6);
    const day = dateStr.substring(6, 8);
    return `${year}년 ${month}월 ${day}일`;
}

module.exports = {
    getKSTDateString,
    getKSTISOString,
    formatDateToYYYYMMDD,
    formatYYYYMMDDToKorean
};
