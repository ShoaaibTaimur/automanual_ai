'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bot,
  FolderOpen,
  Film,
  Globe,
  ArrowRight,
  RotateCcw,
  AlertCircle,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  Plus,
  CheckCircle2,
  Activity
} from 'lucide-react';

export default function ProjectsLibraryPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'completed' | 'active' | 'failed'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [retryingId, setRetryingId] = useState<string | null>(null);

  const pageSize = 6;
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

  const fetchProjects = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/projects`);
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch {
      // Ignore initial network errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
    const interval = setInterval(fetchProjects, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleRetry = async (e: React.MouseEvent, projectId: string) => {
    e.stopPropagation();
    setRetryingId(projectId);
    try {
      const res = await fetch(`${apiUrl}/api/projects/${projectId}/retry`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchProjects();
      }
    } catch {
      // Silent error
    } finally {
      setRetryingId(null);
    }
  };

  const filteredProjects = projects.filter((p) => {
    if (filter === 'completed') return p.status === 'COMPLETED';
    if (filter === 'failed') return p.status === 'FAILED';
    if (filter === 'active') {
      return [
        'CREATED',
        'DISCOVERING',
        'PLAN_READY',
        'AWAITING_APPROVAL',
        'EXECUTING',
        'RECORDING',
        'GENERATING_NARRATION',
        'GENERATING_VOICE',
        'RENDERING_VIDEO',
      ].includes(p.status);
    }
    return true;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProjects.length / pageSize));
  const validPage = Math.min(currentPage, totalPages);
  const startIndex = (validPage - 1) * pageSize;
  const paginatedProjects = filteredProjects.slice(startIndex, startIndex + pageSize);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            COMPLETED
          </span>
        );
      case 'FAILED':
        return (
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-300 border border-rose-500/30 flex items-center gap-1">
            <AlertCircle className="w-3 h-3 text-rose-400" />
            FAILED
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
          <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-500/10 text-indigo-300 border border-indigo-500/30 animate-pulse flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
            {status}
          </span>
        );
    }
  };

  return (
    <main className="min-h-screen bg-[#030712] text-slate-100 selection:bg-indigo-500 selection:text-white pb-24 relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[1000px] h-[350px] bg-gradient-to-b from-indigo-600/10 via-sky-600/5 to-transparent blur-3xl pointer-events-none" />

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

            {/* Top Navigation Tabs */}
            <nav className="flex items-center gap-1 border-l border-slate-800 pl-6">
              <a
                href="/"
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition"
              >
                New Project
              </a>
              <a
                href="/projects"
                className="px-3 py-1.5 rounded-lg text-xs font-semibold text-white bg-slate-800/80 transition"
              >
                Projects Library
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <a
              href="/"
              className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Manual</span>
            </a>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-10 relative z-10">
        {/* Title & Filter Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-1 flex items-center gap-2.5">
              <FolderOpen className="w-6 h-6 text-indigo-400" />
              Projects Library
            </h1>
            <p className="text-xs text-slate-400">
              Manage, monitor, and rerun automated video manual generation jobs.
            </p>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1.5 p-1 bg-slate-900/80 rounded-xl border border-slate-800 text-xs self-start sm:self-auto">
            <button
              onClick={() => { setFilter('all'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filter === 'all' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              All ({projects.length})
            </button>
            <button
              onClick={() => { setFilter('completed'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filter === 'completed' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Completed ({projects.filter(p => p.status === 'COMPLETED').length})
            </button>
            <button
              onClick={() => { setFilter('active'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filter === 'active' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Active ({projects.filter(p => p.status !== 'COMPLETED' && p.status !== 'FAILED').length})
            </button>
            <button
              onClick={() => { setFilter('failed'); setCurrentPage(1); }}
              className={`px-3 py-1 rounded-lg font-medium transition ${
                filter === 'failed' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              Failed ({projects.filter(p => p.status === 'FAILED').length})
            </button>
          </div>
        </div>

        {/* Projects Grid */}
        {loading ? (
          <div className="p-16 rounded-2xl bg-slate-900/40 border border-slate-800 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
            <span>Loading projects library...</span>
          </div>
        ) : paginatedProjects.length > 0 ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-10">
            {paginatedProjects.map((proj: any) => {
              const hasVideo = proj.videoRenders?.some((r: any) => r.status === 'COMPLETED');
              const workflowsCount = proj.plan?.workflows?.length || 0;
              const isRetrying = retryingId === proj.id;

              return (
                <div
                  key={proj.id}
                  onClick={() => router.push(`/projects/${proj.id}`)}
                  className={`p-5 rounded-2xl bg-slate-900/70 hover:bg-slate-900 border transition cursor-pointer group flex flex-col justify-between ${
                    proj.status === 'FAILED'
                      ? 'border-rose-500/30 hover:border-rose-500/60'
                      : 'border-slate-800 hover:border-indigo-500/50'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <h3 className="font-bold text-sm text-white group-hover:text-indigo-300 transition truncate mr-2">
                        {proj.name}
                      </h3>
                      {getStatusBadge(proj.status)}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-3 truncate">
                      <Globe className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span className="truncate">{proj.baseUrl}</span>
                    </div>

                    {proj.errorMessage && (
                      <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/20 text-rose-300 text-[11px] mb-3 leading-relaxed truncate">
                        {proj.errorMessage}
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs mt-3">
                    <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                      {hasVideo ? (
                        <span className="text-emerald-400 font-semibold flex items-center gap-1">
                          <Film className="w-3.5 h-3.5" />
                          1080p Video
                        </span>
                      ) : workflowsCount > 0 ? (
                        <span className="text-slate-400">
                          {workflowsCount} workflows
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {new Date(proj.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {proj.status === 'FAILED' ? (
                        <button
                          type="button"
                          onClick={(e) => handleRetry(e, proj.id)}
                          disabled={isRetrying}
                          className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/30 text-[11px] font-semibold transition flex items-center gap-1"
                        >
                          <RotateCcw className={`w-3 h-3 ${isRetrying ? 'animate-spin' : ''}`} />
                          <span>{isRetrying ? 'Retrying...' : 'Rerun Attempt'}</span>
                        </button>
                      ) : (
                        <span className="text-indigo-400 group-hover:translate-x-0.5 transition flex items-center gap-1 font-semibold text-[11px]">
                          Open Studio →
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-16 rounded-2xl border border-dashed border-slate-800 text-center space-y-3 mb-10">
            <FolderOpen className="w-8 h-8 mx-auto text-slate-600" />
            <div className="text-sm font-semibold text-white">No projects found in this filter</div>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Start by creating an automated video manual from your application URL.
            </p>
            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs transition mt-2"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Project</span>
            </a>
          </div>
        )}

        {/* Deterministic Numbered Pagination (No Lazy Scroll) */}
        {filteredProjects.length > pageSize && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-800">
            <span className="text-xs text-slate-500 font-mono">
              Showing {startIndex + 1}–{Math.min(startIndex + pageSize, filteredProjects.length)} of {filteredProjects.length} projects
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={validPage <= 1}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold transition flex items-center gap-1"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Prev</span>
              </button>

              {Array.from({ length: totalPages }).map((_, idx) => {
                const pageNum = idx + 1;
                return (
                  <button
                    key={pageNum}
                    type="button"
                    onClick={() => setCurrentPage(pageNum)}
                    className={`w-8 h-8 rounded-lg text-xs font-semibold transition ${
                      validPage === pageNum
                        ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                        : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={validPage >= totalPages}
                className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white disabled:opacity-30 disabled:pointer-events-none text-xs font-semibold transition flex items-center gap-1"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
