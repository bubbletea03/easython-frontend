export function lostDirection(x: number): 'left' | 'right' | undefined {
  return x < .35 ? 'left' : x > .65 ? 'right' : undefined;
}

export function phoneEdgeDirection(x: number): 'left' | 'right' | undefined {
  return x < .15 ? 'left' : x > .85 ? 'right' : undefined;
}

// Use the object's center in the visible, cover-cropped camera viewport.
export function gridAlignment(x: number, y: number): 'left' | 'right' | 'up' | 'down' | undefined {
  if (x < 1/3) return 'left';
  if (x > 2/3) return 'right';
  if (y < 1/3) return 'up';
  if (y > 2/3) return 'down';
  return undefined;
}

export function phoneSide(x:number):'left'|'right'|undefined {
  return x<1/3?'left':x>2/3?'right':undefined;
}
export function createPhoneAlignmentGate(){
  let centered=false,revision:number|undefined;
  return {update(x:number,sessionRevision:number){
    if(revision!==sessionRevision){revision=sessionRevision;centered=false;}
    if(centered&&(x<.15||x>.85))centered=false;
    else if(!centered&&x>=1/3&&x<=2/3)centered=true;
    return centered?undefined:x<.5?'left' as const:'right' as const;
  }};
}
export type PhaseNotice={id:number;text:string;phone:boolean};
export function createGuidancePhase(){
  let phase:'aim'|'hand'|'reaim'='aim',revision:number|undefined,notice:PhaseNotice|undefined,sequence=0;
  let centeredSince:number|undefined,handSince:number|undefined;
  return {
    reset(){phase='aim';notice=undefined;centeredSince=handSince=undefined;},
    update(input:{now:number;revision:number;visible:boolean;lost:boolean;centered:boolean;handVisible:boolean;cx:number;enabled:boolean}){
      if(revision!==input.revision){revision=input.revision;phase='aim';notice=undefined;centeredSince=handSince=undefined;}
      if(!input.enabled){centeredSince=handSince=undefined;return {phase,notice};}
      if(input.lost){phase='aim';notice=undefined;centeredSince=handSince=undefined;return {phase,notice};}
      if(input.visible&&input.centered)centeredSince??=input.now;else centeredSince=undefined;
      if(input.visible&&input.handVisible)handSince??=input.now;else handSince=undefined;
      const enterHand=(text:string)=>{phase='hand';notice={id:++sequence,text,phone:false};};
      if(phase==='aim'&&((centeredSince!==undefined&&input.now-centeredSince>=500)||(handSince!==undefined&&input.now-handSince>=500)))enterHand('폰은 그대로 두고, 손만 움직여 주세요.');
      if(phase==='hand'&&input.visible&&(input.cx<.1||input.cx>.9)){
        phase='reaim';notice={id:++sequence,text:`손은 그대로 두고, 폰을 ${input.cx<.5?'왼쪽':'오른쪽'}으로 돌려주세요.`,phone:true};
      }else if(phase==='reaim'&&input.visible&&input.cx>.25&&input.cx<.75)enterHand('다시 손을 안내할게요.');
      return {phase,notice};
    },
  };
}

export function handOccludesTarget(hand: {x:number;y:number} | undefined, target: {x:number;y:number} | undefined, viewport: {width:number;height:number}) {
  return !!hand && !!target && viewport.width > 0 && viewport.height > 0
    && Math.hypot((target.x-hand.x)/viewport.width, (target.y-hand.y)/viewport.height) <= .15;
}

// Keep the cooldown through brief rediscoveries and direction changes.
export function createPhoneLossNoticeGate() {
  let lastSpokenAt = -Infinity;
  let researched = false;
  return {
    reset() { lastSpokenAt = -Infinity; researched = false; },
    update(missingFor: number, side: 'left' | 'right' | undefined, now: number, enabled: boolean, visible: boolean) {
      if (visible) researched = false;
      if (!enabled || missingFor <= 2000) return undefined;
      if (missingFor >= 10000) {
        if (researched) return undefined;
        researched = true; lastSpokenAt = now;
        return '물건을 놓쳤어요. 폰을 천천히 돌려주세요.';
      }
      if (now-lastSpokenAt < 6000) return undefined;
      lastSpokenAt = now;
      return side ? `폰을 천천히 ${side === 'left' ? '왼쪽' : '오른쪽'}으로 돌려주세요.` : '폰을 천천히 돌려주세요.';
    },
  };
}
