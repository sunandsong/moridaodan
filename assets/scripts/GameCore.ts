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
const TG={pot:{hp:16,r:28,c:'#7a52d6',d:'#35e0d0'},cooker:{hp:42,r:35,c:'#241a3e',d:'#ff5ad0',j:'#ff5ad0'},
  vine:{hp:70,r:28,c:'#2fd0b0',d:'#b8fff0',regen:.35},maw:{hp:30,r:31,c:'#2a4fd0',d:'#35e0d0'},spore:{hp:24,r:27,c:'#ff7a4a',d:'#fff06a'},bud:{hp:8,r:18,c:'#3fd6c8',d:'#1f7a8a'},core:{hp:60,r:24,c:'#fff06a',d:'#ff9a3a'},root:{hp:22,r:20,c:'#d0408a',d:'#7a1f5a'},
  // 不是圆的：sh 是碰撞形状（rect 用 w/h，tri 是正三角），r 只用来算特效大小，hh 是中心到底边的距离；j 是爆出来的汁液颜色（不写就用 c）
  // 这四种的画法是按 1/SK 的尺寸写的，画的时候整体放大 SK 倍
  cactus:{hp:26,r:41,hh:40.5,w:36,h:81,sh:'rect',c:'#d04a9a',d:'#6a1f5a'},shroom:{hp:20,r:32,hh:28,w:64,h:56,sh:'rect',c:'#b06ae0',d:'#5a2a8a'},
  pod:{hp:22,r:43,hh:17,w:87,h:34,sh:'rect',c:'#35c0e0',d:'#1f6a8a'},thorn:{hp:18,r:31,hh:15.5,sh:'tri',c:'#5af0e6',d:'#2a8a9a',j:'#ff7ad8'}},SK=1.4;
const AM={sugar:{r:11,den:.004,name:'火箭弹',tip:'火箭弹：命中就爆炸'},chili:{r:10,den:.004,name:'集束导弹',tip:'集束导弹：飞行中再点一下屏幕，分裂成三枚'},melon:{r:15,den:.005,name:'巡航导弹',tip:'巡航导弹：命中后大范围爆炸，也可以点屏幕提前引爆'},guided:{r:10,den:.004,name:'制导导弹',tip:'制导导弹：飞行中点屏幕上任意位置，导弹会转向直飞过去'},
  fire:{r:10,den:.004,name:'燃烧弹',tip:'燃烧弹：点着木头和植物，火会一路蔓延'},frost:{r:10,den:.004,name:'冰冻弹',tip:'冰冻弹：冻住的东西一碰就碎，重甲也一样'},drill:{r:10,den:.005,name:'钻地弹',tip:'钻地弹：钻穿第一块挡路的方块，再爆炸'}};

function kit(){const out=[];
  const B=(m,x,bot,w,h)=>out.push({k:'b',m,x,y:bot-h/2,w,h});
  const T=(t,x,bot)=>out.push({k:'t',t,x,y:bot-(TG[t].hh||TG[t].r)});
  const S=(x,top,w)=>out.push({k:'s',x,y:top+7,w,h:14});
  const house=(x,bot,m,t,w=64)=>{w=Math.round(w*1.4);B(m,x-w/2,bot,16,90);B(m,x+w/2,bot,16,90);B(m,x,bot-90,w+30,12);if(t)T(t,x,bot);return bot-102};
  const root=(x,bot)=>out.push({k:'r',x,y:bot-TG.root.r});          // 寄生藤的根
  const Wt=(x,ay,len)=>out.push({k:'w',x,ay,len});                   // 吊着的配重：(x,ay) 是绳子上端
  const Wl=(x,y,w,h)=>out.push({k:'wall',x,y,w,h});                  // 打不坏的固定钢板（中心坐标）
  const P=(x,y,w,an)=>out.push({k:'p',x,y,w,an});                    // 反弹板
  const Gt=(x,y,w,h,amp,per)=>out.push({k:'g',x,y,w,h,amp,per});     // 定时闸门：周期性向上抬起 amp
  // 一堆同种植物，码成金字塔（每往上一层少一个，这样才站得稳）；返回堆顶的高度，方便在上面再放东西
  const C=(x,bot,w=14,h=64)=>out.push({k:'c',x,y:bot-h/2,w,h});      // 打不坏的木桩：挡住一堆植物不往两边滚（不挡冲击波）
  const pile=(x,bot,cols,rows,t='bud')=>{const r=TG[t].r,dx=r*2+1,dy=r*1.75;if(bot>=G)for(const k of [-1,1])C(x+k*(cols*dx/2+9),bot,14,34);rows=Math.min(rows,cols);for(let j=0;j<rows;j++)for(let c=0;c<cols-j;c++)T(t,x+(c-(cols-1-j)/2)*dx,bot-j*dy);return bot-((rows-1)*dy+r*2)};
  // 一排东西并肩摆开（植物类型名，或 'tnt' / 'oil'），以 x 为中心
  const wd=t=>t==='tnt'||t==='oil'?26:TG[t].sh==='tri'?TG[t].r*1.74:TG[t].w||TG[t].r*2;
  const row=(ts,x,bot)=>{let cx=x-ts.reduce((a,t)=>a+wd(t)+2,-2)/2;for(const t of ts){const w=wd(t);t==='tnt'?B(t,cx+w/2,bot,26,26):t==='oil'?B(t,cx+w/2,bot,24,32):T(t,cx+w/2,bot);cx+=w+2}};
  const boss=(tier=1)=>out.push({k:'boss',tier});
  return {out,B,T,S,house,root,Wt,Wl,P,Gt,pile,row,C,boss}}
// 前 10 关是"无脑爽"：大个头挤成一堆，旁边摆着炸药，打中炸药就连锁全灭；pop=植物死了会爆浆炸伤旁边的
const EZ={pop:1,ammo:['sugar','sugar','sugar']};
const LV=[
 // 第一关是机枪关：swarm=虫群总数。按住屏幕连发，虫群清完后 Boss 登场（见 gunTick）
 {name:'虫群来袭',swarm:70,pop:1,ammo:[],f:k=>{}},
 {name:'一窝端',...EZ,f:k=>{const t=k.pile(410,G,6,3);k.B('tnt',410,t,26,26);k.S(340,690,170);k.row(['pot','tnt','pot'],340,690)}},
 {name:'叠罗汉',...EZ,f:k=>{k.S(380,720,250);const t=k.house(380,720,'bis','cooker',70);k.row(['bud','tnt','bud'],380,t);k.T('pot',288,720);k.T('pot',472,720)}},
 {name:'火烧图腾',...EZ,f:k=>{k.S(380,690,250);k.T('cactus',347,690);k.T('cactus',413,690);k.B('oil',380,690,24,32);k.T('pod',380,609);k.T('thorn',380,575);k.T('shroom',296,690);k.T('shroom',464,690)}},
 {name:'三连炮',...EZ,f:k=>{for(const [x,y] of [[440,740],[360,640],[280,540]]){k.S(x,y,150);k.row(['pot','tnt','pot'],x,y)}}},
 {name:'尸山',...EZ,f:k=>{const t=k.pile(392,G,7,4);k.B('tnt',392,t,26,26);k.S(392,640,150);k.row(['pot','tnt','pot'],392,640)}},
 {name:'独木桥',...EZ,f:k=>{k.S(375,720,310);const t=k.house(300,720,'bis','pot');k.house(450,720,'bis','pot');k.B('tnt',375,720,26,26);k.B('tnt',375,694,26,26);k.T('pod',375,t);k.row(['bud','tnt','bud'],375,t-34)}},
 {name:'连环爆',...EZ,f:k=>{k.S(385,710,300);const t=k.house(300,710,'bis','cactus');k.house(470,710,'ice','shroom');k.B('tnt',385,710,26,26);k.B('tnt',300,t,26,26);k.T('bud',470,t);k.S(385,545,120);k.row(['bud','oil','bud'],385,545)}},
 {name:'满堂彩',...EZ,f:k=>{const t=k.pile(405,G,7,4);k.B('tnt',405,t,26,26);k.S(300,700,210);k.C(208,700);k.C(392,700);k.B('tnt',392,636,26,26);const q=k.pile(300,700,4,3);k.B('tnt',300,q,26,26);k.S(340,530,160);k.row(['pot','oil','pot'],340,530)}},
 {name:'虚空之母',boss:1,pop:1,ammo:['sugar','chili','sugar','guided','melon','sugar','drill','guided'],f:k=>{k.boss(1);k.pile(300,G,3,2)}},
 {name:'大扫除',...EZ,f:k=>{const t=k.pile(392,G,7,4);k.B('tnt',392,t,26,26);k.S(260,640,170);const a=k.house(260,640,'bis','cooker',70);k.B('tnt',330,640,26,26);k.row(['bud','tnt','bud'],260,a);k.S(390,520,150);k.row(['cactus','tnt','cactus'],390,520)}},
 {name:'新兵训练',ammo:['sugar','sugar','sugar'],f:k=>{k.S(380,640,130);k.house(380,640,'bis','pot')}},
 {name:'双子哨所',ammo:['sugar','sugar','sugar','sugar'],f:k=>{k.S(400,690,120);k.house(400,690,'bis','pot');k.S(210,470,120);k.house(210,470,'ice','cactus')}},
 {name:'二层岗楼',ammo:['sugar','sugar','sugar'],f:k=>{k.S(360,570,140);const t=k.house(360,570,'bis','pot');k.house(360,t,'ice','thorn')}},
 {name:'悬空掩体',ammo:['sugar','chili','sugar','sugar'],f:k=>{k.S(330,705,170);k.S(385,600,150);k.house(375,600,'bis','pot');k.B('tnt',444,600,26,26);k.S(170,420,110);k.house(170,420,'ice','pot')}},
 {name:'前沿三哨',ammo:['guided','guided','chili','guided','sugar'],f:k=>{k.S(420,700,120);k.house(420,700,'ice','pot');k.S(250,520,120);k.house(250,520,'ice','cactus');k.S(420,340,120);k.house(420,340,'ice','thorn')}},
 {name:'钢筋碉堡',ammo:['guided','melon','sugar','sugar'],f:k=>{k.S(370,560,170);const t=k.house(360,560,'cho','cooker',70);k.T('pot',360,t);k.B('tnt',436,560,26,26)}},
 {name:'瞭望高塔',ammo:['sugar','guided','melon','sugar'],f:k=>{k.S(380,720,170);let t=k.house(370,720,'bis','cooker',70);t=k.house(370,t,'bis','shroom',70);k.house(370,t,'ice','thorn',70);k.B('tnt',446,720,26,26)}},
 {name:'总攻',ammo:['guided','chili','melon','sugar','sugar'],f:k=>{k.S(425,730,150);k.house(425,730,'cho','shroom',70);k.S(275,540,170);const t=k.house(265,540,'bis','cooker',70);k.house(265,t,'bis','pot',70);k.B('tnt',342,540,26,26);k.S(420,330,130);k.house(420,330,'ice','pot')}},
 {name:'猩红之母',boss:2,pop:1,ammo:['sugar','frost','sugar','guided','melon','fire','drill','chili','sugar'],f:k=>{k.boss(2);k.pile(300,G,3,2)}},
 {name:'野火',ammo:['fire','sugar','sugar'],f:k=>{k.S(380,640,150);k.house(380,640,'bis','vine');k.S(210,450,110);k.house(210,450,'ice','cactus')}},
 {name:'血盆大口',ammo:['sugar','chili','guided','sugar'],f:k=>{k.S(390,600,130);k.T('maw',390,600);k.S(230,420,120);k.house(230,420,'ice','pot')}},
 {name:'孢子雨',ammo:['sugar','sugar','sugar','melon','sugar'],f:k=>{k.S(385,650,210);k.T('spore',385,650);k.S(215,440,120);k.T('cactus',182,440);k.T('cactus',248,440);k.T('pod',215,359);k.T('thorn',215,325)}},
 {name:'寄生藤',ammo:['sugar','sugar','fire','sugar'],f:k=>{k.S(410,670,150);k.house(410,670,'bis','cooker',70);k.S(300,480,130);k.house(300,480,'bis','pot');k.S(170,560,80);k.root(170,560)}},
 {name:'钻地',ammo:['drill','drill','sugar'],f:k=>{k.S(390,640,170);k.house(390,640,'arm','cooker',70);k.S(230,430,140);k.house(230,430,'arm','pot',70)}},
 {name:'速冻',ammo:['frost','sugar','frost','sugar'],f:k=>{k.S(400,680,140);k.house(400,680,'arm','cooker',70);k.S(240,470,140);k.house(240,470,'arm','pot',70)}},
 {name:'千斤坠',ammo:['sugar','sugar','guided'],f:k=>{k.Wl(400,300,130,14);k.Wt(400,307,70);k.S(400,640,150);k.B('arm',360,640,14,64);k.B('arm',440,640,14,64);k.T('vine',400,640);k.S(215,500,150);k.house(200,500,'bis','cooker',70);k.B('oil',273,500,24,32)}},
 {name:'机关城',ammo:['sugar','guided','sugar','sugar'],f:k=>{k.S(420,700,150);k.Wl(420,622,150,14);k.Wl(488,665,14,70);k.T('pot',430,700);k.Gt(336,664,14,72,74,260);k.S(232,430,120);k.T('pot',232,430);k.Wl(172,388,14,84);k.Wl(226,349,122,14);k.P(352,385,90,1.45)}},
 {name:'决战前夜',ammo:['frost','sugar','fire','drill','guided','sugar'],f:k=>{k.S(400,700,170);k.house(400,700,'arm','vine',70);k.S(230,480,170);k.house(230,480,'bis','cooker',70);k.B('oil',300,480,24,32);k.S(420,400,120);k.T('maw',420,400)}},
 {name:'深渊之母',boss:3,pop:1,ammo:['melon','frost','sugar','guided','melon','fire','drill','chili','sugar','guided'],f:k=>{k.boss(3);k.pile(300,G,3,2)}},
];

let save={stars:[]};try{save=JSON.parse(host.storage.get('up_v1'))||save}catch(e){}
const put=()=>{try{host.storage.set('up_v1',JSON.stringify(save))}catch(e){}};
let engine,S=null,dead=new Set(),booms=[],noSave=false;

function add(b,g){b.g=g;Composite.add(engine.world,b);return b}
// 密度减半：植物放大 1.4 倍后面积翻倍，不减的话互相一挤一压就自己把自己压死了
function spawnT(t,x,y){const d=TG[t],o={density:.0005,friction:d.sh?.8:.6,restitution:.1};
  const b=d.sh==='tri'?Bodies.polygon(x,y,3,d.r,{...o,angle:-2.618}):d.sh?Bodies.rectangle(x,y,d.w,d.h,o):Bodies.circle(x,y,d.r,o);return add(b,{kind:'target',t,hp:d.hp,max:d.hp,r:d.r})}
