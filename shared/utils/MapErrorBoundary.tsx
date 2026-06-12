/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Contains Google Maps render failures (invalid key, exhausted quota, marker-library
 * init errors) to the map region instead of letting them blank the whole app via the
 * root ErrorBoundary. Renders a graceful fallback in place of the map.
 */

import { Component, ReactNode } from 'react';
import { MapPin } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}
interface State {
  hasError: boolean;
}

export default class MapErrorBoundary extends Component<Props, State> {
  declare props: Props;
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    // Swallow — maps failures are non-fatal for the rest of the app.
    console.warn('Map failed to render (likely Maps API key/quota issue):', error);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="w-full h-full min-h-[160px] flex flex-col items-center justify-center gap-2 bg-slate-50 text-center p-6">
            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <MapPin className="w-5 h-5" />
            </div>
            <p className="text-xs font-bold text-slate-500">Map unavailable</p>
            <p className="text-[10px] text-slate-400 max-w-[220px] leading-relaxed">
              The Google Maps key is invalid or its daily quota is exhausted. Add a billing-enabled
              key to <code className="bg-slate-200 px-1 rounded">VITE_GOOGLE_MAPS_PLATFORM_KEY</code> to restore the map.
            </p>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
