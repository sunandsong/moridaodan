// @ts-nocheck
// 末日防线：游戏核心（物理、关卡、绘制、界面）。
// 这份代码从网页原型 prototype/up.html 移植而来，不依赖 Cocos 的节点系统：
// 它把整个画面画在一张离屏画布上，由 Game.ts 每帧上传成贴图显示。
import Matter from 'matter-js';

export function createGame(host){
const {Engine,Bodies,Body,Composite,Events}=Matter;
const W=540,H=960,G=880,OX=110,OY=782,PMAX=105,VK=.2,DT=1000/60,GR=.001*DT*DT,KD=8,THR=1.2;
const cv=host.canvas,ctx=cv.getContext('2d'),SCL=host.scale||2;let UI={mode:'menu'};
const MAT={bis:{hp:55,den:.001,c:'#d59a55',d:'#7a4a1e'},ice:{hp:22,den:.0008,c:'#f6d873',d:'#9a7a2a'},cho:{hp:150,den:.002,c:'#bcc2cc',d:'#5a606c'},tnt:{hp:10,den:.001,c:'#f04f4f',d:'#7a1414'}};
const TG={pot:{hp:16,r:16,c:'#a8dc6c',d:'#3a4f26'},cooker:{hp:42,r:20,c:'#c59bee',d:'#2f3d52'}};
const AM={sugar:{r:11,den:.004,name:'火箭弹',tip:'火箭弹：命中就爆炸'},chili:{r:10,den:.004,name:'集束导弹',tip:'集束导弹：飞行中再点一下屏幕，分裂成三枚'},melon:{r:15,den:.005,name:'巡航导弹',tip:'巡航导弹：命中后大范围爆炸，也可以点屏幕提前引爆'},guided:{r:10,den:.004,name:'制导导弹',tip:'制导导弹：飞行中点屏幕上任意位置，导弹会转向直飞过去'}};

function kit(){const out=[];
  const B=(m,x,bot,w,h)=>out.push({k:'b',m,x,y:bot-h/2,w,h});
  const T=(t,x,bot)=>out.push({k:'t',t,x,y:bot-TG[t].r});
  const S=(x,top,w)=>out.push({k:'s',x,y:top+7,w,h:14});
  const house=(x,bot,m,t,w=64)=>{B(m,x-w/2,bot,14,64);B(m,x+w/2,bot,14,64);B(m,x,bot-64,w+30,12);if(t)T(t,x,bot);return bot-76};
  return {out,B,T,S,house}}
const LV=[
 {name:'新兵训练',ammo:['sugar','sugar','sugar'],f:k=>{k.S(380,640,130);k.house(380,640,'bis','pot')}},
 {name:'双子哨所',ammo:['sugar','sugar','sugar','sugar'],f:k=>{k.S(400,690,120);k.house(400,690,'bis','pot');k.S(210,470,120);k.house(210,470,'ice','pot')}},
 {name:'二层岗楼',ammo:['sugar','sugar','sugar'],f:k=>{k.S(360,570,140);const t=k.house(360,570,'bis','pot');k.house(360,t,'ice','pot')}},
 {name:'悬空掩体',ammo:['sugar','chili','sugar','sugar'],f:k=>{k.S(330,705,170);k.S(385,600,150);k.house(375,600,'bis','pot');k.B('tnt',444,600,26,26);k.S(170,420,110);k.house(170,420,'ice','pot')}},
 {name:'前沿三哨',ammo:['guided','guided','chili','guided','sugar'],f:k=>{k.S(420,700,120);k.house(420,700,'ice','pot');k.S(250,520,120);k.house(250,520,'ice','pot');k.S(420,340,120);k.house(420,340,'ice','pot')}},
 {name:'钢筋碉堡',ammo:['guided','melon','sugar','sugar'],f:k=>{k.S(370,560,170);const t=k.house(360,560,'cho','cooker',70);k.T('pot',360,t);k.B('tnt',436,560,26,26)}},
 {name:'瞭望高塔',ammo:['sugar','guided','melon','sugar'],f:k=>{k.S(380,720,170);let t=k.house(370,720,'bis','cooker',70);t=k.house(370,t,'bis','pot',70);k.house(370,t,'ice','pot',70);k.B('tnt',446,720,26,26)}},
 {name:'总攻',ammo:['guided','chili','melon','sugar','sugar'],f:k=>{k.S(425,730,150);k.house(425,730,'cho','pot',70);k.S(275,540,170);const t=k.house(265,540,'bis','cooker',70);k.house(265,t,'bis','pot',70);k.B('tnt',342,540,26,26);k.S(420,330,130);k.house(420,330,'ice','pot')}},
];

let save={stars:[]};try{save=JSON.parse(host.storage.get('up_v1'))||save}catch(e){}
const put=()=>{try{host.storage.set('up_v1',JSON.stringify(save))}catch(e){}};
let engine,S=null,dead=new Set(),booms=[],noSave=false;

function add(b,g){b.g=g;Composite.add(engine.world,b);return b}
function load(i){
  engine=Engine.create();engine.positionIterations=10;engine.velocityIterations=8;
  Events.on(engine,'collisionStart',onCol);
  add(Bodies.rectangle(W/2,G+60,4000,120,{isStatic:true,friction:1}),{kind:'ground'});
  const k=kit();LV[i].f(k);let seed=1;
  for(const o of k.out){
    if(o.k==='b'){const m=MAT[o.m];add(Bodies.rectangle(o.x,o.y,o.w,o.h,{density:m.den,friction:.8,restitution:.02}),{kind:'block',m:o.m,hp:m.hp,max:m.hp,w:o.w,h:o.h,seed:seed++})}
    else if(o.k==='t'){const t=TG[o.t];add(Bodies.circle(o.x,o.y,t.r,{density:.001,friction:.6,restitution:.1}),{kind:'target',t:o.t,hp:t.hp,max:t.hp,r:t.r})}
    else add(Bodies.rectangle(o.x,o.y,o.w,o.h,{isStatic:true,friction:1}),{kind:'shelf',w:o.w,h:o.h});
  }
  S={lv:i,ammo:LV[i].ammo.slice(),state:'aim',settle:50,cur:null,ft:0,hitT:-1,fx:[],trail:[],last:[],drag:null,winT:0,wt:0,calm:0,over:false,t:0};
  dead.clear();booms=[];UI={mode:'play'};
}
const bodies=()=>Composite.allBodies(engine.world);
const targets=()=>bodies().filter(b=>b.g.kind==='target');

function onCol(ev){
  if(S.settle>0)return;
  for(const p of ev.pairs){const a=p.bodyA,b=p.bodyB,n=p.collision.normal;
    const vn=Math.abs((a.velocity.x-b.velocity.x)*n.x+(a.velocity.y-b.velocity.y)*n.y);
    const ma=a.isStatic?1e9:a.mass,mb=b.isStatic?1e9:b.mass,imp=vn*ma*mb/(ma+mb);
    for(const s of [a,b])if(s.g.kind==='shot'){if(!s.g.hit){s.g.hit=1;if(S.hitT<0)S.hitT=S.ft}if(!s.g.bang){s.g.bang=1;booms.push(s)}}
    if(imp<THR)continue;const d=(imp-THR)*KD;hurt(a,d);hurt(b,d);
  }
}
function hurt(b,d){const g=b.g;if(g.kind!=='block'&&g.kind!=='target')return;g.hp-=d;g.flash=.18;if(g.hp<=0)dead.add(b)}
function puff(x,y,col,n,sp){for(let i=0;i<n;i++){const a=Math.random()*6.28,v=sp*(.3+Math.random());S.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-1,life:.5+Math.random()*.4,col,r:2+Math.random()*4})}}
function kill(b){if(b.g.gone)return;b.g.gone=1;Composite.remove(engine.world,b)}
const BM={sugar:[72,54],chili:[72,54],mini:[50,30],guided:[92,70],melon:[115,95]};
function boom(s,R=115,D=95){const k=R/115;const x=s.position.x,y=s.position.y;kill(s);
  for(const b of bodies()){if(b.isStatic)continue;const dx=b.position.x-x,dy=b.position.y-y,d=Math.hypot(dx,dy)||1;if(d>R)continue;const f=1-d/R;
    hurt(b,D*Math.sqrt(f));Body.setVelocity(b,{x:b.velocity.x+dx/d*11*k*f,y:b.velocity.y+dy/d*11*k*f-2*f})}
  puff(x,y,'#ff8a3a',8+18*k|0,3+4*k);puff(x,y,'#ffd65c',5+9*k|0,2+3*k);puff(x,y,'#5a5a5a',6*k|0,3);S.fx.push({ring:1,x,y,life:.35,R});S.shake=.3*k;S.fx.push({txt:k>.9?'轰!':'砰!',x,y:y-R*.45,life:.6})}
