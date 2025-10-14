# DrugLabel 설치 가이드

## 시스템 요구사항

DrugLabel 프로그램을 사용하기 위해서는 다음 구성 요소가 필요합니다:

1. **Windows OS** (Windows 10 이상 권장)
2. **Brother QL 시리즈 라벨 프린터** (QL-700, QL-800 등)
3. **Brother b-PAC Client Component** (필수)
4. **Brother 프린터 드라이버**

## 설치 순서

### 1단계: DrugLabel 프로그램 설치

1. `DrugLabel Setup 1.0.0.exe` 실행
2. 설치 마법사의 안내에 따라 설치 진행
3. 설치 완료 후 바탕화면에 생성된 아이콘 확인

### 2단계: Brother b-PAC Client Component 설치 (필수)

⚠️ **중요**: 이 구성 요소가 없으면 라벨 출력이 작동하지 않습니다.

1. Brother 공식 다운로드 페이지 방문:
   - https://support.brother.com/g/s/es/dev/en/bpac/download/index.html

2. **b-PAC Client Component** 다운로드
   - "b-PAC Client Component Ver.3.4" 선택
   - **32-bit ver.** 다운로드 (중요!)
   - 파일명: `bcciw32014.exe` (버전에 따라 다를 수 있음)

3. 다운로드한 파일 실행
   - 기본 설정으로 설치 진행
   - 설치 완료까지 대기

### 3단계: Brother 프린터 드라이버 설치

1. Brother 프린터 모델에 맞는 드라이버 다운로드
   - QL-700: https://support.brother.com/g/b/downloadtop.aspx?c=kr&lang=ko&prod=lpql700eas
   - QL-800: https://support.brother.com/g/b/downloadtop.aspx?c=kr&lang=ko&prod=lpql800eas

2. 드라이버 설치
   - 프린터를 PC에 연결
   - 다운로드한 드라이버 실행
   - 설치 마법사 따라 진행

### 4단계: 설치 확인

1. DrugLabel 프로그램 실행
2. 설정 버튼 클릭
3. "라벨 미리보기" 클릭
4. 미리보기가 정상적으로 표시되면 설치 완료

## 문제 해결

### "미리보기 생성실패" 오류가 발생하는 경우

1. b-PAC Client Component가 설치되었는지 확인
   - 제어판 > 프로그램 및 기능에서 "b-PAC Client Component" 확인

2. 32비트 버전을 설치했는지 확인
   - 64비트 버전이 설치된 경우 제거 후 32비트 버전 재설치

3. Windows Defender 또는 백신 프로그램이 차단하지 않는지 확인

### Brother 프린터가 인식되지 않는 경우

1. USB 케이블 연결 확인
2. 프린터 전원 확인
3. 장치 관리자에서 프린터 확인
4. 드라이버 재설치

## 지원

문제가 지속되는 경우:
- 이메일: support@cleareach.com
- 전화: 02-XXXX-XXXX

---

## 빠른 설치 체크리스트

- [ ] DrugLabel Setup 실행 및 설치
- [ ] b-PAC Client Component 32-bit 다운로드
- [ ] b-PAC Client Component 설치
- [ ] Brother 프린터 드라이버 설치
- [ ] 프린터 USB 연결
- [ ] DrugLabel 실행 및 테스트

## 참고 사항

- b-PAC Client Component는 무료입니다
- 설치 시 관리자 권한이 필요할 수 있습니다
- Windows 11에서도 정상 작동합니다