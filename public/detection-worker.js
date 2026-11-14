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
        runningMode: 'VIDEO', scoreThreshold: 0.35, maxResults: 10,
        categoryDenylist: ['person'],
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
      let hands = [];
      // Track hands independently from object detection.
      if (handDetector) {
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
