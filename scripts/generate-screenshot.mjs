import { writeFileSync, mkdirSync } from 'fs'
import { deflate } from 'zlib'
import { promisify } from 'util'
const deflateAsync = promisify(deflate)

// ── PNG encoder ───────────────────────────────────────────────────────────────
function u32be(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b }
function crc32(buf) {
  let c = 0xffffffff
  for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c>>>1)^(c&1?0xedb88320:0) }
  return (c^0xffffffff)>>>0
}
function pngChunk(name, data) {
  const body = Buffer.concat([Buffer.from(name), data])
  return Buffer.concat([u32be(data.length), body, u32be(crc32(body))])
}
async function makePng(W, H, px) {
  let raw = Buffer.alloc(0)
  for (let y=0;y<H;y++) {
    const row = Buffer.alloc(1+W*4)
    for (let x=0;x<W;x++) { const p=px[y*W+x]; row[1+x*4]=p[0];row[2+x*4]=p[1];row[3+x*4]=p[2];row[4+x*4]=p[3]??255 }
    raw = Buffer.concat([raw, row])
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W,0); ih.writeUInt32BE(H,4); ih[8]=8; ih[9]=6
  return Buffer.concat([
    Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]),
    pngChunk('IHDR',ih), pngChunk('IDAT',await deflateAsync(raw,{level:9})), pngChunk('IEND',Buffer.alloc(0))
  ])
}

// ── Canvas ────────────────────────────────────────────────────────────────────
const W=1280, H=800
const px = Array.from({length:W*H},()=>[255,255,255,255])
const set=(x,y,r,g,b,a=255)=>{x=Math.round(x);y=Math.round(y);if(x>=0&&x<W&&y>=0&&y<H)px[y*W+x]=[r,g,b,a]}
const fill=(x1,y1,x2,y2,r,g,b,a=255)=>{for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++)set(x,y,r,g,b,a)}
function circle(cx,cy,rad,r,g,b,a=255){for(let dy=-rad;dy<=rad;dy++)for(let dx=-rad;dx<=rad;dx++)if(Math.hypot(dx,dy)<=rad)set(cx+dx,cy+dy,r,g,b,a)}
function rrect(x1,y1,x2,y2,rad,r,g,b,a=255){
  for(let y=y1;y<y2;y++)for(let x=x1;x<x2;x++){
    const tl=(x-x1)<rad&&(y-y1)<rad,tr=(x2-x)<rad&&(y-y1)<rad
    const bl=(x-x1)<rad&&(y2-y)<rad,br=(x2-x)<rad&&(y2-y)<rad
    let ok=true
    if(tl&&Math.hypot(x-(x1+rad),y-(y1+rad))>rad)ok=false
    if(tr&&Math.hypot(x-(x2-rad),y-(y1+rad))>rad)ok=false
    if(bl&&Math.hypot(x-(x1+rad),y-(y2-rad))>rad)ok=false
    if(br&&Math.hypot(x-(x2-rad),y-(y2-rad))>rad)ok=false
    if(ok)set(x,y,r,g,b,a)
  }
}
// alpha-blend onto existing pixel
function blend(x,y,r,g,b,a){
  x=Math.round(x);y=Math.round(y);if(x<0||x>=W||y<0||y>=H)return
  const p=px[y*W+x], af=a/255, ab=1-af
  px[y*W+x]=[Math.round(p[0]*ab+r*af),Math.round(p[1]*ab+g*af),Math.round(p[2]*ab+b*af),255]
}
function shadow(x1,y1,x2,y2,spread,r=0,g=0,b=0){
  for(let s=1;s<=spread;s++){
    const a=Math.round(60*(1-s/spread))
    for(let x=x1-s;x<x2+s;x++){blend(x,y1-s,r,g,b,a);blend(x,y2+s-1,r,g,b,a)}
    for(let y=y1-s;y<y2+s;y++){blend(x1-s,y,r,g,b,a);blend(x2+s-1,y,r,g,b,a)}
  }
}

