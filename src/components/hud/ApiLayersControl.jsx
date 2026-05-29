import React from 'react';

// UI 노출 레이어. (Sentinel-1/2 3종은 백엔드 코드는 유지하되 UI에서만 숨김)
const LAYERS = [
  { id: 'layer-nsidc-conc',  stateKey: 'nsidcConc',  label: 'NSIDC 해빙 농도',       title: '북극해 해빙의 면적 대비 얼음의 비율(%)을 실시간 시각화합니다.' },
  { id: 'layer-gibs-ice',    stateKey: 'gibsIce',    label: '해빙 자연색 오버레이', title: 'Copernicus/NSIDC 데이터 기반 자연색 해빙 오버레이 (흰색 얼음 / 투명 바다)' },
  { id: 'layer-cop-thick',   stateKey: 'copThick',   label: '해빙 표면 온도 (MODIS)', title: 'NASA MODIS Terra 위성 기반 해빙 표면 온도. 얇은 빙은 따뜻하고 두꺼운 빙은 차가워 두께를 간접 추정할 수 있습니다.' },
  { id: 'layer-nsidc-edge',  stateKey: 'nsidcEdge',  label: 'NSIDC 경계선 (Today)', title: '위성 밝기온도 데이터 기반으로 오늘의 해빙 경계선을 표시합니다.' },
  { id: 'layer-gebco-bathy', stateKey: 'gebcoBathy', label: 'GEBCO 해저 수심도',    title: 'EMODnet/GEBCO 수심 척도 및 해저 지형을 시각화합니다.' },
];

export default function ApiLayersControl({
  layerStates,
  onLayerToggle,
  gebcoOpacity,
  onGebcoOpacityChange,
}) {
  const states = layerStates || {};
  const opacity = gebcoOpacity != null ? gebcoOpacity : 75;
  const gebcoChecked = !!states.gebcoBathy;

  return (
    <div className="hud" id="hud-api-layers" style={{
      minWidth: '240px',
      border: '1px solid rgba(52, 211, 153, 0.3)',
      background: 'rgba(15, 23, 42, 0.8)',
    }}>
      <div className="hud-title" style={{ color: '#34d399' }}>
        실시간 WMS 데이터 레이어
      </div>

      {LAYERS.map(({ id, stateKey, label, title }) => (
        <React.Fragment key={id}>
          <div
            className="hud-row"
            style={{ justifyContent: 'flex-start', gap: '12px', margin: '8px 0' }}
            title={title}
          >
            <input
              type="checkbox"
              id={id}
              className="api-cb"
              style={{ accentColor: '#34d399', cursor: 'pointer', transform: 'scale(1.1)' }}
              checked={!!states[stateKey]}
              onChange={(e) => onLayerToggle && onLayerToggle(stateKey, e.target.checked)}
            />
            <label htmlFor={id} className="hud-label" style={{
              cursor: 'pointer',
              color: states[stateKey] ? '#f1f5f9' : '#94a3b8',
              fontSize: '12px',
              transition: 'color 0.2s'
            }}>
              {label}
            </label>
          </div>

          {stateKey === 'gebcoBathy' && (
            <div
              id="gebco-opacity-row"
              style={{
                display: gebcoChecked ? 'flex' : 'none',
                alignItems: 'center',
                gap: '8px',
                margin: '2px 0 6px 20px',
              }}
            >
              <span className="hud-label" style={{ fontSize: '10px', whiteSpace: 'nowrap' }}>
                {'투명도'}
              </span>
              <input
                type="range"
                id="gebco-opacity-slider"
                min="30"
                max="100"
                step="5"
                value={opacity}
                style={{ width: '90px', accentColor: '#34d399', verticalAlign: 'middle' }}
                onChange={(e) => onGebcoOpacityChange && onGebcoOpacityChange(Number(e.target.value))}
              />
              <span id="gebco-opacity-label" className="hud-value" style={{ fontSize: '10px', minWidth: '28px' }}>
                {opacity}%
              </span>
            </div>
          )}
        </React.Fragment>
      ))}

    </div>
  );
}
