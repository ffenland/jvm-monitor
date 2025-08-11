# Electron File Monitor - Brother 라벨 프린터 출력 시스템

## 프로젝트 개요
이 프로젝트는 약국에서 사용하는 Brother QL-700 라벨 프린터를 통해 약품 라벨을 출력하는 Electron 애플리케이션입니다. 

### 주요 기능
1. **파일 모니터링**: C:\atc 디렉토리의 TXT 파일을 실시간 모니터링
2. **데이터 파싱**: EUC-KR 인코딩된 처방전 데이터를 파싱 (JVPHEAD, JVMHEAD 섹션)
3. **데이터 저장**: 날짜별 JSON 파일로 데이터 저장 (2종류)
   - receipt_YYYYMMDD.json: 저장용 (receiptDateRaw 기준)
   - result_YYYYMMDD.json: 조회용 (파싱 시점 날짜 기준)
4. **라벨 출력**: Brother b-PAC SDK를 사용하여 .lbx 템플릿 파일에 데이터를 매핑하고 출력

## 시스템 요구사항
- Windows OS (32비트 또는 64비트)
- Brother b-PAC SDK 3.4 이상
- Brother QL-700 프린터 및 드라이버
- Node.js 및 Electron

## 핵심 구조

### 1. 메인 프로세스 (main.js)
- 파일 모니터링: `C:\atc` 디렉토리 감시
- IPC 핸들러: 렌더러 프로세스와 통신
- 데이터 가공: `dataProcessor.js` 모듈 사용
- 출력 처리: `print_brother.js` 모듈 사용

### 2. 출력 모듈 (print_brother.js)
Brother b-PAC SDK와 통신하는 핵심 모듈입니다.

#### 주요 특징:
- **한글 지원**: UTF-8 BOM이 포함된 동적 PowerShell 스크립트 생성
- **동적 스크립트 생성**: 매개변수를 스크립트에 직접 삽입하여 인코딩 문제 해결
- **32비트 PowerShell 사용**: b-PAC은 32비트 COM 객체이므로 반드시 32비트 PowerShell 사용

```javascript
// PowerShell 실행 경로 - 항상 32비트 버전 사용
const powershellPath = 'C:\\WINDOWS\\SysWOW64\\WindowsPowerShell\\v1.0\\powershell.exe';
```

### 3. 데이터 가공 모듈 (dataProcessor.js)
템플릿별로 다른 데이터 가공 로직을 제공합니다.

#### 템플릿별 가공 함수:
- `processPrescriptionData()`: 처방전 라벨용

## 한글 출력 문제 해결

### 문제점
- PowerShell 스크립트 파일의 인코딩 문제
- 명령줄 매개변수로 한글 전달 시 깨짐
- 스마트 따옴표 문제

### 해결 방법
1. **UTF-8 BOM 추가**: 스크립트 파일 생성 시 BOM 추가
```javascript
const BOM = '\ufeff';
fs.writeFileSync(tempScriptPath, BOM + scriptContent, 'utf8');
```

2. **동적 스크립트 생성**: 매개변수를 스크립트에 직접 삽입
```javascript
// 한글 텍스트를 스크립트 내부에 직접 포함
$obj.Text = "${value.toString().replace(/"/g, '`"')}"
```

3. **임시 파일 사용**: 실행 후 자동 삭제
```javascript
const tempScriptPath = path.join(__dirname, `temp_print_${Date.now()}.ps1`);
// 실행 후 정리
fs.unlinkSync(tempScriptPath);
```

## Brother b-PAC SDK 설정

### COM 객체 등록 (관리자 권한 필요)
```powershell
# 32비트 시스템
regsvr32 "C:\Program Files\Common Files\Brother\b-PAC\bpac.dll"

