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
const TG={pot:{hp:16,r:20,c:'#86a04e',d:'#5f8f3a'},cooker:{hp:42,r:25,c:'#5a2440',d:'#5f8f3a'}};
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
  const st=[[0,[30,9,18]],[.4,[112,22,28]],[.74,[206,84,34]],[1,[246,178,70]]];
  const sky=y=>{const t=Math.max(0,Math.min(.999,y/G));let i=0;while(st[i+1][0]<t)i++;const a=st[i],b=st[i+1],k=(t-a[0])/(b[0]-a[0]);return a[1].map((v,j)=>v+(b[1][j]-v)*k|0)};
  const mix=(c,k,a=1)=>`rgba(${c.map(v=>Math.min(255,v*k)|0)},${a})`;
  const grad=(y0,y1,c0,c1)=>{const g=C.createLinearGradient(0,y0,0,y1);g.addColorStop(0,c0);g.addColorStop(1,c1);C.fillStyle=g;C.fillRect(0,y0,W,y1-y0)};
  const SX=410,SY=166;
  // —— 第 1 层：天空（渐变底 + 蜡笔笔触）
  for(let y=0;y<G;y+=6){C.fillStyle=`rgba(${sky(y)},.8)`;C.fillRect(0,y,W,6)}
  C.lineCap='round';for(let i=0;i<1500;i++){const x=R()*W,y=R()*G,a=-.45+q()*.5,l=30+R()*70;C.strokeStyle=`rgba(${sky(y+q()*70)},.55)`;C.lineWidth=3+R()*4;C.beginPath();C.moveTo(x,y);C.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l);C.stroke()}
  // 太阳光晕 + 地平线辉光：让天空有明暗中心，而不是一块平涂
  let rg=C.createRadialGradient(SX,SY,30,SX,SY,280);rg.addColorStop(0,'rgba(255,176,72,.6)');rg.addColorStop(.35,'rgba(236,96,40,.26)');rg.addColorStop(1,'rgba(236,96,40,0)');C.fillStyle=rg;C.fillRect(0,0,W,G);
  grad(G-300,G,'rgba(255,205,100,0)','rgba(255,214,120,.5)');
  // 云：先画被地平线照亮的下缘，再盖暗色云体；k 越小越暗（越近）
  const cloud=(cx,cy,w,h,sd,k)=>{const r=jr(sd),L=[],n=5+(w/40|0);
    for(let i=0;i<n;i++){const t=i/(n-1)-.5,m=1-4*t*t;L.push([cx+t*w+r()*10,cy+r()*h*.5-m*h*.3,h*(.45+m*.6)+r()*4,sd*13+i])}
    C.save();C.translate(0,cy);C.scale(1,.5);C.translate(0,-cy);
    for(const [x,y,rad,s] of L){wcirc(x,y+7,rad,s,1.5);C.fillStyle=mix(sky(cy+170),1.12);C.fill()}
    for(const [x,y,rad,s] of L){wcirc(x,y,rad,s,1.5);C.fillStyle=mix(sky(cy),k);C.fill()}
    C.restore();C.lineCap='round';
    for(let i=0;i<n*2;i++){const x=cx+r()*w*.8,y=cy+r()*h*.3-h*.1,l=16+(r()+.5)*30;C.strokeStyle=mix(sky(cy),k*.72,.5);C.lineWidth=2.5;C.beginPath();C.moveTo(x-l/2,y);C.lineTo(x+l/2,y+r()*3);C.stroke()}};
  cloud(120,430,150,30,21,.84);cloud(400,395,190,34,22,.82);cloud(250,335,120,26,23,.8);cloud(520,300,140,30,24,.78);cloud(40,290,130,30,25,.78);
  // 太阳
  C.save();C.translate(W-930,70);
  for(let i=0;i<26;i++){const a=i*.2417+q()*.1,d=64+R()*22;wline(800+Math.cos(a)*46,96+Math.sin(a)*46,800+Math.cos(a)*d,96+Math.sin(a)*d,i+9);C.strokeStyle='rgba(240,150,50,.8)';C.lineWidth=3;C.stroke()}
  wcirc(800,96,42,5);ink('#120a0a',4);
  C.fillStyle='#ff3b2e';C.beginPath();C.moveTo(780,84);C.lineTo(794,93);C.lineTo(780,95);C.closePath();C.fill();C.beginPath();C.moveTo(820,84);C.lineTo(806,93);C.lineTo(820,95);C.closePath();C.fill();
  C.beginPath();C.moveTo(779,108);for(let i=1;i<=8;i++)C.lineTo(779+i*5.2,108+(i%2?8:1));C.strokeStyle='#ff3b2e';C.lineWidth=2.6;C.lineJoin='round';C.stroke();C.restore();
  // 近处的大块暗云，压在太阳和远云前面
  cloud(300,226,180,40,31,.6);cloud(90,150,230,58,32,.5);cloud(500,52,210,52,33,.45);cloud(200,26,280,54,34,.42);
  // —— 第 2~4 层：废墟剪影。越远越高、越淡、没有描边；层与层之间垫一层暖色雾气拉开距离
  const ruins=(hmin,hmax,wmin,wmax,gap,col,near,win,mast)=>{let x=-10-R()*30;while(x<W+10){const w=wmin+R()*(wmax-wmin),h=hmin+R()*(hmax-hmin),n=3+(R()*3|0);
    C.beginPath();C.moveTo(x,G);C.lineTo(x+q()*4,G-h);for(let i=1;i<=n;i++)C.lineTo(x+w*i/n,G-h+(i%2?R()*22:-R()*8));C.lineTo(x+w,G);C.closePath();
    if(near){cfill(col);C.strokeStyle='rgba(23,17,15,.7)';C.lineWidth=2;C.stroke()}else{C.fillStyle=col;C.fill()}
    if(mast&&R()<mast){const mx=x+w*(.2+R()*.6),mh=18+R()*34;C.strokeStyle=col;C.lineWidth=2;C.beginPath();C.moveTo(mx,G-h+10);C.lineTo(mx+q()*8,G-h-mh);C.moveTo(mx-6,G-h-mh*.6);C.lineTo(mx+7,G-h-mh*.55);C.stroke()}
    for(let k=0;k<4;k++)if(R()<win[0])dot(x+6+R()*(w-12),G-8-R()*(h-24),win[1],win[2]);x+=w+R()*gap}};
  ruins(150,300,30,58,46,'#a4452c',0,[0,0,''],.5);
  grad(G-330,G,'rgba(246,168,76,0)','rgba(246,172,82,.62)');
  ruins(80,185,28,56,26,'#74271f',0,[.3,1.3,'rgba(255,176,84,.55)'],.25);
  grad(G-210,G,'rgba(240,140,60,0)','rgba(240,146,64,.5)');
  for(const [sx,d] of [[150,1],[395,1.25]]){for(let i=0;i<10;i++){const cx=sx+i*8*d+q()*10,cy=G-70-i*24*d,r=(11+i*2.6)*d;wcirc(cx,cy,r,sx+i);C.fillStyle='rgba(30,14,14,.14)';C.fill();C.strokeStyle='rgba(23,17,15,.36)';C.lineWidth=5;C.stroke()}}
  ruins(24,94,26,70,16,'#431515',1,[.4,1.8,'rgba(255,190,80,.9)'],0);
  grad(G-46,G,'rgba(255,170,80,0)','rgba(255,176,90,.3)');
  for(const [tx,k] of [[30,1],[W-28,-1]]){C.strokeStyle=INK;C.lineWidth=7;wline(tx,G,tx+k*6,G-95,tx);C.stroke();C.lineWidth=4;wline(tx+k*4,G-60,tx+k*34,G-100,tx+1);C.stroke();wline(tx+k*5,G-80,tx-k*22,G-118,tx+2);C.stroke();C.lineWidth=2.5;wline(tx+k*22,G-85,tx+k*30,G-125,tx+3);C.stroke();wline(tx-k*12,G-100,tx-k*28,G-104,tx+4);C.stroke()}
  C.fillStyle=PG;C.fillRect(0,0,W,G);
  // —— 地面：上亮下暗，被地平线的火光扫到一条边
  grad(G,H,'#40291f','#150e0d');for(let i=0;i<260;i++){const gx=R()*W,gy=G+R()*(H-G),l=20+R()*50;C.strokeStyle=R()<.5?'rgba(84,52,36,.55)':'rgba(12,8,8,.6)';C.lineWidth=3+R()*3;C.beginPath();C.moveTo(gx,gy);C.lineTo(gx+l,gy+q()*6);C.stroke()}
  for(let i=0;i<60;i++){const gx=R()*W,gy=G+4+R()*R()*16,l=14+R()*36;C.strokeStyle=`rgba(226,128,62,${.2+R()*.3})`;C.lineWidth=1.5+R()*2;C.beginPath();C.moveTo(gx,gy);C.lineTo(gx+l,gy+q()*2);C.stroke()}
  for(let i=0;i<34;i++){const t=R(),gx=R()*W,gy=G+12+t*(H-G-48),r=1.6+t*4.2;wcirc(gx,gy+r*.5,r,i+300,.5);C.fillStyle='rgba(0,0,0,.45)';C.fill();wcirc(gx,gy,r,i+300,.5);C.fillStyle=R()<.5?'#5a4032':'#3a2a24';C.fill();C.strokeStyle=INK;C.lineWidth=1.1;C.stroke()}
  C.fillStyle=PG;C.fillRect(0,G,W,H-G);
  C.beginPath();C.moveTo(-5,G);for(let gx=20;gx<=W+20;gx+=40)C.quadraticCurveTo(gx-20,G+q()*3,gx,G+q()*2);C.strokeStyle=INK;C.lineWidth=3.5;C.stroke();
  for(let gx=50;gx<W;gx+=120){const cx=gx+q()*50;C.beginPath();C.moveTo(cx,G+2);C.lineTo(cx+6,G+16);C.lineTo(cx-4,G+28);C.lineTo(cx+8,G+44);C.moveTo(cx+6,G+16);C.lineTo(cx+20,G+22);C.strokeStyle='rgba(0,0,0,.8)';C.lineWidth=2;C.stroke()}
  for(const sx of [330,480]){C.fillStyle=PAPER;C.fillRect(sx-4,G+44,8,6);C.strokeStyle=INK;C.lineWidth=1.2;C.strokeRect(sx-4,G+44,8,6);wcirc(sx,G+38,8,sx,.5);ink(PAPER,2);dot(sx-3,G+38,1.9,INK);dot(sx+3,G+38,1.9,INK)}
  // —— 整体质感：纸面颗粒 + 四角压暗
  for(let i=0;i<9000;i++){C.fillStyle=R()<.55?`rgba(20,10,10,${.05+R()*.13})`:`rgba(240,226,200,${.04+R()*.1})`;C.fillRect(R()*W,R()*H,.5+R()*.9,.5+R()*.9)}
  rg=C.createRadialGradient(W/2,G*.56,250,W/2,G*.56,650);rg.addColorStop(0,'rgba(18,4,8,0)');rg.addColorStop(1,'rgba(18,4,8,.55)');C.fillStyle=rg;C.fillRect(0,0,W,H);
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
  else if(g.kind==='target'){const t=TG[g.t],r=g.r,hurtF=g.hp<g.max*.55,big=g.t==='cooker',sd=r*7+3,tt=performance.now()/1000+p.x*.013,tw=BO-1;
    // 带刺的藤蔓：从下半身伸出来，一直在扭，末端一片叶子
    C.lineCap='round';for(let i=0,n=big?7:5;i<n;i++){const a=.35+i*(2.45/(n-1)),w=Math.sin(tt*(big?3:4.5)+i*1.7)*.38,l=r*(big?1.65:1.5);
      C.beginPath();C.moveTo(Math.cos(a)*r*.8,Math.sin(a)*r*.8);C.quadraticCurveTo(Math.cos(a+w*.5)*r*1.25,Math.sin(a+w*.5)*r*1.25,Math.cos(a+w)*l,Math.sin(a+w)*l);C.strokeStyle=INK;C.lineWidth=big?4.4:3.4;C.stroke();C.strokeStyle=t.d;C.lineWidth=big?1.8:1.2;C.stroke();
      const mx=Math.cos(a+w*.5)*r*1.12,my2=Math.sin(a+w*.5)*r*1.12,tx=Math.cos(a+w)*l,ty=Math.sin(a+w)*l;C.beginPath();C.moveTo(mx,my2);C.lineTo(mx+Math.cos(a+1.3)*4.5,my2+Math.sin(a+1.3)*4.5);C.strokeStyle=INK;C.lineWidth=1.6;C.stroke();
      C.beginPath();C.ellipse(tx,ty,big?5.5:4.5,big?2.6:2.2,a+w+.5,0,7);C.fillStyle=t.d;C.fill();C.strokeStyle=INK;C.lineWidth=1.2;C.stroke()}
    // 大的是一圈血红花瓣的魔眼花，小的是顶着尖萼片的食人花苞
    if(big)for(let i=0;i<10;i++){const a=i*.6283+.2+Math.sin(tt*1.5+i)*.04,pc=(da,d)=>[Math.cos(a+da)*r*d,Math.sin(a+da)*r*d];blob([pc(-.3,.8),pc(-.16,1.3),pc(0,1.72),pc(.16,1.3),pc(.3,.8)]);ink(i%2?'#a3242e':'#7c1a26',1.8)}
    else for(let i=0;i<5;i++){const a=-2.62+i*.52,pc=(da,d)=>[Math.cos(a+da)*r*d,Math.sin(a+da)*r*d];blob([pc(-.24,.8),pc(-.1,1.2),pc(0,1.5),pc(.1,1.2),pc(.24,.8)]);ink('#3f6a2a',1.6)}
    wcirc(0,0,r,sd,1.3);ink(t.c);
    dot(-r*.6,r*.5,r*.2,'rgba(40,16,28,.3)');dot(r*.62,-r*.52,r*.17,'rgba(40,16,28,.3)');dot(r*.05,-r*.76,r*.12,'rgba(40,16,28,.25)');
    if(big){const ey=-r*.2,er=r*.46,nv=hurtF?11:6,ix=tw*1.3;
      wcirc(0,ey,er,sd+1,.6);ink(hurtF?'#e6a898':'#e8dfc0',1.8);
      C.strokeStyle='#b3261e';C.lineWidth=1;for(let i=0;i<nv;i++){const a=i*6.283/nv+.3;C.beginPath();C.moveTo(Math.cos(a)*er*.95,ey+Math.sin(a)*er*.95);C.lineTo(Math.cos(a+.3)*er*.5,ey+Math.sin(a+.3)*er*.5);C.stroke()}
      dot(ix,ey+1,er*.62,'#b3261e');dot(ix,ey+1,er*.44,'#f2a01e');C.beginPath();C.ellipse(ix,ey+1,er*.12,er*.5,0,0,7);C.fillStyle='#0d0507';C.fill();dot(ix-er*.25,ey-er*.12,er*.1,'#fff');
      C.beginPath();C.arc(0,ey,er*1.05,Math.PI*(hurtF?1.0:1.12),Math.PI*(hurtF?2.0:1.88));C.closePath();C.fillStyle='#34142a';C.fill();C.strokeStyle=INK;C.lineWidth=1.8;C.stroke();
      if(hurtF){C.strokeStyle='#b3261e';C.lineWidth=2.2;C.beginPath();C.moveTo(-er*.3,ey+er*.9);C.lineTo(-er*.35,ey+er*1.9);C.moveTo(er*.4,ey+er*.85);C.lineTo(er*.42,ey+er*1.5);C.stroke()}
      for(const k of [-1,1]){dot(k*r*.74,r*.1,r*.11,INK);dot(k*r*.74,r*.1,r*.06,'#ff3b2e')}}
    else{for(const [ex,ey,er] of [[-r*.36,-r*.24,r*.3],[r*.42,-r*.2,r*.2]]){dot(ex,ey,er,'#0d0507');C.beginPath();C.arc(ex,ey,er,0,7);C.strokeStyle=INK;C.lineWidth=1.5;C.stroke();
        if(hurtF&&ex<0){C.strokeStyle='#b3261e';C.lineWidth=2.2;C.beginPath();C.moveTo(ex,ey);C.lineTo(ex-1,ey+r*.75);C.stroke()}
        else{dot(ex+tw*.7,ey,er*.78,'rgba(255,50,30,.32)');dot(ex+tw*.7,ey,er*.38,'#ff3b2e');dot(ex+tw*.7,ey,er*.14,'#ffe9c0')}}
      C.strokeStyle=INK;C.lineWidth=2;C.beginPath();C.moveTo(-r*.8,-r*.66);C.lineTo(-r*.08,-r*.42);C.moveTo(r*.72,-r*.52);C.lineTo(r*.16,-r*.38);C.stroke();
      C.strokeStyle='rgba(40,70,25,.7)';C.lineWidth=1.2;C.beginPath();C.moveTo(0,-r*.95);C.lineTo(r*.04,-r*.5);C.moveTo(-r*.5,-r*.78);C.lineTo(-r*.2,-r*.55);C.moveTo(r*.55,-r*.74);C.lineTo(r*.26,-r*.52);C.stroke()}
    // 裂到耳根的嘴 + 尖牙 + 滴血
    {const my=big?r*.4:r*.2,mw=big?r*.64:r*.74,s0=big?r*.1:r*.18,s1=big?r*.52:r*.74,mp=(u,s)=>[mw*(2*u-1),my+s*4*u*(1-u)];
      C.beginPath();C.moveTo(-mw,my);C.quadraticCurveTo(0,my+s1*2,mw,my);C.quadraticCurveTo(0,my+s0*2,-mw,my);C.closePath();C.fillStyle='#16040a';C.fill();C.lineJoin='round';C.strokeStyle=INK;C.lineWidth=4.6;C.stroke();C.strokeStyle=big?'#c22a3a':'#a3242e';C.lineWidth=2.2;C.stroke();
      C.fillStyle=LITE;C.strokeStyle=INK;C.lineWidth=.9;
      for(let i=0;i<6;i++){const u=.12+i*.152,a=mp(u-.06,s0),b=mp(u+.06,s0),len=r*(i%2?.2:.31);C.beginPath();C.moveTo(a[0],a[1]);C.lineTo((a[0]+b[0])/2,(a[1]+b[1])/2+len);C.lineTo(b[0],b[1]);C.closePath();C.fill();C.stroke()}
      for(let i=0;i<4;i++){const u=.26+i*.16,a=mp(u-.05,s1),b=mp(u+.05,s1);C.beginPath();C.moveTo(a[0],a[1]);C.lineTo((a[0]+b[0])/2,(a[1]+b[1])/2-r*.2);C.lineTo(b[0],b[1]);C.closePath();C.fill();C.stroke()}
      const dx=mw*.5,dy=my+s1*.72,dl=r*(.34+.14*Math.sin(tt*2));C.strokeStyle='#b3261e';C.lineWidth=2;C.lineCap='round';C.beginPath();C.moveTo(dx,dy);C.lineTo(dx,dy+dl);C.stroke();dot(dx,dy+dl,1.7,'#b3261e')}
    if(hurtF){C.beginPath();C.moveTo(r*.2,-r);C.lineTo(r*.02,-r*.6);C.lineTo(r*.3,-r*.45);C.lineTo(r*.12,-r*.1);C.strokeStyle=INK;C.lineWidth=1.8;C.lineJoin='round';C.stroke()}
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
  // —— 悬浮导弹车（未来风）：能量平台 + 悬浮底盘 + 电磁发射舱；蓄力越满，线圈和炮口越亮
  const CY='#4fe3ff',pul=.6+.4*Math.sin(T*5),chg=p?p.l/PMAX:0,kx=rec*.4;
  const poly=(P,sd,j=.8)=>{const r=jr(sd);C.beginPath();P.forEach((v,i)=>C[i?'lineTo':'moveTo'](v[0]+r()*j*2,v[1]+r()*j*2));C.closePath()};
  const glow=(x,y,rx,ry,a)=>{C.beginPath();C.ellipse(x,y,rx,ry,0,0,7);C.fillStyle=`rgba(79,227,255,${a})`;C.fill()};
  poly([[OX-58,G+2],[OX-50,OY+34],[OX+50,OY+34],[OX+58,G+2]],61);ink('#4a5364');
  poly([[OX-47,OY+38],[OX+47,OY+38],[OX+50,OY+47],[OX-50,OY+47]],62,.5);ink('#7f8a9c',1.6);
  for(let i=0;i<5;i++){const on=(((T*4|0)-i)%5+5)%5===0;wline(OX-42+i*18,OY+62,OX-30+i*18,OY+62,63+i,.6);C.lineCap='round';C.lineWidth=4;C.strokeStyle=INK;C.stroke();C.lineWidth=2.2;C.strokeStyle=on?'#d8fbff':'rgba(79,227,255,.55)';C.stroke()}
  for(const x of [OX-46,OX+46])dot(x,OY+78,2,'#232a36');
  glow(OX,OY+33,48,5,.18+pul*.1);
  for(const x of [OX-30,OX+24]){glow(x,OY+30,13+pul*3,5,.4);glow(x,OY+29,7+pul*2,2.6,.9);C.beginPath();C.ellipse(x,OY+28.5,4,1.4,0,0,7);C.fillStyle='#fff';C.fill();
    poly([[x-13,OY+19],[x+13,OY+19],[x+9,OY+27],[x-9,OY+27]],66+x,.5);ink('#394353',2)}
  poly([[OX-54,OY+18],[OX-45,OY+6],[OX+30,OY+6],[OX+52,OY+15],[OX+45,OY+22],[OX-48,OY+22]],64);ink('#e6ebf1');
  wline(OX-40,OY+15,OX+40,OY+15,65,.5);C.lineCap='round';C.strokeStyle=CY;C.lineWidth=2.6;C.stroke();
  poly([[OX+30,OY+6],[OX+52,OY+15],[OX+45,OY+22],[OX+36,OY+22]],69,.4);ink('#f08a2a',1.8);
  wline(OX-45,OY-5,OX-51,OY-27,73,.6);C.strokeStyle=INK;C.lineWidth=2.2;C.stroke();dot(OX-51,OY-28,3,INK);dot(OX-51,OY-28,1.9,T%1<.5?'#ff3b2e':'#6a1614');
  poly([[OX-48,OY+7],[OX-41,OY-9],[OX-24,OY-11],[OX-13,OY+7]],67);ink('#2a3648');
  poly([[OX-41,OY+3],[OX-37,OY-5],[OX-26,OY-7],[OX-20,OY+3]],68,.4);ink('#8ff1ff',1.5);C.strokeStyle='#fff';C.lineWidth=1.6;C.beginPath();C.moveTo(OX-36,OY);C.lineTo(OX-33,OY-4);C.stroke();
  wcirc(OX+4,OY+4,9,71,.5);ink('#7f8a9c',2);
  C.save();C.translate(OX+4,OY+2);C.rotate(ang);
  if(chg>.13)glow(40-kx,0,7+chg*11,7+chg*11,.12+chg*.28);
  poly([[-23-kx,-10],[25-kx,-12],[37-kx,-7],[37-kx,7],[25-kx,12],[-23-kx,10]],70);ink('#394353');
  for(let i=0;i<3;i++){const x=-13+i*12-kx,a=Math.min(1,.35+chg*.9+(chg>.13?0:pul*.15));C.beginPath();C.moveTo(x,-9);C.lineTo(x,9);C.lineCap='butt';C.lineWidth=4.2;C.strokeStyle=`rgba(79,227,255,${a})`;C.stroke();if(chg>.5){C.lineWidth=1.4;C.strokeStyle='#fff';C.stroke()}}
  poly([[-20-kx,-15],[14-kx,-16],[18-kx,-11],[-20-kx,-10]],72,.4);ink('#e6ebf1',1.6);
  for(const yy of [-4.5,4.5]){dot(35-kx,yy,3.3,INK);dot(35-kx,yy,1.5+chg*1.3,chg>.13?'#d8fbff':CY)}
  C.restore();dot(OX+4,OY+2,3,INK);dot(OX+4,OY+2,1.5,CY);
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
