# Brother 프린터 설정 가이드

## 문제 해결

### 1. COM 객체 등록 문제 해결

Brother b-PAC SDK가 설치되어 있지만 COM 객체 오류가 발생하는 경우:

**방법 1: b-PAC SDK 재설치 (권장)**
1. 제어판에서 Brother b-PAC3 SDK 제거
2. PC 재시작
3. [Brother b-PAC SDK 다운로드](https://support.brother.com/g/s/es/dev/en/bpac/download/index.html)
4. 관리자 권한으로 설치 실행

**방법 2: 직접 프린터 테스트**
```powershell
cd "C:\Users\BoramATDPS\Documents\dev\electron-file-monitor\scripts"
.\test_printer_direct.ps1
```

**참고**: 앱은 이제 COM 객체가 없어도 Windows 프린터 스풀러를 통해 직접 출력이 가능합니다.

### 2. 실제 설치된 프린터만 표시

이제 시스템에 실제로 설치된 Brother 프린터만 목록에 표시됩니다.

### 3. Brother QL-700 프린터가 목록에 없는 경우

1. **프린터 드라이버 설치 확인**
   - 제어판 > 장치 및 프린터에서 Brother QL-700이 있는지 확인
   - 없다면 Brother 공식 사이트에서 드라이버 다운로드 및 설치

2. **프린터 연결 확인**
   - USB 케이블이 제대로 연결되어 있는지 확인
   - 프린터 전원이 켜져 있는지 확인

3. **Windows에서 프린터 추가**
   ```
   설정 > 장치 > 프린터 및 스캐너 > 프린터 또는 스캐너 추가
   ```

### 4. 템플릿 파일 생성

Brother P-touch Editor를 사용하여 라벨 템플릿 생성:

1. P-touch Editor 실행
2. 새 라벨 만들기 (62mm x 29mm)
3. 텍스트 객체 추가:
   - patientName (환자명)
   - hospitalName (병원명)
   - receiptDate (접수일)
   - prepareDate (조제일)
   - prescriptionNo (처방번호)
   - doctorName (의사명)
   - medicine1~5 (약품명)
   - dosage1~5 (용량)
   - frequency1~5 (복용법)
   - medicineCount (총 약품 수)
4. `templates/prescription_label.lbx`로 저장

## 테스트

### 1. 프린터 테스트
```powershell
cd scripts
.\test_print.ps1
```

### 2. 앱 실행
```bash
npm start
```

## 참고사항

- 이제 COM 객체 관련 에러 메시지가 표시되지 않습니다
- Brother QL-700이 Windows에 설치되어 있다면 정상적으로 출력됩니다
- b-PAC SDK가 없어도 Windows 프린터 스풀러를 통해 직접 출력이 가능합니다