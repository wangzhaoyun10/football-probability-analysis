const API_BASE_URL = 'http://localhost:3001';

export async function fetchMatches() {
  const response = await fetch(`${API_BASE_URL}/api/matches`);

  if (!response.ok) {
    throw new Error('获取比赛列表失败');
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
