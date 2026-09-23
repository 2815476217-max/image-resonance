# 影像共振：CloudBase 展览 Demo

> 公网部署以本节下方的“CloudBase 云托管部署”为准。本文原有的 Web SDK / 匿名登录说明是早期方案，当前 `/api/exhibition/*` 使用服务端 CloudBase Node SDK，运行时需要服务端环境 ID 和腾讯云密钥对。

## CloudBase 云托管部署

本项目含 Next.js 16 服务端 Route Handlers（上传、相册列表、健康检查、媒体转发），必须运行在 **CloudBase 云托管** 的 Node.js 容器中，不能仅上传到静态网站托管。项目根目录已有 `Dockerfile`，容器监听 `0.0.0.0:3000`；`.dockerignore` 会排除本机 `.env.local`。

1. 在腾讯云开发控制台选择现有环境，进入 **云托管 → 通过本地代码部署**，上传本项目文件夹，使用根目录 `Dockerfile`，服务端口填 `3000`，打开公网访问。部署包须包含只存放公开网址的 `.env.production`。
2. 在云托管服务的 **服务设置 → 环境变量** 配置 `CLOUDBASE_ENV_ID`（当前 CloudBase 环境 ID）、`TENCENTCLOUD_SECRETID` 和 `TENCENTCLOUD_SECRETKEY`（腾讯云访问管理 API 密钥）。这三项仅供服务端使用，**不要**加 `NEXT_PUBLIC_` 前缀，也不要将 `.env.local` 上传到云端。确认 CloudBase 环境中已创建 `uploads` 集合和云存储。
3. 部署完成后到服务 **概览** 或 **服务设置 → 网络访问** 复制 HTTPS 公网域名；依次检查 `/api/exhibition/health`、`/qr`、`/upload`、`/gallery` 和 `/device`。健康检查应显示数据库和存储可访问。
4. 正式域名为 `https://exhibition-web-318184-7-1492951929.sh.run.tcloudbase.com`。`.env.production` 中的 `NEXT_PUBLIC_SITE_URL` 已设为这个站点根地址；若在云托管界面另外填写同名变量，也必须使用相同值。**重新构建并部署**后二维码才会更新，因为公开变量在 `next build` 时进入浏览器代码。

正式二维码固定为 `https://exhibition-web-318184-7-1492951929.sh.run.tcloudbase.com/upload`。生产环境缺少 `NEXT_PUBLIC_SITE_URL` 时不会生成二维码；开发环境未配置该变量时才使用当前页面地址。页面间导航和 `/api/exhibition/*` 请求仍使用相对路径。

照片在访客浏览器内抠图并生成 6 秒黑底 WebM。完成后才上传原图、透明 PNG、WebM 到腾讯云开发 CloudBase，写入 `uploads` 文档集合。云端不可用时本地视频仍可预览。无需 Supabase、OpenAI 或 Secret Key。

## 1. 本地启动

安装 Node.js 20+；推荐 Chrome 或 Edge。进入项目目录，执行：

```bash
npm install
copy .env.example .env.local
npm run dev
```

在 `.env.local` 把 `NEXT_PUBLIC_CLOUDBASE_ENV_ID=` 后填入环境 ID，保存后**重新启动** `npm run dev`。不要把 SecretId、SecretKey 或服务端密钥填入浏览器变量；旧 Supabase 值即使还在 `.env.local` 也不参与页面运行。

- 首页：<http://localhost:3000/>
- 上传：<http://localhost:3000/upload>
- 云相册：<http://localhost:3000/gallery>
- 展示端：<http://localhost:3000/display>
- 独立设备端：<http://localhost:3000/device>，开发调试可加 `?debug=true`
- 云端同步诊断：<http://localhost:3000/debug-sync>，每 3 秒显示环境配置、记录总数与最新记录
- 无云端设备预览：<http://localhost:3000/device?demo=true>
- 本地演示：<http://localhost:3000/upload?demo=true>，同一浏览器另开 <http://localhost:3000/display?demo=true>
- 四面模式：<http://localhost:3000/display?mode=hologram>

`demo=true` 用当前浏览器 IndexedDB，不上传 CloudBase。测试真实云端时不要带这个参数。

`/device` 与 `/display` 独立：它每 3 秒只检查最新一条 `ready` 记录，优先播放记录的 `videoUrl`；没有视频时才下载透明人物 PNG，再没有透明图才对原图运行浏览器抠图。图片降级展示时，设备端裁掉透明空白后将主体按画面高度约 68% 居中绘制到纯黑 Canvas，做 5 秒闭环的轻微动画。它不录制新文件，也不更改上传端生成 WebM 的算法。新记录经 350 毫秒淡出、250 毫秒黑屏、350 毫秒淡入后替换；无新图则持续循环。正常设备页无文字和控件，F11 可全屏。`?debug=true` 才显示记录 ID、图片地址、状态及同步时间。`?demo=true` 会明确使用本地测试人物，正式同步测试必须去掉此参数。

