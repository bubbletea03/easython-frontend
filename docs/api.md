# 물건 찾기 API

실행 중인 백엔드의 OpenAPI 기준으로 연결합니다. 브라우저의 `/api` 접두사는 Vite/Vercel 중계에서 제거합니다.

| API | 요청 | 주요 응답 |
| --- | --- | --- |
| GET /health | 공통 헤더 | status, model_loaded, describe_enabled, tts_enabled, device |
| GET /stats | 공통 헤더 | window_sec, queue_length 등 |
| POST /detect | multipart: image, targets(선택, 쉼표 목록), conf=0.25, imgsz=640 | mode, detections, color_filter, color_rejected |
| POST /parse | JSON: text; 제한 시간 15초, 429 자동 재시도 없음 | intent, object_ko, targets |
| POST /describe | multipart: image, target(물체 이름), prompt(대상/손잡이 확인·위험 규칙) | result(객체 또는 배열), model 등 |
| POST /tts | JSON: text; 앱 제한 시간 3초 | 오디오 Blob |

공통 헤더: X-API-Key, X-Client-Id. 권장 중계 방식에서 브라우저는 UUID만 전송하고 중계가 서버 환경변수의 키를 추가합니다. 오류: `{ "error": { "code": "...", "message": "...", "detail": null } }`.

API는 targets 생략 시 mode=all을 지원하지만 앱은 대기 중 탐지하지 않으며 사용자가 지정한 대상만 요청합니다. 서버 결과는 score >= 0.5, 기기 내 결과는 >= 0.35를 사용합니다. 서버의 label은 실제 이름(name), label===target은 정확 일치(exact)로 보존합니다. box{x,y,w,h}는 보낸 이미지 기준 정규화 좌표입니다.

`/describe`는 선택 영역에 각 방향 25% 여백을 더한 이미지와 실제 target 이름을 보냅니다. 지시문은 물체 자체를 확인할 수 없을 때만 confidence=low, 손잡이만 안 보이면 high·handle_point=null·잡는 법 반환을 요구합니다. result.handle_point는 같은 region으로 원본 이미지로 역변환한 뒤 대상 박스 비율로 보관합니다. 박스 밖 여백에 있는 손잡이도 ±25% 범위에서 보관합니다. 자동 좌표 재요청은 응답 완료 후 10초 간격입니다. `hazard`/`safety`를 사용하며, `hazard` 없는 구형 응답도 명확한 위험 문장에 한해 호환합니다.

서버에서 ALLOW_CUSTOM_PROMPT=0이면 기본 prompt.txt에도 같은 confidence·target 규칙을 적용해야 합니다. 최신 변경은 [사용성 수정 내역](usability-fixes.md)에 정리했습니다.
