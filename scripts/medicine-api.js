const fs = require("fs");
const { extractTemperature } = require("./extract-temperature.js");
const { getUnitFromDrugForm } = require("./drug-form-unit-map.js");

/**
 * bohcode(9자리 보험코드)로 약학정보원에서 약품 검색
 * @param {string} bohcode - 9자리 보험코드
 * @returns {Promise<Object|null>} { icode: yakjung_code } 또는 null (결과 없음)
 */
async function searchMedicineByBohcode(bohcode) {
  const urlencoded = new URLSearchParams();
  urlencoded.append("NoProTabState", "0");
  urlencoded.append("anchor_dosage_route_hidden", "");
  urlencoded.append("anchor_form_info_hidden", "");
  urlencoded.append("atccode_name", "");
  urlencoded.append("atccode_val", "");
  urlencoded.append("atccode_val_opener", "");
  urlencoded.append("cbx_bio", "");
  urlencoded.append("cbx_bio", "");
  urlencoded.append("cbx_bio", "");
  urlencoded.append("cbx_bio", "");
  urlencoded.append("cbx_bio_mode", "0");
  urlencoded.append("cbx_bohtype", "");
  urlencoded.append("cbx_bohtype", "");
  urlencoded.append("cbx_bohtype", "");
  urlencoded.append("cbx_bohtype", "");
  urlencoded.append("cbx_bohtype_mode", "0");
  urlencoded.append("cbx_class", "0");
  urlencoded.append("cbx_class", "");
  urlencoded.append("cbx_class", "");
  urlencoded.append("cbx_class", "");
  urlencoded.append("cbx_class_mode", "0");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic_mode", "0");
  urlencoded.append("cbx_sunbcnt", "0");
  urlencoded.append("cbx_sunbcnt_mode", "0");
  urlencoded.append("drug_nm", "");
  urlencoded.append("drug_nm_mode", "field");
  urlencoded.append("icode", "");
  urlencoded.append("input_drug_nm", "");
  urlencoded.append("input_hiraingdcd", "");
  urlencoded.append("input_upsoNm", "");
  urlencoded.append("kpic_atc_nm", "");
  urlencoded.append("kpic_atc_nm_opener", "");
  urlencoded.append("match_value", "");
  urlencoded.append("mfds_cd", "");
  urlencoded.append("mfds_cdWord", "");
  urlencoded.append("movefrom", "drug");
  urlencoded.append("proTabState", "0");
  urlencoded.append("proYN", "");
  urlencoded.append("search_bohcode", bohcode); // 보험코드로 검색
  urlencoded.append("search_detail", "Y");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_effect", "");
  urlencoded.append("search_sunb1", "");
  urlencoded.append("sunb_equals1", "");
  urlencoded.append("sunb_equals2", "");
  urlencoded.append("sunb_equals3", "");
  urlencoded.append("sunb_where1", "and");
  urlencoded.append("sunb_where2", "and");

  const requestOptions = {
    method: "POST",
    headers: {
      "sec-ch-ua":
        '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "Content-Type": "application/x-www-form-urlencoded",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Sec-Fetch-Dest": "document",
    },
    body: urlencoded.toString(),
  };

  try {
    const response = await fetch(
      "https://www.health.kr/searchDrug/search_detail.asp",
      requestOptions
    );
    const html = await response.text();

    // HTML에서 onclick="javascript:drug_detailHref('2020071600007')" 형식의 yakjung_code 추출
    // 순수 JavaScript 정규식 사용 (cheerio 불필요)
    const match = html.match(/drug_detailHref\('([^']+)'\)/);
    const yakjungCode = match ? match[1] : null;

    if (yakjungCode) {
      return { icode: yakjungCode };
    }
    return null; // 결과 없음
  } catch (error) {
    console.error("[MedicineAPI] Error searching by bohcode:", error);
    return null;
  }
}

/**
 * 약품명으로 약품 정보를 검색하는 함수
 * @param {string} drugName - 검색할 약품명
 * @returns {Promise<Array>} 검색 결과 배열 [{ icode, name, manufacturer, etc }, ...]
 */
