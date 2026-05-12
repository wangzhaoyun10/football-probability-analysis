const API_BASE_URL = 'http://localhost:3001';

export async function fetchMatches(competition) {
  const url = competition
    ? `${API_BASE_URL}/api/matches?competition=${encodeURIComponent(competition)}`
    : `${API_BASE_URL}/api/matches`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error('获取比赛列表失败');
  }

  return response.json();
}

export async function saveMatchResult(id, result) {
  const response = await fetch(`${API_BASE_URL}/api/matches/${encodeURIComponent(id)}/result`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(result),
  });

  if (!response.ok) {
    let message = '保存赛果失败';

    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies.
    }

    const error = new Error(response.status === 404 ? '未找到比赛' : message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchBacktestMatches() {
  const response = await fetch(`${API_BASE_URL}/api/backtest/matches`);

  if (!response.ok) {
    throw new Error('获取回测明细失败');
  }

  return response.json();
}

export async function fetchBacktestSummary() {
  const response = await fetch(`${API_BASE_URL}/api/backtest/summary`);

  if (!response.ok) {
    throw new Error('获取回测统计失败');
  }

  return response.json();
}

export async function fetchMatchById(id) {
  const response = await fetch(`${API_BASE_URL}/api/matches/${encodeURIComponent(id)}`);

  if (!response.ok) {
    throw new Error('获取比赛详情失败');
  }

  return response.json();
}

export async function syncMatches() {
  const response = await fetch(`${API_BASE_URL}/api/sync/matches`, {
    method: 'POST',
  });

  if (!response.ok) {
    let message = '同步比赛数据失败';

    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies.
    }

    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function fetchSyncLogs() {
  const response = await fetch(`${API_BASE_URL}/api/sync/logs`);

  if (!response.ok) {
    throw new Error('获取同步日志失败');
  }

  return response.json();
}

export async function fetchSyncStatus() {
  const response = await fetch(`${API_BASE_URL}/api/sync/status`);

  if (!response.ok) {
    throw new Error('获取同步状态失败');
  }

  return response.json();
}

export async function updateMatchPrediction(id, prediction) {
  const response = await fetch(`${API_BASE_URL}/api/matches/${encodeURIComponent(id)}/prediction`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(prediction),
  });

  if (!response.ok) {
    let message = '更新预测数据失败';

    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies.
    }

    const error = new Error(response.status === 404 ? '后端接口未生效，请重启后端服务' : message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// ============================================================
// 积分榜查询接口
// ============================================================

export async function fetchStandings(competition = 'PL') {
  const response = await fetch(`${API_BASE_URL}/api/standings?competition=${encodeURIComponent(competition)}`);

  if (!response.ok) {
    let message = '获取积分榜失败';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

// ============================================================
// football-data.org 同步接口
// ============================================================

export async function syncFootballCompetitions() {
  const response = await fetch(`${API_BASE_URL}/api/sync/football/competitions`, {
    method: 'POST',
  });

  if (!response.ok) {
    let message = '同步联赛数据失败';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function syncFootballMatches(competition) {
  const response = await fetch(`${API_BASE_URL}/api/sync/football/matches?competition=${encodeURIComponent(competition)}`, {
    method: 'POST',
  });

  if (!response.ok) {
    let message = '同步比赛数据失败';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function syncFootballStandings(competition) {
  const response = await fetch(`${API_BASE_URL}/api/sync/football/standings?competition=${encodeURIComponent(competition)}`, {
    method: 'POST',
  });

  if (!response.ok) {
    let message = '同步排名数据失败';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export async function syncFootballTeams(competition) {
  const response = await fetch(`${API_BASE_URL}/api/sync/football/teams?competition=${encodeURIComponent(competition)}`, {
    method: 'POST',
  });

  if (!response.ok) {
    let message = '同步球队数据失败';
    try {
      const data = await response.json();
      message = data.message || message;
    } catch (error) {
      // Ignore non-JSON error bodies.
    }
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  return response.json();
}
