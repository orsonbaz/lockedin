'use client';

import React from 'react';
import { exportAll } from '@/lib/db/database';

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  exporting: boolean;
}

/**
 * Global error boundary — catches unhandled React errors and shows
 * a styled fallback with "Reload" + emergency "Export Data" buttons.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, exporting: false };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleExport = async () => {
    this.setState({ exporting: true });
    try {
      const data = await exportAll();
      const json = JSON.stringify(data, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = `lockedin-emergency-backup.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      alert('Export failed — your data is still safely stored in the browser.');
    } finally {
      this.setState({ exporting: false });
    }
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          backgroundColor: '#1A1A2E',
          color: '#E8E8F0',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: 400,
            width: '100%',
            backgroundColor: '#0F3460',
            borderRadius: 16,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
          <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
            Something went wrong
          </h2>
          <p style={{ fontSize: 14, color: '#9AA0B4', marginBottom: 24, lineHeight: 1.5 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </p>

          <button
            onClick={this.handleReload}
            style={{
              width: '100%',
              padding: '14px 0',
              borderRadius: 12,
              border: 'none',
              backgroundColor: '#E94560',
              color: '#fff',
              fontSize: 16,
              fontWeight: 700,
              cursor: 'pointer',
              marginBottom: 12,
            }}
          >
            Reload App
          </button>

          <button
            onClick={() => void this.handleExport()}
            disabled={this.state.exporting}
            style={{
              width: '100%',
              padding: '12px 0',
              borderRadius: 12,
              border: '1px solid #1E3A5F',
              backgroundColor: 'transparent',
              color: '#9AA0B4',
              fontSize: 14,
              cursor: 'pointer',
              opacity: this.state.exporting ? 0.5 : 1,
            }}
          >
            {this.state.exporting ? 'Exporting…' : 'Export Data (emergency backup)'}
          </button>
        </div>
      </div>
    );
  }
}
