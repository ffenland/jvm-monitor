/**
 * 템플릿 관리 창 렌더러
 */

let templates = [];
let editingTemplateId = null;

// DOM 요소
const templateList = document.getElementById('templateList');
const loading = document.getElementById('loading');
const addTemplateBtn = document.getElementById('addTemplateBtn');
const templateModal = document.getElementById('templateModal');
const templateForm = document.getElementById('templateForm');
const modalTitle = document.getElementById('modalTitle');
const templateName = document.getElementById('templateName');
const templateFile = document.getElementById('templateFile');
const templateDescription = document.getElementById('templateDescription');
const selectFileBtn = document.getElementById('selectFileBtn');
const cancelBtn = document.getElementById('cancelBtn');
const toast = document.getElementById('toast');
const previewModal = document.getElementById('previewModal');
const previewContent = document.getElementById('previewContent');
const closePreviewBtn = document.getElementById('closePreviewBtn');

// 초기 로드
document.addEventListener('DOMContentLoaded', async () => {
    await loadTemplates();

    // 이벤트 리스너
    addTemplateBtn.addEventListener('click', openAddModal);
    selectFileBtn.addEventListener('click', selectFile);
    cancelBtn.addEventListener('click', closeModal);
    templateForm.addEventListener('submit', handleSubmit);
    closePreviewBtn.addEventListener('click', closePreviewModal);

    // 모달 외부 클릭 시 닫기
    templateModal.addEventListener('click', (e) => {
        if (e.target === templateModal) {
            closeModal();
        }
    });

    previewModal.addEventListener('click', (e) => {
        if (e.target === previewModal) {
            closePreviewModal();
        }
    });
});

/**
 * 템플릿 목록 로드
 */
async function loadTemplates() {
    try {
        loading.classList.add('active');
        templateList.innerHTML = '';

        const result = await window.electronAPI.getAllTemplates();

        if (result.success) {
            templates = result.templates;
            renderTemplates();
        } else {
            showToast('템플릿 목록을 불러올 수 없습니다.', 'error');
        }
    } catch (error) {
        console.error('Failed to load templates:', error);
        showToast('템플릿 목록을 불러올 수 없습니다.', 'error');
    } finally {
        loading.classList.remove('active');
    }
}

/**
 * 시스템 제공 템플릿인지 확인
 * 시스템 리소스 폴더(resources\templates) 또는 개발 모드(프로젝트\templates)에 있는 템플릿은 시스템 템플릿으로 간주
 */
