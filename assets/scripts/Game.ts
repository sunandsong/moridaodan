import {
    _decorator, Component, Node, director, Director, Sprite, SpriteFrame, Texture2D,
    ImageAsset, UITransform, input, Input, EventTouch, sys, view, resources,
} from 'cc';
import { EDITOR } from 'cc/env';
import { createGame } from './GameCore';

const { ccclass } = _decorator;

/** 设计分辨率（竖屏），要和 项目设置 → 项目数据 → 设计宽高 保持一致 */
const W = 540;
const H = 960;
/** 离屏画布的清晰度倍数：2 最清晰；低端机卡顿时可以改成 1.5 或 1 */
const SCALE = 2;

/**
 * 把 GameCore 画出来的离屏画布显示成一张全屏贴图，并把触摸事件转发给它。
 * 这个组件不需要手动挂到场景里，见文件末尾的自动挂载。
 */
@ccclass('Game')
export class Game extends Component {
    private game: any = null;
    private canvasEl: HTMLCanvasElement = null!;
    private tex: Texture2D = null!;

    start() {
        const cv = document.createElement('canvas');
        cv.width = W * SCALE;
        cv.height = H * SCALE;
        this.canvasEl = cv;

        this.game = createGame({
            canvas: cv,
            scale: SCALE,
            storage: {
                get: (k: string) => sys.localStorage.getItem(k),
                set: (k: string, v: string) => sys.localStorage.setItem(k, v),
            },
        });
        this.game.draw();
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
