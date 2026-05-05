// src/utils.js - 補助関数・設定値管理

/**
 * ボード設定定数
 */
const BOARD_CONFIG = {
  totalSquares: 20,
  squareSize: 2,
  squareGap: 0.15,
  boardRows: 4,
  squaresPerRow: 5,
};

/**
 * サイコロの出目をランダムに生成する (1〜6)
 * @returns {number} 1〜6のランダムな整数
 */
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * 蛇行パターンで双六マス目の3D座標を計算する
 * 偶数行は左→右、奇数行は右→左の順に並ぶ
 * @param {object} config - BOARD_CONFIG
 * @returns {Array<{x: number, y: number, z: number, index: number}>}
 */
function getBoardSquarePositions(config) {
  const positions = [];
  const step = config.squareSize + config.squareGap;
  const halfCols = (config.squaresPerRow - 1) / 2;
  const halfRows = (config.boardRows - 1) / 2;

  for (let row = 0; row < config.boardRows; row++) {
    for (let col = 0; col < config.squaresPerRow; col++) {
      // 蛇行: 偶数行は左→右、奇数行は右→左
      const actualCol = row % 2 === 0 ? col : config.squaresPerRow - 1 - col;
      const x = (actualCol - halfCols) * step;
      const z = (row - halfRows) * step;
      positions.push({ x, y: 0.05, z });
    }
  }
  return positions;
}

/**
 * 線形補間
 * @param {number} a - 始点
 * @param {number} b - 終点
 * @param {number} t - 補間係数 (0〜1)
 * @returns {number}
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * ベクトルの線形補間
 * @param {{x:number,y:number,z:number}} v1 - 始点ベクトル
 * @param {{x:number,y:number,z:number}} v2 - 終点ベクトル
 * @param {number} t - 補間係数 (0〜1)
 * @returns {{x:number,y:number,z:number}}
 */
function lerpVector3(v1, v2, t) {
  return {
    x: lerp(v1.x, v2.x, t),
    y: lerp(v1.y, v2.y, t),
    z: lerp(v1.z, v2.z, t),
  };
}

/**
 * 特殊マスの定義
 * key: マス番号 (0始まり)
 * type: 'bonus' | 'penalty' | 'goal'
 * effect: 移動するマス数 (正=進む, 負=戻る, 0=停止)
 */
const SPECIAL_SQUARES = {
  5:  { type: 'bonus',   message: '🎉 ボーナス！3マス進む',      effect: 3  },
  10: { type: 'penalty', message: '💥 罰則！2マス戻る',           effect: -2 },
  15: { type: 'bonus',   message: '⭐ スペシャル！2マス進む',     effect: 2  },
  19: { type: 'goal',    message: '🏆 ゴール！おめでとうございます！', effect: 0  },
};

/**
 * マス種別に応じたRGB色を返す
 * @param {number} index - マス番号
 * @param {object|undefined} special - 特殊マス定義
 * @returns {{r:number, g:number, b:number}}
 */
function getSquareColor(index, special) {
  if (index === 0) return { r: 0.25, g: 0.85, b: 0.25 };  // スタート: 緑
  if (special) {
    if (special.type === 'bonus')   return { r: 1.0, g: 0.85, b: 0.0 };  // ボーナス: 黄
    if (special.type === 'penalty') return { r: 1.0, g: 0.25, b: 0.25 }; // 罰: 赤
    if (special.type === 'goal')    return { r: 1.0, g: 0.5,  b: 0.0  }; // ゴール: オレンジ
  }
  // 通常マス: 交互にライトブルー
  return index % 2 === 0
    ? { r: 0.55, g: 0.75, b: 1.0 }
    : { r: 0.75, g: 0.88, b: 1.0 };
}

/**
 * 指定ミリ秒だけ待機するPromiseを返す
 * @param {number} ms - 待機時間 (ミリ秒)
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
