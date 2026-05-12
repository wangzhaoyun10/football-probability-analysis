const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

const {
  getCompetitions,
  getCompetitionMatches,
  getCompetitionStandings,
  getCompetitionTeams,
  PROVIDER: FOOTBALL_PROVIDER,
} = require('./footballDataProvider.cjs');

const {
  calculate: calculatePrediction,
  generateConclusion,
} = require('./predictionEngine.cjs');

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

// 健康检查接口
app.get('/api/health', async (req, res) => {
  try {
    const result = await pool.query('select current_database() as database_name, now() as current_time');
    res.json({
      status: 'ok',
      database: result.rows[0].database_name,
      currentTime: result.rows[0].current_time,
    });
  } catch (error) {
    console.error('数据库连接失败:', error);
    res.status(500).json({
      status: 'error',
      message: '数据库连接失败',
      detail: error.message,
    });
  }
});

// 比赛列表接口
app.get('/api/matches', async (req, res) => {
  try {
    const competition = req.query.competition || null;

    let sql = `
      select
        m.id,
        m.match_time,
        m.venue,
        m.status,
        m.home_score,
        m.away_score,
        m.competition_code,
        l.id as league_id,
        l.name as league_name,
        l.code as league_code,
        ht.id as home_team_id,
        ht.name as home_team_name,
        at.id as away_team_id,
        at.name as away_team_name,
        coalesce(m.home_win_probability, p.home_win_probability, 0) as home_win_probability,
        coalesce(m.draw_probability, p.draw_probability, 0) as draw_probability,
        coalesce(m.away_win_probability, p.away_win_probability, 0) as away_win_probability,
        coalesce(m.conclusion, p.conclusion) as conclusion
      from matches m
      join leagues l on m.league_id = l.id
      join teams ht on m.home_team_id = ht.id
      join teams at on m.away_team_id = at.id
      left join match_predictions p on p.match_id = m.id
    `;

    const params = [];
    if (competition) {
      sql += ` where m.competition_code = $1`;
      params.push(competition);
    }

    sql += ` order by m.match_time asc;`;

    const result = await pool.query(sql, params);

    const matches = result.rows.map(row => ({
      id: row.id,
      leagueId: row.league_id,
      leagueName: row.league_name,
      leagueCode: row.league_code,
      competitionCode: row.competition_code,
      time: row.match_time,
      venue: row.venue,
      status: row.status,
      homeScore: row.home_score != null ? Number(row.home_score) : null,
      awayScore: row.away_score != null ? Number(row.away_score) : null,
      homeTeamId: row.home_team_id,
      homeTeamName: row.home_team_name,
      awayTeamId: row.away_team_id,
      awayTeamName: row.away_team_name,
      probability: {
        homeWin: Number(row.home_win_probability || 0),
        draw: Number(row.draw_probability || 0),
        awayWin: Number(row.away_win_probability || 0),
      },
      conclusion: row.conclusion,
    }));

    res.json(matches);
  } catch (error) {
    console.error('获取比赛列表失败:', error);
    res.status(500).json({
      message: '获取比赛列表失败',
      detail: error.message,
    });
  }
});

// 积分榜查询接口
app.get('/api/standings', async (req, res) => {
  try {
    const competition = req.query.competition || 'PL';

    const result = await pool.query(
      `select
         s.competition_code,
         s.team_id,
         t.name as team_name,
         t.crest as team_crest,
         s.position,
         s.played_games,
         s.wins,
         s.draws,
         s.losses,
         s.goals_for,
         s.goals_against,
         s.goal_difference,
         s.points,
         s.form,
         s.updated_at
       from standings s
       join teams t on t.id = s.team_id
       where s.competition_code = $1
       order by s.position asc`,
      [competition]
    );

    if (result.rows.length === 0) {
      return res.json({
        competition,
        count: 0,
        standings: [],
        message: '暂无积分榜数据，请先同步积分榜',
      });
    }

    const standings = result.rows.map(row => ({
      competition_code: row.competition_code,
      team_id: row.team_id,
      team_name: row.team_name,
      team_crest: row.team_crest,
      position: Number(row.position),
      played_games: Number(row.played_games),
      wins: Number(row.wins),
      draws: Number(row.draws),
      losses: Number(row.losses),
      goals_for: Number(row.goals_for),
      goals_against: Number(row.goals_against),
      goal_difference: Number(row.goal_difference),
      points: Number(row.points),
      form: row.form,
      updated_at: row.updated_at,
    }));

    res.json({
      competition,
      count: standings.length,
      standings,
    });
  } catch (error) {
    console.error('获取积分榜失败:', error);
    res.status(500).json({
      message: '获取积分榜失败',
      detail: error.message,
    });
  }
});