function fire(vx,vy,px=OX,py=OY){
  if(S.state!=='aim'||!S.ammo.length||S.over)return false;
  const type=S.ammo.shift(),a=AM[type];
  S.cur=add(Bodies.circle(px,py,a.r,{density:a.den,friction:.6,restitution:.25,frictionAir:0}),{kind:'shot',type,r:a.r});
  Body.setVelocity(S.cur,{x:vx,y:vy});Body.setAngularVelocity(S.cur,.12);
  S.state='fly';S.ft=0;S.hitT=-1;S.trail=[];return true}
function tap(tx,ty){const c=S.cur;if(S.state!=='fly'||!c||c.g.gone||c.g.used||c.g.hit)return;
  if(c.g.type==='melon'){c.g.used=1;c.g.bang=1;booms.push(c)}
  else if(c.g.type==='guided'){if(tx==null)return;const dx=tx-c.position.x,dy=ty-c.position.y,d=Math.hypot(dx,dy)||1,sp=Math.max(14,c.speed*1.15);c.g.used=1;c.g.straight=1;Body.setVelocity(c,{x:dx/d*sp,y:dy/d*sp});S.fx.push({ring:1,x:tx,y:ty,life:.35,R:22})}
  else if(c.g.type==='chili'){c.g.used=1;const v=c.velocity,sp=Math.hypot(v.x,v.y)*1.05,an=Math.atan2(v.y,v.x),{x,y}=c.position;kill(c);
    [-.2,0,.2].forEach((d,i)=>{const s=add(Bodies.circle(x,y+d*40,8,{density:.006,friction:.6,restitution:.25,frictionAir:0}),{kind:'shot',type:'mini',r:8});
      Body.setVelocity(s,{x:Math.cos(an+d)*sp,y:Math.sin(an+d)*sp});if(i===1)S.cur=s});puff(x,y,'#ffb347',10,3)}}
