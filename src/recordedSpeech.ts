const fixed: Record<string,string> = {
  '준비됐어요. 말하기 버튼을 누르고 찾을 물건을 말씀해 주세요.':'ready',
  '탐색과 안내를 중지했습니다.':'stopped','잡으셨어요.':'grabbed',
  '안내를 멈췄어요.':'stopped', '명령을 이해하고 있어요.':'wait', '잡는 방법을 확인하고 있어요.':'grasp_checking',
  '먼저 물체를 카메라에 비춰 주세요.':'grasp_need_view',
  '서버의 설명 기능이 비활성화되어 있습니다. 물체 탐지는 계속합니다.':'grasp_unavailable',
  '아직 이해하지 못했어요. 다른 이름으로 말씀해 주세요.':'unknown_object',
  '찾을 물체를 이해하지 못했어요. 다른 이름으로 말씀해 주세요.':'unknown_object',
  '이 브라우저에서는 음성 인식을 지원하지 않습니다.':'no_stt',
  '마이크 권한을 허용한 뒤 다시 눌러 주세요.':'stt_not_allowed',
  '음성이 들리지 않았어요. 다시 눌러 말씀해 주세요.':'stt_no_speech',
  '음성이 들리지 않았어요. 다시 말씀해 주세요.':'stt_no_speech',
  '음성 인식을 사용할 수 없습니다. 마이크와 네트워크를 확인해 주세요.':'stt_network',
  '음성 인식을 시작하지 못했습니다. 다시 눌러 주세요.':'stt_start_failed',
  '왼쪽으로 이동하세요.':'move_left','오른쪽으로 이동하세요.':'move_right',
  '앞으로 이동하세요.':'move_forward','뒤로 이동하세요.':'move_back',
  '화면에서 겹쳐 있어요.':'reached',
};
const objectIds:Record<string,string>={'컵':'cup','머그':'mug','텀블러':'tumbler','물병':'water_bottle','약병':'pill_bottle','리모컨':'remote_control','휴대폰':'cell_phone','열쇠':'keys','안경':'glasses','지갑':'wallet','노트북':'laptop','마우스':'mouse','키보드':'keyboard','충전기':'charger','이어폰':'earphones','가방':'bag','책':'book','펜':'pen','가위':'scissors','숟가락':'spoon','그릇':'bowl','휴지':'tissue_box','시계':'watch'};
export function foundRecordingId(label:string) {return objectIds[label] ? `found_${objectIds[label]}` : undefined;}
export function findRecordingId(label:string) {return objectIds[label] ? `find_${objectIds[label]}` : undefined;}
let manifest:Promise<Record<string,number>>|undefined;
const clips = new Map<string, Blob>();
async function fetchAsset(path:string,signal?:AbortSignal) {
  const timeout=new AbortController(); const abort=()=>timeout.abort();
  signal?.throwIfAborted(); signal?.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>timeout.abort(),1000);
  try {const response=await fetch(import.meta.env.BASE_URL+'audio/'+path,{signal:timeout.signal});if(!response.ok)throw new Error('Recording unavailable');return response;}
  finally {clearTimeout(timer);signal?.removeEventListener('abort',abort);}
}
export async function loadRecording(text:string,id:string|undefined,signal:AbortSignal) {
  const key=id||fixed[text]; if(!key || !/^[a-z0-9_]+$/.test(key))return undefined;
  signal.throwIfAborted();
  if (clips.has(key)) return clips.get(key);
  manifest ??= fetchAsset('manifest.json').then(r=>r.json()).catch(()=>{manifest=undefined;return {};});
  const count=(await manifest)[key];signal.throwIfAborted();
  if(!Number.isInteger(count)||count<1||count>50)return undefined;
  const response=await fetchAsset(`${key}_${1+Math.floor(Math.random()*count)}.mp3`,signal);
  const blob=await response.blob();
  signal.throwIfAborted();
  if (!blob.type.startsWith('audio/') || !blob.size) return undefined;
  if (clips.size >= 64) clips.delete(clips.keys().next().value!);
  clips.set(key, blob); return blob;
}

export async function preloadRecordings(signal: AbortSignal, ids = ['ready','stopped','move_left','move_right','move_forward','move_back','reach_out','turn_phone','search_hint','lost_turn_left','lost_turn_right','lost_research','wait']) {
  const remaining = [...ids];
  await Promise.all(Array.from({length:3}, async () => {
    while (remaining.length && !signal.aborted) {
      const id = remaining.shift()!;
      await loadRecording('',id,signal).catch(() => undefined);
    }
  }));
}
