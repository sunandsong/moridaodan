// @ts-nocheck
// 末日防线：游戏核心（物理、关卡、绘制、界面）。
// 这份代码从网页原型 prototype/up.html 移植而来，不依赖 Cocos 的节点系统：
// 它把整个画面画在一张离屏画布上，由 Game.ts 每帧上传成贴图显示。
import Matter from 'matter-js';

export function createGame(host){
const {Engine,Bodies,Body,Composite,Events,Constraint,Query}=Matter;
const W=540,H=960,G=880,OX=110,OY=782,PMAX=105,VK=.2,DT=1000/60,GR=.001*DT*DT,KD=8,THR=1.2,TX=222,TY=G+35,TS=44;
const cv=host.canvas,ctx=cv.getContext('2d'),SCL=host.scale||2;let UI={mode:'menu'};
// 材质：burn=每帧烧掉多少血（没有就是烧不着）；arm 是重甲，能挡住爆炸冲击波；wt 是吊着的配重，打不坏
const MAT={bis:{hp:55,den:.001,c:'#d59a55',d:'#7a4a1e',burn:.22},ice:{hp:22,den:.0008,c:'#f6d873',d:'#9a7a2a',burn:.3},cho:{hp:150,den:.002,c:'#bcc2cc',d:'#5a606c'},tnt:{hp:10,den:.001,c:'#f04f4f',d:'#7a1414',burn:.5},
  arm:{hp:180,den:.003,c:'#3c4656',d:'#232a36'},oil:{hp:12,den:.001,c:'#e0602a',d:'#5a1d0c',burn:.4},wt:{hp:1e9,den:.012,c:'#4a4f5a',d:'#17110f'}};
// 植物：vine 会回血，maw 会吞导弹，spore 每回合长出一株 bud，root 是寄生藤的根（不算目标）
const TG={pot:{hp:16,r:20,c:'#86a04e',d:'#5f8f3a'},cooker:{hp:42,r:25,c:'#5a2440',d:'#5f8f3a'},
  vine:{hp:70,r:20,c:'#3fa57c',d:'#2f7a5a',regen:.35},maw:{hp:30,r:22,c:'#b0405a',d:'#5f8f3a'},spore:{hp:24,r:19,c:'#d9a53a',d:'#8a6a1e'},bud:{hp:8,r:13,c:'#b7c45a',d:'#5f8f3a'},root:{hp:22,r:14,c:'#4f7a2e',d:'#2f5a1e'}};
const AM={sugar:{r:11,den:.004,name:'火箭弹',tip:'火箭弹：命中就爆炸'},chili:{r:10,den:.004,name:'集束导弹',tip:'集束导弹：飞行中再点一下屏幕，分裂成三枚'},melon:{r:15,den:.005,name:'巡航导弹',tip:'巡航导弹：命中后大范围爆炸，也可以点屏幕提前引爆'},guided:{r:10,den:.004,name:'制导导弹',tip:'制导导弹：飞行中点屏幕上任意位置，导弹会转向直飞过去'},
  fire:{r:10,den:.004,name:'燃烧弹',tip:'燃烧弹：点着木头和植物，火会一路蔓延'},frost:{r:10,den:.004,name:'冰冻弹',tip:'冰冻弹：冻住的东西一碰就碎，重甲也一样'},drill:{r:10,den:.005,name:'钻地弹',tip:'钻地弹：钻穿第一块挡路的方块，再爆炸'}};

function kit(){const out=[];
  const B=(m,x,bot,w,h)=>out.push({k:'b',m,x,y:bot-h/2,w,h});
  const T=(t,x,bot)=>out.push({k:'t',t,x,y:bot-TG[t].r});
  const S=(x,top,w)=>out.push({k:'s',x,y:top+7,w,h:14});
  const house=(x,bot,m,t,w=64)=>{B(m,x-w/2,bot,14,64);B(m,x+w/2,bot,14,64);B(m,x,bot-64,w+30,12);if(t)T(t,x,bot);return bot-76};
  const root=(x,bot)=>out.push({k:'r',x,y:bot-TG.root.r});          // 寄生藤的根
  const Wt=(x,ay,len)=>out.push({k:'w',x,ay,len});                   // 吊着的配重：(x,ay) 是绳子上端
  const Wl=(x,y,w,h)=>out.push({k:'wall',x,y,w,h});                  // 打不坏的固定钢板（中心坐标）
  const P=(x,y,w,an)=>out.push({k:'p',x,y,w,an});                    // 反弹板
  const Gt=(x,y,w,h,amp,per)=>out.push({k:'g',x,y,w,h,amp,per});     // 定时闸门：周期性向上抬起 amp
  return {out,B,T,S,house,root,Wt,Wl,P,Gt}}
const LV=[
 {name:'新兵训练',ammo:['sugar','sugar','sugar'],f:k=>{k.S(380,640,130);k.house(380,640,'bis','pot')}},
 {name:'双子哨所',ammo:['sugar','sugar','sugar','sugar'],f:k=>{k.S(400,690,120);k.house(400,690,'bis','pot');k.S(210,470,120);k.house(210,470,'ice','pot')}},
 {name:'二层岗楼',ammo:['sugar','sugar','sugar'],f:k=>{k.S(360,570,140);const t=k.house(360,570,'bis','pot');k.house(360,t,'ice','pot')}},
 {name:'悬空掩体',ammo:['sugar','chili','sugar','sugar'],f:k=>{k.S(330,705,170);k.S(385,600,150);k.house(375,600,'bis','pot');k.B('tnt',444,600,26,26);k.S(170,420,110);k.house(170,420,'ice','pot')}},
 {name:'前沿三哨',ammo:['guided','guided','chili','guided','sugar'],f:k=>{k.S(420,700,120);k.house(420,700,'ice','pot');k.S(250,520,120);k.house(250,520,'ice','pot');k.S(420,340,120);k.house(420,340,'ice','pot')}},
 {name:'钢筋碉堡',ammo:['guided','melon','sugar','sugar'],f:k=>{k.S(370,560,170);const t=k.house(360,560,'cho','cooker',70);k.T('pot',360,t);k.B('tnt',436,560,26,26)}},
 {name:'瞭望高塔',ammo:['sugar','guided','melon','sugar'],f:k=>{k.S(380,720,170);let t=k.house(370,720,'bis','cooker',70);t=k.house(370,t,'bis','pot',70);k.house(370,t,'ice','pot',70);k.B('tnt',446,720,26,26)}},
 {name:'总攻',ammo:['guided','chili','melon','sugar','sugar'],f:k=>{k.S(425,730,150);k.house(425,730,'cho','pot',70);k.S(275,540,170);const t=k.house(265,540,'bis','cooker',70);k.house(265,t,'bis','pot',70);k.B('tnt',342,540,26,26);k.S(420,330,130);k.house(420,330,'ice','pot')}},
 {name:'野火',ammo:['fire','sugar','sugar'],f:k=>{k.S(380,640,150);k.house(380,640,'bis','vine');k.S(210,450,110);k.house(210,450,'ice','pot')}},
 {name:'血盆大口',ammo:['sugar','chili','guided','sugar'],f:k=>{k.S(390,600,130);k.T('maw',390,600);k.S(230,420,120);k.house(230,420,'ice','pot')}},
 {name:'孢子雨',ammo:['sugar','sugar','sugar','melon','sugar'],f:k=>{k.S(385,650,210);k.T('spore',385,650);k.S(215,440,120);k.house(215,440,'bis','pot')}},
 {name:'寄生藤',ammo:['sugar','sugar','fire','sugar'],f:k=>{k.S(410,670,150);k.house(410,670,'bis','cooker',70);k.S(300,480,130);k.house(300,480,'bis','pot');k.S(170,560,80);k.root(170,560)}},
 {name:'钻地',ammo:['drill','drill','sugar'],f:k=>{k.S(390,640,170);k.house(390,640,'arm','cooker',70);k.S(230,430,140);k.house(230,430,'arm','pot',70)}},
 {name:'速冻',ammo:['frost','sugar','frost','sugar'],f:k=>{k.S(400,680,140);k.house(400,680,'arm','cooker',70);k.S(240,470,140);k.house(240,470,'arm','pot',70)}},
 {name:'千斤坠',ammo:['sugar','sugar','guided'],f:k=>{k.Wl(400,300,130,14);k.Wt(400,307,70);k.S(400,640,150);k.B('arm',360,640,14,64);k.B('arm',440,640,14,64);k.T('vine',400,640);k.S(215,500,150);k.house(200,500,'bis','cooker',70);k.B('oil',262,500,24,32)}},
 {name:'机关城',ammo:['sugar','guided','sugar','sugar'],f:k=>{k.S(420,700,150);k.Wl(420,622,150,14);k.Wl(488,665,14,70);k.T('pot',430,700);k.Gt(336,664,14,72,74,260);k.S(232,430,120);k.T('pot',232,430);k.Wl(172,388,14,84);k.Wl(226,349,122,14);k.P(352,385,90,1.45)}},
];

let save={stars:[]};try{save=JSON.parse(host.storage.get('up_v1'))||save}catch(e){}
const put=()=>{try{host.storage.set('up_v1',JSON.stringify(save))}catch(e){}};
let engine,S=null,dead=new Set(),booms=[],noSave=false;

function add(b,g){b.g=g;Composite.add(engine.world,b);return b}
function spawnT(t,x,y){const d=TG[t];return add(Bodies.circle(x,y,d.r,{density:.001,friction:.6,restitution:.1}),{kind:'target',t,hp:d.hp,max:d.hp,r:d.r})}
function load(i){
  engine=Engine.create();engine.positionIterations=10;engine.velocityIterations=8;
  Events.on(engine,'collisionStart',onCol);
  add(Bodies.rectangle(W/2,G+60,4000,120,{isStatic:true,friction:1}),{kind:'ground'});
  const k=kit();LV[i].f(k);let seed=1;const ropes=[],roots=[];
  const blk=(m,x,y,w,h)=>add(Bodies.rectangle(x,y,w,h,{density:MAT[m].den,friction:.8,restitution:.02}),{kind:'block',m,hp:MAT[m].hp,max:MAT[m].hp,w,h,seed:seed++});
  for(const o of k.out){
    if(o.k==='b')blk(o.m,o.x,o.y,o.w,o.h);
    else if(o.k==='t')spawnT(o.t,o.x,o.y);
    else if(o.k==='r'){const d=TG.root;roots.push(add(Bodies.circle(o.x,o.y,d.r,{density:.002,friction:.9,restitution:0}),{kind:'root',t:'root',hp:d.hp,max:d.hp,r:d.r}))}
    else if(o.k==='w'){const b=blk('wt',o.x,o.ay+o.len+20,40,40),c=Constraint.create({pointA:{x:o.x,y:o.ay},bodyB:b,pointB:{x:0,y:-20},stiffness:.9,length:o.len});Composite.add(engine.world,c);ropes.push({c,b})}
    else if(o.k==='wall')add(Bodies.rectangle(o.x,o.y,o.w,o.h,{isStatic:true,friction:1}),{kind:'wall',w:o.w,h:o.h});
    else if(o.k==='p')add(Bodies.rectangle(o.x,o.y,o.w,12,{isStatic:true,angle:o.an,friction:0,restitution:1}),{kind:'bounce',w:o.w,h:12});
    else if(o.k==='g')add(Bodies.rectangle(o.x,o.y,o.w,o.h,{isStatic:true,friction:1}),{kind:'wall',gate:1,w:o.w,h:o.h,y0:o.y,amp:o.amp,per:o.per});
    else add(Bodies.rectangle(o.x,o.y,o.w,o.h,{isStatic:true,friction:1}),{kind:'shelf',w:o.w,h:o.h});
  }
  // 寄生藤：根附近的方块被藤蔓缠住，变硬、挡冲击波、点不着，直到根被消灭
  for(const r of roots)for(const b of Composite.allBodies(engine.world))if(b.g.kind==='block'&&Math.hypot(b.position.x-r.position.x,b.position.y-r.position.y)<270)b.g.vine=r;
  S={lv:i,ammo:LV[i].ammo.slice(),sel:0,state:'aim',settle:50,cur:null,ft:0,hitT:-1,fx:[],trail:[],last:[],drag:null,winT:0,wt:0,calm:0,over:false,t:0,
    ropes,stains:[],score:0,kills:0,slow:0,zoom:null,zk:0,flash:0};
  dead.clear();booms=[];UI={mode:'play'};
}
const bodies=()=>Composite.allBodies(engine.world);
const targets=()=>bodies().filter(b=>b.g.kind==='target');
const ext=b=>b.g.r||Math.max(b.g.w||0,b.g.h||0)/2;
const wrapped=g=>g.vine&&!g.vine.g.gone;
const near=(a,b,m)=>a.bounds.min.x-m<=b.bounds.max.x&&a.bounds.max.x+m>=b.bounds.min.x&&a.bounds.min.y-m<=b.bounds.max.y&&a.bounds.max.y+m>=b.bounds.min.y;
const att=r=>({x:r.b.position.x+20*Math.sin(r.b.angle),y:r.b.position.y-20*Math.cos(r.b.angle)});
function segDist(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,t=Math.max(0,Math.min(1,((px-x1)*dx+(py-y1)*dy)/(dx*dx+dy*dy||1)));return Math.hypot(px-x1-dx*t,py-y1-dy*t)}
function say(txt,x,y,sz,c,life=.7){S.fx.push({txt,x:Math.max(40,Math.min(W-40,x)),y:Math.max(110,y),life,sz,c})}
function cut(r){if(r.cut)return;r.cut=1;Composite.remove(engine.world,r.c);const q=att(r);puff(q.x,q.y,'#d9b06a',6,2);say('断!',q.x,q.y-24)}

function onCol(ev){
  if(S.settle>0)return;
  for(const p of ev.pairs){const a=p.bodyA,b=p.bodyB,n=p.collision.normal;let skip=false;
    for(const [s,o] of [[a,b],[b,a]])if(s.g.kind==='shot'){
      if(o.g.kind==='bounce'){S.fx.push({sp:1,x:s.position.x,y:s.position.y,vx:0,vy:-3,life:.3,col:'#4fe3ff'});skip=true;continue}
      // 钻地弹：第一块挡路的方块直接钻穿，速度基本不减
      if(s.g.type==='drill'&&!s.g.pierced&&o.g.kind==='block'&&o.g.m!=='wt'){s.g.pierced=1;s.g.keepV={x:s.velocity.x*.85,y:s.velocity.y*.85};o.g.last='hit';o.g.hp=0;dead.add(o);skip=true;continue}
      if(!s.g.hit){s.g.hit=1;if(S.hitT<0)S.hitT=S.ft}if(!s.g.bang){s.g.bang=1;booms.push(s)}}
    if(skip)continue;
    const vn=Math.abs((a.velocity.x-b.velocity.x)*n.x+(a.velocity.y-b.velocity.y)*n.y);
    const ma=a.isStatic?1e9:a.mass,mb=b.isStatic?1e9:b.mass,imp=vn*ma*mb/(ma+mb);
    if(imp<THR)continue;const d=(imp-THR)*KD,why=o=>o.g.kind==='shot'?'hit':o.isStatic?'fall':'crush';hurt(a,d,why(b));hurt(b,d,why(a));
  }
}
function hurt(b,d,why){const g=b.g;if((g.kind!=='block'&&g.kind!=='target'&&g.kind!=='root')||g.m==='wt')return;
  if(g.frozen>0)d*=4;else if(wrapped(g))d*=.2;
  g.hp-=d;g.flash=.18;g.last=why;g.hitT=S.t;if(g.hp<=0)dead.add(b)}
function ignite(b){const g=b.g;if(g.gone||g.burn||wrapped(g))return;if(g.kind==='target'||g.kind==='root'||(g.kind==='block'&&MAT[g.m].burn)){g.frozen=0;g.burn=1}}
function freeze(b){const g=b.g;if(g.gone||g.m==='wt')return;if(g.kind==='target'||g.kind==='root'||g.kind==='block'){g.burn=0;g.frozen=720}}
function puff(x,y,col,n,sp){for(let i=0;i<n;i++){const a=Math.random()*6.28,v=sp*(.3+Math.random());S.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-1,life:.5+Math.random()*.4,col,r:2+Math.random()*4})}}
function chips(x,y,col,n){for(let i=0;i<n;i++){const a=Math.random()*6.28,v=2+Math.random()*4;S.fx.push({sq:1,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-2.5,life:.5+Math.random()*.4,col,r:2+Math.random()*2.5})}}
function kill(b){if(b.g.gone)return;b.g.gone=1;Composite.remove(engine.world,b)}
// [爆炸半径, 伤害]
const BM={sugar:[72,54],chili:[72,54],mini:[50,30],guided:[92,70],melon:[115,95],fire:[58,14],frost:[92,0],drill:[84,62],tnt:[115,95],oil:[96,60]};
function boom(s){const ty=s.g.type||s.g.m,[R,D]=BM[ty]||BM.tnt,k=R/115,x=s.position.x,y=s.position.y,ice=ty==='frost',hot=ty==='fire'||ty==='oil';kill(s);
  // 重甲、固定钢板、被藤蔓缠住的方块能挡住冲击波：躲在后面的植物只吃到 1/4 伤害，也不会被点着
  const sh=bodies().filter(o=>o.g.kind==='wall'||(o.g.kind==='block'&&(o.g.m==='arm'||wrapped(o.g))));
  for(const b of bodies()){if(b.isStatic)continue;const dx=b.position.x-x,dy=b.position.y-y,d=Math.hypot(dx,dy)||1,live=b.g.kind==='target'||b.g.kind==='root';
    const cover=live&&sh.length>0&&Query.ray(sh,{x,y},b.position).length>0;
    if(d<R){const f=1-d/R,pk=b.g.m==='wt'?0:(ice?.25:1)*((b.g.m==='arm'||wrapped(b.g))&&!(b.g.frozen>0)?.25:1);if(D>0)hurt(b,D*Math.sqrt(f)*(cover?.25:1),'boom');Body.setVelocity(b,{x:b.velocity.x+dx/d*11*k*f*pk,y:b.velocity.y+dy/d*11*k*f*pk-2*f*pk})}
    const e=d-ext(b);if(ice&&e<R*.8)freeze(b);if(hot&&!cover&&e<(ty==='oil'?80:46))ignite(b)}
  for(const r of S.ropes)if(!r.cut){const a=r.c.pointA,q=att(r);if(segDist(x,y,a.x,a.y,q.x,q.y)<R*.55+8)cut(r)}
  const c1=ice?'#bfe9f7':'#ff8a3a',c2=ice?'#ffffff':'#ffd65c';
  puff(x,y,c1,8+18*k|0,3+4*k);puff(x,y,c2,5+9*k|0,2+3*k);if(!ice)puff(x,y,'#5a5a5a',6*k|0,3);
  for(let i=0;i<12*k;i++){const a=Math.random()*6.28,v=5+Math.random()*7;S.fx.push({sp:1,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-2,life:.25+Math.random()*.3,col:c2})}
  S.fx.push({ring:1,x,y,life:.35,R,ice});S.shake=.3*k;if(k>.6)S.flash=.09;
  say(ice?'冻住!':hot?'着火!':k>.9?'轰!':'砰!',x,y-R*.45,26,ice?'#bfe9f7':undefined,.6)}
