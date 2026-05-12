// ═══════════════════════════════════════════════════════════
//  Chapter 13 — 即時影像 + 飾品模式（耳環辨識）
//
//  偵測模式：黃色三角網格疊在臉上

//            手往右 → face1 ｜ 手往左 → face2
// ═══════════════════════════════════════════════════════════

// ── 顯示模式 ───────────────────────────────────────────────
let displayMode     = 'detect';   // detect | accessory
let currentEarring  = 0;

// ── 攝影機 & 系統 ──────────────────────────────────────────
let capture;
let pulseT   = 0;
let camReady = false;
let noiseTexture;



// ── ml5 FaceMesh ───────────────────────────────────────────
let faceMesh;
let faces    = [];
let triangles;
let uvCoords;

// ── ml5 HandPose ───────────────────────────────────────────
let handPose;
let hands       = [];


// ── 臉譜圖片 ───────────────────────────────────────────────
let earringImgs = []; // 五種耳環圖片

// 只有一個 currentEarring，不要重複宣告
// let currentEarring = 0;   <-- 已移除重複宣告
let detectedFingerCount = 0;

// ── preload ────────────────────────────────────────────────
function preload() {

  faceMesh = ml5.faceMesh({
    maxFaces: 1,
    flipped: false
  });

  handPose = ml5.handPose({
    flipped: false
  });

  // 五種耳環
  earringImgs[0] = loadImage('耳環1.png');
  earringImgs[1] = loadImage('耳環2.png');
  earringImgs[2] = loadImage('耳環3.png');
  earringImgs[3] = loadImage('耳環4.png');
  earringImgs[4] = loadImage('耳環5.png');
}

function gotFaces(results) { faces = results; }
function gotHands(results) { hands = results; }

function detectFingerCount() {

  if (hands.length === 0) {
    detectedFingerCount = 0;
    return;
  }

  const hand = hands[0];

  let count = 0;

  // =========================
  // 大拇指（X方向判斷）
  // =========================
  const thumbTip = hand.keypoints[4];
  const thumbIP  = hand.keypoints[3];

  // 鏡像後方向修正
  if (thumbTip.x < thumbIP.x - 10) {
    count++;
  }

  // =========================
  // 其他四根（Y方向）
  // =========================
  const tips = [8, 12, 16, 20];
  const pips = [6, 10, 14, 18];

  for (let i = 0; i < tips.length; i++) {

    const tip = hand.keypoints[tips[i]];
    const pip = hand.keypoints[pips[i]];

    if (tip.y < pip.y - 15) {
      count++;
    }
  }

  // 儲存偵測結果
  detectedFingerCount = count;

  // 只有 1~5 才切換耳環
  if (count >= 1 && count <= 5) {
    currentEarring = count - 1;
  }
}

// ── setup ──────────────────────────────────────────────────
async function setup() {
  
  // WEBGL 模式：支援 UV 貼圖 texture()
  createCanvas(windowWidth, windowHeight);
  frameRate(60);

  const hasCamera = await checkHasCamera();

  if (hasCamera) {
    capture = createCapture(VIDEO, () => {
      camReady  = true;
      faceMesh.detectStart(capture, gotFaces);
      handPose.detectStart(capture, gotHands);
       
      triangles = faceMesh.getTriangles();
      uvCoords  = faceMesh.getUVCoords();
    });
    capture.size(windowWidth, windowHeight);
    capture.hide();

  } else {
    // 備用影片 fallback
    capture = createVideo('video.mp4');
    
    capture.hide();
    capture.loop();

    capture.elt.addEventListener('canplay', () => {
      if (!camReady) {
        capture.elt.play().catch(e => console.log('自動播放被阻擋:', e));
        camReady  = true;
        faceMesh.detectStart(capture, gotFaces);
        handPose.detectStart(capture, gotHands);
         
        triangles = faceMesh.getTriangles();
        uvCoords  = faceMesh.getUVCoords();
      }
    }, { once: true });

    setTimeout(() => {
      if (!camReady) {
        try {
          capture.play();
          camReady  = true;
          faceMesh.detectStart(capture, gotFaces);
          handPose.detectStart(capture, gotHands);
           
          triangles = faceMesh.getTriangles();
          uvCoords  = faceMesh.getUVCoords();
        } catch(e) {}
      }
    }, 800);
  }

  noiseTexture = createGraphics(windowWidth, windowHeight);
  generateNoiseTexture();
  initModeButton();
}

async function checkHasCamera() {
  if (!navigator.mediaDevices?.enumerateDevices) return false;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.some(d => d.kind === 'videoinput');
  } catch(e) { return false; }
}

