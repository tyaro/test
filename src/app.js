// src/app.js - メインゲームロジック (Babylon.js)

(function () {
  'use strict';

  // ─── DOM 要素 ──────────────────────────────────────────────────────────────
  const canvas     = document.getElementById('renderCanvas');
  const rollButton = document.getElementById('rollButton');
  const resultEl   = document.getElementById('result');
  const statusEl   = document.getElementById('status');

  // ─── ゲーム状態 ────────────────────────────────────────────────────────────
  let playerPosition = 0;
  let isAnimating    = false;
  let gameOver       = false;
  let physicsEnabled = false;

  // ─── Babylon.js オブジェクト ────────────────────────────────────────────────
  let scene        = null;
  let playerMesh   = null;
  let diceMesh     = null;
  const squareMeshes = [];

  // ─── ボード座標（utils.js で計算）─────────────────────────────────────────
  const boardPositions = getBoardSquarePositions(BOARD_CONFIG);

  // ══════════════════════════════════════════════════════════════════════════
  // エンジン & シーン初期化
  // ══════════════════════════════════════════════════════════════════════════
  const engine = new BABYLON.Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
  });

  function createScene() {
    scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0.05, 0.06, 0.18, 1);

    // ── 物理エンジン (Cannon.js) ─────────────────────────────────────────
    try {
      const cannonRef = typeof CANNON !== 'undefined' ? CANNON : undefined;
      const physicsPlugin = new BABYLON.CannonJSPlugin(true, 10, cannonRef);
      scene.enablePhysics(new BABYLON.Vector3(0, -9.81, 0), physicsPlugin);
      physicsEnabled = true;
    } catch (e) {
      console.warn('[Physics] Cannon.js を初期化できませんでした:', e.message);
    }

    setupCamera();
    setupLights();
    createGround();
    createBoard();
    playerMesh = createPlayer();
    diceMesh   = createDice();
    createDecorations();

    return scene;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // カメラ設定 — ArcRotateCamera（マウス/タッチで自由操作）
  // ══════════════════════════════════════════════════════════════════════════
  function setupCamera() {
    const camera = new BABYLON.ArcRotateCamera(
      'camera',
      -Math.PI / 4,
      Math.PI / 3.6,
      24,
      new BABYLON.Vector3(0, 0, 0),
      scene
    );
    camera.attachControl(canvas, true);
    camera.lowerRadiusLimit  = 8;
    camera.upperRadiusLimit  = 40;
    camera.lowerBetaLimit    = 0.2;
    camera.upperBetaLimit    = Math.PI / 2.1;
    camera.panningSensibility = 50;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 照明設定
  // ══════════════════════════════════════════════════════════════════════════
  function setupLights() {
    // 半球光（環境光）
    const hemi = new BABYLON.HemisphericLight(
      'hemi',
      new BABYLON.Vector3(0, 1, 0),
      scene
    );
    hemi.intensity    = 0.55;
    hemi.groundColor  = new BABYLON.Color3(0.18, 0.18, 0.28);

    // 指向性ライト + シャドウ
    const dir = new BABYLON.DirectionalLight(
      'dir',
      new BABYLON.Vector3(-1, -2, -1),
      scene
    );
    dir.position  = new BABYLON.Vector3(10, 12, 10);
    dir.intensity = 0.8;

    const shadowGen = new BABYLON.ShadowGenerator(1024, dir);
    shadowGen.useBlurExponentialShadowMap = true;
    shadowGen.blurKernel = 16;

    // シャドウジェネレータをシーンカスタムに保存して後で参照できるようにする
    scene._shadowGenerator = shadowGen;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 地面 & 境界壁の生成
  // ══════════════════════════════════════════════════════════════════════════
  function createGround() {
    const ground = BABYLON.MeshBuilder.CreateGround(
      'ground',
      { width: 30, height: 30, subdivisions: 10 },
      scene
    );
    const mat = new BABYLON.StandardMaterial('groundMat', scene);
    mat.diffuseColor  = new BABYLON.Color3(0.28, 0.48, 0.22);
    mat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
    ground.material      = mat;
    ground.receiveShadows = true;

    if (physicsEnabled) {
      ground.physicsImpostor = new BABYLON.PhysicsImpostor(
        ground,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 0, restitution: 0.3, friction: 0.8 },
        scene
      );
    }

    // 不可視の境界壁（サイコロが場外に出ないように）
    const walls = [
      { pos: [ 0,  1,  14.5], size: [30, 3, 1] },
      { pos: [ 0,  1, -14.5], size: [30, 3, 1] },
      { pos: [ 14.5, 1, 0],   size: [1,  3, 30] },
      { pos: [-14.5, 1, 0],   size: [1,  3, 30] },
    ];
    walls.forEach((w, i) => {
      const wall = BABYLON.MeshBuilder.CreateBox(
        `wall${i}`,
        { width: w.size[0], height: w.size[1], depth: w.size[2] },
        scene
      );
      wall.position.set(...w.pos);
      wall.isVisible = false;
      if (physicsEnabled) {
        wall.physicsImpostor = new BABYLON.PhysicsImpostor(
          wall,
          BABYLON.PhysicsImpostor.BoxImpostor,
          { mass: 0, restitution: 0.3 },
          scene
        );
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 双六ボード（マス目）の生成
  // ══════════════════════════════════════════════════════════════════════════
  function createBoard() {
    const shadowGen = scene._shadowGenerator;

    boardPositions.forEach((pos, i) => {
      const special = SPECIAL_SQUARES[i];
      const color   = getSquareColor(i, special);

      const square = BABYLON.MeshBuilder.CreateBox(
        `square_${i}`,
        {
          width:  BOARD_CONFIG.squareSize * 0.9,
          height: 0.15,
          depth:  BOARD_CONFIG.squareSize * 0.9,
        },
        scene
      );
      square.position.set(pos.x, pos.y, pos.z);
      square.receiveShadows = true;

      const mat = new BABYLON.StandardMaterial(`sqMat_${i}`, scene);
      mat.diffuseColor  = new BABYLON.Color3(color.r, color.g, color.b);
      mat.specularColor = new BABYLON.Color3(0.3, 0.3, 0.3);
      if (special) {
        mat.emissiveColor = new BABYLON.Color3(
          color.r * 0.25,
          color.g * 0.25,
          color.b * 0.25
        );
      }
      square.material = mat;

      if (shadowGen) shadowGen.addShadowCaster(square);
      squareMeshes.push(square);

      // 特殊マスはパルスアニメーションを付加
      if (special) animateSquarePulse(square);
    });
  }

  /** 特殊マスの上下スケールパルスアニメーション */
  function animateSquarePulse(mesh) {
    let t = Math.random() * Math.PI * 2; // フェーズをランダムにズラす
    scene.registerBeforeRender(() => {
      t += 0.04;
      mesh.scaling.y = 1 + Math.sin(t) * 0.2;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // プレイヤーキャラクター（球体）
  // ══════════════════════════════════════════════════════════════════════════
  function createPlayer() {
    const shadowGen = scene._shadowGenerator;

    const player = BABYLON.MeshBuilder.CreateSphere(
      'player',
      { diameter: 0.72, segments: 16 },
      scene
    );
    const startPos = boardPositions[0];
    player.position.set(startPos.x, startPos.y + 0.5, startPos.z);

    const mat = new BABYLON.StandardMaterial('playerMat', scene);
    mat.diffuseColor  = new BABYLON.Color3(1.0, 0.3, 0.3);
    mat.specularColor = new BABYLON.Color3(1.0, 1.0, 1.0);
    mat.specularPower = 64;
    mat.emissiveColor = new BABYLON.Color3(0.18, 0.04, 0.04);
    player.material   = mat;

    if (shadowGen) shadowGen.addShadowCaster(player);
    return player;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // サイコロ（物理付き立方体）
  // ══════════════════════════════════════════════════════════════════════════
  function createDice() {
    const shadowGen = scene._shadowGenerator;

    const dice = BABYLON.MeshBuilder.CreateBox('dice', { size: 0.85 }, scene);
    dice.position.set(6, 3, 6);

    const mat = new BABYLON.StandardMaterial('diceMat', scene);
    mat.diffuseColor  = new BABYLON.Color3(1.0, 1.0, 1.0);
    mat.specularColor = new BABYLON.Color3(0.9, 0.9, 0.9);
    mat.specularPower = 32;
    dice.material     = mat;

    if (shadowGen) shadowGen.addShadowCaster(dice);

    if (physicsEnabled) {
      dice.physicsImpostor = new BABYLON.PhysicsImpostor(
        dice,
        BABYLON.PhysicsImpostor.BoxImpostor,
        { mass: 1, restitution: 0.35, friction: 0.55 },
        scene
      );
    }
    return dice;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 装飾オブジェクト（木、石）
  // ══════════════════════════════════════════════════════════════════════════
  function createDecorations() {
    const treeSpots = [
      [-12, 0, -12], [ 12, 0, -12], [-12, 0,  12], [ 12, 0, 12],
      [-11, 0,   0], [ 11, 0,   0], [  0, 0, -11], [  0, 0, 11],
      [ -9, 0,  -9], [  9, 0,  -9], [ -9, 0,   9], [  9, 0,  9],
    ];

    treeSpots.forEach((pos, i) => {
      // 幹
      const trunk = BABYLON.MeshBuilder.CreateCylinder(
        `trunk${i}`,
        { height: 1.8, diameter: 0.32, tessellation: 8 },
        scene
      );
      trunk.position.set(pos[0], 0.9, pos[2]);
      const trunkMat = new BABYLON.StandardMaterial(`trunkMat${i}`, scene);
      trunkMat.diffuseColor = new BABYLON.Color3(0.38, 0.24, 0.1);
      trunk.material = trunkMat;

      // 葉
      const leaves = BABYLON.MeshBuilder.CreateSphere(
        `leaves${i}`,
        { diameter: 1.6 + (i % 3) * 0.3, segments: 8 },
        scene
      );
      leaves.position.set(pos[0], 2.2, pos[2]);
      const leavesMat = new BABYLON.StandardMaterial(`leavesMat${i}`, scene);
      leavesMat.diffuseColor  = new BABYLON.Color3(
        0.08 + (i % 3) * 0.05,
        0.55 + (i % 3) * 0.08,
        0.12
      );
      leavesMat.specularColor = new BABYLON.Color3(0.05, 0.05, 0.05);
      leaves.material = leavesMat;
    });

    // 石（ランダム配置）
    const stonePositions = [
      [-7, 0, -7], [7, 0, -7], [-7, 0, 7], [7, 0, 7],
    ];
    stonePositions.forEach((pos, i) => {
      const stone = BABYLON.MeshBuilder.CreateSphere(
        `stone${i}`,
        { diameter: 0.6 + Math.random() * 0.4, segments: 6 },
        scene
      );
      stone.position.set(pos[0], 0.25, pos[2]);
      stone.scaling.y = 0.6;
      const stoneMat = new BABYLON.StandardMaterial(`stoneMat${i}`, scene);
      stoneMat.diffuseColor = new BABYLON.Color3(0.5, 0.5, 0.55);
      stone.material = stoneMat;
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // サイコロを投げる
  // ══════════════════════════════════════════════════════════════════════════
  function throwDice() {
    if (!diceMesh) return;

    if (physicsEnabled && diceMesh.physicsImpostor) {
      // リセット後に力を加える
      diceMesh.physicsImpostor.setLinearVelocity(BABYLON.Vector3.Zero());
      diceMesh.physicsImpostor.setAngularVelocity(BABYLON.Vector3.Zero());
      diceMesh.position.set(6, 3.5, 6);
      diceMesh.rotationQuaternion = BABYLON.Quaternion.Identity();

      const forceX = (Math.random() - 0.5) * 10 - 6;
      const forceZ = (Math.random() - 0.5) * 10 - 6;
      diceMesh.physicsImpostor.applyImpulse(
        new BABYLON.Vector3(forceX, 5, forceZ),
        diceMesh.getAbsolutePosition()
      );
      // トルク（回転力）
      diceMesh.physicsImpostor.applyImpulse(
        new BABYLON.Vector3(
          (Math.random() - 0.5) * 4,
          0,
          (Math.random() - 0.5) * 4
        ),
        diceMesh.getAbsolutePosition().add(
          new BABYLON.Vector3(0.4, 0.4, 0)
        )
      );
    } else {
      // 物理なし: 単純な位置アニメーション
      animateDiceRoll();
    }
  }

  /** 物理なし環境向けのサイコロアニメーション */
  function animateDiceRoll() {
    diceMesh.position.set(6, 3, 6);
    let elapsed = 0;
    const obs = scene.onBeforeRenderObservable.add(() => {
      elapsed += engine.getDeltaTime();
      diceMesh.rotation.x += 0.12;
      diceMesh.rotation.z += 0.09;
      diceMesh.position.y  = 3 - (elapsed / 600) * 2.5;
      if (elapsed >= 600) {
        diceMesh.position.y = 0.5;
        scene.onBeforeRenderObservable.remove(obs);
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // プレイヤー移動（マス目間をジャンプアニメーション）
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * 指定マスへアニメーション付きで移動する
   * @param {number} targetIndex - 移動先マス番号
   * @returns {Promise<void>}
   */
  function animateMoveToSquare(targetIndex) {
    return new Promise((resolve) => {
      const startPos = {
        x: playerMesh.position.x,
        y: playerMesh.position.y,
        z: playerMesh.position.z,
      };
      const target = boardPositions[targetIndex];
      const endPos  = { x: target.x, y: target.y + 0.5, z: target.z };
      const arcHeight = 0.9;
      const duration = 280; // ms
      const start = performance.now();

      const tick = () => {
        const t = Math.min((performance.now() - start) / duration, 1);
        // イーズイン・アウト
        const eased = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        const pos   = lerpVector3(startPos, endPos, eased);
        pos.y      += Math.sin(t * Math.PI) * arcHeight;

        playerMesh.position.x = pos.x;
        playerMesh.position.y = pos.y;
        playerMesh.position.z = pos.z;

        if (t < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });
  }

  /**
   * プレイヤーを step マス進める（負値で後退）
   * @param {number} steps - 移動マス数（正=前進、負=後退）
   */
  async function movePlayer(steps) {
    const dir   = steps > 0 ? 1 : -1;
    const count = Math.abs(steps);

    for (let i = 0; i < count; i++) {
      const next = Math.max(
        0,
        Math.min(playerPosition + dir, BOARD_CONFIG.totalSquares - 1)
      );
      await animateMoveToSquare(next);
      playerPosition = next;
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ゲームメインロジック
  // ══════════════════════════════════════════════════════════════════════════
  async function handleRoll() {
    if (isAnimating || gameOver) return;
    isAnimating = true;
    rollButton.disabled = true;

    // サイコロを振る
    const diceResult = rollDice();
    throwDice();
    resultEl.textContent = `🎲 サイコロの出目: ${diceResult}`;

    // サイコロが落ち着くのを少し待つ
    await sleep(physicsEnabled ? 1300 : 700);

    // プレイヤーをサイコロの出目だけ前進（ゴールを超えないようにクランプ）
    const rawTarget  = playerPosition + diceResult;
    const clampedTarget = Math.min(rawTarget, BOARD_CONFIG.totalSquares - 1);
    const actualSteps   = clampedTarget - playerPosition;

    await movePlayer(actualSteps);

    // 特殊マスの処理
    const special = SPECIAL_SQUARES[playerPosition];
    if (special) {
      resultEl.textContent = special.message;
      await sleep(700);

      if (special.effect !== 0) {
        await movePlayer(special.effect);
      }
    }

    // ゴール判定
    if (playerPosition >= BOARD_CONFIG.totalSquares - 1) {
      gameOver = true;
      resultEl.textContent = '🏆 ゴール！おめでとうございます！';
      statusEl.textContent  = '🎉 ゲームクリア！';
      rollButton.textContent  = '🔄 もう一度遊ぶ';
      rollButton.disabled     = false;
      rollButton.onclick       = resetGame;
      isAnimating = false;
      return;
    }

    // 通常結果の更新
    if (!special || special.effect === 0) {
      resultEl.textContent = `🎲 ${diceResult} マス進んだ → 現在: ${playerPosition} マス目`;
    }
    statusEl.textContent  = `マス: ${playerPosition} / ${BOARD_CONFIG.totalSquares - 1}`;
    rollButton.disabled   = false;
    isAnimating           = false;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ゲームリセット
  // ══════════════════════════════════════════════════════════════════════════
  async function resetGame() {
    playerPosition = 0;
    isAnimating    = false;
    gameOver       = false;

    rollButton.textContent = '🎲 サイコロを振る';
    rollButton.onclick     = null;
    rollButton.disabled    = false;
    resultEl.textContent   = 'ゲームを開始してください';
    statusEl.textContent   = `マス: 0 / ${BOARD_CONFIG.totalSquares - 1}`;

    const start = boardPositions[0];
    playerMesh.position.set(start.x, start.y + 0.5, start.z);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 起動
  // ══════════════════════════════════════════════════════════════════════════
  rollButton.addEventListener('click', handleRoll);

  const sceneInstance = createScene();

  engine.runRenderLoop(() => {
    sceneInstance.render();
  });

  window.addEventListener('resize', () => {
    engine.resize();
  });
})();
