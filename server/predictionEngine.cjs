/**
 * 胜平负概率计算引擎（规则模型）
 *
 * 规则模型策略：
 * 1.  积分榜排名差 → 基础实力分
 * 2.  近期胜率（最近5场）→ 状态分
 * 3.  进球/失球比率 → 攻防分
 * 4.  主场优势 → +8 分加成
 * 5.  实力差距映射到胜平负概率，确保合计 100%
 */

/**
 * @typedef {Object} TeamStats
 * @property {string} teamId
 * @property {string} teamName
 * @property {number} position        - 排名
 * @property {number} playedGames     - 已赛场次
 * @property {number} wins
 * @property {number} draws
 * @property {number} losses
 * @property {number} goalsFor        - 进球
 * @property {number} goalsAgainst    - 失球
 * @property {number} points          - 积分
 * @property {string} form            - 近期战绩，如 "WWDWL"
 */

/**
 * @typedef {Object} PredictionResult
 * @property {number} homeWin
 * @property {number} draw
 * @property {number} awayWin
 * @property {Object} factors          - 分析依据
 * @property {number|null} homeRank
 * @property {number|null} awayRank
 * @property {string} homeRecentForm
 * @property {string} awayRecentForm
 * @property {number} homePoints
 * @property {number} awayPoints
 * @property {number} homeGoalsFor
 * @property {number} awayGoalsFor
 * @property {number} homeGoalsAgainst
 * @property {number} awayGoalsAgainst
 * @property {string} homeWinRate
 * @property {string} awayWinRate
 */

/**
 * 核心计算：根据主客队统计数据和竞争码计算胜平负概率
 *
 * @param {TeamStats|null} homeStats
 * @param {TeamStats|null} awayStats
 * @param {string} competitionCode
 * @returns {PredictionResult}
 */
function calculate(homeStats, awayStats, competitionCode) {
  const MAX_POSITION = 20; // 假设最多20支球队

  // ---- Step 1: 排名分 (0 - 25) ----
  const homePos = homeStats?.position ?? MAX_POSITION;
  const awayPos = awayStats?.position ?? MAX_POSITION;
  const posDiff = awayPos - homePos; // 正值=主队排名更好
  // 排名差越大优势越大，最大优势25分
  const rankScore = Math.max(-25, Math.min(25, posDiff * (25 / MAX_POSITION) * 2));

  // ---- Step 2: 近期状态分 (0 - 30) ----
  const homeFormScore = calcFormScore(homeStats?.form || '', homeStats);
  const awayFormScore = calcFormScore(awayStats?.form || '', awayStats);
  const formScore = homeFormScore - awayFormScore; // -30 ~ +30

  // ---- Step 3: 攻防分 (0 - 25) ----
  const homeGd = homeStats ? (homeStats.goalsFor || 0) - (homeStats.goalsAgainst || 0) : 0;
  const awayGd = awayStats ? (awayStats.goalsFor || 0) - (awayStats.goalsAgainst || 0) : 0;
  const gdDiff = homeGd - awayGd;
  // 净胜球差映射到-25~+25
  const attackScore = Math.max(-25, Math.min(25, gdDiff * 2.5));

  // ---- Step 4: 胜率分 (0 - 20) ----
  const homeWinRate = homeStats && homeStats.playedGames > 0
    ? (homeStats.wins || 0) / homeStats.playedGames
    : 0;
  const awayWinRate = awayStats && awayStats.playedGames > 0
    ? (awayStats.wins || 0) / awayStats.playedGames
    : 0;
  const winRateScore = Math.round((homeWinRate - awayWinRate) * 20); // -20 ~ +20

  // ---- Step 5: 主场优势分 (+8) ----
  const homeAdvantage = 8;

  // ---- 综合实力评分 ----
  const homeTotal = rankScore + formScore + attackScore + winRateScore + homeAdvantage;
  const awayTotal = 0; // 客队基准线为0
  const totalDiff = homeTotal - awayTotal; // 正值=主队更强

  // ---- Step 6: 映射到概率 ----
  // diff 范围大约 -70 ~ +70
  // 平局概率范围 12% ~ 35%
  const absDiff = Math.abs(totalDiff);
  const closenessNormalized = Math.max(0, 1 - absDiff / 70);
  const drawPct = Math.round(12 + closenessNormalized * 23);

  const remaining = 100 - drawPct;

  if (totalDiff >= 0) {
    // 主队更强
    const strengthFactor = Math.min(1, absDiff / 70); // 0~1
    const homeAdv = Math.round(remaining * (0.5 + strengthFactor * 0.5));
    const awayPct = remaining - homeAdv;
    return finalize(homeAdv, drawPct, awayPct, homeStats, awayStats);
  } else {
    // 客队更强
    const strengthFactor = Math.min(1, absDiff / 70);
    const awayAdv = Math.round(remaining * (0.5 + strengthFactor * 0.5));
    const homePct = remaining - awayAdv;
    return finalize(homePct, drawPct, awayAdv, homeStats, awayStats);
  }
}