function tick(){
  Engine.update(engine,DT);S.t++;if(S.settle>0)S.settle--;
  for(const s of booms.splice(0))if(!s.g.gone)boom(s,...BM[s.g.type]);
  for(const b of dead){if(b.g.gone)continue;const g=b.g,{x,y}=b.position;kill(b);
    if(g.kind==='target'){puff(x,y,'#fff',14,4);puff(x,y,TG[g.t].c,8,3);S.fx.push({txt:'消灭!',x,y:y-20,life:.9})}else if(g.m==='tnt'){b.g.gone=0;boom(b)}else puff(x,y,MAT[g.m].c,8,3)}
  dead.clear();
  for(const b of bodies()){const g=b.g,p=b.position;if(b.isStatic)continue;
    if(p.x<-150||p.x>W+150||p.y>H+150){kill(b);continue}
    if(g.kind==='shot'&&!g.hit){if(g.straight)Body.applyForce(b,p,{x:0,y:-b.mass*.001});if(S.t%2===0&&S.fx.length<300)S.fx.push({sm:1,x:p.x-b.velocity.x,y:p.y-b.velocity.y,vx:0,vy:-.15,life:.55,col:'#4a4046',r:3.5})}
    if(g.kind==='shot'&&g.hit&&++g.hit>220){puff(p.x,p.y,'#fff',6,2);kill(b)}
    if(g.flash>0)g.flash-=1/60}
  if(S.state==='fly'){S.ft++;const c=S.cur;if(!c.g.gone&&!c.g.hit&&S.ft%3===0)S.trail.push([c.position.x,c.position.y]);
    if(c.g.gone||(S.hitT>=0&&S.ft-S.hitT>60)||S.ft>420){S.state=S.ammo.length?'aim':'wait';S.wt=0;S.calm=0;S.last=S.trail}}
  if(!S.over){
    if(!targets().length){if(++S.winT>45)finish(true)}
    else if(S.state==='wait'){S.wt++;let mx=0;for(const b of bodies())if(!b.isStatic)mx=Math.max(mx,b.speed);S.calm=mx<.25?S.calm+1:0;if(S.calm>50||S.wt>500)finish(false)}}
}
function finish(win){S.over=true;S.win=win;const left=S.ammo.length,st=win?(left>=2?3:left===1?2:1):0;S.stars=st;
  if(win&&!noSave){save.stars[S.lv]=Math.max(save.stars[S.lv]||0,st);put()}
  if(noSave)return;UI={mode:'result',win,st,left,n:targets().length,t:0}}
function menu(){UI={mode:'menu'}}

// ---------- 输入（由 Cocos 组件转发，坐标是 540x960 设计坐标，原点在左上） ----------
function pull(){const d=S.drag;if(!d)return null;let dx=d.x-d.sx,dy=d.y-d.sy;const l=Math.hypot(dx,dy);if(l>PMAX){dx*=PMAX/l;dy*=PMAX/l}
  const r=AM[S.ammo[0]].r;if(OY+dy>G-r-2)dy=G-r-2-OY;return {dx,dy,l:Math.hypot(dx,dy)}}
function down(x,y){if(uiTap(x,y))return;if(!S||S.over||UI.mode!=='play')return;
  if(S.state==='aim'&&S.ammo.length)S.drag={sx:x,sy:y,x,y};else if(S.state==='fly')tap(x,y)}
function move(x,y){if(S&&S.drag){S.drag.x=x;S.drag.y=y}}
function up(){if(!S||!S.drag)return;const p=pull();S.drag=null;if(p&&p.l>14)fire(-p.dx*VK,-p.dy*VK)}
function cancel(){if(S)S.drag=null}

// ---------- 绘制（蜡笔末日风） ----------
const INK='#17110f',PAPER='#d9cdb2',LITE='#f0e6d0',FONT='"Hannotate SC","HanziPen SC","Yuanti SC","Kaiti SC",cursive,sans-serif';
let C=ctx,BO=0;
function jr(seed){let t=((seed*7919+BO*10473)%233280+233280)%233280;return ()=>{t=(t*9301+49297)%233280;return t/233280-.5}}
function blob(P){const n=P.length,m=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2],s=m(P[n-1],P[0]);C.beginPath();C.moveTo(s[0],s[1]);for(let i=0;i<n;i++){const e=m(P[i],P[(i+1)%n]);C.quadraticCurveTo(P[i][0],P[i][1],e[0],e[1])}C.closePath()}
function wrect(x,y,w,h,seed,j=1.3){const r=jr(seed),q=(a,b)=>[a+r()*j*2,b+r()*j*2],e=1.5;
  blob([q(x-e,y-e),q(x+w/2,y),q(x+w+e,y-e),q(x+w,y+h/2),q(x+w+e,y+h+e),q(x+w/2,y+h),q(x-e,y+h+e),q(x,y+h/2)])}
