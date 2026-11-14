# 손길 · 물건 찾기 프론트엔드

React 19 · TypeScript · Vite 기반 모바일 카메라 웹 앱



- 물체 탐지는 백엔드 YOLOE API를 우선 사용
- 백엔드 연결 실패 시 브라우저의 Google MediaPipe 기술로 대체
- 손 추적은 브라우저에서 처리
- 음성은 고정 녹음 → 서버 TTS → 브라우저 음성
