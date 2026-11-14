import type { DetectResult } from './apiCore';
const record = (v: unknown): v is Record<string,unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const colors: Record<string,string> = {black:'검은색',white:'흰색',red:'빨간색',blue:'파란색',green:'초록색',yellow:'노란색',orange:'주황색',purple:'보라색',pink:'분홍색',brown:'갈색',gray:'회색',grey:'회색',silver:'은색',gold:'금색'};
export function colorMismatchText(result: DetectResult, objectKo: string) {
  if (result.detections.length || typeof result.color_filter !== 'string' || !Array.isArray(result.color_rejected) || !result.color_rejected.length) return undefined;
  const wanted = colors[result.color_filter.toLowerCase()];
  if (!wanted) return undefined;
  const rejected = result.color_rejected.find(record);
  const raw = rejected && [rejected.detected_color,rejected.actual_color,rejected.dominant_color,rejected.color].find(v => typeof v === 'string');
  const actual = typeof raw === 'string' ? colors[raw.toLowerCase()] : undefined;
  const object = objectKo || '요청하신 물체';
  const noun=objectKo.replace(/^(검은색?|검정색?|흰색?|하얀색?|빨간색?|파란색?|초록색?|노란색?|주황색?|보라색?|분홍색?|갈색|회색|은색|금색)\s*/,'') || '물체';
  const code = object.charCodeAt(object.length-1);
  const particle = code >= 0xAC00 && code <= 0xD7A3 && (code-0xAC00)%28 !== 0 ? '은' : '는';
  return `${object}${particle} 못 찾았어요. ${actual ? `${actual} ${noun}도 보여요.` : '요청하신 색상과 다른 물체가 있어요.'}`;
}
export function createColorNoticeGate() {
  let candidate: {text:string;since:number} | undefined;
  let lastSpoken = -Infinity;
  return {
    reset() { candidate = undefined; },
    update(text:string|undefined,now:number) {
      if (!text) { candidate=undefined; return undefined; }
      if (candidate?.text !== text) candidate={text,since:now};
      if (now-candidate.since < 3000 || now-lastSpoken < 10000) return undefined;
      lastSpoken=now; return text;
    },
  };
}
