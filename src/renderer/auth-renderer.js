/**
 * 인증 화면 렌더러 프로세스
 */

const form = document.getElementById('authForm');
const messageDiv = document.getElementById('message');
const verifyBtn = document.getElementById('verifyBtn');
const btnText = document.getElementById('btnText');

const pharmacyNameInput = document.getElementById('pharmacyName');
const ownerNameInput = document.getElementById('ownerName');
const emailInput = document.getElementById('email');
const licenseKeyInput = document.getElementById('licenseKey');
const exitBtn = document.getElementById('exitBtn');

// 인증키 입력 시 숫자만 허용
licenseKeyInput.addEventListener('input', (e) => {
    e.target.value = e.target.value.replace(/[^0-9]/g, '');
});

// 폼 제출
form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const pharmacyName = pharmacyNameInput.value.trim();
    const ownerName = ownerNameInput.value.trim();
    const email = emailInput.value.trim();
    const licenseKey = licenseKeyInput.value.trim();

    // 유효성 검사
    if (!pharmacyName || !ownerName || !email || !licenseKey) {
        showMessage('error', '모든 필드를 입력해주세요.');
        return;
    }

    if (licenseKey.length !== 6) {
        showMessage('error', '인증키는 6자리 숫자여야 합니다.');
        return;
    }

    if (!isValidEmail(email)) {
        showMessage('error', '올바른 이메일 형식이 아닙니다.');
        return;
    }

    // 인증 시도
    verifyBtn.disabled = true;
    showLoading();

    try {
        const result = await window.authAPI.verifyLicense({
            pharmacyName,
            ownerName,
            email,
            licenseKey
        });

        if (result.success) {
            showMessage('success', '✅ 인증 성공! 프로그램을 시작합니다...');

            // 1초 후 메인 창으로 전환
            setTimeout(() => {
                window.authAPI.authSuccess();
            }, 1000);
        } else {
            showMessage('error', '❌ ' + result.message);
            verifyBtn.disabled = false;
            resetButton();
        }
    } catch (error) {
        console.error('인증 오류:', error);
        showMessage('error', '❌ 인증 중 오류가 발생했습니다: ' + error.message);
        verifyBtn.disabled = false;
        resetButton();
    }
});

/**
 * 메시지 표시
 */
function showMessage(type, text) {
    messageDiv.className = 'message ' + type;
    messageDiv.textContent = text;
    messageDiv.style.display = 'block';
}

/**
 * 로딩 상태 표시
 */
function showLoading() {
    btnText.innerHTML = '<span class="loading-spinner"></span>인증 중...';
}

/**
 * 버튼 상태 초기화
 */
function resetButton() {
    btnText.textContent = '인증하기';
}

/**
 * 이메일 유효성 검사
 */
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// 프로그램 종료 버튼 이벤트
exitBtn.addEventListener('click', () => {
    if (window.authAPI && window.authAPI.closeApp) {
        window.authAPI.closeApp();
    }
});
