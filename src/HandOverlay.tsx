import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { projectPoint, type Rect } from './sceneGeometry';

export function HandOverlay({ hands, source, viewport }: { hands: NormalizedLandmark[][]; source: Rect; viewport: Rect }) {
  return <svg className="hand-overlay" width={viewport.width} height={viewport.height} aria-hidden="true">
    {hands.map((landmarks, handIndex) => {
      return <g key={handIndex}>
        {[4,8].map(index => {
          const point = projectPoint(landmarks[index], source, viewport);
          if (point.x < 0 || point.y < 0 || point.x > viewport.width || point.y > viewport.height) return null;
          return <circle key={index} className="finger-tip" cx={point.x} cy={point.y} r="6" />;
        })}
      </g>;
    })}
  </svg>;
}