// ── draw ───────────────────────────────────────────────────
function draw() {
  // WEBGL 原點在畫面中心，平移到左上角與 2D 行為一致
  

  background('#297BB2');
  pulseT += 0.035;

  if (!camReady) { drawWaiting(); return; }
  if (capture.elt?.paused) { try { capture.play(); } catch(e){} }

  // 影像框（畫面中央 70%）
  const BOX_W = width  * 0.70;
  const BOX_H = height * 0.70;
  const BOX_X = (width  - BOX_W) / 2;
  const BOX_Y = (height - BOX_H) / 2;

  const vw = capture.width;
  const vh = capture.height;
  const { x, y, w, h } = fitKeepRatio(vw, vh, BOX_W, BOX_H, BOX_X, BOX_Y);

  // 光暈底框
  drawGlow(x, y, w, h);

  // 手動鏡像影像（flipped: false → 用 scale(-1,1) 翻轉）
  push();
  translate(x + w, y);
  scale(-1, 1);
  image(capture, 0, 0, w, h);
  pop();

  detectFingerCount();

  // 臉部效果
  if (displayMode === 'detect') {

    drawFaceMeshDetect(x, y, w, h, vw, vh);

  } else {

    drawEarrings(x, y, w, h, vw, vh);

  }

  // 雜訊材質疊層
  push(); blendMode(MULTIPLY); image(noiseTexture, 0, 0, width, height); pop();

  // 影像外框
  noFill(); stroke(255, 255, 255, 80); strokeWeight(1); rect(x, y, w, h, 4);

  // 狀態列
  drawStatusBar();

  // 學號與名字
  noStroke(); fill(255);
  textAlign(CENTER); textSize(18); textFont('serif');
  fill(255);
  noStroke();

  textAlign(CENTER, CENTER);

  textSize(24);
  text(
    "414730019王曜嘉",
    width / 2,
    40
  );

  textSize(18);
  text(
    `偵測到手指數量：${detectedFingerCount}`,
    width / 2,
    72
  );
}

// ── 手勢偵測：左右滑動切換臉譜 ────────────────────────────
// flipped:false → wrist.x 是原始（未翻轉）座標
// 鏡像後螢幕 X = vw - wrist.x；往右移動時螢幕 X 增加


// ── 偵測模式：像素採樣填色 + 黃色網格線 ───────────────────
function drawFaceMeshDetect(x, y, w, h, vw, vh) {
  if (faces.length === 0 || !triangles) return;

  const face = faces[0];
  if (frameCount % 2 === 0) {
    capture.loadPixels();
  }
  if (!capture.pixels || capture.pixels.length === 0) return;

  beginShape(TRIANGLES);
  for (let i = 0; i < triangles.length; i++) {
    const [a, b, c] = triangles[i];
    const pA = face.keypoints[a];
    const pB = face.keypoints[b];
    const pC = face.keypoints[c];

    // 三角形重心採樣像素顏色
    const cx  = (pA.x + pB.x + pC.x) / 3;
    const cy  = (pA.y + pB.y + pC.y) / 3;
    const idx = (floor(cx) + floor(cy) * vw) * 4;
    const rr  = capture.pixels[idx]     || 0;
    const gg  = capture.pixels[idx + 1] || 0;
    const bb  = capture.pixels[idx + 2] || 0;

    stroke(255, 230, 0, 120);
    strokeWeight(0.8);
    noFill();

    // 映射到畫布框（X 鏡像）
    vertex(x + w - (pA.x / vw) * w,  y + (pA.y / vh) * h);
    vertex(x + w - (pB.x / vw) * w,  y + (pB.y / vh) * h);
    vertex(x + w - (pC.x / vw) * w,  y + (pC.y / vh) * h);
  }
  endShape();
}

// ── 飾品模式：耳環偵測 ─────────────────────────────
function drawEarrings(x, y, w, h, vw, vh) {

  if (faces.length === 0) return;

  const face = faces[0];

  // MediaPipe FaceMesh 耳朵 landmark
  // 左耳垂附近
  const leftEar  = face.keypoints[177];

  // 右耳垂附近
  const rightEar = face.keypoints[401];

  if (!leftEar || !rightEar) return;

  const img = earringImgs[currentEarring];

  if (!img) return;

  // 耳環大小（依臉部大小縮放）
  const faceWidth = dist(
    face.keypoints[234].x,
    face.keypoints[234].y,
    face.keypoints[454].x,
    face.keypoints[454].y
  );

  const earringW = 50;
  const earringH = 100;

  // 映射座標（鏡像）
  const lx = x + w - (leftEar.x / vw) * w;
  const ly = y + (leftEar.y / vh) * h;

  const rx = x + w - (rightEar.x / vw) * w;
  const ry = y + (rightEar.y / vh) * h;

  imageMode(CENTER);

  // 左耳
  image(
    img,
    lx,
    ly + 80,
    earringW,
    earringH
  );

  // 右耳
  image(
    img,
    rx,
    ry + 80,
    earringW,
    earringH
  );

  imageMode(CORNER);
}

