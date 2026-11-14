export type SceneState = 'idle' | 'listening' | 'processing' | 'searching' | 'found' | 'guiding' | 'lost' | 'unknown' | 'warning' | 'done' | 'error';
export type SceneUI = { state: SceneState; status: string; title: string; detail?: string; direction?: 'left' | 'right' | 'up' | 'down'; lostSide?: 'left' | 'right' };

export function screenDirection(dx: number, dy: number) {
  if (Math.abs(dx) <= 12 && Math.abs(dy) <= 12) return undefined;
  return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}
export const directionText = { left: '왼쪽으로', right: '오른쪽으로', up: '위쪽으로', down: '아래쪽으로' };
export const handDirectionText = { left: '왼쪽으로', right: '오른쪽으로', up: '앞으로', down: '몸 쪽으로' };

export function deriveScene(input: { listening: boolean; busy: boolean; running: boolean; cameraReady: boolean;
  cameraError: boolean; message: string; safety?: string; outcome: 'idle' | 'searching' | 'unknown' | 'done';
  targetLabel: string; found: boolean; lost: boolean; lostSide?: 'left' | 'right'; guiding: boolean;
  direction?: SceneUI['direction']; centered?: boolean; handPhase?:boolean;waitingHandle?:boolean; timedOut: boolean }): SceneUI {
  if (input.cameraError) return { state: 'error', status: '카메라 확인', title: '카메라를 확인해 주세요', detail: input.message };
  if (input.listening) return { state: 'listening', status: '듣고 있어요', title: '편하게 말씀해 주세요' };
  if (input.safety) return { state: 'warning', status: '조심하세요', title: '조심하세요', detail: input.safety };
  if (input.busy) return { state: 'processing', status: '확인하고 있어요', title: '잠시만 기다려 주세요' };
  if (input.outcome === 'done') return { state: 'done', status: '잡기 확인', title: '잡으셨군요', detail: '안내를 마칠게요.' };
  if (input.outcome === 'unknown') return { state: 'unknown', status: '다시 말씀해 주세요', title: '다시 말씀해 주세요', detail: input.message || '다른 이름으로 말해 보세요' };
  if (!input.cameraReady) return { state: 'processing', status: '준비하고 있어요', title: '카메라를 준비하고 있어요' };
  if (!input.running) return { state: 'idle', status: '준비됐어요', title: '누르고 말하세요' };
  if (input.lost) return { state: 'lost', status: '놓쳤어요', title: input.lostSide ? `폰을 천천히 ${input.lostSide === 'left' ? '왼쪽' : '오른쪽'}으로 돌려주세요` : '폰을 천천히 돌려주세요', lostSide: input.lostSide };
  if(input.found&&input.waitingHandle)return {state:'found',status:'손잡이 확인 중',title:'손잡이를 확인하고 있어요',detail:'손을 잠시 멈춰 주세요.'};
  if (input.found && input.guiding && (input.handPhase ?? input.centered !== false)) return { state: 'guiding', status: '손 안내 중', title: input.direction ? handDirectionText[input.direction] : '거기예요', direction: input.direction, detail: input.direction ? undefined : '아직 닿지 않았다면 손을 조금 더 뻗어 보세요.' };
  if (input.found && !(input.handPhase ?? input.centered !== false)) return { state: 'found', status: '가운데로 맞춰 주세요', title: input.direction==='left'||input.direction==='right' ? `폰을 조금 ${directionText[input.direction]} 돌려주세요` : '폰은 그대로 두고 손을 화면에 넣어 주세요', direction: input.direction==='left'||input.direction==='right'?input.direction:undefined };
  if(input.found&&input.handPhase)return {state:'found',status:'손을 보여 주세요',title:'폰은 그대로 두세요',detail:'손을 화면에 넣어 주세요.'};
  if (input.found) return { state: 'found', status: `${input.targetLabel} 찾았어요`, title: '물건이 가운데에 있어요', detail: '이제 손을 뻗어 주세요' };
  return { state: 'searching', status: `${input.targetLabel || '물건'} 찾는 중`, title: input.timedOut ? '주변에서 찾지 못했어요' : '폰을 천천히 돌려주세요', detail: input.timedOut ? '다른 방향을 비춰 보세요' : undefined };
}