function isSystemTemplate(filePath) {
    const normalizedPath = filePath.replace(/\//g, '\\').toLowerCase();
    // 프로덕션: resources\templates
    // 개발: electron-file-monitor\templates
    return normalizedPath.includes('\\resources\\templates\\') ||
           (normalizedPath.includes('\\templates\\') && !normalizedPath.includes('\\appdata\\'));
}

/**
 * 템플릿 목록 렌더링
 */
function renderTemplates() {
    if (templates.length === 0) {
        templateList.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">📄</div>
                <p>등록된 템플릿이 없습니다.</p>
                <p style="font-size: 13px; margin-top: 10px;">템플릿 추가 버튼을 눌러 새 템플릿을 등록하세요.</p>
            </div>
        `;
        return;
    }

    templateList.innerHTML = templates.map(template => {
        // 시스템 제공 템플릿 판별 (resources\templates 폴더에 있는 템플릿)
        const isSystemProvided = isSystemTemplate(template.filePath);

        return `
            <div class="template-item ${template.isDefault ? 'default' : ''}" data-id="${template.id}">
                <div class="template-main">
                    <div class="template-icon">${template.isDefault ? '⭐' : '📄'}</div>
                    <div class="template-info">
                        <div class="template-name">
                            ${template.name}
                            ${template.isDefault ? '<span class="default-badge">현재 기본 템플릿</span>' : ''}
                            ${isSystemProvided ? '<span class="default-badge" style="background: #17a2b8;">시스템 템플릿</span>' : ''}
                        </div>
                        ${template.description ? `<div class="template-description">${template.description}</div>` : ''}
                    </div>
                    <div class="template-actions">
                        <button class="btn btn-preview" data-action="preview" data-template-id="${template.id}">미리보기</button>
                        <button class="btn btn-edit" data-action="edit" data-template-id="${template.id}">수정</button>
                        ${!template.isDefault ? `<button class="btn btn-default" data-action="setDefault" data-template-id="${template.id}">기본 설정</button>` : ''}
                        ${!isSystemProvided ? `<button class="btn btn-delete" data-action="delete" data-template-id="${template.id}">삭제</button>` : ''}
                    </div>
                </div>
                ${!isSystemProvided ? `<div class="template-path">${template.filePath}</div>` : ''}
            </div>
        `;
    }).join('');

    // 이벤트 위임을 사용하여 버튼 클릭 처리
    attachTemplateActionListeners();
}

/**
 * 템플릿 액션 버튼에 이벤트 리스너 연결
 */
function attachTemplateActionListeners() {
    templateList.addEventListener('click', (e) => {
        const button = e.target.closest('button[data-action]');
        if (!button || button.disabled) return;

        const action = button.dataset.action;
        const templateId = parseInt(button.dataset.templateId);

        switch (action) {
            case 'preview':
                previewTemplate(templateId);
                break;
            case 'edit':
                editTemplate(templateId);
                break;
            case 'setDefault':
                setDefault(templateId);
                break;
            case 'delete':
                deleteTemplate(templateId);
                break;
        }
    });
}

/**
 * 템플릿 추가 모달 열기
 */
function openAddModal() {
    editingTemplateId = null;
    modalTitle.textContent = '템플릿 추가';
    templateName.value = '';
    templateFile.value = '';
    templateDescription.value = '';
    templateFile.removeAttribute('data-path');
    templateModal.classList.add('active');
}

/**
 * 템플릿 수정 모달 열기
 */
async function editTemplate(id) {
    editingTemplateId = id;
    const template = templates.find(t => t.id === id);

    if (!template) return;

    modalTitle.textContent = '템플릿 수정';
    templateName.value = template.name;
    templateFile.value = template.filePath;
    templateFile.setAttribute('data-path', template.filePath);
    templateDescription.value = template.description || '';

    // 파일 경로는 수정 불가
    selectFileBtn.disabled = true;
    selectFileBtn.style.display = 'none';

    templateModal.classList.add('active');
};

/**
 * 모달 닫기
 */
function closeModal() {
    templateModal.classList.remove('active');
    selectFileBtn.disabled = false;
    selectFileBtn.style.display = 'block';
}

/**
 * 파일 선택
 */
async function selectFile() {
    try {
        const result = await window.electronAPI.selectTemplateFile();

        if (result.success && result.filePath) {
            templateFile.value = result.filePath;
            templateFile.setAttribute('data-path', result.filePath);

            // 파일명에서 이름 추출
            const fileName = result.filePath.split('\\').pop().split('/').pop();
            const nameWithoutExt = fileName.replace('.lbx', '');

            if (!templateName.value) {
                templateName.value = nameWithoutExt;
            }
        }
    } catch (error) {
        console.error('Failed to select file:', error);
        showToast('파일 선택에 실패했습니다.', 'error');
    }
}

/**
 * 폼 제출 처리
 */
async function handleSubmit(e) {
    e.preventDefault();

    const name = templateName.value.trim();
    const filePath = templateFile.getAttribute('data-path') || templateFile.value;
    const description = templateDescription.value.trim();

    if (!name || !filePath) {
        showToast('필수 항목을 입력해주세요.', 'error');
        return;
    }

    try {
        let result;

        if (editingTemplateId) {
            // 수정
            result = await window.electronAPI.updateTemplate(editingTemplateId, {
                name,
                description
            });
        } else {
            // 추가
            result = await window.electronAPI.addTemplate({
                name,
                filePath,
                description
            });
        }

        if (result.success) {
            showToast(editingTemplateId ? '템플릿이 수정되었습니다.' : '템플릿이 추가되었습니다.', 'success');
            closeModal();
            await loadTemplates();
        } else {
            showToast(result.message || '저장에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('Failed to save template:', error);
        showToast('저장에 실패했습니다.', 'error');
    }
}

/**
 * 템플릿 미리보기
 */
async function previewTemplate(id) {
    const template = templates.find(t => t.id === id);
    if (!template) return;

    try {
        // 미리보기 모달 열기
        previewContent.innerHTML = '<div class="preview-loading">미리보기를 생성 중입니다...</div>';
        previewModal.classList.add('active');

        // 미리보기 생성
        const result = await window.electronAPI.previewTemplate(template.filePath);

        if (result.success && result.data) {
            // Base64 이미지 표시
            previewContent.innerHTML = `<img src="data:image/bmp;base64,${result.data}" class="preview-image" alt="템플릿 미리보기">`;
        } else {
            previewContent.innerHTML = '<div class="preview-loading" style="color: #dc3545;">미리보기 생성에 실패했습니다.</div>';
            showToast(result.error || '미리보기를 불러올 수 없습니다.', 'error');
        }
    } catch (error) {
        console.error('Failed to preview template:', error);
        previewContent.innerHTML = '<div class="preview-loading" style="color: #dc3545;">미리보기 생성 중 오류가 발생했습니다.</div>';
        showToast('미리보기를 불러올 수 없습니다.', 'error');
    }
};

/**
 * 미리보기 모달 닫기
 */
function closePreviewModal() {
    previewModal.classList.remove('active');
    previewContent.innerHTML = '<div class="preview-loading">미리보기를 생성 중입니다...</div>';
}

/**
 * 기본 템플릿 설정
 */
async function setDefault(id) {
    try {
        const result = await window.electronAPI.setDefaultTemplate(id);

        if (result.success) {
            showToast('기본 템플릿으로 설정되었습니다.', 'success');
            await loadTemplates();
        } else {
            showToast(result.message || '설정에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('Failed to set default template:', error);
        showToast('설정에 실패했습니다.', 'error');
    }
}

/**
 * 템플릿 삭제
 */
async function deleteTemplate(id) {
    const template = templates.find(t => t.id === id);
    if (!template) return;

    // 시스템 제공 템플릿 판별 (resources\templates 폴더에 있는 템플릿)
    if (isSystemTemplate(template.filePath)) {
        showToast('시스템 제공 템플릿은 삭제할 수 없습니다.', 'error');
        return;
    }

    if (template.isDefault) {
        showToast('기본 템플릿은 삭제할 수 없습니다.', 'error');
        return;
    }

    if (!confirm(`"${template.name}" 템플릿을 삭제하시겠습니까?`)) {
        return;
    }

    try {
        const result = await window.electronAPI.deleteTemplate(id);

        if (result.needsConfirmation) {
            const confirmMsg = `${result.message}\n\n삭제하시겠습니까?\n(사용 중인 환자/약품은 기본 템플릿으로 변경됩니다)`;
            if (!confirm(confirmMsg)) {
                return;
            }

            // 재시도 (강제 삭제는 백엔드에서 처리)
            const retryResult = await window.electronAPI.deleteTemplate(id);
            if (!retryResult.success) {
                showToast(retryResult.message || '삭제에 실패했습니다.', 'error');
                return;
            }
        }

        if (result.success || result.needsConfirmation) {
            showToast('템플릿이 삭제되었습니다.', 'success');
            await loadTemplates();
        } else {
            showToast(result.message || '삭제에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('Failed to delete template:', error);
        showToast('삭제에 실패했습니다.', 'error');
    }
};

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
