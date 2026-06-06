(() => {
  const canvas = document.querySelector("#game");
  const ctx = canvas.getContext("2d");
  const ui = {
    clarityValue: document.querySelector("#clarityValue"),
    clarityBar: document.querySelector("#clarityBar"),
    awarenessValue: document.querySelector("#awarenessValue"),
    awarenessBar: document.querySelector("#awarenessBar"),
    scorePill: document.querySelector("#scorePill"),
    actionText: document.querySelector("#actionText"),
    nearestText: document.querySelector("#nearestText"),
    missionText: document.querySelector("#missionText"),
    actionButton: document.querySelector("#actionButton"),
    restartButton: document.querySelector("#restartButton")
  };

  const W = 1280;
  const H = 720;
  const lake = { cx: 642, cy: 375, rx: 495, ry: 255 };
  const recycle = { x: 174, y: 195, r: 42 };
  const keys = new Set();
  const pointer = { active: false, x: 0, y: 0 };
  const trashTypes = [
    { name: "纸杯", color: "#f3f0dc", w: 18, h: 13 },
    { name: "塑料瓶", color: "#c5e8f0", w: 22, h: 10 },
    { name: "包装袋", color: "#e96a4f", w: 20, h: 15 },
    { name: "面包袋", color: "#e3b34c", w: 19, h: 13 }
  ];

  let state;
  let last = performance.now();

  function reset() {
    state = {
      time: 0,
      clarity: 82,
      awareness: 12,
      score: 0,
      targetScore: 12,
      result: "playing",
      cameraShake: 0,
      actionHint: "巡湖中",
      duck: {
        x: 625,
        y: 386,
        vx: 0,
        vy: 0,
        dir: -0.5,
        carrying: null,
        sign: false,
        bob: 0
      },
      ripples: [],
      floatTexts: [],
      thrown: [],
      trash: [
        makeTrash(486, 330, 0),
        makeTrash(710, 470, 1),
        makeTrash(835, 320, 2)
      ],
      visitors: [
        makeVisitor(322, 139, "学生游客", 4.5),
        makeVisitor(552, 112, "小朋友", 7.2),
        makeVisitor(935, 162, "摄影游客", 5.8),
        makeVisitor(1072, 385, "路过游客", 9.4),
        makeVisitor(258, 546, "散步游客", 8.1)
      ]
    };
    updateUi();
  }

  function makeVisitor(x, y, label, timer) {
    return {
      x,
      y,
      label,
      baseX: x,
      baseY: y,
      timer,
      cooldown: 0,
      shame: 0,
      throwWindup: 0,
      nextTarget: null,
      drift: Math.random() * Math.PI * 2
    };
  }

  function makeTrash(x, y, typeIndex) {
    const type = trashTypes[typeIndex % trashTypes.length];
    return {
      id: Math.floor(100 + Math.random() * 900),
      x,
      y,
      vx: (Math.random() - 0.5) * 8,
      vy: (Math.random() - 0.5) * 8,
      type,
      age: 0,
      spin: Math.random() * Math.PI * 2,
      picked: false
    };
  }

  function lakeValue(x, y) {
    return ((x - lake.cx) ** 2) / (lake.rx ** 2) + ((y - lake.cy) ** 2) / (lake.ry ** 2);
  }

  function isWater(x, y) {
    return lakeValue(x, y) < 1;
  }

  function clampToLake(point) {
    const dx = point.x - lake.cx;
    const dy = point.y - lake.cy;
    const v = Math.sqrt((dx * dx) / (lake.rx * lake.rx) + (dy * dy) / (lake.ry * lake.ry));
    if (v <= 0.97) return point;
    return {
      x: lake.cx + dx / v * lake.rx * 0.97,
      y: lake.cy + dy / v * lake.ry * 0.97
    };
  }

  function randomWaterTarget() {
    for (let i = 0; i < 30; i += 1) {
      const x = lake.cx + (Math.random() * 2 - 1) * lake.rx * 0.84;
      const y = lake.cy + (Math.random() * 2 - 1) * lake.ry * 0.82;
      if (isWater(x, y)) return { x, y };
    }
    return { x: lake.cx, y: lake.cy };
  }

  function dist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }

  function addRipple(x, y, color = "rgba(255,255,255,0.58)") {
    state.ripples.push({ x, y, r: 8, a: 1, color });
  }

  function addText(text, x, y, color = "#173638") {
    state.floatTexts.push({ text, x, y, y0: y, a: 1, color });
  }

  function nearestTrash() {
    if (state.trash.length === 0) return null;
    let best = state.trash[0];
    let bestD = dist(state.duck, best);
    for (const item of state.trash) {
      const d = dist(state.duck, item);
      if (d < bestD) {
        best = item;
        bestD = d;
      }
    }
    return { item: best, d: bestD };
  }

  function nearestVisitor() {
    let best = null;
    let bestD = Infinity;
    for (const visitor of state.visitors) {
      const d = dist(state.duck, visitor);
      if (d < bestD) {
        best = visitor;
        bestD = d;
      }
    }
    return { visitor: best, d: bestD };
  }

  function performAction() {
    if (state.result !== "playing") {
      reset();
      return;
    }
    const duck = state.duck;

    if (duck.carrying && dist(duck, recycle) < 74) {
      const cleaned = duck.carrying;
      duck.carrying = null;
      state.score += 1;
      state.clarity = Math.min(100, state.clarity + 4.2);
      addText(`回收 ${cleaned.type.name}`, recycle.x, recycle.y - 46, "#2d8064");
      addRipple(recycle.x, recycle.y, "rgba(86,150,88,0.42)");
      if (state.score === 4 && !duck.sign) {
        duck.sign = true;
        addText("学生递来了小告示牌", duck.x, duck.y - 54, "#b45c12");
      }
      return;
    }

    if (!duck.carrying) {
      const target = nearestTrash();
      if (target && target.d < 50) {
        duck.carrying = target.item;
        state.trash = state.trash.filter((item) => item !== target.item);
        addText(`叼起 ${target.item.type.name}`, duck.x, duck.y - 42, "#315f96");
        addRipple(target.item.x, target.item.y);
        return;
      }
    }

    const nearVisitor = nearestVisitor();
    if (nearVisitor && nearVisitor.d < (duck.sign ? 86 : 60)) {
      const v = nearVisitor.visitor;
      v.cooldown = Math.max(v.cooldown, duck.sign ? 13 : 8);
      v.shame = 2.2;
      v.throwWindup = 0;
      state.awareness = Math.min(100, state.awareness + (duck.sign ? 9 : 5));
      addText(duck.sign ? "请勿投喂与乱丢" : "嘎!", v.x, v.y - 48, "#b33327");
      addRipple(v.x, v.y, "rgba(210,77,63,0.35)");
      return;
    }

    addRipple(duck.x, duck.y);
    addText("嘎", duck.x, duck.y - 34, "#315f96");
  }

  function update(dt) {
    if (state.result !== "playing") {
      updateParticles(dt);
      return;
    }

    state.time += dt;
    state.clarity -= state.trash.length * dt * 0.22;
    state.clarity = Math.max(0, Math.min(100, state.clarity));
    if (state.clarity <= 6) {
      state.result = "lost";
      addText("湖面失守", W / 2, H / 2 - 42, "#b33327");
    }
    if (state.score >= state.targetScore && state.clarity >= 55) {
      state.result = "won";
      addText("未名湖恢复清澈", W / 2, H / 2 - 42, "#2d8064");
    }

    updateDuck(dt);
    updateVisitors(dt);
    updateThrown(dt);
    updateTrash(dt);
    updateParticles(dt);
    updateUi();
  }

  function updateDuck(dt) {
    const duck = state.duck;
    let mx = 0;
    let my = 0;
    if (keys.has("ArrowLeft") || keys.has("a")) mx -= 1;
    if (keys.has("ArrowRight") || keys.has("d")) mx += 1;
    if (keys.has("ArrowUp") || keys.has("w")) my -= 1;
    if (keys.has("ArrowDown") || keys.has("s")) my += 1;

    if (pointer.active) {
      const dx = pointer.x - duck.x;
      const dy = pointer.y - duck.y;
      if (Math.hypot(dx, dy) > 8) {
        mx += dx / Math.max(1, Math.hypot(dx, dy));
        my += dy / Math.max(1, Math.hypot(dx, dy));
      } else {
        pointer.active = false;
      }
    }

    const m = Math.hypot(mx, my);
    if (m > 0) {
      mx /= m;
      my /= m;
      duck.dir = Math.atan2(my, mx);
    }

    const speed = isWater(duck.x, duck.y) ? 185 : 105;
    duck.vx += (mx * speed - duck.vx) * Math.min(1, dt * 9);
    duck.vy += (my * speed - duck.vy) * Math.min(1, dt * 9);
    duck.x += duck.vx * dt;
    duck.y += duck.vy * dt;

    duck.x = Math.max(36, Math.min(W - 36, duck.x));
    duck.y = Math.max(62, Math.min(H - 36, duck.y));
    duck.bob += dt * (m > 0 ? 10 : 4);

    if (duck.carrying) {
      duck.carrying.x = duck.x + Math.cos(duck.dir) * 31;
      duck.carrying.y = duck.y + Math.sin(duck.dir) * 31;
    }

    if (isWater(duck.x, duck.y) && Math.hypot(duck.vx, duck.vy) > 35 && state.time % 0.28 < dt) {
      addRipple(duck.x - Math.cos(duck.dir) * 24, duck.y - Math.sin(duck.dir) * 18);
    }
  }

  function updateVisitors(dt) {
    for (const visitor of state.visitors) {
      visitor.drift += dt;
      visitor.x = visitor.baseX + Math.cos(visitor.drift * 0.7) * 8;
      visitor.y = visitor.baseY + Math.sin(visitor.drift * 0.9) * 5;
      visitor.cooldown = Math.max(0, visitor.cooldown - dt);
      visitor.shame = Math.max(0, visitor.shame - dt);

      if (visitor.cooldown > 0) continue;
      visitor.timer -= dt;
      if (visitor.timer < 1.1 && !visitor.nextTarget) {
        visitor.nextTarget = randomWaterTarget();
        visitor.throwWindup = 1.1;
      }
      if (visitor.throwWindup > 0) {
        visitor.throwWindup -= dt;
      }
      if (visitor.timer <= 0) {
        const target = visitor.nextTarget || randomWaterTarget();
        const typeIndex = Math.floor(Math.random() * trashTypes.length);
        state.thrown.push({
          x: visitor.x,
          y: visitor.y - 16,
          sx: visitor.x,
          sy: visitor.y - 16,
          tx: target.x,
          ty: target.y,
          t: 0,
          typeIndex
        });
        visitor.timer = 6 + Math.random() * 7 + state.awareness * 0.035;
        visitor.nextTarget = null;
        visitor.throwWindup = 0;
      }
    }
  }

  function updateThrown(dt) {
    for (const item of state.thrown) {
      item.t += dt * 1.45;
      const t = Math.min(1, item.t);
      const arc = Math.sin(t * Math.PI) * 84;
      item.x = item.sx + (item.tx - item.sx) * t;
      item.y = item.sy + (item.ty - item.sy) * t - arc;
      if (t >= 1) {
        state.trash.push(makeTrash(item.tx, item.ty, item.typeIndex));
        addRipple(item.tx, item.ty, "rgba(210,77,63,0.38)");
        state.cameraShake = 0.16;
      }
    }
    state.thrown = state.thrown.filter((item) => item.t < 1);
    state.cameraShake = Math.max(0, state.cameraShake - dt);
  }

  function updateTrash(dt) {
    for (const item of state.trash) {
      item.age += dt;
      item.spin += dt * 1.3;
      item.x += item.vx * dt;
      item.y += item.vy * dt;
      item.vx += Math.sin(item.age * 1.7 + item.id) * dt * 3;
      item.vy += Math.cos(item.age * 1.3 + item.id) * dt * 2;
      item.vx *= 0.985;
      item.vy *= 0.985;
      if (!isWater(item.x, item.y)) {
        const p = clampToLake(item);
        item.x = p.x;
        item.y = p.y;
        item.vx *= -0.4;
        item.vy *= -0.4;
      }
    }
  }

  function updateParticles(dt) {
    for (const ripple of state.ripples) {
      ripple.r += dt * 66;
      ripple.a -= dt * 1.15;
    }
    state.ripples = state.ripples.filter((ripple) => ripple.a > 0);

    for (const text of state.floatTexts) {
      text.y -= dt * 28;
      text.a -= dt * 0.78;
    }
    state.floatTexts = state.floatTexts.filter((text) => text.a > 0);
  }

  function updateUi() {
    const clarity = Math.round(state.clarity);
    const awareness = Math.round(state.awareness);
    ui.clarityValue.textContent = `${clarity}%`;
    ui.awarenessValue.textContent = `${awareness}%`;
    ui.clarityBar.style.width = `${clarity}%`;
    ui.awarenessBar.style.width = `${awareness}%`;
    ui.scorePill.textContent = `清理 ${state.score} / ${state.targetScore}`;

    if (state.result === "won") {
      ui.actionText.textContent = "湖面已守住";
      ui.missionText.textContent = "Demo 完成";
      ui.nearestText.textContent = "全部处理";
      ui.actionButton.textContent = "再玩一次";
      return;
    }
    if (state.result === "lost") {
      ui.actionText.textContent = "水质过低";
      ui.missionText.textContent = "需要更快清理";
      ui.nearestText.textContent = "污染扩散";
      ui.actionButton.textContent = "重新开始";
      return;
    }

    const duck = state.duck;
    const nearTrash = nearestTrash();
    const nearVisitor = nearestVisitor();
    let action = "巡湖中";
    if (duck.carrying && dist(duck, recycle) < 74) action = "投放到回收点";
    else if (duck.carrying) action = `叼着${duck.carrying.type.name}`;
    else if (nearTrash && nearTrash.d < 50) action = `拾取${nearTrash.item.type.name}`;
    else if (nearVisitor && nearVisitor.d < (duck.sign ? 86 : 60)) action = duck.sign ? "举牌提醒游客" : "鸣叫提醒游客";
    ui.actionText.textContent = action;
    ui.actionButton.textContent = action === "巡湖中" ? "鸣叫" : "行动";

    if (nearTrash) {
      ui.nearestText.textContent = `${regionName(nearTrash.item)}  X${Math.round(nearTrash.item.x)} Y${Math.round(nearTrash.item.y)}`;
    } else {
      ui.nearestText.textContent = "未发现";
    }

    if (!duck.sign && state.score >= 4) {
      ui.missionText.textContent = "告示牌已解锁";
    } else if (duck.carrying) {
      ui.missionText.textContent = "送到左上岸边回收点";
    } else if (state.trash.length > 0) {
      ui.missionText.textContent = "定位并清理漂浮垃圾";
    } else {
      ui.missionText.textContent = "盯住岸边游客";
    }
  }

  function regionName(item) {
    const dx = item.x - lake.cx;
    const dy = item.y - lake.cy;
    if (Math.abs(dx) < 145 && Math.abs(dy) < 80) return "湖心";
    if (dy < -80) return dx < 0 ? "西北水域" : "东北水域";
    if (dy > 95) return dx < 0 ? "西南水域" : "东南水域";
    return dx < 0 ? "西侧水域" : "东侧水域";
  }

  function draw() {
    ctx.save();
    ctx.clearRect(0, 0, W, H);
    if (state.cameraShake > 0) {
      ctx.translate((Math.random() - 0.5) * state.cameraShake * 18, (Math.random() - 0.5) * state.cameraShake * 18);
    }
    drawWorld();
    drawRipples();
    drawVisitors();
    drawThrown();
    drawTrash();
    drawDuck();
    drawFloatTexts();
    drawOverlay();
    ctx.restore();
  }

  function drawWorld() {
    const clarity = state.clarity / 100;
    ctx.fillStyle = "#d7e0ba";
    ctx.fillRect(0, 0, W, H);

    drawPath();
    drawBridge();
    drawTrees();

    const waterGradient = ctx.createRadialGradient(lake.cx - 80, lake.cy - 80, 80, lake.cx, lake.cy, 570);
    waterGradient.addColorStop(0, mix("#9dd9d7", "#7fa7a8", 1 - clarity));
    waterGradient.addColorStop(1, mix("#4ea3b6", "#596f74", 1 - clarity));
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(lake.cx, lake.cy, lake.rx, lake.ry, -0.03, 0, Math.PI * 2);
    ctx.fillStyle = waterGradient;
    ctx.fill();
    ctx.clip();
    drawWaterLines(clarity);
    drawLotus();
    ctx.restore();

    ctx.lineWidth = 16;
    ctx.strokeStyle = "rgba(234, 216, 153, 0.8)";
    ctx.beginPath();
    ctx.ellipse(lake.cx, lake.cy, lake.rx + 8, lake.ry + 8, -0.03, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(55, 95, 83, 0.2)";
    ctx.stroke();

    drawIsland();
    drawRecycle();
    drawMiniMap();
  }

  function drawPath() {
    ctx.strokeStyle = "#c6ae73";
    ctx.lineWidth = 32;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(60, 158);
    ctx.bezierCurveTo(250, 96, 465, 76, 657, 92);
    ctx.bezierCurveTo(886, 111, 1110, 158, 1195, 318);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(90, 600);
    ctx.bezierCurveTo(270, 535, 390, 612, 558, 626);
    ctx.bezierCurveTo(830, 650, 1000, 595, 1180, 516);
    ctx.stroke();
  }

  function drawBridge() {
    ctx.save();
    ctx.translate(985, 505);
    ctx.rotate(-0.18);
    ctx.fillStyle = "#b96d42";
    ctx.fillRect(-108, -11, 216, 22);
    ctx.fillStyle = "#853f2d";
    for (let x = -96; x <= 96; x += 24) {
      ctx.fillRect(x, -22, 5, 44);
    }
    ctx.restore();
  }

  function drawTrees() {
    const trees = [
      [92, 110, 35], [142, 115, 25], [1170, 198, 34], [1140, 444, 27],
      [90, 565, 32], [340, 664, 28], [720, 52, 25], [1034, 88, 30],
      [426, 75, 26], [1115, 605, 35], [214, 606, 23]
    ];
    for (const [x, y, r] of trees) {
      ctx.fillStyle = "#5f8f43";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#416c39";
      ctx.beginPath();
      ctx.arc(x - r * 0.35, y + r * 0.1, r * 0.65, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "#9f5a38";
    ctx.fillRect(86, 122, 12, 30);
    ctx.fillRect(1165, 211, 13, 32);
  }

  function drawWaterLines(clarity) {
    ctx.lineWidth = 2;
    for (let i = 0; i < 28; i += 1) {
      const y = 154 + i * 18 + Math.sin(state.time * 0.9 + i) * 3;
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + clarity * 0.13})`;
      ctx.beginPath();
      for (let x = 140; x < 1140; x += 40) {
        const yy = y + Math.sin(x * 0.018 + state.time * 1.4 + i) * 5;
        if (x === 140) ctx.moveTo(x, yy);
        else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawLotus() {
    const pads = [[362, 365], [405, 406], [798, 245], [852, 284], [742, 555], [690, 530]];
    for (const [x, y] of pads) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(Math.sin(state.time + x) * 0.2);
      ctx.fillStyle = "#4f9968";
      ctx.beginPath();
      ctx.ellipse(0, 0, 19, 11, 0.2, 0.2, Math.PI * 1.92);
      ctx.lineTo(0, 0);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawIsland() {
    ctx.fillStyle = "#d2c27d";
    ctx.beginPath();
    ctx.ellipse(650, 360, 88, 42, -0.08, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#668f3c";
    ctx.beginPath();
    ctx.arc(620, 344, 24, 0, Math.PI * 2);
    ctx.arc(675, 346, 29, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#b24d32";
    ctx.fillRect(638, 327, 28, 42);
    ctx.fillStyle = "#753423";
    ctx.beginPath();
    ctx.moveTo(632, 327);
    ctx.lineTo(652, 303);
    ctx.lineTo(672, 327);
    ctx.closePath();
    ctx.fill();
  }

  function drawRecycle() {
    ctx.save();
    ctx.translate(recycle.x, recycle.y);
    ctx.fillStyle = "rgba(45,128,100,0.16)";
    ctx.beginPath();
    ctx.arc(0, 0, recycle.r + 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2d8064";
    ctx.fillRect(-28, -22, 56, 48);
    ctx.fillStyle = "#e9f5e9";
    ctx.fillRect(-34, -31, 68, 10);
    ctx.fillStyle = "#173638";
    ctx.font = "800 15px system-ui";
    ctx.textAlign = "center";
    ctx.fillText("回收点", 0, 52);
    ctx.restore();
  }

  function drawMiniMap() {
    const x = 1072;
    const y = 30;
    const w = 160;
    const h = 98;
    ctx.save();
    ctx.fillStyle = "rgba(255,255,251,0.72)";
    roundRect(x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = "rgba(22,48,46,0.15)";
    ctx.stroke();
    ctx.translate(x, y);
    ctx.fillStyle = "rgba(79,163,182,0.45)";
    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2 + 8, 64, 32, -0.03, 0, Math.PI * 2);
    ctx.fill();
    for (const item of state.trash) {
      const p = miniPos(item, w, h);
      ctx.fillStyle = "#d24d3f";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const d = miniPos(state.duck, w, h);
    ctx.fillStyle = "#173638";
    ctx.beginPath();
    ctx.arc(d.x, d.y, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#52635f";
    ctx.font = "800 11px system-ui";
    ctx.textAlign = "left";
    ctx.fillText("位置雷达", 10, 17);
    ctx.restore();
  }

  function miniPos(item, w, h) {
    return {
      x: 80 + (item.x - lake.cx) / lake.rx * 64,
      y: 57 + (item.y - lake.cy) / lake.ry * 32
    };
  }

  function drawRipples() {
    for (const ripple of state.ripples) {
      ctx.strokeStyle = ripple.color.replace(/[\d.]+\)$/u, `${Math.max(0, ripple.a * 0.55)})`);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ripple.x, ripple.y, ripple.r, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawVisitors() {
    for (const visitor of state.visitors) {
      const warned = visitor.cooldown > 0;
      const winding = visitor.throwWindup > 0;
      ctx.save();
      ctx.translate(visitor.x, visitor.y);
      ctx.fillStyle = "rgba(22,48,46,0.12)";
      ctx.beginPath();
      ctx.ellipse(0, 29, 18, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = warned ? "#6a9b5a" : "#315f96";
      ctx.fillRect(-10, 0, 20, 31);
      ctx.fillStyle = "#f0c59b";
      ctx.beginPath();
      ctx.arc(0, -11, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#263d3d";
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-8, 8);
      ctx.lineTo(winding ? -24 : -17, 18);
      ctx.moveTo(8, 8);
      ctx.lineTo(winding ? 26 : 17, 18);
      ctx.stroke();
      ctx.fillStyle = "#273c3d";
      ctx.fillRect(-12, 31, 7, 22);
      ctx.fillRect(5, 31, 7, 22);
      if (winding) {
        ctx.fillStyle = "#d24d3f";
        ctx.beginPath();
        ctx.arc(0, -36, 13, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = "900 18px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("!", 0, -30);
      }
      if (visitor.shame > 0) {
        ctx.fillStyle = "rgba(255,255,251,0.92)";
        roundRect(-44, -64, 88, 24, 8);
        ctx.fill();
        ctx.fillStyle = "#b33327";
        ctx.font = "800 12px system-ui";
        ctx.textAlign = "center";
        ctx.fillText("知道了", 0, -48);
      }
      ctx.restore();
    }
  }

  function drawThrown() {
    for (const item of state.thrown) {
      drawTrashShape(item.x, item.y, trashTypes[item.typeIndex], item.t * Math.PI * 4);
    }
  }

  function drawTrash() {
    const nearest = nearestTrash();
    for (const item of state.trash) {
      const isNearest = nearest && nearest.item === item;
      if (isNearest) {
        ctx.strokeStyle = "rgba(210,77,63,0.9)";
        ctx.lineWidth = 3;
        ctx.setLineDash([6, 7]);
        ctx.beginPath();
        ctx.arc(item.x, item.y, 28 + Math.sin(state.time * 5) * 3, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      drawTrashShape(item.x, item.y, item.type, item.spin);
      ctx.fillStyle = isNearest ? "#b33327" : "rgba(22,48,46,0.62)";
      ctx.font = "800 12px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(`X${Math.round(item.x)} Y${Math.round(item.y)}`, item.x, item.y - 24);
    }
  }

  function drawTrashShape(x, y, type, spin) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(spin * 0.25);
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    ctx.beginPath();
    ctx.ellipse(2, 8, type.w * 0.7, 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = type.color;
    roundRect(-type.w / 2, -type.h / 2, type.w, type.h, 4);
    ctx.fill();
    ctx.strokeStyle = "rgba(22,48,46,0.28)";
    ctx.stroke();
    ctx.restore();
  }

  function drawDuck() {
    const duck = state.duck;
    ctx.save();
    ctx.translate(duck.x, duck.y + Math.sin(duck.bob) * 2);
    ctx.rotate(duck.dir);
    ctx.fillStyle = "rgba(22,48,46,0.12)";
    ctx.beginPath();
    ctx.ellipse(-4, 20, 34, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f1d85a";
    ctx.beginPath();
    ctx.ellipse(0, 0, 30, 20, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f6e980";
    ctx.beginPath();
    ctx.arc(23, -12, 17, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#e06f2a";
    ctx.beginPath();
    ctx.moveTo(38, -11);
    ctx.lineTo(55, -4);
    ctx.lineTo(38, 1);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#263d3d";
    ctx.beginPath();
    ctx.arc(27, -17, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d4ba32";
    ctx.beginPath();
    ctx.ellipse(-12, 2, 17, 10, -0.35, 0, Math.PI * 2);
    ctx.fill();

    if (duck.sign) {
      ctx.save();
      ctx.rotate(-duck.dir);
      ctx.fillStyle = "#fff7dc";
      ctx.strokeStyle = "#8d5d2e";
      ctx.lineWidth = 3;
      roundRect(-30, -58, 70, 34, 5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#b33327";
      ctx.font = "900 13px system-ui";
      ctx.textAlign = "center";
      ctx.fillText("护湖", 5, -37);
      ctx.restore();
    }
    ctx.restore();

    if (duck.carrying) {
      drawTrashShape(duck.carrying.x, duck.carrying.y, duck.carrying.type, state.time * 6);
    }
  }

  function drawFloatTexts() {
    for (const text of state.floatTexts) {
      ctx.globalAlpha = Math.max(0, text.a);
      ctx.fillStyle = text.color;
      ctx.font = "900 18px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(text.text, text.x, text.y);
      ctx.globalAlpha = 1;
    }
  }

  function drawOverlay() {
    if (state.result === "playing") return;
    ctx.save();
    ctx.fillStyle = "rgba(16, 34, 34, 0.42)";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = "#fffffb";
    roundRect(W / 2 - 210, H / 2 - 90, 420, 180, 8);
    ctx.fill();
    ctx.fillStyle = state.result === "won" ? "#2d8064" : "#b33327";
    ctx.font = "900 32px system-ui";
    ctx.textAlign = "center";
    ctx.fillText(state.result === "won" ? "未名湖守住了" : "湖水被污染了", W / 2, H / 2 - 28);
    ctx.fillStyle = "#52635f";
    ctx.font = "800 17px system-ui";
    ctx.fillText(`清理 ${state.score} 件垃圾  游客意识 ${Math.round(state.awareness)}%`, W / 2, H / 2 + 12);
    ctx.fillText("按 Space 或点击行动按钮重开", W / 2, H / 2 + 48);
    ctx.restore();
  }

  function mix(a, b, t) {
    const ca = hexToRgb(a);
    const cb = hexToRgb(b);
    const m = ca.map((v, i) => Math.round(v + (cb[i] - v) * t));
    return `rgb(${m[0]},${m[1]},${m[2]})`;
  }

  function hexToRgb(hex) {
    return [
      Number.parseInt(hex.slice(1, 3), 16),
      Number.parseInt(hex.slice(3, 5), 16),
      Number.parseInt(hex.slice(5, 7), 16)
    ];
  }

  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
  }

  function toCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / rect.width * W,
      y: (event.clientY - rect.top) / rect.height * H
    };
  }

  window.addEventListener("keydown", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", " ", "Spacebar", "w", "a", "s", "d"].includes(key)) {
      event.preventDefault();
    }
    if (key === " " || key === "Spacebar") performAction();
    else keys.add(key);
  });

  window.addEventListener("keyup", (event) => {
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    keys.delete(key);
  });

  canvas.addEventListener("pointerdown", (event) => {
    const p = toCanvasPoint(event);
    pointer.active = true;
    pointer.x = p.x;
    pointer.y = p.y;
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!pointer.active || event.buttons === 0) return;
    const p = toCanvasPoint(event);
    pointer.x = p.x;
    pointer.y = p.y;
  });

  ui.actionButton.addEventListener("click", performAction);
  ui.restartButton.addEventListener("click", reset);

  function loop(now) {
    const dt = Math.min(0.033, (now - last) / 1000 || 0);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(loop);
  }

  reset();
  requestAnimationFrame(loop);
})();