function fire(vx,vy,px=OX,py=OY){
  if(S.state!=='aim'||!S.ammo.length||S.over)return false;
  const type=S.ammo.splice(S.sel<S.ammo.length?S.sel:0,1)[0],a=AM[type];S.sel=0;S.kills=0;
  S.cur=add(Bodies.circle(px,py,a.r,{density:a.den,friction:.6,restitution:.25,frictionAir:0}),{kind:'shot',type,r:a.r});
  Body.setVelocity(S.cur,{x:vx,y:vy});Body.setAngularVelocity(S.cur,.12);
  S.state='fly';S.ft=0;S.hitT=-1;S.trail=[];return true}
function tap(tx,ty){const c=S.cur;if(S.state!=='fly'||!c||c.g.gone||c.g.used||c.g.hit)return;
  if(c.g.type==='melon'){c.g.used=1;c.g.bang=1;booms.push(c)}
  else if(c.g.type==='guided'){if(tx==null)return;const dx=tx-c.position.x,dy=ty-c.position.y,d=Math.hypot(dx,dy)||1,sp=Math.max(14,c.speed*1.15);c.g.used=1;c.g.straight=1;Body.setVelocity(c,{x:dx/d*sp,y:dy/d*sp});S.fx.push({ring:1,x:tx,y:ty,life:.35,R:22})}
  else if(c.g.type==='chili'){c.g.used=1;const v=c.velocity,sp=Math.hypot(v.x,v.y)*1.05,an=Math.atan2(v.y,v.x),{x,y}=c.position;kill(c);
    [-.2,0,.2].forEach((d,i)=>{const s=add(Bodies.circle(x,y+d*40,8,{density:.006,friction:.6,restitution:.25,frictionAir:0}),{kind:'shot',type:'mini',r:8});
      Body.setVelocity(s,{x:Math.cos(an+d)*sp,y:Math.sin(an+d)*sp});if(i===1)S.cur=s});puff(x,y,'#ffb347',10,3)}}
