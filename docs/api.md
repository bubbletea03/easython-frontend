# 물건 찾기 API

실행 중인 백엔드의 OpenAPI 기준으로 연결합니다. 브라우저의 `/api` 접두사는 Vite/Vercel 중계에서 제거합니다.

| API | 요청 | 주요 응답 |
| --- | --- | --- |
| GET /health | 공통 헤더 | status, model_loaded, describe_enabled, tts_enabled, device |
| GET /stats | 공통 헤더 | window_sec, queue_length 등 |
| POST /detect | multipart: image, targets(선택, 쉼표 목록), conf=0.25, imgsz=640 | mode, detections, color_filter, color_rejected |
| POST /parse | JSON: text | intent, object_ko, targets |
| POST /describe | multipart: image; 앱은 prompt 생략 | result(객체 또는 배열), model 등 |
| POST /tts | JSON: text; 앱 제한 시간 3초 | 오디오 Blob |

공통 헤더: X-API-Key, X-Client-Id. 권장 중계 방식에서 브라우저는 UUID만 전송하고 중계가 서버 환경변수의 키를 추가합니다. 오류: `{ "error": { "code": "...", "message": "...", "detail": null } }`.

targets 생략 시 mode=all이며 물체 발견 음성은 내지 않습니다. 표시는 score >= 0.35인 결과를 사용합니다. box{x,y,w,h}는 보낸 이미지 기준 정규화 좌표입니다. `/describe`는 선택 영역 캡처를 보내므로 result.handle_point를 원본 이미지로 역변환한 뒤 대상 박스 비율로 보관합니다. 최신 연동·좌표 처리·검증 내역은 [리뷰 수정 내역](review-fixes.md)에 정리했습니다.