function load(i){build(LV[i].f,LV[i].ammo,i);S.pop=LV[i].pop;const n=LV[i].swarm;if(n)S.gun={tot:n,left:n,cd:50,hold:null,bul:[],hp:GUN.hp,kt:0,fc:0,bt:0}}
function build(f,ammo,i=-1){
  engine=Engine.create();engine.positionIterations=10;engine.velocityIterations=8;
  Events.on(engine,'collisionStart',onCol);
  add(Bodies.rectangle(W/2,G+60,4000,120,{isStatic:true,friction:1}),{kind:'ground'});
  add(Bodies.rectangle(W+40,H/2-400,60,H+800,{isStatic:true,friction:.2}),{kind:'ground'});   // 屏幕右边一堵看不见的墙，东西不会滚出画面
  const k=kit();f(k);let seed=1,hasBoss=0;const ropes=[],roots=[];
  const blk=(m,x,y,w,h)=>add(Bodies.rectangle(x,y,w,h,{density:MAT[m].den,friction:.8,restitution:.02}),{kind:'block',m,hp:MAT[m].hp,max:MAT[m].hp,w,h,seed:seed++});
  for(const o of k.out){
    if(o.k==='b')blk(o.m,o.x,o.y,o.w,o.h);
    else if(o.k==='t')spawnT(o.t,o.x,o.y);
    else if(o.k==='r'){const d=TG.root;roots.push(add(Bodies.circle(o.x,o.y,d.r,{density:.002,friction:.9,restitution:0}),{kind:'root',t:'root',hp:d.hp,max:d.hp,r:d.r}))}
    else if(o.k==='w'){const b=blk('wt',o.x,o.ay+o.len+20,40,40),c=Constraint.create({pointA:{x:o.x,y:o.ay},bodyB:b,pointB:{x:0,y:-20},stiffness:.9,length:o.len});Composite.add(engine.world,c);ropes.push({c,b})}
    else if(o.k==='boss')hasBoss=o.tier;
    else if(o.k==='c')add(Bodies.rectangle(o.x,o.y,o.w,o.h,{isStatic:true,friction:1}),{kind:'curb',w:o.w,h:o.h});
    else if(o.k==='wall')add(Bodies.rectangle(o.x,o.y,o.w,o.h,{isStatic:true,friction:1}),{kind:'wall',w:o.w,h:o.h});
    else if(o.k==='p')add(Bodies.rectangle(o.x,o.y,o.w,12,{isStatic:true,angle:o.an,friction:0,restitution:1}),{kind:'bounce',w:o.w,h:12});
    else if(o.k==='g')add(Bodies.rectangle(o.x,o.y,o.w,o.h,{isStatic:true,friction:1}),{kind:'wall',gate:1,w:o.w,h:o.h,y0:o.y,amp:o.amp,per:o.per});
    else add(Bodies.rectangle(o.x,o.y,o.w,o.h,{isStatic:true,friction:1}),{kind:'shelf',w:o.w,h:o.h});
  }
  // 寄生藤：根附近的方块被藤蔓缠住，变硬、挡冲击波、点不着，直到根被消灭
  for(const r of roots)for(const b of Composite.allBodies(engine.world))if(b.g.kind==='block'&&Math.hypot(b.position.x-r.position.x,b.position.y-r.position.y)<270)b.g.vine=r;
  S={lv:i,boss:null,ammo:ammo.slice(),sel:0,nd:0,fly:[],lens:[],drips:[],pops:[],tot:0,stop:0,comboT:0,state:'aim',settle:50,cur:null,ft:0,hitT:-1,fx:[],trail:[],last:[],drag:null,winT:0,wt:0,calm:0,over:false,t:0,
    ropes,stains:[],score:0,kills:0,slow:0,zoom:null,zk:0,flash:0};
  dead.clear();booms=[];UI={mode:'play'};sg.clearRect(0,0,W,H);if(hasBoss)mkBoss(hasBoss);
  // 开局先悄悄把物理跑 3 秒，让堆起来的东西自己落稳（这段时间碰撞不算伤害），免得玩家还没开炮炸药就被压爆
  for(let n=0;n<180;n++)Engine.update(engine,DT);
}
const bodies=()=>Composite.allBodies(engine.world);
const targets=()=>bodies().filter(b=>b.g.kind==='target');
const tsp=()=>Math.min(TS,(W-TX-24)/Math.max(1,S.ammo.length-1));
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
function hurt(b,d,why){const g=b.g;if((g.kind!=='block'&&g.kind!=='target'&&g.kind!=='root')||g.m==='wt'||g.shut||(g.safe>S.t&&why!=='boom'))return;if(g.t==='core'&&d>1)S.boss.flash=.25;
  if(g.frozen>0)d*=4;else if(wrapped(g))d*=.2;
  g.hp-=d;g.flash=.18;g.last=why;g.hitT=S.t;if(g.hp<=0){if(g.kind==='target'&&why==='boom'&&!dead.has(b))S.nd++;dead.add(b)}}
function ignite(b){const g=b.g;if(g.gone||g.burn||wrapped(g)||g.shut)return;if(g.kind==='target'||g.kind==='root'||(g.kind==='block'&&MAT[g.m].burn)){g.frozen=0;g.burn=1}}
function freeze(b){const g=b.g;if(g.gone||g.m==='wt'||g.shut)return;if(g.kind==='target'||g.kind==='root'||g.kind==='block'){g.burn=0;g.frozen=720}}
function puff(x,y,col,n,sp){for(let i=0;i<n;i++){const a=Math.random()*6.28,v=sp*(.3+Math.random());S.fx.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-1,life:.5+Math.random()*.4,col,r:2+Math.random()*4})}}
function chips(x,y,col,n){for(let i=0;i<n;i++){const a=Math.random()*6.28,v=2+Math.random()*4;S.fx.push({sq:1,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-2.5,life:.5+Math.random()*.4,col,r:2+Math.random()*2.5})}}
// 爆浆：汁液飞溅出去，落到哪儿就在背景上留下一摊（画在一张单独的图层上，整关都不消失）
const SPL=document.createElement('canvas');SPL.width=W;SPL.height=H;const sg=SPL.getContext('2d');
function splat(x,y,r,col,big){sg.globalAlpha=.72;sg.fillStyle=sg.strokeStyle=col;sg.lineCap='round';sg.beginPath();
  // 落在地上的摊成一片扁的水洼；溅在半空（背景墙上）的会往下流
  if(y>=G-4)sg.ellipse(x,y,r*1.9,r*.6,0,0,7);else{sg.arc(x,y,r,0,7);
    for(let i=0,n=big?7+(Math.random()*5|0):1+(Math.random()*2|0);i<n&&S.drips.length<240;i++)S.drips.push({x:x+(Math.random()-.5)*r*1.8,y:y+r*.3,v:.6+Math.random()*1.7,left:(big?70:25)+Math.random()*(big?230:90),w:1.6+Math.random()*Math.min(6,r*.26),col,ph:Math.random()*6})}
  sg.fill();
  if(big)for(let i=0;i<16;i++){const a=Math.random()*6.28,d=r*(1.1+Math.random()*2.2),rr=r*(.14+Math.random()*.3);sg.lineWidth=rr;sg.beginPath();sg.moveTo(x,y);sg.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d);sg.stroke();sg.beginPath();sg.arc(x+Math.cos(a)*d,y+Math.sin(a)*d,rr*1.3,0,7);sg.fill()}}
// "喷到屏幕上"：一团汁液朝镜头飞过来（越飞越大，影子越靠越近），啪地糊在屏幕玻璃上，带高光和投影，然后慢慢往下淌、淡出
const shade=(hex,k)=>{const n=parseInt(hex.slice(1),16);return `rgb(${(n>>16)*k|0},${((n>>8)&255)*k|0},${(n&255)*k|0})`};
function lensFly(x,y,col,big){if(S.fly.length>4||S.lens.length>6)return;S.fly.push({x,y,tx:Math.random()<.5?36+Math.random()*150:W-36-Math.random()*150,ty:150+Math.random()*540,t:0,col,R:(big?72:48)+Math.random()*30})}
function mkLens(x,y,R,col){const pts=[],sats=[],drips=[];for(let i=0;i<13;i++){const a=i/13*6.283,d=R*(.5+Math.random()*.5)*(i%3===0?1.45:1);pts.push([Math.cos(a)*d,Math.sin(a)*d])}
  for(let i=0;i<7;i++){const a=Math.random()*6.283,d=R*(1.15+Math.random()*.9);sats.push([Math.cos(a)*d,Math.sin(a)*d,3+Math.random()*R*.14])}
  for(let i=0;i<4;i++)drips.push({dx:(Math.random()-.5)*R*1.1,w:5+Math.random()*R*.13,len:0,v:.5+Math.random()*1.1,max:50+Math.random()*190});
  S.lens.push({x,y,R,pts,sats,drips,col,dk:shade(col,.58),t:0,life:3.4+Math.random()})}
function goo(x,y,col,n,sp=7){for(let i=0;i<n&&S.fx.length<750;i++){const a=Math.random()*6.28,v=sp*(.25+Math.random());S.fx.push({go:1,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-3,life:.5+Math.random()*.7,col:i%4===3?'#7c1a26':col,r:2.5+Math.random()*5})}}
function kill(b){if(b.g.gone)return;b.g.gone=1;Composite.remove(engine.world,b)}
// [爆炸半径, 伤害]
const BM={sugar:[86,54],chili:[86,54],mini:[60,30],guided:[110,70],melon:[138,95],fire:[70,14],frost:[110,0],drill:[100,62],tnt:[138,95],oil:[115,60]};
function boom(s){const ty=s.g.type||s.g.m,up=S.rogue&&s.g.type?RG:null;let [R,D]=BM[ty]||BM.tnt;if(up){R*=up.rad;D*=up.dmg}
  const k=R/138,x=s.position.x,y=s.position.y,ice=ty==='frost',hot=ty==='fire'||ty==='oil'||!!(up&&up.burn&&!ice);kill(s);
  // 重甲、固定钢板、被藤蔓缠住的方块能挡住冲击波：躲在后面的植物只吃到 1/4 伤害，也不会被点着
  const sh=bodies().filter(o=>o.g.kind==='wall'||(o.g.kind==='block'&&(o.g.m==='arm'||wrapped(o.g))));
  const nd0=S.nd;
  for(const b of bodies()){if(b.isStatic)continue;const dx=b.position.x-x,dy=b.position.y-y,d=Math.hypot(dx,dy)||1,live=b.g.kind==='target'||b.g.kind==='root';
    const cover=live&&sh.length>0&&Query.ray(sh,{x,y},b.position).length>0;
    if(d<R){const f=1-d/R,pk=b.g.m==='wt'?0:(ice?.25:1)*((b.g.m==='arm'||wrapped(b.g))&&!(b.g.frozen>0)?.25:1);if(D>0)hurt(b,D*Math.sqrt(f)*(cover?.25:1),'boom');Body.setVelocity(b,{x:b.velocity.x+dx/d*11*k*f*pk,y:b.velocity.y+dy/d*11*k*f*pk-2*f*pk})}
    const e=d-ext(b);if(ice&&e<R*.8)freeze(b);if(hot&&!cover&&e<(ty==='oil'?96:56))ignite(b)}
  for(const r of S.ropes)if(!r.cut){const a=r.c.pointA,q=att(r);if(segDist(x,y,a.x,a.y,q.x,q.y)<R*.55+8)cut(r)}
  // 一发炸到一群：短暂慢动作 + 镜头推近 + 大字报数
  const nd=S.nd-nd0;if(nd>=5){S.slow=Math.max(S.slow,.5);S.zoom={x:Math.max(70,Math.min(W-70,x)),y:Math.max(70,Math.min(G-70,y))};say('一锅端 ×'+nd,x,y-R*.9,nd>=10?48:38,'#fff',1.3)}
  const c1=ice?'#bfe9f7':'#ff8a3a',c2=ice?'#ffffff':'#ffd65c';
  puff(x,y,c1,8+18*k|0,3+4*k);puff(x,y,c2,5+9*k|0,2+3*k);if(!ice)puff(x,y,'#5a5a5a',6*k|0,3);
  for(let i=0;i<12*k;i++){const a=Math.random()*6.28,v=5+Math.random()*7;S.fx.push({sp:1,x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v-2,life:.25+Math.random()*.3,col:c2})}
  S.fx.push({ring:1,x,y,life:.35,R,ice});S.shake=.3*k+Math.min(.5,nd*.04);if(k>.6||nd>=5)S.flash=nd>=5?.14:.09;
  say(ice?'冻住!':hot?'着火!':k>.9?'轰!':'砰!',x,y-R*.45,26,ice?'#bfe9f7':undefined,.6);
  if(up&&up.bomblet&&ty!=='mini')for(const vx of [-4,0,4]){const m=add(Bodies.circle(x+vx*2,y-12,8,{density:.006,friction:.6,restitution:.25,frictionAir:0}),{kind:'shot',type:'mini',r:8});Body.setVelocity(m,{x:vx,y:-7})}}
