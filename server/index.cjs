const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
require('dotenv').config();

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
    const sql = `
      select
        m.id,
        m.match_time,
        m.venue,
        m.status,
        m.home_score,
        m.away_score,
        l.id as league_id,
        l.name as league_name,
        ht.id as home_team_id,
        ht.name as home_team_name,
        at.id as away_team_id,
        at.name as away_team_name,
        p.home_win_probability,
        p.draw_probability,
        p.away_win_probability,
        p.conclusion
      from matches m
      join leagues l on m.league_id = l.id
      join teams ht on m.home_team_id = ht.id
      join teams at on m.away_team_id = at.id
      left join match_predictions p on p.match_id = m.id
      order by m.match_time asc;
    `;

    const result = await pool.query(sql);

    const matches = result.rows.map(row => ({
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

// 比赛详情接口
app.get('/api/matches/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const matchSql = `
      select
        m.id,
        m.match_time,
        m.venue,
        m.status,
        m.home_score,
        m.away_score,
        l.id as league_id,
        l.name as league_name,
        ht.id as home_team_id,
        ht.name as home_team_name,
        at.id as away_team_id,
        at.name as away_team_name,
        p.home_win_probability,
        p.draw_probability,
        p.away_win_probability,
        p.conclusion,
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
        homeWin: Number(row.home_win_probability || 0),
        draw: Number(row.draw_probability || 0),
        awayWin: Number(row.away_win_probability || 0),
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
      headToHead: h2hResult.rows.map(item => ({
        id: item.id,
        score: item.score_text,
      })),
      conclusion: row.conclusion,
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

const port = Number(process.env.SERVER_PORT || 3001);

app.listen(port, () => {
  console.log(`足球分析系统后端已启动：http://localhost:${port}`);
});
