# 물건 찾기 백엔드 연동

> 이 문서는 최초 로컬 백엔드 연동의 구현 기록이다. 현재 API 계약·설정은 [API 계약](api.md)·[배포 설정](deployment.md)을, 점수·전체 탐지·음성·그립 추정의 최신 동작과 실제 서버 검증은 [리뷰 수정 내역](review-fixes.md)을 따른다. 아래의 0.65·기본 10개 목록·2.5초 만료·맞춤 프롬프트·VITE_API_KEY 설정은 현재 동작이 아니다.

## 확인한 프로젝트와 계약

React 19 + TypeScript + Vite. 적용할 AGENTS.md는 저장소·상위 디렉토리에서 발견되지 않았다. 카메라는 후면 Full HD 요청, 영상은 `object-fit: cover`이며 미러링하지 않는다. 음성 인식은 Web Speech API로 최종 텍스트를 얻고, TTS는 `speechSynthesis` 한국어 음성을 사용한다. 기존 `src/api.ts`는 사용되지 않던 이전 `/api/detect` 계약이므로 교체했다.

실행 중인 `http://127.0.0.1:8000/openapi.json`을 먼저 확인했다. 실제 경로는 `/health`, `/detect`, `/parse`, `/describe`. `/detect`는 `image`, `targets`가 필수이며 `conf` 기본값 0.25, `imgsz` 기본값 640이다. 앱은 기존 표시 기준을 유지하기 위해 **conf=0.65**, imgsz=640을 전송한다. 서버의 대상 개수 제한은 기본 10개이므로 앱 초기 대상은 `cup,bottle,bowl,cell phone,book,remote,key,wallet,person,laptop`으로 제한했다.

## 설정과 실행

`.env.example`을 `.env.local`로 복사하고 다음을 설정한다. 실제 키는 백엔드 `.env`의 API_KEY를 사용한다.

```dotenv
VITE_API_BASE_URL=/api
VITE_API_KEY=실제_API_KEY
API_PROXY_TARGET=http://127.0.0.1:8000
```

VITE_* 값은 브라우저·빌드 결과에서 보이는 **로컬 테스트용** 설정이다. `.env.local`과 `dist`는 Git 제외 대상이다. 운영에서는 프록시 인증 등 별도 키 보호 방식을 사용해야 한다.

```powershell
npm.cmd ci
npm.cmd run dev -- --mode https --port 5173
```

휴대폰에서는 출력된 실제 Network HTTPS 주소로 접속한다. 전화기의 127.0.0.1을 사용하지 않는다. Vite가 PC에서 `/api/health` 등을 `http://127.0.0.1:8000/health`로 전달하므로 HTTPS 페이지에서 HTTP 백엔드로 직접 호출하는 혼합 콘텐츠·CORS 문제를 피한다. `preview`에도 같은 프록시가 적용된다. 설정 변경 시 서버를 다시 시작한다.

별도 백엔드가 있다면 `API_PROXY_TARGET`을 그 실제 주소로 변경한다. 브라우저가 직접 호출하려면 `VITE_API_BASE_URL`을 접근 가능한 실제 HTTPS API 주소로 설정하고 백엔드 CORS에 프론트엔드 출처, X-API-Key·X-Client-Id·Content-Type을 허용한다. Retry-After를 읽으려면 Access-Control-Expose-Headers도 설정해야 한다. 정적 배포에는 Vite 프록시가 포함되지 않으므로 운영 리버스 프록시 또는 직접 API 주소가 필요하다.

## 사용자 흐름

