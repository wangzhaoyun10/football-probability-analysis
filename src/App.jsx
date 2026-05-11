import {
  Activity,
  BarChart3,
  CalendarClock,
  ChevronRight,
  CircleGauge,
  Dumbbell,
  Goal,
  LayoutDashboard,
  Menu,
  Save,
  ShieldCheck,
  Trophy,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { leagues, modelFactors, teams } from './data/mockData.js';
import { fetchMatchById, fetchMatches, updateMatchPrediction } from './services/api.js';
import { calculateProbability, validateMatchData } from './utils/calculateProbability.js';
import { formatMatchTime } from './utils/format.js';

const navItems = [
  { label: '数据管理', path: '#/data-management', icon: Save },
  { label: '首页', path: '#/', icon: LayoutDashboard },
  { label: '联赛', path: '#/leagues', icon: Trophy },
  { label: '模型说明', path: '#/model', icon: CircleGauge },
];

const leagueFilters = [
  { label: '全部', value: 'all' },
  { label: '英超', value: 'premier-league' },
  { label: '西甲', value: 'la-liga' },
  { label: '意甲', value: 'serie-a' },
  { label: '德甲', value: 'bundesliga' },
];

const DATA_LOADING_TEXT = '数据加载中...';
const DATA_LOAD_ERROR_TEXT = '数据加载失败，请检查后端服务是否启动';

const leagueMap = Object.fromEntries(leagues.map((league) => [league.id, league]));
const teamMap = Object.fromEntries(teams.map((team) => [team.id, team]));

function matchLeagueFilter(match, selectedLeague) {
  if (selectedLeague === 'all') return true;

  const filter = leagueFilters.find((item) => item.value === selectedLeague);

  return match.leagueId === selectedLeague || match.leagueName === filter?.label || match.league?.name === filter?.label;
}

function matchTeamSearch(match, keyword) {
  const normalizedKeyword = keyword.trim().toLowerCase();

  if (!normalizedKeyword) return true;

  const homeTeamName = (match.homeTeamName || match.homeTeam?.name || '').toLowerCase();
  const awayTeamName = (match.awayTeamName || match.awayTeam?.name || '').toLowerCase();

  return homeTeamName.includes(normalizedKeyword) || awayTeamName.includes(normalizedKeyword);
}

function getMatchView(match) {
  if (!match) return null;

  return {
    ...match,
    homeTeam: teamMap[match.homeTeamId] ?? { id: match.homeTeamId, name: match.homeTeamName },
    awayTeam: teamMap[match.awayTeamId] ?? { id: match.awayTeamId, name: match.awayTeamName },
    league: leagueMap[match.leagueId] ?? { id: match.leagueId, name: match.leagueName },
  };
}

function useHashRoute() {
  const [hash, setHash] = useState(window.location.hash || '#/');

  useEffect(() => {
    const onHashChange = () => setHash(window.location.hash || '#/');
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return hash.replace(/^#/, '') || '/';
}

function App() {
  const route = useHashRoute();
  const [mobileOpen, setMobileOpen] = useState(false);

  const page = route.startsWith('/match/')
    ? <MatchDetailPage matchId={route.split('/').pop()} />
    : route === '/leagues'
      ? <LeaguesPage />
      : route === '/data-management'
        ? <DataManagementPage />
        : route === '/model'
        ? <ModelPage />
        : <HomePage />;

  return (
    <div className="min-h-screen bg-[#080d16] text-slate-100">
      <div className="fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(41,211,255,0.16),transparent_34%),linear-gradient(135deg,#080d16_0%,#0b1321_42%,#111827_100%)]" />
      <header className="sticky top-0 z-40 border-b border-line bg-[#080d16]/92 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <a href="#/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded bg-cyanx/15 text-cyanx ring-1 ring-cyanx/30">
              <BarChart3 size={22} />
            </span>
            <span>
              <span className="block text-base font-semibold leading-5">Football Probability</span>
              <span className="block text-xs text-slate-400">胜平负概率分析</span>
            </span>
          </a>

          <nav className="hidden items-center gap-2 md:flex">
            {navItems.map((item) => (
              <NavLink key={item.path} item={item} active={route === item.path.replace('#', '')} />
            ))}
          </nav>

          <button
            type="button"
            className="grid h-10 w-10 place-items-center rounded border border-line bg-panel-soft text-slate-200 md:hidden"
            onClick={() => setMobileOpen((value) => !value)}
            aria-label="打开导航"
          >
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
        {mobileOpen && (
          <nav className="grid gap-2 border-t border-line bg-[#080d16] px-4 py-3 md:hidden">
            {navItems.map((item) => (
              <NavLink key={item.path} item={item} active={route === item.path.replace('#', '')} onClick={() => setMobileOpen(false)} />
            ))}
          </nav>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{page}</main>
    </div>
  );
}

function NavLink({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <a
      href={item.path}
      onClick={onClick}
      className={`flex h-10 items-center gap-2 rounded px-3 text-sm transition ${
        active ? 'bg-cyanx/15 text-cyanx ring-1 ring-cyanx/30' : 'text-slate-300 hover:bg-panel-soft hover:text-white'
      }`}
    >
      <Icon size={16} />
      {item.label}
    </a>
  );
}

function HomePage() {
  const [matchList, setMatchList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedLeague, setSelectedLeague] = useState('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const matchViews = useMemo(() => matchList.map(getMatchView), [matchList]);
  const filteredMatchViews = useMemo(
    () => matchViews.filter((match) => matchLeagueFilter(match, selectedLeague) && matchTeamSearch(match, searchKeyword)),
    [matchViews, searchKeyword, selectedLeague],
  );
  const emptyText = searchKeyword.trim() ? '暂无匹配比赛' : '暂无该联赛比赛';

  useEffect(() => {
    let active = true;

    async function loadMatches() {
      try {
        setLoading(true);
        setLoadError(false);
        const data = await fetchMatches();

        if (active) {
          setMatchList(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        if (active) {
          setLoadError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadMatches();

    return () => {
      active = false;
    };
  }, []);

  if (loading) {
    return <LoadingState />;
  }

  if (loadError) {
    return <ErrorState />;
  }

  return (
    <div className="space-y-6">
      <HeroPanel matches={filteredMatchViews} />
      <section className="rounded border border-line bg-panel/92 shadow-glow">
        <div className="flex flex-col gap-2 border-b border-line px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold">赛事概率列表</h2>
            <p className="mt-1 text-sm text-slate-400">基于静态样本数据展示胜平负预测输出。</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Activity size={16} className="text-greenx" />
            数据库数据已加载
          </div>
        </div>
        <LeagueFilter
          selectedLeague={selectedLeague}
          searchKeyword={searchKeyword}
          onLeagueChange={setSelectedLeague}
          onSearchChange={setSearchKeyword}
        />
        <div className="overflow-x-auto">
          <table className="min-w-[920px] w-full text-left text-sm">
            <thead className="bg-panel-soft text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">联赛</th>
                <th className="px-5 py-3 font-medium">比赛时间</th>
                <th className="px-5 py-3 font-medium">主队</th>
                <th className="px-5 py-3 font-medium">客队</th>
                <th className="px-5 py-3 font-medium">主胜概率</th>
                <th className="px-5 py-3 font-medium">平局概率</th>
                <th className="px-5 py-3 font-medium">客胜概率</th>
                <th className="px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredMatchViews.length > 0 ? (
                filteredMatchViews.map((match) => <MatchCard key={match.id} match={match} />)
              ) : (
                <tr>
                  <td colSpan={8} className="px-5 py-10 text-center text-sm text-slate-400">
                    {emptyText}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LeagueFilter({ selectedLeague, searchKeyword, onLeagueChange, onSearchChange }) {
  return (
    <div className="border-b border-line px-5 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {leagueFilters.map((filter) => {
            const active = selectedLeague === filter.value;

            return (
              <button
                key={filter.value}
                type="button"
                onClick={() => onLeagueChange(filter.value)}
                className={`h-9 rounded px-4 text-sm font-medium transition ${
                  active
                    ? 'bg-cyanx text-[#06111e] shadow-glow'
                    : 'border border-line bg-panel-soft text-slate-300 hover:border-cyanx/50 hover:text-white'
                }`}
              >
                {filter.label}
              </button>
            );
          })}
        </div>
        <input
          type="search"
          value={searchKeyword}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="搜索球队名称"
          className="h-9 w-full rounded border border-line bg-panel-soft px-3 text-sm text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyanx/70 focus:ring-1 focus:ring-cyanx/30 lg:w-64"
        />
      </div>
    </div>
  );
}

function HeroPanel({ matches }) {
  const topMatch = matches[0];
  const { homeWin, draw, awayWin } = topMatch?.probability ?? { homeWin: 0, draw: 0, awayWin: 0 };
  const averageConfidence = Math.round(
    matches.length
      ? matches.reduce((total, match) => total + Math.max(match.probability.homeWin, match.probability.draw, match.probability.awayWin), 0) /
          matches.length
      : 0,
  );

  return (
    <section className="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
      <div className="rounded border border-line bg-panel/88 p-5 shadow-glow">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span className="rounded bg-cyanx/12 px-2 py-1 text-cyanx ring-1 ring-cyanx/25">SPORTS DATA PLATFORM</span>
          <span>胜平负概率分析静态原型</span>
        </div>
        <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">足球赛事概率分析工作台</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-400">
          聚合赛程、近期状态、攻防指标与历史交锋，用专业数据看板方式呈现比赛胜平负倾向。
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <StatCard label="今日样本比赛" value={matches.length} icon={CalendarClock} />
          <StatCard label="模型维度" value={modelFactors.length} icon={CircleGauge} />
          <StatCard label="平均置信度" value={`${averageConfidence}%`} icon={ShieldCheck} />
        </div>
      </div>
      <div className="rounded border border-line bg-panel/88 p-5">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-400">焦点赛事</span>
          <Goal size={18} className="text-cyanx" />
        </div>
        <div className="mt-4 text-xl font-semibold">
          {topMatch ? `${topMatch.homeTeam.name} vs ${topMatch.awayTeam.name}` : '-'}
        </div>
        <div className="mt-1 text-sm text-slate-400">
          {topMatch ? `${topMatch.league.name} · ${formatMatchTime(topMatch.time)}` : '-'}
        </div>
        <ProbabilityBar homeWin={homeWin} draw={draw} awayWin={awayWin} className="mt-5" />
      </div>
    </section>
  );
}

function MatchCard({ match }) {
  const { homeWin, draw, awayWin } = match.probability;

  return (
    <tr className="transition hover:bg-cyanx/[0.04]">
      <td className="px-5 py-4 text-slate-300">{match.league.name}</td>
      <td className="px-5 py-4 text-slate-400">{formatMatchTime(match.time)}</td>
      <td className="px-5 py-4 font-medium text-white">{match.homeTeam.name}</td>
      <td className="px-5 py-4 font-medium text-white">{match.awayTeam.name}</td>
      <td className="px-5 py-4">
        <SingleProgress value={homeWin} color="bg-greenx" />
      </td>
      <td className="px-5 py-4">
        <SingleProgress value={draw} color="bg-amberx" />
      </td>
      <td className="px-5 py-4">
        <SingleProgress value={awayWin} color="bg-redx" />
      </td>
      <td className="px-5 py-4">
        <a
          href={`#/match/${match.id}`}
          className="inline-flex h-9 items-center gap-1 rounded bg-cyanx px-3 text-sm font-medium text-[#06111e] transition hover:bg-white"
        >
          查看分析
          <ChevronRight size={16} />
        </a>
      </td>
    </tr>
  );
}

function MatchDetailPage({ matchId }) {
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadMatch() {
      try {
        setLoading(true);
        setLoadError(false);
        const data = await fetchMatchById(matchId);

        if (active) {
          setMatch(getMatchView(data));
        }
      } catch (error) {
        if (active) {
          setLoadError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadMatch();

    return () => {
      active = false;
    };
  }, [matchId]);

  if (loading) {
    return <LoadingState />;
  }

  if (loadError) {
    return <ErrorState />;
  }

  if (!match) {
    return (
      <PageTitle
        title="未找到比赛"
        description="当前 match id 在 mockData.js 中不存在，请从首页比赛列表重新进入详情。"
      />
    );
  }

  const { homeWin, draw, awayWin } = match.probability;

  return (
    <div className="space-y-6">
      <section className="rounded border border-line bg-panel p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-sm text-cyanx">
              {match.league.name} · {match.venue}
            </div>
            <h1 className="mt-2 text-3xl font-semibold">
              {match.homeTeam.name} vs {match.awayTeam.name}
            </h1>
            <p className="mt-2 text-sm text-slate-400">{formatMatchTime(match.time)}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <ProbabilityDonut label="主胜" value={homeWin} color="#28e6a7" />
            <ProbabilityDonut label="平局" value={draw} color="#f7c948" />
            <ProbabilityDonut label="客胜" value={awayWin} color="#ff6b7a" />
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <DataCard title="双方近期战绩" icon={Activity}>
          <FormLine team={match.homeTeam.name} values={match.form.home} />
          <FormLine team={match.awayTeam.name} values={match.form.away} />
        </DataCard>
        <DataCard title="攻防数据" icon={Dumbbell}>
          <TeamMetrics label={match.homeTeam.name} data={match.attackDefense.home} />
          <TeamMetrics label={match.awayTeam.name} data={match.attackDefense.away} />
        </DataCard>
      </section>

      <section className="grid gap-4 lg:grid-cols-[0.85fr_1.15fr]">
        <DataCard title="历史交锋" icon={Trophy}>
          <div className="space-y-3">
            {match.headToHead.map((item) => (
              <div key={item.id} className="rounded border border-line bg-panel-soft px-4 py-3 text-sm text-slate-300">
                {item.score}
              </div>
            ))}
          </div>
        </DataCard>
        <DataCard title="系统分析结论" icon={ShieldCheck}>
          <p className="text-sm leading-7 text-slate-300">{match.conclusion}</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {match.signals.map((signal) => (
              <Signal key={signal.label} label={signal.label} value={signal.value} />
            ))}
          </div>
        </DataCard>
      </section>
    </div>
  );
}

function createPredictionDraft(match) {
  return {
    homeWin: String(match.probability?.homeWin ?? 0),
    draw: String(match.probability?.draw ?? 0),
    awayWin: String(match.probability?.awayWin ?? 0),
    conclusion: match.conclusion || '',
  };
}

function getDraftProbabilityTotal(draft) {
  return Number(draft.homeWin) + Number(draft.draw) + Number(draft.awayWin);
}

function DataManagementPage() {
  const [matchList, setMatchList] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [rowMessages, setRowMessages] = useState({});
  const matchViews = useMemo(() => matchList.map(getMatchView), [matchList]);

  useEffect(() => {
    let active = true;

    async function loadMatches() {
      try {
        setLoading(true);
        setLoadError(false);
        const data = await fetchMatches();
        const nextMatches = Array.isArray(data) ? data : [];

        if (active) {
          setMatchList(nextMatches);
          setDrafts(
            Object.fromEntries(nextMatches.map((match) => [match.id, createPredictionDraft(match)])),
          );
        }
      } catch (error) {
        if (active) {
          setLoadError(true);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    loadMatches();

    return () => {
      active = false;
    };
  }, []);

  function handleDraftChange(matchId, field, value) {
    setDrafts((current) => ({
      ...current,
      [matchId]: {
        ...current[matchId],
        [field]: value,
      },
    }));
    setRowMessages((current) => ({
      ...current,
      [matchId]: null,
    }));
  }

  async function handleRecalculate(matchId) {
    try {
      const matchDetail = await fetchMatchById(matchId);

      if (!matchDetail) {
        setRowMessages((current) => ({
          ...current,
          [matchId]: { type: 'error', text: '缺少模型计算所需数据' },
        }));
        return;
      }

      const validation = validateMatchData(matchDetail);

      if (!validation.valid) {
        setRowMessages((current) => ({
          ...current,
          [matchId]: { type: 'error', text: validation.reason || '缺少模型计算所需数据' },
        }));
        return;
      }

      const probability = calculateProbability(matchDetail);

      if (!probability) {
        setRowMessages((current) => ({
          ...current,
          [matchId]: { type: 'error', text: '缺少模型计算所需数据' },
        }));
        return;
      }

      setDrafts((current) => ({
        ...current,
        [matchId]: {
          ...current[matchId],
          homeWin: String(probability.homeWin),
          draw: String(probability.draw),
          awayWin: String(probability.awayWin),
        },
      }));
      setRowMessages((current) => ({
        ...current,
        [matchId]: { type: 'success', text: '模型计算完成，可手动微调后保存' },
      }));
    } catch (error) {
      setRowMessages((current) => ({
        ...current,
        [matchId]: { type: 'error', text: error.message || '模型计算失败' },
      }));
    }
  }

  async function handleSave(matchId) {
    const draft = drafts[matchId];

    if (!draft) return;

    if (getDraftProbabilityTotal(draft) !== 100) {
      setRowMessages((current) => ({
        ...current,
        [matchId]: { type: 'error', text: '概率合计必须等于 100' },
      }));
      return;
    }

    try {
      setSavingId(matchId);
      const result = await updateMatchPrediction(matchId, {
        homeWin: Number(draft.homeWin),
        draw: Number(draft.draw),
        awayWin: Number(draft.awayWin),
        conclusion: draft.conclusion,
      });

      setMatchList((current) =>
        current.map((match) =>
          match.id === matchId
            ? {
                ...match,
                probability: result.probability,
                conclusion: result.conclusion,
              }
            : match,
        ),
      );
      setRowMessages((current) => ({
        ...current,
        [matchId]: { type: 'success', text: '保存成功' },
      }));
    } catch (error) {
      setRowMessages((current) => ({
        ...current,
        [matchId]: { type: 'error', text: error.message || '保存失败' },
      }));
    } finally {
      setSavingId(null);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (loadError) {
    return <ErrorState />;
  }

  return (
    <div className="space-y-6">
      <PageTitle title="数据管理" description="维护比赛胜平负概率与分析结论，保存后同步更新 PostgreSQL 数据库。" />
      <section className="rounded border border-line bg-panel/92 shadow-glow">
        <div className="overflow-x-auto">
          <table className="min-w-[1120px] w-full text-left text-sm">
            <thead className="bg-panel-soft text-xs uppercase text-slate-400">
              <tr>
                <th className="px-5 py-3 font-medium">联赛</th>
                <th className="px-5 py-3 font-medium">比赛</th>
                <th className="px-5 py-3 font-medium">时间</th>
                <th className="px-5 py-3 font-medium">主胜</th>
                <th className="px-5 py-3 font-medium">平局</th>
                <th className="px-5 py-3 font-medium">客胜</th>
                <th className="px-5 py-3 font-medium">分析结论</th>
                <th className="px-5 py-3 font-medium">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {matchViews.map((match) => {
                const draft = drafts[match.id] || createPredictionDraft(match);
                const total = getDraftProbabilityTotal(draft);
                const message = rowMessages[match.id];
                const invalidTotal = total !== 100;

                return (
                  <tr key={match.id} className="align-top transition hover:bg-cyanx/[0.04]">
                    <td className="px-5 py-4 text-slate-300">{match.league.name}</td>
                    <td className="px-5 py-4">
                      <div className="font-medium text-white">
                        {match.homeTeam.name} vs {match.awayTeam.name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500">{match.id}</div>
                    </td>
                    <td className="px-5 py-4 text-slate-400">{formatMatchTime(match.time)}</td>
                    {['homeWin', 'draw', 'awayWin'].map((field) => (
                      <td key={field} className="px-5 py-4">
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={draft[field]}
                          onChange={(event) => handleDraftChange(match.id, field, event.target.value)}
                          className="h-9 w-20 rounded border border-line bg-panel-soft px-3 text-sm text-slate-100 outline-none transition focus:border-cyanx/70 focus:ring-1 focus:ring-cyanx/30"
                        />
                      </td>
                    ))}
                    <td className="px-5 py-4">
                      <textarea
                        value={draft.conclusion}
                        onChange={(event) => handleDraftChange(match.id, 'conclusion', event.target.value)}
                        rows={3}
                        className="min-h-20 w-80 resize-y rounded border border-line bg-panel-soft px-3 py-2 text-sm leading-6 text-slate-100 outline-none transition placeholder:text-slate-500 focus:border-cyanx/70 focus:ring-1 focus:ring-cyanx/30"
                      />
                      <div className={`mt-2 text-xs ${invalidTotal ? 'text-redx' : 'text-slate-500'}`}>概率合计：{total}%</div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => handleRecalculate(match.id)}
                          className="inline-flex h-9 items-center gap-2 rounded border border-cyanx/40 bg-cyanx/10 px-3 text-sm font-medium text-cyanx transition hover:bg-cyanx hover:text-[#06111e]"
                        >
                          <CircleGauge size={15} />
                          重新计算概率
                        </button>
                        <button
                          type="button"
                          disabled={savingId === match.id}
                          onClick={() => handleSave(match.id)}
                          className="inline-flex h-9 items-center gap-2 rounded bg-cyanx px-3 text-sm font-medium text-[#06111e] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Save size={15} />
                          {savingId === match.id ? '保存中' : '保存'}
                        </button>
                      </div>
                      {message && (
                        <div className={`mt-2 text-xs ${message.type === 'success' ? 'text-greenx' : 'text-redx'}`}>{message.text}</div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function LeaguesPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="联赛中心" description="覆盖主流联赛与杯赛，展示静态样本下的赛事数据覆盖情况。" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {leagues.map((league) => (
          <article key={league.id} className="rounded border border-line bg-panel p-5 transition hover:border-cyanx/50 hover:shadow-glow">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{league.name}</h2>
                <p className="mt-1 text-sm text-slate-400">{league.country}</p>
              </div>
              <span className="grid h-10 w-10 place-items-center rounded bg-cyanx/12 text-cyanx ring-1 ring-cyanx/25">
                <Trophy size={19} />
              </span>
            </div>
            <div className="mt-6 space-y-4">
              <SingleProgress label="数据覆盖评分" value={league.coverageScore} color="bg-cyanx" full />
              <div className="flex items-center justify-between border-t border-line pt-4 text-sm">
                <span className="text-slate-400">样本比赛</span>
                <span className="font-semibold">{league.matchesCount} 场</span>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function ModelPage() {
  return (
    <div className="space-y-6">
      <PageTitle title="模型说明" description="当前为静态原型，展示系统可解释分析维度，不接真实 API 与数据库。" />
      <section className="rounded border border-line bg-panel p-5">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {modelFactors.map((factor, index) => (
            <article key={factor.title} className="rounded border border-line bg-panel-soft p-5">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded bg-cyanx/15 text-sm font-semibold text-cyanx">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <h2 className="text-lg font-semibold">{factor.title}</h2>
              </div>
              <p className="mt-4 text-sm leading-6 text-slate-400">{factor.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function PageTitle({ title, description }) {
  return (
    <section className="rounded border border-line bg-panel p-5">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-400">{description}</p>
    </section>
  );
}

function LoadingState() {
  return (
    <section className="rounded border border-line bg-panel p-5">
      <div className="flex items-center gap-2 text-sm text-slate-300">
        <Activity size={16} className="text-cyanx" />
        {DATA_LOADING_TEXT}
      </div>
    </section>
  );
}

function ErrorState() {
  return (
    <section className="rounded border border-line bg-panel p-5">
      <div className="text-sm text-redx">{DATA_LOAD_ERROR_TEXT}</div>
    </section>
  );
}

function StatCard({ label, value, icon: Icon }) {
  return (
    <div className="rounded border border-line bg-panel-soft p-4">
      <div className="flex items-center justify-between text-slate-400">
        <span className="text-sm">{label}</span>
        <Icon size={17} className="text-cyanx" />
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function SingleProgress({ label, value, color, full = false }) {
  return (
    <div className={full ? 'w-full' : 'flex min-w-28 items-center gap-2'}>
      {label && (
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="text-slate-400">{label}</span>
          <span className="font-semibold">{value}%</span>
        </div>
      )}
      <div className={`${label ? 'h-2.5' : 'h-2 flex-1'} rounded bg-slate-800`}>
        <div className={`h-full rounded ${color}`} style={{ width: `${value}%` }} />
      </div>
      {!label && <span className="font-semibold">{value}%</span>}
    </div>
  );
}

function ProbabilityBar({ homeWin, draw, awayWin, className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      <SingleProgress label="主胜" value={homeWin} color="bg-greenx" full />
      <SingleProgress label="平局" value={draw} color="bg-amberx" full />
      <SingleProgress label="客胜" value={awayWin} color="bg-redx" full />
    </div>
  );
}

function ProbabilityDonut({ label, value, color }) {
  return (
    <div className="min-w-20 rounded border border-line bg-panel-soft p-3">
      <div
        className="mx-auto grid h-16 w-16 place-items-center rounded-full text-sm font-semibold"
        style={{ background: `conic-gradient(${color} ${value * 3.6}deg, #273247 0deg)` }}
      >
        <span className="grid h-12 w-12 place-items-center rounded-full bg-panel">{value}%</span>
      </div>
      <div className="mt-2 text-xs text-slate-400">{label}</div>
    </div>
  );
}

function DataCard({ title, icon: Icon, children }) {
  return (
    <section className="rounded border border-line bg-panel p-5">
      <div className="mb-5 flex items-center gap-2">
        <Icon size={18} className="text-cyanx" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function FormLine({ team, values }) {
  const colorMap = { 胜: 'bg-greenx text-[#06111e]', 平: 'bg-amberx text-[#171107]', 负: 'bg-redx text-white' };

  return (
    <div className="mb-4 flex items-center justify-between gap-3 rounded border border-line bg-panel-soft px-4 py-3 last:mb-0">
      <span className="text-sm font-medium">{team}</span>
      <div className="flex gap-2">
        {values.map((value, index) => (
          <span key={`${team}-${index}`} className={`grid h-7 w-7 place-items-center rounded text-xs font-semibold ${colorMap[value]}`}>
            {value}
          </span>
        ))}
      </div>
    </div>
  );
}

function TeamMetrics({ label, data }) {
  return (
    <div className="mb-5 last:mb-0">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-medium">{label}</h3>
        <span className="text-xs text-slate-400">场均射门 {data.shots}</span>
      </div>
      <div className="space-y-3">
        <SingleProgress label="进攻能力" value={data.attack} color="bg-greenx" full />
        <SingleProgress label="防守能力" value={data.defense} color="bg-cyanx" full />
        <SingleProgress label="控球指数" value={data.possession} color="bg-amberx" full />
      </div>
    </div>
  );
}

function Signal({ label, value }) {
  return (
    <div className="rounded border border-line bg-panel-soft px-4 py-3">
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-1 font-semibold">{value}</div>
    </div>
  );
}

export default App;
