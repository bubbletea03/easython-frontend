# 손길 · 물건 찾기 프론트엔드

React 19 · TypeScript · Vite 기반 모바일 카메라 앱입니다.

현재 화면은 [시안 1 · 상태 테두리](docs/status-frame-ui.md)를 적용합니다. 메인 물체는 초록 모서리와 20% 초록 배경, 나머지는 20% 흰 배경으로 표시하며 물체 박스에는 라벨을 붙이지 않습니다. 개발 컨트롤은 `#dev`에서만 표시합니다. 최신 수정 사항은 [리뷰 수정 내역](docs/review-fixes.md)을 참고하세요.

물체 탐지는 백엔드 YOLOE API를 우선 사용하고, 연결·모델 준비·탐지 오류 시 브라우저 MediaPipe로 대체합니다. 손 추적은 브라우저에서 처리합니다. 음성은 고정 녹음 → 서버 TTS → 브라우저 음성 순서로 대체합니다.

## 설정과 실행

Vercel 자동 배포는 [배포 설정 안내](docs/deployment.md)를 참고하세요. Vercel의 Git 연동으로 push마다 테스트·빌드·모델 자산을 검사한 뒤 배포합니다. GitHub Actions나 배포 Secrets 없이 Vercel에서 저장소를 연결하면 됩니다.

`.env.example`을 `.env.local`로 복사해 실제 백엔드 주소를 `BACKEND_API_URL`, 백엔드 API_KEY를 `BACKEND_API_KEY`에 설정하세요. `VITE_API_BASE_URL=/api`를 사용하면 키를 브라우저 번들에 넣지 않고 Vite/Vercel 서버에서 요청에 추가합니다. 실제 키는 커밋하지 마세요.

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

- 시작을 누르면 대상 목록 없이 전체 탐지를 시작합니다. 이 모드에서는 박스만 표시하고 발견·손 안내 음성을 내지 않습니다. 마이크로 찾을 물체를 말씀하면 해당 물체의 음성 탐색으로 전환합니다.
- 마이크로 “컵 찾아줘”처럼 명령합니다. 최종 음성 인식 텍스트는 서버 `/parse`로 보내 해석하고, 응답의 targets를 탐색에 적용합니다. 명령 해석에 실패하면 오류를 안내합니다.
- 탐색 중 같은 물체가 3초간 인식되거나 “어떻게 잡아?”라고 말하면 `/describe`를 요청합니다. 선택 영역을 잘라 보내 서버 기본 프롬프트를 사용하고, 추정 위치는 박스 비율로 저장해 물체 이동·크기를 따라갑니다.
- 좌상단 **그만**은 대기로 돌아갑니다. 엄지·검지가 사방 10% 확장된 물체 박스 안에 1초 머물거나 “잡았어요”라고 확인하면 완료 화면을 표시합니다. 자동 판정은 화면 좌표 기준 추정입니다. 완료 후 손이 사라지거나 카메라 화면을 터치하면 전체 탐지를 재개합니다. 서버 재연결은 개발 화면(`#dev`)에서 사용할 수 있습니다.

[API 연동·설정·검증 상세](docs/backend-integration.md) · [API 계약](docs/api.md) · [로컬 MediaPipe](docs/frontend-detection.md)

자동 TTS는 브라우저 정책에 따라 사용자 조작이 필요할 수 있습니다. 실제 거리·접촉은 측정하지 않습니다. 사진은 긴 변 640px·JPEG 품질 0.7로 전송하며, 명령 해석·설명은 백엔드에서 외부 모델을 사용할 수 있습니다.