// ── Background — soft linen gradient ─────────────────────────────────────────
for(let y=0;y<H;y++){
  const t=y/H
  const r=Math.round(240-t*15), g=Math.round(238-t*12), b=Math.round(230-t*10)
  for(let x=0;x<W;x++) set(x,y,r,g,b)
}
// Subtle vignette
for(let y=0;y<H;y++)for(let x=0;x<W;x++){
  const dx=(x-W/2)/(W/2), dy=(y-H/2)/(H/2)
  const v=Math.max(0,(dx*dx+dy*dy-0.3)*0.18)
  const p=px[y*W+x]
  px[y*W+x]=[Math.round(p[0]*(1-v)),Math.round(p[1]*(1-v)),Math.round(p[2]*(1-v)),255]
}

// ── Sticky note window ────────────────────────────────────────────────────────
const NX=390, NY=60, NW=500, NH=660

// Drop shadow
shadow(NX,NY,NX+NW,NY+NH, 28)

// Window — Mac-style chrome (dark title bar)
rrect(NX, NY, NX+NW, NY+NH, 12, 242,240,225)     // body first
rrect(NX, NY, NX+NW, NY+44, 12, 52,52,52)         // title bar
fill(NX, NY+32, NX+NW, NY+44, 52,52,52)           // straighten bottom of titlebar

// Traffic lights
circle(NX+20, NY+22, 8, 255,95,86)   // red
circle(NX+44, NY+22, 8, 255,189,46)  // yellow
circle(NX+68, NY+22, 8,  40,200,64)  // green

// Window title "Sticky Note"
// draw as a thick horizontal bar (font simulation)
const titleStr = 'Sticky Note'
for(let i=0;i<titleStr.length*9;i++) {
  // simulate bold text pixels — just draw the outline
}
// Simple text: white rect blocks representing each letter
;[
 // S  t  i  c  k  y     N  o  t  e
  [0,1],[1,1],[2,1],[3,1],              // S top
  [0,2],
  [0,3],[1,3],[2,3],[3,3],             // S mid
  [3,4],
  [0,5],[1,5],[2,5],[3,5],             // S bot
].forEach(()=>{})

// Just draw "Sticky Note" as clean white pixel art at title bar
const drawPx=(x,y,pts,scale,r,g,b)=>{for(const[px2,py]of pts)fill(x+px2*scale,y+py*scale,x+px2*scale+scale,y+py*scale+scale,r,g,b)}
const GLYPHS = {
  S:[[1,0],[2,0],[3,0],[0,1],[0,2],[1,2],[2,2],[3,2],[3,4],[0,5],[1,5],[2,5]],
  t:[[1,0],[0,1],[1,1],[2,1],[1,2],[1,3],[1,4],[0,5],[1,5],[2,5]],
  i:[[1,0],[1,2],[1,3],[1,4],[1,5]],
  c:[[1,1],[2,0],[3,0],[3,2],[3,3],[3,4],[2,5],[1,5],[0,4],[0,3],[0,2]],
  k:[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[2,2],[1,3],[3,1],[3,5],[2,4]],
  y:[[0,1],[1,2],[2,3],[3,2],[4,1],[2,4],[1,5],[0,6]],
  N:[[0,0],[0,1],[0,2],[0,3],[0,4],[0,5],[1,1],[2,2],[3,3],[4,0],[4,1],[4,2],[4,3],[4,4],[4,5]],
  o:[[1,0],[2,0],[3,0],[0,1],[4,1],[0,2],[4,2],[0,3],[4,3],[1,4],[2,4],[3,4]],
  e:[[0,2],[1,1],[2,1],[3,1],[4,2],[0,3],[1,3],[2,3],[3,3],[4,3],[0,4],[1,5],[2,5],[3,5]],
}
const titleChars = ['S','t','i','c','k','y',' ','N','o','t','e']
let tx = NX + NW/2 - (titleChars.filter(c=>c!==' ').length*4 + titleChars.filter(c=>c===' ').length*3) * 2
for(const ch of titleChars){
  if(ch===' '){tx+=8;continue}
  drawPx(tx, NY+10, GLYPHS[ch]||[], 2, 255,255,255)
  tx+=12
}

// ── App header (yellow-ish, inside window) ─────────────────────────────────
fill(NX, NY+44, NX+NW, NY+88, 218,205,90)
// 📌 Sticky Note text — dark
drawPx(NX+42, NY+54, GLYPHS['S']||[], 2, 80,60,0)
let hx=NX+56; for(const ch of ['t','i','c','k','y']){drawPx(hx,NY+54,GLYPHS[ch]||[],2,80,60,0);hx+=12}
hx+=8; for(const ch of ['N','o','t','e']){drawPx(hx,NY+54,GLYPHS[ch]||[],2,80,60,0);hx+=12}

