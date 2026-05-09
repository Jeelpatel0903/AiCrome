// Annotated screenshot — takes a screenshot and draws numbered badges on interactive elements

export interface AnnotationLabel {
  ref: string; // "e1"
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AnnotatedScreenshotResult {
  dataUrl: string; // base64 PNG with annotations
  labels: AnnotationLabel[];
  elementCount: number;
}

export function buildAnnotationLabels(): AnnotationLabel[] {
  const elements = document.querySelectorAll('[data-ai-ref]');
  const labels: AnnotationLabel[] = [];

  for (const el of elements) {
    const ref = el.getAttribute('data-ai-ref');
    if (!ref) continue;

    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;

    labels.push({
      ref,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    });
  }

  return labels;
}

export function requestScreenshot(): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'take_screenshot' }, (response: { dataUrl: string }) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response.dataUrl);
    });
  });
}

export function drawAnnotations(
  screenshotDataUrl: string,
  labels: AnnotationLabel[],
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get 2D canvas context'));
        return;
      }

      ctx.drawImage(img, 0, 0);

      const BADGE_RADIUS = 10;
      const BADGE_FILL = '#6366f1';
      const TEXT_COLOR = '#ffffff';
      const FONT = 'bold 11px sans-serif';

      for (const label of labels) {
        // Badge center at top-left corner of element bounds
        const cx = label.x + BADGE_RADIUS;
        const cy = label.y + BADGE_RADIUS;

        // Strip leading 'e' to get the number string
        const numStr = label.ref.startsWith('e') ? label.ref.slice(1) : label.ref;

        // Draw filled circle
        ctx.beginPath();
        ctx.arc(cx, cy, BADGE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = BADGE_FILL;
        ctx.fill();

        // Draw number text
        ctx.fillStyle = TEXT_COLOR;
        ctx.font = FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(numStr, cx, cy);
      }

      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      reject(new Error('Failed to load screenshot image'));
    };

    img.src = screenshotDataUrl;
  });
}

export async function takeAnnotatedScreenshot(): Promise<AnnotatedScreenshotResult> {
  const labels = buildAnnotationLabels();
  const screenshotDataUrl = await requestScreenshot();
  const annotatedDataUrl = await drawAnnotations(screenshotDataUrl, labels);

  return {
    dataUrl: annotatedDataUrl,
    labels,
    elementCount: labels.length,
  };
}
