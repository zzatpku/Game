# 未名湖守护鸭 Demo

这是根据 `game.txt` 做的迷你可玩演示版。玩家控制一只生活在未名湖的鸭子，处理游客投放到湖里的垃圾，并通过鸣叫或告示牌提醒游客。

## 运行

当前版本使用 Three.js ES module 渲染 3D 场景，建议在当前目录运行本地 HTTP 服务：

```sh
python3 -m http.server 5173
```

然后访问 `http://localhost:5173`。

## 操作

- 第一人称移动：`W` 前进、`S` 后退，`A/D` 或鼠标拖动画面转向。
- 横移：`Q/E`。
- 冲刺：按住 `Shift` 消耗体力加速，松开后会自动恢复。
- 鼠标锁定：点击游戏画面进入第一人称鼠标视角，按 `Esc` 退出。
- 行动/鸣叫：`Space` 或右侧“行动”按钮。
- 靠近垃圾时行动会叼起垃圾；叼着垃圾靠近左上角回收点时行动会投放。
- 鸣叫会产生声波，范围内的游客会被提醒。清理 4 件垃圾后会解锁“护湖”告示牌，提醒范围和效果更强。
- 清理 10 件垃圾后会暂停并选择一次升级：一次携带 2 件、体力上限提高，或增强鸣叫范围。

## 演示重点

- 岸边游客会周期性向湖面投放垃圾。
- 最近垃圾会在湖面高亮，并显示坐标位置。
- 红色垃圾是污染热点，污染更快，但优先清理可以获得更高的清澈度回复。
- 连续快速把垃圾送到回收点会触发连击奖励。
- Demo 当前目标是清理 14 件垃圾；清理到 10 件时会获得一次升级，帮助完成最后阶段。
- 鸣叫使用本地真实鸭叫素材；水中划水使用 `assets/water.mov` 抽出的本地片段；陆地脚步、桥面脚步和岛上脚步使用本地 WAV 样本；背景有轻微风声和鸟鸣。
- 垃圾越多，湖水清澈度下降越快；清理垃圾和提醒游客会改变 HUD 指标，形成可展示的玩法闭环。

## 音频素材

- `assets/mallard-quack.m4a` 是从 Wikimedia Commons: `Anas platyrhynchos - Mallard - XC62258.ogg` 中剪出的鸭叫片段。
- 录音者：Jonathon Jongsma。
- 许可证：Creative Commons Attribution-Share Alike 3.0 Unported。
- 使用方式：本 demo 使用剪辑后的本地 M4A 片段作为鸭子鸣叫。
- 原始页面：https://commons.wikimedia.org/wiki/File:Anas_platyrhynchos_-_Mallard_-_XC62258.ogg
- `assets/water.mov` 是水中划水声来源，`assets/water-paddle.mp3` 是从该文件抽出的浏览器兼容版本。
- `assets/footstep-*.wav` 是本地生成的短样本，用于陆地、桥面和岛上移动脚步声；浏览器加载失败时会自动回退到合成音效。
- `assets/ambient-breeze-birds.m4a` 转自 Wikimedia Commons 的 `Gentle breeze and birds singing.ogg`，作者 ezwa，public domain。原始页面：https://commons.wikimedia.org/wiki/File:Gentle_breeze_and_birds_singing.ogg