// 比赛详情接口
app.get('/api/matches/:id', async (req, res) => {
  const { id } = req.params;

  try {
    // Coalesce probability from both matches and match_predictions tables
    const matchSql = `
      select
        m.id,
        m.match_time,
        m.venue,
        m.status,
        m.home_score,
        m.away_score,
        m.home_win_probability as m_home_prob,
        m.draw_probability as m_draw_prob,
        m.away_win_probability as m_away_prob,
        m.conclusion as m_conclusion,
        l.id as league_id,
        l.name as league_name,
        ht.id as home_team_id,
        ht.name as home_team_name,
        at.id as away_team_id,
        at.name as away_team_name,
        p.home_win_probability as p_home_prob,
        p.draw_probability as p_draw_prob,
        p.away_win_probability as p_away_prob,
        p.conclusion as p_conclusion,
        p.model_version
      from matches m
      join leagues l on m.league_id = l.id
      join teams ht on m.home_team_id = ht.id
      join teams at on m.away_team_id = at.id
      left join match_predictions p on p.match_id = m.id
      where m.id = $1;
    `;

    const matchResult = await pool.query(matchSql, [id]);

    if (matchResult.rows.length === 0) {
      return res.status(404).json({
        message: '未找到比赛',
      });
    }

    const row = matchResult.rows[0];

    const statsResult = await pool.query(
      `
      select
        s.side,
        t.id as team_id,
        t.name as team_name,
        s.recent_form,
        s.attack_score,
        s.defense_score,
        s.possession,
        s.shots
      from match_team_stats s
      join teams t on s.team_id = t.id
      where s.match_id = $1
      order by s.side;
      `,
      [id]
    );

    const h2hResult = await pool.query(
      `
      select id, score_text
      from head_to_head
      where match_id = $1
      order by id;
      `,
      [id]
    );

    const signalsResult = await pool.query(
      `
      select label, value, sort_order
      from prediction_signals
      where match_id = $1
      order by sort_order;
      `,
      [id]
    );

    const homeStats = statsResult.rows.find(item => item.side === 'home');
    const awayStats = statsResult.rows.find(item => item.side === 'away');

    // ---- Coalesce probability: prefer matches table, fallback to match_predictions ----
    const homeProb = row.m_home_prob != null ? Number(row.m_home_prob) : (row.p_home_prob != null ? Number(row.p_home_prob) : null);
    const drawProb = row.m_draw_prob != null ? Number(row.m_draw_prob) : (row.p_draw_prob != null ? Number(row.p_draw_prob) : null);
    const awayProb = row.m_away_prob != null ? Number(row.m_away_prob) : (row.p_away_prob != null ? Number(row.p_away_prob) : null);
    const probabilityComputed = homeProb != null && drawProb != null && awayProb != null;
    const conclusionText = row.m_conclusion || row.p_conclusion || '';

    // ---- Load standings data via predictionEngine lookup ----
    const leagueCodeResult = await pool.query(
      `select code from leagues where id = $1`, [row.league_id]
    );
    const leagueCode = leagueCodeResult.rows[0]?.code || row.league_id;

    const homeStandingResult = await pool.query(
      `select position, played_games, wins, draws, losses, goals_for, goals_against,
              points, form
       from standings
       where competition_code = $1 and team_id = $2`,
      [leagueCode, row.home_team_id]
    );

    const awayStandingResult = await pool.query(
      `select position, played_games, wins, draws, losses, goals_for, goals_against,
              points, form
       from standings
       where competition_code = $1 and team_id = $2`,
      [leagueCode, row.away_team_id]
    );

    const homeStanding = homeStandingResult.rows[0] || null;
    const awayStanding = awayStandingResult.rows[0] || null;
    const standingsComplete = homeStanding != null && awayStanding != null;

    // ---- Use predictionEngine to generate prediction + analysis factors ----
    const prediction = calculatePrediction(homeStanding, awayStanding, leagueCode);
    const engineConclusion = generateConclusion(prediction, row.home_team_name, row.away_team_name);

    // Build comprehensive analysisFactors from prediction engine output + standings
    const engFactors = prediction.factors || {};
    const homePts = homeStanding?.points ?? 0;
    const awayPts = awayStanding?.points ?? 0;
    const homeGd = (homeStanding?.goals_for ?? 0) - (homeStanding?.goals_against ?? 0);
    const awayGd = (awayStanding?.goals_for ?? 0) - (awayStanding?.goals_against ?? 0);

    const analysisFactors = {
      // rankings
      homeRank: homeStanding?.position ?? null,
      awayRank: awayStanding?.position ?? null,
      // points
      homePoints: homePts,
      awayPoints: awayPts,
      pointsDiff: homePts - awayPts,
      // goals
      homeGoalsFor: homeStanding?.goals_for ?? 0,
      awayGoalsFor: awayStanding?.goals_for ?? 0,
      homeGoalsAgainst: homeStanding?.goals_against ?? 0,
      awayGoalsAgainst: awayStanding?.goals_against ?? 0,
      goalDiff: homeGd - awayGd,
      // recent form
      homeRecentForm: homeStanding?.form || '暂无数据',
      awayRecentForm: awayStanding?.form || '暂无数据',
      // win rate
      homeWinRate: homeStanding && homeStanding.played_games > 0
        ? Math.round((homeStanding.wins / homeStanding.played_games) * 100) + '%'
        : '暂无数据',
      awayWinRate: awayStanding && awayStanding.played_games > 0
        ? Math.round((awayStanding.wins / awayStanding.played_games) * 100) + '%'
        : '暂无数据',
      // meta
      homeAdvantage: '+8 分主场加成',
      modelDescription: '基于积分榜排名的规则模型（排名差 + 近期状态 + 净胜球 + 胜率 + 主场优势）',
      dataSource: standingsComplete ? '积分榜数据完整' : '缺少完整积分榜数据，使用基础规则估算',
      standingsComplete,
    };

    const match = {
      id: row.id,
      leagueId: row.league_id,
      leagueName: row.league_name,
      time: row.match_time,
      venue: row.venue,
      status: row.status,
      homeScore: row.home_score != null ? Number(row.home_score) : null,
      awayScore: row.away_score != null ? Number(row.away_score) : null,
      homeTeamId: row.home_team_id,
      homeTeamName: row.home_team_name,
      awayTeamId: row.away_team_id,
      awayTeamName: row.away_team_name,
      probability: {
        homeWin: homeProb,
        draw: drawProb,
        awayWin: awayProb,
        computed: probabilityComputed,
      },
      form: {
        home: homeStats?.recent_form || [],
        away: awayStats?.recent_form || [],
      },
      attackDefense: {
        home: {
          attack: Number(homeStats?.attack_score || 0),
          defense: Number(homeStats?.defense_score || 0),
          possession: Number(homeStats?.possession || 0),
          shots: Number(homeStats?.shots || 0),
        },
        away: {
          attack: Number(awayStats?.attack_score || 0),
          defense: Number(awayStats?.defense_score || 0),
          possession: Number(awayStats?.possession || 0),
          shots: Number(awayStats?.shots || 0),
        },
      },
      analysisFactors,
      headToHead: h2hResult.rows.map(item => ({
        id: item.id,
        score: item.score_text,
      })),
      conclusion: conclusionText,
      engineConclusion,
      modelVersion: row.model_version,
      signals: signalsResult.rows.map(item => ({
        label: item.label,
        value: item.value,
      })),
    };

    res.json(match);
  } catch (error) {
    console.error('获取比赛详情失败:', error);
    res.status(500).json({
      message: '获取比赛详情失败',
      detail: error.message,
    });
  }
});

