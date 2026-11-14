export function lostDirection(x: number): 'left' | 'right' | undefined {
  return x < .35 ? 'left' : x > .65 ? 'right' : undefined;
}

export function phoneEdgeDirection(x: number): 'left' | 'right' | undefined {
  return x < .15 ? 'left' : x > .85 ? 'right' : undefined;
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