// 孢子花：每打完一发，在自己旁边再长出一株花苞（每株最多 3 次）
function sprout(){for(const b of targets()){const g=b.g;if(g.t!=='spore'||g.burn||g.frozen>0||(g.kids||0)>=3)continue;const p=b.position,br=TG.bud.r,all=bodies(),sd=g.kids%2?1:-1;
  for(const [dx,dy] of [[sd*(g.r+br+5),g.r-br-1],[-sd*(g.r+br+5),g.r-br-1],[0,-g.r-br-6]]){const x=p.x+dx,y=p.y+dy;
    if(Query.region(all,{min:{x:x-br,y:y-br},max:{x:x+br,y:y+br-3}}).length)continue;
    spawnT('bud',x,y);g.kids=(g.kids||0)+1;puff(x,y,'#f2d23a',10,2.5);say('孢子!',x,y-22,20,'#f2d23a');break}}}
const WHY={boom:'炸飞!',crush:'砸死!',fall:'摔死!',fire:'烧焦!',hit:'命中!'},COMBO=['','','双杀!','三杀!','四杀!','五杀!'];
function tick(){
  Engine.update(engine,DT);S.t++;if(S.settle>0)S.settle--;
  for(const s of booms.splice(0))if(!s.g.gone)boom(s);
  for(const b of dead){if(b.g.gone)continue;const g=b.g,{x,y}=b.position;kill(b);
    if(g.kind==='target'){const c=TG[g.t].c;S.kills++;S.score+=100*S.kills;
      puff(x,y,'#fff',10,4);puff(x,y,c,12,4);puff(x,y,'#7c1a26',6,3);S.stains.push({x,y,r:g.r*1.3,c,sd:S.t%97});if(S.stains.length>10)S.stains.shift();
      say(g.frozen>0?'碎了!':WHY[g.last]||'消灭!',x,y-20,26,undefined,.9);
      if(S.kills>=2)say(COMBO[Math.min(5,S.kills)],x,y-52,38,'#ff3b2e',1.2);
      // 最后一株：慢动作 + 镜头推近
      if(!targets().length&&!S.over){S.slow=.9;S.zoom={x:Math.max(70,Math.min(W-70,x)),y:Math.max(70,Math.min(G-70,y))}}}
    else if(g.kind==='root'){puff(x,y,'#86a04e',14,4);say('藤蔓断了!',x,y-20,24,'#a8dc6c',1)}
    else if(g.m==='tnt'||g.m==='oil'){b.g.gone=0;boom(b)}
    else{S.score+=10;if(g.frozen>0){chips(x,y,'#cfefff',8);puff(x,y,'#fff',5,3)}else{puff(x,y,MAT[g.m].c,6,3);chips(x,y,g.burn?'#3a2a24':MAT[g.m].c,5)}}}
  dead.clear();
  let burning=false;
  for(const b of bodies()){const g=b.g,p=b.position;if(g.gone)continue;
    if(g.gate){const u=Math.max(0,Math.min(1,(Math.sin(S.t/g.per*6.283)+.3)*1.6));Body.setPosition(b,{x:p.x,y:g.y0-g.amp*u});continue}
    if(b.isStatic)continue;
    if(p.x<-150||p.x>W+150||p.y>H+150){if(g.kind==='target'){g.last='fall';dead.add(b)}else kill(b);continue}
    if(g.keepV){Body.setVelocity(b,g.keepV);g.keepV=null;chips(p.x,p.y,'#f2d23a',4)}
    if(g.kind==='shot'&&!g.hit){if(g.straight)Body.applyForce(b,p,{x:0,y:-b.mass*.001});if(S.t%2===0&&S.fx.length<300)S.fx.push({sm:1,x:p.x-b.velocity.x,y:p.y-b.velocity.y,vx:0,vy:-.15,life:.55,col:'#4a4046',r:3.5})}
    if(g.kind==='shot'&&g.hit&&++g.hit>220){puff(p.x,p.y,'#fff',6,2);kill(b)}
    if(g.flash>0)g.flash-=1/60;
    if(g.frozen>0)g.frozen--;
    if(g.burn){burning=true;g.burn++;g.hp-=g.kind==='block'?MAT[g.m].burn:g.max/90;g.last='fire';const e=ext(b);
      if(g.burn%3===0&&S.fx.length<340)S.fx.push({fl:1,x:p.x+(Math.random()-.5)*e*1.6,y:p.y+(Math.random()-.5)*e*1.2,vx:(Math.random()-.5)*.6,vy:-1.1-Math.random(),life:.35+Math.random()*.3,r:3+Math.random()*4});
      if(g.burn%15===0)for(const o of bodies())if(o!==b&&!o.g.burn&&near(b,o,7))ignite(o);
      if(g.hp<=0)dead.add(b)}
    if(g.kind==='target'&&!g.burn&&!(g.frozen>0)){const d=TG[g.t];
      if(d.regen&&g.hp<g.max&&S.t-(g.hitT||0)>45){g.hp=Math.min(g.max,g.hp+d.regen);if(S.t%14===0)S.fx.push({txt:'+',x:p.x+(Math.random()-.5)*24,y:p.y-g.r,life:.5,sz:18,c:'#7dffb0'})}
      // 吞噬花：导弹从正面（左边）靠近就一口吞掉，然后要消化一阵子
      if(g.t==='maw'){if(g.cd>0)g.cd--;else for(const s of bodies()){if(s.g.kind!=='shot'||s.g.hit||s.g.gone)continue;const dx=s.position.x-p.x,dy=s.position.y-p.y;
        if(dx<6&&Math.hypot(dx,dy)<g.r+40){kill(s);g.cd=200;puff(p.x-g.r,p.y,'#c22a3a',8,3);say('吞了!',p.x,p.y-g.r-16,26,'#ff7b8f',.9);break}}}}
  }
  for(const r of S.ropes)if(!r.cut){const a=r.c.pointA,q=att(r);for(const s of bodies())if(s.g.kind==='shot'&&!s.g.gone&&segDist(s.position.x,s.position.y,a.x,a.y,q.x,q.y)<s.g.r+2){cut(r);break}}
  if(S.state==='fly'){S.ft++;const c=S.cur;if(!c.g.gone&&!c.g.hit&&S.ft%3===0)S.trail.push([c.position.x,c.position.y]);
    if(c.g.gone||(S.hitT>=0&&S.ft-S.hitT>60)||S.ft>420){S.state=S.ammo.length?'aim':'wait';S.wt=0;S.calm=0;S.last=S.trail;if(S.ammo.length)sprout()}}
  if(!S.over){
    if(!targets().length){if(++S.winT>45)finish(true)}
    else if(S.state==='wait'){if(!burning)S.wt++;let mx=0;for(const b of bodies())if(!b.isStatic)mx=Math.max(mx,b.speed);S.calm=mx<.25&&!burning?S.calm+1:0;if(S.calm>50||S.wt>500)finish(false)}}
}
function finish(win){S.over=true;S.win=win;const left=S.ammo.length,st=win?(left>=2?3:left===1?2:1):0;S.stars=st;if(win)S.score+=left*500;
  if(win&&!noSave){save.stars[S.lv]=Math.max(save.stars[S.lv]||0,st);put()}
  if(noSave)return;UI={mode:'result',win,st,left,n:targets().length,t:0}}
