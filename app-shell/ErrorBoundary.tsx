/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

// Catches generic "Script error." and runtime failures, and offers a reload.
export default class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  // NOTE: @types/react is not installed, so the base Component generics don't surface `state`/`props`
  // on the subclass — declare them explicitly. Root fix: add @types/react + @types/react-dom (devDeps).
  state: { hasError: boolean } = { hasError: false };
  declare readonly props: { children: ReactNode };

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught application error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen flex flex-col items-center justify-center bg-[#F7F6F2] p-6 text-center">
          <div className="w-16 h-16 bg-red-50 text-red-600 rounded-full flex items-center justify-center mb-4">
            <AlertTriangle className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-[#36453F] mb-2">Something went wrong</h1>
          <p className="text-sm text-[#6A7470] mb-6 max-w-md mx-auto">
            The application encountered an unexpected error. This can sometimes happen due to script loading failures or API quota limits.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-2.5 bg-primary text-white rounded-[10px] font-bold text-sm shadow-md hover:opacity-90 transition-all cursor-pointer"
          >
            Reload Application
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
