/** 真实端到端：IMG.LY 抠图 → 透明 PNG → Canvas WebM → Demo 展示端视频。 */
const assert=require('node:assert/strict'),path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=path.resolve(__dirname,'..');
(async()=>{
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  try{
    const context=await browser.newContext({viewport:{width:1280,height:720}}),page=await context.newPage();
    page.on('pageerror',error=>console.log('[page error]',error.message));
    await page.goto('http://localhost:3000/upload?demo=true');
    await page.getByText('本地测试模式',{exact:false}).waitFor({timeout:25000});
    await page.locator('input[type=file]').setInputFiles(path.join(root,'scripts/fixtures/astronaut.png'));
    await page.getByRole('button',{name:'上传到展览'}).click();
    await page.locator('.processing-overlay').waitFor();
    await page.getByText('黑底视频已生成。',{exact:false}).waitFor({timeout:300000});
    await page.locator('.processing-overlay').waitFor({state:'hidden'});
    const cutout=await page.locator('.cutout-preview img').evaluate(async image=>{const blob=await(await fetch(image.src)).blob(),bitmap=await createImageBitmap(blob),c=document.createElement('canvas');c.width=bitmap.width;c.height=bitmap.height;const ctx=c.getContext('2d');ctx.drawImage(bitmap,0,0);const data=ctx.getImageData(0,0,c.width,c.height).data;let transparent=0,opaque=0;for(let i=3;i<data.length;i+=4){if(data[i]===0)transparent++;if(data[i]>240)opaque++;}return{type:blob.type,transparent,opaque};});
    assert.equal(cutout.type,'image/png');assert(cutout.transparent>1000&&cutout.opaque>1000);
    const stored=await page.evaluate(async()=>{const db=await new Promise((resolve,reject)=>{const request=indexedDB.open('exhibition-photo-demo',2);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});const entry=await new Promise((resolve,reject)=>{const request=db.transaction('history').objectStore('history').getAll();request.onsuccess=()=>resolve(request.result.sort((a,b)=>b.created_at.localeCompare(a.created_at))[0]);request.onerror=()=>reject(request.error);});db.close();return{cutoutType:entry.cutout.type,videoType:entry.video.type,videoBytes:entry.video.size};});
    assert.equal(stored.cutoutType,'image/png');assert(stored.videoType.startsWith('video/webm'));assert(stored.videoBytes>10000);
    const display=await context.newPage();await display.goto('http://localhost:3000/display?demo=true');
    await display.waitForFunction(()=>document.querySelector('.transition-visible video')?.readyState>=2,null,{timeout:30000});
    const screen=await display.locator('.single-video video').evaluate(video=>({muted:video.muted,loop:video.loop,autoplay:video.autoplay,controls:video.controls,paused:video.paused,duration:video.duration,black:getComputedStyle(document.querySelector('.display-stage')).backgroundColor}));
    assert.equal(screen.black,'rgb(0, 0, 0)');assert(screen.muted&&!screen.loop&&screen.autoplay&&!screen.controls&&!screen.paused);assert(screen.duration>5.8&&screen.duration<6.3,screen.duration);
    console.log('cutout → black WebM → display passed',JSON.stringify({cutout,stored,screen}));
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