function wcirc(x,y,rad,seed,j=1){const r=jr(seed),P=[];for(let i=0;i<9;i++){const a=i/9*6.283,d=rad*1.05+r()*j*2;P.push([x+Math.cos(a)*d,y+Math.sin(a)*d])}blob(P)}
function wline(x1,y1,x2,y2,seed,j=1.5){const r=jr(seed);C.beginPath();C.moveTo(x1+r()*j,y1+r()*j);C.quadraticCurveTo((x1+x2)/2+r()*j*2.5,(y1+y2)/2+r()*j*2.5,x2+r()*j,y2+r()*j)}
function dot(x,y,r,col){C.beginPath();C.arc(x,y,r,0,7);C.fillStyle=col||INK;C.fill()}
// 蜡笔留白纹理：涂色后再盖一层纸色的碎笔触，露出“没涂满”的纸
const GAP=(()=>{const t=document.createElement('canvas');t.width=t.height=128;const c=t.getContext('2d'),q=jr(5),R=()=>q()+.5;c.lineCap='round';
  for(let i=0;i<170;i++){const x=R()*128,y=R()*128,a=-.9+q()*.7,l=8+R()*26;c.strokeStyle=`rgba(217,205,178,${.1+R()*.42})`;c.lineWidth=.6+R()*1.9;
    for(const ox of [-128,0,128])for(const oy of [-128,0,128]){c.beginPath();c.moveTo(x+ox,y+oy);c.lineTo(x+ox+Math.cos(a)*l,y+oy+Math.sin(a)*l);c.stroke()}}
  for(let i=0;i<600;i++){c.fillStyle=`rgba(217,205,178,${R()*.5})`;c.fillRect(R()*128,R()*128,1.2,1.2)}return t})();
const PG=ctx.createPattern(GAP,'repeat');
function cfill(col){const live=C===ctx;if(live){C.lineJoin='round';C.strokeStyle=LITE;C.lineWidth=6.5;C.stroke()}C.fillStyle=col;C.fill();C.save();C.translate(BO*37,BO*23);C.globalAlpha=live?.45:1;C.fillStyle=PG;C.fill();C.restore()}
function ink(fill,lw=2.6){if(fill)cfill(fill);C.lineJoin=C.lineCap='round';C.strokeStyle=INK;C.lineWidth=lw;C.stroke();C.save();C.translate(BO*37,BO*23);C.strokeStyle=PG;C.globalAlpha=C===ctx?.3:.55;C.lineWidth=lw+.6;C.stroke();C.restore()}
const bg=document.createElement('canvas');bg.width=W*2;bg.height=H*2;
(()=>{C=bg.getContext('2d');C.scale(2,2);C.fillStyle=PAPER;C.fillRect(0,0,W,H);const q=jr(3),R=()=>q()+.5;
  const st=[[0,[34,10,16]],[.42,[122,24,26]],[.8,[214,96,34]],[1,[240,170,60]]];
  const sky=y=>{const t=Math.max(0,Math.min(.999,y/G));let i=0;while(st[i+1][0]<t)i++;const a=st[i],b=st[i+1],k=(t-a[0])/(b[0]-a[0]);return a[1].map((v,j)=>v+(b[1][j]-v)*k|0)};
  for(let y=0;y<G;y+=6){C.fillStyle=`rgba(${sky(y)},.8)`;C.fillRect(0,y,W,6)}
  C.lineCap='round';for(let i=0;i<1500;i++){const x=R()*W,y=R()*G,a=-.45+q()*.5,l=30+R()*70;C.strokeStyle=`rgba(${sky(y+q()*70)},.55)`;C.lineWidth=3+R()*4;C.beginPath();C.moveTo(x,y);C.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);C.stroke()}
  C.save();C.translate(W-930,70);
  for(let i=0;i<26;i++){const a=i*.2417+q()*.1,d=64+R()*22;wline(800+Math.cos(a)*46,96+Math.sin(a)*46,800+Math.cos(a)*d,96+Math.sin(a)*d,i+9);C.strokeStyle='rgba(240,150,50,.8)';C.lineWidth=3;C.stroke()}
  wcirc(800,96,42,5);ink('#120a0a',4);
  C.fillStyle='#ff3b2e';C.beginPath();C.moveTo(780,84);C.lineTo(794,93);C.lineTo(780,95);C.closePath();C.fill();C.beginPath();C.moveTo(820,84);C.lineTo(806,93);C.lineTo(820,95);C.closePath();C.fill();
  C.beginPath();C.moveTo(779,108);for(let i=1;i<=8;i++)C.lineTo(779+i*5.2,108+(i%2?8:1));C.strokeStyle='#ff3b2e';C.lineWidth=2.6;C.lineJoin='round';C.stroke();C.restore();
  for(const sx of [120,430,640]){for(let i=0;i<9;i++){wcirc(sx+i*7+q()*10,G-90-i*22,12+i*2.2,sx+i);C.strokeStyle='rgba(23,17,15,.42)';C.lineWidth=5;C.stroke()}}
  let x=-10;while(x<W+10){const w=26+R()*44,h=24+R()*70,n=3+(R()*3|0);C.beginPath();C.moveTo(x,G);C.lineTo(x+q()*4,G-h);for(let i=1;i<=n;i++)C.lineTo(x+w*i/n,G-h+(i%2?R()*22:-R()*8));C.lineTo(x+w,G);C.closePath();cfill('#4a1716');C.strokeStyle='rgba(23,17,15,.7)';C.lineWidth=2;C.stroke();
    for(let k=0;k<3;k++)if(R()<.4)dot(x+6+R()*(w-12),G-8-R()*(h-24),1.8,'rgba(255,190,80,.9)');x+=w+R()*16}
  for(const [tx,k] of [[30,1],[W-28,-1]]){C.strokeStyle=INK;C.lineWidth=7;wline(tx,G,tx+k*6,G-95,tx);C.stroke();C.lineWidth=4;wline(tx+k*4,G-60,tx+k*34,G-100,tx+1);C.stroke();wline(tx+k*5,G-80,tx-k*22,G-118,tx+2);C.stroke();C.lineWidth=2.5;wline(tx+k*22,G-85,tx+k*30,G-125,tx+3);C.stroke();wline(tx-k*12,G-100,tx-k*28,G-104,tx+4);C.stroke()}
  C.fillStyle=PG;C.fillRect(0,0,W,G);
  C.fillStyle='#241b17';C.fillRect(0,G,W,H-G);for(let i=0;i<260;i++){const gx=R()*W,gy=G+R()*(H-G),l=20+R()*50;C.strokeStyle=R()<.5?'rgba(70,45,32,.6)':'rgba(15,10,10,.6)';C.lineWidth=3+R()*3;C.beginPath();C.moveTo(gx,gy);C.lineTo(gx+l,gy+q()*6);C.stroke()}
  C.fillStyle=PG;C.fillRect(0,G,W,H-G);
  C.beginPath();C.moveTo(-5,G);for(let gx=20;gx<=W+20;gx+=40)C.quadraticCurveTo(gx-20,G+q()*3,gx,G+q()*2);C.strokeStyle=INK;C.lineWidth=3.5;C.stroke();
  for(let gx=50;gx<W;gx+=120){const cx=gx+q()*50;C.beginPath();C.moveTo(cx,G+2);C.lineTo(cx+6,G+16);C.lineTo(cx-4,G+28);C.lineTo(cx+8,G+44);C.moveTo(cx+6,G+16);C.lineTo(cx+20,G+22);C.strokeStyle='rgba(0,0,0,.8)';C.lineWidth=2;C.stroke()}
  for(const sx of [330,480]){C.fillStyle=PAPER;C.fillRect(sx-4,G+44,8,6);C.strokeStyle=INK;C.lineWidth=1.2;C.strokeRect(sx-4,G+44,8,6);wcirc(sx,G+38,8,sx,.5);ink(PAPER,2);dot(sx-3,G+38,1.9,INK);dot(sx+3,G+38,1.9,INK)}
  C=ctx})();
