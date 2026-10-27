/**
 * `/app` 懒加载时的骨架屏。
 *
 * 之前 fallback 只有一行「正在加载工作台…」，冷加载时整页浅灰空白，最关键的首屏体验
 * 直接塌掉。这里先画出工作台的结构（顶栏 + 统计卡 + 列表行），让布局先到位，
 * 再等真正的组件替换。
 */
export function WorkspaceSkeleton() {
  return (
    <div className="ws-skeleton" role="status" aria-live="polite">
      <span className="visually-hidden">正在加载工作台…</span>
      <div className="ws-skeleton-bar">
        <span className="ws-skeleton-block ws-skeleton-logo" />
        <div className="ws-skeleton-nav">
          <span className="ws-skeleton-block" />
          <span className="ws-skeleton-block" />
          <span className="ws-skeleton-block" />
        </div>
        <span className="ws-skeleton-block ws-skeleton-avatar" />
      </div>
      <div className="ws-skeleton-main">
        <span className="ws-skeleton-block ws-skeleton-title" />
        <div className="ws-skeleton-stats">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="ws-skeleton-block ws-skeleton-card" />
          ))}
        </div>
        <div className="ws-skeleton-panel">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="ws-skeleton-block ws-skeleton-row" />
          ))}
        </div>
      </div>
    </div>
  );
}