// ── 模式切換按鈕 ───────────────────────────────────────────
function initModeButton() {
  if (document.getElementById('mode-toggle')) return;

  const btn = document.createElement('button');
  btn.id = 'mode-toggle';
  btn.innerHTML = '🔬 偵測模式';
  btn.style.cssText = `
    position: fixed;
    bottom: 28px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 500;
    padding: 11px 28px;
    font-family: 'DM Mono', monospace;
    font-size: 14px;
    font-weight: bold;
    color: #fff;
    background: rgba(41, 123, 178, 0.8);
    border: 1.5px solid rgba(255, 255, 255, 0.45);
    border-radius: 40px;
    cursor: pointer;
    backdrop-filter: blur(14px);
    box-shadow: 0 4px 20px rgba(0,0,0,0.25);
    transition: background .2s, transform .15s;
    white-space: nowrap;
  `;
  btn.onclick = () => {
    displayMode =
      (displayMode === 'detect')
      ? 'accessory'
      : 'detect';

    btn.innerHTML =
      displayMode === 'detect'
      ? '🔬 偵測模式'
      : '💎 飾品模式';
    btn.style.background = displayMode === 'detect'
      ? 'rgba(41, 123, 178, 0.8)'
      : 'rgba(160, 50, 210, 0.85)';
    
  };
  btn.onmouseover = () => btn.style.transform = 'translateX(-50%) translateY(-2px)';
  btn.onmouseout  = () => btn.style.transform = 'translateX(-50%)';
  document.body.appendChild(btn);
}

// ── 等待畫面 ───────────────────────────────────────────────
function drawWaiting() {
  const r = 12 + 4 * sin(pulseT * 2);
  noStroke();
  fill(255, 255, 255, 80 + 40 * sin(pulseT * 2));
  ellipse(width / 2, height / 2 - 20, r, r);
  fill(255, 255, 255, 160);
  textAlign(CENTER, CENTER); textFont('DM Mono, monospace'); textSize(14);
  text('鏡頭啟動中...', width / 2, height / 2 + 16);
}

// ── 光暈效果 ───────────────────────────────────────────────
function drawGlow(x, y, w, h) {
  const a = 30 + 15 * sin(pulseT);
  noStroke();
  for (let i = 3; i >= 1; i--) {
    fill(255, 255, 255, a * (i / 3) * 0.25);
    const p = i * 7;
    rect(x - p, y - p, w + p * 2, h + p * 2, 4 + p);
  }
}

// ── 狀態列 ─────────────────────────────────────────────────
function drawStatusBar() {
  noStroke(); fill(0, 0, 0, 38); rect(0, height - 46, width, 46);

  fill(255, 255, 255, 75);
  textAlign(LEFT, CENTER); textFont('DM Mono, monospace'); textSize(11);
  text(/Mobi|Android/i.test(navigator.userAgent) ? '📱 Mobile Camera' : '💻 Desktop Camera',
       18, height - 23);

  // 臉譜模式下顯示手勢提示與目前選擇
  if (displayMode === 'accessory') {
    fill(220, 180, 255, 200);
    textAlign(CENTER, CENTER); textSize(11);
    const label =
      `✋ 左右揮手切換耳環 ｜ 目前：耳環 ${currentEarring + 1}`;

    text(label, width / 2, height - 23);
  }

  fill(255, 255, 255, 140);
  textAlign(RIGHT, CENTER); textSize(12);
  text('🟢 Live', width - 18, height - 23);
}

// ── 雜訊材質 ───────────────────────────────────────────────
function generateNoiseTexture() {
  noiseTexture.loadPixels();
  for (let i = 0; i < noiseTexture.pixels.length; i += 4) {
    const v = random(255);
    noiseTexture.pixels[i]     = v;
    noiseTexture.pixels[i + 1] = v;
    noiseTexture.pixels[i + 2] = v;
    noiseTexture.pixels[i + 3] = random(15, 45);
  }
  noiseTexture.updatePixels();
}

// ── 比例保持（letterbox fit）──────────────────────────────
function fitKeepRatio(srcW, srcH, boxW, boxH, offsetX, offsetY) {
  const srcR = srcW / srcH, boxR = boxW / boxH;
  let w, h;
  if (srcR > boxR) { w = boxW; h = boxW / srcR; }
  else             { h = boxH; w = boxH * srcR; }
  return { x: offsetX + (boxW - w) / 2, y: offsetY + (boxH - h) / 2, w, h };
}

// ── 視窗縮放 ───────────────────────────────────────────────
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  noiseTexture = createGraphics(windowWidth, windowHeight);
  generateNoiseTexture();
}
