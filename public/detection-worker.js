// MediaPipe's WASM loader uses importScripts, so this is a classic worker.
importScripts('./mediapipe/vision_bundle.js');

let detector;
let handDetector;
self.onmessage = async ({ data }) => {
  if (data.type === 'init') {
    try {
      const files = await Vision.FilesetResolver.forVisionTasks(data.baseUrl + 'mediapipe');
      detector = data.objects === false ? undefined : await Vision.ObjectDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.baseUrl + 'models/efficientdet_lite0.tflite', delegate: 'CPU' },
        runningMode: 'VIDEO', scoreThreshold: 0.65, maxResults: 10,
      });
      self.postMessage({ type: 'ready' });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) });
      return;
    }
    try {
      const files = await Vision.FilesetResolver.forVisionTasks(data.baseUrl + 'mediapipe');
      handDetector = await Vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: data.baseUrl + 'models/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.6, minHandPresenceConfidence: 0.6, minTrackingConfidence: 0.6,
      });
      self.postMessage({ type: 'hand-ready' });
    } catch (error) {
      self.postMessage({ type: 'hand-error', message: String(error) });
    }
    return;
  }
  if (data.type === 'frame') {
    try {
      const result = detector ? detector.detectForVideo(data.frame, data.timestamp) : { detections: [] };
      // Match the UI's largest visible box, including object-fit: cover cropping.
      const viewportWidth = data.viewportWidth || data.frame.width;
      const viewportHeight = data.viewportHeight || data.frame.height;
      const scale = Math.max(viewportWidth / data.frame.width, viewportHeight / data.frame.height);
      const offsetX = (data.frame.width * scale - viewportWidth) / 2;
      const offsetY = (data.frame.height * scale - viewportHeight) / 2;
      let largestArea = 0;
      let personSelected = !!data.personSelected;
      for (const detection of result.detections) {
        const box = detection.boundingBox;
        if (!box) continue;
        const width = Math.max(0, Math.min(viewportWidth, (box.originX + box.width) * scale - offsetX)
          - Math.max(0, box.originX * scale - offsetX));
        const height = Math.max(0, Math.min(viewportHeight, (box.originY + box.height) * scale - offsetY)
          - Math.max(0, box.originY * scale - offsetY));
        if (width * height > largestArea) {
          largestArea = width * height;
          personSelected = detection.categories[0]?.categoryName === 'person';
        }
      }
      let hands = [];
      if (handDetector && !personSelected) {
        try { hands = handDetector.detectForVideo(data.frame, data.timestamp).landmarks; }
        catch (error) {
          handDetector.close(); handDetector = undefined;
          self.postMessage({ type: 'hand-error', message: String(error) });
        }
      }
      self.postMessage({ type: 'result', detections: result.detections, hands });
    } catch (error) {
      self.postMessage({ type: 'error', message: String(error) });
    } finally {
      data.frame.close();
    }
  }
};
