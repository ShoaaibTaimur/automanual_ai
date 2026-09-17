'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  Bot, 
  Sparkles, 
  Clock, 
  Layers, 
  ArrowRight, 
  CheckCircle2, 
  Compass, 
  Globe, 
  FileText,
  AlertCircle,
  Activity,
  Check
} from 'lucide-react';

export default function ProjectDetailsPage() {
  const params = useParams();
  const projectId = params.id as string;

  const [project, setProject] = useState<any>(null);
  const [plan, setPlan] = useState<any>(null);
  const [statusInfo, setStatusInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4001';

  const fetchProjectData = async () => {
    try {
      const res = await fetch(`${apiUrl}/api/projects/${projectId}`);
      if (!res.ok) throw new Error('Failed to load project details');
      const data = await res.json();
      setProject(data);

      if (data.plan) {
        setPlan(data.plan);
      } else {
        const planRes = await fetch(`${apiUrl}/api/projects/${projectId}/plan`).catch(() => null);
        if (planRes && planRes.ok) {
          const planData = await planRes.json();
          setPlan(planData);
        }
      }

      // Fetch status info
      const statusRes = await fetch(`${apiUrl}/api/projects/${projectId}/status`).catch(() => null);
      if (statusRes && statusRes.ok) {
        const sData = await statusRes.json();
        setStatusInfo(sData);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjectData();
  }, [projectId]);

  // Polling status when in pipeline
  useEffect(() => {
    if (!project) return;
    const activeStatuses = [
      'EXECUTING',
      'RECORDING',
      'GENERATING_NARRATION',
      'GENERATING_VOICE',
      'RENDERING_VIDEO',
    ];

    if (!activeStatuses.includes(project.status)) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${apiUrl}/api/projects/${projectId}/status`);
        if (res.ok) {
          const s = await res.json();
          setStatusInfo(s);
          setProject((prev: any) => ({ ...prev, status: s.status }));
          if (s.status === 'COMPLETED' || s.status === 'FAILED') {
            clearInterval(interval);
          }
        }
      } catch {
        // Silent poll error
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [project?.status, projectId]);

  const handleApprovePlan = async () => {
    setApproving(true);
    setError(null);
    try {
      const res = await fetch(`${apiUrl}/api/projects/${projectId}/plan/approve`, {
        method: 'POST',
      });
      if (!res.ok) throw new Error('Failed to approve plan');
      const approvedData = await res.json();
      setProject(approvedData.project);
      setPlan(approvedData.plan);
      await fetchProjectData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(false);
    }
  };

  const getActionBadge = (action: string) => {
    switch (action.toLowerCase()) {
      case 'navigate':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20">NAVIGATE</span>;
      case 'click':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">CLICK</span>;
      case 'input':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">INPUT</span>;
      case 'explain':
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">EXPLAIN</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-500/10 text-slate-400 border border-slate-500/20">{action.toUpperCase()}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#030712] text-slate-400 flex items-center justify-center text-sm">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          Loading project details...
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#030712] text-rose-400 flex items-center justify-center">
        Project not found.
      </div>
    );
  }

  const durationMin = plan ? Math.floor(plan.estimatedDuration / 60) : 0;
  const durationSec = plan ? plan.estimatedDuration % 60 : 0;
  const isApproved = plan?.approved || project.status === 'COMPLETED' || project.status === 'EXECUTING';

  return (
    <main className="min-h-screen bg-[#030712] text-slate-100 selection:bg-indigo-500 selection:text-white pb-24">
      {/* Header */}
      <header className="border-b border-slate-800/80 backdrop-blur-md sticky top-0 z-50 bg-[#030712]/80">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-2 text-slate-400 hover:text-white text-xs transition">
              ← Dashboard
            </a>
            <span className="text-slate-700">/</span>
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-white">{project.name}</span>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-300 border border-indigo-500/25">
                {project.status}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3 text-xs">
            <span className="text-slate-400 flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-slate-500" />
              {project.baseUrl}
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 pt-10">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Live Pipeline Progress Banner (Active when approved / executing) */}
        {statusInfo && statusInfo.progress > 40 && (
          <div className="mb-8 p-6 rounded-2xl bg-indigo-950/30 border border-indigo-500/30 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5 text-xs font-semibold text-indigo-300 uppercase tracking-wider">
                <Activity className="w-4 h-4 text-indigo-400 animate-pulse" />
                <span>Autonomous Generation Pipeline: {statusInfo.status}</span>
              </div>
              <span className="text-sm font-bold text-white">{statusInfo.progress}%</span>
            </div>

            {/* Progress Track */}
            <div className="w-full h-2 bg-slate-900 rounded-full overflow-hidden mb-4 border border-slate-800">
              <div
                className="h-full bg-gradient-to-r from-indigo-500 via-sky-400 to-emerald-400 transition-all duration-500 rounded-full"
                style={{ width: `${statusInfo.progress}%` }}
              />
            </div>

            <div className="grid grid-cols-5 text-center text-[10px] font-medium text-slate-400 gap-2">
              <span className={statusInfo.progress >= 50 ? 'text-indigo-400 font-bold' : ''}>1. Executing</span>
              <span className={statusInfo.progress >= 65 ? 'text-indigo-400 font-bold' : ''}>2. Recording</span>
              <span className={statusInfo.progress >= 75 ? 'text-indigo-400 font-bold' : ''}>3. Narration</span>
              <span className={statusInfo.progress >= 85 ? 'text-indigo-400 font-bold' : ''}>4. Voiceover</span>
              <span className={statusInfo.progress === 100 ? 'text-emerald-400 font-bold' : ''}>5. Video Ready</span>
            </div>
          </div>
        )}

        {/* Plan Header Card */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/10 text-indigo-300 mb-3 border border-indigo-500/20">
              <Sparkles className="w-3.5 h-3.5" />
              AI Exploration Plan
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {plan?.title || `${project.name} User Manual Plan`}
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm">
              Review and verify the AI-sequenced demonstration workflows before video execution starts.
            </p>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {plan && (
              <div className="flex items-center gap-4 text-xs">
                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                  <div className="text-slate-400 flex items-center justify-center gap-1 mb-0.5">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" />
                    Duration
                  </div>
                  <div className="text-sm font-bold text-white">
                    {durationMin}m {durationSec ? `${durationSec}s` : ''}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-center">
                  <div className="text-slate-400 flex items-center justify-center gap-1 mb-0.5">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    Workflows
                  </div>
                  <div className="text-sm font-bold text-white">
                    {plan.workflows?.length || 0}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Workflows List */}
        {plan && plan.workflows && plan.workflows.length > 0 ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                Workflows Sequence ({plan.workflows.length})
              </h2>
              <span className="text-xs text-slate-400">
                Safe non-destructive demonstration order
              </span>
            </div>

            <div className="grid gap-4">
              {plan.workflows.map((workflow: any) => {
                const steps = (workflow.stepsJson || workflow.steps || []) as any[];

                return (
                  <div
                    key={workflow.id || workflow.workflowId}
                    className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 transition"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-md bg-indigo-500/20 text-indigo-300 text-xs font-bold flex items-center justify-center">
                          {workflow.priority}
                        </span>
                        <h3 className="font-semibold text-white text-sm">
                          {workflow.title}
                        </h3>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        {steps.length} actions
                      </span>
                    </div>

                    <div className="space-y-2.5 pl-9">
                      {steps.map((step: any, idx: number) => (
                        <div key={idx} className="flex items-start gap-3 text-xs">
                          <div className="pt-0.5">{getActionBadge(step.action)}</div>
                          <div className="flex-1 text-slate-300">
                            <span>{step.description}</span>
                            {step.target && (
                              <span className="ml-2 font-mono text-[11px] text-indigo-300/80 bg-slate-950 px-1.5 py-0.5 rounded border border-slate-800">
                                {step.target}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Approve Plan CTA Box */}
            <div className="mt-10 p-6 rounded-2xl bg-gradient-to-r from-indigo-950/40 via-slate-900 to-indigo-950/40 border border-indigo-500/30 flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                <h4 className="font-semibold text-sm text-white mb-1">
                  {isApproved ? 'Plan Approved & Enqueued' : 'Plan Ready for Approval'}
                </h4>
                <p className="text-slate-400 text-xs">
                  {isApproved
                    ? `Plan was approved on ${new Date(plan.approvedAt || project.updatedAt).toLocaleTimeString()}. Automated pipeline in progress.`
                    : 'Approving starts autonomous browser execution, video capture, and narration rendering.'}
                </p>
              </div>

              {isApproved ? (
                <div className="px-5 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Approved</span>
                </div>
              ) : (
                <button
                  onClick={handleApprovePlan}
                  disabled={approving || project.status !== 'AWAITING_APPROVAL'}
                  className="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-lg shadow-indigo-600/30 transition flex items-center gap-2 disabled:opacity-50 shrink-0"
                >
                  {approving ? (
                    <span>Starting Pipeline...</span>
                  ) : (
                    <>
                      <span>Approve & Generate Manual</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-12 rounded-2xl border border-dashed border-slate-800 text-center text-slate-400 text-xs">
            <Compass className="w-8 h-8 mx-auto text-slate-600 mb-3" />
            No exploration plan found.
          </div>
        )}
      </div>
    </main>
  );
}
