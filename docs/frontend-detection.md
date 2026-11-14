# 브라우저 물체 탐지

- 모델: Google MediaPipe EfficientDet-Lite0 INT8, COCO 80종
- 출처: https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite
- 안내: https://developers.google.com/edge/mediapipe/solutions/vision/object_detector
- `public/mediapipe`의 JS/WASM 파일은 설치한 `@mediapipe/tasks-vision` 패키지에서 복사한 실행 파일입니다. 패키지를 갱신하면 이 파일들도 함께 갱신해야 합니다.

카메라가 켜지면 모델을 자동으로 불러옵니다. 영상은 서버로 전송하지 않고 별도 Web Worker에서 처리합니다. 최대 초당 5회, 긴 변 최대 640픽셀로 추론하며 신뢰도 0.5 이상 결과를 최대 10개 표시합니다. 백그라운드 탭에서는 새 추론을 멈춥니다. 화면을 채우면서 잘린 영상 영역을 반영해 탐지 상자를 배치합니다.

화면 상단에 모델 준비·탐지·오류 상태를, 물체 위에 한국어 이름과 모델 신뢰도를 표시합니다. 신뢰도는 정확도를 보장하는 수치가 아닙니다. 지원 목록 밖 물체, 거리 추정, 음성 명령과 탐지 대상 연결, 서버 탐지와 추적은 아직 구현하지 않았습니다.

## 실행

```powershell
npm.cmd ci
npm.cmd run dev -- --mode https --port 5173
```

모바일에서는 PC와 같은 Wi-Fi의 HTTPS Network 주소로 접속하고 카메라 권한을 허용합니다. 자체 서명 인증서는 기기에 따라 신뢰 설정이 필요합니다.

```powershell
npm.cmd run build
```

실제 Chrome의 Web Worker에서 공개 샘플 이미지의 고양이 2개를 탐지하는 것으로 모델 로드 및 추론을 확인했습니다. 모바일 카메라의 정확도·속도·발열은 실기기 검증이 필요합니다.
