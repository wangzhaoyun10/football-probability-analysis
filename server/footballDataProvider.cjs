/**
 * football-data.org API Provider
 *
 * Base URL: https://api.football-data.org/v4
 * Auth: X-Auth-Token header with FOOTBALL_API_KEY
 */

const API_BASE_URL = process.env.FOOTBALL_API_BASE_URL || 'https://api.football-data.org/v4';
const API_KEY = process.env.FOOTBALL_API_KEY;
const PROVIDER = process.env.FOOTBALL_API_PROVIDER || 'football-data';

/**
 * Execute a request against football-data.org.
 * Throws on non-2xx responses.
 */
async function apiRequest(path) {
  if (!API_KEY) {
    throw new Error('FOOTBALL_API_KEY 未配置，请在 .env 中设置有效的 API Key');
  }

  const url = `${API_BASE_URL}${path}`;
  const response = await fetch(url, {
    headers: {
      'X-Auth-Token': API_KEY,
      'Accept': 'application/json',
    },
  });

  if (response.status === 429) {
    const retryAfter = response.headers.get('Retry-After') || 60;
    throw new Error(`API 请求频率限制，请等待 ${retryAfter} 秒后重试`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `football-data.org 请求失败 (${response.status}): ${body || response.statusText}`
    );
  }

  return response.json();
}

/**
 * Get list of available competitions (leagues).
 * Endpoint: GET /competitions
 */
async function getCompetitions() {
  const data = await apiRequest('/competitions');
  return (data.competitions || []).map(mapCompetition);
}

/**
 * Get matches for a competition.
 * Endpoint: GET /competitions/{code}/matches
 */
async function getCompetitionMatches(competitionCode) {
  const data = await apiRequest(`/competitions/${encodeURIComponent(competitionCode)}/matches`);
  return (data.matches || []).map((m) => mapMatch(m, competitionCode));
}

/**
 * Get standings for a competition.
 * Endpoint: GET /competitions/{code}/standings
 */
async function getCompetitionStandings(competitionCode) {
  const data = await apiRequest(`/competitions/${encodeURIComponent(competitionCode)}/standings`);

  const result = [];
  const standings = data.standings || [];
  for (const group of standings) {
    const table = group.table || [];
    for (const row of table) {
      result.push(mapStandingRow(row, competitionCode));
    }
  }
  return result;
}

/**
 * Get teams for a competition.
 * Endpoint: GET /competitions/{code}/teams
 */
async function getCompetitionTeams(competitionCode) {
  const data = await apiRequest(`/competitions/${encodeURIComponent(competitionCode)}/teams`);
  return (data.teams || []).map(mapTeam);
}

// ---------------------------------------------------------------------------
// Mapping helpers: football-data.org → internal DB shape
// ---------------------------------------------------------------------------

function mapCompetition(c) {
  const season = c.currentSeason || {};
  const area = c.area || {};
  return {
    id: String(c.id),
    name: c.name || '',
    code: c.code || '',
    area: area.name || '',
    seasonStartDate: season.startDate || null,
    seasonEndDate: season.endDate || null,
  };
}

function mapTeam(t) {
  const area = t.area || {};
  return {
    id: String(t.id),
    name: t.name || '',
    shortName: t.shortName || t.tla || '',
    crest: t.crest || '',
    country: area.name || '',
  };
}

function mapMatch(m, competitionCode) {
  const homeTeam = m.homeTeam || {};
  const awayTeam = m.awayTeam || {};
  const score = m.score || {};
  const fullTime = score.fullTime || {};

  return {
    id: String(m.id),
    competitionCode: competitionCode,
    homeTeamId: String(homeTeam.id || ''),
    homeTeamName: homeTeam.name || '',
    homeTeamShortName: homeTeam.shortName || homeTeam.tla || '',
    homeTeamCrest: homeTeam.crest || '',
    awayTeamId: String(awayTeam.id || ''),
    awayTeamName: awayTeam.name || '',
    awayTeamShortName: awayTeam.shortName || awayTeam.tla || '',
    awayTeamCrest: awayTeam.crest || '',
    matchTime: m.utcDate || null,
    status: mapMatchStatus(m.status),
    homeScore: fullTime.home != null ? fullTime.home : null,
    awayScore: fullTime.away != null ? fullTime.away : null,
  };
}

function mapMatchStatus(apiStatus) {
  const map = {
    SCHEDULED: '未开始',
    TIMED: '未开始',
    IN_PLAY: '进行中',
    LIVE: '进行中',
    PAUSED: '暂停',
    FINISHED: '已结束',
    AWARDED: '已结束',
    POSTPONED: '延期',
    SUSPENDED: '延期',
    CANCELLED: '取消',
  };
  return map[apiStatus] || apiStatus || '未开始';
}

function mapStandingRow(row, competitionCode) {
  const team = row.team || {};
  return {
    competitionCode: competitionCode,
    teamId: String(team.id),
    teamName: team.name || '',
    teamCrest: team.crest || '',
    position: row.position || 0,
    playedGames: row.playedGames || 0,
    wins: row.won || 0,
    draws: row.draw || 0,
    losses: row.lost || 0,
    goalsFor: row.goalsFor || 0,
    goalsAgainst: row.goalsAgainst || 0,
    goalDifference: row.goalDifference || 0,
    points: row.points || 0,
    form: row.form || '',
  };
}

module.exports = {
  getCompetitions,
  getCompetitionMatches,
  getCompetitionStandings,
  getCompetitionTeams,
  PROVIDER,
  // Exported for testing
  _mapCompetition: mapCompetition,
  _mapTeam: mapTeam,
  _mapMatch: mapMatch,
  _mapStandingRow: mapStandingRow,
};