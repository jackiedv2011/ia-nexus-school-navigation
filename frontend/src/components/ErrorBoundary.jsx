import { Component } from 'react';
import { School } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('UI crash caught by ErrorBoundary:', error, info);
  }

  handleReload = () => {
    this.setState({ hasError: false });
    window.location.assign('/');
  };

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          fontFamily: 'Inter, system-ui, sans-serif',
          background: 'var(--white)',
          color: 'var(--gray-900)',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{ display: 'flex', color: 'var(--red)' }}>
            <School size={48} strokeWidth={1.6} />
          </div>
          <h1 style={{ margin: 0, fontSize: '22px' }}>Something went wrong</h1>
          <p style={{ margin: 0, color: 'var(--gray-500)', maxWidth: '420px' }}>
            IA Nexus hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            onClick={this.handleReload}
            style={{
              marginTop: '8px',
              padding: '10px 20px',
              borderRadius: '8px',
              border: 'none',
              background: 'var(--red)',
              color: '#fff',
              fontSize: '15px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
