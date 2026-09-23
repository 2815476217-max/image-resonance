import 'server-only';
import tcb from '@cloudbase/node-sdk';

type CloudDocument = {
  _id?: string; id?: string; imageFileId?: string; cutoutFileId?: string; videoFileId?: string;
  imageUrl?: string; cutoutUrl?: string; videoUrl?: string; createdAt?: string | Date; status?: string;
};
let app: ReturnType<typeof tcb.init> | null = null;
let lastLoggedConfig = '';

function logConfig(env: string, secretId: string, secretKey: string) {
  if (process.env.NODE_ENV !== 'development') return;
  const flags = [Boolean(env), Boolean(secretId), Boolean(secretKey), Boolean(app)];
  const snapshot = flags.join(':');
  if (snapshot === lastLoggedConfig) return;
  lastLoggedConfig = snapshot;
  console.info(`[CloudBase] envId exists: ${flags[0]}`);
  console.info(`[CloudBase] secretId exists: ${flags[1]}`);
  console.info(`[CloudBase] secretKey exists: ${flags[2]}`);
  console.info(`[CloudBase] initialized: ${flags[3]}`);
}

export function serverConfig() {
  const env = process.env.CLOUDBASE_ENV_ID?.trim() || '';
  const secretId = process.env.TENCENTCLOUD_SECRETID?.trim() || '';
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY?.trim() || '';
  logConfig(env, secretId, secretKey);
  return { configured: Boolean(env && secretId && secretKey), envSuffix: env ? `****${env.slice(-4)}` : '—' };
}
export function getCloudBaseServer() {
  const env = process.env.CLOUDBASE_ENV_ID?.trim();
  const secretId = process.env.TENCENTCLOUD_SECRETID?.trim();
  const secretKey = process.env.TENCENTCLOUD_SECRETKEY?.trim();
  if (!env || !secretId || !secretKey) {
    logConfig(env || '', secretId || '', secretKey || '');
    throw new Error('CloudBase 服务端未配置：需填写 CLOUDBASE_ENV_ID、TENCENTCLOUD_SECRETID、TENCENTCLOUD_SECRETKEY。');
  }
  app ??= tcb.init({ env, secretId, secretKey });
  logConfig(env, secretId, secretKey);
  return app;
}

export type ReadyItem = { id: string; imageUrl: string; cutoutUrl: string | null; videoUrl: string | null; createdAt: string; status: 'ready' };
export async function readyDocuments(): Promise<ReadyItem[]> {
  const collection = getCloudBaseServer().database().collection('uploads');
  const records: CloudDocument[] = [];
  const pageSize = 100;
  for (let offset = 0; ; offset += pageSize) {
    const result = await collection.where({ status: 'ready' }).orderBy('createdAt', 'asc').skip(offset).limit(pageSize).get();
    const page = (result.data || []) as CloudDocument[];
    records.push(...page);
    if (page.length < pageSize) break;
  }
  return records.map(doc => {
    const id = doc.id || doc._id || '';
    const media = (kind: string) => `/api/exhibition/media/${encodeURIComponent(id)}/${kind}`;
    return { id, imageUrl: doc.imageFileId ? media('image') : doc.imageUrl || '',
      cutoutUrl: doc.cutoutFileId ? media('cutout') : doc.cutoutUrl || null,
      videoUrl: doc.videoFileId ? media('video') : doc.videoUrl || null,
      createdAt: doc.createdAt instanceof Date ? doc.createdAt.toISOString() : String(doc.createdAt || ''), status: 'ready' as const };
  });
}

export async function uploadServerFile(path: string, file: File) {
  const result = await getCloudBaseServer().uploadFile({ cloudPath: path, fileContent: Buffer.from(await file.arrayBuffer()) });
  if (!result.fileID) throw new Error('云存储上传失败：没有返回 fileID');
  return result.fileID;
}
export async function getServerFileUrl(fileId: string) {
  const result = await getCloudBaseServer().getTempFileURL({ fileList: [fileId] });
  const item = result.fileList?.find(entry => entry.fileID === fileId);
  if (!item?.tempFileURL || (item.code && item.code !== 'SUCCESS')) {
    throw new Error(`云存储读取失败：${item?.code || '未返回临时访问地址'}`);
  }
  return item.tempFileURL;
}
export async function healthStatus() {
  const config = serverConfig();
  const status: { cloudbaseConfigured: boolean; databaseReachable: boolean; storageReachable: boolean; uploadsCount: number | null; error?: string } = {
    cloudbaseConfigured: config.configured, databaseReachable: false, storageReachable: false, uploadsCount: null,
  };
  if (!config.configured) { status.error = '缺少 CloudBase 服务端环境 ID 或密钥对。'; return status; }
  const client = getCloudBaseServer();
  try {
    const count = await client.database().collection('uploads').count();
    if (count.code) throw new Error(count.message || count.code);
    status.databaseReachable = true; status.uploadsCount = count.total ?? 0;
  } catch (error) { status.error = `数据库检查失败：${error instanceof Error ? error.message : String(error)}`; }
  try {
    const probe = await client.getUploadMetadata({ cloudPath: 'exhibition/__health_probe__' });
    if (!probe.data?.fileId) throw new Error('云存储未返回上传元数据。');
    status.storageReachable = true;
  } catch (error) { status.error = [status.error, `云存储检查失败：${error instanceof Error ? error.message : String(error)}`].filter(Boolean).join('；'); }
  return status;
}