async function searchMedicineByName(drugName) {
  const urlencoded = new URLSearchParams();
  urlencoded.append("NoProTabState", "0");
  urlencoded.append("anchor_dosage_route_hidden", "");
  urlencoded.append("anchor_form_info_hidden", "");
  urlencoded.append("atccode_name", "");
  urlencoded.append("atccode_val", "");
  urlencoded.append("atccode_val_opener", "");
  urlencoded.append("cbx_bio", "");
  urlencoded.append("cbx_bio", "");
  urlencoded.append("cbx_bio", "");
  urlencoded.append("cbx_bio", "");
  urlencoded.append("cbx_bio_mode", "0");
  urlencoded.append("cbx_bohtype", "");
  urlencoded.append("cbx_bohtype", "");
  urlencoded.append("cbx_bohtype", "");
  urlencoded.append("cbx_bohtype", "");
  urlencoded.append("cbx_bohtype_mode", "0");
  urlencoded.append("cbx_class", "0");
  urlencoded.append("cbx_class", "");
  urlencoded.append("cbx_class", "");
  urlencoded.append("cbx_class", "");
  urlencoded.append("cbx_class_mode", "0");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic", "");
  urlencoded.append("cbx_narcotic_mode", "0");
  urlencoded.append("cbx_sunbcnt", "0");
  urlencoded.append("cbx_sunbcnt_mode", "0");
  urlencoded.append("drug_nm", drugName); // 약품명으로 검색
  urlencoded.append("drug_nm_mode", "field");
  urlencoded.append("icode", "");
  urlencoded.append("input_drug_nm", drugName); // 약품명 입력
  urlencoded.append("input_hiraingdcd", "");
  urlencoded.append("input_upsoNm", "");
  urlencoded.append("kpic_atc_nm", "");
  urlencoded.append("kpic_atc_nm_opener", "");
  urlencoded.append("match_value", "");
  urlencoded.append("mfds_cd", "");
  urlencoded.append("mfds_cdWord", "");
  urlencoded.append("movefrom", "drug");
  urlencoded.append("proTabState", "0");
  urlencoded.append("proYN", "");
  urlencoded.append("search_bohcode", ""); // bohcode는 비움
  urlencoded.append("search_detail", "Y");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_drugnm_initial", "");
  urlencoded.append("search_effect", "");
  urlencoded.append("search_sunb1", "");
  urlencoded.append("sunb_equals1", "");
  urlencoded.append("sunb_equals2", "");
  urlencoded.append("sunb_equals3", "");
  urlencoded.append("sunb_where1", "and");
  urlencoded.append("sunb_where2", "and");

  const requestOptions = {
    method: "POST",
    headers: {
      "sec-ch-ua":
        '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "Content-Type": "application/x-www-form-urlencoded",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Sec-Fetch-Dest": "document",
    },
    body: urlencoded.toString(),
  };

  try {
    const response = await fetch(
      "https://www.health.kr/searchDrug/search_detail.asp",
      requestOptions
    );
    const html = await response.text();

    const parsedData = parseSearchResults(html);
    return parsedData;
  } catch (error) {
    console.error("[MedicineAPI] Error fetching medicine data:", error);
    throw error;
  }
}

/**
 * HTML을 파싱하여 검색 결과 목록을 추출하는 함수
 * @param {string} html - 검색 결과 HTML
 * @returns {Array} 검색 결과 배열
 *
 * 추출 정보:
 * - 식별/포장 (이미지 URL)
 * - 제품명 (yakjungCode 포함)
 * - 성분/함량
 * - 제형
 * - 약가
 * - 회사명
 */
