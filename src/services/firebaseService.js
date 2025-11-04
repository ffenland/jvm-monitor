const { initializeApp } = require('firebase/app');
const { getFirestore } = require('firebase/firestore');
const firebaseConfig = require('../config/firebase-config');

/**
 * Firebase 초기화 및 Firestore 인스턴스 제공
 */

let app = null;
let db = null;

/**
 * Firebase 초기화
 * @returns {Object} Firestore 인스턴스
 */
function initializeFirebase() {
    if (!db) {
        try {
            app = initializeApp(firebaseConfig);
            db = getFirestore(app);
        } catch (error) {
            throw error;
        }
    }
    return db;
}

/**
 * Firestore 인스턴스 가져오기
 * @returns {Object} Firestore 인스턴스
 */
function getDb() {
    if (!db) {
        return initializeFirebase();
    }
    return db;
}

module.exports = {
    initializeFirebase,
    getDb
};