# 64비트 시스템 (32비트 COM 등록)
C:\Windows\SysWOW64\regsvr32.exe "C:\Program Files (x86)\Common Files\Brother\b-PAC\bpac.dll"
```

### COM 객체 이름
```javascript
// b-PAC SDK 버전별 COM 객체 이름
const comNames = @(
    "bpac.Document",      // b-PAC SDK 3.0
    "b-PAC.Document",     // 이전 버전 호환
    "bpac3.Document",     // b-PAC SDK 3.1 이상
    "Brother.bpac.Document",
    "BrssCom.Document"
)
```

## 주요 IPC 핸들러

### 1. print-prescription
처방전 출력 핸들러
- `processPrescriptionData()` 사용
- medicines 배열을 JSON 문자열로 변환

### 3. get-brother-printers
Brother 프린터 목록 조회
- WMI를 통해 Brother 프린터 검색
- 동적 PowerShell 스크립트 생성

## 디버깅 및 문제 해결

### 1. 프린터를 찾을 수 없을 때
- Brother QL-700 드라이버 설치 확인
- 프린터 연결 상태 확인
- Windows 프린터 목록에서 확인

### 2. b-PAC COM 객체 생성 실패
- b-PAC SDK 설치 확인
- COM 객체 등록 확인 (regsvr32)
- 32비트 PowerShell 사용 확인

### 3. 한글 출력 문제
- dataProcessor.js에서 데이터 가공 확인
- UTF-8 BOM이 포함된 스크립트 생성 확인
- 콘솔에서 가공된 데이터 로그 확인

### 4. 템플릿 필드 불일치
템플릿의 필드명과 데이터 객체의 키가 정확히 일치해야 합니다.
```javascript
// 템플릿 필드 확인 방법
const { executePowerShell } = require('./print_brother');
const result = await executePowerShell('check_template_fields.ps1', { 
    templatePath: 'path/to/template.lbx' 
});
```

## 코드 복구 가이드

### 출력 시스템 복구 순서
1. **b-PAC SDK 확인**
   - SDK 설치 여부 확인
   - COM 객체 등록 확인

2. **print_brother.js 확인**
   - `executePowerShellWithKorean()` 함수 존재 확인
   - UTF-8 BOM 추가 코드 확인
   - 32비트 PowerShell 경로 확인

3. **dataProcessor.js 확인**
   - 템플릿별 가공 함수 존재 확인
   - 한글 텍스트 가공 로직 확인

4. **main.js 확인**
   - IPC 핸들러 정상 작동 확인
   - dataProcessor 모듈 import 확인

### 테스트 방법
```javascript
// 1. 프린터 목록 테스트
const { getBrotherPrinters } = require('./print_brother');
const printers = await getBrotherPrinters();
console.log(printers); // ['Brother QL-700']