/**
 * 计算近期战绩分 (0-30)
 * 从 form 字符串（如 "WWDWL"）或 standings 数据计算
 */
function calcFormScore(formStr, stats) {
  if (!formStr && !stats) return 15; // 无数据给中位分

  let winCount = 0;
  let total = 0;

  if (formStr && formStr.length > 0) {
    // football-data.org: W=win, D=draw, L=loss
    for (const ch of formStr.toUpperCase()) {
      total++;
      if (ch === 'W') winCount++;
      else if (ch === 'D') winCount += 0.5;
    }
  }

  if (total === 0 && stats && stats.playedGames > 0) {
    // 回退到整体胜率
    total = stats.playedGames;
    winCount = (stats.wins || 0) + (stats.draws || 0) * 0.5;
  }

  if (total === 0) return 15;

  const rate = winCount / total;
  return Math.round(rate * 30);
}

/**
 * 最终归一化 & 构建结果
 */
function finalize(homeWin, draw, awayWin, homeStats, awayStats) {
  // 边界约束：最低 5%，最高 85%
  homeWin = Math.max(5, Math.min(85, homeWin));
  draw = Math.max(5, Math.min(85, draw));
  awayWin = Math.max(5, Math.min(85, awayWin));

  // 确保三项合计为100
  let sum = homeWin + draw + awayWin;
  if (sum !== 100) {
    const diff = 100 - sum;
    // 加到值最大的项
    if (homeWin >= draw && homeWin >= awayWin) homeWin += diff;
    else if (draw >= homeWin && draw >= awayWin) draw += diff;
    else awayWin += diff;
  }

  // 边界保护（二次检查）
  homeWin = Math.max(5, Math.min(85, homeWin));
  draw = Math.max(5, Math.min(85, draw));
  awayWin = Math.max(5, Math.min(85, awayWin));

  // 二次归一化
  sum = homeWin + draw + awayWin;
  if (sum !== 100) homeWin += 100 - sum;

  const homeWinRate =
    homeStats && homeStats.playedGames > 0
      ? Math.round((homeStats.wins / homeStats.playedGames) * 100) + '%'
      : '暂无数据';

  const awayWinRate =
    awayStats && awayStats.playedGames > 0
      ? Math.round((awayStats.wins / awayStats.playedGames) * 100) + '%'
      : '暂无数据';

  return {
    homeWin,
    draw,
    awayWin,
    factors: {
      homeRank: homeStats?.position ?? null,
      awayRank: awayStats?.position ?? null,
      homeRecentForm: homeStats?.form || '暂无数据',
      awayRecentForm: awayStats?.form || '暂无数据',
      homePoints: homeStats?.points ?? 0,
      awayPoints: awayStats?.points ?? 0,
      homeGoalsFor: homeStats?.goalsFor ?? 0,
      awayGoalsFor: awayStats?.goalsFor ?? 0,
      homeGoalsAgainst: homeStats?.goalsAgainst ?? 0,
      awayGoalsAgainst: awayStats?.goalsAgainst ?? 0,
      homeWinRate,
      awayWinRate,
    },
  };
}

/**
 * 生成中文结论
 */
function generateConclusion(result, homeName, awayName) {
  const { homeWin, draw, awayWin } = result;
  if (homeWin >= 50) return `${homeName} 主场优势明显，胜算较高。`;
  if (awayWin >= 50) return `${awayName} 客场实力强劲，看好客队取分。`;
  if (draw >= 35) return `双方实力接近，平局概率较大。`;
  if (homeWin >= awayWin) return `${homeName} 略占上风，但比赛仍存变数。`;
  return `${awayName} 稍占优势，有望客场取分。`;
}

module.exports = { calculate, generateConclusion };