// 更新比赛预测数据接口
app.put('/api/matches/:id/prediction', async (req, res) => {
  const { id } = req.params;
  const { homeWin, draw, awayWin, conclusion } = req.body;
  const homeWinProbability = Number(homeWin);
  const drawProbability = Number(draw);
  const awayWinProbability = Number(awayWin);

  if (![homeWinProbability, drawProbability, awayWinProbability].every(Number.isFinite)) {
    return res.status(400).json({
      message: '概率必须为有效数字',
    });
  }

  if (homeWinProbability + drawProbability + awayWinProbability !== 100) {
    return res.status(400).json({
      message: '概率合计必须等于 100',
    });
  }

  try {
    const matchResult = await pool.query('select id from matches where id = $1', [id]);

    if (matchResult.rows.length === 0) {
      return res.status(404).json({
        message: '未找到比赛',
      });
    }

    const updateResult = await pool.query(
      `
      update match_predictions
      set
        home_win_probability = $2,
        draw_probability = $3,
        away_win_probability = $4,
        conclusion = $5
      where match_id = $1
      returning
        match_id,
        home_win_probability,
        draw_probability,
        away_win_probability,
        conclusion;
      `,
      [id, homeWinProbability, drawProbability, awayWinProbability, conclusion || '']
    );

    const predictionResult = updateResult.rows.length > 0
      ? updateResult
      : await pool.query(
          `
          insert into match_predictions (
            match_id,
            home_win_probability,
            draw_probability,
            away_win_probability,
            conclusion,
            model_version
          )
          values ($1, $2, $3, $4, $5, 'manual')
          returning
            match_id,
            home_win_probability,
            draw_probability,
            away_win_probability,
            conclusion;
          `,
          [id, homeWinProbability, drawProbability, awayWinProbability, conclusion || '']
        );

    const row = predictionResult.rows[0];

    res.json({
      matchId: row.match_id,
      probability: {
        homeWin: Number(row.home_win_probability),
        draw: Number(row.draw_probability),
        awayWin: Number(row.away_win_probability),
      },
      conclusion: row.conclusion,
    });
  } catch (error) {
    console.error('更新比赛预测数据失败:', error);
    res.status(500).json({
      message: '更新比赛预测数据失败',
      detail: error.message,
    });
  }
});

// 保存比赛实际赛果接口
app.put('/api/matches/:id/result', async (req, res) => {
  const { id } = req.params;
  const { homeScore, awayScore } = req.body;

  if (homeScore == null || awayScore == null) {
    return res.status(400).json({
      message: '主队比分和客队比分为必填字段',
    });
  }

  const homeScoreNum = Number(homeScore);
  const awayScoreNum = Number(awayScore);

  if (!Number.isInteger(homeScoreNum) || !Number.isInteger(awayScoreNum) || homeScoreNum < 0 || awayScoreNum < 0) {
    return res.status(400).json({
      message: '比分必须为非负整数',
    });
  }

  try {
    const result = await pool.query(
      `
      update matches
      set home_score = $2, away_score = $3, status = '已结束'
      where id = $1
      returning id, home_score, away_score, status;
      `,
      [id, homeScoreNum, awayScoreNum]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        message: '未找到比赛',
      });
    }

    res.json({ message: '赛果保存成功' });
  } catch (error) {
    console.error('保存赛果失败:', error);
    res.status(500).json({
      message: '保存赛果失败',
      detail: error.message,
    });
  }
});