// 2. 라벨 출력 테스트
const { printWithBrother } = require('./print_brother');
const result = await printWithBrother({
    templatePath: 'path/to/template.lbx',
    printerName: 'Brother QL-700',
    patientName: '홍길동',
    medicineName: '타이레놀'
});
```

## 설정 파일

### config/config.json
```json
{
    "pharmacyName": "행복약국",
    "templatePath": "./templates/label1.lbx"
}
```

## 템플릿 파일 구조
- `templates/` 폴더에 .lbx 파일 저장
- Brother P-touch Editor로 템플릿 생성/편집
- 텍스트 객체의 이름이 데이터 필드명과 일치해야 함

## 주의사항
1. **반드시 32비트 PowerShell 사용**: b-PAC은 32비트 COM 객체
2. **템플릿 필드명 정확히 일치**: 대소문자 구분
3. **한글 데이터는 가공 모듈에서 처리**: 직접 전달하지 않음
4. **임시 파일 자동 정리**: 메모리 누수 방지

## 파일 모니터링 및 데이터 파싱

### 모니터링 대상
- 경로: `C:\atc` 디렉토리
- 파일 형식: `Copy\d+-(\d{8})(\d{6})\.txt` 패턴의 TXT 파일
- 인코딩: EUC-KR

### 파싱 모듈 (parser.js)
TXT 파일에서 처방전 데이터를 추출합니다.

#### JVPHEAD 섹션 파싱
```javascript
{
    patientId: "환자ID (11자리)",
    receiptNum: "접수번호",
    receiptDateRaw: "접수일자 (YYYYMMDD)",
    receiptDate: "접수일자 (YYYY년MM월DD일 형식)",
    patientName: "환자명",
    hospitalName: "병원명"
}
```

#### JVMHEAD 섹션 파싱
약품 정보 배열을 추출합니다:
```javascript
{
    code: "약품코드 (T 또는 E로 시작하는 10자리)",
    name: "약품명",
    prescriptionDays: "처방일수",
    dailyDose: "일일투여횟수",
    singleDose: "1회투여량"
}
```

## 데이터 저장 시스템

### JSON 파일 구조
1. **receipt_YYYYMMDD.json (저장용)**
   - 경로: `result/receipt_YYYYMMDD.json`
   - 파일명 날짜: parsedData.receiptDateRaw 값 기준
   - 중복 처리: receiptNum과 patientId가 모두 일치하면 중복으로 판단
   - 현재 구현: 중복 시 스킵 (요구사항: receiptNum만 확인하고 값이 다르면 -1, -2 접미어 추가)

2. **result_YYYYMMDD.json (조회용)**
   - 경로: `result/result_YYYYMMDD.json`
   - 파일명 날짜: 파싱 시점의 날짜
   - 중복 처리: 없음 (단순 추가)
   - 용도: 최근 파싱 순서대로 조회

### 원본 파일 백업
- 경로: `originFiles/origin_YYYYMMDD/` 
- 파싱된 원본 TXT 파일을 날짜별 폴더에 복사 보관
- 파싱 오류 발생 시: `originFiles/error/` 폴더로 이동

## 향후 개선 사항
- [ ] receipt_YYYYMMDD.json의 중복 처리 로직 수정 (receiptNum 기준, 접미어 추가)
- [ ] 다양한 템플릿 지원 확대
- [ ] 출력 미리보기 기능
- [ ] 배치 출력 기능
- [ ] 출력 이력 관리
- [ ] **SQLite 데이터베이스 마이그레이션**
  - JSON 파일 기반에서 SQLite로 전환
  - better-sqlite3 패키지 사용
  - 처방전, 약품정보, 처방약품 테이블 구조화
  - 기존 JSON 데이터 마이그레이션 스크립트 제공
  - 검색, 통계, 백업 기능 개선

## 라벨 템플릿 필드 가이드

Brother 라벨 프린터 템플릿(.lbx)에서 사용 가능한 필드명과 설명입니다.

### 기본 필드
- `patientName` - 환자명 (예: 홍길동)
- `medicineName` - 약품명 (예: 시크렌캡슐)
- `medicineType` - 약품 종류 (예: 먹는약, 바르는약)
- `dose` - 복용법 (예: 2알씩 하루 3번 복용)
- `prescriptionDays` - 처방일수 (예: 7일분)
- `madeDate` - 조제일 (예: 조제일 2025.08.11)
- `pharmacy` - 약국명 (설정에서 지정)

### 처방전 필드
- `hospitalName` - 병원명
- `receiptDate` - 접수일자
- `receiptNum` - 접수번호
- `doctorName` - 의사명
- `medicines` - 약품 목록 (JSON 문자열)

### 약품 상세 필드
- `dailyDose` - 일일 투여 횟수
- `singleDose` - 1회 투여량
- `dailyDoseText` - 일일 투여 텍스트 (예: 하루 3회)
- `singleDoseText` - 1회 투여 텍스트 (예: 1회 2정)
- `prescriptionDaysText` - 처방일수 텍스트 (예: 7일분)
- `fullDescription` - 전체 설명
- `endDate` - 복용 종료일

## 약품 상세정보 API

### getDrugPrdtPrmsnDtlInq05 API
공공데이터 포털의 의약품 제품허가 상세정보 API를 사용하여 약품의 보관방법과 효능효과를 조회합니다.

- **엔드포인트**: `https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService06/getDrugPrdtPrmsnDtlInq05`
- **약품코드 검색 파라미터**: `edi_code` (medicine.json의 code 값 사용)
- **약품명 검색 파라미터**: `item_name`
- **응답 형식**: JSON (`type=json`)

#### 주요 파라미터
```javascript
{
    serviceKey: API_KEY,
    pageNo: '1',
    numOfRows: '10',
    type: 'json',
    edi_code: '621802320'  // medicine.json의 code 값 (EDI 코드)
}
```

#### 파싱 필드
- **STORAGE_METHOD**: 보관방법 (용기와 온도로 분리)
  - storageContainer: 보관 용기 (예: 기밀용기, 차광기밀용기)
  - storageTemp: 보관 온도 (예: 실온, 20℃이하)
- **EE_DOC_DATA**: 효능효과 (XML 형식으로 제공, 파싱 필요)
- **ITEM_NAME**: 약품명
- **ENTP_NAME**: 제조사

---
*최종 업데이트: 2025-08-11*
*작성자: Claude Assistant*