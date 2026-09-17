'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Sparkles, 
  Video, 
  Bot, 
  ShieldCheck, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  Play, 
  Globe, 
  Key, 
  ChevronRight,
  Cpu,
  Clock,
  Film,
  Activity,
  FolderOpen
} from 'lucide-react';

export default function HomePage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    baseUrl: '',
    authRequired: false,
    username: '',
    password: '',
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      // Ignore initial fetch errors
    } finally {
      setLoadingProjects(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      if (!res.ok) {
        throw new Error(`API error: ${res.statusText}`);
      }
      const data = await res.json();
      setResult(data);
      // Auto-navigate to project page
      setTimeout(() => {
        router.push(`/projects/${data.id}`);
      }, 1200);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            COMPLETED
          </span>
        );
      case 'EXECUTING':
      case 'RECORDING':
      case 'RENDERING_VIDEO':
      case 'GENERATING_VOICE':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 animate-pulse flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {status}
          </span>
        );
      case 'AWAITING_APPROVAL':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-300 border border-amber-500/30">
            AWAITING APPROVAL
          </span>
        );
      default:
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            {status}
          </span>
        );
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#030712] text-slate-100 selection:bg-indigo-500 selection:text-white">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-indigo-500/15 via-purple-500/10 to-transparent blur-3xl pointer-events-none" />

      {/* Header */}
      <header className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-50 bg-[#030712]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-sky-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
              <Bot className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
              AutoManual AI
            </span>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a
              href="#create"
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition-all shadow-md shadow-indigo-600/20 text-xs"
            >
              Create Project
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-12 px-6 max-w-5xl mx-auto text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          Autonomous Browser-to-Video Engine • 100% Free & Offline TTS
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
          Turn Any Web Application Into{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
            Studio Tutorial Videos
          </span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          Autonomous Playwright exploration records real actions, writes instructional voiceover,
          and renders 1080p Remotion videos with animated cursors and subtitles.
        </p>

        {/* Feature Cards Grid */}
        <div className="grid sm:grid-cols-3 gap-5 text-left mb-12">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">Autonomous Crawler</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Chromium agent inspects routes, forms, and actions without fragile selector scripts.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center mb-3">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">Interactive Plan Review</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Verify AI-sequenced non-destructive demonstration workflows before execution starts.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition">
            <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center mb-3">
              <Video className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">Remotion 1080p Engine</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Renders animated cursor paths, click ripples, subtitles, and native Samantha voiceover.
            </p>
          </div>
        </div>
      </section>

      {/* Recent Projects Section */}
      <section className="max-w-5xl mx-auto px-6 mb-16 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <FolderOpen className="w-4 h-4 text-indigo-400" />
            <h2 className="text-base font-bold text-white">Recent Video Projects</h2>
          </div>
          <span className="text-xs text-slate-500 font-mono">
            {projects.length} Projects Recorded
          </span>
        </div>

        {loadingProjects ? (
          <div className="p-8 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400">
            Loading recent projects...
          </div>
        ) : projects.length > 0 ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {projects.map((proj: any) => {
              const hasVideo = proj.videoRenders?.some((r: any) => r.status === 'COMPLETED');
              const workflowsCount = proj.plan?.workflows?.length || 0;

              return (
                <div
                  key={proj.id}
                  onClick={() => router.push(`/projects/${proj.id}`)}
                  className="p-5 rounded-2xl bg-slate-900/60 hover:bg-slate-900 border border-slate-800 hover:border-indigo-500/50 transition cursor-pointer group flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="font-bold text-sm text-white group-hover:text-indigo-300 transition">
                        {proj.name}
                      </h3>
                      {getStatusBadge(proj.status)}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3 truncate">
                      <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{proj.baseUrl}</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-3 text-slate-400 text-[11px]">
                      {hasVideo ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <Film className="w-3.5 h-3.5" />
                          1080p Video Ready
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {workflowsCount > 0 ? `${workflowsCount} workflows` : 'Exploring'}
                        </span>
                      )}
                    </div>

                    <span className="text-indigo-400 group-hover:translate-x-0.5 transition flex items-center gap-1 font-semibold text-[11px]">
                      Open Studio →
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-8 rounded-2xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
            No projects yet. Fill out the form below to record your first manual!
          </div>
        )}
      </section>

      {/* Interactive Project Creation Form */}
      <section id="create" className="max-w-xl mx-auto px-6 pb-24 relative z-10">
        <div className="p-8 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-1.5">New Documentation Project</h2>
            <p className="text-slate-400 text-xs">
              Provide application URL. AutoManual AI will crawl routes and structure demonstration workflows.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Project Name
              </label>
              <input
                type="text"
                required
                placeholder="Wikipedia User Manual"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                Application URL
              </label>
              <div className="relative">
                <Globe className="w-4 h-4 text-slate-500 absolute left-3.5 top-3" />
                <input
                  type="url"
                  required
                  placeholder="https://en.wikipedia.org/wiki/Main_Page"
                  value={formData.baseUrl}
                  onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
                  className="w-full pl-10 pr-3.5 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition"
                />
              </div>
            </div>

            <div className="pt-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={formData.authRequired}
                  onChange={(e) => setFormData({ ...formData, authRequired: e.target.checked })}
                  className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500 bg-slate-950"
                />
                <span className="text-xs text-slate-300 font-medium">Requires Authentication</span>
              </label>
            </div>

            {formData.authRequired && (
              <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-3 pt-3">
                <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium mb-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Secure Credentials Vault
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Username / Email</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="demo@example.com"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Password</label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 text-white text-xs placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            )}

            {error && (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                {error}
              </div>
            )}

            {result && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-between">
                <span>Project initialized! Redirecting to Studio...</span>
                <span className="font-semibold text-emerald-300">{result.status}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-4 py-3 px-4 rounded-xl bg-gradient-to-r from-indigo-600 to-indigo-500 hover:from-indigo-500 hover:to-indigo-400 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? (
                <span>Initializing Discovery...</span>
              ) : (
                <>
                  <span>Create Project & Discover Features</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 px-6 text-center text-xs text-slate-500">
        AutoManual AI • Autonomous AI Video Documentation Architecture
      </footer>
    </main>
  );
}
