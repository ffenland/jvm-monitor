/**
 * 환자 정보 창 렌더러
 */

let currentPatientId = null;
let templates = [];
let currentTemplateId = null;

// DOM 요소
const loading = document.getElementById('loading');
const patientContent = document.getElementById('patientContent');
const patientIdElement = document.getElementById('patientId');
const patientNameElement = document.getElementById('patientName');
const templateSelect = document.getElementById('templateSelect');
const saveBtn = document.getElementById('saveBtn');
const closeBtn = document.getElementById('closeBtn');
const deleteBtn = document.getElementById('deleteBtn');
const toast = document.getElementById('toast');

// URL에서 patientId 추출
const urlParams = new URLSearchParams(window.location.search);
currentPatientId = urlParams.get('patientId');

// 초기 로드
document.addEventListener('DOMContentLoaded', async () => {
    if (!currentPatientId) {
        showToast('환자 정보를 찾을 수 없습니다.', 'error');
        setTimeout(() => window.close(), 2000);
        return;
    }

    await loadData();

    // 이벤트 리스너
    saveBtn.addEventListener('click', handleSave);
    closeBtn.addEventListener('click', () => window.close());
    deleteBtn.addEventListener('click', handleDelete);
});

/**
 * 데이터 로드
 */
async function loadData() {
    try {
        loading.classList.add('active');
        patientContent.style.display = 'none';

        // 환자 정보 조회 (DB에서 직접 조회하는 API가 필요)
        // 임시로 patientId만 표시
        patientIdElement.textContent = currentPatientId;
        patientNameElement.textContent = '환자명'; // TODO: DB에서 조회

        // 템플릿 목록 로드
        const templatesResult = await window.electronAPI.getAllTemplates();
        if (templatesResult.success) {
            templates = templatesResult.templates;
            renderTemplateOptions();
        }

        // 환자별 템플릿 설정 조회
        const patientTemplateResult = await window.electronAPI.getPatientTemplate(currentPatientId);
        if (patientTemplateResult.success && patientTemplateResult.template) {
            currentTemplateId = patientTemplateResult.template.id;
            templateSelect.value = currentTemplateId;
            deleteBtn.style.display = 'inline-block';
        }

        patientContent.style.display = 'block';
    } catch (error) {
        console.error('Failed to load data:', error);
        showToast('데이터를 불러올 수 없습니다.', 'error');
    } finally {
        loading.classList.remove('active');
    }
}

/**
 * 템플릿 옵션 렌더링
 */
function renderTemplateOptions() {
    // 기본 옵션 유지
    const defaultOption = templateSelect.querySelector('option[value=""]');

    // 템플릿 옵션 추가
    templates.forEach(template => {
        const option = document.createElement('option');
        option.value = template.id;
        option.textContent = template.name + (template.isDefault ? ' (시스템 기본)' : '');
        templateSelect.appendChild(option);
    });
}

/**
 * 저장 처리
 */
async function handleSave() {
    try {
        const selectedTemplateId = templateSelect.value;

        if (!selectedTemplateId) {
            // 템플릿 설정 삭제
            if (currentTemplateId) {
                const result = await window.electronAPI.deletePatientTemplate(currentPatientId);
                if (result.success) {
                    showToast('템플릿 설정이 삭제되었습니다.', 'success');
                    currentTemplateId = null;
                    deleteBtn.style.display = 'none';
                } else {
                    showToast(result.message || '삭제에 실패했습니다.', 'error');
                }
            } else {
                showToast('변경사항이 없습니다.', 'info');
            }
            return;
        }

        // 템플릿 설정 저장
        const result = await window.electronAPI.setPatientTemplate(currentPatientId, parseInt(selectedTemplateId));

        if (result.success) {
            showToast('템플릿이 설정되었습니다.', 'success');
            currentTemplateId = parseInt(selectedTemplateId);
            deleteBtn.style.display = 'inline-block';
        } else {
            showToast(result.message || '저장에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('Failed to save:', error);
        showToast('저장에 실패했습니다.', 'error');
    }
}

/**
 * 템플릿 설정 삭제 처리
 */
async function handleDelete() {
    if (!confirm('이 환자의 템플릿 설정을 삭제하시겠습니까?')) {
        return;
    }

    try {
        const result = await window.electronAPI.deletePatientTemplate(currentPatientId);

        if (result.success) {
            showToast('템플릿 설정이 삭제되었습니다.', 'success');
            currentTemplateId = null;
            templateSelect.value = '';
            deleteBtn.style.display = 'none';
        } else {
            showToast(result.message || '삭제에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('Failed to delete:', error);
        showToast('삭제에 실패했습니다.', 'error');
    }
}

/**
 * 토스트 메시지 표시
 */
function showToast(message, type = 'info') {
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
