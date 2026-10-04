/**
 * Selfie capture. Uses the live camera (getUserMedia) so the photo library is never touched. The image is
 * re-encoded as JPEG and shrunk until it fits the server limit (selfie_max_bytes) before upload.
 */
export class CameraError extends Error { constructor(kind, message) { super(message); this.kind = kind; } }

export async function startCamera(video, env = globalThis) {
  const md = env.navigator && env.navigator.mediaDevices;
  if (!md || !md.getUserMedia) throw new CameraError('UNSUPPORTED', 'Camera is not supported in this browser (HTTPS is required).');
  try {
    const stream = await md.getUserMedia({ video: { facingMode: 'user', width: { ideal: 960 }, height: { ideal: 960 } }, audio: false });
    video.srcObject = stream; video.setAttribute('playsinline', ''); video.muted = true; await video.play().catch(() => {});
    return stream;
  } catch (e) {
    if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) throw new CameraError('DENIED', 'Camera permission denied.');
    if (e && (e.name === 'NotFoundError' || e.name === 'OverconstrainedError')) throw new CameraError('NO_CAMERA', 'No camera was found on this device.');
    throw new CameraError('FAILED', 'The camera could not be started.');
  }
}
export function stopCamera(stream) { if (stream) stream.getTracks().forEach((t) => t.stop()); }

const blobToBase64 = (blob) => new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1]); r.onerror = () => reject(r.error); r.readAsDataURL(blob); });
const toBlob = (canvas, q) => new Promise((res) => canvas.toBlob(res, 'image/jpeg', q));

/** source: <video> or <img>. Returns { blob, base64, mime, bytes, width, height }. */
export async function captureToJpeg(source, maxBytes, { maxDim = 720 } = {}) {
  const sw = source.videoWidth || source.naturalWidth || source.width, sh = source.videoHeight || source.naturalHeight || source.height;
  if (!sw || !sh) throw new CameraError('FAILED', 'The camera image is not ready yet.');
  let scale = Math.min(1, maxDim / Math.max(sw, sh)), q = 0.82;
  for (let i = 0; i < 12; i++) {
    const c = globalThis.document.createElement('canvas'); c.width = Math.round(sw * scale); c.height = Math.round(sh * scale);
    c.getContext('2d').drawImage(source, 0, 0, c.width, c.height);
    const blob = await toBlob(c, q);
    if (blob && blob.size <= maxBytes) return { blob, base64: await blobToBase64(blob), mime: 'image/jpeg', bytes: blob.size, width: c.width, height: c.height };
    if (q > 0.5) q -= 0.12; else scale *= 0.8;
  }
  throw new CameraError('FAILED', 'Could not shrink the photo enough.');
}
export function fileToImage(file) { return new Promise((resolve, reject) => { const img = new Image(), url = URL.createObjectURL(file); img.onload = () => { resolve(img); setTimeout(() => URL.revokeObjectURL(url), 1000); }; img.onerror = () => reject(new CameraError('FAILED', 'Could not read the photo.')); img.src = url; }); }