const SC={sugar:['#fbf6ea','#ef4b4b',11],chili:['#fbf6ea','#f5b82e',23],mini:['#fbf6ea','#f5b82e',37],melon:['#a8cc6a','#ef4b4b',41],guided:['#fbf6ea','#4a8ee0',53]};
function drawShot(type,x,y,an,r,fl){const [c0,c1,sd]=SC[type],L=r*1.5,w=r*.66;C.save();C.translate(x,y);C.rotate(an);
  if(fl){const f=Math.random();blob([[-L,-w*.8],[-L-r*(.9+f),-w*.2],[-L-r*(1.5+f),0],[-L-r*(.9+f),w*.3],[-L,w*.8]]);ink('#f08a2a',1.8);blob([[-L,-w*.4],[-L-r*.8,0],[-L,w*.4]]);C.fillStyle='#f2d23a';C.fill()}
  for(const d of [-1,1]){blob([[-L+r*.1,d*w*.8],[-L-r*.5,d*(w+r*.75)],[-L+r*.9,d*w*.9]]);ink(c1,2)}
  const body=()=>{const q=jr(sd);blob([[-L*1.05,0],[-L,-w],[0,-w*1.12],[L*.65,-w],[L*1.3,0],[L*.65,w],[0,w*1.12],[-L,w]].map(p=>[p[0]+q(),p[1]+q()]))};
  body();cfill(c0);C.save();C.clip();C.fillStyle=c1;C.fillRect(-L*1.2,-w*2,L*.34,w*4);C.fillRect(-L*.3,-w*2,L*.2,w*4);C.restore();body();ink(null,2.4);
  if(r>8.5){dot(L*.6,-w*.3,2,'#fff');dot(L*.65,-w*.3,1.1,'#b3261e');C.beginPath();C.moveTo(L*.28,w*.3);for(let i=1;i<=6;i++)C.lineTo(L*.28+i*L*.115,w*.3+(i%2?w*.36:-w*.04)*(1-i*.09));C.strokeStyle=INK;C.lineWidth=1.5;C.lineJoin='round';C.stroke()}
  C.restore()}
