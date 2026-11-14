# Vercel Git 자동 배포

GitHub Actions 없이 Vercel이 GitHub 저장소를 직접 빌드·배포합니다.

## 배포 흐름

GitHub push → Vercel → npm ci → npm test → npm run build → 모델/WASM 자산 검사 → 배포.

`vercel.json`에 Git 자동 배포와 빌드 명령을 설정했습니다.

```sh
npm test && npm run build && node scripts/check-build.mjs
```

어느 단계든 실패하면 새 배포는 게시되지 않습니다. Vercel 프로젝트의 Production Branch를 `main`으로 설정하면 main은 운영 배포, 나머지 브랜치/PR은 Vercel의 미리보기 배포를 사용합니다. 이전 GitHub Actions 워크플로는 제거했으며 VERCEL_TOKEN·VERCEL_ORG_ID·VERCEL_PROJECT_ID Secrets는 필요하지 않습니다.

## 최초 계정·저장소 연결

1. Codex의 Vercel 플러그인을 설치하고 Vercel 계정에 로그인합니다. 설치·로그인은 사용자 계정 인증이 필요한 단계입니다.
2. 연결된 Vercel에서 기존 프로젝트가 있는지 확인하고, 없다면 GitHub 저장소 `bubbletea03/easython-frontend`를 연결해 프로젝트를 만듭니다. GitHub 앱에 해당 저장소 접근 권한을 허용해야 할 수 있습니다.
3. Root Directory: 저장소 루트, Framework: Vite, Node.js: 24.x, Production Branch: main을 사용합니다. 빌드·설치 명령과 출력 폴더(dist)는 vercel.json을 따릅니다.
4. 로컬 변경을 GitHub에 반영합니다. Vercel은 로컬 작업 폴더가 아니라 push된 커밋을 배포합니다.
5. 배포 결과와 실제 HTTPS 주소는 Vercel 프로젝트의 Deployments에서 확인합니다.

Codex 계정 연동 대신 Vercel 대시보드의 Add New → Project → Import Git Repository에서 직접 같은 저장소를 연결해도 됩니다. Vercel Git 연결 자체에 GitHub Actions 토큰을 등록할 필요는 없습니다.

## 환경변수와 백엔드

`.env.local`과 `.vercel`은 Git에서 제외되고, `.vercelignore`도 로컬 환경변수 업로드를 제외합니다. 테스트 파일은 Vercel에서 npm test를 실행해야 하므로 업로드 대상에 포함합니다.

Vercel에 배포된 화면에서는 노트북의 `http://127.0.0.1:8000` 백엔드에 접근할 수 없습니다. Vite의 `/api` 프록시도 배포되지 않습니다. 외부 API 연결을 준비하지 않은 경우 MediaPipe 로컬 대체 인식만 사용할 수 있습니다.

공개 백엔드를 준비한 뒤 Vercel 환경변수의 VITE_API_BASE_URL에 실제 HTTPS 주소를 설정하고 서버 CORS를 허용해야 합니다. 현재 VITE_API_KEY는 브라우저에 노출되는 로컬 테스트 설정이므로 실제 로컬 키를 공개 배포에 넣지 마세요. 운영 인증 프록시나 공개 클라이언트 인증 체계는 별도 작업입니다. 존재하지 않는 백엔드 주소나 임의의 키는 설정하지 않았습니다.

## 로컬 검증

```powershell
npm.cmd test
npm.cmd run build
node scripts/check-build.mjs
```

모델 2개, WASM, 워커와 HTML 참조 번들이 출력에 포함되는지 확인합니다. 배포 후 실제 URL에서 카메라·마이크와 모델 로드를 확인하세요. 자동 TTS 재생은 기기 정책에 따라 사용자 조작이 필요할 수 있습니다.

현재 계정 연결을 확인하지 못한 상태에서는 프로젝트 생성·저장소 연결·실제 배포 완료로 보고하지 않습니다.