function parseSearchResults(html) {
  const results = [];

  // id="tbl_proY" 테이블 찾기
  const tableMatch = html.match(/<table[^>]*id="tbl_proY"[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    return results;
  }

  const tableContent = tableMatch[1];

  // <tr>...</tr> 블록들을 모두 추출
  const trMatches = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi);
  if (!trMatches) {
    return results;
  }

  // 각 행 처리
  for (const tr of trMatches) {
    // 헤더 행(<th> 포함) 건너뛰기
    if (/<th[^>]*>/i.test(tr)) {
      continue;
    }

    // <td>...</td> 셀들을 모두 추출
    const tdMatches = tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi);
    if (!tdMatches || tdMatches.length < 9) {
      continue; // 최소 9개의 td가 필요
    }

    // 헬퍼 함수: HTML 태그 제거 및 텍스트 추출
    const extractText = (tdHtml) => {
      return tdHtml
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '') // script 태그 제거
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')   // style 태그 제거
        .replace(/<div[^>]*class="[^"]*popup[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '') // popup div 제거
        .replace(/<[^>]*>/g, '') // 모든 HTML 태그 제거
        .replace(/&nbsp;/g, ' ')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .trim();
    };

    // 헬퍼 함수: 속성값 추출
    const extractAttr = (tdHtml, attrName) => {
      const attrMatch = tdHtml.match(new RegExp(`${attrName}="([^"]*)"`, 'i'));
      return attrMatch ? attrMatch[1] : null;
    };

    try {
      // 1. 식별/포장 이미지 (td[0])
      const td0 = tdMatches[0];

      // <td class="img"><img class="anchor_img" 패턴으로 이미지 URL 추출
      let imageUrl = null;
      const imgMatch = td0.match(/<img\s+class="anchor_img"[^>]+src=['"]([^'"]+)['"]/i);
      if (imgMatch) {
        imageUrl = imgMatch[1];
        // 이미 절대 경로인 경우가 많지만, 혹시 상대 경로면 변환
        if (imageUrl && !imageUrl.startsWith('http')) {
          imageUrl = imageUrl.startsWith('/')
            ? `https://www.health.kr${imageUrl}`
            : `https://www.health.kr/${imageUrl}`;
        }
      }

      // onclick="show_idfypop('2020071600007')" 에서 yakjungCode 추출 (fallback)
      const onclickImgMatch = td0.match(/show_idfypop\(['"]([^'"]+)['"]\)/);
      const yakjungCodeFromImg = onclickImgMatch ? onclickImgMatch[1] : '';

      // 2. 제품명 및 yakjungCode (td[1])
      const td1 = tdMatches[1];
      const name = extractText(td1);
      const onclickAttr = extractAttr(td1, 'onclick') || '';
      const yakjungCodeMatch = onclickAttr.match(/drug_detailHref\('([^']+)'\)/);
      const yakjungCode = yakjungCodeMatch ? yakjungCodeMatch[1] : yakjungCodeFromImg;

      // 3. 성분/함량 (td[2])
      const td2 = tdMatches[2];
      const ingredient = extractText(td2);

      // 4. 효능 (td[3]) - 스킵

      // 5. 회사명 (td[4])
      const td4 = tdMatches[4];
      const company = extractText(td4);

      // 6. 분류 (td[5]) - 스킵

      // 7. 제형 (td[6])
      const td6 = tdMatches[6];
      const formulation = extractText(td6);

      // 8. 구분 (td[7]) - 전문/일반
      const td7 = tdMatches[7];
      const classification = extractText(td7);

      // 9. 약가 (td[8])
      const td8 = tdMatches[8];
      const price = extractText(td8);

      // 10. 공급유무 (td[9])
      const td9 = tdMatches[9] || '';
      const supply = extractText(td9);

      if (yakjungCode && name) {
        results.push({
          yakjungCode, // yakjung_code (icode)
          name, // 제품명
          imageUrl, // 식별 이미지 URL
          ingredient, // 성분/함량
          formulation, // 제형
          company, // 회사명
          classification, // 전문/일반
          price, // 약가
          supply, // 공급유무
        });
      }
    } catch (error) {
      continue; // 이 행은 건너뛰고 다음 행 처리
    }
  }

  return results;
}

/**
 * upso_name에서 제조사명만 추출
 * @param {string} upsoName - 제조사 정보 (예: "한국유나이티드제약 | 수원시 권선구 산업로156번길 94-39")
 * @returns {string} - 제조사명만 (예: "한국유나이티드제약")
 */
