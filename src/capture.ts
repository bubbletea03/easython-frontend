// Full unmirrored video frame: normalized coordinates share the existing cover projection.
export async function captureFrame(video: HTMLVideoElement, signal?: AbortSignal) {
  signal?.throwIfAborted();
  if (video.readyState < 2 || !video.videoWidth || video.paused) throw new Error('카메라를 준비한 뒤 다시 시도해 주세요.');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
  canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('사진을 준비할 수 없습니다.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', .9));
  signal?.throwIfAborted();
  if (!blob) throw new Error('사진을 촬영하지 못했습니다.');
  return blob;
}
