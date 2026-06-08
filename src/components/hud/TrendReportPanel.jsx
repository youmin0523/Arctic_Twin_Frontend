import React, { useState, useRef, useCallback, useEffect } from 'react';

const ROUTES = ['NSR', 'NWP', 'TSR'];
const ICE_CLASSES = ['PC1', 'PC2', 'PC3', 'PC4', 'PC5', 'PC6', 'PC7', 'IA Super', 'IA', 'IB', 'IC'];
const FORECAST_OPTIONS = [30, 45, 60];

function stageLabel(pct) {
  if (pct < 10)  return 'LOADING DATA...';
  if (pct < 20)  return 'POLARIS RIO SCORING...';
  if (pct < 30)  return 'RL DEPARTURE ANALYSIS...';
  if (pct < 40)  return 'RL AVOIDANCE ANALYSIS...';
  if (pct < 75)  return 'AI ANALYSIS (CLAUDE)...';
  if (pct < 100) return 'GENERATING PDF...';
  return 'COMPLETE';
}

export default function TrendReportPanel({ open, onToggle }) {
  const collapsed = !open;
  const [route, setRoute] = useState('NSR');
  const [iceClass, setIceClass] = useState('PC5');
  const [departureDate, setDepartureDate] = useState('');
  const [forecastDays, setForecastDays] = useState(30);
  const [transitDays, setTransitDays] = useState(14);

  // 보고서 생성 상태
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState(0);
  const [genStage, setGenStage] = useState('');
  const [genComplete, setGenComplete] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);   // blob: object URL
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const genJobRef = useRef(null);
  const genPollRef = useRef(null);
  const previewUrlRef = useRef(null);                    // revoke 용 최신 URL 추적

  // 언마운트(패널 닫기 등) 시 진행 중인 폴링 인터벌 + blob URL 정리
  useEffect(() => () => {
    if (genPollRef.current) clearInterval(genPollRef.current);
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  // RL 모델은 백엔드에서 이미 학습된 ONNX 모델 자동 로드 (backend/model/report-service/*.onnx)
  // 그래서 UI 학습 버튼/진행률 표시 제거됨. 보고서 생성 시 자동으로 추론에 사용.

  // 보고서 생성 시작
  const startGeneration = useCallback(async () => {
    setGenerating(true);
    setGenProgress(0);
    setGenStage('STARTING...');
    setGenComplete(false);
    setShowPreview(false);
    setJobId(null);
    // 이전 미리보기 blob 정리 (새 보고서는 새로 받아야 함)
    if (previewUrlRef.current) { URL.revokeObjectURL(previewUrlRef.current); previewUrlRef.current = null; }
    setPreviewUrl(null);
    setPreviewError('');

    try {
      const res = await fetch('/api/report/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          route,
          ice_class: iceClass,
          departure_date_start: departureDate,
          forecast_days: forecastDays,
          transit_days: transitDays,
        }),
      });
      const data = await res.json();
      genJobRef.current = data.job_id;
      setJobId(data.job_id);

      genPollRef.current = setInterval(async () => {
        try {
          const sr = await fetch(`/api/report/status/${data.job_id}`);
          const st = await sr.json();
          const pct = st.progress || 0;
          setGenProgress(pct);
          setGenStage(stageLabel(pct));

          if (st.status === 'completed') {
            clearInterval(genPollRef.current);
            setGenerating(false);
            setGenComplete(true);
          } else if (st.status === 'failed') {
            clearInterval(genPollRef.current);
            setGenerating(false);
            setGenStage('FAILED: ' + (st.error || ''));
          }
        } catch {
          clearInterval(genPollRef.current);
          setGenerating(false);
        }
      }, 800);
    } catch {
      setGenStage('CONNECTION ERROR');
      setGenerating(false);
    }
  }, [route, iceClass, departureDate, forecastDays, transitDays]);

  // 미리보기 열기 — PDF 를 한 번만 fetch 해 blob URL 로 만든다.
  // blob: URL 은 same-origin 이라 프록시 헤더/Content-Disposition 영향 없이
  // iframe 에 확실히 inline 렌더링되고, 다운로드도 같은 blob 을 재사용한다.
  const openPreview = useCallback(async () => {
    if (!genJobRef.current) return;
    setShowPreview(true);
    setPreviewError('');

    // 이미 받아둔 blob 이 있으면 재사용
    if (previewUrlRef.current) return;

    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/report/preview/${genJobRef.current}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
    } catch (e) {
      setPreviewError('미리보기를 불러오지 못했습니다 (' + (e.message || 'error') + ')');
    } finally {
      setPreviewLoading(false);
    }
  }, []);

  // PDF 다운로드 — 미리보기로 받아둔 blob 이 있으면 재사용(추가 요청 없음),
  // 없으면 다운로드 엔드포인트로 직접 저장.
  const downloadPdf = useCallback(() => {
    // 파일명: arctic_report_<route>_<iceClass>_<YYYYMMDD>.pdf
    // 날짜는 출발일 기준(미선택 시 오늘), ice class 공백 제거
    const dateStr = (departureDate || new Date().toISOString().slice(0, 10)).replace(/-/g, '');
    const filename = `arctic_report_${route}_${iceClass.replace(/\s+/g, '')}_${dateStr}.pdf`;
    if (previewUrlRef.current) {
      const a = document.createElement('a');
      a.href = previewUrlRef.current;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } else if (genJobRef.current) {
      window.open(`/api/report/download/${genJobRef.current}`, '_blank');
    }
  }, [route, iceClass, departureDate]);

  if (collapsed) return null;

  return (
    <>
    {/* 딤 배경 */}
    <div
      onClick={onToggle}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.45)',
        zIndex: 499,
        backdropFilter: 'blur(2px)',
      }}
    />
    <div className="dt-float-panel dt-float-panel--center" style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: 320,
      maxHeight: '80vh',
      overflowY: 'auto',
      zIndex: 500,
      background: 'rgba(10, 15, 35, 0.97)',
      border: '1px solid #1e3a8a',
      borderRadius: 10,
      backdropFilter: 'blur(16px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.7)',
      padding: '12px 16px',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 'bold', color: '#93c5fd', letterSpacing: 1 }}>
          TREND REPORT
        </div>
        <span
          onClick={onToggle}
          style={{ cursor: 'pointer', color: '#6b89b0', fontSize: 16, lineHeight: 1 }}
        >
          ×
        </span>
      </div>

      {/* Route selection */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>ROUTE</div>
        <div style={{ display: 'flex', gap: 5 }}>
          {ROUTES.map((r) => (
            <button
              key={r}
              onClick={() => setRoute(r)}
              style={{
                flex: 1,
                padding: '4px 0',
                background: route === r ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${route === r ? '#2563eb' : '#1e3a8a'}`,
                borderRadius: 4,
                color: route === r ? '#93c5fd' : '#6b89b0',
                fontSize: 11,
                cursor: 'pointer',
              }}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Ice class */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>ICE CLASS</div>
        <select
          value={iceClass}
          onChange={(e) => setIceClass(e.target.value)}
          style={{
            width: '100%',
            padding: '4px 6px',
            background: '#0f172a',
            border: '1px solid #1e3a8a',
            borderRadius: 4,
            color: '#93c5fd',
            fontSize: 11,
          }}
        >
          {ICE_CLASSES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Departure date */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>DEPARTURE DATE</div>
        <input
          type="date"
          value={departureDate}
          onChange={(e) => setDepartureDate(e.target.value)}
          onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch (_) {} }}
          style={{
            width: '100%',
            padding: '7px 10px',
            background: '#0f172a',
            border: '1px solid #1e3a8a',
            borderRadius: 4,
            color: '#93c5fd',
            fontSize: 12,
            boxSizing: 'border-box',
            colorScheme: 'dark',
            cursor: 'pointer',
            accentColor: '#2563eb',
          }}
        />
      </div>

      {/* Forecast days */}
      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 10, color: '#6b89b0', marginBottom: 3, letterSpacing: 1 }}>
          FORECAST: <span style={{ color: '#93c5fd' }}>{forecastDays}d</span>
          {' | '}TRANSIT: <span style={{ color: '#93c5fd' }}>{transitDays}d</span>
        </div>
        <div style={{ display: 'flex', gap: 5 }}>
          {FORECAST_OPTIONS.map((d) => (
            <button
              key={d}
              onClick={() => setForecastDays(d)}
              style={{
                flex: 1,
                padding: '3px 0',
                background: forecastDays === d ? 'rgba(37,99,235,0.3)' : 'rgba(255,255,255,0.03)',
                border: `1px solid ${forecastDays === d ? '#2563eb' : '#1e3a8a'}`,
                borderRadius: 4,
                color: forecastDays === d ? '#93c5fd' : '#6b89b0',
                fontSize: 10,
                cursor: 'pointer',
              }}
            >
              {d}일
            </button>
          ))}
        </div>
      </div>

      {/* RL Model: 사전 학습된 ONNX 모델 자동 사용 (학습 버튼 제거) */}
      <div style={{
        marginBottom: 8,
        padding: '6px 8px',
        background: 'rgba(52, 211, 153, 0.05)',
        borderRadius: 4,
        border: '1px solid #047857',
        fontSize: 10,
        color: '#34d399',
        letterSpacing: 0.5,
      }}>
        ✓ RL MODEL: PRE-TRAINED (29 ONNX, auto-loaded)
      </div>

      {/* Generate button */}
      <button
        onClick={startGeneration}
        disabled={generating}
        style={{
          width: '100%',
          padding: '9px 0',
          background: generating
            ? 'rgba(37,99,235,0.15)'
            : 'linear-gradient(135deg,#1e40af,#1d4ed8)',
          border: '1px solid #2563eb',
          borderRadius: 6,
          color: generating ? '#6b89b0' : '#e0f0ff',
          fontSize: 13,
          fontFamily: "'Courier New', monospace",
          fontWeight: 'bold',
          cursor: generating ? 'default' : 'pointer',
          letterSpacing: 0.5,
        }}
      >
        {generating ? 'GENERATING...' : genComplete ? 'RE-GENERATE' : 'GENERATE REPORT'}
      </button>

      {/* Generation progress */}
      {(generating || genProgress > 0) && (
        <div style={{ marginTop: 8 }}>
          <div style={{
            background: '#0f172a',
            borderRadius: 4,
            overflow: 'hidden',
            height: 5,
            border: '1px solid #1e3a8a',
          }}>
            <div style={{
              width: `${genProgress}%`,
              height: '100%',
              background: 'linear-gradient(90deg,#2563eb,#60a5fa)',
              transition: 'width 0.3s',
            }} />
          </div>
          <div style={{ fontSize: 10, color: '#6b89b0', marginTop: 3 }}>
            {genProgress}% — {genStage}
          </div>
        </div>
      )}

      {/* Preview (primary) + Download (secondary) */}
      {genComplete && (
        <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
          <button
            onClick={openPreview}
            style={{
              flex: 2,
              padding: '8px 0',
              background: 'linear-gradient(135deg,#1e40af,#1d4ed8)',
              border: '1px solid #2563eb',
              borderRadius: 6,
              color: '#e0f0ff',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            PREVIEW REPORT
          </button>
          <button
            onClick={downloadPdf}
            title="PDF 파일로 저장"
            style={{
              flex: 1,
              padding: '8px 0',
              background: 'rgba(5,150,105,0.15)',
              border: '1px solid #059669',
              borderRadius: 6,
              color: '#34d399',
              fontSize: 12,
              fontWeight: 'bold',
              cursor: 'pointer',
              letterSpacing: 0.5,
            }}
          >
            ↓ PDF
          </button>
        </div>
      )}
    </div>

    {/* PDF 미리보기 오버레이 (inline 렌더링 — 디스크에 저장하지 않음) */}
    {showPreview && jobId && (
      <div
        onClick={() => setShowPreview(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.7)',
          zIndex: 600,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '3vh 3vw',
          backdropFilter: 'blur(3px)',
        }}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 900,
            height: '94vh',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(10, 15, 35, 0.98)',
            border: '1px solid #1e3a8a',
            borderRadius: 10,
            overflow: 'hidden',
            boxShadow: '0 8px 40px rgba(0,0,0,0.8)',
          }}
        >
          {/* Preview header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 14px',
            borderBottom: '1px solid #1e3a8a',
            flex: '0 0 auto',
          }}>
            <div style={{
              fontSize: 13, fontWeight: 'bold', color: '#93c5fd',
              letterSpacing: 1, fontFamily: "'Segoe UI', system-ui, sans-serif",
            }}>
              REPORT PREVIEW — {route} / {iceClass}
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={downloadPdf}
                style={{
                  padding: '6px 14px',
                  background: 'linear-gradient(135deg,#065f46,#047857)',
                  border: '1px solid #059669',
                  borderRadius: 6,
                  color: '#d1fae5',
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  letterSpacing: 0.5,
                }}
              >
                ↓ DOWNLOAD PDF
              </button>
              <span
                onClick={() => setShowPreview(false)}
                style={{ cursor: 'pointer', color: '#6b89b0', fontSize: 20, lineHeight: 1, padding: '0 4px' }}
              >
                ×
              </span>
            </div>
          </div>
          {/* PDF 본문: blob URL 로 inline 렌더링 */}
          <div style={{ flex: '1 1 auto', position: 'relative', background: '#525659' }}>
            {previewLoading && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center',
                color: '#cbd5e1', fontSize: 13, gap: 12,
                fontFamily: "'Segoe UI', system-ui, sans-serif",
              }}>
                <div style={{
                  width: 36, height: 36,
                  border: '3px solid rgba(147,197,253,0.25)',
                  borderTopColor: '#60a5fa',
                  borderRadius: '50%',
                  animation: 'dt-spin 0.8s linear infinite',
                }} />
                <div>미리보기 불러오는 중...</div>
                <style>{`@keyframes dt-spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            {previewError && !previewLoading && (
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#fca5a5', fontSize: 13, textAlign: 'center', padding: 20,
                fontFamily: "'Segoe UI', system-ui, sans-serif",
              }}>
                {previewError}
              </div>
            )}
            {previewUrl && !previewLoading && (
              <iframe
                title="Trend Report PDF Preview"
                src={previewUrl}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 'none' }}
              />
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