// 确定实际赛果
function getActualResult(homeScore, awayScore) {
  if (homeScore > awayScore) return '主胜';
  if (homeScore < awayScore) return '客胜';
  return '平局';
}

// 确定预测结果（取最高概率；并列则返回不明确）
function getPredictedResult(prob) {
  const homeWin = Number(prob.home_win_probability || 0);
  const draw = Number(prob.draw_probability || 0);
  const awayWin = Number(prob.away_win_probability || 0);
  const max = Math.max(homeWin, draw, awayWin);
  const winners = [
    { label: '主胜', value: homeWin },
    { label: '平局', value: draw },
    { label: '客胜', value: awayWin },
  ].filter((item) => item.value === max);

  if (winners.length !== 1) return '不明确';
  return winners[0].label;
}

// 回测明细接口
app.get('/api/backtest/matches', async (req, res) => {
  try {
    const sql = `
      select
        m.id,
        m.home_score,
        m.away_score,
        l.name as league_name,
        ht.name as home_team_name,
        at.name as away_team_name,
        p.home_win_probability,
        p.draw_probability,
        p.away_win_probability
      from matches m
      join leagues l on m.league_id = l.id
      join teams ht on m.home_team_id = ht.id
      join teams at on m.away_team_id = at.id
      left join match_predictions p on p.match_id = m.id
      where m.status = '已结束'
        and m.home_score is not null
        and m.away_score is not null
      order by m.match_time asc;
    `;

    const result = await pool.query(sql);

    const items = result.rows.map((row) => {
      const actualResult = getActualResult(row.home_score, row.away_score);
      const predictedResult = getPredictedResult(row);
      const isHit = predictedResult === actualResult;

      return {
        matchId: row.id,
        leagueName: row.league_name,
        homeTeamName: row.home_team_name,
        awayTeamName: row.away_team_name,
        homeScore: row.home_score,
        awayScore: row.away_score,
        actualResult,
        predictedResult,
        homeWinProbability: Number(row.home_win_probability || 0),
        drawProbability: Number(row.draw_probability || 0),
        awayWinProbability: Number(row.away_win_probability || 0),
        isHit,
      };
    });

    res.json(items);
  } catch (error) {
    console.error('获取回测明细失败:', error);
    res.status(500).json({
      message: '获取回测明细失败',
      detail: error.message,
    });
  }
});

// 回测统计汇总接口
app.get('/api/backtest/summary', async (req, res) => {
  try {
    const sql = `
      select
        m.id,
        m.home_score,
        m.away_score,
        l.name as league_name,
        p.home_win_probability,
        p.draw_probability,
        p.away_win_probability
      from matches m
      join leagues l on m.league_id = l.id
      join teams ht on m.home_team_id = ht.id
      join teams at on m.away_team_id = at.id
      left join match_predictions p on p.match_id = m.id
      where m.status = '已结束'
        and m.home_score is not null
        and m.away_score is not null
      order by m.match_time asc;
    `;

    const result = await pool.query(sql);

    const items = result.rows.map((row) => {
      const actualResult = getActualResult(row.home_score, row.away_score);
      const predictedResult = getPredictedResult(row);
      return {
        leagueName: row.league_name,
        isHit: predictedResult === actualResult,
      };
    });

    const totalFinishedMatches = items.length;
    const hitCount = items.filter((item) => item.isHit).length;
    const missCount = totalFinishedMatches - hitCount;
    const hitRate = totalFinishedMatches > 0 ? Math.round((hitCount / totalFinishedMatches) * 100 * 100) / 100 : 0;

    // 按联赛分组统计
    const leagueMap = {};
    for (const item of items) {
      if (!leagueMap[item.leagueName]) {
        leagueMap[item.leagueName] = { total: 0, hitCount: 0 };
      }
      leagueMap[item.leagueName].total += 1;
      if (item.isHit) {
        leagueMap[item.leagueName].hitCount += 1;
      }
    }

    const byLeague = Object.entries(leagueMap).map(([leagueName, stats]) => ({
      leagueName,
      total: stats.total,
      hitCount: stats.hitCount,
      hitRate: stats.total > 0 ? Math.round((stats.hitCount / stats.total) * 100 * 100) / 100 : 0,
    }));

    res.json({
      totalFinishedMatches,
      hitCount,
      missCount,
      hitRate,
      byLeague,
    });
  } catch (error) {
    console.error('获取回测统计失败:', error);
    res.status(500).json({
      message: '获取回测统计失败',
      detail: error.message,
    });
  }
});