function fire(vx,vy,px=OX,py=OY){
  if(S.state!=='aim'||!S.ammo.length||S.over)return false;
  const type=S.ammo.splice(S.sel<S.ammo.length?S.sel:0,1)[0],a=AM[type];S.sel=0;S.kills=0;
  S.cur=add(Bodies.circle(px,py,a.r,{density:a.den,friction:.6,restitution:.25,frictionAir:0}),{kind:'shot',type,r:a.r});
  Body.setVelocity(S.cur,{x:vx,y:vy});Body.setAngularVelocity(S.cur,.12);
  if(S.rogue&&RG.twin){const an=Math.atan2(vy,vx)-.11,sp=Math.hypot(vx,vy)*.95,s2=add(Bodies.circle(px,py,a.r,{density:a.den,friction:.6,restitution:.25,frictionAir:0}),{kind:'shot',type,r:a.r});Body.setVelocity(s2,{x:Math.cos(an)*sp,y:Math.sin(an)*sp})}
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
const WHY={boom:'炸飞!',crush:'砸死!',fall:'摔死!',fire:'烧焦!',hit:'命中!'},COMBO={2:'双杀!',3:'三杀!',4:'四杀!',5:'五杀!',8:'屠杀!',12:'暴走!',18:'血洗!',25:'灭绝!',35:'神之一手!'};
function tick(){
  Engine.update(engine,DT);S.t++;if(S.settle>0)S.settle--;
  for(const s of booms.splice(0))if(!s.g.gone)boom(s);
  for(const b of dead){if(b.g.gone)continue;const g=b.g,{x,y}=b.position;kill(b);
    if(g.kind==='target'){const c=TG[g.t].j||TG[g.t].c;if(S.gun){if(S.t-S.gun.kt>100)S.kills=0;S.gun.kt=S.t}S.kills++;S.score+=100*S.kills;
      S.tot++;S.comboT=1.6;if(!S.gun)S.stop=Math.min(4,S.stop+2);S.shake=Math.max(S.shake||0,.14);
      puff(x,y,'#fff',6,4);goo(x,y,c,g.r>18?30:20,9);splat(x,y,g.r*1.7,c,1);S.fx.push({ey:1,x,y,vx:(Math.random()-.5)*9,vy:-5-Math.random()*5,life:1.4,r:g.r*.24});
      if(COMBO[S.kills]||Math.random()<(S.kills>=5?.3:.15))lensFly(x,y,c,g.r>18);
      if(g.t==='core'){say('弱点击破!',x,y-60,40,'#fff06a',1.4);S.flash=.14;S.shake=.5;S.slow=Math.max(S.slow,.5);S.zoom={x,y};goo(x,y,c,30,12);lensFly(x,y,c,1);lensFly(x,y,'#ff5ad0',1);S.score+=1000}
      if(S.kills<3)say(g.frozen>0?'碎了!':WHY[g.last]||'消灭!',x,y-20,26,undefined,.9);
      if(COMBO[S.kills])say(COMBO[S.kills],x+(Math.random()-.5)*70,y-52-Math.random()*30,S.kills>7?46:38,'#ff3b2e',1.3);
      // 肉鸽强化：尸爆（稍等几帧再炸，形成一路连锁）、嗜血装填
      const cp=S.rogue?RG.corpse:S.pop?1:0;if(cp)S.pops.push({x,y,t:5,R:46+14*cp,D:12+5*cp,c});
      if(S.rogue&&RG.reload&&S.tot%RG.reload===0){S.ammo.push('sugar');say('装填 +1',OX+70,OY-70,22,'#7dffb0',1);if(S.state==='wait')S.state='aim'}
      // 最后一株：慢动作 + 镜头推近
      if(!targets().length&&!S.over&&!S.gun){S.slow=.9;S.zoom={x:Math.max(70,Math.min(W-70,x)),y:Math.max(70,Math.min(G-70,y))}}}
    else if(g.kind==='root'){puff(x,y,'#5af0e6',14,4);say('藤蔓断了!',x,y-20,24,'#a8dc6c',1)}
    else if(g.m==='tnt'||g.m==='oil'){b.g.gone=0;boom(b)}
    else{S.score+=10;if(g.frozen>0){chips(x,y,'#cfefff',8);puff(x,y,'#fff',5,3)}else{puff(x,y,MAT[g.m].c,6,3);chips(x,y,g.burn?'#3a2a24':MAT[g.m].c,5)}}}
  dead.clear();
  let burning=S.pops.length>0;
  for(let i=S.pops.length-1;i>=0;i--){const q=S.pops[i];if(--q.t>0)continue;S.pops.splice(i,1);
    for(const b of bodies()){if(b.isStatic||b.g.kind==='shot')continue;const dx=b.position.x-q.x,dy=b.position.y-q.y,d=Math.hypot(dx,dy)||1,R=q.R+ext(b);if(d>R)continue;const f=Math.max(.15,1-d/R);
      hurt(b,q.D*f*(b.g.kind==='block'&&b.g.m!=='tnt'&&b.g.m!=='oil'?.5:1),'boom');Body.setVelocity(b,{x:b.velocity.x+dx/d*3*f,y:b.velocity.y+dy/d*3*f-f})}
    goo(q.x,q.y,q.c,18,11);splat(q.x,q.y,q.R*.6,q.c,1)}
  for(const b of bodies()){const g=b.g,p=b.position;if(g.gone)continue;
    if(g.gate){const u=Math.max(0,Math.min(1,(Math.sin(S.t/g.per*6.283)+.3)*1.6));Body.setPosition(b,{x:p.x,y:g.y0-g.amp*u});continue}
    if(b.isStatic)continue;
    if(p.x<-150||p.x>W+150||p.y>H+150){if(g.kind==='target'){g.last='fall';dead.add(b)}else kill(b);continue}
    if(g.keepV){Body.setVelocity(b,g.keepV);g.keepV=null;chips(p.x,p.y,'#f2d23a',4)}
    if(g.kind==='shot'&&!g.hit){if(g.straight)Body.applyForce(b,p,{x:0,y:-b.mass*.001});if(S.t%2===0&&S.fx.length<300)S.fx.push({sm:1,x:p.x-b.velocity.x,y:p.y-b.velocity.y,vx:0,vy:-.15,life:.55,col:'#4a4046',r:3.5})}
    if(g.kind==='shot'&&g.hit&&++g.hit>220){puff(p.x,p.y,'#fff',6,2);kill(b)}
    if(g.flash>0)g.flash-=1/60;
    if(g.frozen>0)g.frozen--;
    if(g.burn){burning=true;g.burn++;g.hp-=g.kind==='block'?MAT[g.m].burn:g.t==='core'?g.max/500:g.max/90;g.last='fire';if(g.t==='core'&&g.burn>200)g.burn=0;const e=ext(b);
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
    if(c.g.gone||(S.hitT>=0&&S.ft-S.hitT>60)||S.ft>420){S.state=S.ammo.length?'aim':'wait';S.wt=0;S.calm=0;S.last=S.trail;if(S.ammo.length){sprout();if(S.boss)bossTurn()}}}
  if(S.gun){gunTick();if(S.gun.bs)wkTick()}
  if(S.boss)bossTick();
  if(!S.over){
    if(!targets().length&&!(S.boss&&S.boss.dying>0)&&(!S.gun||(S.gun.bs&&S.gun.bs.dead))){if(++S.winT>45)finish(true)}
    else if(S.state==='wait'){if(!burning)S.wt++;let mx=0;for(const b of bodies())if(!b.isStatic)mx=Math.max(mx,b.speed);S.calm=mx<.25&&!burning?S.calm+1:0;if(S.calm>50||S.wt>500)finish(false)}}
}

// ---------- 机枪关：按住屏幕连发，虫群飞向炮台，清完后 Boss 从右边走过来 ----------
// 手感都在这几个数上：r=火箭大小（普通火箭弹是 11），rate=几帧一发，spd=子弹速度，dmg=每发伤害，hp=防线能被撞几次
const GUN={rate:4,spd:17,dmg:8,hp:10,r:6};
// 会飞的：不参与物理碰撞，每帧自己朝炮台飞
function mkFly(b){b.collisionFilter.mask=0;b.g.fly={sp:1.1+Math.random()*.9,ph:Math.random()*6.28};return b}
function gunTick(){const g=S.gun,mx=OX+4,my=OY+2;if(S.over)return;
  if(g.left>0){if(--g.cd<=0){const top=Math.random()<.3,n=Math.min(g.left,3+(Math.random()*4|0)),x0=top?240+Math.random()*260:W+40,y0=top?-50:150+Math.random()*480,done=1-g.left/g.tot;
    for(let i=0;i<n;i++){const r=Math.random();mkFly(spawnT(r<done*.3?'pot':r>.9?'thorn':'bud',x0+(Math.random()-.5)*40+(top?0:i*10),y0+(Math.random()-.5)*90-(top?i*10:0)))}
    g.left-=n;g.cd=75-done*30}}
  else if(!g.bs&&!targets().length&&++g.bt>50){g.bs={x:WK.x0,d:0,hp:WK.hp,t:0,flash:0,roar:0,dying:0,dead:0,ct:0};say(WK.n+' 来了!',W/2,300,40,'#ff8a3a',2.2)}
  const ts=targets(),b=g.bs&&!g.bs.dying&&!g.bs.dead?g.bs:null,by=b?wkY(b):0;
  for(const o of ts){const f=o.g.fly;if(!f||o.g.gone)continue;const dx=mx-o.position.x,dy=my-30-o.position.y,d=Math.hypot(dx,dy)||1,w=Math.sin(S.t*.07+f.ph)*1.3;
    if(d<44){const {x,y}=o.position;kill(o);g.hp--;puff(x,y,'#ff5ad0',10,4);say('防线 -1',OX+40,OY-70,24,'#ff3b2e',.8);S.shake=.3;S.flash=.06;if(g.hp<=0){finish(false);return}continue}
    Body.setVelocity(o,{x:dx/d*f.sp-dy/d*w,y:dy/d*f.sp+dx/d*w})}
  if(g.hold){const a=Math.atan2(g.hold.y-my,g.hold.x-mx);S.ang=a;if(S.t%GUN.rate===0){const c=Math.cos(a),s=Math.sin(a);g.bul.push({x:mx+c*38,y:my+s*38,vx:c*GUN.spd,vy:s*GUN.spd});g.fc++;S.fx.push({sp:1,x:mx+c*40,y:my+s*40,vx:c*4+(Math.random()-.5)*4,vy:s*4-2,life:.15,col:'#d8fbff'})}}
  for(let i=g.bul.length-1;i>=0;i--){const q=g.bul[i];q.x+=q.vx;q.y+=q.vy;let hit=q.x<-20||q.x>W+20||q.y<-20||q.y>G;
    if(!hit)for(const o of ts)if(!o.g.gone&&o.g.hp>0&&Math.hypot(q.x-o.position.x,q.y-o.position.y)<ext(o)+5){hurt(o,GUN.dmg,'hit');hit=true;break}
    // 巨兽：肚子下面发光的囊是弱点（三倍伤害），背甲和头是普通伤害
    if(!hit&&b&&b.hp>0){const crit=Math.hypot(q.x-(b.x+WK.sac[0]),q.y-(by+WK.sac[1]))<WK.sac[2]+3;
      if(crit||Math.hypot(q.x-b.x,q.y-(by-15))<80||Math.hypot(q.x-(b.x-100),q.y-(by+12))<34){hit=true;b.hp-=GUN.dmg*(crit?3:1);b.flash=.12;
        if(crit&&S.t-b.ct>35){b.ct=S.t;say('弱点!',q.x,q.y-24,22,'#fff06a',.5);goo(q.x,q.y,'#fff06a',4,5)}
        if(b.hp<=0){b.dying=110;S.slow=1.6;S.zoom={x:Math.min(W-70,b.x),y:by};S.score+=3000;say(WK.n+' 倒下了!',W/2,300,40,'#fff06a',2.4);for(const o of ts){o.g.last='boom';dead.add(o)}}}}
    if(hit){g.bul.splice(i,1);if(q.y<=G&&S.fx.length<300)S.fx.push({sp:1,x:q.x,y:q.y,vx:-q.vx*.2+(Math.random()-.5)*5,vy:-q.vy*.2-2,life:.2,col:'#ffd65c'})}}}

// ---------- 机枪关 Boss：裂地巨兽 ----------
// 四条长腿的甲壳巨兽，从屏幕右边一步一步走进来（每落一脚地面震一下），走到 x1 之后放慢，但一直在逼近炮台，走到 xEnd 就把炮台踩扁。
// 它每隔一阵张嘴吐出几只飞虫；血量掉到 35% 以下狂暴：走得更快、吐得更多。
const WK={n:'裂地巨兽',hp:2400,x0:W+230,x1:400,xEnd:250,stride:90,legs:[-130,-55,55,130],sac:[-5,50,30]};
const wkY=b=>G-190+Math.sin(b.d/WK.stride*12.57)*4+(b.dead?55:b.dying>0?(110-b.dying)*.5:0);
// 一条腿的脚在哪：落地阶段脚钉在地上不动（相对身体往后退），抬腿阶段划一道弧迈到前面；n 是第几步，变了就是刚落地
function wkFoot(b,i){const p=b.d/WK.stride+i*.5+(i>1?.25:0),n=Math.floor(p),f=p-n,L=WK.stride,hx=b.x+WK.legs[i];
  return f<.7?{x:hx-.35*L+L*f,y:G,n}:{x:hx+.35*L-.7*L*(f-.7)/.3,y:G-Math.sin((f-.7)/.3*3.14)*34,n}}
function wkTick(){const g=S.gun,b=g.bs;if(b.flash>0)b.flash-=1/60;if(b.roar>0)b.roar-=1/60;if(b.dead||S.over)return;
  if(b.dying>0){b.dying--;if(b.dying%7===0){const x=b.x-110+Math.random()*220,y=wkY(b)-70+Math.random()*130,c=['#ff8a3a','#fff06a','#c8ff3a','#b5481f'][(b.dying/7)&3];goo(x,y,c,22,12);splat(x,y,30,c,1);puff(x,y,'#fff',8,5);S.fx.push({ring:1,x,y,life:.35,R:70});S.shake=.5;S.flash=.08;if(b.dying%21===0)lensFly(x,y,c,1)}if(!b.dying)b.dead=1;return}
  const rage=b.hp<WK.hp*.35,inn=b.x>WK.x1,v=inn?1.3:rage?.2:.12,n0=WK.legs.map((_,i)=>wkFoot(b,i).n);b.x-=v;b.d+=v;
  WK.legs.forEach((_,i)=>{const f=wkFoot(b,i);if(f.n!==n0[i]){puff(f.x,G-4,'#8a7a6a',6,2.5);S.shake=Math.max(S.shake||0,inn?.24:.1)}});
  if(rage&&!b.raged){b.raged=1;b.roar=1;say('狂暴!',b.x-40,wkY(b)-120,40,'#ff3b2e',1.4);S.shake=.5}
  if(b.x<=WK.xEnd){say('炮台被踩扁了!',W/2,300,36,'#ff3b2e',1.6);S.shake=.6;g.hp=0;finish(false);return}
  if(!inn&&++b.t%(rage?100:160)===0){b.roar=.8;const y=wkY(b);for(let i=0;i<(rage?4:3)&&targets().length<14;i++)mkFly(spawnT('bud',b.x-128-Math.random()*20,y+22+(i-1)*24))}}

// ---------- Boss：虚空之母 ----------
// 一株占了半个屏幕的巨型母体，本体打不动，身上挂着三个发光的弱点囊，全部打爆才算赢。
// 玩家每打完一发，它行动一次：换一个弱点囊合上盖子（合上的打不动）、触手换一条路守着（靠近的导弹会被拍飞）、再吐几株孢囊出来。
// 三个等级是同一只 Boss 的加强版：换名字和颜色，弱点囊更硬，吐得更多，触手范围更大
const BTIER=[null,{n:'虚空之母',c:'#3a1f5a',d:'#4a2a7a'},{n:'猩红之母',c:'#5a1a34',d:'#7a2a4a'},{n:'深渊之母',c:'#123a52',d:'#1f5a7a'}];
const BOSS={x:445,y:610,R:110,anc:[{x:327,y:542},{x:415,y:477},{x:317,y:655}],hi:[345,415],lo:[262,690]};
function mkBoss(tier){add(Bodies.circle(BOSS.x,BOSS.y,BOSS.R,{isStatic:true,friction:1}),{kind:'boss'});add(Bodies.rectangle(BOSS.x,BOSS.y+190,120,170,{isStatic:true,friction:1}),{kind:'boss'});
  const hp=TG.core.hp+20*(tier-1),cores=BOSS.anc.map((a,i)=>{const c=spawnT('core',a.x,a.y);c.g.ci=i;c.g.hp=c.g.max=hp;Composite.add(engine.world,Constraint.create({pointA:{x:a.x,y:a.y},bodyB:c,stiffness:.6,length:0}));return c});
  S.boss={tier,hp,turn:0,cores,tx:BOSS.hi[0],ty:BOSS.hi[1],gx:0,gy:0,sr:52,dying:0,dead:0,flash:0,roar:0,swat:0};bossSet()}
const bossAlive=()=>S.boss.cores.filter(c=>!c.g.gone).length;
function bossSet(){const B=S.boss,n=bossAlive();B.cores.forEach((c,i)=>c.g.shut=n>1&&i===B.turn%3);[B.gx,B.gy]=B.turn%2?BOSS.lo:BOSS.hi;B.sr=(n<=1?64:52)+(B.tier-1)*7}
function bossTurn(){const B=S.boss;if(B.dying||B.dead)return;B.turn++;bossSet();B.roar=.9;const hard=bossAlive()<=1,n=targets().filter(b=>b.g.t==='bud').length;
  for(let i=0;i<(hard?4:2)+B.tier-1&&n+i<9+B.tier;i++){const s=spawnT(B.tier>2&&i===0?'pot':'bud',270,690-i*42);s.g.safe=S.t+90;Body.setVelocity(s,{x:-1-Math.random()*1.5,y:-2.5})}}   // safe：刚吐出来的落地不会摔死
function bossTick(){const B=S.boss;B.tx+=(B.gx-B.tx)*.08;B.ty+=(B.gy-B.ty)*.08;if(B.swat>0)B.swat--;
  if(!B.dying&&!B.dead&&!bossAlive()){B.dying=110;S.slow=1.6;S.zoom={x:400,y:600};say(BTIER[B.tier].n+' 崩解!',W/2,300,40,'#fff06a',2.4);for(const b of targets()){b.g.last='boom';dead.add(b)}}
  if(B.dying>0){B.dying--;if(B.dying%7===0){const x=340+Math.random()*180,y=500+Math.random()*250,c=['#ff5ad0','#5af0e6','#fff06a','#7a52d6'][(B.dying/7)&3];goo(x,y,c,22,12);splat(x,y,30,c,1);puff(x,y,'#fff',8,5);S.fx.push({ring:1,x,y,life:.35,R:70});S.shake=.5;S.flash=.08;if(B.dying%21===0)lensFly(x,y,c,1)}if(!B.dying)B.dead=1;return}
  if(B.dead)return;
  for(const s of bodies())if(s.g.kind==='shot'&&!s.g.hit&&!s.g.gone&&Math.hypot(s.position.x-B.tx,s.position.y-B.ty)<B.sr){const {x,y}=s.position;kill(s);B.swat=14;puff(x,y,'#ff5ad0',10,4);chips(x,y,'#f4efe4',6);say('拍飞!',x,y-24,28,'#ff7ad8',.9);S.shake=.2}}
function finish(win){S.over=true;S.win=win;const gn=S.gun,left=gn?Math.max(0,gn.hp):S.ammo.length,st=win?(gn?(left>=8?3:left>=4?2:1):(left>=2?3:left===1?2:1)):0;S.stars=st;if(win)S.score+=left*500;
  // 肉鸽：漏掉几株就扣几点防线耐久，然后进入三选一；耐久归零本局结束
  if(S.rogue){const n=targets().length;RG.hp-=n;if(!n)RG.hp+=3;RG.score+=S.score;if(noSave)return;if(RG.hp<=0){save.rg=Math.max(save.rg||0,RG.stage);put();UI={mode:'rgover',t:0}}else UI={mode:'pick',t:0,left:n,cards:rgOffer()};return}
  if(win&&!noSave){save.stars[S.lv]=Math.max(save.stars[S.lv]||0,st);put()}
  if(noSave)return;UI={mode:'result',win,st,left,n:targets().length,t:0}}
function menu(){UI={mode:'menu'}}
function home(){UI={mode:'home'}}
const CORP='泉都发科技有限公司';
// 关于我们：文案沿用《登天闯关》那一版，只换了介绍游戏的那几句
const EMAIL='quandoufa@quandoufa.cn';
const ABOUT=['济南泉都发科技有限公司','','我们是来自泉城济南的一支小团队，','专注于制作好玩、耐玩的原创小游戏。','','《末日防线》由我们独立设计与开发，','从第一波虫群到深渊之母，','每一关都用心打磨。','','游戏中遇到问题，或有任何意见和建议，','欢迎来信：','',EMAIL,'','感谢你的游玩！'];
// ---------- 肉鸽模式：无尽尸潮，每波随机生成，打完三选一强化 ----------
let RG=null;
const UPG=[
  {id:'rad',n:'大当量',d:'导弹爆炸范围 +20%（可叠加）',f:r=>r.rad*=1.2},
  {id:'dmg',n:'高爆装药',d:'导弹爆炸伤害 +30%（可叠加）',f:r=>r.dmg*=1.3},
  {id:'corpse',n:'尸爆孢囊',d:'植物死亡时的爆浆范围更大、更疼（可叠加）',f:r=>r.corpse++},
  {id:'burn',n:'凝固汽油',d:'所有导弹命中后都会点火',once:1,f:r=>r.burn=1},
  {id:'twin',n:'双联发射',d:'每次同时打出两枚导弹',once:1,f:r=>r.twin=1},
  {id:'bomblet',n:'子母弹头',d:'导弹爆炸后再甩出 3 枚小炸弹',once:1,f:r=>r.bomblet=1},
  {id:'reload',n:'嗜血装填',d:'每消灭 6 株植物，补 1 枚火箭弹',once:1,f:r=>r.reload=6},
  {id:'heal',n:'抢修防线',d:'防线耐久 +5',f:r=>r.hp+=5},
  ...['sugar','chili','melon','guided','fire','frost','drill'].map(t=>({id:'a_'+t,ammo:t,n:'+1 '+AM[t].name,d:'永久加入弹药库：'+AM[t].tip.split('：')[1],f:r=>r.deck.push(t)})),
];
function rgRnd(seed){let s=seed%2147483647;if(s<=0)s+=2147483646;return ()=>((s=s*16807%2147483647)-1)/2147483646}
// 一波的布局：地面一片花苞 + 2~3 个平台（围栏里堆满花苞，或者叠起来的岗楼），越往后越多、越硬
function genStage(n,R){if(n%10===0)return k=>{k.boss(Math.min(3,n/10));k.pile(300,G,3,2)};return k=>{
  const pick=()=>{const r=R();return n>=6&&r<.05?'maw':n>=4&&r<.12?'vine':n>=3&&r<.22?'cooker':n>=2&&r<.3?'spore':r<.48?'pot':r<.63?'cactus':r<.77?'shroom':r<.89?'thorn':'bud'};
  const mat=()=>{const r=R();return n>=7&&r<.15?'arm':n>=4&&r<.3?'cho':r<.6?'bis':'ice'};
  const br=TG.bud.r,pile=k.pile;
  pile(392,G,Math.min(7,5+(n>>1)),n>3?4:3);
  const slots=[[420+R()*10,650+R()*40],[200+R()*15,470+R()*50],[420+R()*10,300+R()*40]];
  slots.forEach(([x,y],i)=>{if(i===2&&n<2)return;const tp=R(),ca=TG.cactus,po=TG.pod;
    if(tp<.22){k.S(x,y,220);k.T('cactus',x-33,y);k.T('cactus',x+33,y);k.T('pod',x,y-ca.h);k.T('thorn',x,y-ca.h-po.h);k.T('shroom',x-84,y);k.T(R()<.5?'shroom':'pot',x+84,y)}
    else if(tp<.66){const rows=3+(R()<.3+n*.06?1:0);k.S(x,y,210);k.C(x-92,y);k.C(x+92,y);const top=pile(x,y,4,rows);
      R()<.35?k.B(R()<.5?'tnt':'oil',x,top,26,26):k.T(R()<.3?'pod':pick(),x,top)}
    else{k.S(x,y,200);let t=k.house(x,y,mat(),pick(),70);if(i<2&&n>2&&R()<.5)t=k.house(x,t,mat(),pick(),70);k.T('bud',x-br-2,t);k.T('bud',x+br+2,t);
      k.T('bud',x-78,y);R()<.5?k.B(R()<.5?'tnt':'oil',x+74,y,26,26):k.T('bud',x+78,y)}})}}
function rgStart(){RG={stage:1,hp:30,deck:['sugar','sugar','sugar','sugar','chili','melon'],rad:1.15,dmg:1,corpse:1,score:0,seed:(Date.now()%1e6)|1,got:{}};rgLoad()}
function rgLoad(){build(genStage(RG.stage,rgRnd(RG.seed+RG.stage*7919)),RG.deck);S.rogue=1;S.settle=90}
function rgOffer(){const r=rgRnd(RG.seed+RG.stage*104729+1),pool=UPG.filter(u=>!(u.once&&RG.got[u.id])&&!(u.ammo&&RG.deck.length>=9)),out=[];while(out.length<3&&pool.length)out.push(pool.splice(r()*pool.length|0,1)[0]);return out}
// 每过两波自动补给 1 枚火箭弹，跟上尸潮变多的速度
function rgPick(u){u.f(RG);RG.got[u.id]=1;if(RG.stage%2===0&&RG.deck.length<9)RG.deck.push('sugar');RG.stage++;rgLoad()}

// ---------- 输入（由 Cocos 组件转发，坐标是 540x960 设计坐标，原点在左上） ----------
function pull(){const d=S.drag;if(!d)return null;let dx=d.x-d.sx,dy=d.y-d.sy;const l=Math.hypot(dx,dy);if(l>PMAX){dx*=PMAX/l;dy*=PMAX/l}
  const r=AM[S.ammo[S.sel]||S.ammo[0]].r;if(OY+dy>G-r-2)dy=G-r-2-OY;return {dx,dy,l:Math.hypot(dx,dy)}}
function down(x,y){if(uiTap(x,y))return;if(!S||S.over||UI.mode!=='play')return;
  // 底部弹药栏：瞄准阶段点一下就换成那枚导弹
  if(S.gun){S.gun.hold={x,y};return}
  if(S.state==='aim'&&y>G+8&&y<G+64&&x>TX-TS/2){const i=Math.round((x-TX)/tsp());if(i>=0&&i<S.ammo.length)S.sel=i;return}
  if(S.state==='aim'&&S.ammo.length)S.drag={sx:x,sy:y,x,y};else if(S.state==='fly')tap(x,y)}
function move(x,y){if(S&&S.gun&&S.gun.hold)S.gun.hold={x,y};if(S&&S.drag){S.drag.x=x;S.drag.y=y}}
function up(){if(S&&S.gun)S.gun.hold=null;if(!S||!S.drag)return;const p=pull();S.drag=null;if(p&&p.l>14)fire(-p.dx*VK,-p.dy*VK)}
function cancel(){if(S){S.drag=null;if(S.gun)S.gun.hold=null}}

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
let HALO=false;
function cfill(col){const live=C===ctx||HALO;if(live){C.lineJoin='round';C.strokeStyle=LITE;C.lineWidth=6.5;C.stroke()}C.fillStyle=col;C.fill();C.save();C.translate(BO*37,BO*23);C.globalAlpha=live?.45:1;C.fillStyle=PG;C.fill();C.restore()}
function ink(fill,lw=2.6){if(fill)cfill(fill);C.lineJoin=C.lineCap='round';C.strokeStyle=INK;C.lineWidth=lw;C.stroke();C.save();C.translate(BO*37,BO*23);C.strokeStyle=PG;C.globalAlpha=C===ctx||HALO?.3:.55;C.lineWidth=lw+.6;C.stroke();C.restore()}
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
// ---------- Boss 的画法 ----------
function drawBoss(T){const B=S.boss,bx=BOSS.x,by=BOSS.y,R=BOSS.R,sh=B.dying>0?(Math.random()-.5)*9:0,hurt=B.flash>0||B.dying>0||B.dead;if(B.flash>0)B.flash-=1/60;
  C.save();C.translate(sh,sh*.6);C.lineCap=C.lineJoin='round';
  for(let i=0;i<6;i++){const x0=bx-70+i*28,w=Math.sin(T*1.5+i)*10;C.beginPath();C.moveTo(x0,by+60);C.bezierCurveTo(x0-20+w,by+150,x0+30-w,by+210,x0-30+i*6,G+2);C.strokeStyle=INK;C.lineWidth=24-i;C.stroke();C.strokeStyle=i%2?BTIER[B.tier].d:BTIER[B.tier].c;C.lineWidth=17-i;C.stroke()}
  for(let i=0;i<9;i++){const a=-2.9+i*.42+Math.sin(T+i)*.05,L=R*(i%2?1.45:1.72),pc=(da,d)=>[bx+Math.cos(a+da)*d,by+Math.sin(a+da)*d];blob([pc(-.2,R*.8),pc(-.14,L*.8),pc(0,L),pc(.14,L*.8),pc(.2,R*.8)]);ink(B.dead?'#5a4a6a':i%2?'#ff5ad0':'#5af0e6',2.4);if(!B.dead)dot(bx+Math.cos(a)*L*.86,by+Math.sin(a)*L*.86,4,'#fff06a')}
  wcirc(bx,by,R,201,2.5);ink(B.dead?'#2a2030':B.flash>0?'#8a5a9a':BTIER[B.tier].c,3.4);
  for(const [x,y,r] of [[-60,52,16],[42,72,22],[62,-52,14],[-22,88,10],[82,10,12]])dot(bx+x,by+y,r,'rgba(255,90,208,.22)');
  for(const c of B.cores)if(!c.g.gone){const a=BOSS.anc[c.g.ci];C.beginPath();C.moveTo(bx-10,by);C.quadraticCurveTo((bx+a.x)/2+10,(by+a.y)/2-14,a.x,a.y);C.strokeStyle=`rgba(255,240,106,${c.g.shut?.15:.4+.25*Math.sin(T*6)})`;C.lineWidth=5;C.stroke()}
  const ex=bx-18,ey=by-22,er=46,tg=S.cur&&!S.cur.g.gone&&S.state==='fly'?S.cur.position:{x:OX,y:OY},an=Math.atan2(tg.y-ey,tg.x-ex),ix=Math.cos(an)*14,iy=Math.sin(an)*12;
  dot(ex,ey,er+3,INK);dot(ex,ey,er,hurt?'#e6b0b8':'#f4efe4');
  if(hurt){C.beginPath();C.moveTo(ex-er*.78,ey-10);C.quadraticCurveTo(ex,ey+18,ex+er*.78,ey-10);C.strokeStyle=INK;C.lineWidth=7;C.stroke();C.strokeStyle='#b3261e';C.lineWidth=2;C.beginPath();C.moveTo(ex-10,ey+16);C.lineTo(ex-13,ey+44);C.stroke()}
  else{C.strokeStyle='#b3261e';C.lineWidth=1.4;for(let i=0;i<8;i++){const a=i*.785+.3;C.beginPath();C.moveTo(ex+Math.cos(a)*er*.95,ey+Math.sin(a)*er*.95);C.lineTo(ex+Math.cos(a+.3)*er*.6,ey+Math.sin(a+.3)*er*.6);C.stroke()}
    dot(ex+ix,ey+iy,er*.62,'#1fae8a');dot(ex+ix,ey+iy,er*.46,'#5af0e6');dot(ex+ix,ey+iy,er*.3,'#c8ff3a');C.beginPath();C.ellipse(ex+ix,ey+iy,er*.08,er*.36,0,0,7);C.fillStyle='#0d0507';C.fill();dot(ex+ix-9,ey+iy-12,5,'#fff');
    C.beginPath();C.arc(ex,ey,er+1,Math.PI*1.1,Math.PI*1.9);C.closePath();C.fillStyle='#24103c';C.fill();C.strokeStyle=INK;C.lineWidth=3;C.stroke()}
  const mo=B.dead?.15:B.roar>0||B.dying>0?1:.32+.1*Math.sin(T*2);if(B.roar>0)B.roar-=1/60;
  const mx=bx-30,my=by+46,mw=56,s0=5,s1=12+34*mo,mp=(u,s)=>[mx+mw*(2*u-1),my+s*4*u*(1-u)],tk=.5+mo*.7;
  C.beginPath();C.moveTo(mx-mw,my);C.quadraticCurveTo(mx,my+s1*2,mx+mw,my);C.quadraticCurveTo(mx,my+s0*2,mx-mw,my);C.closePath();C.fillStyle='#16040a';C.fill();C.strokeStyle=INK;C.lineWidth=5.5;C.stroke();C.strokeStyle='#ff5ad0';C.lineWidth=2.4;C.stroke();
  C.fillStyle='#d8fbff';C.strokeStyle=INK;C.lineWidth=1.2;
  for(let i=0;i<7;i++){const u=.1+i*.133,a=mp(u-.05,s0),b=mp(u+.05,s0);C.beginPath();C.moveTo(a[0],a[1]);C.lineTo((a[0]+b[0])/2,(a[1]+b[1])/2+(i%2?8:13)*tk);C.lineTo(b[0],b[1]);C.closePath();C.fill();C.stroke()}
  for(let i=0;i<5;i++){const u=.2+i*.15,a=mp(u-.045,s1),b=mp(u+.045,s1);C.beginPath();C.moveTo(a[0],a[1]);C.lineTo((a[0]+b[0])/2,(a[1]+b[1])/2-9*tk);C.lineTo(b[0],b[1]);C.closePath();C.fill();C.stroke()}
  C.restore()}
function drawWalker(T){const b=S.gun.bs,x=b.x,y=wkY(b),dk=b.dead,hit=b.flash>0||b.dying>0,rage=b.hp<WK.hp*.35,sh=b.dying>0?(Math.random()-.5)*8:0;
  C.save();C.translate(sh,sh*.5);C.lineCap=C.lineJoin='round';
  // 腿：髋 → 高高拱起的膝关节 → 爪子
  const leg=(i,col)=>{const f=wkFoot(b,i),k=Math.sign(WK.legs[i]),hx=x+WK.legs[i]*.45,hy=y+6,kx=(hx+f.x)/2+k*40,ky=hy-64+(y-(G-190))*.5;
    for(const [lw,c] of [[16,INK],[10,col]]){C.beginPath();C.moveTo(hx,hy);C.lineTo(kx,ky);C.lineTo(f.x,f.y-6);C.strokeStyle=c;C.lineWidth=lw;C.stroke()}
    dot(kx,ky,9,INK);dot(kx,ky,6,dk?'#5a4a3a':'#ffb347');blob([[f.x-15,f.y+2],[f.x-k*4,f.y-18],[f.x+15,f.y+2]]);ink('#f4efe4',2.2)};
  leg(1,dk?'#2a2420':'#6a2a14');leg(2,dk?'#2a2420':'#6a2a14');
  // 弱点囊：吊在肚子下面，一闪一闪
  const [sx,sy,sr]=WK.sac,pu=.5+.5*Math.sin(T*(rage?12:6));
  C.beginPath();C.moveTo(x+sx-12,y+18);C.lineTo(x+sx,y+sy);C.lineTo(x+sx+12,y+18);C.strokeStyle=INK;C.lineWidth=9;C.stroke();
  if(!dk){dot(x+sx,y+sy,sr+8+pu*6,`rgba(255,240,106,${.18+pu*.14})`)}
  wcirc(x+sx,y+sy,sr,311,1.5);ink(dk?'#5a4a3a':hit?'#ffffff':'#fff06a',2.8);
  if(!dk){dot(x+sx,y+sy+3,sr*.55,'#ff9a3a');dot(x+sx-sr*.3,y+sy-sr*.35,sr*.2,'rgba(255,255,255,.8)')}
  // 背甲：一节一节的壳，背上一排骨刺
  for(let i=0;i<5;i++){const u=-70+i*35,ty=y-52-28*Math.cos(u/70*1.2);blob([[x+u-11,ty+8],[x+u+(i-2)*4,ty-26-(i%2)*8],[x+u+11,ty+8]]);ink('#f4efe4',2.2)}
  blob([[-104,20],[-96,-30],[-58,-66],[0,-80],[58,-68],[98,-30],[106,20],[52,32],[-52,32]].map(q=>[x+q[0],y+q[1]]));ink(dk?'#2a2420':hit?'#e0946a':'#b5481f',3.4);
  C.strokeStyle=dk?'#17110f':'#6a2a14';C.lineWidth=3;for(const u of [-48,0,48]){C.beginPath();C.moveTo(x+u-6,y-70+Math.abs(u)*.25);C.quadraticCurveTo(x+u+10,y-20,x+u-2,y+28);C.stroke()}
  for(const [u,v,r] of [[-70,-8,7],[-24,-40,9],[30,-30,6],[72,-4,8],[20,8,5]])dot(x+u,y+v,r,'rgba(255,180,70,.28)');
  // 头：三只眼 + 一对大颚（张嘴吐虫的时候张开）
  const hx=x-100,hy=y+12,mo=dk?.1:b.roar>0||b.dying>0?1:.25+.1*Math.sin(T*3),ec=rage?'#ff3b2e':'#c8ff3a';
  for(const k of [-1,1]){blob([[hx-22,hy+16+k*5],[hx-56-mo*6,hy+22+k*(9+mo*16)],[hx-40,hy+20+k*(3+mo*5)],[hx-20,hy+24+k*9]]);ink('#f4efe4',2.2)}
  wcirc(hx,hy,34,313,1.5);ink(dk?'#2a2420':hit?'#8a5a4a':'#4a2418',3);
  if(mo>.5){dot(hx-26,hy+19,9,'#16040a')}
  eye(hx-17,hy-4,9,ec,-1,dk||b.dying>0);eye(hx-2,hy-17,6,ec,-1,dk||b.dying>0);eye(hx+6,hy+4,5,ec,-1,dk||b.dying>0);
  leg(0,dk?'#3a2a24':'#8a3a1a');leg(3,dk?'#3a2a24':'#8a3a1a');
  C.restore()}
// 触手：从身体伸到它这回合守着的位置，末端一个拍子，虚线圈是会被拍飞的范围
function drawTent(T){const B=S.boss;if(B.dying>0||B.dead)return;const x0=352,y0=625,k=B.swat>0?Math.sin(B.swat/14*3.14)*26:0,x1=B.tx+Math.sin(T*3)*6-k,y1=B.ty+Math.cos(T*2.3)*6,cx=(x0+x1)/2-52,cy=(y0+y1)/2+(y1<y0?-34:44);
  C.lineCap='round';for(const [lw,c] of [[27,INK],[20,BTIER[B.tier].d]]){C.beginPath();C.moveTo(x0,y0);C.quadraticCurveTo(cx,cy,x1,y1);C.strokeStyle=c;C.lineWidth=lw;C.stroke()}
  for(let i=1;i<6;i++){const u=i/6.5,v=1-u;dot(v*v*x0+2*u*v*cx+u*u*x1,v*v*y0+2*u*v*cy+u*u*y1+5,3.6,'#ff8ad0')}
  wcirc(x1,y1,23,205,1.5);ink('#ff5ad0',2.8);dot(x1,y1,10,INK);dot(x1,y1,8.5,'#fff06a');
  C.setLineDash([6,9]);C.beginPath();C.arc(B.tx,B.ty,B.sr,0,7);C.strokeStyle='rgba(255,122,216,.6)';C.lineWidth=2.2;C.stroke();C.setLineDash([])}
// 植物贴图缓存：一波有几十株，逐笔重画太慢，所以每种植物按"抖动帧 × 是否受伤"各画一次存成小图。
// 着火、冰冻、受击闪白时，以及吞噬花、再生藤（它们的样子取决于实时状态），仍然逐笔画。
const SPR={},SPR_OK={pot:1,bud:1,cooker:1,spore:1,cactus:1,shroom:1,pod:1,thorn:1};
function mkSpr(g,hs,hurt){const c=document.createElement('canvas');c.width=c.height=hs*2*SCL;const o=C;C=c.getContext('2d');C.scale(SCL,SCL);HALO=true;
  drawBody({g:{kind:'target',t:g.t,r:g.r,hp:hurt?.1:g.max,max:g.max,tt:BO*.9+g.r},position:{x:hs,y:hs},angle:0,velocity:{x:0,y:0}});HALO=false;C=o;return c}
// 外星植物用的几个小零件：发光的眼、锯齿嘴、带发光尖端的触须
function eye(x,y,r,col,tw,shut){dot(x,y,r+1.4,INK);if(shut){dot(x,y,r,'#3a2a3a');C.beginPath();C.moveTo(x-r,y-r*.4);C.lineTo(x+r,y+r*.4);C.strokeStyle='#ff3b2e';C.lineWidth=1.8;C.stroke();return}
  dot(x,y,r,col);C.beginPath();C.ellipse(x+tw*r*.14,y,r*.22,r*.72,0,0,7);C.fillStyle='#0d0507';C.fill();dot(x-r*.36,y-r*.36,r*.2,'#fff')}
function zig(x0,x1,y,n,amp,col){C.beginPath();C.moveTo(x0,y);for(let i=1;i<=n;i++)C.lineTo(x0+(x1-x0)*i/n,y+(i%2?amp:0));C.strokeStyle=INK;C.lineWidth=3.6;C.stroke();C.strokeStyle=col;C.lineWidth=1.4;C.stroke()}
function tend(n,a0,da,r,l,tt,col,tip,lw){for(let i=0;i<n;i++){const a=a0+i*da,w=Math.sin(tt*3.5+i*1.7)*.4,x2=Math.cos(a+w)*l,y2=Math.sin(a+w)*l,m=(r+l)*.52;
  C.beginPath();C.moveTo(Math.cos(a)*r*.8,Math.sin(a)*r*.8);C.quadraticCurveTo(Math.cos(a+w*.5)*m,Math.sin(a+w*.5)*m,x2,y2);C.strokeStyle=INK;C.lineWidth=lw+2.2;C.stroke();C.strokeStyle=col;C.lineWidth=lw;C.stroke();dot(x2,y2,lw*.9+2,INK);dot(x2,y2,lw*.9+.8,tip)}}
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
    if(wrapped(g)){C.lineCap='round';for(const [lw,c] of [[5,INK],[2.4,'#e04aa8']]){C.strokeStyle=c;C.lineWidth=lw;hz?wline(-w/2,-h/2-1,w/2,h/2+1,sd+5,2):wline(-w/2-1,-h/2,w/2+1,h/2,sd+5,2);C.stroke()}C.beginPath();C.ellipse(0,0,5.5,2.6,.6,0,7);C.fillStyle='#5af0e6';C.fill();C.strokeStyle=INK;C.lineWidth=1.2;C.stroke()}
    if(g.hp<g.max*.6){const k=(sd*37%10)/10-.5;C.beginPath();if(hz){C.moveTo(k*w*.5,-h/2);C.lineTo(k*w*.5+4,0);C.lineTo(k*w*.5-3,h/2)}else{C.moveTo(-w/2,k*h*.5);C.lineTo(0,k*h*.5+4);C.lineTo(w/2,k*h*.5-3)}C.strokeStyle=INK;C.lineWidth=1.8;C.stroke()}
    if(g.flash>0){C.globalAlpha=Math.min(1,g.flash*3);wrect(-w/2,-h/2,w,h,sd);C.fillStyle='#fff';C.fill();C.globalAlpha=1}}
  else if(g.kind==='target'&&g.t==='maw'){const t=TG.maw,r=g.r,sd=157,tt=g.frozen>0?0:performance.now()/1000;C.rotate(-b.angle);
    let nd=1e9;if(!(g.cd>0)&&!g.burn&&!(g.frozen>0))for(const o of bodies())if(o.g.kind==='shot'&&!o.g.hit)nd=Math.min(nd,Math.hypot(o.position.x-p.x,o.position.y-p.y));
    const op=g.cd>0?(g.cd>150?.3+.22*Math.sin(g.cd*.7):.07):nd<180?1:.42+.08*Math.sin(tt*3),ha=op*.8,hx=r*.55,R2=r*1.7;
    C.lineCap='round';for(let i=0;i<4;i++){const a=.9+i*.45,w=Math.sin(tt*3+i*2)*.3;C.beginPath();C.moveTo(Math.cos(a)*r*.8,Math.sin(a)*r*.8);C.quadraticCurveTo(Math.cos(a+w*.5)*r*1.25,Math.sin(a+w*.5)*r*1.25,Math.cos(a+w)*r*1.55,Math.sin(a+w)*r*1.55);C.strokeStyle=INK;C.lineWidth=3.6;C.stroke();C.strokeStyle=t.d;C.lineWidth=1.4;C.stroke()}
    for(let i=0;i<5;i++){const a=-1.25+i*.62,pc=(da,d)=>[Math.cos(a+da)*r*d,Math.sin(a+da)*r*d];blob([pc(-.2,.85),pc(0,1.42),pc(.2,.85)]);ink('#5af0e6',1.6)}
    wcirc(0,0,r,sd,1.3);ink(g.cd>0?'#6a86f0':t.c);
    C.save();wcirc(0,0,r-1.2,sd,1.3);C.clip();C.beginPath();C.moveTo(hx,0);C.arc(hx,0,R2,Math.PI-ha,Math.PI+ha);C.closePath();C.fillStyle='#16040a';C.fill();
    if(op>.3){blob([[hx-r*.3,0],[-r*.4,r*.16*op],[-r*.8,0],[-r*.4,-r*.14*op]]);C.fillStyle='#c22a3a';C.fill()}
    for(const sg of [-1,1]){const A=Math.PI+sg*ha,ux=Math.cos(A),uy=Math.sin(A),B=A-sg*Math.min(.3,ha*.9);
      C.beginPath();C.moveTo(hx,0);C.lineTo(hx+ux*R2,uy*R2);C.strokeStyle=INK;C.lineWidth=4.4;C.stroke();C.strokeStyle='#ff5ad0';C.lineWidth=2;C.stroke();
      C.fillStyle='#d8fbff';C.strokeStyle=INK;C.lineWidth=.9;
      for(let i=0;i<5;i++){const q=r*(.36+i*.25);C.beginPath();C.moveTo(hx+ux*(q-r*.09),uy*(q-r*.09));C.lineTo(hx+Math.cos(B)*q*.97,Math.sin(B)*q*.97);C.lineTo(hx+ux*(q+r*.09),uy*(q+r*.09));C.closePath();C.fill();C.stroke()}}
    C.restore();wcirc(0,0,r,sd,1.3);ink(null);
    for(const [ex,ey,er] of [[r*.3,-r*.62,r*.19],[r*.7,-r*.25,r*.14]]){dot(ex,ey,er,'#0d0507');dot(ex,ey,er*.5,g.cd>0?'#7a1414':'#ff3b2e');if(!(g.cd>0))dot(ex,ey,er*.18,'#ffe9c0')}
    if(g.cd>0){C.fillStyle=LITE;C.font='700 13px '+FONT;C.textAlign='center';C.fillText('消化中',0,-r-9)}
    stat(g,r,sd)}
  else if(g.kind==='root'){const r=g.r,tt=performance.now()/1000;C.lineCap='round';
    for(let i=0;i<5;i++){const a=.5+i*.53;C.beginPath();C.moveTo(Math.cos(a)*r*.7,Math.sin(a)*r*.7);C.lineTo(Math.cos(a)*r*1.5,Math.sin(a)*r*1.5);C.strokeStyle=INK;C.lineWidth=4.6;C.stroke();C.strokeStyle='#e04aa8';C.lineWidth=2;C.stroke()}
    for(let i=0;i<3;i++){const a=-2.1+i*.53,pc=(da,d)=>[Math.cos(a+da)*r*d,Math.sin(a+da)*r*d];blob([pc(-.22,.85),pc(0,1.5),pc(.22,.85)]);ink('#5af0e6',1.6)}
    wcirc(0,0,r,91,1);ink(TG.root.c);dot(0,r*.25,r*.42*(.8+.2*Math.sin(tt*4)),'rgba(255,240,106,.7)');
    for(const k of [-1,1]){dot(k*r*.4,-r*.25,r*.2,'#0d0507');dot(k*r*.4,-r*.25,r*.09,'#f2d23a')}
    stat(g,r,91)}
  else if(g.kind==='target'&&g.t==='core'){const r=g.r,tt=performance.now()/1000,pu=g.frozen>0?1:1+.07*Math.sin(tt*5+p.y);C.rotate(-b.angle);
    if(g.shut){wcirc(0,0,r*.95,77,1);ink('#4a2a7a');C.lineCap='round';C.beginPath();C.moveTo(-r*.72,-2);C.quadraticCurveTo(0,r*.4,r*.72,-2);C.strokeStyle=INK;C.lineWidth=3.4;C.stroke();for(let i=0;i<5;i++){const x=-r*.5+i*r*.25;C.beginPath();C.moveTo(x,r*.08+(2-Math.abs(i-2))*2.4);C.lineTo(x,r*.3+(2-Math.abs(i-2))*2.4);C.stroke()}}
    else{dot(0,0,r*1.55*pu,'rgba(255,240,106,.2)');wcirc(0,0,r*pu,77,1.2);ink(TG.core.c,3);dot(0,0,r*.66*pu,'#ff9a3a');dot(0,0,r*.42*pu,'#ff3b6a');C.beginPath();C.ellipse(0,0,r*.09,r*.32,0,0,7);C.fillStyle='#0d0507';C.fill();dot(-r*.42,-r*.44,r*.14,'#fff');
      C.beginPath();C.arc(0,0,r+7,-1.571,-1.571+6.283*Math.max(0,g.hp/g.max));C.strokeStyle='#ff3b2e';C.lineWidth=3.4;C.lineCap='round';C.stroke()}
    stat(g,r,77)}
  else if(g.kind==='target'&&C===ctx&&SPR_OK[g.t]&&!g.burn&&!(g.frozen>0)&&!(g.flash>0)){const hs=g.r*2+8,hurt=g.hp<g.max*.55,key=g.t+BO+(hurt?'h':'');C.drawImage(SPR[key]||(SPR[key]=mkSpr(g,hs,hurt)),-hs,-hs,hs*2,hs*2)}
  else if(g.kind==='target'&&TG[g.t].sh){const t=TG[g.t],hurtF=g.hp<g.max*.55,tw=g.frozen>0?0:BO-1,sd=g.r*5+1;C.lineCap=C.lineJoin='round';C.scale(SK,SK);
    if(g.t==='cactus'){ // 囊茎：三个鼓囊囊的肉球叠成一根茎，每个球一只眼，两条卷须手臂，头顶垂着一颗发光的诱饵
      for(const k of [-1,1]){C.beginPath();C.moveTo(k*9,2);C.bezierCurveTo(k*24,7,k*29,-12,k*19,-13-tw*k);C.bezierCurveTo(k*13,-13,k*15,-6,k*20,-8);C.strokeStyle=INK;C.lineWidth=6;C.stroke();C.strokeStyle='#8a4ad6';C.lineWidth=3;C.stroke()}
      C.beginPath();C.moveTo(0,-28);C.bezierCurveTo(-9,-40,7,-48,7+tw,-39);C.strokeStyle=INK;C.lineWidth=3.4;C.stroke();C.strokeStyle=t.c;C.lineWidth=1.3;C.stroke();dot(7+tw,-37,7.5,'rgba(255,240,106,.3)');dot(7+tw,-37,4.6,INK);dot(7+tw,-37,3.4,'#fff06a');
      [[17,13.5,t.c],[0,14,'#8a4ad6'],[-17,13,t.c]].forEach(([y,r,c],i)=>{wcirc(0,y,r,sd+i,.8);ink(c);dot(-r*.5,y-r*.5,r*.15,'rgba(255,255,255,.65)');eye(0,y,i===1?6:4.6,i===1?'#fff06a':'#5af0e6',tw,hurtF&&i===2)})}
    else if(g.t==='shroom'){ // 水母菇：钟形的伞，伞沿是波浪边，底下垂着一排会摆的须，伞上长着发光的斑
      for(let i=0;i<5;i++){const x=-16+i*8,l=13+(i%2)*5,e=tw*(i%2?1.5:-1.5);C.beginPath();C.moveTo(x,1);C.bezierCurveTo(x-5,l*.4,x+5,l*.7,x+e,l+3);C.strokeStyle=INK;C.lineWidth=4.4;C.stroke();C.strokeStyle=i%2?'#ff8ad0':'#aef4ff';C.lineWidth=2;C.stroke()}
      blob([[-26,3],[-25,-10],[-14,-22],[0,-25],[14,-22],[25,-10],[26,3],[17,7],[9,1],[0,7],[-9,1],[-17,7]]);ink(t.c);
      dot(-9,-14,9,'rgba(255,255,255,.16)');for(const [x,y,r,c] of [[-15,-12,3.4,'#fff06a'],[3,-18,2.8,'#aef4ff'],[16,-9,3,'#fff06a'],[-3,-10,2,'#aef4ff']]){dot(x,y,r+2,'rgba(255,255,255,.25)');dot(x,y,r,c)}
      eye(-8,-3,4.6,'#c8ff3a',tw,hurtF);eye(8,-3,4.6,'#c8ff3a',tw)}
    else if(g.t==='pod'){ // 多眼荚：五节鼓起来的豆荚，背上冒着三根发光的芽，两头各卷着一根须
      for(const k of [-1,1]){C.beginPath();C.moveTo(k*30,0);C.bezierCurveTo(k*41,-1,k*43,-13,k*36,-13);C.bezierCurveTo(k*31,-13,k*33,-7,k*37,-8);C.strokeStyle=INK;C.lineWidth=3.8;C.stroke();C.strokeStyle='#c8ff3a';C.lineWidth=1.6;C.stroke()}
      [[24,11,t.c],[12,12,'#7a52d6'],[0,12.5,t.c],[-12,12,'#7a52d6']].forEach(([x,r,c],i)=>{if(i<3){C.beginPath();C.moveTo(x,-r+2);C.quadraticCurveTo(x-3,-r-5,x+2+tw,-r-9);C.strokeStyle=INK;C.lineWidth=3;C.stroke();dot(x+2+tw,-r-10,4,INK);dot(x+2+tw,-r-10,2.8,'#c8ff3a')}wcirc(x,0,r,sd+i,.7);ink(c,2.2);dot(x,5,2.2,'rgba(255,255,255,.55)')});
      wcirc(-23,0,12.5,sd+5,.7);ink(t.c,2.2);eye(-26,-2,5.6,'#ff5ad0',tw,hurtF);zig(-30,-18,6,4,2.6,'#fff')}
    else{C.rotate(2.618); // 泪滴苞：一颗尖顶的肉质花苞，顶上卷着一根须，底下两片卷边的叶，正中一只眼
      for(const k of [-1,1]){blob([[k*5,9],[k*20,3],[k*27,11-tw*k],[k*13,14]]);ink('#ff7ad8',1.6)}
      C.beginPath();C.moveTo(0,-19);C.bezierCurveTo(1,-31,11,-32,9+tw,-25);C.bezierCurveTo(8,-22,5,-23,6,-26);C.strokeStyle=INK;C.lineWidth=3.6;C.stroke();C.strokeStyle=t.c;C.lineWidth=1.5;C.stroke();
      blob([[0,-25],[6,-13],[15,2],[14,11],[0,14],[-14,11],[-15,2],[-6,-13]]);ink(t.c);
      C.strokeStyle='rgba(255,122,216,.75)';C.lineWidth=1.6;for(const k of [-1,1]){C.beginPath();C.moveTo(k*3,-17);C.quadraticCurveTo(k*12,-4,k*10,10);C.stroke()}
      dot(-6,-9,2.6,'rgba(255,255,255,.6)');eye(0,2,6.2,'#fff06a',tw,hurtF);zig(-5,5,10,4,2,'#fff')}
    stat(g,g.r*.85/SK,sd)}
  else if(g.kind==='target'){const t=TG[g.t],r=g.r,hurtF=g.hp<g.max*.55,sd=r*7+3,tt=g.frozen>0?p.x:g.tt!=null?g.tt:performance.now()/1000+p.x*.013,tw=g.frozen>0?0:BO-1;C.lineCap=C.lineJoin='round';
    if(g.t==='bud'){ // 荧光孢囊：半透明的果冻球，里面一颗会转的核，头顶一根小触角
      C.beginPath();C.moveTo(0,-r*.8);C.quadraticCurveTo(r*.5,-r*1.45,r*.2+tw,-r*1.75);C.strokeStyle=INK;C.lineWidth=3.2;C.stroke();C.strokeStyle=t.d;C.lineWidth=1.3;C.stroke();dot(r*.2+tw,-r*1.78,3.5,INK);dot(r*.2+tw,-r*1.78,2.4,'#ff5ad0');
      wcirc(0,0,r,sd,1);ink(t.c);dot(0,r*.08,r*.64,'rgba(255,255,255,.25)');dot(tw*.6,r*.1,r*.42,INK);dot(tw*.6,r*.1,r*.32,hurtF?'#7a2a4a':'#ff5ad0');dot(tw*.6-r*.1,r*.02,r*.09,'#fff');dot(-r*.5,-r*.5,r*.14,'rgba(255,255,255,.75)')}
    else if(g.t==='cooker'){ // 虚空之眼：漆黑的球体，一圈青粉相间的肉质花瓣，正中一只同心环巨眼
      for(let i=0;i<10;i++){const a=i*.6283+.2,L=r*(i%2?1.5:1.85),pc=(da,d)=>[Math.cos(a+da)*d,Math.sin(a+da)*d];blob([pc(-.3,r*.8),pc(-.2,L*.8),pc(0,L),pc(.2,L*.8),pc(.3,r*.8)]);ink(i%2?'#ff5ad0':'#5af0e6',1.7);dot(Math.cos(a)*L*.86,Math.sin(a)*L*.86,2.2,'#fff06a')}
      tend(5,.6,.48,r,r*1.62,tt,'#4a3a8a','#ff5ad0',2.6);wcirc(0,0,r,sd,1.3);ink(t.c);
      const ey=-r*.18,er=r*.52,ix=tw*1.4;dot(0,ey,er+1.8,'#5af0e6');dot(0,ey,er,hurtF?'#4a1a3a':'#06201f');for(const [k,c] of [[.86,'#1fae8a'],[.62,'#5af0e6'],[.4,'#c8ff3a']])dot(ix*(1-k)*2,ey,er*k,c);
      C.beginPath();C.ellipse(ix,ey,er*.1,er*.42,0,0,7);C.fillStyle='#0d0507';C.fill();dot(ix-er*.3,ey-er*.32,er*.12,'#fff');
      if(hurtF){C.strokeStyle='#ff3b2e';C.lineWidth=2;C.beginPath();C.moveTo(-er*.3,ey+er*.9);C.lineTo(-er*.36,ey+er*1.9);C.moveTo(er*.4,ey+er*.85);C.lineTo(er*.44,ey+er*1.5);C.stroke()}
      for(const k of [-1,1])eye(k*r*.76,r*.18,r*.1,'#ff5ad0',0);zig(-r*.5,r*.5,r*.56,8,r*.2,'#5af0e6')}
    else{const rg=g.t==='vine',sp=g.t==='spore';
      // 再生水母：一圈发光触须；脉冲菌囊：头顶三颗会喷孢子的泡；三眼瘤：一圈卷曲的肉质花瓣
      rg?tend(10,.3,.6283,r,r*1.62,tt,'#1f8a7a','#eaffb0',2):tend(5,.45,.56,r,r*1.55,tt,sp?'#b0402a':'#4a2f9a',t.d,2.2);
      if(sp)for(const [px,py,pr] of [[-r*.62,-r*.86,r*.36],[0,-r*1.1,r*.42],[r*.62,-r*.86,r*.36]]){wcirc(px,py,pr,sd+pr|0,.6);ink('#fff06a',1.6);dot(px,py,pr*.4,'#ff7a4a')}
      else if(!rg)for(let i=0;i<5;i++){const a=-2.51+i*.47,L=r*(i%2?1.5:1.9),pc=(da,d)=>[Math.cos(a+da)*d,Math.sin(a+da)*d];blob([pc(-.24,r*.8),pc(-.16,L*.8),pc(.04,L),pc(.16,L*.8),pc(.24,r*.8)]);ink(i%2?'#ff7ad8':'#5af0e6',1.6)}
      wcirc(0,0,r,sd,1.3);ink(t.c);
      if(rg){dot(0,-r*.25,r*.66,'rgba(255,255,255,.2)');C.beginPath();C.arc(0,0,r+5,-1.571,-1.571+6.283*Math.max(0,g.hp/g.max));C.strokeStyle=g.hp<g.max?'#7dffb0':'rgba(125,255,176,.4)';C.lineWidth=2.6;C.stroke();
        dot(0,-r*.12,r*.3,INK);C.beginPath();C.ellipse(0,-r*.12,r*.62,r*.24,0,0,7);C.fillStyle=INK;C.fill();C.beginPath();C.ellipse(0,-r*.12,r*.54,r*.17,0,0,7);C.fillStyle=hurtF?'#5a8a7a':'#eaffb0';C.fill();for(const k of [-1,0,1])dot(k*r*.3+tw,-r*.12,r*.09,'#0d0507')}
      else if(sp){for(const [px,py] of [[-.58,.42],[.62,.3],[-.2,.68],[.3,-.66]])dot(px*r,py*r,r*.13,'#fff06a');eye(-r*.36,-r*.16,r*.25,'#fff06a',tw,hurtF);eye(r*.42,-r*.1,r*.16,'#fff06a',tw)}
      else{C.strokeStyle='rgba(90,240,230,.65)';C.lineWidth=1.4;C.beginPath();C.moveTo(-r*.85,r*.35);C.quadraticCurveTo(-r*.3,r*.2,-r*.62,-r*.55);C.moveTo(r*.88,r*.2);C.quadraticCurveTo(r*.4,r*.25,r*.66,-r*.5);C.stroke();
        eye(0,-r*.44,r*.25,'#c8ff3a',tw);eye(-r*.44,-r*.02,r*.19,'#c8ff3a',tw,hurtF);eye(r*.44,-r*.02,r*.19,'#c8ff3a',tw)}
      zig(-r*.42,r*.42,r*.5,6,r*.2,rg?'#eaffb0':sp?'#fff':'#5af0e6')}
    if(hurtF){C.beginPath();C.moveTo(r*.2,-r);C.lineTo(r*.02,-r*.6);C.lineTo(r*.3,-r*.45);C.strokeStyle=INK;C.lineWidth=1.8;C.stroke()}
    stat(g,r,sd)}
  else if(g.kind==='shelf'){C.strokeStyle=INK;C.lineWidth=3;wline(-g.w/2+14,g.h/2,-g.w/2+16,g.h/2+26,90);C.stroke();wline(-g.w/2+16,g.h/2+26,-g.w/2+42,g.h/2,91);C.stroke();wline(g.w/2-14,g.h/2,g.w/2-16,g.h/2+26,92);C.stroke();wline(g.w/2-16,g.h/2+26,g.w/2-42,g.h/2,93);C.stroke();wrect(-g.w/2,-g.h/2,g.w,g.h,94);ink('#d59a55')}
  else if(g.kind==='wall'){const w=g.w,h=g.h;wrect(-w/2,-h/2,w,h,95);ink(g.gate?'#f2b83a':'#7f8a9c');
    if(g.gate){C.save();wrect(-w/2,-h/2,w,h,95);C.clip();C.strokeStyle=INK;C.lineWidth=5;for(let y=-h/2-w;y<h/2+w;y+=14){C.beginPath();C.moveTo(-w/2-2,y+w);C.lineTo(w/2+2,y);C.stroke()}C.restore();wrect(-w/2,-h/2,w,h,95);ink(null)}
    else for(const t of [-.4,0,.4])w>h?dot(t*w,0,1.8,'#394353'):dot(0,t*h,1.8,'#394353')}
  else if(g.kind==='curb'){wrect(-g.w/2,-g.h/2,g.w,g.h,98);ink('#6a4a3a');C.strokeStyle='#3a261c';C.lineWidth=1.5;wline(-1,-g.h/2+6,1,g.h/2-6,99,1);C.stroke()}
  else if(g.kind==='bounce'){const w=g.w,h=g.h;wrect(-w/2,-h/2,w,h,96);ink('#dfe6ee');C.strokeStyle='#4fe3ff';C.lineWidth=3;C.lineCap='round';wline(-w/2+6,0,w/2-6,0,97,.4);C.stroke()}
  C.restore();if(g.kind==='shot')g.hit?drawShot(g.type,p.x,p.y,b.angle,g.r):drawShot(g.type,p.x,p.y,Math.atan2(b.velocity.y,b.velocity.x),g.r,1)}
