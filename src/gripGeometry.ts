import type { Point, Rect } from './sceneGeometry';
export function relativeHandlePoint(point: Point, box: Rect, margin = 0) {
  if (box.width <= 0 || box.height <= 0) return undefined;
  const u = (point.x - box.x) / box.width, v = (point.y - box.y) / box.height;
  return [u,v].every(n => Number.isFinite(n) && n >= -margin && n <= 1+margin) ? {u,v} : undefined;
}
export function followHandlePoint(point: {u:number;v:number}, box: Rect): Point {
  return {x:box.x + point.u * box.width, y:box.y + point.v * box.height};
}

export const SHARP_LABELS=new Set(['knife','scissors','razor','nail clipper','nail clippers','칼','가위','면도기','손톱깎이']);
export function bladeZone(box:Rect,handle:Point):Rect {
  if(box.width>=box.height)return {x:handle.x<box.x+box.width/2?box.x+box.width/2:box.x,y:box.y,width:box.width/2,height:box.height};
  return {x:box.x,y:handle.y<box.y+box.height/2?box.y+box.height/2:box.y,width:box.width,height:box.height/2};
}
export function createBladeWarningGate(){
  let target:number|undefined,since:number|undefined,lastWarning=-Infinity;
  return {
    update(id:number|undefined,zone:Rect|undefined,fingers:Point[],now:number,enabled:boolean){
      if(id!==target){target=id;since=undefined;lastWarning=-Infinity;}
      const inside=enabled&&zone&&fingers.some(p=>p.x>=zone.x-zone.width*.1&&p.x<=zone.x+zone.width*1.1&&p.y>=zone.y-zone.height*.1&&p.y<=zone.y+zone.height*1.1);
      if(!inside){since=undefined;return {danger:false,announce:false};}
      since??=now;
      const danger=now-since>=300,announce=danger&&now-lastWarning>=4000;
      if(announce)lastWarning=now;
      return {danger,announce};
    },
  };
}
// A screen-overlap heuristic, not a measurement of real physical contact.
export function createGripSuccessGate() {
  let candidate: {id:number;since:number} | undefined;
  return {
    reset() { candidate = undefined; },
    update(id: number | undefined, box: Rect | undefined, fingers: {thumb:Point;index:Point} | undefined, now: number, enabled: boolean) {
      const inside = (p:Point) => !!box && p.x >= box.x - box.width*.1 && p.x <= box.x + box.width*1.1
        && p.y >= box.y-box.height*.1 && p.y <= box.y+box.height*1.1;
      if (!enabled || id === undefined || !fingers || !inside(fingers.thumb) || !inside(fingers.index)) { candidate = undefined; return false; }
      if (candidate?.id !== id) candidate = {id,since:now};
      return now-candidate.since >= 1000;
    },
  };
}