// ============================================================
// 数据同步 - 模拟同步比赛数据
// ============================================================
app.post('/api/sync/matches', async (req, res) => {
  const startedAt = new Date().toISOString();

  // 写入一条 running 状态的日志
  let logId = null;
  try {
    const logResult = await pool.query(
      `insert into sync_logs (sync_type, source, status, total_count, success_count, failed_count, started_at)
       values ('matches', 'mock-provider', 'running', 0, 0, 0, $1)
       returning id`,
      [startedAt]
    );
    logId = logResult.rows[0].id;
  } catch (error) {
    console.error('写入同步日志失败:', error);
    return res.status(500).json({ message: '写入同步日志失败', detail: error.message });
  }

  // ---------- 模拟数据定义 ----------
  const mockSyncData = [
    {
      matchId: 'liv-che',
      leagueId: 'premier-league',
      leagueName: '英超',
      leagueCountry: '英格兰',
      homeTeamId: 'liverpool',
      homeTeamName: '利物浦',
      awayTeamId: 'chelsea',
      awayTeamName: '切尔西',
      matchTime: '2026-05-17 22:00:00+08',
      venue: '安菲尔德球场',
      probability: { homeWin: 48, draw: 28, awayWin: 24 },
      conclusion: '利物浦主场优势明显，近期状态优于切尔西，看好主队不败。',
    },
    {
      matchId: 'psg-mar',
      leagueId: 'ligue-1',
      leagueName: '法甲',
      leagueCountry: '法国',
      homeTeamId: 'psg',
      homeTeamName: '巴黎圣日耳曼',
      awayTeamId: 'marseille',
      awayTeamName: '马赛',
      matchTime: '2026-05-18 03:45:00+08',
      venue: '王子公园球场',
      probability: { homeWin: 55, draw: 25, awayWin: 20 },
      conclusion: '巴黎圣日耳曼整体实力远超马赛，主场作战胜算极高。',
    },
  ];

  let totalCount = mockSyncData.length;
  let successCount = 0;
  let failedCount = 0;

  for (const item of mockSyncData) {
    try {
      // 1. 联赛不存在则插入
      await pool.query(
        `insert into leagues (id, name, country)
         values ($1, $2, $3)
         on conflict (id) do update set name = excluded.name, country = excluded.country`,
        [item.leagueId, item.leagueName, item.leagueCountry]
      );

      // 2. 主队不存在则插入
      await pool.query(
        `insert into teams (id, name, league_id)
         values ($1, $2, $3)
         on conflict (id) do update set name = excluded.name, league_id = excluded.league_id`,
        [item.homeTeamId, item.homeTeamName, item.leagueId]
      );

      // 3. 客队不存在则插入
      await pool.query(
        `insert into teams (id, name, league_id)
         values ($1, $2, $3)
         on conflict (id) do update set name = excluded.name, league_id = excluded.league_id`,
        [item.awayTeamId, item.awayTeamName, item.leagueId]
      );

      // 4. 比赛不存在则插入，存在则更新
      await pool.query(
        `insert into matches (id, league_id, home_team_id, away_team_id, match_time, venue, status)
         values ($1, $2, $3, $4, $5, $6, '未开始')
         on conflict (id) do update
           set league_id = excluded.league_id,
               home_team_id = excluded.home_team_id,
               away_team_id = excluded.away_team_id,
               match_time = excluded.match_time,
               venue = excluded.venue`,
        [item.matchId, item.leagueId, item.homeTeamId, item.awayTeamId, item.matchTime, item.venue]
      );

      // 5. 预测数据：先删后插，确保始终有且仅有一条
      await pool.query('delete from match_predictions where match_id = $1', [item.matchId]);
      await pool.query(
        `insert into match_predictions (match_id, home_win_probability, draw_probability, away_win_probability, conclusion, model_version)
         values ($1, $2, $3, $4, $5, 'mock-sync')`,
        [item.matchId, item.probability.homeWin, item.probability.draw, item.probability.awayWin, item.conclusion]
      );

      successCount += 1;
    } catch (error) {
      failedCount += 1;
      console.error(`同步比赛 ${item.matchId} 失败:`, error);
    }
  }

  // 更新 sync_logs
  const finishedAt = new Date().toISOString();
  const finalStatus = failedCount === 0 ? 'success' : (successCount === 0 ? 'failed' : 'success');

  await pool.query(
    `update sync_logs
     set status = $2, total_count = $3, success_count = $4, failed_count = $5,
         message = $6, finished_at = $7
     where id = $1`,
    [
      logId,
      finalStatus,
      totalCount,
      successCount,
      failedCount,
      `比赛数据同步完成：成功 ${successCount} 条，失败 ${failedCount} 条`,
      finishedAt,
    ]
  );

  res.json({
    message: '比赛数据同步完成',
    totalCount,
    successCount,
    failedCount,
  });
});

// ---------- 查询同步日志 ----------
app.get('/api/sync/logs', async (req, res) => {
  try {
    const result = await pool.query(
      `select id, sync_type, source, status, message, total_count, success_count, failed_count,
              started_at, finished_at, created_at
       from sync_logs
       order by created_at desc
       limit 20`
    );

    const logs = result.rows.map((row) => ({
      id: String(row.id),
      syncType: row.sync_type,
      source: row.source,
      status: row.status,
      message: row.message,
      totalCount: row.total_count,
      successCount: row.success_count,
      failedCount: row.failed_count,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
    }));

    res.json(logs);
  } catch (error) {
    console.error('获取同步日志失败:', error);
    res.status(500).json({ message: '获取同步日志失败', detail: error.message });
  }
});

