export const leagues = [
  { id: 'premier-league', name: '英超', country: 'England', matchesCount: 8, coverageScore: 93 },
  { id: 'la-liga', name: '西甲', country: 'Spain', matchesCount: 7, coverageScore: 91 },
  { id: 'serie-a', name: '意甲', country: 'Italy', matchesCount: 6, coverageScore: 88 },
  { id: 'bundesliga', name: '德甲', country: 'Germany', matchesCount: 5, coverageScore: 87 },
  { id: 'ligue-1', name: '法甲', country: 'France', matchesCount: 5, coverageScore: 84 },
  { id: 'world-cup', name: '世界杯', country: 'FIFA', matchesCount: 12, coverageScore: 98 },
  { id: 'champions-league', name: '欧冠', country: 'UEFA', matchesCount: 10, coverageScore: 96 },
];

export const teams = [
  { id: 'man-city', name: '曼城', shortName: 'MCI', leagueId: 'premier-league' },
  { id: 'arsenal', name: '阿森纳', shortName: 'ARS', leagueId: 'premier-league' },
  { id: 'real-madrid', name: '皇家马德里', shortName: 'RMA', leagueId: 'la-liga' },
  { id: 'barcelona', name: '巴塞罗那', shortName: 'BAR', leagueId: 'la-liga' },
  { id: 'inter', name: '国际米兰', shortName: 'INT', leagueId: 'serie-a' },
  { id: 'juventus', name: '尤文图斯', shortName: 'JUV', leagueId: 'serie-a' },
  { id: 'bayern', name: '拜仁慕尼黑', shortName: 'FCB', leagueId: 'bundesliga' },
  { id: 'dortmund', name: '多特蒙德', shortName: 'BVB', leagueId: 'bundesliga' },
];

