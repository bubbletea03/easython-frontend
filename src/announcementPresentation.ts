import type { SceneUI } from './sceneUI';
import type { SpeechAnnouncement } from './speechCore';

// Freeze the announcement card, not camera tracking, for the playing job.
export function createAnnouncementPresenter(){
  let id:number|undefined,held:SceneUI|undefined;
  return {
    update(live:SceneUI,announcement:SpeechAnnouncement|undefined):SceneUI{
      if(!announcement){id=undefined;held=undefined;return live;}
      if(id!==announcement.id){
        id=announcement.id;
        held={...live,title:announcement.text,detail:undefined,direction:undefined};
        if(announcement.priority==='safety')held={...held,state:'warning',status:'조심하세요'};
      }
      return held!;
    },
  };
}
