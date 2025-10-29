const cheerio = require('cheerio');
const fs = require('fs');
const { extractTemperature } = require('./extract-temperature.js');
const { getUnitFromDrugForm } = require('./drug-form-unit-map.js');

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
  urlencoded.append("search_bohcode", bohcode);  // 보험코드로 검색
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
      "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "Content-Type": "application/x-www-form-urlencoded",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Sec-Fetch-Dest": "document",
    },
    body: urlencoded.toString(),
  };

  try {
    const response = await fetch("https://www.health.kr/searchDrug/search_detail.asp", requestOptions);
    const html = await response.text();

    // HTML 파싱
    const $ = cheerio.load(html);

    // onclick="javascript:drug_detailHref('2020071600007')" 형식에서 yakjung_code 추출
    let yakjungCode = null;
    $('#tbl_proY td[onclick]').each((index, element) => {
      const onclickAttr = $(element).attr('onclick');
      if (onclickAttr) {
        const match = onclickAttr.match(/drug_detailHref\('([^']+)'\)/);
        if (match) {
          yakjungCode = match[1];
          return false; // break loop
        }
      }
    });

    if (yakjungCode) {
      return { icode: yakjungCode };
    }
    return null; // 결과 없음

  } catch (error) {
    console.error('Error searching by bohcode:', error);
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
  urlencoded.append("drug_nm", drugName);  // 약품명으로 검색
  urlencoded.append("drug_nm_mode", "field");
  urlencoded.append("icode", "");
  urlencoded.append("input_drug_nm", drugName);  // 약품명 입력
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
  urlencoded.append("search_bohcode", "");  // bohcode는 비움
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
      "sec-ch-ua": '"Google Chrome";v="141", "Not?A_Brand";v="8", "Chromium";v="141"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"macOS"',
      "Content-Type": "application/x-www-form-urlencoded",
      "Upgrade-Insecure-Requests": "1",
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-User": "?1",
      "Sec-Fetch-Dest": "document",
      "Cookie": "ASPSESSIONIDQQRSASSB=MOLPNFMCHGCEEGHBJADBLBMB; ASPSESSIONIDSSQTDRQC=MHHLCBJDJLJPAJLFJCIAIDHP; ASPSESSIONIDSSTQARSA=DCGELNFAOKLDCAGPBFOGEGEC; NCPVPCLBTG=0c3b0e0eaa56ce7ace3b7eb96b733317e791e439a5e6f5246ea6af3cec1c49f0",
    },
    body: urlencoded.toString(),
  };

  try {
    const response = await fetch("https://www.health.kr/searchDrug/search_detail.asp", requestOptions);
    const html = await response.text();

    const parsedData = parseSearchResults(html);
    return parsedData;
  } catch (error) {
    console.error('Error fetching medicine data:', error);
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
  const $ = cheerio.load(html);
  const results = [];

  // 테이블의 각 데이터 행을 순회 (thead 제외)
  $('#tbl_proY tr').each((index, element) => {
    const tr = $(element);

    // 헤더 행은 건너뛰기
    if (tr.find('th').length > 0) {
      return;
    }

    const tds = tr.find('td');

    // 최소한의 td가 있는지 확인
    if (tds.length < 9) {
      return;
    }

    // 1. 식별/포장 이미지 (td[0])
    const imgTd = tds.eq(0);
    const imgElement = imgTd.find('img');
    const imageUrl = imgElement.attr('src') || null;
    const photoId = imgTd.attr('id') || '';
    const yakjungCodeFromImg = photoId.replace('photo', '');

    // 2. 제품명 및 yakjungCode (td[1])
    const nameTd = tds.eq(1);
    const name = nameTd.text().trim();
    const onclickAttr = nameTd.attr('onclick') || '';
    const yakjungCodeMatch = onclickAttr.match(/drug_detailHref\('([^']+)'\)/);
    const yakjungCode = yakjungCodeMatch ? yakjungCodeMatch[1] : yakjungCodeFromImg;

    // 3. 성분/함량 (td[2]) - 팝업 내용 제외하고 메인 텍스트만
    const ingredientTd = tds.eq(2);
    const ingredient = ingredientTd.clone().children().remove().end().text().trim();

    // 4. 효능 (td[3]) - 스킵
    // const effect = tds.eq(3).text().trim();

    // 5. 회사명 (td[4])
    const company = tds.eq(4).text().trim();

    // 6. 분류 (td[5]) - 스킵
    // const category = tds.eq(5).text().trim();

    // 7. 제형 (td[6])
    const formulation = tds.eq(6).text().trim();

    // 8. 구분 (td[7]) - 전문/일반
    const classification = tds.eq(7).text().trim();

    // 9. 약가 (td[8])
    const price = tds.eq(8).text().trim();

    // 10. 공급유무 (td[9])
    const supply = tds.eq(9).text().trim();

    if (yakjungCode && name) {
      results.push({
        yakjungCode,      // yakjung_code (icode)
        name,             // 제품명
        imageUrl,         // 식별 이미지 URL
        ingredient,       // 성분/함량
        formulation,      // 제형
        company,          // 회사명
        classification,   // 전문/일반
        price,            // 약가
        supply            // 공급유무
      });
    }
  });

  return results;
}