- 시작 시 `/health`에서 status와 model_loaded를 함께 확인한다. 준비되면 **백엔드만 물체 탐지**한다. 손 추적은 기존 로컬 MediaPipe를 재사용한다.
- 확인 중·로딩 중·연결 실패·탐지 오류 시 로컬 물체 탐지로 대체하고 화면에 이유를 표시한다. 로딩은 3초 간격 최대 20회 확인한다. 일반 연결 오류는 최대 3회 확인하고, 401은 즉시 확인을 중단한다. 탐지 중 model_loading은 최대 2회 준비 확인 흐름으로 복귀한다. 그 외 탐지 실패는 자동으로 무한 재시도하지 않으며 **서버 재연결** 버튼으로 복귀한다.
- `/detect`는 이전 요청이 완료된 뒤 다음 프레임을 보내며 요청 시작 간격은 최소 750ms(최대 약 1.33회/초)다. 빈 결과는 정상 미탐지다. 서버 CPU가 느리면 실제 빈도는 더 낮다.
- 마이크 최종 음성 인식 텍스트는 `/parse`로 해석한다. 키보드 입력창·찾기 버튼과 영어 텍스트의 로컬 우회 해석은 제거했다. find/where는 비어 있지 않은 targets를 적용한다. how는 현재 보이는 물체의 설명 요청으로 연결한다. stop은 탐색·요청·안내를 중지한다. unknown·빈 targets는 안내만 하고 기존 탐색을 유지한다. 짧은 명시적 중지 명령은 서버가 없어도 동작한다.
- `/parse` 비활성화는 `/detect`를 중단하지 않는다. describe_enabled는 `/parse` 호출 가능 여부의 판단에 사용하지 않는다.
- **잡는 방법**은 사용자 요청 시 한 번만 `/describe`를 호출한다. 전체 프레임과 선택된 물체·영역을 설명하는 맞춤 프롬프트를 보내므로 컵 전용 기본 프롬프트를 다른 물체에 적용하지 않는다. body.result가 객체인지와 safety/grasp/comment/handle_point 각 필드를 검증한다. 배열·알 수 없는 구조는 임의로 해석하지 않는다. 안전 문장 → 잡는 방법 → 코멘트 순으로 기존 TTS에 연결한다.
- 유효한 handle_point는 주황색으로 최대 2.5초 표시한다. 사진 시점의 추정값이며 대상 변경·탐색 중지 시 제거한다. 실제 그립·접촉·그립 성공을 판정하지 않는다.

## 좌표·중복·취소

캡처는 회전·미러링·영역 자르기 없이 `<video>`가 제공하는 전체 프레임을 JPEG로 만든다. 크기만 비율을 유지해 긴 변 최대 1280px로 축소한다. 서버 정규화 box와 handle_point는 같은 원본 좌표계이므로 기존 `projectBox`·`projectPoint`에서 화면 비율의 잘림을 반영한다. 카메라 미러링을 추가한다면 캡처·표시 변환도 함께 변경해야 한다.

탐지·해석·설명은 AbortController와 세대/선택 ID 검사를 사용한다. 대상 변경·중지·화면 숨김·언마운트 시 요청/루프를 정리하고 늦은 결과를 무시한다. 서버는 취소 전에 이미 시작한 추론을 마칠 수 있지만 결과를 새 대상에 반영하지 않는다. 화면 복귀 시 탐지 루프를 재개한다.

## 오류 정책

모든 API 요청에 X-API-Key와 브라우저별 localStorage UUID X-Client-Id를 포함한다. 공통 클라이언트는 error.code/message/detail을 보존한다. 401은 키 설정 확인, 503은 model_loading/model_error/queue_full/timeout/parse_disabled/describe_disabled를 구분한다. 네트워크·시간 초과는 연결 안내와 로컬 대체로 처리한다. 429는 읽을 수 있는 Retry-After(초 또는 HTTP 날짜)를 기다린 후 **한 번만** 재시도한다. 헤더가 없거나 읽을 수 없으면 2초 대기한다. 대기 중에도 취소할 수 있다.

## 검증 결과와 제약

- `npm.cmd test`: 공통 헤더·UUID, HTTP 200 모델 로딩, multipart, 빈 탐지, 401/429/503, 취소, 구조 검증, 좌표 투영·추적 검사.
- `npm.cmd run build`: TypeScript와 Vite 빌드.
- 실제 인증 `/health`: status=ok, model_loaded=true, CPU, yoloe-26l-seg.pt, describe_enabled=false.
- 공개 고양이 샘플의 실제 `/detect` 업로드: 고양이 2개와 리모컨 2개 반환.
- 실제 `/parse`: parse_disabled(503), 실제 `/describe`: describe_disabled(503). 현재 서버 Gemini 키가 준비되지 않아 두 기능의 실제 성공 응답은 검증하지 못했다.
- Chrome + 390×844 뷰포트에서 샘플 이미지를 카메라 스트림으로 공급해 실제 HTTPS 프록시 탐지와 한국어 이름표 확인. 테스트 응답으로 로딩→준비, 한국어 명령 전환, 중첩 설명·포인트 표시, 중지, 세션 내 요청 직렬화, 네트워크 장애 후 실제 MediaPipe 대체 확인.
- 모바일 실기기 카메라/마이크·자동 TTS 정책·발열·지연 검증은 남아 있다. 로컬 대체 모델은 COCO 80종만 지원하며 사용자 지정 물체를 모두 찾을 수 없다.
