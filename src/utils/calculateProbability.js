const FORM_SCORE = { 胜: 3, 平: 1, 负: 0 };

/**
 * 计算近期战绩得分
 * @param {string[]} form - 近期战绩数组，例如 ['胜', '胜', '平', '胜', '负']
 * @returns {number} 0-15 的原始分数
 */
function calcFormRawScore(form) {
  if (!Array.isArray(form) || form.length === 0) return 0;
  return form.reduce((sum, result) => sum + (FORM_SCORE[result] || 0), 0);
}

/**
 * 计算单支球队的综合评分
 * @param {{ form: string[], attack: number, defense: number, possession: number, shots: number }} data
 * @param {boolean} isHome 是否为主队
 * @returns {number} 综合评分
 */
function calcTeamScore(data, isHome) {
  const formCount = Math.max(data.form?.length || 5, 1);
  const formRaw = calcFormRawScore(data.form);
  const formScore = (formRaw / (formCount * 3)) * 25; // 归一化到 0-25

  const attack = (data.attack || 0) * 0.3; // 0-30
  const defense = (data.defense || 0) * 0.2; // 0-20
  const possession = (data.possession || 0) * 0.15; // 0-15
  const shotsScore = Math.min((data.shots || 0) / 20, 1) * 10; // 0-10

  let score = formScore + attack + defense + possession + shotsScore;
  if (isHome) score += 5; // 主场优势

  return score;
}

/**
 * 验证 match 数据是否包含模型计算所需的字段
 * @param {object} match
 * @returns {{ valid: boolean, reason?: string }}
 */
export function validateMatchData(match) {
  if (!match) return { valid: false, reason: '缺少比赛数据' };

  const form = match.form;
  const ad = match.attackDefense;

  if (!form || !ad) return { valid: false, reason: '缺少近期状态或攻防数据' };
  if (!Array.isArray(form.home) || form.home.length === 0) return { valid: false, reason: '缺少主队近期战绩' };
  if (!Array.isArray(form.away) || form.away.length === 0) return { valid: false, reason: '缺少客队近期战绩' };
  if (!ad.home || !ad.away) return { valid: false, reason: '缺少攻防数据' };

  const requiredFields = ['attack', 'defense', 'possession', 'shots'];
  for (const field of requiredFields) {
    if (ad.home[field] == null) return { valid: false, reason: `缺少主队${field}数据` };
    if (ad.away[field] == null) return { valid: false, reason: `缺少客队${field}数据` };
  }

  return { valid: true };
}

/**
 * 根据比赛详情数据计算胜平负概率（规则模型）
 *
 * 模型设计思路：
 * 1. 综合近期状态、攻防能力、控球、射门四项指标计算主客队综合评分
 * 2. 主队享主场优势分（+5）
 * 3. 双方评分越接近，平局概率越高（15%-40%）
 * 4. 剩余概率按评分比例分配给主胜/客胜
 * 5. 最终归一化确保三项合计为 100
 *
 * @param {object} match - 比赛详情数据（需包含 form 和 attackDefense 字段）
 * @returns {{ homeWin: number, draw: number, awayWin: number } | null}
 */
export function calculateProbability(match) {
  const validation = validateMatchData(match);
  if (!validation.valid) return null;

  const homeData = {
    form: match.form.home,
    attack: match.attackDefense.home.attack,
    defense: match.attackDefense.home.defense,
    possession: match.attackDefense.home.possession,
    shots: match.attackDefense.home.shots,
  };

  const awayData = {
    form: match.form.away,
    attack: match.attackDefense.away.attack,
    defense: match.attackDefense.away.defense,
    possession: match.attackDefense.away.possession,
    shots: match.attackDefense.away.shots,
  };

  const homeScore = calcTeamScore(homeData, true);
  const awayScore = calcTeamScore(awayData, false);

  // 双方实力接近程度（0 = 完全相同，1 = 差距最大）
  const maxScore = Math.max(homeScore, awayScore, 0.01);
  const minScore = Math.min(homeScore, awayScore);
  const closeness = 1 - (maxScore - minScore) / maxScore;

  // 平局概率：实力越接近越高，范围 15% ~ 40%
  const draw = Math.round(15 + closeness * 25);

  // 剩余概率按评分比例分配给主胜和客胜
  const remaining = 100 - draw;
  const totalScore = homeScore + awayScore || 1;

  let homeWin = Math.round((remaining * homeScore) / totalScore);
  let awayWin = Math.round((remaining * awayScore) / totalScore);

  // 修正舍入误差，确保三项合计为 100
  const sum = homeWin + draw + awayWin;
  const diff = 100 - sum;

  if (diff !== 0) {
    // 将差额加到值最大的项上
    if (homeWin >= awayWin && homeWin >= draw) {
      homeWin += diff;
    } else if (awayWin >= homeWin && awayWin >= draw) {
      awayWin += diff;
    } else {
      // 平局最大时，按比例分配到主客胜
      homeWin += Math.round(diff / 2);
      awayWin += diff - Math.round(diff / 2);
    }
  }

  // 最终边界保护
  homeWin = Math.max(0, Math.min(100, homeWin));
  awayWin = Math.max(0, Math.min(100, awayWin));

  // 二次归一化（处理极端情况）
  const finalSum = homeWin + draw + awayWin;
  if (finalSum !== 100) {
    homeWin += 100 - finalSum;
  }

  return { homeWin, draw, awayWin };
}