// ---------- 查询最近一次同步状态 ----------
app.get('/api/sync/status', async (req, res) => {
  try {
    const result = await pool.query(
      `select id, sync_type, source, status, message, total_count, success_count, failed_count,
              started_at, finished_at, created_at
       from sync_logs
       order by created_at desc
       limit 1`
    );

    if (result.rows.length === 0) {
      return res.json({ message: '暂无同步记录' });
    }

    const row = result.rows[0];
    res.json({
      id: String(row.id),
      syncType: row.sync_type,
      source: row.source,
      status: row.status,
      message: row.message,
      totalCount: row.total_count,
      successCount: row.success_count,
      failedCount: row.failed_count,
      startedAt: row.started_at,
      finishedAt: row.finished_at,
      createdAt: row.created_at,
    });
  } catch (error) {
    console.error('获取同步状态失败:', error);
    res.status(500).json({ message: '获取同步状态失败', detail: error.message });
  }
});

// ============================================================
// football-data.org 同步 - 辅助函数
// ============================================================

/**
 * 写入一条同步日志并返回日志ID
 */
async function createSyncLog(syncType) {
  const startedAt = new Date().toISOString();
  const result = await pool.query(
    `insert into sync_logs (sync_type, source, status, total_count, success_count, failed_count, started_at)
     values ($1, $2, 'running', 0, 0, 0, $3)
     returning id`,
    [syncType, FOOTBALL_PROVIDER, startedAt]
  );
  return result.rows[0].id;
}

/**
 * 更新同步日志为最终状态
 */
async function finishSyncLog(logId, status, totalCount, successCount, failedCount, message) {
  const finishedAt = new Date().toISOString();
  await pool.query(
    `update sync_logs
     set status = $2, total_count = $3, success_count = $4, failed_count = $5,
         message = $6, finished_at = $7
     where id = $1`,
    [logId, status, totalCount, successCount, failedCount, message, finishedAt]
  );
}

/**
 * 错误时更新同步日志
 */
async function failSyncLog(logId, errorMessage) {
  const finishedAt = new Date().toISOString();
  await pool.query(
    `update sync_logs
     set status = 'failed', message = $2, finished_at = $3
     where id = $1`,
    [logId, errorMessage, finishedAt]
  );
}

// ============================================================
// POST /api/sync/football/competitions
// ============================================================
app.post('/api/sync/football/competitions', async (req, res) => {
  let logId = null;
  try {
    logId = await createSyncLog('competitions');
    const competitions = await getCompetitions();

    let successCount = 0;
    let failedCount = 0;

    for (const c of competitions) {
      try {
        await pool.query(
          `insert into leagues (id, name, code, area, country, season_start_date, season_end_date)
           values ($1, $2, $3, $4, $5, $6, $7)
           on conflict (id) do update
             set name = excluded.name,
                 code = excluded.code,
                 area = excluded.area,
                 country = excluded.country,
                 season_start_date = excluded.season_start_date,
                 season_end_date = excluded.season_end_date`,
          [c.id, c.name, c.code, c.area, c.area, c.seasonStartDate, c.seasonEndDate]
        );
        successCount++;
      } catch (err) {
        failedCount++;
        console.error(`同步联赛 ${c.name} 失败:`, err.message);
      }
    }

    const status = failedCount > 0 && successCount === 0 ? 'failed' : 'success';
    const message = `联赛同步完成：成功 ${successCount} 条，失败 ${failedCount} 条`;
    await finishSyncLog(logId, status, competitions.length, successCount, failedCount, message);

    res.json({ message, totalCount: competitions.length, successCount, failedCount });
  } catch (error) {
    console.error('同步联赛失败:', error);
    if (logId) await failSyncLog(logId, error.message);
    res.status(500).json({ message: '同步联赛失败', detail: error.message });
  }
});

/**
 * 根据 competition code 查找 league ID
 * 先在 leagues 表中按 code 查找，找不到再用 code 本身作为 ID（兼容未先同步联赛的场景）
 */
async function resolveLeagueId(competitionCode) {
  const result = await pool.query(
    `select id from leagues where code = $1 limit 1`,
    [competitionCode]
  );
  if (result.rows.length > 0) {
    return result.rows[0].id;
  }
  // 回退：直接用 code 作为 league_id（需要先同步联赛才有完整的 id 映射）
  return competitionCode;
}