## 2. 在腾讯云开发后台配置

1. 打开[腾讯云开发控制台](https://console.cloud.tencent.com/tcb)，登录并点击**新建环境**。选择支持**文档型数据库**和**传统模式云存储**的环境，等待创建完成。不同套餐可能显示不同入口；本项目使用**文档集合**，不是 PostgreSQL 表。
2. 在环境的**概览 / 环境信息**找到**环境 ID**，复制到项目根目录 `.env.local` 的 `NEXT_PUBLIC_CLOUDBASE_ENV_ID=` 后面；只需这一项公开配置。
3. 在**身份认证 / 登录方式**开启**匿名登录**。观众无需手动注册；Web SDK 会自动匿名登录。[官方匿名登录说明](https://docs.cloudbase.net/en/authentication-v2/method/anonymous)
4. 在**环境配置 → 安全来源**添加 `localhost:3000`，正式上线时再添加实际网站域名。配置可能要等待一两分钟生效。[官方安全来源说明](https://docs.cloudbase.net/envconfig/security/intro)
5. 在**文档型数据库 → 集合管理**点击**新建集合**，名称输入 `uploads`。这是文档集合，不需要先建字段。进入集合的**权限管理 / 数据权限**，选择“**读取全部数据，修改本人数据**”（不同控制台版本可能显示“所有用户可读，仅创建者可写”）。这允许相册和展示端读取所有记录，而匿名上传者只写自己创建的记录。不要选“仅创建者可读写”，否则不同设备看不到彼此的照片。[官方基础权限说明](https://docs.cloudbase.net/database/data-permission)
6. 在**云存储**确认传统模式已开通。本项目会在首次上传时自动生成 `exhibition/images/`、`exhibition/cutouts/`、`exhibition/videos/` 目录，不需要创建三个独立 bucket。打开**权限设置**，选择允许公开读取、仅创建者写入的权限；如使用自定义安全规则，按现场隐私要求配置。上传需要匿名登录的写权限，展示端需要跨用户读取文件 URL。[官方存储规则说明](https://docs.cloudbase.net/storage/security-rules)
7. 对使用 v3 传统存储 HTTP API 的环境，还需确认云存储策略允许客户端请求；若 `upload` 返回授权错误，参照[官方 v3 存储说明](https://docs.cloudbase.net/en/api-reference/webv3/storage)检查 `StoragesHttpApiAllow` 策略。不要把密钥放到网页中来绕过权限。

## 3. 数据结构与同步

每条 `uploads` 文档以 UUID 为 `_id`，还包含：

| 字段 | 用途 |
| --- | --- |
| `id` | 与 `_id` 一致的上传 ID |
| `imageFileId`, `cutoutFileId`, `videoFileId` | 云文件的永久 fileID |
| `imageUrl`, `cutoutUrl`, `videoUrl` | 当前可访问地址；读取时会根据 fileID 刷新 |
| `createdAt` | ISO 格式的创建时间 |
| `status` | `processing`、`ready` 或 `failed` |

本地抠图和视频完成后上传原图，并创建 `processing` 文档；再上传透明人物 PNG 和视频，更新成 `ready`。云端失败时尽量将已创建文档标记为 `failed`，本地预览仍保留。控制台**文档型数据库 → uploads → 数据**可以核对字段。

`/gallery` 每 3 秒读取集合，按 `createdAt DESC` 展示原图、透明人物、视频、时间和状态，可手动刷新。`/display` 每 3 秒读取 `status=ready` 的视频，按 `createdAt ASC` 组成队列；视频结束进入下一条，末尾回到开头，新记录入队不会打断当前播放。切换采用约 700 毫秒淡出淡入。经典模式存储的 URL 不保证自定义有效期，页面读取时根据 fileID 获取新地址。

## 4. 验证与局限

先用 `?demo=true` 在同一浏览器验证本地抠图、视频生成和演示播放。然后去掉 `demo=true` 上传一张真实照片，等“已上传到展览”，打开 `/gallery` 及 `/display`；连续上传三张可检查 A → B → C → A。开发控制台提供 `[LOCAL]`、`[CLOUD]`、`[GALLERY]`、`[DISPLAY]` 日志，不会打印凭证。

```bash
npm run typecheck
npm run build
```

首次抠图需要下载模型；浏览器录制 WebM 时须保持页面在前台，推荐 Chrome/Edge。页面用匿名身份直接写 CloudBase，适合有权限规则的演示环境；正式公开展览应增加工作人员审核、上传频率和文件大小服务端限制。当前没有 CloudBase 环境 ID 时可以本地生成与预览，云相册会提示未连接。项目旧的 `lib/supabase.ts` 与 `supabase/` SQL 仅留作历史参考，不再被上传、云相册或展示端引用。