function drawBody(b){const g=b.g,p=b.position;C.save();C.translate(p.x,p.y);C.rotate(b.angle);
  if(g.kind==='block'){const m=MAT[g.m],w=g.w,h=g.h,hz=w>h,sd=g.seed;wrect(-w/2,-h/2,w,h,sd);cfill(m.c);
    C.strokeStyle=m.d;C.lineWidth=1.6;C.lineCap='round';
    if(g.m==='bis'){if(hz){wline(-w/2+6,-1.5,w/2-8,-1,sd+1);C.stroke();wline(-w/4,2.5,w/4,3,sd+2);C.stroke()}else{wline(-1.5,-h/2+6,-1,h/2-8,sd+1);C.stroke();wline(2.5,-h/4,3,h/4,sd+2);C.stroke()}}
    else if(g.m==='cho'){for(let i=0;i<4;i++){const t=(i+.5)/4-.5;hz?dot(t*w,i%2?2:-2,1.5,m.d):dot(i%2?2:-2,t*h,1.5,m.d)}}
    else if(g.m==='ice'){C.strokeStyle='#8a3a1a';C.lineWidth=2.5;hz?wline(-w/2+6,1,-w/2+w*.45,-1,sd+1):wline(1,-h/2+6,-1,-h/2+h*.45,sd+1);C.stroke()}
    else{C.fillStyle=LITE;C.font='700 10px '+FONT;C.textAlign='center';C.fillText('TNT',0,3.5)}
    wrect(-w/2,-h/2,w,h,sd);ink(null);
    if(g.hp<g.max*.6){const k=(sd*37%10)/10-.5;C.beginPath();if(hz){C.moveTo(k*w*.5,-h/2);C.lineTo(k*w*.5+4,0);C.lineTo(k*w*.5-3,h/2)}else{C.moveTo(-w/2,k*h*.5);C.lineTo(0,k*h*.5+4);C.lineTo(w/2,k*h*.5-3)}C.strokeStyle=INK;C.lineWidth=1.8;C.stroke()}
    if(g.flash>0){C.globalAlpha=Math.min(1,g.flash*3);wrect(-w/2,-h/2,w,h,sd);C.fillStyle='#fff';C.fill();C.globalAlpha=1}}
  else if(g.kind==='target'){const t=TG[g.t],r=g.r,hurtF=g.hp<g.max*.55,big=g.t==='cooker',sd=r*7+3;
    if(big)for(const k of [-1,1]){blob([[k*r*.35,-r*.8],[k*r*1.05,-r*1.55],[k*r*.9,-r*.55]]);ink(PAPER,2)}
    wcirc(0,0,r,sd,1.3);ink(t.c);
    dot(-r*.6,r*.36,r*.16,'rgba(240,90,110,.45)');dot(r*.62,r*.36,r*.16,'rgba(240,90,110,.45)');
    C.strokeStyle=INK;C.lineWidth=1.6;C.beginPath();C.moveTo(-r*.6,-r*.62);C.lineTo(r*.05,-r*.5);for(let i=0;i<3;i++){const sx=-r*.5+i*r*.22,sy=-r*.6+i*r*.04;C.moveTo(sx,sy-3);C.lineTo(sx+1,sy+3)}C.stroke();
    if(hurtF){for(const k of [-1,1]){const ex=k*r*.38,ey=-r*.02;C.beginPath();C.moveTo(ex-3.5,ey-3.5);C.lineTo(ex+3.5,ey+3.5);C.moveTo(ex+3.5,ey-3.5);C.lineTo(ex-3.5,ey+3.5);C.strokeStyle=INK;C.lineWidth=2.4;C.stroke()}}
    else if(big){dot(0,-r*.08,r*.38,'#f2d23a');C.beginPath();C.arc(0,-r*.08,r*.38,0,7);C.strokeStyle=INK;C.lineWidth=1.8;C.stroke();C.beginPath();C.ellipse(0,-r*.08,r*.08,r*.28,0,0,7);C.fillStyle=INK;C.fill()}
    else{dot(-r*.36,-r*.05,r*.27,'#f4efe4');dot(r*.4,0,r*.17,'#f4efe4');C.strokeStyle=INK;C.lineWidth=1.5;C.beginPath();C.arc(-r*.36,-r*.05,r*.27,0,7);C.stroke();C.beginPath();C.arc(r*.4,0,r*.17,0,7);C.stroke();dot(-r*.32,-r*.02,r*.09,'#b3261e');dot(r*.42,r*.02,r*.07,'#b3261e')}
    C.beginPath();C.moveTo(-r*.55,r*.46);for(let i=1;i<=6;i++)C.lineTo(-r*.55+i*r*.183,r*.46+(i%2?r*.22:0));C.strokeStyle=INK;C.lineWidth=2;C.lineJoin='round';C.stroke();
    if(g.flash>0){C.globalAlpha=Math.min(1,g.flash*3);wcirc(0,0,r,sd);C.fillStyle='#fff';C.fill();C.globalAlpha=1}}
  else if(g.kind==='shelf'){C.strokeStyle=INK;C.lineWidth=3;wline(-g.w/2+14,g.h/2,-g.w/2+16,g.h/2+26,90);C.stroke();wline(-g.w/2+16,g.h/2+26,-g.w/2+42,g.h/2,91);C.stroke();wline(g.w/2-14,g.h/2,g.w/2-16,g.h/2+26,92);C.stroke();wline(g.w/2-16,g.h/2+26,g.w/2-42,g.h/2,93);C.stroke();wrect(-g.w/2,-g.h/2,g.w,g.h,94);ink('#d59a55')}
  C.restore();if(g.kind==='shot')g.hit?drawShot(g.type,p.x,p.y,b.angle,g.r):drawShot(g.type,p.x,p.y,Math.atan2(b.velocity.y,b.velocity.x),g.r,1)}
