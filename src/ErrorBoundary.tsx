import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(error, info);
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="fatal" role="alert">
          <div className="fatal__body">
            <img className="brand__mark" src="/download.png" alt="" width={36} height={36} />
            <h2 className="fatal__title">The studio stopped unexpectedly</h2>
            <p className="fatal__message">{this.state.error.message}</p>
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                this.setState({ error: null });
                window.location.hash = '#/';
              }}
            >
              Back to the start
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
