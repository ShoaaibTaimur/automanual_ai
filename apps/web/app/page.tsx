'use client';

import React, { useState } from 'react';
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

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

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
      // Auto-navigate to project studio
      setTimeout(() => {
        router.push(`/projects/${data.id}`);
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen relative overflow-hidden bg-[#030712] text-slate-100 selection:bg-indigo-500 selection:text-white pb-20">
      {/* Ambient background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[400px] bg-gradient-to-b from-indigo-500/15 via-purple-500/10 to-transparent blur-3xl pointer-events-none" />

      {/* Header with Navigation Tabs */}
      <header className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-50 bg-[#030712]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <a href="/" className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-sky-400 flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <Bot className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                AutoManual AI
              </span>
            </a>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1 border-l border-slate-800 pl-6">
              <a
                href="/"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-800/80 transition"
              >
                New Project
              </a>
              <a
                href="/projects"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition flex items-center gap-1.5"
              >
                <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
                <span>Projects Library</span>
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <a
              href="/projects"
              className="px-3.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:border-slate-700 text-slate-300 text-xs font-medium transition"
            >
              View All Projects →
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="pt-16 pb-10 px-6 max-w-5xl mx-auto text-center relative z-10">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-xs font-medium mb-6">
          <Sparkles className="w-3.5 h-3.5" />
          Autonomous Browser-to-Video Engine • Multi-LLM (Gemini / Groq)
        </div>

        <h1 className="text-4xl sm:text-6xl font-extrabold tracking-tight text-white mb-6 leading-tight">
          Turn Any Web Application Into{' '}
          <span className="bg-gradient-to-r from-indigo-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
            Studio Tutorial Videos
          </span>
        </h1>

        <p className="text-slate-400 text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
          Provide your application URL and credentials. AutoManual logs in, crawls routes, generates
          AI demonstration scripts, and renders 1080p MP4 videos with animated cursors and voiceover.
        </p>

        {/* Feature Cards Grid */}
        <div className="grid sm:grid-cols-3 gap-5 text-left mb-10">
          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-3">
              <Bot className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">Authenticated Exploration</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Playwright agent logs in, bypasses auth walls, and crawls protected dashboard pages.
            </p>
          </div>

          <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800/90 hover:border-slate-700 transition">
            <div className="w-9 h-9 rounded-lg bg-sky-500/10 text-sky-400 flex items-center justify-center mb-3">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-white font-semibold text-sm mb-1">Resilient Multi-LLM</h3>
            <p className="text-slate-400 text-xs leading-relaxed">
              Powered by Google Gemini and Groq with automatic failover for genuine AI-generated scripts.
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

      {/* Interactive Project Creation Form */}
      <section id="create" className="max-w-xl mx-auto px-6 relative z-10 mb-12">
        <div className="p-8 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl backdrop-blur-xl">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-white mb-1.5">New Documentation Project</h2>
            <p className="text-slate-400 text-xs">
              Provide application URL. AutoManual AI will authenticate, crawl routes, and structure demonstration workflows.
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
                placeholder="CommonShare ESG Manual"
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
                  placeholder="https://www.cs.commonstaging.me/login"
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
                  Secure Credentials Vault (AES-256)
                </div>

                <div>
                  <label className="block text-xs text-slate-400 mb-1">Username / Email</label>
                  <input
                    type="text"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="user@example.com"
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
                <span>Initializing Autonomous Crawler...</span>
              ) : (
                <>
                  <span>Create Project & Discover Features</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>

        {/* Link to Projects Library */}
        <div className="mt-6 text-center">
          <a
            href="/projects"
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition font-medium"
          >
            <FolderOpen className="w-3.5 h-3.5 text-indigo-400" />
            <span>Looking for past recordings? Open Projects Library →</span>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-900 py-8 px-6 text-center text-xs text-slate-500">
        AutoManual AI • Autonomous AI Video Documentation Architecture
      </footer>
    </main>
  );
}