// Minimize + close buttons in app header
rrect(NX+NW-62, NY+54, NX+NW-38, NY+78, 5, 195,180,65)
rrect(NX+NW-32, NY+54, NX+NW-8,  NY+78, 5, 195,180,65)
// — line (minimize icon)
fill(NX+NW-56,NY+65,NX+NW-44,NY+68, 80,65,0)
// × (close icon)
for(let d=-5;d<=5;d++){set(NX+NW-20+d,NY+66+d,80,65,0);set(NX+NW-20+d,NY+66-d,80,65,0)}

// ── Note body ─────────────────────────────────────────────────────────────────
fill(NX, NY+88, NX+NW, NY+NH-46, 255,250,210)

// Placeholder text lines
const noteLines = [
  '- Team sync at 3:00 PM',
  '- Review design mockups',
  '- Follow up with client',
  '- Deploy to production',
  '',
  '- Buy groceries',
]
for(let li=0;li<noteLines.length;li++){
  const line=noteLines[li], ly=NY+115+li*36
  for(let ci=0;ci<line.length;ci++){
    if(line[ci]===' ')continue
    fill(NX+20+ci*9, ly, NX+20+ci*9+7, ly+13, 80,65,10, 180)
  }
}

// ── Footer ─────────────────────────────────────────────────────────────────
fill(NX, NY+NH-46, NX+NW, NY+NH, 210,197,75)
rrect(NX, NY+NH-46, NX+NW, NY+NH, 12, 210,197,75)
fill(NX, NY+NH-46, NX+NW, NY+NH-34, 210,197,75)

// Page nav buttons  ◀  1/1  ▶  +  🗑
for(const bx of [NX+14, NX+74, NX+130, NX+162])
  rrect(bx, NY+NH-38, bx+30, NY+NH-10, 5, 188,175,55)

// ◀ triangle
fill(NX+24,NY+NH-30, NX+26,NY+NH-18, 80,65,0)
fill(NX+26,NY+NH-28, NX+28,NY+NH-20, 80,65,0)
// ▶ triangle
fill(NX+140,NY+NH-30, NX+142,NY+NH-18, 80,65,0)
fill(NX+138,NY+NH-28, NX+140,NY+NH-20, 80,65,0)

// 1/1 label
fill(NX+82,NY+NH-32, NX+90,NY+NH-22, 80,65,0)
fill(NX+92,NY+NH-32, NX+98,NY+NH-14, 80,65,0)
fill(NX+100,NY+NH-32, NX+108,NY+NH-22, 80,65,0)

// Font size A- 18 A+
for(const bx of [NX+NW-200, NX+NW-130, NX+NW-62])
  rrect(bx, NY+NH-38, bx+56, NY+NH-10, 5, 188,175,55)

// Color swatches
circle(NX+NW-32, NY+NH-24, 12, 255,250,210)
circle(NX+NW-32, NY+NH-24, 12, 180,165,50, 0)
for(let d=-11;d<=11;d++)for(let d2=-11;d2<=11;d2++)if(Math.hypot(d,d2)<=11&&Math.hypot(d,d2)>9.5)set(NX+NW-32+d,NY+NH-24+d2,160,145,40)
circle(NX+NW-6, NY+NH-24, 12, 50,40,10)

// ── Badge tag ─────────────────────────────────────────────────────────────────
rrect(NX, NY-52, NX+280, NY-16, 8, 80,100,220)
let bx2=NX+12; for(const ch of ['S','t','i','c','k','y']){drawPx(bx2,NY-44,GLYPHS[ch]||[],2,255,255,255);bx2+=12}
bx2+=8; for(const ch of ['N','o','t','e']){drawPx(bx2,NY-44,GLYPHS[ch]||[],2,255,255,255);bx2+=12}

// ── Tagline text beneath ──────────────────────────────────────────────────────
// draw a subtle underline row to represent tagline
fill(NX, NY+NH+20, NX+NW, NY+NH+22, 160,155,140, 120)

mkdirSync('screenshots', {recursive:true})
const buf = await makePng(W, H, px)
writeFileSync('screenshots/store-screenshot.png', buf)
console.log(`✓ screenshots/store-screenshot.png  (${W}×${H},  ${(buf.length/1024).toFixed(1)} KB)`)
