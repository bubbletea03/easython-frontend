# 물체 탐지 API 초안

백엔드 담당자와 합의 전인 프론트엔드 통신 계약입니다.

`POST /api/detect` — `multipart/form-data`

| 필드 | 형식 | 설명 |
| --- | --- | --- |
| image | file | JPEG·PNG·WebP, 최대 8MB |
| target | string | `cup`, `bottle`, `cell phone`, `book`, `remote` 중 하나 |

응답 예시 (설명을 위한 데이터이며 실제 탐지 결과가 아님):

```json
{
  "mode": "live",
  "target": "cup",
  "found": true,
  "detections": [
    { "label": "cup", "confidence": 0.92, "bbox": [0.2, 0.3, 0.6, 0.8] }
  ],
  "message": "컵이 화면 왼쪽에 있습니다."
}
```

`bbox`는 원본 이미지 기준 0~1로 정규화한 `[x_min, y_min, x_max, y_max]`입니다.
`found`는 요청한 물건의 탐지 여부입니다. 미탐지는 `false`와 빈 `detections`를 반환합니다.
연결 확인용 서버는 `mode: "demo"`, `found: null`, `detections: []`를 반환하고 실제 탐지처럼 안내하지 않아야 합니다.
프론트엔드는 demo 응답에 연결 확인 모드라는 음성 안내를 덧붙입니다.

오류는 적절한 비정상 HTTP 상태와 `{ "detail": "사용자에게 안내할 오류 메시지" }`를 반환합니다.
권장 상태: 413(크기 초과), 415(이미지 형식 오류), 422(요청 오류), 503(탐지 모델 사용 불가).
백엔드에서는 파일 내용·크기·이미지 디코딩을 다시 검증하고 사진 보관 정책을 명시해야 합니다.
