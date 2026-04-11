import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo
    });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-xl shadow-lg max-w-2xl w-full border border-red-100">
            <div className="flex items-center gap-4 mb-6 text-red-600">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="h-8 w-8" />
              </div>
              <h1 className="text-2xl font-bold font-heading">Ops! Algo deu errado.</h1>
            </div>
            
            <p className="text-zinc-600 mb-6">
              Ocorreu um erro inesperado ao renderizar a interface. Nossa equipe já foi notificada.
            </p>

            <div className="bg-zinc-100 p-4 rounded-lg overflow-auto max-h-64 mb-6 text-sm font-mono text-zinc-800 border border-zinc-200">
              <strong>{this.state.error?.toString()}</strong>
              <br />
              {this.state.errorInfo?.componentStack}
            </div>

            <Button 
              onClick={() => window.location.reload()} 
              className="w-full bg-indigo-600 hover:bg-indigo-700 text-white"
            >
              <RefreshCcw className="mr-2 h-4 w-4" />
              Recarregar Página
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
