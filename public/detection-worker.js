// MediaPipe's WASM loader uses importScripts, so this is a classic worker.
importScripts('./mediapipe/vision_bundle.js');
let detector, handDetector, files, baseUrl;
let objectFailed = false;
async function ensureObjects() {
  if (detector || objectFailed) return;
  try {
    detector = await Vision.ObjectDetector.createFromOptions(files, {
      baseOptions: {modelAssetPath:baseUrl+'models/efficientdet_lite0.tflite',delegate:'CPU'},
      runningMode:'VIDEO',scoreThreshold:.35,maxResults:10,categoryDenylist:['person'],
    });
  } catch (error) {
    objectFailed = true;
    self.postMessage({type:'object-error',message:String(error)});
  }
}
self.onmessage = async ({data}) => {
  if (data.type === 'init') {
    baseUrl = data.baseUrl;
    try { files = await Vision.FilesetResolver.forVisionTasks(baseUrl+'mediapipe'); }
    catch (error) {self.postMessage({type:'error',message:String(error)});return;}
    try {
      handDetector = await Vision.HandLandmarker.createFromOptions(files, {
        baseOptions:{modelAssetPath:baseUrl+'models/hand_landmarker.task',delegate:'CPU'},
        runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.6,minHandPresenceConfidence:.6,minTrackingConfidence:.6,
      });
      self.postMessage({type:'hand-ready'});
    } catch (error) {self.postMessage({type:'hand-error',message:String(error)});}
    self.postMessage({type:'ready'});
    return;
  }
  if (data.type === 'frame') {
    try {
      if (data.objects) await ensureObjects();
      const result = data.objects && detector ? detector.detectForVideo(data.frame,data.timestamp) : {detections:[]};
      let hands=[];
      if (handDetector) {
        try {hands=handDetector.detectForVideo(data.frame,data.timestamp).landmarks;}
        catch (error) {
          handDetector.close();handDetector=undefined;
          self.postMessage({type:'hand-error',message:String(error)});
        }
      }
      self.postMessage({type:'result',detections:result.detections,hands,configKey:data.configKey});
    } catch (error) {self.postMessage({type:'error',message:String(error)});}
    finally {data.frame.close();}
  }
};