function menu(){UI={mode:'menu'}}

// ---------- 输入（由 Cocos 组件转发，坐标是 540x960 设计坐标，原点在左上） ----------
function pull(){const d=S.drag;if(!d)return null;let dx=d.x-d.sx,dy=d.y-d.sy;const l=Math.hypot(dx,dy);if(l>PMAX){dx*=PMAX/l;dy*=PMAX/l}
  const r=AM[S.ammo[S.sel]||S.ammo[0]].r;if(OY+dy>G-r-2)dy=G-r-2-OY;return {dx,dy,l:Math.hypot(dx,dy)}}
function down(x,y){if(uiTap(x,y))return;if(!S||S.over||UI.mode!=='play')return;
  // 底部弹药栏：瞄准阶段点一下就换成那枚导弹
  if(S.state==='aim'&&y>G+8&&y<G+64&&x>TX-TS/2){const i=Math.round((x-TX)/TS);if(i>=0&&i<S.ammo.length)S.sel=i;return}
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
const SC={sugar:['#fbf6ea','#ef4b4b',11],chili:['#fbf6ea','#f5b82e',23],mini:['#fbf6ea','#f5b82e',37],melon:['#a8cc6a','#ef4b4b',41],guided:['#fbf6ea','#4a8ee0',53],fire:['#f08a2a','#b3261e',61],frost:['#cfefff','#4a8ee0',67],drill:['#8a909c','#f2d23a',71]};
function drawShot(type,x,y,an,r,fl){const [c0,c1,sd]=SC[type],L=r*1.5,w=r*.66;C.save();C.translate(x,y);C.rotate(an);
  if(fl){const f=Math.random();blob([[-L,-w*.8],[-L-r*(.9+f),-w*.2],[-L-r*(1.5+f),0],[-L-r*(.9+f),w*.3],[-L,w*.8]]);ink('#f08a2a',1.8);blob([[-L,-w*.4],[-L-r*.8,0],[-L,w*.4]]);C.fillStyle='#f2d23a';C.fill()}
  for(const d of [-1,1]){blob([[-L+r*.1,d*w*.8],[-L-r*.5,d*(w+r*.75)],[-L+r*.9,d*w*.9]]);ink(c1,2)}
  const body=()=>{const q=jr(sd);blob([[-L*1.05,0],[-L,-w],[0,-w*1.12],[L*.65,-w],[L*1.3,0],[L*.65,w],[0,w*1.12],[-L,w]].map(p=>[p[0]+q(),p[1]+q()]))};
  body();cfill(c0);C.save();C.clip();C.fillStyle=c1;C.fillRect(-L*1.2,-w*2,L*.34,w*4);C.fillRect(-L*.3,-w*2,L*.2,w*4);C.restore();body();ink(null,2.4);
  if(r>8.5){dot(L*.6,-w*.3,2,'#fff');dot(L*.65,-w*.3,1.1,'#b3261e');C.beginPath();C.moveTo(L*.28,w*.3);for(let i=1;i<=6;i++)C.lineTo(L*.28+i*L*.115,w*.3+(i%2?w*.36:-w*.04)*(1-i*.09));C.strokeStyle=INK;C.lineWidth=1.5;C.lineJoin='round';C.stroke()}
  C.restore()}
// 植物身上的状态覆盖层：烧焦、冰冻、受击闪白
function stat(g,r,sd){if(g.burn){C.globalAlpha=Math.min(.6,g.burn/60);wcirc(0,0,r,sd);C.fillStyle='#17110f';C.fill();C.globalAlpha=1}
  if(g.frozen>0){C.globalAlpha=.6;wcirc(0,0,r+2,sd);C.fillStyle='#cfefff';C.fill();C.globalAlpha=1;wcirc(0,0,r+2,sd);C.strokeStyle='#fff';C.lineWidth=2;C.stroke()}
  if(g.flash>0){C.globalAlpha=Math.min(1,g.flash*3);wcirc(0,0,r,sd);C.fillStyle='#fff';C.fill();C.globalAlpha=1}}
function drawBody(b){const g=b.g,p=b.position;C.save();C.translate(p.x,p.y);C.rotate(b.angle);
  if(g.kind==='block'){const m=MAT[g.m],w=g.w,h=g.h,hz=w>h,sd=g.seed;wrect(-w/2,-h/2,w,h,sd);cfill(m.c);
    C.strokeStyle=m.d;C.lineWidth=1.6;C.lineCap='round';
    if(g.m==='bis'){if(hz){wline(-w/2+6,-1.5,w/2-8,-1,sd+1);C.stroke();wline(-w/4,2.5,w/4,3,sd+2);C.stroke()}else{wline(-1.5,-h/2+6,-1,h/2-8,sd+1);C.stroke();wline(2.5,-h/4,3,h/4,sd+2);C.stroke()}}
    else if(g.m==='cho'){for(let i=0;i<4;i++){const t=(i+.5)/4-.5;hz?dot(t*w,i%2?2:-2,1.5,m.d):dot(i%2?2:-2,t*h,1.5,m.d)}}
    else if(g.m==='ice'){C.strokeStyle='#8a3a1a';C.lineWidth=2.5;hz?wline(-w/2+6,1,-w/2+w*.45,-1,sd+1):wline(1,-h/2+6,-1,-h/2+h*.45,sd+1);C.stroke()}
    else if(g.m==='arm'){C.strokeStyle='#4fe3ff';C.lineWidth=2;hz?wline(-w/2+7,0,w/2-7,0,sd+1,.5):wline(0,-h/2+7,0,h/2-7,sd+1,.5);C.stroke();for(const t of [-.38,.38])hz?dot(t*w,0,2,m.d):dot(0,t*h,2,m.d)}
    else if(g.m==='oil'){C.strokeStyle=m.d;C.lineWidth=2.4;wline(-w/2+1,-h*.27,w/2-1,-h*.27,sd+1,.5);C.stroke();wline(-w/2+1,h*.27,w/2-1,h*.27,sd+2,.5);C.stroke();blob([[0,-7],[5,2],[0,6],[-5,2]]);C.fillStyle='#f2d23a';C.fill()}
    else if(g.m==='wt'){C.fillStyle=LITE;C.font='700 13px '+FONT;C.textAlign='center';C.fillText('1吨',0,6);dot(0,-h/2+1,4,INK)}
    else{C.fillStyle=LITE;C.font='700 10px '+FONT;C.textAlign='center';C.fillText('TNT',0,3.5)}
    wrect(-w/2,-h/2,w,h,sd);ink(null);
    if(g.burn){C.globalAlpha=Math.min(.65,g.burn/160);wrect(-w/2,-h/2,w,h,sd);C.fillStyle='#17110f';C.fill();C.globalAlpha=1}
    if(g.frozen>0){C.globalAlpha=.6;wrect(-w/2,-h/2,w,h,sd);C.fillStyle='#cfefff';C.fill();C.globalAlpha=1;C.strokeStyle='#fff';C.lineWidth=1.6;C.beginPath();C.moveTo(-w/4,-h/4);C.lineTo(-w/4+5,-h/4+7);C.moveTo(w/5,0);C.lineTo(w/5+4,6);C.stroke()}
    if(wrapped(g)){C.lineCap='round';for(const [lw,c] of [[5,INK],[2.4,'#5f8f3a']]){C.strokeStyle=c;C.lineWidth=lw;hz?wline(-w/2,-h/2-1,w/2,h/2+1,sd+5,2):wline(-w/2-1,-h/2,w/2+1,h/2,sd+5,2);C.stroke()}C.beginPath();C.ellipse(0,0,5.5,2.6,.6,0,7);C.fillStyle='#86a04e';C.fill();C.strokeStyle=INK;C.lineWidth=1.2;C.stroke()}
    if(g.hp<g.max*.6){const k=(sd*37%10)/10-.5;C.beginPath();if(hz){C.moveTo(k*w*.5,-h/2);C.lineTo(k*w*.5+4,0);C.lineTo(k*w*.5-3,h/2)}else{C.moveTo(-w/2,k*h*.5);C.lineTo(0,k*h*.5+4);C.lineTo(w/2,k*h*.5-3)}C.strokeStyle=INK;C.lineWidth=1.8;C.stroke()}
    if(g.flash>0){C.globalAlpha=Math.min(1,g.flash*3);wrect(-w/2,-h/2,w,h,sd);C.fillStyle='#fff';C.fill();C.globalAlpha=1}}
  else if(g.kind==='target'&&g.t==='maw'){const t=TG.maw,r=g.r,sd=157,tt=g.frozen>0?0:performance.now()/1000;C.rotate(-b.angle);
    let nd=1e9;if(!(g.cd>0)&&!g.burn&&!(g.frozen>0))for(const o of bodies())if(o.g.kind==='shot'&&!o.g.hit)nd=Math.min(nd,Math.hypot(o.position.x-p.x,o.position.y-p.y));
    const op=g.cd>0?(g.cd>150?.3+.22*Math.sin(g.cd*.7):.07):nd<180?1:.42+.08*Math.sin(tt*3),ha=op*.8,hx=r*.55,R2=r*1.7;
    C.lineCap='round';for(let i=0;i<4;i++){const a=.9+i*.45,w=Math.sin(tt*3+i*2)*.3;C.beginPath();C.moveTo(Math.cos(a)*r*.8,Math.sin(a)*r*.8);C.quadraticCurveTo(Math.cos(a+w*.5)*r*1.25,Math.sin(a+w*.5)*r*1.25,Math.cos(a+w)*r*1.55,Math.sin(a+w)*r*1.55);C.strokeStyle=INK;C.lineWidth=3.6;C.stroke();C.strokeStyle=t.d;C.lineWidth=1.4;C.stroke()}
    for(let i=0;i<5;i++){const a=-1.25+i*.62,pc=(da,d)=>[Math.cos(a+da)*r*d,Math.sin(a+da)*r*d];blob([pc(-.2,.85),pc(0,1.42),pc(.2,.85)]);ink('#3f6a2a',1.6)}
    wcirc(0,0,r,sd,1.3);ink(g.cd>0?'#c9627c':t.c);
    C.save();wcirc(0,0,r-1.2,sd,1.3);C.clip();C.beginPath();C.moveTo(hx,0);C.arc(hx,0,R2,Math.PI-ha,Math.PI+ha);C.closePath();C.fillStyle='#16040a';C.fill();
    if(op>.3){blob([[hx-r*.3,0],[-r*.4,r*.16*op],[-r*.8,0],[-r*.4,-r*.14*op]]);C.fillStyle='#c22a3a';C.fill()}
    for(const sg of [-1,1]){const A=Math.PI+sg*ha,ux=Math.cos(A),uy=Math.sin(A),B=A-sg*Math.min(.3,ha*.9);
      C.beginPath();C.moveTo(hx,0);C.lineTo(hx+ux*R2,uy*R2);C.strokeStyle=INK;C.lineWidth=4.4;C.stroke();C.strokeStyle='#7c1a26';C.lineWidth=2;C.stroke();
      C.fillStyle=LITE;C.strokeStyle=INK;C.lineWidth=.9;
      for(let i=0;i<5;i++){const q=r*(.36+i*.25);C.beginPath();C.moveTo(hx+ux*(q-r*.09),uy*(q-r*.09));C.lineTo(hx+Math.cos(B)*q*.97,Math.sin(B)*q*.97);C.lineTo(hx+ux*(q+r*.09),uy*(q+r*.09));C.closePath();C.fill();C.stroke()}}
    C.restore();wcirc(0,0,r,sd,1.3);ink(null);
    for(const [ex,ey,er] of [[r*.3,-r*.62,r*.19],[r*.7,-r*.25,r*.14]]){dot(ex,ey,er,'#0d0507');dot(ex,ey,er*.5,g.cd>0?'#7a1414':'#ff3b2e');if(!(g.cd>0))dot(ex,ey,er*.18,'#ffe9c0')}
    if(g.cd>0){C.fillStyle=LITE;C.font='700 13px '+FONT;C.textAlign='center';C.fillText('消化中',0,-r-9)}
    stat(g,r,sd)}
  else if(g.kind==='root'){const r=g.r,tt=performance.now()/1000;C.lineCap='round';
    for(let i=0;i<5;i++){const a=.5+i*.53;C.beginPath();C.moveTo(Math.cos(a)*r*.7,Math.sin(a)*r*.7);C.lineTo(Math.cos(a)*r*1.5,Math.sin(a)*r*1.5);C.strokeStyle=INK;C.lineWidth=4.6;C.stroke();C.strokeStyle='#5f8f3a';C.lineWidth=2;C.stroke()}
    for(let i=0;i<3;i++){const a=-2.1+i*.53,pc=(da,d)=>[Math.cos(a+da)*r*d,Math.sin(a+da)*r*d];blob([pc(-.22,.85),pc(0,1.5),pc(.22,.85)]);ink('#3f6a2a',1.6)}
    wcirc(0,0,r,91,1);ink(TG.root.c);dot(0,r*.25,r*.42*(.8+.2*Math.sin(tt*4)),'rgba(170,255,120,.55)');
    for(const k of [-1,1]){dot(k*r*.4,-r*.25,r*.2,'#0d0507');dot(k*r*.4,-r*.25,r*.09,'#f2d23a')}
    stat(g,r,91)}
  else if(g.kind==='target'){const t=TG[g.t],r=g.r,hurtF=g.hp<g.max*.55,big=g.t==='cooker',sd=r*7+3,tt=g.frozen>0?p.x:performance.now()/1000+p.x*.013,tw=g.frozen>0?0:BO-1;
    // 带刺的藤蔓：从下半身伸出来，一直在扭，末端一片叶子
    C.lineCap='round';for(let i=0,rg=g.t==='vine',n=big?7:rg?10:5;i<n;i++){const a=rg?i*.6283+.3:.35+i*(2.45/(n-1)),w=Math.sin(tt*(big?3:4.5)+i*1.7)*.38,l=r*(big?1.65:1.5);
      C.beginPath();C.moveTo(Math.cos(a)*r*.8,Math.sin(a)*r*.8);C.quadraticCurveTo(Math.cos(a+w*.5)*r*1.25,Math.sin(a+w*.5)*r*1.25,Math.cos(a+w)*l,Math.sin(a+w)*l);C.strokeStyle=INK;C.lineWidth=big?4.4:3.4;C.stroke();C.strokeStyle=t.d;C.lineWidth=big?1.8:1.2;C.stroke();
      const mx=Math.cos(a+w*.5)*r*1.12,my2=Math.sin(a+w*.5)*r*1.12,tx=Math.cos(a+w)*l,ty=Math.sin(a+w)*l;C.beginPath();C.moveTo(mx,my2);C.lineTo(mx+Math.cos(a+1.3)*4.5,my2+Math.sin(a+1.3)*4.5);C.strokeStyle=INK;C.lineWidth=1.6;C.stroke();
      C.beginPath();C.ellipse(tx,ty,big?5.5:4.5,big?2.6:2.2,a+w+.5,0,7);C.fillStyle=t.d;C.fill();C.strokeStyle=INK;C.lineWidth=1.2;C.stroke()}
    // 大的是一圈血红花瓣的魔眼花，小的是顶着尖萼片的食人花苞
    if(big)for(let i=0;i<10;i++){const a=i*.6283+.2+Math.sin(tt*1.5+i)*.04,pc=(da,d)=>[Math.cos(a+da)*r*d,Math.sin(a+da)*r*d];blob([pc(-.3,.8),pc(-.16,1.3),pc(0,1.72),pc(.16,1.3),pc(.3,.8)]);ink(i%2?'#a3242e':'#7c1a26',1.8)}
    else for(let i=0;i<5;i++){const a=-2.62+i*.52,pc=(da,d)=>[Math.cos(a+da)*r*d,Math.sin(a+da)*r*d];blob([pc(-.24,.8),pc(-.1,1.2),pc(0,1.5),pc(.1,1.2),pc(.24,.8)]);ink('#3f6a2a',1.6)}
    if(g.t==='spore')for(const [px,py,pr] of [[-r*.62,-r*.86,r*.36],[0,-r*1.1,r*.42],[r*.62,-r*.86,r*.36]]){wcirc(px,py,pr,sd+pr|0,.6);ink('#f2d23a',1.6)}
    wcirc(0,0,r,sd,1.3);ink(t.c);
    if(g.t==='spore')for(const [px,py] of [[-.55,-.5],[.6,.25],[-.25,.66],[.3,-.62]])dot(px*r,py*r,r*.12,'#fff3b0');
    if(g.t==='vine'){C.beginPath();C.arc(0,0,r+5,-1.571,-1.571+6.283*Math.max(0,g.hp/g.max));C.strokeStyle=g.hp<g.max?'#7dffb0':'rgba(125,255,176,.4)';C.lineWidth=2.6;C.lineCap='round';C.stroke()}
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
    stat(g,r,sd)}
  else if(g.kind==='shelf'){C.strokeStyle=INK;C.lineWidth=3;wline(-g.w/2+14,g.h/2,-g.w/2+16,g.h/2+26,90);C.stroke();wline(-g.w/2+16,g.h/2+26,-g.w/2+42,g.h/2,91);C.stroke();wline(g.w/2-14,g.h/2,g.w/2-16,g.h/2+26,92);C.stroke();wline(g.w/2-16,g.h/2+26,g.w/2-42,g.h/2,93);C.stroke();wrect(-g.w/2,-g.h/2,g.w,g.h,94);ink('#d59a55')}
  else if(g.kind==='wall'){const w=g.w,h=g.h;wrect(-w/2,-h/2,w,h,95);ink(g.gate?'#f2b83a':'#7f8a9c');
    if(g.gate){C.save();wrect(-w/2,-h/2,w,h,95);C.clip();C.strokeStyle=INK;C.lineWidth=5;for(let y=-h/2-w;y<h/2+w;y+=14){C.beginPath();C.moveTo(-w/2-2,y+w);C.lineTo(w/2+2,y);C.stroke()}C.restore();wrect(-w/2,-h/2,w,h,95);ink(null)}
    else for(const t of [-.4,0,.4])w>h?dot(t*w,0,1.8,'#394353'):dot(0,t*h,1.8,'#394353')}
  else if(g.kind==='bounce'){const w=g.w,h=g.h;wrect(-w/2,-h/2,w,h,96);ink('#dfe6ee');C.strokeStyle='#4fe3ff';C.lineWidth=3;C.lineCap='round';wline(-w/2+6,0,w/2-6,0,97,.4);C.stroke()}
  C.restore();if(g.kind==='shot')g.hit?drawShot(g.type,p.x,p.y,b.angle,g.r):drawShot(g.type,p.x,p.y,Math.atan2(b.velocity.y,b.velocity.x),g.r,1)}
function star(x,y,R,ph){C.beginPath();for(let i=0;i<20;i++){const a=i*.3142+ph,d=i%2?R*.62:R;C.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d)}C.closePath()}
function drawWorld(){BO=(performance.now()/170|0)%3;C=ctx;const T=performance.now()/1000;
  C.setTransform(SCL,0,0,SCL,0,0);
  if(S&&S.zoom){S.zk+=((S.slow>0?1:0)-S.zk)*.12;if(S.zk>.004){const z=1+.32*S.zk;C.translate(S.zoom.x,S.zoom.y);C.scale(z,z);C.translate(-S.zoom.x,-S.zoom.y)}}
  C.drawImage(bg,0,0,W,H);if(!S)return;
  for(let i=0;i<34;i++)dot((i*137.5+T*(8+i%5*4))%W,(i*71.3+T*(14+i%7*5))%G,1.2+i%3*.6,'rgba(25,15,15,.55)');
  for(let i=0;i<14;i++)dot((i*211+Math.sin(T+i)*24+W)%W,G-((i*53+T*(18+i%4*8))%G),1.6,'rgba(255,180,70,.85)');
  if(S.shake>0){S.shake-=1/60;C.translate((Math.random()-.5)*8*S.shake/.3,(Math.random()-.5)*8*S.shake/.3)}
  for(const q of S.last)dot(q[0],q[1],2,'rgba(23,17,15,.4)');
  for(const q of S.trail)dot(q[0],q[1],2.4,'#f2d23a');
  const p=pull(),sx=OX,sy=OY;
  for(const s of S.stains){C.globalAlpha=.5;wcirc(s.x,s.y,s.r,s.sd,5);C.fillStyle=s.c;C.fill();for(let i=0;i<5;i++)dot(s.x+Math.cos(i*1.3+s.sd)*s.r*1.45,s.y+Math.sin(i*1.3+s.sd)*s.r*1.45,2+i%3,s.c);C.globalAlpha=1}
  C.lineCap='round';
  for(const b of bodies())if(wrapped(b.g)){const a=b.g.vine.position,q=b.position;for(const [lw,c] of [[5,INK],[2.2,'#5f8f3a']]){C.beginPath();C.moveTo(a.x,a.y);C.quadraticCurveTo((a.x+q.x)/2,Math.max(a.y,q.y)+30,q.x,q.y);C.strokeStyle=c;C.lineWidth=lw;C.stroke()}}
  for(const r of S.ropes){const a=r.c.pointA,q=r.cut?{x:a.x+3,y:a.y+16}:att(r);C.beginPath();C.moveTo(a.x,a.y);C.lineTo(q.x,q.y);C.strokeStyle=INK;C.lineWidth=4.4;C.stroke();C.strokeStyle='#d9b06a';C.lineWidth=1.8;C.stroke();wrect(a.x-9,a.y-5,18,8,83,.5);ink('#394353',1.8)}
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
  for(let i=S.fx.length-1;i>=0;i--){const f=S.fx[i];f.life-=1/60;if(f.life<=0){S.fx.splice(i,1);continue}
    if(f.sp){f.x+=f.vx;f.y+=f.vy;f.vy+=.3;C.globalAlpha=Math.min(1,f.life*4);C.beginPath();C.moveTo(f.x,f.y);C.lineTo(f.x-f.vx*1.6,f.y-f.vy*1.6);C.strokeStyle=f.col;C.lineWidth=2;C.lineCap='round';C.stroke();C.globalAlpha=1}
    else if(f.fl){f.x+=f.vx;f.y+=f.vy;const k=Math.min(1,f.life*2.5);dot(f.x,f.y,f.r*k+1,'rgba(240,96,30,.85)');dot(f.x,f.y+1,f.r*k*.55,'#ffd65c')}
    else if(f.sq){f.x+=f.vx;f.y+=f.vy;f.vy+=.25;C.globalAlpha=Math.min(1,f.life*2);C.save();C.translate(f.x,f.y);C.rotate(f.life*9);C.fillStyle=f.col;C.fillRect(-f.r,-f.r,f.r*2,f.r*2);C.strokeStyle=INK;C.lineWidth=1.2;C.strokeRect(-f.r,-f.r,f.r*2,f.r*2);C.restore();C.globalAlpha=1}
    else if(f.ring){if(f.R<30){wcirc(f.x,f.y,f.R*.7,9);C.strokeStyle='#ff3b2e';C.lineWidth=3;C.stroke();C.beginPath();C.moveTo(f.x-f.R,f.y);C.lineTo(f.x+f.R,f.y);C.moveTo(f.x,f.y-f.R);C.lineTo(f.x,f.y+f.R);C.stroke()}
      else{const k=1-f.life/.35,R=f.R*(.45+.55*k);C.globalAlpha=Math.min(1,f.life*5);star(f.x,f.y,R,f.x);ink(f.ice?'#ffffff':'#f2d23a',2.8);star(f.x,f.y,R*.6,f.x+.3);ink(f.ice?'#bfe9f7':'#e0602a',2.2);star(f.x,f.y,R*.28,f.x+.6);ink(f.ice?'#4a8ee0':'#b3261e',1.8);C.globalAlpha=1}}
    else if(f.txt){f.y-=.6;C.globalAlpha=Math.min(1,f.life*2);C.font='700 '+(f.sz||26)+'px '+FONT;C.textAlign='center';C.lineJoin='round';C.lineWidth=6;C.strokeStyle=INK;C.strokeText(f.txt,f.x,f.y);C.fillStyle=f.c||'#f2d23a';C.fillText(f.txt,f.x,f.y);C.globalAlpha=1}
    else{f.x+=f.vx;f.y+=f.vy;if(!f.sm)f.vy+=.2;C.globalAlpha=Math.min(1,f.life*2)*(f.sm?.75:1);C.beginPath();C.arc(f.x,f.y,f.r,0,7);C.fillStyle=f.col;C.fill();C.strokeStyle=INK;C.lineWidth=1.3;C.stroke();C.globalAlpha=1}}
  C.setTransform(SCL,0,0,SCL,0,0);
  if(S.flash>0){C.fillStyle=`rgba(255,244,220,${Math.min(.7,S.flash*7)})`;C.fillRect(0,0,W,H);S.flash-=1/60}
  // 弹药栏：瞄准时点一下换弹
  if(S.ammo.length){wrect(TX-27,G+9,S.ammo.length*TS+10,54,81);ink('#3a2a24',2.2);
    S.ammo.forEach((t,i)=>{const x=TX+i*TS;if(i===S.sel&&S.state==='aim'){wrect(x-18,G+13,36,46,82,.6);ink('#f2d23a',2)}drawShot(t,x,TY+3,-1.571,AM[t].r*.95)})}
  let tip='';if(S.state==='aim'&&S.ammo.length){const a=AM[S.ammo[S.sel]||S.ammo[0]];tip=S.lv===0&&S.ammo.length===LV[0].ammo.length?'按住屏幕向下拖，松手发射':a.tip}
  else if(S.state==='fly'&&S.cur&&!S.cur.g.gone&&!S.cur.g.used&&!S.cur.g.hit&&(S.cur.g.type==='chili'||S.cur.g.type==='guided'))tip=S.cur.g.type==='chili'?'现在点屏幕分裂！':'点一下你想打的位置！';
  if(tip&&!S.over){C.font='700 16px '+FONT;C.textAlign='center';const w=C.measureText(tip).width+30;wrect(W/2-w/2,50,w,32,5);ink(PAPER);C.fillStyle=INK;C.fillText(tip,W/2,72)}
  C.font='700 16px '+FONT;C.textAlign='left';C.fillStyle=LITE;C.fillText('植物 '+targets().length,14,G+34);C.fillText('得分 '+S.score,14,G+58);
}
// ---------- 界面（原来是网页按钮，这里全部画在画布上并自己做点击判定） ----------
let BTN=[];
function label(txt,x,y,size,col,stroke){C.font='700 '+size+'px '+FONT;C.textAlign='center';if(stroke){C.lineJoin='round';C.lineWidth=stroke;C.strokeStyle=INK;C.strokeText(txt,x,y)}C.fillStyle=col;C.fillText(txt,x,y)}
function btn(x,y,w,h,txt,fill,fn,col){BTN.push({x,y,w,h,fn});wrect(x+3,y+4,w,h,x+y);C.fillStyle=INK;C.fill();wrect(x,y,w,h,x+y);ink(fill);label(txt,x+w/2,y+h/2+6,17,col||INK)}
function dim(a){C.fillStyle='rgba(24,8,10,'+a+')';C.fillRect(0,0,W,H)}
function drawUI(){C=ctx;C.setTransform(SCL,0,0,SCL,0,0);BTN=[];
  if(S&&UI.mode!=='menu'){btn(12,12,70,36,'关卡',PAPER,menu);btn(W-82,12,70,36,'重来',PAPER,()=>load(S.lv));label((S.lv+1)+' · '+LV[S.lv].name,W/2,38,21,LITE,5)}
  if(UI.mode==='menu'){dim(.9);BTN=[];label('末日防线',W/2,180,46,'#e0602a',8);label('拖拽发射 · 点弹药栏换弹 · 消灭所有变异植物',W/2,226,16,LITE);
    const open=save.stars.filter(s=>s>0).length,bw=118,bh=88,gap=10,x0=(W-bw*4-gap*3)/2,y0=262;
    LV.forEach((l,i)=>{const x=x0+(i%4)*(bw+gap),y=y0+(i>>2)*(bh+gap),lock=i>open,st=save.stars[i]||0;
      wrect(x+3,y+4,bw,bh,i+40);C.fillStyle=INK;C.fill();wrect(x,y,bw,bh,i+40);ink(lock?'#3a2626':PAPER);
      label(String(i+1),x+bw/2,y+31,24,lock?'#8a7070':INK);label(l.name,x+bw/2,y+52,14,lock?'#8a7070':INK);
      label(lock?'未解锁':'★'.repeat(st)+'☆'.repeat(3-st),x+bw/2,y+75,15,lock?'#8a7070':'#b3261e');
      if(!lock)BTN.push({x,y,w:bw,h:bh,fn:()=>load(i)})})}
  else if(UI.mode==='result'){UI.t+=1/60;dim(Math.min(.88,UI.t*2.2));BTN=[];if(UI.t<.45)return;
    const last=S.lv===LV.length-1,cy=380;
    if(UI.win){label(last?'全部通关！':'过关！',W/2,cy,46,'#e0602a',8);
      for(let i=0;i<3;i++)label('★',W/2+(i-1)*62,cy+78,54,i<UI.st?'#f2d23a':'#4a2a2a',6);
      label('得分 '+S.score+'   剩余导弹 '+UI.left+' 枚',W/2,cy+124,17,LITE);
      btn(W/2-170,cy+160,160,52,'再打一次','#77787f',()=>load(S.lv),LITE);
      last?btn(W/2+10,cy+160,160,52,'关卡','#c22a2a',menu,LITE):btn(W/2+10,cy+160,160,52,'下一关','#c22a2a',()=>load(S.lv+1),LITE)}
    else{label('导弹打光了',W/2,cy,44,'#e0602a',8);label('还有 '+UI.n+' 株植物没消灭，换个打法试试',W/2,cy+56,17,LITE);
      btn(W/2-170,cy+100,160,52,'关卡','#77787f',menu,LITE);btn(W/2+10,cy+100,160,52,'重来','#c22a2a',()=>load(S.lv),LITE)}}}
function uiTap(x,y){for(let i=BTN.length-1;i>=0;i--){const b=BTN[i];if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){b.fn&&b.fn();return true}}return UI.mode!=='play'}
function draw(){drawWorld();drawUI()}
let acc=0;
function step(dt){let k=1;if(S&&S.slow>0){S.slow-=dt;k=.25}acc+=Math.min(.05,dt)*k;while(acc>=1/60){tick();acc-=1/60}}
load(0);menu();
return {step,draw,down,move,up,cancel,
  // 调试/自动测试用
  debug:{get S(){return S},get UI(){return UI},load,fire,tap,tick,down,LV,TG,targets,bodies,set noSave(v){noSave=v},OX,OY,VK,PMAX}};
}
