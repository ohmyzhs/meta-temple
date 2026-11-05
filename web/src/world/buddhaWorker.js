// 삼존 조각을 메인 스레드 밖에서 (buddha.js 가 띄운다)
import { sculptData, transferables } from './buddhaSculpt.js';

self.onmessage = (e) => {
  const d = sculptData(e.data.kind, e.data.quality);
  self.postMessage(d, transferables(d));
};
