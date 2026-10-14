import { inferredCloud } from './reconstructions.mjs';

self.onmessage = ({ data: { request, id, count } }) => {
  try {
    const data = inferredCloud({ id }, count);
    const transfer = data?.positions ? [data.positions.buffer, data.colors.buffer] : [];
    if (data?.wirePositions) transfer.push(data.wirePositions.buffer, data.wireColors.buffer);
    self.postMessage({ request, data }, transfer);
  } catch (error) { self.postMessage({ request, error: error.message }); }
};
