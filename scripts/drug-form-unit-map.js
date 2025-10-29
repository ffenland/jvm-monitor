/**
 * 의약품 제형(drug_form)별 복용 단위(unit) 매핑
 *
 * 약학정보원 API에서 제공하는 drug_form 값을 기준으로
 * 적절한 복용 단위를 자동으로 결정합니다.
 */

const DRUG_FORM_UNIT_MAP = {
    // ========== 정제/캡슐류 ==========
    '정제': '정',
    '서방정': '정',
    '장용정': '정',
    '장용성서방정': '정',
    '설하정': '정',
    '속붕해정(구강붕해정)': '정',
    '저작정(츄어블정)': '정',
    '현탁정': '정',
    '박칼정(구강정)': '정',
    '트로키제': '정',

    '경질캡슐': '캡슐',
    '연질캡슐': '캡슐',
    '서방캡슐': '캡슐',
    '장용캡슐': '캡슐',
    '질연질캡슐': '캡슐',

    // ========== 액체류 ==========
    '시럽제': 'mL',
    '건조시럽': 'mL',
    '액제': 'mL',
    '현탁액': 'mL',
    '유제': 'mL',
    '엘릭서제': 'mL',
    '엑스제': 'mL',
    '설하액': 'mL',
    '틴크제': 'mL',
    '가글액제': 'mL',
    '주사액': 'mL',
    '주사제': 'mL',
    '시약': 'mL',
    '샴푸': 'mL',
    '라카': 'mL',

    // ========== 점안/점비/점이제 ==========
    '점안제': '방울',

    // ========== 흡입/분무제 ==========
    '흡입제': '회',
    '분무제': '회',
    '에어로솔': '회',

    // ========== 외용제(연고/크림/겔) ==========
    '연고': '회',
    '안연고': '회',
    '크림': '회',
    '로션': '회',
    '겔제': '회',
    '안겔': '회',
    '페이스트': '회',

    // ========== 파스/패치류 ==========
    '경피흡수제(패취제)': '매',
    '플라스타': '매',
    '카타플라스마': '매',
    '구강용해필름제': '매',

    // ========== 좌제/관장제 ==========
    '좌제': '개',
    '관장제': '개',

    // ========== 분말/과립류 ==========
    '산제': '포',
    '과립': '포',
    '서방성 과립': '포',
    '장용성 과립': '포',

    // ========== 특수제형 ==========
    '환제': '환',
    '껌': '개',
    '젤리': '개',
    '바': '개',
    '이식제': '개',
    '자가주사': '회',
    '비누': '회',
    '팩(pack)': '회',
    '약물이 포함된 위생용품': '회',
    '체외진단용의약품': '회',
    '키트': '세트',

    // ========== 기타 ==========
    '기타': '회'
};

/**
 * drug_form 값으로부터 적절한 unit을 결정
 * @param {string} drugForm - 약품 제형
 * @returns {string} - 복용 단위
 */
function getUnitFromDrugForm(drugForm) {
    if (!drugForm || typeof drugForm !== 'string') {
        return '회';  // 기본값
    }

    // 정확히 일치하는 경우
    if (DRUG_FORM_UNIT_MAP[drugForm]) {
        return DRUG_FORM_UNIT_MAP[drugForm];
    }

    // 부분 일치 검색 (예: "서방정(연질캡슐)" → "서방정")
    const normalizedForm = drugForm.trim();

    for (const [key, value] of Object.entries(DRUG_FORM_UNIT_MAP)) {
        if (normalizedForm.includes(key)) {
            return value;
        }
    }

    // 키워드 기반 추론
    if (normalizedForm.includes('정') && !normalizedForm.includes('주사')) {
        return '정';
    }
    if (normalizedForm.includes('캡슐')) {
        return '캡슐';
    }
    if (normalizedForm.includes('시럽') || normalizedForm.includes('주사액')) {
        return 'mL';
    }
    // 외용제, 외용액제 → "회"
    if (normalizedForm.includes('외용')) {
        return '회';
    }
    if (normalizedForm.includes('연고') || normalizedForm.includes('크림') || normalizedForm.includes('겔') || normalizedForm.includes('로션')) {
        return '회';
    }
    if (normalizedForm.includes('액') && !normalizedForm.includes('주사')) {
        return 'mL';
    }
    if (normalizedForm.includes('패취') || normalizedForm.includes('패치') || normalizedForm.includes('파스')) {
        return '매';
    }
    if (normalizedForm.includes('좌제')) {
        return '개';
    }
    if (normalizedForm.includes('산') || normalizedForm.includes('과립')) {
        return '포';
    }
    if (normalizedForm.includes('흡입') || normalizedForm.includes('분무')) {
        return '회';
    }
    if (normalizedForm.includes('점안')) {
        return '방울';
    }

    // 기본값
    return '회';
}

module.exports = {
    DRUG_FORM_UNIT_MAP,
    getUnitFromDrugForm
};