function star(x,y,R,ph){C.beginPath();for(let i=0;i<20;i++){const a=i*.3142+ph,d=i%2?R*.62:R;C.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d)}C.closePath()}
function drawWorld(){BO=(performance.now()/170|0)%3;C=ctx;const T=performance.now()/1000;
  C.setTransform(SCL,0,0,SCL,0,0);C.drawImage(bg,0,0,W,H);if(!S)return;
  for(let i=0;i<34;i++)dot((i*137.5+T*(8+i%5*4))%W,(i*71.3+T*(14+i%7*5))%G,1.2+i%3*.6,'rgba(25,15,15,.55)');
  for(let i=0;i<14;i++)dot((i*211+Math.sin(T+i)*24+W)%W,G-((i*53+T*(18+i%4*8))%G),1.6,'rgba(255,180,70,.85)');
  if(S.shake>0){S.shake-=1/60;C.translate((Math.random()-.5)*8*S.shake/.3,(Math.random()-.5)*8*S.shake/.3)}
  for(const q of S.last)dot(q[0],q[1],2,'rgba(23,17,15,.4)');
  for(const q of S.trail)dot(q[0],q[1],2.4,'#f2d23a');
  const p=pull(),sx=OX,sy=OY;
  for(const b of bodies())if(b.g.kind!=='ground')drawBody(b);
  const ang=p&&p.l>14?Math.atan2(-p.dy,-p.dx):(S.ang==null?-1.1:S.ang);S.ang=ang;const rec=p?p.l/PMAX*10:0;
  wrect(OX-54,OY+31,108,G-OY-29,61);ink('#a9aeb8');
  for(let i=0;i<6;i++){wline(OX-44+i*17,OY+45,OX-36+i*17,OY+36,62+i);C.strokeStyle='#d9a520';C.lineWidth=4;C.lineCap='round';C.stroke()}
  wrect(OX-44,OY+8,82,15,63);ink('#8fb45a');
  wrect(OX-52,OY-9,24,30,64);ink('#a6c96e');wrect(OX-48,OY-5,13,10,65,.6);ink('#bfe9f7',1.8);
  for(const x of [OX-34,OX-6,OX+24]){wcirc(x,OY+24,7.5,66+x,.6);ink('#17110f');dot(x,OY+24,2.5,PAPER)}
  C.save();C.translate(OX+4,OY+2);C.rotate(ang);wrect(-20-rec*.4,-11,56,22,70);ink('#7a9e48');for(const yy of [-5,5])dot(30-rec*.4,yy,3.4,INK);C.restore();
  if(p&&p.l>14){let x=sx,y=sy,vx=-p.dx*VK,vy=-p.dy*VK;for(let i=1;i<=42;i++){vy+=GR;x+=vx;y+=vy;if(y>G)break;if(i%3===0){dot(x,y,3.6-i*.04,INK);dot(x,y,2.4-i*.03,LITE)}}}
  for(let i=0;i<S.ammo.length;i++){const t=S.ammo[i],r=AM[t].r*.8;drawShot(t,OX+78+i*21,G-r*1.5-3,-1.571,r)}
  for(let i=S.fx.length-1;i>=0;i--){const f=S.fx[i];f.life-=1/60;if(f.life<=0){S.fx.splice(i,1);continue}
    if(f.ring){if(f.R<30){wcirc(f.x,f.y,f.R*.7,9);C.strokeStyle='#ff3b2e';C.lineWidth=3;C.stroke();C.beginPath();C.moveTo(f.x-f.R,f.y);C.lineTo(f.x+f.R,f.y);C.moveTo(f.x,f.y-f.R);C.lineTo(f.x,f.y+f.R);C.stroke()}
      else{const k=1-f.life/.35,R=f.R*(.45+.55*k);C.globalAlpha=Math.min(1,f.life*5);star(f.x,f.y,R,f.x);ink('#f2d23a',2.8);star(f.x,f.y,R*.6,f.x+.3);ink('#e0602a',2.2);star(f.x,f.y,R*.28,f.x+.6);ink('#b3261e',1.8);C.globalAlpha=1}}
    else if(f.txt){f.y-=.6;C.globalAlpha=Math.min(1,f.life*2);C.font='700 26px '+FONT;C.textAlign='center';C.lineJoin='round';C.lineWidth=6;C.strokeStyle=INK;C.strokeText(f.txt,f.x,f.y);C.fillStyle='#f2d23a';C.fillText(f.txt,f.x,f.y);C.globalAlpha=1}
    else{f.x+=f.vx;f.y+=f.vy;if(!f.sm)f.vy+=.2;C.globalAlpha=Math.min(1,f.life*2)*(f.sm?.75:1);C.beginPath();C.arc(f.x,f.y,f.r,0,7);C.fillStyle=f.col;C.fill();C.strokeStyle=INK;C.lineWidth=1.3;C.stroke();C.globalAlpha=1}}
  let tip='';if(S.state==='aim'&&S.ammo.length){const a=AM[S.ammo[0]];tip=S.lv===0&&S.ammo.length===LV[0].ammo.length?'按住屏幕向下拖，松手发射':a.tip}
  else if(S.state==='fly'&&S.cur&&!S.cur.g.gone&&!S.cur.g.used&&!S.cur.g.hit&&(S.cur.g.type==='chili'||S.cur.g.type==='guided'))tip=S.cur.g.type==='chili'?'现在点屏幕分裂！':'点一下你想打的位置！';
  if(tip&&!S.over){C.font='700 16px '+FONT;C.textAlign='center';const w=C.measureText(tip).width+30;wrect(W/2-w/2,50,w,32,5);ink(PAPER);C.fillStyle=INK;C.fillText(tip,W/2,72)}
  const n=targets().length;C.font='700 17px '+FONT;C.textAlign='left';C.fillStyle=LITE;C.fillText('剩余怪物 '+n+'   导弹 '+S.ammo.length,16,H-14);
}
// ---------- 界面（原来是网页按钮，这里全部画在画布上并自己做点击判定） ----------
let BTN=[];
function label(txt,x,y,size,col,stroke){C.font='700 '+size+'px '+FONT;C.textAlign='center';if(stroke){C.lineJoin='round';C.lineWidth=stroke;C.strokeStyle=INK;C.strokeText(txt,x,y)}C.fillStyle=col;C.fillText(txt,x,y)}
function btn(x,y,w,h,txt,fill,fn,col){BTN.push({x,y,w,h,fn});wrect(x+3,y+4,w,h,x+y);C.fillStyle=INK;C.fill();wrect(x,y,w,h,x+y);ink(fill);label(txt,x+w/2,y+h/2+6,17,col||INK)}
function dim(a){C.fillStyle='rgba(24,8,10,'+a+')';C.fillRect(0,0,W,H)}
function drawUI(){C=ctx;C.setTransform(SCL,0,0,SCL,0,0);BTN=[];
  if(S&&UI.mode!=='menu'){btn(12,12,70,36,'关卡',PAPER,menu);btn(W-82,12,70,36,'重来',PAPER,()=>load(S.lv));label((S.lv+1)+' · '+LV[S.lv].name,W/2,38,21,LITE,5)}
  if(UI.mode==='menu'){dim(.9);BTN=[];label('末日防线',W/2,180,46,'#e0602a',8);label('按住屏幕向下拖，松手发射，消灭所有怪物',W/2,226,16,LITE);
    const open=save.stars.filter(s=>s>0).length,bw=210,bh=92,gap=16,x0=(W-bw*2-gap)/2,y0=270;
    LV.forEach((l,i)=>{const x=x0+(i%2)*(bw+gap),y=y0+(i>>1)*(bh+gap),lock=i>open,st=save.stars[i]||0;
      wrect(x+3,y+4,bw,bh,i+40);C.fillStyle=INK;C.fill();wrect(x,y,bw,bh,i+40);ink(lock?'#3a2626':PAPER);
      label(String(i+1),x+bw/2,y+34,26,lock?'#8a7070':INK);label(l.name,x+bw/2,y+56,13,lock?'#8a7070':INK);
      label(lock?'未解锁':'★'.repeat(st)+'☆'.repeat(3-st),x+bw/2,y+79,15,lock?'#8a7070':'#b3261e');
      if(!lock)BTN.push({x,y,w:bw,h:bh,fn:()=>load(i)})})}
  else if(UI.mode==='result'){UI.t+=1/60;dim(Math.min(.88,UI.t*2.2));BTN=[];if(UI.t<.45)return;
    const last=S.lv===LV.length-1,cy=380;
    if(UI.win){label(last?'全部通关！':'过关！',W/2,cy,46,'#e0602a',8);
      for(let i=0;i<3;i++)label('★',W/2+(i-1)*62,cy+78,54,i<UI.st?'#f2d23a':'#4a2a2a',6);
      label('剩余导弹 '+UI.left+' 枚',W/2,cy+124,17,LITE);
      btn(W/2-170,cy+160,160,52,'再打一次','#77787f',()=>load(S.lv),LITE);
      last?btn(W/2+10,cy+160,160,52,'关卡','#c22a2a',menu,LITE):btn(W/2+10,cy+160,160,52,'下一关','#c22a2a',()=>load(S.lv+1),LITE)}
    else{label('导弹打光了',W/2,cy,44,'#e0602a',8);label('还有 '+UI.n+' 只怪物没消灭，换个角度试试',W/2,cy+56,17,LITE);
      btn(W/2-170,cy+100,160,52,'关卡','#77787f',menu,LITE);btn(W/2+10,cy+100,160,52,'重来','#c22a2a',()=>load(S.lv),LITE)}}}
function uiTap(x,y){for(let i=BTN.length-1;i>=0;i--){const b=BTN[i];if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){b.fn&&b.fn();return true}}return UI.mode!=='play'}
function draw(){drawWorld();drawUI()}
let acc=0;
function step(dt){acc+=Math.min(.05,dt);while(acc>=1/60){tick();acc-=1/60}}
load(0);menu();
return {step,draw,down,move,up,cancel,
  // 调试/自动测试用
  debug:{get S(){return S},get UI(){return UI},load,fire,tap,tick,LV,targets,bodies,set noSave(v){noSave=v},OX,OY,VK,PMAX}};
}
