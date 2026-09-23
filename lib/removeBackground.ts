import type { Config } from '@imgly/background-removal';
let assetRetry = 0;
let activeProgress: ((key: string, current: number, total: number) => void) | null = null;
const reportProgress = (key: string, current: number, total: number) => activeProgress?.(key, current, total);

/** IMG.LY / ISNet 主体分割。输入真实照片，输出带 alpha 的 PNG，不填黑底。 */
export async function removeBackground(file: Blob, onStep: (message: string) => void, signal?: AbortSignal): Promise<Blob> {
  const check = () => { if (signal?.aborted) throw new Error('人物处理已取消。'); };
  check();
  if (typeof window === 'undefined' || !window.WebAssembly) throw new Error('此浏览器不支持人物抠图，请使用新版 Chrome 或 Edge。');
  try {
    onStep('正在识别主体人物…');
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    const input = await prepareInferenceInput(file);
    check();
    const { removeBackground: segment } = await import('@imgly/background-removal');
    const progress = (key: string, current: number, total: number) => {
      if (signal?.aborted) return;
      if (key.startsWith('fetch:')) onStep(`正在识别主体人物 · 下载模型 ${total > 0 ? Math.round(current / total * 100) : 0}%`);
      else if (key === 'compute:decode' || key === 'compute:inference') onStep('正在识别主体人物…');
      else onStep('正在去除背景…');
    };
    // 库缓存初始化配置及 progress；通过固定分发器让再次上传仍更新当前页面。
    activeProgress = progress;
    const assets = new URL(process.env.NEXT_PUBLIC_BACKGROUND_REMOVAL_ASSET_URL || 'https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/');
    // 初始化失败的 Promise 也会被库缓存。更换 URL fragment 仅刷新初始化键；
    // 相对资源 URL 的实际下载地址不变，成功后继续复用模型会话。
    if (assetRetry) assets.hash = `retry-${assetRetry}`;
    const config: Config = {
      model: 'isnet_fp16', device: 'cpu', proxyToWorker: false,
      publicPath: assets.href, output: { format: 'image/png', quality: 1 },
      fetchArgs: { signal }, progress: reportProgress,
    };
    check();
    let result: Blob;
    try { result = await segment(input, config); }
    catch (error) { assetRetry++; throw error; }
    finally { if (activeProgress === progress) activeProgress = null; }
    check(); onStep('正在去除背景 · 整理透明边缘…');
    return await trimTransparentMargin(result, signal);
  } catch (error) {
    console.error('[人物抠图失败]', error);
    if (signal?.aborted) throw new Error('人物处理已取消。');
    const reason = error instanceof Error ? error.message : '';
    if (/没有识别|没有生成透明/.test(reason)) throw new Error(`人物抠图失败：${reason}。请选择人物与背景对比清晰的照片。`);
    if (/fetch|network|resource|load|session|wasm|metadata|CORS/i.test(reason)) throw new Error('人物抠图失败：模型或运行时加载失败，请检查网络后重试。详情见浏览器控制台。');
    throw new Error('人物抠图失败，可能是照片无法解码或浏览器资源不足，请换较小的清晰人物照片后重试。详情见浏览器控制台。');
  }
}

/** 只去掉主体外面的透明空白，不缩小 mask、不侵蚀头发/衣服边缘。 */
async function trimTransparentMargin(blob: Blob, signal?: AbortSignal): Promise<Blob> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width; canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('无法读取抠图结果');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1, transparent = 0, opaque = 0;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
      const alpha = data[(y * canvas.width + x) * 4 + 3];
      if (alpha < 5) transparent++;
      if (alpha > 200) opaque++;
      if (alpha > 1) { left = Math.min(left,x); right = Math.max(right,x); top = Math.min(top,y); bottom = Math.max(bottom,y); }
    }
    if (right < left || opaque < 100) throw new Error('没有识别到可展示主体');
    if (!transparent) throw new Error('没有生成透明背景，请换一张人物与背景对比清晰的照片');
    if (signal?.aborted) throw new Error('人物处理已取消');
    const pad = Math.max(3, Math.round(Math.max(right-left+1,bottom-top+1)*.02));
    left=Math.max(0,left-pad); top=Math.max(0,top-pad);
    right=Math.min(canvas.width-1,right+pad); bottom=Math.min(canvas.height-1,bottom+pad);
    const output=document.createElement('canvas'); output.width=right-left+1; output.height=bottom-top+1;
    output.getContext('2d')!.drawImage(canvas,left,top,output.width,output.height,0,0,output.width,output.height);
    return await new Promise<Blob>((resolve,reject)=>output.toBlob(result=>result ? resolve(result) : reject(new Error('PNG 编码失败')),'image/png'));
  } finally { bitmap.close(); }
}


/** 原图仍完整上传；推理最长边限制 1920，控制高像素手机照片的内存开销。 */
async function prepareInferenceInput(file: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1920 / Math.max(bitmap.width, bitmap.height));
    if (scale === 1) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法缩放推理图片');
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片解码/缩放失败')), 'image/png'));
  } finally { bitmap.close(); }
}
