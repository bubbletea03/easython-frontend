import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { projectPoint, type Rect } from './sceneGeometry';

const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],
  [9,13],[13,14],[14,15],[15,16],[13,17],[0,17],[17,18],[18,19],[19,20]];

export function HandOverlay({ hands, source, viewport }: { hands: NormalizedLandmark[][]; source: Rect; viewport: Rect }) {
  return <svg className="hand-overlay" width={viewport.width} height={viewport.height} aria-hidden="true">
    {hands.map((landmarks, handIndex) => {
      const points = landmarks.map(point => projectPoint(point, source, viewport));
      return <g key={handIndex}>
        <g className="hand-bones">{connections.map(([a,b]) => <line key={`${a}-${b}`} x1={points[a].x} y1={points[a].y} x2={points[b].x} y2={points[b].y} />)}</g>
        <g className="hand-joints">{points.map((point,index) => <circle key={index} cx={point.x} cy={point.y} r="2" />)}</g>
        <circle className="finger-halo" cx={points[8].x} cy={points[8].y} r="10" />
        <circle className="finger-ring" cx={points[8].x} cy={points[8].y} r="10" />
        <circle className="finger-tip" cx={points[8].x} cy={points[8].y} r="3.5" />
      </g>;
    })}
  </svg>;
}
