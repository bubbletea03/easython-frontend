# 물건 찾기 API

실행 중인 백엔드의 OpenAPI(`http://127.0.0.1:8000/openapi.json`) 기준으로 연결합니다. 이전 `POST /api/detect` 초안은 사용하지 않습니다.

| API | 요청 | 주요 응답 |
| --- | --- | --- |
| GET /health | 공통 헤더 | status, model_loaded, describe_enabled, device |
| POST /detect | multipart: image, targets(쉼표 목록), conf, imgsz | detections: label, target, score, box{x,y,w,h} |
| POST /parse | JSON: text | intent, object_ko, targets |
| POST /describe | multipart: image, prompt(선택) | result(객체 또는 배열), model 등 |

공통 헤더: X-API-Key, X-Client-Id. 오류: `{ "error": { "code": "...", "message": "...", "detail": null } }`.

앱의 `/api`는 Vite 프록시 접두사이며 백엔드 전송 시 제거합니다. 전체 연동·오류 처리·좌표 처리·검증 내역은 [백엔드 연동 안내](backend-integration.md)에 정리했습니다.