/**
 * upso_name에서 제조사명만 추출
 * @param {string} upsoName - 제조사 정보 (예: "한국유나이티드제약 | 수원시 권선구 산업로156번길 94-39")
 * @returns {string} - 제조사명만 (예: "한국유나이티드제약")
 */
function parseUpsoName(upsoName) {
  if (!upsoName) return null;
  const parts = upsoName.split('|');
  return parts[0].trim() || null;
}

// 테스트 코드
async function test() {
  console.log('Testing searchMedicineByName...\n');

  // 테스트할 약품명 (실제 존재하는 약품명으로 테스트)
  const testDrugName = '타이레놀';

  console.log(`Searching for: ${testDrugName}`);

  try {
    const results = await searchMedicineByName(testDrugName);

    console.log(`\nFound ${results.length} result(s):\n`);

    results.forEach((result, index) => {
      console.log(`[${index + 1}]`);
      console.log(`  yakjungCode: ${result.yakjungCode}`);
      console.log(`  제품명: ${result.name}`);
      console.log(`  성분/함량: ${result.ingredient}`);
      console.log(`  제형: ${result.formulation}`);
      console.log(`  회사명: ${result.company}`);
      console.log(`  구분: ${result.classification}`);
      console.log(`  약가: ${result.price}`);
      console.log(`  공급유무: ${result.supply}`);
      if (result.imageUrl) {
        console.log(`  이미지: ${result.imageUrl}`);
      }
      console.log('');
    });

    // JSON으로도 저장
    fs.writeFileSync('search-results.json', JSON.stringify(results, null, 2), 'utf-8');
    console.log('Results saved to search-results.json');

  } catch (error) {
    console.error('Test failed:', error);
  }
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
      "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
      "Accept": "application/json, text/javascript, */*; q=0.01",
      "X-Requested-With": "XMLHttpRequest",
    },
  };

  try {
    const response = await fetch(url, requestOptions);
    const jsonData = await response.json();

    // API 응답이 배열이면 첫 번째 요소 사용
    const data = Array.isArray(jsonData) && jsonData.length > 0 ? jsonData[0] : jsonData;

    if (!data) {
      throw new Error('약품 정보를 찾을 수 없습니다');
    }

    const drugForm = data.drug_form || null;
    const stmt = data.stmt || null;

    return {
      yakjung_code: yakjungCode,
      drug_name: data.drug_name || '',
      drug_form: drugForm,
      dosage_route: data.dosage_route || '',
      cls_code: data.cls_code || '',
      upso_name: parseUpsoName(data.upso_name),  // 제조사명만 추출
      medititle: data.medititle || '',
      stmt: stmt,
      temperature: stmt ? extractTemperature(stmt) : null,  // stmt에서 온도 추출
      unit: getUnitFromDrugForm(drugForm),  // drug_form에서 단위 유추
      api_fetched: 1
    };
  } catch (error) {
    console.error('Error fetching medicine detail:', error);
    throw error;
  }
}

// 모듈로 export
module.exports = {
  searchMedicineByName,
  parseSearchResults,
  searchMedicineByBohcode,
  fetchMedicineDetailByYakjungCode
};

// 직접 실행 시 테스트
if (require.main === module) {
  test();
}
