// Build dense meshes off the render thread so navigation/animation stays live.
let worker, sequence = 0;
const pending = new Map();
function request(id, count) {
  if (!worker) {
    worker = new Worker(new URL('assets/inference-worker.js', document.baseURI), { type: 'module' });
    worker.onmessage = ({ data }) => {
      const task = pending.get(data.request); if (!task) return;
      pending.delete(data.request);
      if (data.error) task.reject(new Error(data.error)); else task.resolve(data.data);
    };
    worker.onerror = event => {
      for (const task of pending.values()) task.reject(new Error(event.message || '图片推断模型处理失败'));
      pending.clear(); worker.terminate(); worker = null;
    };
  }
  return new Promise((resolve, reject) => {
    const token = ++sequence; pending.set(token, { resolve, reject });
    worker.postMessage({ request: token, id, count });
  });
}
export const requestInferredCloud = request;
