# Chrome Capture

Chrome Recorder와 Video Capture를 하나로 합친 Mac·Windows 공용 Chrome 확장 프로그램입니다. Chrome 126 이상이 필요합니다.

## 다운로드와 설치

비공개 저장소에 로그인한 뒤 Releases에서 내려받으세요.

- `Mac_Chrome_Capture.zip`
- `Win_Chrome_Capture.zip`

두 ZIP의 최상위 폴더는 **Chrome Capture**입니다. 빠른 설치 순서는 `Getting Started.txt`, 자세한 사용법은 `User Guide.md`에 있습니다.

1. ZIP을 원하는 위치에 풉니다. 설치 후 확장 폴더를 옮기거나 삭제하지 마세요.
2. Mac은 `install.command`, Windows는 `install.cmd`를 실행합니다. Mac에는 기존 Video Capture와 마찬가지로 Node.js가 필요합니다. Windows에는 별도 Python·Node.js가 필요 없습니다.
3. `chrome://extensions`에서 개발자 모드를 켜고 **압축해제된 확장 프로그램을 로드**를 누릅니다.
4. `Chrome Capture/chrome-extension` 폴더를 선택합니다.
5. 아이콘을 툴바에 고정합니다. 설정에서 **공통 저장 폴더**를 한 번 선택합니다.
6. 이전 두 확장 프로그램은 비활성화해 단축키 충돌을 피하세요. 기존 저장소와 기존 설치 도우미는 통합판이 수정·삭제하지 않습니다.

## 기능

팝업에서 오디오 녹음 / 화면 캡처 탭을 선택합니다.

| 항목 | 오디오 녹음 | 화면 캡처 |
|---|---|---|
| 저장 형식 | MP3 고정, 스테레오 192kbps | PNG 고정 |
| 시간 | 3초 / 5초, 최초 기본값 5초 | 지연 0초 / 1초 / 3초 / 5초 |
| Mac 단축키 | Command + Shift + 7 | Command + Shift + 0 |
| Windows 단축키 | Alt + Shift + 7 | Alt + Shift + 0 |
| 파일명 예 | 261005_1939.mp3 | 261005_1939.png |

파일명은 컴퓨터의 현재 시각을 기준으로 **`yymmdd_hhmm`** 형식으로 생성합니다. 연도는 두 자리이며 초는 포함하지 않습니다. 예: `261005_1939.png`, `261005_1939.mp3`. 같은 분에 다시 저장하면 `261005_1939_1.png`, `261005_1939_2.png`처럼 번호를 붙여 기존 파일을 보존합니다.

두 형식은 **동일한 지정 폴더**에 저장됩니다. 기본값은 바탕화면의 `Capture` 폴더입니다. 선택한 녹음 길이와 화면 캡처 설정은 기억합니다.

- 현재 탭의 소리만 녹음합니다. 마이크를 사용하지 않으며 녹음 중에도 원래 소리가 들립니다. 팝업을 닫아도 자동 종료·저장은 계속됩니다. 취소하면 파일을 저장하지 않습니다.
- MP3는 녹음한 PCM을 실제 MP3로 인코딩합니다. 코덱 프레임 때문에 길이는 미세한 차이가 있을 수 있습니다.
- 화면 캡처는 한 장의 이미지이며 영상 파일 녹화 기능은 아닙니다. 영상 영역 자동 크롭과 자막·컨트롤 숨김 설정을 유지했습니다. 영상 프레임에 원래 포함된 자막·로고는 제거할 수 없습니다.
- 공통 폴더 저장에 실패하면 오디오는 기존 방식처럼 다운로드 / Chrome Capture에 대신 저장하고 사유를 표시합니다. 화면 캡처는 저장 도우미 연결 오류를 표시합니다.
- Chrome 내부 페이지와 DRM 보호 미디어는 캡처가 제한될 수 있습니다.
- 단축키가 비어 있으면 `chrome://extensions/shortcuts`에서 등록하세요.

## 제거

Mac은 `uninstall.command`, Windows는 `uninstall.cmd`를 실행하면 저장 도우미가 제거됩니다. Chrome 확장 프로그램은 `chrome://extensions`에서 별도로 제거합니다. 저장한 MP3·PNG 파일은 삭제하지 않습니다.

## 데이터와 검사

데이터 처리는 기기 안에서 수행합니다. 외부 서버나 분석 서비스로 녹음·캡처를 전송하지 않습니다.

새 저장 도우미 식별자는 `com.ssubong.chrome_capture`이며 이전 Video Capture 도우미와 별도입니다. 통합판의 공통 폴더는 한 번 다시 선택합니다.

`npm test`: 3/5초 MP3 인코딩, 녹음 수명주기·취소·중복 차단, 공통 폴더의 MP3/PNG 저장, 충돌 시 파일 보존, 녹음 상태 배지 검사.

`npm run test:browser`: 개인 프로필이 아닌 임시 Chromium 프로필에서 실제 Manifest V3 로드, UI, PNG 크롭과 오버레이 복원, 메시지 충돌, 단축키 설정 표시 검사. GitHub에서는 Mac·Windows 설치 도우미와 Windows C# 실행 파일도 검사합니다. 검증은 합성 데이터만 사용합니다.

MP3 인코더의 LGPL 라이선스와 소스는 `chrome-extension/recorder/vendor`에 포함됩니다.
