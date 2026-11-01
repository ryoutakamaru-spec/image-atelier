/* Image Atelier: 3x3 collage -> raw PNGs, iPhone SE PNGs, and 9-page PDF.
 * Runs entirely in the browser; no dependencies, analytics, uploads, or network calls.
 * Copyright 2026. MIT License.
 */
'use strict';

(() => {
  const $ = id => document.getElementById(id);
  const settingIds = ['margin','gapX','gapY','x1','x2','y1','y2'];
  const initialSettings = { margin:0, gapX:0, gapY:0, x1:33.3, x2:66.7, y1:33.3, y2:66.7 };
  const PHONE_W = 750, PHONE_H = 1334;
  const MAX_PIXELS = 40000000;
  const state = {img:null, url:null, rects:[], zipUrl:null, pdfUrl:null, busy:false};
  const formatNum = n => n.toLocaleString('ja-JP');
  const delayFrame = () => new Promise(resolve => setTimeout(resolve, 0));
  const int = id => Math.max(0, Math.floor(Number($(id).value) || 0));
  const pct = id => Number($(id).value);
  const setStatus = (message, error=false) => {
    $('status').textContent = message;
    $('status').style.color = error ? '#ffb3b3' : '';
  };

  function currentSettings() {
    return {
      margin:int('margin'), gapX:int('gapX'), gapY:int('gapY'),
      x1:pct('x1'), x2:pct('x2'), y1:pct('y1'), y2:pct('y2')
    };
  }

  /** Source pixel coordinates for nine nonoverlapping regions, reading order. */
  function calculateRects(width, height, settings) {
    const {margin,gapX,gapY,x1,x2,y1,y2} = settings;
    if (![width,height,margin,gapX,gapY,x1,x2,y1,y2].every(Number.isFinite)) throw Error('入力値が正しくありません。');
    if (width <= 0 || height <= 0 || margin < 0 || gapX < 0 || gapY < 0) throw Error('余白・隙間には0以上を指定してください。');
    if (!(0 < x1 && x1 < x2 && x2 < 100 && 0 < y1 && y1 < y2 && y2 < 100)) throw Error('境界の割合は 0 < 1本目 < 2本目 < 100 にしてください。');
    const availableW = width - margin * 2;
    const availableH = height - margin * 2;
    if (availableW <= 0 || availableH <= 0) throw Error('外周余白が大きすぎます。');
    const xe = [margin, Math.round(margin + availableW*x1/100), Math.round(margin + availableW*x2/100), width-margin];
    const ye = [margin, Math.round(margin + availableH*y1/100), Math.round(margin + availableH*y2/100), height-margin];
    const xStart = [xe[0],xe[1] + Math.ceil(gapX/2),xe[2] + Math.ceil(gapX/2)];
    const xEnd = [xe[1] - Math.floor(gapX/2),xe[2] - Math.floor(gapX/2),xe[3]];
    const yStart = [ye[0],ye[1] + Math.ceil(gapY/2),ye[2] + Math.ceil(gapY/2)];
    const yEnd = [ye[1] - Math.floor(gapY/2),ye[2] - Math.floor(gapY/2),ye[3]];
    const rects = [];
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        const w = xEnd[col]-xStart[col];
        const h = yEnd[row]-yStart[row];
        if (w < 10 || h < 10) throw Error('切り出し領域が小さすぎます。境界・隙間を見直してください。');
        rects.push({x:xStart[col], y:yStart[row], w, h, row, col, index:row*3+col+1});
      }
    }
    return rects;
  }

  function releaseOldDownloads() {
    if (state.zipUrl) URL.revokeObjectURL(state.zipUrl);
    if (state.pdfUrl) URL.revokeObjectURL(state.pdfUrl);
    state.zipUrl = state.pdfUrl = null;
    $('downloadLink').hidden = true;
    $('pdfLink').hidden = true;
  }

  function buildGuide() {
    if (!state.img) return;
    const canvas = $('guideCanvas'), ctx = canvas.getContext('2d');
    const sourceW = state.img.naturalWidth, sourceH = state.img.naturalHeight;
    const scale = Math.min(720/sourceW, 470/sourceH, 1);
    canvas.width = Math.max(1,Math.round(sourceW*scale));
    canvas.height = Math.max(1,Math.round(sourceH*scale));
    ctx.drawImage(state.img,0,0,canvas.width,canvas.height);
    ctx.lineWidth=2;
    state.rects.forEach((r,i)=>{
      const x=r.x*scale, y=r.y*scale, w=r.w*scale, h=r.h*scale;
      ctx.strokeStyle='#7df5cc';
      ctx.strokeRect(x+0.5,y+0.5,Math.max(1,w-1),Math.max(1,h-1));
      const fontSize=Math.max(11,Math.min(24,Math.round(Math.min(w,h)*0.18)));
      ctx.font=`bold ${fontSize}px system-ui`;
      ctx.textAlign='center';ctx.textBaseline='middle';
      const label=String(i+1).padStart(2,'0'),tx=x+w/2,ty=y+h/2;
      const textWidth=ctx.measureText(label).width;
      ctx.fillStyle='rgba(0,0,0,.63)';ctx.fillRect(tx-textWidth/2-7,ty-fontSize/2-5,textWidth+14,fontSize+10);
      ctx.fillStyle='#b3ffe3';ctx.fillText(label,tx,ty+1);
    });
  }

  function buildTiles() {
    const target=$('tiles');target.replaceChildren();
    for (const r of state.rects) {
      const article=document.createElement('div');article.className='tile';
      const canvas=document.createElement('canvas');
      canvas.width=180;canvas.height=240;
      const ctx=canvas.getContext('2d');
      ctx.fillStyle='#000';ctx.fillRect(0,0,180,240);
      const s=Math.min(180/r.w,240/r.h);const w=r.w*s,h=r.h*s;
      ctx.drawImage(state.img,r.x,r.y,r.w,r.h,(180-w)/2,(240-h)/2,w,h);
      article.appendChild(canvas);
      const title=document.createElement('div');title.className='tile-label';
      title.textContent=`${String(r.index).padStart(2,'0')} / 09`;
      const details=document.createElement('div');details.className='tile-meta';
      details.textContent=`${formatNum(r.w)} × ${formatNum(r.h)} px`;
      article.append(title,details);target.appendChild(article);
    }
  }

  function refresh() {
    if (!state.img || state.busy) return;
    try {
      state.rects=calculateRects(state.img.naturalWidth,state.img.naturalHeight,currentSettings());
      buildGuide();buildTiles();
      $('tilesPanel').hidden=false;
      $('outputPanel').hidden=false;
      setStatus('9枚の切り出し位置を確認できました。書き出しできます。');
    } catch (error) {
      state.rects=[];
      $('tilesPanel').hidden=true;
      $('outputPanel').hidden=true;
      setStatus(error.message, true);
      // Keep image visible to help with correction.
      const canvas=$('guideCanvas'),ctx=canvas.getContext('2d');
      const s=Math.min(720/state.img.naturalWidth,470/state.img.naturalHeight,1);
      canvas.width=Math.round(state.img.naturalWidth*s);
      canvas.height=Math.round(state.img.naturalHeight*s);
      ctx.drawImage(state.img,0,0,canvas.width,canvas.height);
    }
  }

  async function loadFile(file) {
    if (!file || state.busy) return;
    if (!file.type.startsWith('image/')) {setStatus('画像ファイルを選んでください。',true);return;}
    if (file.size > 80*1024*1024) {setStatus('画像ファイルが大きすぎます（上限80MB）。',true);return;}
    const url=URL.createObjectURL(file);
    try {
      const img=new Image();
      await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(Error('画像を読み込めません。PNG・JPEG・WebP形式を試してください。'));img.src=url;});
      const pixels=img.naturalWidth*img.naturalHeight;
      if (pixels>MAX_PIXELS) throw Error('画像が40メガピクセルを超えています。縮小してから利用してください。');
      if (state.url) URL.revokeObjectURL(state.url);
      state.url=url;state.img=img;
      releaseOldDownloads();
      $('imageMeta').textContent=`${file.name} · ${formatNum(img.naturalWidth)}×${formatNum(img.naturalHeight)}px · ${(file.size/1024/1024).toFixed(2)}MB`;
      $('adjustPanel').hidden=false;
      refresh();
    } catch(e){URL.revokeObjectURL(url);setStatus(e.message,true);$('imageMeta').textContent=e.message;}
  }

  function canvasToBlob(canvas, type, quality) {
    return new Promise((resolve,reject)=>{
      if (!canvas.toBlob) {
        try {
          const uri=canvas.toDataURL(type,quality);
          const binary=atob(uri.split(',')[1]);
          const bytes=Uint8Array.from(binary,c=>c.charCodeAt(0));
          resolve(new Blob([bytes],{type}));
        } catch(err){reject(err);}
        return;
      }
      canvas.toBlob(blob=>blob?resolve(blob):reject(Error('画像の変換に失敗しました。')),type,quality);
    });
  }

  async function blobBytes(blob) {return new Uint8Array(await blob.arrayBuffer());}
  function rawCrop(image,rect) {
    const canvas=document.createElement('canvas');canvas.width=rect.w;canvas.height=rect.h;
    canvas.getContext('2d').drawImage(image,rect.x,rect.y,rect.w,rect.h,0,0,rect.w,rect.h);
    return canvas;
  }
  function drawPhonePage(canvas,img,rect,mode,background){
    const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,PHONE_W,PHONE_H);
    const scale=(mode==='cover'?Math.max:Math.min)(PHONE_W/rect.w,PHONE_H/rect.h);
    const destW=rect.w*scale,destH=rect.h*scale;
    ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';
    ctx.drawImage(img,rect.x,rect.y,rect.w,rect.h,(PHONE_W-destW)/2,(PHONE_H-destH)/2,destW,destH);
  }

  // Minimal, standards-compliant uncompressed ZIP writer, including CRC-32 and UTF-8 filenames.
  const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);t[n]=c>>>0;}return t;})();
  function crc32(bytes){let c=0xffffffff;for(let i=0;i<bytes.length;i++)c=CRC_TABLE[(c^bytes[i])&255]^(c>>>8);return (c^0xffffffff)>>>0;}
  function zipStore(files){
    const enc=new TextEncoder(),local=[],central=[];
    let offset=0;
    const dt=new Date();
    const dosTime=((dt.getHours()&31)<<11)|((dt.getMinutes()&63)<<5)|((dt.getSeconds()>>1)&31);
    const dosDate=(((Math.max(1980,dt.getFullYear())-1980)&127)<<9)|(((dt.getMonth()+1)&15)<<5)|(dt.getDate()&31);
    for (const file of files){
      const name=enc.encode(file.name),data=file.data;
      if(name.length>65535||data.length>0xffffffff)throw Error('ZIPのサイズ制限を超えました。');
      const crc=crc32(data);
      const h=new Uint8Array(30+name.length),v=new DataView(h.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x0800,true);v.setUint16(8,0,true);
      v.setUint16(10,dosTime,true);v.setUint16(12,dosDate,true);v.setUint32(14,crc,true);
      v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,name.length,true);
      h.set(name,30);local.push(h,data);
      const c=new Uint8Array(46+name.length),cv=new DataView(c.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);
      cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);
      cv.setUint16(12,dosTime,true);cv.setUint16(14,dosDate,true);cv.setUint32(16,crc,true);
      cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);
      cv.setUint32(42,offset,true);c.set(name,46);central.push(c);
      offset+=h.length+data.length;
    }
    if (files.length>65535 || offset>0xffffffff)throw Error('ZIPの4GB制限を超えました。');
    const centralSize=central.reduce((sum,c)=>sum+c.length,0);
    const end=new Uint8Array(22),dv=new DataView(end.buffer);
    dv.setUint32(0,0x06054b50,true);dv.setUint16(8,files.length,true);dv.setUint16(10,files.length,true);
    dv.setUint32(12,centralSize,true);dv.setUint32(16,offset,true);
    return new Blob([...local,...central,end],{type:'application/zip'});
  }

  // PDF/A not claimed. JPEG-encoded photos, 375 x 667 pt pages, one image per page.
  function buildPhotoPdf(jpegs){
    if(jpegs.length!==9)throw Error('PDFは9画像で作成します。');
    const enc=new TextEncoder(),blocks=[],offsets=[0];let position=0;
    const add=bytes=>{blocks.push(bytes);position+=bytes.length;};
    const txt=s=>add(enc.encode(s));
    function obj(id,body){offsets[id]=position;txt(`${id} 0 obj\n${body}\nendobj\n`);}
    txt('%PDF-1.4\n%IMAGEATELIER\n');
    obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
    const pageIds=Array.from({length:9},(_,i)=>3+i*3);
    obj(2,`<< /Type /Pages /Kids [${pageIds.map(i=>`${i} 0 R`).join(' ')}] /Count 9 >>`);
    for(let i=0;i<9;i++){
      const pageId=3+i*3,contentId=pageId+1,imageId=pageId+2;
      obj(pageId,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 375 667] /Resources << /XObject << /Im1 ${imageId} 0 R >> >> /Contents ${contentId} 0 R >>`);
      const commands='q\n375 0 0 667 0 0 cm\n/Im1 Do\nQ\n';
      obj(contentId,`<< /Length ${enc.encode(commands).length} >>\nstream\n${commands}endstream`);
      offsets[imageId]=position;
      const jpg=jpegs[i];
      txt(`${imageId} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${PHONE_W} /Height ${PHONE_H} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpg.length} >>\nstream\n`);
      add(jpg);
      txt('\nendstream\nendobj\n');
    }
    const xrefPos=position;
    const maxId=29;
    txt(`xref\n0 ${maxId+1}\n0000000000 65535 f \n`);
    for(let i=1;i<=maxId;i++)txt(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);
    txt(`trailer\n<< /Size ${maxId+1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`);
    return new Blob(blocks,{type:'application/pdf'});
  }

  function setDownloadLink(element,blob,filename){
    const uri=URL.createObjectURL(blob);
    element.href=uri;element.download=filename;element.hidden=false;
    return uri;
  }
  function safePrefix(value){return (value.trim().replace(/[^A-Za-z0-9_-]/g,'_').replace(/_+/g,'_').slice(0,35)||'scene');}

  async function exportAll() {
    if (!state.img || !state.rects.length || state.busy) return;
    state.busy=true;releaseOldDownloads();
    const button=$('exportButton'),progress=$('progress');
    button.disabled=true;progress.hidden=false;progress.value=0;
    const prefix=safePrefix($('prefix').value);$('prefix').value=prefix;
    const mode=$('fitMode').value,bg=$('background').value;
    const files=[],jpegs=[];
    const phone=document.createElement('canvas');phone.width=PHONE_W;phone.height=PHONE_H;
    const manifest=['number,original_file,phone_file,source_x,source_y,width,height'];
    try {
      for(let i=0;i<9;i++){
        const r=state.rects[i],name=`${prefix}_${String(i+1).padStart(2,'0')}.png`;
        setStatus(`処理中 ${i+1}/9：切り抜きとスマホ用画像を作成しています。`);
        await delayFrame();
        const crop=rawCrop(state.img,r);
        const raw=await canvasToBlob(crop,'image/png');
        files.push({name:`original/${name}`,data:await blobBytes(raw)});
        // Retain full-resolution source pixels only in the original/ folder.
        crop.width=crop.height=1;
        drawPhonePage(phone,state.img,r,mode,bg);
        const png=await canvasToBlob(phone,'image/png');
        files.push({name:`iphone_se/${name}`,data:await blobBytes(png)});
        const jpeg=await canvasToBlob(phone,'image/jpeg',0.89);
        jpegs.push(await blobBytes(jpeg));
        manifest.push(`${i+1},original/${name},iphone_se/${name},${r.x},${r.y},${r.w},${r.h}`);
        progress.value=i+1;
      }
      setStatus('PDFとZIPをまとめています。');
      await delayFrame();
      const pdf=buildPhotoPdf(jpegs);
      const pdfBytes=await blobBytes(pdf);
      files.push({name:'photo_book_iphone_se.pdf',data:pdfBytes});
      files.push({name:'split_coordinates.csv',data:new TextEncoder().encode('\ufeff'+manifest.join('\r\n')+'\r\n')});
      const readme=[
        'Image Atelier export',
        '',
        'original/       : Nine cropped PNG files at source pixel resolution',
        'iphone_se/      : Nine 750x1334 PNG images, suitable for iPhone SE screens',
        'photo_book_iphone_se.pdf : Nine-page photo book, one photo per page',
        'split_coordinates.csv   : Source crop positions and sizes',
        '',
        `Display mode: ${mode}`,
        `Background: ${bg}`,
        'Ordering: left-to-right, top-to-bottom',
        'No AI regeneration was performed. All processing was local.'
      ].join('\n');
      files.push({name:'README.txt',data:new TextEncoder().encode(readme)});
      const totalSize=files.reduce((sum,f)=>sum+f.data.length,0);
      if(totalSize>250*1024*1024)throw Error('出力画像の合計が250MBを超えました。画像を縮小して再試行してください。');
      const zip=zipStore(files);
      state.zipUrl=setDownloadLink($('downloadLink'),zip,`${prefix}_image_atelier.zip`);
      state.pdfUrl=setDownloadLink($('pdfLink'),pdf,`${prefix}_photo_book_iphone_se.pdf`);
      setStatus(`完成しました。画像18枚、PDF1冊、座標CSV1件（ZIP ${(zip.size/1024/1024).toFixed(1)}MB）。`);
    }catch(e){console.error(e);setStatus(`書き出しに失敗しました：${e.message}`,true);}
    finally{state.busy=false;button.disabled=false;progress.hidden=true;}
  }

  $('fileInput').addEventListener('change', e=>loadFile(e.target.files[0]));
  const zone=$('dropZone');
  zone.addEventListener('dragover',e=>{e.preventDefault();zone.classList.add('dragging');});
  zone.addEventListener('dragleave',()=>zone.classList.remove('dragging'));
  zone.addEventListener('drop',e=>{e.preventDefault();zone.classList.remove('dragging');loadFile(e.dataTransfer.files[0]);});
  for(const id of settingIds)$(id).addEventListener('input',()=>{releaseOldDownloads();refresh();});
  for(const id of ['prefix','fitMode','background'])$(id).addEventListener('input',releaseOldDownloads);
  $('resetButton').addEventListener('click',()=>{for(const [key,value] of Object.entries(initialSettings))$(key).value=value;releaseOldDownloads();refresh();});
  $('exportButton').addEventListener('click',exportAll);

  // Read-only test hooks used by the accompanying browser integration test.
  window.ImageAtelierTest={calculateRects,zipStore,buildPhotoPdf};
})();
