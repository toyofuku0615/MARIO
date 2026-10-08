import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="fallback">
        <h1>描画を開始できませんでした</h1>
        <p>WebGL が有効な Chrome / Edge でページを再読み込みしてください。</p>
        <button onClick={() => location.reload()}>再読み込み</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