function star(x,y,R,ph){C.beginPath();for(let i=0;i<20;i++){const a=i*.3142+ph,d=i%2?R*.62:R;C.lineTo(x+Math.cos(a)*d,y+Math.sin(a)*d)}C.closePath()}
function drawWorld(){BO=(performance.now()/170|0)%3;C=ctx;const T=performance.now()/1000;
  C.setTransform(SCL,0,0,SCL,0,0);
  if(S&&S.zoom){S.zk+=((S.slow>0?1:0)-S.zk)*.12;if(S.zk>.004){const z=1+.32*S.zk;C.translate(S.zoom.x,S.zoom.y);C.scale(z,z);C.translate(-S.zoom.x,-S.zoom.y)}}
  C.drawImage(bg,0,0,W,H);if(!S)return;
  // 汁液往下流：每帧把流过的一小段画进汁液图层（留下痕迹），越流越慢，流到地面摊成水洼
  for(let i=S.drips.length-1;i>=0;i--){const d=S.drips[i],y0=d.y;d.y+=d.v;d.x+=Math.sin(d.y*.07+d.ph)*.12;d.left-=d.v;d.v*=.988;
    sg.globalAlpha=.72;sg.strokeStyle=sg.fillStyle=d.col;sg.lineCap='butt';sg.lineWidth=d.w;sg.beginPath();sg.moveTo(d.x,y0);sg.lineTo(d.x,d.y);sg.stroke();
    if(d.y>=G){S.drips.splice(i,1);splat(d.x,G+2+d.w,d.w*2.2,d.col)}
    else if(d.left<=0||d.v<.1){S.drips.splice(i,1);sg.beginPath();sg.arc(d.x,d.y,d.w*.95,0,7);sg.fill()}}
  C.globalAlpha=.85;C.drawImage(SPL,0,0,W,H);
  for(const d of S.drips){C.beginPath();C.ellipse(d.x,d.y,d.w*.95,d.w*1.25,0,0,7);C.fillStyle=d.col;C.fill()}C.globalAlpha=1;
  for(let i=0;i<34;i++)dot((i*137.5+T*(8+i%5*4))%W,(i*71.3+T*(14+i%7*5))%G,1.2+i%3*.6,'rgba(25,15,15,.55)');
  for(let i=0;i<14;i++)dot((i*211+Math.sin(T+i)*24+W)%W,G-((i*53+T*(18+i%4*8))%G),1.6,'rgba(255,180,70,.85)');
  if(S.shake>0){S.shake-=1/60;C.translate((Math.random()-.5)*8*S.shake/.3,(Math.random()-.5)*8*S.shake/.3)}
  for(const q of S.last)dot(q[0],q[1],2,'rgba(23,17,15,.4)');
  for(const q of S.trail)dot(q[0],q[1],2.4,'#f2d23a');
  const p=pull(),sx=OX,sy=OY;
  for(const s of S.stains){C.globalAlpha=.5;wcirc(s.x,s.y,s.r,s.sd,5);C.fillStyle=s.c;C.fill();for(let i=0;i<5;i++)dot(s.x+Math.cos(i*1.3+s.sd)*s.r*1.45,s.y+Math.sin(i*1.3+s.sd)*s.r*1.45,2+i%3,s.c);C.globalAlpha=1}
  C.lineCap='round';
  for(const b of bodies())if(wrapped(b.g)){const a=b.g.vine.position,q=b.position;for(const [lw,c] of [[5,INK],[2.2,'#e04aa8']]){C.beginPath();C.moveTo(a.x,a.y);C.quadraticCurveTo((a.x+q.x)/2,Math.max(a.y,q.y)+30,q.x,q.y);C.strokeStyle=c;C.lineWidth=lw;C.stroke()}}
  for(const r of S.ropes){const a=r.c.pointA,q=r.cut?{x:a.x+3,y:a.y+16}:att(r);C.beginPath();C.moveTo(a.x,a.y);C.lineTo(q.x,q.y);C.strokeStyle=INK;C.lineWidth=4.4;C.stroke();C.strokeStyle='#d9b06a';C.lineWidth=1.8;C.stroke();wrect(a.x-9,a.y-5,18,8,83,.5);ink('#394353',1.8)}
  if(S.boss)drawBoss(T);
  if(S.gun&&S.gun.bs)drawWalker(T);
  for(const b of bodies())if(b.g.kind!=='ground'){
    if(b.g.fly){const r=b.g.r,fl=Math.sin(T*22+b.g.fly.ph)*.5;for(const k of [-1,1]){C.beginPath();C.ellipse(b.position.x+k*r*.95,b.position.y-r*.35,r*.8,r*.3,k*(fl-.5),0,7);C.fillStyle='rgba(200,250,255,.55)';C.fill();C.strokeStyle=INK;C.lineWidth=1.6;C.stroke()}}
    drawBody(b)}
  if(S.boss)drawTent(T);
  if(S.gun)for(const q of S.gun.bul)drawShot('sugar',q.x,q.y,Math.atan2(q.vy,q.vx),GUN.r,1);   // 小号火箭弹
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
    else if(f.go){f.x+=f.vx;f.y+=f.vy;f.vy+=.38;if(f.y>G-2||f.life<.05){splat(f.x,Math.min(f.y,G+4+f.r),f.r*1.6,f.col);f.life=0}else{C.beginPath();C.ellipse(f.x,f.y,f.r,f.r*(1+Math.min(.8,Math.abs(f.vy)*.06)),0,0,7);C.fillStyle=f.col;C.fill();C.strokeStyle=INK;C.lineWidth=1.3;C.stroke()}}
    else if(f.ey){f.x+=f.vx;f.y+=f.vy;f.vy+=.4;if(f.y>G-f.r&&f.vy>0){f.y=G-f.r;f.vy*=-.45;f.vx*=.7}C.globalAlpha=Math.min(1,f.life*3);dot(f.x,f.y,f.r,'#f4efe4');C.beginPath();C.arc(f.x,f.y,f.r,0,7);C.strokeStyle=INK;C.lineWidth=1.3;C.stroke();dot(f.x+Math.cos(f.life*8)*f.r*.35,f.y+Math.sin(f.life*8)*f.r*.35,f.r*.42,'#b3261e');C.globalAlpha=1}
    else if(f.fl){f.x+=f.vx;f.y+=f.vy;const k=Math.min(1,f.life*2.5);dot(f.x,f.y,f.r*k+1,'rgba(240,96,30,.85)');dot(f.x,f.y+1,f.r*k*.55,'#ffd65c')}
    else if(f.sq){f.x+=f.vx;f.y+=f.vy;f.vy+=.25;C.globalAlpha=Math.min(1,f.life*2);C.save();C.translate(f.x,f.y);C.rotate(f.life*9);C.fillStyle=f.col;C.fillRect(-f.r,-f.r,f.r*2,f.r*2);C.strokeStyle=INK;C.lineWidth=1.2;C.strokeRect(-f.r,-f.r,f.r*2,f.r*2);C.restore();C.globalAlpha=1}
    else if(f.ring){if(f.R<30){wcirc(f.x,f.y,f.R*.7,9);C.strokeStyle='#ff3b2e';C.lineWidth=3;C.stroke();C.beginPath();C.moveTo(f.x-f.R,f.y);C.lineTo(f.x+f.R,f.y);C.moveTo(f.x,f.y-f.R);C.lineTo(f.x,f.y+f.R);C.stroke()}
      else{const k=1-f.life/.35,R=f.R*(.45+.55*k);C.globalAlpha=Math.min(1,f.life*5);star(f.x,f.y,R,f.x);ink(f.ice?'#ffffff':'#f2d23a',2.8);star(f.x,f.y,R*.6,f.x+.3);ink(f.ice?'#bfe9f7':'#e0602a',2.2);star(f.x,f.y,R*.28,f.x+.6);ink(f.ice?'#4a8ee0':'#b3261e',1.8);C.globalAlpha=1}}
    else if(f.txt){f.y-=.6;C.globalAlpha=Math.min(1,f.life*2);C.font='700 '+(f.sz||26)+'px '+FONT;C.textAlign='center';C.lineJoin='round';C.lineWidth=6;C.strokeStyle=INK;C.strokeText(f.txt,f.x,f.y);C.fillStyle=f.c||'#f2d23a';C.fillText(f.txt,f.x,f.y);C.globalAlpha=1}
    else{f.x+=f.vx;f.y+=f.vy;if(!f.sm)f.vy+=.2;C.globalAlpha=Math.min(1,f.life*2)*(f.sm?.75:1);C.beginPath();C.arc(f.x,f.y,f.r,0,7);C.fillStyle=f.col;C.fill();C.strokeStyle=INK;C.lineWidth=1.3;C.stroke();C.globalAlpha=1}}
  C.setTransform(SCL,0,0,SCL,0,0);
  if(S.flash>0){C.fillStyle=`rgba(255,244,220,${Math.min(.7,S.flash*7)})`;C.fillRect(0,0,W,H);S.flash-=1/60}
  // 弹药栏：瞄准时点一下换弹
  if(S.ammo.length){wrect(TX-27,G+9,(S.ammo.length-1)*tsp()+54,54,81);ink('#3a2a24',2.2);
    S.ammo.forEach((t,i)=>{const x=TX+i*tsp();if(i===S.sel&&S.state==='aim'){wrect(x-18,G+13,36,46,82,.6);ink('#f2d23a',2)}drawShot(t,x,TY+3,-1.571,AM[t].r*.95)})}
  const wk=S.gun&&S.gun.bs;if(S.boss||wk){const f=wk?Math.max(0,wk.hp)/WK.hp:S.boss.cores.reduce((a,c)=>a+(c.g.gone?0:Math.max(0,c.g.hp)),0)/(3*S.boss.hp);wrect(W/2-150,92,300,16,84,.6);ink('#2a1444',2.2);if(f>0){wrect(W/2-147,95,294*f,10,85,.4);C.fillStyle='#ff3b6a';C.fill()}label(wk?WK.n:BTIER[S.boss.tier].n,W/2,130,16,LITE,4)}
  let tip='';if(S.gun)tip=wk?(wk.x<=WK.x1+60&&wk.t<240&&wk.hp>0?'打它肚子下面发光的囊！别让它走到炮台':''):S.gun.fc<25?'按住屏幕连发扫射，别让虫群冲到炮台！':'';
  else if(S.state==='aim'&&S.ammo.length){const a=AM[S.ammo[S.sel]||S.ammo[0]];tip=S.boss&&S.boss.turn===0?'打爆三个发光的弱点囊！合上的打不动，别进触手的圈':a.tip}
  else if(S.state==='fly'&&S.cur&&!S.cur.g.gone&&!S.cur.g.used&&!S.cur.g.hit&&(S.cur.g.type==='chili'||S.cur.g.type==='guided'))tip=S.cur.g.type==='chili'?'现在点屏幕分裂！':'点一下你想打的位置！';
  if(tip&&!S.over&&UI.mode==='play'){C.font='700 16px '+FONT;C.textAlign='center';const w=C.measureText(tip).width+30;wrect(W/2-w/2,50,w,32,5);ink(PAPER);C.fillStyle=INK;C.fillText(tip,W/2,72)}
  if(UI.mode!=='home'&&UI.mode!=='about'){C.font='700 16px '+FONT;C.textAlign='left';C.fillStyle=LITE;C.fillText(S.gun?'虫群 '+(S.gun.left+targets().length):'植物 '+targets().length,14,G+34);C.fillText(S.rogue?'防线 '+RG.hp:S.gun?'防线 '+Math.max(0,S.gun.hp)+'   得分 '+S.score:'得分 '+S.score,14,G+58);}
  if(S.comboT>0&&S.kills>=3){S.comboT-=1/60;const z=1+Math.max(0,S.comboT-1.4)*2.5;C.save();C.translate(W-18,128);C.scale(z,z);C.rotate(-.08);C.font='700 34px '+FONT;C.textAlign='right';C.lineJoin='round';C.lineWidth=7;C.strokeStyle=INK;C.globalAlpha=Math.min(1,S.comboT*2);C.strokeText('×'+S.kills+' 连杀',0,0);C.fillStyle='#ff3b2e';C.fillText('×'+S.kills+' 连杀',0,0);C.restore()}
  // 飞向镜头的汁液团
  for(let i=S.fly.length-1;i>=0;i--){const f=S.fly[i];f.t+=1/26;if(f.t>=1){S.fly.splice(i,1);mkLens(f.tx,f.ty,f.R,f.col);S.shake=Math.max(S.shake||0,.12);continue}
    const k=f.t*f.t,x=f.x+(f.tx-f.x)*f.t,y=f.y+(f.ty-f.y)*f.t-Math.sin(f.t*3.14)*46,r=5+(f.R*.8-5)*k,so=(1-k)*30;
    dot(x+so,y+so*1.3,r,'rgba(0,0,0,.22)');dot(x,y,r,f.col);C.beginPath();C.arc(x,y,r,0,7);C.strokeStyle=shade(f.col,.58);C.lineWidth=2+k*2;C.stroke();dot(x-r*.3,y-r*.35,r*.22,'rgba(255,255,255,.6)')}
  // 糊在屏幕上的汁液
  for(let i=S.lens.length-1;i>=0;i--){const l=S.lens[i];l.t+=1/60;if(l.t>l.life){S.lens.splice(i,1);continue}l.y+=.13;
    const a=Math.min(1,(l.life-l.t)/.9)*.92,sc=1+.3*Math.max(0,1-l.t/.14),R=l.R,sh=(ox,oy)=>blob(l.pts.map(q=>[l.x+ox+q[0]*sc,l.y+oy+q[1]*sc]));
    C.globalAlpha=a*.28;sh(6,9);C.fillStyle='#000';C.fill();C.globalAlpha=a;C.lineCap='round';
    for(const d of l.drips){d.len=Math.min(d.max,d.len+d.v);d.v*=.993;const dx=l.x+d.dx,y1=l.y+R*.3+d.len;C.beginPath();C.moveTo(dx,l.y);C.lineTo(dx,y1);C.strokeStyle=l.dk;C.lineWidth=d.w+3;C.stroke();C.strokeStyle=l.col;C.lineWidth=d.w;C.stroke();
      dot(dx,y1,d.w*.8+1.5,l.dk);dot(dx,y1,d.w*.8,l.col);dot(dx-d.w*.22,y1-d.w*.2,d.w*.24,'rgba(255,255,255,.7)')}
    sh(0,0);C.fillStyle=l.col;C.fill();C.strokeStyle=l.dk;C.lineWidth=3;C.stroke();
    for(const q of l.sats){dot(l.x+q[0]+3,l.y+q[1]+5,q[2],'rgba(0,0,0,.25)');dot(l.x+q[0],l.y+q[1],q[2],l.col);dot(l.x+q[0]-q[2]*.3,l.y+q[1]-q[2]*.3,q[2]*.3,'rgba(255,255,255,.65)')}
    C.beginPath();C.ellipse(l.x-R*.2,l.y-R*.24,R*.25,R*.12,-.6,0,7);C.fillStyle='rgba(255,255,255,.55)';C.fill();dot(l.x+R*.2,l.y+R*.12,R*.07,'rgba(255,255,255,.5)');C.globalAlpha=1}
}
// ---------- 界面（原来是网页按钮，这里全部画在画布上并自己做点击判定） ----------
let BTN=[],homeBg=null;
function label(txt,x,y,size,col,stroke){C.font='700 '+size+'px '+FONT;C.textAlign='center';if(stroke){C.lineJoin='round';C.lineWidth=stroke;C.strokeStyle=INK;C.strokeText(txt,x,y)}C.fillStyle=col;C.fillText(txt,x,y)}
function btn(x,y,w,h,txt,fill,fn,col){BTN.push({x,y,w,h,fn});wrect(x+3,y+4,w,h,x+y);C.fillStyle=INK;C.fill();wrect(x,y,w,h,x+y);ink(fill);label(txt,x+w/2,y+h/2+6,17,col||INK)}
function dim(a){C.fillStyle='rgba(24,8,10,'+a+')';C.fillRect(0,0,W,H)}
function drawUI(){C=ctx;C.setTransform(SCL,0,0,SCL,0,0);BTN=[];
  if(S&&UI.mode!=='menu'&&UI.mode!=='home'&&UI.mode!=='about'){btn(12,12,70,36,S.rogue?'退出':'关卡',PAPER,S.rogue?home:menu);if(S.rogue)label((S.boss?'Boss · ':'')+'第 '+RG.stage+' 波 · '+(RG.score+S.score)+' 分',W/2,38,21,LITE,5);else{btn(W-82,12,70,36,'重来',PAPER,()=>load(S.lv));label((S.lv+1)+' · '+LV[S.lv].name,W/2,38,21,LITE,5)}}
  // 首页：背景图由 Game.ts 加载后通过 setHomeBg 传进来；图还没到（或加载失败）就用停住的第一关场景垫底
  if(UI.mode==='home'){homeBg?C.drawImage(homeBg,0,0,W,H):dim(.5);BTN=[];const T=performance.now()/1000,open=save.stars.filter(s=>s>0).length,stars=save.stars.reduce((a,v)=>a+(v||0),0);
    C.save();C.translate(W/2,310);C.rotate(-.04+Math.sin(T*1.5)*.012);label('末日防线',0,0,84,'#e0602a',14);C.restore();
    label('外星植物入侵 · 守住最后一道防线',W/2,362,18,LITE,5);
    btn(W/2-150,450,300,64,'开始游戏','#c22a2a',menu,LITE);
    btn(W/2-150,534,300,56,'关于我们',PAPER,()=>{UI={mode:'about'}});
    label('已通关 '+open+' / '+LV.length+'    ★ '+stars+(save.rg?'    肉鸽最佳 第 '+save.rg+' 波':''),W/2,628,15,'#f2d23a',4);
    label(CORP,W/2,940,14,LITE,4)}
  else if(UI.mode==='about'){homeBg?C.drawImage(homeBg,0,0,W,H):0;dim(.6);BTN=[];wrect(40,150,W-80,660,90);ink(PAPER,3);label('关于我们',W/2,212,34,'#b3261e');
    ABOUT.forEach((t,i)=>label(t,W/2,268+i*27,i===0?20:16,i===0||t===EMAIL?'#b3261e':INK));
    btn(W/2-170,730,160,52,UI.copied?'已复制':'复制邮箱','#77787f',()=>{try{navigator.clipboard.writeText(EMAIL);UI.copied=1}catch(e){}},LITE);btn(W/2+10,730,160,52,'返回','#c22a2a',home,LITE)}
  else if(UI.mode==='menu'){dim(.9);BTN=[];btn(12,12,70,36,'首页',PAPER,home);label('末日防线',W/2,118,44,'#e0602a',8);label('第 1 关按住连发 · 其余关卡拖拽发射 · 点弹药栏换弹',W/2,156,15,LITE);
    const open=save.stars.filter(s=>s>0).length,bw=118,bh=60,gap=7,x0=(W-bw*4-gap*3)/2,y0=176;
    LV.forEach((l,i)=>{const x=x0+(i%4)*(bw+gap),y=y0+(i>>2)*(bh+gap),lock=i>open,st=save.stars[i]||0;
      wrect(x+3,y+4,bw,bh,i+40);C.fillStyle=INK;C.fill();wrect(x,y,bw,bh,i+40);ink(lock?(l.boss?'#5a2630':'#3a2626'):l.boss?'#f0a8b8':PAPER);
      label(l.boss?'BOSS':String(i+1),x+bw/2,y+21,l.boss?16:18,lock?'#8a7070':l.boss?'#b3261e':INK);label(l.name,x+bw/2,y+37,12,lock?'#8a7070':INK);
      label(lock?'未解锁':'★'.repeat(st)+'☆'.repeat(3-st),x+bw/2,y+53,12,lock?'#8a7070':'#b3261e');
      if(!lock)BTN.push({x,y,w:bw,h:bh,fn:()=>load(i)})});
    btn(W/2-160,724,320,60,'肉鸽突袭 · 无尽尸潮','#c22a2a',rgStart,LITE);label('每波打完三选一强化，每 10 波一个 Boss',W/2,810,14,LITE);if(save.rg)label('最佳纪录：第 '+save.rg+' 波',W/2,832,15,'#f2d23a')}
  else if(UI.mode==='pick'){UI.t+=1/60;dim(Math.min(.86,UI.t*2.2));BTN=[];if(UI.t<.5)return;
    label(UI.left?'被突破 '+UI.left+' 株':'完美清场！耐久 +3',W/2,196,42,UI.left?'#e0602a':'#f2d23a',8);
    label('防线耐久 '+RG.hp+(UI.left?'（-'+UI.left+'）':'')+'    总分 '+RG.score,W/2,240,17,LITE);label('第 '+RG.stage+' 波结束 · 选一个强化',W/2,290,20,LITE,5);
    UI.cards.forEach((u,i)=>{const x=50,y=318+i*128,w=W-100,h=108,cx=x+w/2+(u.ammo?24:0);BTN.push({x,y,w,h,fn:()=>rgPick(u)});wrect(x+3,y+4,w,h,i+50);C.fillStyle=INK;C.fill();wrect(x,y,w,h,i+50);ink(u.ammo?'#cfdfe6':PAPER);
      if(u.ammo)drawShot(u.ammo,x+40,y+h/2,-1.571,15);label(u.n,cx,y+46,25,INK);label(u.d,cx,y+80,13,'#4a3a30')})}
  else if(UI.mode==='rgover'){UI.t+=1/60;dim(Math.min(.9,UI.t*2.2));BTN=[];if(UI.t<.5)return;
    label('防线失守',W/2,360,50,'#e0602a',8);label('坚持到第 '+RG.stage+' 波    总分 '+RG.score,W/2,418,19,LITE);label('最佳纪录：第 '+(save.rg||0)+' 波',W/2,450,16,'#f2d23a');
    btn(W/2-170,494,160,52,'返回','#77787f',home,LITE);btn(W/2+10,494,160,52,'再来一局','#c22a2a',rgStart,LITE)}
  else if(UI.mode==='result'){UI.t+=1/60;dim(Math.min(.88,UI.t*2.2));BTN=[];if(UI.t<.45)return;
    const last=S.lv===LV.length-1,cy=380;
    if(UI.win){label(last?'全部通关！':'过关！',W/2,cy,46,'#e0602a',8);
      for(let i=0;i<3;i++)label('★',W/2+(i-1)*62,cy+78,54,i<UI.st?'#f2d23a':'#4a2a2a',6);
      label('得分 '+S.score+(S.gun?'   防线剩余 '+UI.left:'   剩余导弹 '+UI.left+' 枚'),W/2,cy+124,17,LITE);
      btn(W/2-170,cy+160,160,52,'再打一次','#77787f',()=>load(S.lv),LITE);
      last?btn(W/2+10,cy+160,160,52,'关卡','#c22a2a',menu,LITE):btn(W/2+10,cy+160,160,52,'下一关','#c22a2a',()=>load(S.lv+1),LITE)}
    else{label(S.gun?'防线失守':'导弹打光了',W/2,cy,44,'#e0602a',8);label(S.gun?'炮台被冲垮了，按住别松手，再来一次':'还有 '+UI.n+' 株植物没消灭，换个打法试试',W/2,cy+56,17,LITE);
      btn(W/2-170,cy+100,160,52,'关卡','#77787f',menu,LITE);btn(W/2+10,cy+100,160,52,'重来','#c22a2a',()=>load(S.lv),LITE)}}}
function uiTap(x,y){for(let i=BTN.length-1;i>=0;i--){const b=BTN[i];if(x>=b.x&&x<=b.x+b.w&&y>=b.y&&y<=b.y+b.h){b.fn&&b.fn();return true}}return UI.mode!=='play'}
function draw(){drawWorld();drawUI()}
let acc=0;
function step(dt){if(UI.mode==='menu'||UI.mode==='home'||UI.mode==='about')return;if(S&&S.stop>0){S.stop--;return}let k=1;if(S&&S.slow>0){S.slow-=dt;k=.25}acc+=Math.min(.05,dt)*k;while(acc>=1/60){tick();acc-=1/60}}
load(0);home();
return {step,draw,down,move,up,cancel,setHomeBg(img){homeBg=img},
  // 调试/自动测试用
  debug:{get S(){return S},get RG(){return RG},rgStart,rgPick,rgOffer,UPG,finish,get UI(){return UI},load,fire,tap,tick,down,LV,TG,targets,bodies,set noSave(v){noSave=v},OX,OY,VK,PMAX}};
}
