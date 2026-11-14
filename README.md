# 손길 · 물건 찾기 프론트엔드

React 19 · TypeScript · Vite 기반 모바일 카메라 앱입니다.

물체 탐지는 백엔드 YOLOE API를 우선 사용하고, 연결·모델 준비·탐지 오류 시 브라우저 MediaPipe로 대체합니다. 손 추적은 브라우저에서 처리합니다. 가장 큰 물체는 초록색, 나머지는 흰색 반투명 영역으로 표시하며 한국어 음성 명령·TTS를 지원합니다.

## 설정과 실행

Vercel 자동 배포는 [배포 설정 안내](docs/deployment.md)를 참고하세요. Vercel의 Git 연동으로 push마다 테스트·빌드·모델 자산을 검사한 뒤 배포합니다. GitHub Actions나 배포 Secrets 없이 Vercel에서 저장소를 연결하면 됩니다.

`.env.example`을 `.env.local`로 복사해 백엔드 `.env`의 API_KEY를 VITE_API_KEY에 설정하세요. 실제 키는 커밋하지 마세요. VITE_* 값은 브라우저에서 보이는 로컬 테스트 설정입니다.

```powershell
npm.cmd ci
npm.cmd run dev -- --mode https --port 5173
```

휴대폰은 PC와 같은 Wi-Fi에서 출력되는 Network HTTPS 주소로 접속합니다. 기본 `/api` 프록시는 PC의 `http://127.0.0.1:8000`에 연결하므로 휴대폰의 루프백 주소를 사용하지 않습니다.

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run preview -- --mode https --port 4173
```

## 사용

- 시작하면 서버 준비 상태를 확인하고 물체를 찾습니다. 기본 대상은 컵·병·보울·휴대폰·책·리모컨·열쇠·지갑·사람·노트북입니다.
- 마이크로 “컵 찾아줘”처럼 명령합니다. 최종 음성 인식 텍스트는 서버 `/parse`로 보내 해석하고, 응답의 targets를 탐색에 적용합니다. 명령 해석이 비활성화되면 오류를 안내하고 기존 탐색을 유지합니다.
- “어떻게 잡아?” 또는 **잡는 방법**은 선택한 물체의 `/describe` 설명과 추정 위치를 요청합니다. 서버 설정에 따라 비활성화될 수 있습니다.
- **탐색 중지**, **다시 탐색**, **서버 재연결**로 흐름을 제어합니다.

[API 연동·설정·검증 상세](docs/backend-integration.md) · [API 계약](docs/api.md) · [로컬 MediaPipe](docs/frontend-detection.md)

자동 TTS는 브라우저 정책에 따라 사용자 조작이 필요할 수 있습니다. 실제 거리·접촉·그립 성공 판정은 구현하지 않습니다. 물체 탐지가 서버 모드일 때 사진이 백엔드로 전송되며, 명령 해석·설명은 백엔드에서 외부 모델을 사용할 수 있습니다.