// ============================================================
// POST /api/sync/football/matches?competition=PL
// ============================================================
app.post('/api/sync/football/matches', async (req, res) => {
  const { competition } = req.query;
  if (!competition) {
    return res.status(400).json({ message: '缺少 competition 参数，例如 ?competition=PL' });
  }

  let logId = null;
  try {
    logId = await createSyncLog(`matches-${competition}`);
    const leagueId = await resolveLeagueId(competition);
    const matches = await getCompetitionMatches(competition);

    let successCount = 0;
    let failedCount = 0;

    for (const m of matches) {
      try {
        // Upsert home team (use leagueId for league_id)
        await pool.query(
          `insert into teams (id, name, short_name, crest, country, league_id)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (id) do update
             set name = excluded.name,
                 short_name = excluded.short_name,
                 crest = excluded.crest,
                 country = excluded.country`,
          [m.homeTeamId, m.homeTeamName, m.homeTeamShortName, m.homeTeamCrest, '', leagueId]
        );

        // Upsert away team
        await pool.query(
          `insert into teams (id, name, short_name, crest, country, league_id)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (id) do update
             set name = excluded.name,
                 short_name = excluded.short_name,
                 crest = excluded.crest,
                 country = excluded.country`,
          [m.awayTeamId, m.awayTeamName, m.awayTeamShortName, m.awayTeamCrest, '', leagueId]
        );

        // Upsert match (league_id references leagues.id)
        await pool.query(
          `insert into matches (id, league_id, home_team_id, away_team_id, match_time, status, home_score, away_score, competition_code)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           on conflict (id) do update
             set league_id = excluded.league_id,
                 home_team_id = excluded.home_team_id,
                 away_team_id = excluded.away_team_id,
                 match_time = excluded.match_time,
                 status = excluded.status,
                 home_score = excluded.home_score,
                 away_score = excluded.away_score,
                 competition_code = excluded.competition_code`,
          [
            m.id,
            leagueId,
            m.homeTeamId,
            m.awayTeamId,
            m.matchTime,
            m.status,
            m.homeScore,
            m.awayScore,
            competition,
          ]
        );

        successCount++;
      } catch (err) {
        failedCount++;
        console.error(`同步比赛 ${m.id} 失败:`, err.message);
      }
    }

    const status = failedCount > 0 && successCount === 0 ? 'failed' : 'success';
    const message = `比赛同步完成 [${competition}]：成功 ${successCount} 条，失败 ${failedCount} 条`;
    await finishSyncLog(logId, status, matches.length, successCount, failedCount, message);

    res.json({ message, totalCount: matches.length, successCount, failedCount });
  } catch (error) {
    console.error('同步比赛失败:', error);
    if (logId) await failSyncLog(logId, error.message);
    res.status(500).json({ message: '同步比赛失败', detail: error.message });
  }
});

// ============================================================
// POST /api/sync/football/standings?competition=PL
// ============================================================
app.post('/api/sync/football/standings', async (req, res) => {
  const { competition } = req.query;
  if (!competition) {
    return res.status(400).json({ message: '缺少 competition 参数，例如 ?competition=PL' });
  }

  let logId = null;
  try {
    logId = await createSyncLog(`standings-${competition}`);
    const leagueId = await resolveLeagueId(competition);
    const standings = await getCompetitionStandings(competition);

    let successCount = 0;
    let failedCount = 0;

    for (const s of standings) {
      try {
        // Upsert team first
        await pool.query(
          `insert into teams (id, name, crest, country, league_id)
           values ($1, $2, $3, $4, $5)
           on conflict (id) do update
             set name = excluded.name,
                 crest = excluded.crest,
                 country = excluded.country`,
          [s.teamId, s.teamName, s.teamCrest, '', leagueId]
        );

        // Delete previous standings for this team+competition
        await pool.query(
          `delete from standings where competition_code = $1 and team_id = $2`,
          [s.competitionCode, s.teamId]
        );

        // Insert new standing row
        await pool.query(
          `insert into standings (
             competition_code, team_id, position, played_games,
             wins, draws, losses, goals_for, goals_against, goal_difference,
             points, form, updated_at
           ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())`,
          [
            s.competitionCode,
            s.teamId,
            s.position,
            s.playedGames,
            s.wins,
            s.draws,
            s.losses,
            s.goalsFor,
            s.goalsAgainst,
            s.goalDifference,
            s.points,
            s.form,
          ]
        );

        successCount++;
      } catch (err) {
        failedCount++;
        console.error(`同步排名 ${s.teamName} 失败:`, err.message);
      }
    }

    const status = failedCount > 0 && successCount === 0 ? 'failed' : 'success';
    const message = `排名同步完成 [${competition}]：成功 ${successCount} 条，失败 ${failedCount} 条`;
    await finishSyncLog(logId, status, standings.length, successCount, failedCount, message);

    res.json({ message, totalCount: standings.length, successCount, failedCount });
  } catch (error) {
    console.error('同步排名失败:', error);
    if (logId) await failSyncLog(logId, error.message);
    res.status(500).json({ message: '同步排名失败', detail: error.message });
  }
});

// ============================================================
// POST /api/sync/football/teams?competition=PL
// ============================================================
app.post('/api/sync/football/teams', async (req, res) => {
  const { competition } = req.query;
  if (!competition) {
    return res.status(400).json({ message: '缺少 competition 参数，例如 ?competition=PL' });
  }

  let logId = null;
  try {
    logId = await createSyncLog(`teams-${competition}`);
    const leagueId = await resolveLeagueId(competition);
    const teams = await getCompetitionTeams(competition);

    let successCount = 0;
    let failedCount = 0;

    for (const t of teams) {
      try {
        await pool.query(
          `insert into teams (id, name, short_name, crest, country, league_id)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (id) do update
             set name = excluded.name,
                 short_name = excluded.short_name,
                 crest = excluded.crest,
                 country = excluded.country`,
          [t.id, t.name, t.shortName, t.crest, t.country, leagueId]
        );
        successCount++;
      } catch (err) {
        failedCount++;
        console.error(`同步球队 ${t.name} 失败:`, err.message);
      }
    }

    const status = failedCount > 0 && successCount === 0 ? 'failed' : 'success';
    const message = `球队同步完成 [${competition}]：成功 ${successCount} 条，失败 ${failedCount} 条`;
    await finishSyncLog(logId, status, teams.length, successCount, failedCount, message);

    res.json({ message, totalCount: teams.length, successCount, failedCount });
  } catch (error) {
    console.error('同步球队失败:', error);
    if (logId) await failSyncLog(logId, error.message);
    res.status(500).json({ message: '同步球队失败', detail: error.message });
  }
});

