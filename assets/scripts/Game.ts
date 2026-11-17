import {
    _decorator, Component, Node, director, Director, Sprite, SpriteFrame, Texture2D,
    ImageAsset, UITransform, input, Input, EventTouch, sys, view, resources, AudioClip, AudioSource,
} from 'cc';
import { EDITOR } from 'cc/env';
import { createGame } from './GameCore';

const { ccclass } = _decorator;

/** 设计分辨率（竖屏），要和 项目设置 → 项目数据 → 设计宽高 保持一致 */
const W = 540;
const H = 960;
/** 离屏画布的清晰度倍数：2 最清晰；低端机卡顿时可以改成 1.5 或 1 */
const SCALE = 2;
/** 背景音乐的音量（0~1） */
const MUSIC_VOL = 0.35;
/** 各个音效的音量（0~1），没写的是 1 */
const VOL: Record<string, number> = { shoot: 0.3, hit: 0.5, splat: 0.6, click: 0.6, launch: 0.7 };

/**
 * 把 GameCore 画出来的离屏画布显示成一张全屏贴图，并把触摸事件转发给它。
 * 这个组件不需要手动挂到场景里，见文件末尾的自动挂载。
 */
@ccclass('Game')
export class Game extends Component {
    private game: any = null;
    private canvasEl: HTMLCanvasElement = null!;
    private tex: Texture2D = null!;
    private clips: Record<string, AudioClip> = {};
    private lastPlay: Record<string, number> = {};
    private audio: AudioSource = null!;
    private music: AudioSource | null = null;

    start() {
        const cv = document.createElement('canvas');
        cv.width = W * SCALE;
        cv.height = H * SCALE;
        this.canvasEl = cv;

        this.game = createGame({
            canvas: cv,
            scale: SCALE,
            // 音效：同一个声音 60 毫秒内只响一次，免得一帧里几十只虫子同时死把喇叭炸了
            sfx: (n: string) => {
                const c = this.clips[n], now = performance.now();
                if (!c || now - (this.lastPlay[n] || 0) < 60) return;
                this.lastPlay[n] = now;
                this.audio.playOneShot(c, VOL[n] ?? 1);
            },
            storage: {
                get: (k: string) => sys.localStorage.getItem(k),
                set: (k: string, v: string) => sys.localStorage.setItem(k, v),
            },
        });
        this.game.draw();
        // 音效：assets/resources/sfx/ 下的文件，文件名就是 GameCore 里 sfx('名字') 的名字
        this.audio = this.node.addComponent(AudioSource);
        resources.loadDir('sfx', AudioClip, (err, list) => { if (!err) for (const c of list) this.clips[c.name] = c; });
        // 背景音乐：assets/resources/music/battle.mp3，只在战斗中循环播放（见 update）
        resources.load('music/battle', AudioClip, (err, clip) => {
            if (err) return;
            const m = this.music = this.node.addComponent(AudioSource);
            m.clip = clip; m.loop = true; m.volume = MUSIC_VOL;
        });
        // 首页背景图：assets/resources/title-screen-background.png
        resources.load('title-screen-background', ImageAsset, (err, img) => { if (!err) this.game.setHomeBg(img.data); });

        const tex = new Texture2D();
        tex.image = new ImageAsset(cv);
        this.tex = tex;
        const sf = new SpriteFrame();
        sf.texture = tex;

        const sp = this.node.addComponent(Sprite);
        sp.sizeMode = Sprite.SizeMode.CUSTOM;
        sp.spriteFrame = sf;
        this.node.getComponent(UITransform)!.setContentSize(W, H);

        input.on(Input.EventType.TOUCH_START, this.onDown, this);
        input.on(Input.EventType.TOUCH_MOVE, this.onMove, this);
        input.on(Input.EventType.TOUCH_END, this.onUp, this);
        input.on(Input.EventType.TOUCH_CANCEL, this.onCancel, this);

        // 方便在浏览器控制台里调试
        (globalThis as any).TS = this.game.debug;
    }

    onDestroy() {
        input.off(Input.EventType.TOUCH_START, this.onDown, this);
        input.off(Input.EventType.TOUCH_MOVE, this.onMove, this);
        input.off(Input.EventType.TOUCH_END, this.onUp, this);
        input.off(Input.EventType.TOUCH_CANCEL, this.onCancel, this);
    }

    update(dt: number) {
        this.game.step(dt);
        // 背景音乐只在战斗中响：首页、选关、结算、三选一界面都停掉，下一场战斗从头放
        const m = this.music;
        if (m) { const on = this.game.inBattle(); if (on && !m.playing) m.play(); else if (!on && m.playing) m.stop(); }
        this.game.draw();
        this.tex.uploadData(this.canvasEl);
    }

    /** Cocos 的界面坐标原点在左下，GameCore 用的是左上，这里换算一下 */
    private pt(e: EventTouch) {
        const p = e.getUILocation();
        const vs = view.getVisibleSize();
        return { x: p.x - (vs.width - W) / 2, y: H - (p.y - (vs.height - H) / 2) };
    }
    private onDown(e: EventTouch) { const p = this.pt(e); this.game.down(p.x, p.y); }
    private onMove(e: EventTouch) { const p = this.pt(e); this.game.move(p.x, p.y); }
    private onUp() { this.game.up(); }
    private onCancel() { this.game.cancel(); }
}

// 自动挂载：场景加载完后，在 Canvas 下面建一个 Game 节点并挂上组件。
// 这样场景文件保持最简单（只有 Canvas 和 Camera），不用在编辑器里手动拖脚本。
if (!EDITOR) {
    director.on(Director.EVENT_AFTER_SCENE_LAUNCH, () => {
        const canvas = director.getScene()?.getChildByName('Canvas');
        if (!canvas || canvas.getChildByName('Game')) return;
        const node = new Node('Game');
        node.layer = canvas.layer;
        canvas.addChild(node);
        node.addComponent(Game);
    });
}