export const matches = [
  {
    id: 'mci-ars',
    leagueId: 'premier-league',
    time: '2026-05-06 03:00',
    homeTeamId: 'man-city',
    awayTeamId: 'arsenal',
    venue: 'Etihad Stadium',
    probability: { homeWin: 30, draw: 30, awayWin: 40 },
    form: {
      home: ['胜', '胜', '平', '胜', '负'],
      away: ['胜', '平', '胜', '胜', '平'],
    },
    attackDefense: {
      home: { attack: 91, defense: 84, possession: 64, shots: 16.8 },
      away: { attack: 87, defense: 86, possession: 58, shots: 14.9 },
    },
    headToHead: [
      { id: 'mci-ars-h2h-1', score: '曼城 1-0 阿森纳' },
      { id: 'mci-ars-h2h-2', score: '阿森纳 2-2 曼城' },
      { id: 'mci-ars-h2h-3', score: '曼城 3-1 阿森纳' },
      { id: 'mci-ars-h2h-4', score: '阿森纳 1-0 曼城' },
    ],
    conclusion:
      '曼城主场控球和创造机会能力更强，阿森纳防守稳定且反击效率高。模型倾向主队小优，平局权重不低。',
    signals: [
      { label: '进攻倾向', value: '高' },
      { label: '平局风险', value: '偏高' },
      { label: '建议关注', value: '临场赔率' },
    ],
  },
  {
    id: 'rma-bar',
    leagueId: 'la-liga',
    time: '2026-05-07 02:45',
    homeTeamId: 'real-madrid',
    awayTeamId: 'barcelona',
    venue: 'Santiago Bernabeu',
    probability: { homeWin: 42, draw: 27, awayWin: 31 },
    form: {
      home: ['胜', '胜', '胜', '平', '负'],
      away: ['胜', '负', '胜', '平', '胜'],
    },
    attackDefense: {
      home: { attack: 90, defense: 82, possession: 57, shots: 15.6 },
      away: { attack: 88, defense: 80, possession: 62, shots: 14.4 },
    },
    headToHead: [
      { id: 'rma-bar-h2h-1', score: '皇马 3-2 巴萨' },
      { id: 'rma-bar-h2h-2', score: '巴萨 1-1 皇马' },
      { id: 'rma-bar-h2h-3', score: '皇马 2-1 巴萨' },
      { id: 'rma-bar-h2h-4', score: '巴萨 0-4 皇马' },
    ],
    conclusion:
      '双方进攻质量接近，皇马近期终结效率更高。巴萨控球占优但防线空间暴露较多，主胜概率略高。',
    signals: [
      { label: '进攻倾向', value: '高' },
      { label: '平局风险', value: '中等' },
      { label: '建议关注', value: '中场控制' },
    ],
  },
  {
    id: 'int-juv',
    leagueId: 'serie-a',
    time: '2026-05-08 02:30',
    homeTeamId: 'inter',
    awayTeamId: 'juventus',
    venue: 'San Siro',
    probability: { homeWin: 49, draw: 30, awayWin: 21 },
    form: {
      home: ['胜', '平', '胜', '胜', '胜'],
      away: ['平', '负', '胜', '平', '胜'],
    },
    attackDefense: {
      home: { attack: 86, defense: 89, possession: 55, shots: 13.8 },
      away: { attack: 79, defense: 85, possession: 50, shots: 11.6 },
    },
    headToHead: [
      { id: 'int-juv-h2h-1', score: '国米 1-0 尤文' },
      { id: 'int-juv-h2h-2', score: '尤文 1-1 国米' },
      { id: 'int-juv-h2h-3', score: '国米 2-0 尤文' },
      { id: 'int-juv-h2h-4', score: '尤文 0-1 国米' },
    ],
    conclusion:
      '国际米兰攻守平衡更好，主场压迫质量稳定。尤文低位防守韧性强，平局仍是重要分支。',
    signals: [
      { label: '进攻倾向', value: '中高' },
      { label: '平局风险', value: '偏高' },
      { label: '建议关注', value: '防线轮换' },
    ],
  },
  {
    id: 'bayern-bvb',
    leagueId: 'bundesliga',
    time: '2026-05-09 00:30',
    homeTeamId: 'bayern',
    awayTeamId: 'dortmund',
    venue: 'Allianz Arena',
    probability: { homeWin: 54, draw: 22, awayWin: 24 },
    form: {
      home: ['胜', '胜', '负', '胜', '胜'],
      away: ['胜', '平', '负', '胜', '平'],
    },
    attackDefense: {
      home: { attack: 94, defense: 78, possession: 61, shots: 18.2 },
      away: { attack: 85, defense: 76, possession: 53, shots: 13.7 },
    },
    headToHead: [
      { id: 'bayern-bvb-h2h-1', score: '拜仁 4-2 多特' },
      { id: 'bayern-bvb-h2h-2', score: '多特 2-2 拜仁' },
      { id: 'bayern-bvb-h2h-3', score: '拜仁 3-0 多特' },
      { id: 'bayern-bvb-h2h-4', score: '多特 1-2 拜仁' },
    ],
    conclusion:
      '拜仁进攻火力和主场节奏明显占优，但防线转换保护存在波动。多特需要依赖快速推进创造冷门机会。',
    signals: [
      { label: '进攻倾向', value: '高' },
      { label: '平局风险', value: '中等' },
      { label: '建议关注', value: '转换防守' },
    ],
  },
];

export const modelFactors = [
  { title: '近期状态', detail: '统计近 5 到 10 场胜平负走势、进球效率、失球趋势和关键球员可用性。' },
  { title: '主客场表现', detail: '拆分主场与客场样本，评估控球、射门、压迫、防守回收与旅途影响。' },
  { title: '攻防能力', detail: '结合进攻威胁、预期进球、射门质量、禁区防守和定位球表现。' },
  { title: '排名与赛程', detail: '参考积分排名、赛程密度、轮换压力、保级或争冠动机。' },
  { title: '历史交锋', detail: '识别双方战术克制关系、交锋节奏、关键比分分布。' },
  { title: '赔率维度', detail: '纳入市场赔率变化和分歧程度，用于校准模型输出置信区间。' },
];