// ============================================================
// POST /api/predictions/recalculate
// 针对未开赛比赛，基于 standings 数据批量计算预测概率
// ============================================================
app.post('/api/predictions/recalculate', async (req, res) => {
  let logId = null;
  try {
    logId = await createSyncLog('predictions-recalculate');

    // 1. 获取所有未开赛（或状态为 SCHEDULED / TIMED）的比赛
    const matchResult = await pool.query(`
      select
        m.id, m.league_id, m.home_team_id, m.away_team_id,
        m.match_time, m.status,
        ht.name as home_team_name,
        at.name as away_team_name,
        l.code as league_code
      from matches m
      join teams ht on m.home_team_id = ht.id
      join teams at on m.away_team_id = at.id
      join leagues l on m.league_id = l.id
      where m.status in ('SCHEDULED', 'TIMED', '未开始')
         or (m.home_score is null and m.away_score is null)
      order by m.match_time asc
    `);

    const unplayedMatches = matchResult.rows;

    if (unplayedMatches.length === 0) {
      await finishSyncLog(logId, 'success', 0, 0, 0, '没有需要计算的未开赛比赛');
      return res.json({ message: '没有需要计算的未开赛比赛', totalCount: 0, successCount: 0, failedCount: 0 });
    }

    // 2. 批量加载 standings 数据（按 competition_code + team_id 建索引）
    const standingsMap = {};
    const standingsResult = await pool.query(`
      select competition_code, team_id, position, played_games,
             wins, draws, losses, goals_for, goals_against, points, form
      from standings
      order by competition_code, position
    `);
    for (const row of standingsResult.rows) {
      const key = `${row.competition_code}::${row.team_id}`;
      standingsMap[key] = {
        teamId: row.team_id,
        position: row.position,
        playedGames: row.played_games,
        wins: row.wins,
        draws: row.draws,
        losses: row.losses,
        goalsFor: row.goals_for,
        goalsAgainst: row.goals_against,
        points: row.points,
        form: row.form,
      };
    }

    let successCount = 0;
    let failedCount = 0;

    // 3. 逐场计算
    for (const match of unplayedMatches) {
      try {
        const leagueCode = match.league_code || match.league_id;

        const homeKey = `${leagueCode}::${match.home_team_id}`;
        const awayKey = `${leagueCode}::${match.away_team_id}`;

        const homeStats = standingsMap[homeKey] || null;
        const awayStats = standingsMap[awayKey] || null;

        const prediction = calculatePrediction(homeStats, awayStats, leagueCode);
        const conclusion = generateConclusion(prediction, match.home_team_name, match.away_team_name);

        // 更新 match_predictions（upsert）
        await pool.query(`
          insert into match_predictions (
            match_id, home_win_probability, draw_probability, away_win_probability,
            conclusion, model_version
          ) values ($1, $2, $3, $4, $5, 'rule-v1')
          on conflict (match_id) do update
            set home_win_probability = excluded.home_win_probability,
                draw_probability = excluded.draw_probability,
                away_win_probability = excluded.away_win_probability,
                conclusion = excluded.conclusion,
                model_version = excluded.model_version,
                updated_at = now()
        `, [
          match.id,
          prediction.homeWin,
          prediction.draw,
          prediction.awayWin,
          conclusion,
        ]);

        // 同步更新 matches 表概率字段
        await pool.query(`
          update matches
          set home_win_probability = $2,
              draw_probability = $3,
              away_win_probability = $4,
              conclusion = $5
          where id = $1
        `, [
          match.id,
          prediction.homeWin,
          prediction.draw,
          prediction.awayWin,
          conclusion,
        ]);

        successCount++;
      } catch (err) {
        failedCount++;
        console.error(`计算比赛 ${match.id} 预测失败:`, err.message);
      }
    }

    const status = failedCount > 0 && successCount === 0 ? 'failed' : 'success';
    const message = `预测计算完成：成功 ${successCount} 条，失败 ${failedCount} 条（共 ${unplayedMatches.length} 场未开赛比赛）`;
    await finishSyncLog(logId, status, unplayedMatches.length, successCount, failedCount, message);

    res.json({
      message,
      totalCount: unplayedMatches.length,
      successCount,
      failedCount,
    });
  } catch (error) {
    console.error('批量计算预测概率失败:', error);
    if (logId) await failSyncLog(logId, error.message);
    res.status(500).json({ message: '批量计算预测概率失败', detail: error.message });
  }
});

const port = Number(process.env.SERVER_PORT || 3001);

app.listen(port, () => {
  console.log(`足球分析系统后端已启动：http://localhost:${port}`);
});
