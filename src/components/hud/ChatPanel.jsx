import React, { useState, useRef, useCallback, useEffect } from 'react';
import { streamChat, resetChat } from '../../services/api';

// 도구 이름 → 한국어 라벨 (어떤 AI 모델이 도는지 칩으로 시각화)
const TOOL_LABELS = {
  score_route: 'RIO 타당성',
  score_route_modified_ice: '해빙 시나리오',
  compare_ice_classes: 'Ice Class 비교',
  get_current_conditions: '현재 해양환경',
  compare_economics: '연료·경제성',
  get_route_weather: '기상',
  get_escort_status: '쇄빙선 호위',
  recommend_departure: '출항 타이밍',
  get_iceberg_risk: '빙산 위험',
  launch_full_report: '정식 보고서',
  launch_full_whatif: '전체 시나리오',
};

const SUGGESTIONS = [
  '6월 10일에 200m 컨테이너선으로 부산→로테르담을 북동항로로 가려는데 총 부대비용과 타당성을 검토해줘',
  '지금 NSR 쇄빙선 상황 어때?',
  'PC5로 NSR 언제 떠나는 게 좋아?',
  '현재 빙산 위험은?',
];

function genSessionId() {
  return 'chat-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

// 간단 링크 렌더: 메시지에 href 있으면 앵커, 없으면 텍스트
function MessageText({ text }) {
  return (
    <span style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', userSelect: 'text', WebkitUserSelect: 'text' }}>
      {text}
    </span>
  );
}

export default function ChatPanel({ open, onToggle, shipSpec }) {
  const [messages, setMessages] = useState([]);   // {role:'user'|'assistant'|'system', text, tools?, href?, hrefLabel?}
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const sessionRef = useRef(genSessionId());
  const scrollRef = useRef(null);
  const timersRef = useRef([]);
  const abortRef = useRef(null);

  // 언마운트 시 폴링 타이머/스트림 정리
  useEffect(() => () => {
    timersRef.current.forEach(clearTimeout);
    abortRef.current?.abort();
  }, []);

  // 새 메시지 시 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // 배열 마지막 assistant 메시지를 갱신
  const updateLastAssistant = useCallback((updater) => {
    setMessages((prev) => {
      const next = [...prev];
      for (let i = next.length - 1; i >= 0; i--) {
        if (next[i].role === 'assistant') { next[i] = updater(next[i]); break; }
      }
      return next;
    });
  }, []);

  // 백그라운드 잡 폴링 (report / whatif)
  const pollJob = useCallback((kind, jobId) => {
    const url = kind === 'whatif'
      ? `/api/report/whatif/status/${jobId}`
      : `/api/report/status/${jobId}`;
    setMessages((m) => [...m, { role: 'system', text: `⏳ 백그라운드 작업 시작 (job ${jobId})…` }]);

    const tick = async () => {
      try {
        const r = await fetch(url);
        const st = await r.json();
        if (st.status === 'completed') {
          if (kind === 'report') {
            setMessages((m) => [...m, {
              role: 'system',
              text: '📄 정식 동향보고서가 완성되었습니다.',
              href: `/api/report/download/${jobId}`,
              hrefLabel: 'PDF 다운로드',
            }]);
          } else {
            const sc = st.result?.scenarios || [];
            const rec = sc.filter((s) => s.recommendation === '추천').length;
            setMessages((m) => [...m, {
              role: 'system',
              text: `🧪 What-IF 분석 완료: 시나리오 ${sc.length}개 (추천 ${rec}개). 자세한 내용은 WHAT-IF 패널에서 확인하세요.`,
            }]);
          }
          return;
        }
        if (st.status === 'failed') {
          setMessages((m) => [...m, { role: 'system', text: `작업 실패: ${st.error || ''}` }]);
          return;
        }
        timersRef.current.push(setTimeout(tick, 1200));
      } catch {
        timersRef.current.push(setTimeout(tick, 2000));
      }
    };
    timersRef.current.push(setTimeout(tick, 1200));
  }, []);

  const send = useCallback(async (rawText) => {
    const text = (rawText ?? input).trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [
      ...m,
      { role: 'user', text },
      { role: 'assistant', text: '', tools: [], streaming: true },
    ]);
    setBusy(true);
    abortRef.current = new AbortController();

    try {
      await streamChat({
        sessionId: sessionRef.current,
        message: text,
        shipSpec,
        signal: abortRef.current.signal,
        onToken: (t) => updateLastAssistant((a) => ({ ...a, text: a.text + t })),
        onTool: ({ name, status }) => updateLastAssistant((a) => {
          const tools = [...(a.tools || [])];
          if (status === 'running') {
            tools.push({ name, status });
          } else {
            const i = tools.findIndex((x) => x.name === name && x.status === 'running');
            if (i >= 0) tools[i] = { ...tools[i], status: 'done' };
          }
          return { ...a, tools };
        }),
        onJob: ({ kind, job_id }) => pollJob(kind, job_id),
        onError: (d) => updateLastAssistant((a) => ({ ...a, text: a.text + `\n[오류] ${d}` })),
      });
    } catch (e) {
      updateLastAssistant((a) => ({ ...a, text: a.text + `\n[연결 오류] ${e.message || e}` }));
    } finally {
      setBusy(false);
      updateLastAssistant((a) => ({ ...a, streaming: false }));
    }
  }, [input, busy, shipSpec, updateLastAssistant, pollJob]);

  const clearChat = useCallback(async () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    abortRef.current?.abort();
    setMessages([]);
    setBusy(false);
    try { await resetChat(sessionRef.current); } catch { /* noop */ }
    sessionRef.current = genSessionId();
  }, []);

  if (!open) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 44,
      right: 8,
      width: 380,
      maxWidth: 'calc(100vw - 16px)',
      height: 'calc(100vh - 120px)',
      maxHeight: 680,
      zIndex: 500,
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(10, 15, 35, 0.96)',
      border: '1px solid rgba(34,211,238,0.35)',
      borderRadius: 10,
      backdropFilter: 'blur(14px)',
      boxShadow: '0 8px 40px rgba(0,0,0,0.6)',
      fontFamily: "'Segoe UI', system-ui, sans-serif",
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderBottom: '1px solid rgba(34,211,238,0.2)', flex: '0 0 auto',
      }}>
        <div style={{ fontSize: 13, fontWeight: 'bold', color: '#67e8f9', letterSpacing: 1 }}>
          AI 챗봇 <span style={{ fontSize: 10, color: '#5b7a99' }}>· 북극항로 전용</span>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span onClick={clearChat} title="대화 초기화"
            style={{ cursor: 'pointer', color: '#6b89b0', fontSize: 11 }}>↺ 초기화</span>
          <span onClick={onToggle} title="닫기"
            style={{ cursor: 'pointer', color: '#6b89b0', fontSize: 16, lineHeight: 1 }}>×</span>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} style={{
        flex: '1 1 auto', overflowY: 'auto', padding: '12px 14px',
        display: 'flex', flexDirection: 'column', gap: 10,
      }}>
        {messages.length === 0 && (
          <div style={{ color: '#6b89b0', fontSize: 12, lineHeight: 1.7 }}>
            북극항로·기상·쇄빙선·빙산·비용 무엇이든 물어보세요.
            <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {SUGGESTIONS.map((s, i) => (
                <button key={i} onClick={() => send(s)} style={{
                  textAlign: 'left', padding: '7px 9px', background: 'rgba(34,211,238,0.06)',
                  border: '1px solid rgba(34,211,238,0.2)', borderRadius: 6,
                  color: '#9fd6e6', fontSize: 11, cursor: 'pointer', lineHeight: 1.4,
                }}>{s}</button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => {
          if (msg.role === 'system') {
            return (
              <div key={i} style={{
                alignSelf: 'center', maxWidth: '95%', padding: '7px 11px',
                background: 'rgba(52,211,153,0.08)', border: '1px solid rgba(52,211,153,0.3)',
                borderRadius: 8, color: '#a7f3d0', fontSize: 11.5, lineHeight: 1.5,
              }}>
                <MessageText text={msg.text} />
                {msg.href && (
                  <> <a href={msg.href} target="_blank" rel="noreferrer"
                    style={{ color: '#34d399', fontWeight: 'bold', textDecoration: 'underline' }}>
                    ↓ {msg.hrefLabel || '다운로드'}
                  </a></>
                )}
              </div>
            );
          }
          const isUser = msg.role === 'user';
          return (
            <div key={i} style={{
              alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '88%',
              display: 'flex', flexDirection: 'column', gap: 4,
            }}>
              {/* 도구 호출 칩 */}
              {!isUser && msg.tools && msg.tools.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {msg.tools.map((t, ti) => (
                    <span key={ti} style={{
                      fontSize: 10, padding: '2px 7px', borderRadius: 10,
                      background: t.status === 'done' ? 'rgba(52,211,153,0.12)' : 'rgba(96,165,250,0.15)',
                      border: `1px solid ${t.status === 'done' ? 'rgba(52,211,153,0.4)' : 'rgba(96,165,250,0.5)'}`,
                      color: t.status === 'done' ? '#6ee7b7' : '#93c5fd',
                    }}>
                      {t.status === 'done' ? '✓' : '🔧'} {TOOL_LABELS[t.name] || t.name}
                    </span>
                  ))}
                </div>
              )}
              <div style={{
                padding: '8px 11px', borderRadius: 10, fontSize: 12.5, lineHeight: 1.55,
                background: isUser ? 'rgba(37,99,235,0.25)' : 'rgba(255,255,255,0.04)',
                border: `1px solid ${isUser ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.08)'}`,
                color: isUser ? '#dbeafe' : '#e3edf7',
              }}>
                <MessageText text={msg.text || (msg.streaming ? '…' : '')} />
                {msg.streaming && msg.text && (
                  <span style={{ opacity: 0.6, animation: 'dt-blink 1s step-end infinite' }}>▋</span>
                )}
              </div>
            </div>
          );
        })}
        <style>{`@keyframes dt-blink { 50% { opacity: 0; } }`}</style>
      </div>

      {/* Input */}
      <div style={{
        flex: '0 0 auto', padding: '10px 12px', borderTop: '1px solid rgba(34,211,238,0.2)',
        display: 'flex', gap: 8, alignItems: 'flex-end',
      }}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            // 전역 시뮬레이션 키 핸들러로 이벤트가 전파돼 Space/WASD 가 삼켜지지 않도록 차단
            e.stopPropagation();
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
          }}
          onKeyUp={(e) => e.stopPropagation()}
          placeholder="북극항로에 대해 물어보세요… (Shift+Enter 줄바꿈)"
          rows={1}
          style={{
            flex: 1, resize: 'none', maxHeight: 90, padding: '8px 10px',
            background: '#0f172a', border: '1px solid #1e3a8a', borderRadius: 6,
            color: '#dbeafe', fontSize: 12, fontFamily: 'inherit', lineHeight: 1.4,
            outline: 'none', userSelect: 'text', WebkitUserSelect: 'text',
          }}
        />
        <button
          onClick={() => send()}
          disabled={busy || !input.trim()}
          style={{
            padding: '8px 14px', borderRadius: 6,
            background: busy || !input.trim() ? 'rgba(34,211,238,0.12)' : 'linear-gradient(135deg,#0e7490,#0891b2)',
            border: '1px solid rgba(34,211,238,0.5)',
            color: busy || !input.trim() ? '#5b7a99' : '#e0f7ff',
            fontSize: 12, fontWeight: 'bold', cursor: busy || !input.trim() ? 'default' : 'pointer',
          }}
        >
          {busy ? '…' : '전송'}
        </button>
      </div>
    </div>
  );
}
