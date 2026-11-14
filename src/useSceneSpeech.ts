import { useEffect, useRef } from 'react';
import { isPrioritySpeaking, isSpeechPaused, speak, cancelGuidance } from './speech';
import { vibrate, phoneCue } from './audioFeedback';
import type { PhaseNotice } from './phoneGuidance';
import { foundRecordingId } from './recordedSpeech';

export function useSceneSpeech(target: { id: number; label: string } | undefined, guidance: string, listening: boolean, revision: number, lost: boolean, detail?: string, phone = false, reach = true, graspAligned = false, clipId?: string, graspTip?: string,phaseNotice?:PhaseNotice) {
  const latest = useRef({ target, guidance, listening, lost, detail, phone, reach, graspAligned, clipId, graspTip,phaseNotice });
  latest.current = { target, guidance, listening, lost, detail, phone, reach, graspAligned, clipId, graspTip,phaseNotice };
  useEffect(() => {
    let announced = false, announcing = false, felt = false;
    let visibleSince: number | undefined;
    let candidate = '', candidateSince = 0, lastText = '', lastSpokenAt = -Infinity;
    let lastPhoneAt = -Infinity;
    let reachAnnounced = false, reaching = false;
    let graspAnnounced = false, graspSpeaking = false;
    let alignedAnnounced=false,alignedFelt=false;
    const phaseSpoken=new Set<number>();
    let previousReach = latest.current.reach;
    let reachSince: number | undefined;
    const spokenAt = new Map<string, number>();
    const timer = window.setInterval(() => {
      const { target: current, guidance: text, listening: paused, lost: missing, detail: extra, phone: isPhone, reach: canReach } = latest.current;
      const now = performance.now();
      if (isSpeechPaused()) return;
      if (previousReach && !canReach) cancelGuidance();
      previousReach = canReach;
      if (missing) { announced = false; felt = false; reachAnnounced = false; lastText = ''; spokenAt.clear(); }
      if (!canReach || !current || paused) reachSince = undefined;
      else reachSince ??= now;
      if (!current || document.hidden || paused) {
        visibleSince = undefined; candidate = ''; cancelGuidance(); return;
      }
      visibleSince ??= now;
      if (candidate !== text) { candidate = text; candidateSince = now; }
      if (now - visibleSince < 1000 || announcing) return;
      if (!announced) {
        if (!felt) { vibrate(200); felt = true; }
        const code = current.label.charCodeAt(current.label.length - 1);
        const particle = code >= 0xAC00 && code <= 0xD7A3 && (code - 0xAC00) % 28 !== 0 ? '을' : '를';
        announcing = true;
        speak(`${canReach ? '멈추세요. ' : ''}${current.label}${particle} 찾았어요.`, reason => {
          announcing = false;
          if (reason === 'ended') {
            announced = true; lastSpokenAt = performance.now(); lastPhoneAt = -Infinity;
          }
        }, {priority:'found',clipId:foundRecordingId(current.label)});
        return;
      }
      const transition=latest.current.phaseNotice;
      if(transition&&!phaseSpoken.has(transition.id)&&now-lastSpokenAt>=1500&&!isPrioritySpeaking()){
        lastSpokenAt=now;if(transition.phone){lastPhoneAt=now;phoneCue();}
        speak(transition.text,reason=>{
          if(reason==='ended'){phaseSpoken.add(transition.id);lastSpokenAt=performance.now();if(transition.phone)lastPhoneAt=lastSpokenAt;else reachAnnounced=true;}
        },{priority:'guidance'});return;
      }
      if (canReach && extra && !reachAnnounced && !reaching && reachSince !== undefined && now-reachSince >= 500 && now-lastSpokenAt >= 1500 && !isPrioritySpeaking()) {
        reaching = true; lastSpokenAt = now;
        speak(extra, reason => { reaching = false; if (reason === 'ended') reachAnnounced = true; }, {priority:'guidance',clipId:'reach_out'});
        return;
      }
      if (canReach && reachAnnounced && !isPhone && latest.current.graspTip && !graspAnnounced && !graspSpeaking && now-lastSpokenAt >= 1500 && !isPrioritySpeaking()) {
        graspSpeaking = true; lastSpokenAt = now;
        speak(latest.current.graspTip, reason => {
          graspSpeaking = false;
          if (reason === 'ended') { graspAnnounced = true; lastSpokenAt = performance.now(); }
        }, {priority:'guidance'});
        return;
      }
      if(latest.current.graspAligned&&alignedAnnounced)return;
      if (!text || (isPhone ? now-lastPhoneAt < 6000 : text === lastText) || now - candidateSince < 500 || now - lastSpokenAt < 1500 || now - (spokenAt.get(text) ?? -Infinity) < 3000 || isPrioritySpeaking()) return;
      lastText = text; lastSpokenAt = now; spokenAt.set(text, now);
      if (isPhone) lastPhoneAt = now;
      const pauseAfter = latest.current.graspAligned;
      if(isPhone)phoneCue();
      if(pauseAfter&&!alignedFelt){alignedFelt=true;vibrate(80);}
      speak(text, reason => {
        if (reason !== 'ended') {
          lastText = ''; spokenAt.delete(text);
          if (isPhone) lastPhoneAt = -Infinity;
        } else if (pauseAfter) lastText = '';
        if(reason==='ended'&&pauseAfter)alignedAnnounced=true;
        if (reason === 'ended') lastSpokenAt = performance.now();
      }, {priority:'guidance', clipId:latest.current.clipId, quietAfterMs:pauseAfter ? 5000 : undefined});
    }, 100);
    return () => { clearInterval(timer); cancelGuidance(); };
  }, [revision]);
}
