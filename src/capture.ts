// Full unmirrored video frame: normalized coordinates share the existing cover projection.
export function captureRegion(box?: {x:number;y:number;width:number;height:number}) {
  if(!box)return {x:0,y:0,width:1,height:1};
  const x=Math.max(0,box.x),y=Math.max(0,box.y);
  return {x,y,width:Math.max(0,Math.min(1,box.x+box.width)-x),height:Math.max(0,Math.min(1,box.y+box.height)-y)};
}
export async function captureFrame(video: HTMLVideoElement, signal?: AbortSignal, crop?: {x:number;y:number;width:number;height:number}) {
  signal?.throwIfAborted();
  if (video.readyState < 2 || !video.videoWidth || video.paused) throw new Error('카메라를 준비한 뒤 다시 시도해 주세요.');
  const canvas = document.createElement('canvas');
  const region=captureRegion(crop);
  const width=region.width*video.videoWidth,height=region.height*video.videoHeight;
  if(width<=0||height<=0)throw new Error('물체 영역을 확인할 수 없습니다.');
  const scale = Math.min(1, 640 / Math.max(width,height));
  canvas.width = Math.max(1,Math.round(width * scale)); canvas.height = Math.max(1,Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('사진을 준비할 수 없습니다.');
  context.drawImage(video,region.x*video.videoWidth,region.y*video.videoHeight,width,height,0,0,canvas.width,canvas.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .7));
  signal?.throwIfAborted();
  if (!blob) throw new Error('사진을 촬영하지 못했습니다.');
  return blob;
}