function parseUpsoName(upsoName) {
  if (!upsoName) return null;
  const parts = upsoName.split("|");
  return parts[0].trim() || null;
}

/**
 * 약학정보원 코드(yakjungCode)로 상세 정보 조회
 * 처음 파싱할 때와 같은 로직 사용 (ajax_result_drug2.asp API)
 * @param {string} yakjungCode - 약학정보원 코드
 * @returns {Promise<Object>} 약품 상세 정보
 */
async function fetchMedicineDetailByYakjungCode(yakjungCode) {
  const url = `https://www.health.kr/searchDrug/ajax/ajax_result_drug2.asp?drug_cd=${yakjungCode}`;

  const requestOptions = {
    method: "GET",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      Accept: "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    },
  };

  try {
    const response = await fetch(url, requestOptions);
    const jsonData = await response.json();

    // API 응답이 배열이면 첫 번째 요소 사용
    const data =
      Array.isArray(jsonData) && jsonData.length > 0 ? jsonData[0] : jsonData;

    if (!data) {
      throw new Error("약품 정보를 찾을 수 없습니다");
    }

    const drugForm = data.drug_form || null;
    const stmt = data.stmt || null;

    return {
      yakjung_code: yakjungCode,
      drug_name: data.drug_name || "",
      drug_form: drugForm,
      dosage_route: data.dosage_route || "",
      cls_code: data.cls_code || "",
      upso_name: parseUpsoName(data.upso_name), // 제조사명만 추출
      medititle: data.medititle || "",
      stmt: stmt,
      temperature: stmt ? extractTemperature(stmt) : null, // stmt에서 온도 추출
      unit: getUnitFromDrugForm(drugForm), // drug_form에서 단위 유추
      api_fetched: 1,
    };
  } catch (error) {
    console.error("Error fetching medicine detail:", error);
    throw error;
  }
}

/**
 * yakjungCode로 유효한 보험코드(bohcode) 목록 조회
 * @param {string} yakjungCode - 약학정보원 코드
 * @returns {Promise<string[]>} 유효한 보험코드 배열 (빈 배열 가능)
 */
async function fetchBohCodesFromYakjung(yakjungCode) {
  const url = `https://www.health.kr/searchDrug/ajax/ajax_boh_history2.asp?drug_cd=${yakjungCode}`;

  const requestOptions = {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    },
  };

  try {
    const response = await fetch(url, requestOptions);

    if (!response.ok) {
      console.error(`bohcode API 응답 오류: ${response.status}`);
      return [];
    }

    const jsonData = await response.json();

    if (!jsonData || jsonData.length === 0 || !jsonData[0].boh_history2) {
      // 보험코드 정보가 없음
      return [];
    }

    const bohHistory = jsonData[0].boh_history2;
    const bohCodes = [];

    // ! 로 구분된 각 보험코드 그룹 처리
    const groups = bohHistory.split('!');

    for (const group of groups) {
      if (!group.trim()) continue;

      // odt 다음의 보험코드 추출
      const bohCodeMatch = group.match(/odt(\d+)@/);
      if (!bohCodeMatch) continue;

      const bohCode = bohCodeMatch[1];

      // @ 이후의 이력들 추출
      const historyPart = group.split('@')[1];
      if (!historyPart) continue;

      // # 으로 구분된 각 이력
      const histories = historyPart.split('#');

      // 가장 최근 이력 (마지막 항목)
      const latestHistory = histories[histories.length - 1];

      // 상태 추출 (탭으로 구분된 3번째 항목)
      const parts = latestHistory.split('\t');
      if (parts.length >= 3) {
        const status = parts[2].trim();

        // 상태가 "급여"인 경우만 유효한 보험코드로 추가
        if (status === '급여') {
          bohCodes.push(bohCode);
        }
      }
    }

    return bohCodes;

  } catch (error) {
    console.error('bohcode 조회 실패:', error);
    return [];
  }
}

// 모듈로 export
module.exports = {
  searchMedicineByName,
  parseSearchResults,
  searchMedicineByBohcode,
  fetchMedicineDetailByYakjungCode,
  fetchBohCodesFromYakjung,
};
