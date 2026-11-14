import type { DetectionTrack } from './detectionTracks';
import type { Rect } from './sceneGeometry';

export type VisibleTarget = {item:DetectionTrack;rect:Rect};
export function compareTargets(a: VisibleTarget, b: VisibleTarget) {
  return Number(!!b.item.exact)-Number(!!a.item.exact) || b.item.score-a.item.score
    || b.rect.width*b.rect.height-a.rect.width*a.rect.height;
}

export function createTargetLock() {
  let locked: {target:VisibleTarget;x:number;y:number;missingSince?:number} | undefined;
  let revision: number | undefined;
  let forced: number | undefined;
  return {
    choose(id: number) { forced = id; },
    update(visible:VisibleTarget[], now:number, viewport:{width:number;height:number}, sessionRevision:number) {
      if (sessionRevision !== revision) { revision = sessionRevision; locked = undefined; forced = undefined; }
      const current = visible.filter(v=>!v.item.missing);
      const center = (v:VisibleTarget) => ({x:(v.rect.x+v.rect.width/2)/viewport.width,y:(v.rect.y+v.rect.height/2)/viewport.height});
      let primary = forced === undefined ? undefined : current.find(v=>v.item.id===forced);
      forced = undefined;
      primary ??= locked && current.find(v=>v.item.id===locked!.target.item.id);
      if (!primary && locked) {
        const previous = locked;
        primary = current.filter(v=>v.item.label===previous.target.item.label).map(v=>({v,d:Math.hypot(center(v).x-previous.x,center(v).y-previous.y)}))
          .filter(v=>v.d<=.15).sort((a,b)=>a.d-b.d)[0]?.v;
        previous.missingSince ??= now;
      }
      if (!primary && (!locked || now-locked.missingSince! > 1000)) primary = [...current].sort(compareTargets)[0];
      if (primary) { locked = {target:primary,...center(primary)}; return primary; }
      // Bridge a short gap without jumping to a different visible object.
      if (locked && now-locked.target.item.lastSeen < 2000) {
        const retained = visible.find(v=>v.item.id===locked!.target.item.id) ?? locked.target;
        return {...retained,item:{...retained.item,missing:true}};
      }
      return undefined;
    },
  };
}

export function createTargetChoiceGate() {
  let revision: number | undefined, candidateKey = '', since = 0, asked = false;
  let pending: {left:VisibleTarget;right:VisibleTarget;deadline:number} | undefined;
  const side = (target:VisibleTarget) => target.item.id === pending?.left.item.id ? '왼쪽' : '오른쪽';
  return {
    startDeadline(now:number) { if (pending) pending.deadline = now+5000; },
    answer(text:string,current:VisibleTarget[]) {
      if (!pending) return undefined;
      const clean = text.replace(/[.!?\s]/g,'');
      const wanted = /^(왼쪽|첫번째)(것|거|걸로|으로|이요|요)?$/.test(clean) ? pending.left
        : /^(오른쪽|두번째)(것|거|걸로|으로|이요|요)?$/.test(clean) ? pending.right : undefined;
      const target = wanted && current.find(v=>v.item.id===wanted.item.id && !v.item.missing);
      if (!target) return undefined;
      const result = {type:'choose' as const,target,side:side(target)};
      pending = undefined; return result;
    },
    update(current:VisibleTarget[],now:number,sessionRevision:number,enabled:boolean) {
      if (revision !== sessionRevision) {revision=sessionRevision;candidateKey='';asked=false;pending=undefined;}
      if (!enabled) return undefined;
      if (pending) {
        if (now<pending.deadline) return undefined;
        const available = current.filter(v=>!v.item.missing && [pending!.left.item.id,pending!.right.item.id].includes(v.item.id));
        const target = available.sort((a,b)=>b.rect.width*b.rect.height-a.rect.width*a.rect.height)[0];
        const result = target ? {type:'choose' as const,target,side:side(target)} : {type:'dismiss' as const};
        pending = undefined; return result;
      }
      if (asked) return undefined;
      const exact = current.filter(v=>!v.item.missing && v.item.exact).sort(compareTargets).slice(0,2);
      if (exact.length<2 || Math.abs(exact[0].item.score-exact[1].item.score)>=.15) {candidateKey='';return undefined;}
      const key=exact.map(v=>v.item.id).sort().join(',');
      if (key!==candidateKey) {candidateKey=key;since=now;return undefined;}
      if (now-since<1000) return undefined;
      exact.sort((a,b)=>a.rect.x+a.rect.width/2-b.rect.x-b.rect.width/2);
      pending={left:exact[0],right:exact[1],deadline:Infinity};asked=true;
      return {type:'ask' as const};
    },
  };
}
