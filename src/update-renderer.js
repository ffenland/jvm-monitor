/**
 * 업데이트 화면 렌더러
 */

// DOM 로드 완료 시 실행
document.addEventListener('DOMContentLoaded', async () => {
    console.log('[UpdateRenderer] Loading update info...');

    try {
        // 버전 정보 요청
        const versionInfo = await window.electronAPI.getUpdateInfo();
        console.log('[UpdateRenderer] Version info:', versionInfo);

        if (versionInfo) {
            // 버전 표시
            document.getElementById('currentVersion').textContent = versionInfo.currentVersion || '-';
            document.getElementById('minVersion').textContent = versionInfo.minRequiredVersion || '-';
            document.getElementById('latestVersion').textContent = versionInfo.latestVersion || versionInfo.minRequiredVersion || '-';

            // 메시지 표시
            if (versionInfo.updateMessage) {
                document.getElementById('updateMessage').textContent = versionInfo.updateMessage;
            }

            // 주요 기능 표시
            if (versionInfo.features && versionInfo.features.length > 0) {
                const featuresBox = document.getElementById('featuresBox');
                const featuresList = document.getElementById('featuresList');

                versionInfo.features.forEach(feature => {
                    const li = document.createElement('li');
                    li.textContent = feature;
                    featuresList.appendChild(li);
                });

                featuresBox.style.display = 'block';
            }
        }
    } catch (error) {
        console.error('[UpdateRenderer] Failed to load version info:', error);
    }

    // 다운로드 버튼 클릭
    document.getElementById('downloadBtn').addEventListener('click', async () => {
        console.log('[UpdateRenderer] Download button clicked');
        const btn = document.getElementById('downloadBtn');
        const originalText = btn.textContent;

        try {
            btn.disabled = true;
            btn.innerHTML = '<span class="loading"></span> 페이지 열기 중...';

            await window.electronAPI.openDownloadPage();

            btn.textContent = '다운로드 페이지가 열렸습니다';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        } catch (error) {
            console.error('[UpdateRenderer] Failed to open download page:', error);
            btn.textContent = '페이지 열기 실패';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.disabled = false;
            }, 2000);
        }
    });

    // 종료 버튼 클릭
    document.getElementById('quitBtn').addEventListener('click', () => {
        console.log('[UpdateRenderer] Quit button clicked');
        window.electronAPI.quitApp();
    });
});
